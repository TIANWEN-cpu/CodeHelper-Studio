#!/usr/bin/env python3
"""Offline, auditable maintenance for the CodeHelper knowledge database.

The command is intentionally split into five stages:

  audit -> dry-run -> backup -> apply -> verify

Only ``apply`` mutates the source database. It requires ``--yes``, a verified
application-compatible backup manifest, an unchanged plan/database fingerprint,
and a process guard proving that CodeHelper is closed.
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import html
import hashlib
import json
import os
import posixpath
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
import uuid
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence
from urllib.parse import quote, unquote, urldefrag, urlparse

try:
    import yaml
except ImportError as exc:  # pragma: no cover - exercised by deployment, not CI.
    raise SystemExit(
        "PyYAML is required for fail-closed frontmatter parsing. "
        "Run 'py -m pip install -r scripts/requirements-knowledge-maintenance.txt' "
        "before running knowledge maintenance."
    ) from exc


TOOL_VERSION = "1.2.0"
PLAN_SCHEMA_VERSION = 2
AUDIT_SCHEMA_VERSION = 2
RULES_SCHEMA_VERSION = 1
DATABASE_BACKUP_MANIFEST_VERSION = 2
DEFAULT_CHUNK_SIZE = 1500
MAX_MARKDOWN_DESTINATION_CHARS = 16 * 1024
PROCESS_LEASE_SUFFIX = ".process-lease.json"
PROCESS_LEASE_STALE_SECONDS = 5 * 60
APPLICATION_SCHEMA_VERSION = 2
LINK_AUDIT_STATUSES = {
    "reachable",
    "not_found",
    "temporary_error",
    "restricted",
    "malformed",
    "unresolved_relative",
    "unchecked",
}
REMOTE_STATUS_MAPPING = {
    "ok-2xx-3xx": "reachable",
    "confirmed-404-410": "not_found",
    "restricted-401-403": "restricted",
    "malformed-url": "malformed",
    "temporary-server-5xx": "temporary_error",
    "other-4xx": "temporary_error",
    "network-timeout": "temporary_error",
    "other-status": "temporary_error",
    "network-tls-error": "temporary_error",
    "unconfirmed-head-404-410": "temporary_error",
    "network-client-error": "temporary_error",
    "network-connect-error": "temporary_error",
    "rate-limited-429": "temporary_error",
    "redirect-error": "temporary_error",
}
SOURCE_FIELDS = (
    "source_repo",
    "source_url",
    "source_path",
    "source_commit",
    "import_target",
    "generated_at",
)
EVIDENCE_ARTIFACT_NAMES = (
    "candidate_inbound",
    "readonly_audit",
    "remote_status",
    "confirmed_404",
)
REQUIRED_DOC_COLUMNS = {
    "id",
    "filename",
    "file_type",
    "content",
    "chunk_count",
    "created_at",
}
REQUIRED_CHUNK_COLUMNS = {
    "id",
    "doc_id",
    "content",
    "embedding",
    "chunk_index",
    "created_at",
}
FTS_OBJECTS = {
    "knowledge_chunks_fts",
    "knowledge_chunks_trigram",
    "knowledge_chunks_fts_ai",
    "knowledge_chunks_fts_ad",
    "knowledge_chunks_fts_au",
    "knowledge_chunks_trigram_ai",
    "knowledge_chunks_trigram_ad",
    "knowledge_chunks_trigram_au",
}


class MaintenanceError(RuntimeError):
    """A fail-closed validation or maintenance failure."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}-{uuid.uuid4()}")
    payload = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with temporary.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def append_jsonl(path: Path, value: Mapping[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as exc:
        raise MaintenanceError(f"Unable to append maintenance journal {path}: {exc}") from exc


def load_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise MaintenanceError(f"Unable to read JSON {path}: {exc}") from exc


def default_database_path() -> Path:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise MaintenanceError("APPDATA is not set; pass --db explicitly")
    return Path(appdata) / "CodeHelper" / "codehelper.db"


def default_backup_directory(db_path: Path) -> Path:
    return db_path.parent / "backups"


def default_maintenance_directory(db_path: Path) -> Path:
    return default_backup_directory(db_path) / "maintenance"


def process_lease_path(db_path: Path) -> Path:
    return Path(str(db_path.resolve()) + PROCESS_LEASE_SUFFIX)


def process_is_alive(pid: int) -> bool:
    if pid <= 0 or pid > 0xFFFFFFFF:
        return False
    if os.name == "nt":
        # Python implements os.kill() with TerminateProcess on Windows, even for
        # signal 0. Querying the process handle avoids killing the lease owner.
        try:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            open_process = kernel32.OpenProcess
            open_process.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
            open_process.restype = ctypes.c_void_p
            get_exit_code = kernel32.GetExitCodeProcess
            get_exit_code.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
            get_exit_code.restype = ctypes.c_int
            close_handle = kernel32.CloseHandle
            close_handle.argtypes = [ctypes.c_void_p]
            close_handle.restype = ctypes.c_int

            handle = open_process(0x1000, 0, pid)
            if not handle:
                # Access denied means a process exists but cannot be queried.
                # Unknown errors also fail closed and preserve the lease.
                return ctypes.get_last_error() not in {87, 1168}
            try:
                exit_code = ctypes.c_ulong()
                if not get_exit_code(handle, ctypes.byref(exit_code)):
                    return True
                return exit_code.value == 259
            finally:
                close_handle(handle)
        except (AttributeError, OSError):
            return True
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _load_process_lease(path: Path) -> dict[str, Any]:
    marker = load_json(path)
    if (
        not isinstance(marker, dict)
        or not isinstance(marker.get("pid"), int)
        or marker.get("kind") not in {"app", "maintenance"}
        or not isinstance(marker.get("startedAt"), str)
        or not isinstance(marker.get("token"), str)
        or not marker["token"]
    ):
        raise MaintenanceError(f"Process lease marker is malformed: {path}")
    return marker


def _cleanup_stale_process_lease(
    path: Path,
    *,
    now: float,
    stale_after_seconds: float,
    pid_checker: Callable[[int], bool],
) -> bool:
    marker = _load_process_lease(path)
    if pid_checker(int(marker["pid"])):
        return False
    cleanup_path = path.with_name(path.name + ".cleanup")
    cleanup_fd: int | None = None
    for attempt in range(2):
        try:
            cleanup_fd = os.open(
                cleanup_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
            )
            break
        except FileExistsError:
            if attempt > 0:
                return False
            try:
                cleanup_age = now - cleanup_path.stat().st_mtime
            except FileNotFoundError:
                continue
            if (
                cleanup_age < 0
                or cleanup_age != cleanup_age
                or cleanup_age < stale_after_seconds
            ):
                return False
            try:
                cleanup_path.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                return False
    if cleanup_fd is None:
        return False
    try:
        os.close(cleanup_fd)
        current = _load_process_lease(path)
        if current["token"] != marker["token"] or pid_checker(int(current["pid"])):
            return False
        path.unlink()
        return True
    finally:
        try:
            cleanup_path.unlink()
        except FileNotFoundError:
            pass


@contextmanager
def acquire_process_lease(
    db_path: Path,
    kind: str,
    *,
    stale_after_seconds: float = PROCESS_LEASE_STALE_SECONDS,
    pid_checker: Callable[[int], bool] = process_is_alive,
) -> Iterable[dict[str, Any]]:
    if kind not in {"app", "maintenance"}:
        raise MaintenanceError(f"Unsupported process lease kind: {kind}")
    if stale_after_seconds < 0 or stale_after_seconds != stale_after_seconds:
        raise MaintenanceError("Process lease stale timeout must be non-negative")
    path = process_lease_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    marker = {
        "pid": os.getpid(),
        "kind": kind,
        "startedAt": utc_now(),
        "token": str(uuid.uuid4()),
    }
    encoded = (json.dumps(marker, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    descriptor: int | None = None
    for _ in range(2):
        try:
            descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(descriptor, encoded)
            os.fsync(descriptor)
            break
        except FileExistsError:
            if not _cleanup_stale_process_lease(
                path,
                now=time.time(),
                stale_after_seconds=stale_after_seconds,
                pid_checker=pid_checker,
            ):
                existing = _load_process_lease(path)
                raise MaintenanceError(
                    f"Process lease is already held by {existing['kind']} pid {existing['pid']}: {path}"
                )
    if descriptor is None:
        raise MaintenanceError(f"Unable to acquire process lease: {path}")
    try:
        yield {"path": str(path), **marker}
    finally:
        os.close(descriptor)
        try:
            current = _load_process_lease(path)
        except (MaintenanceError, FileNotFoundError):
            current = None
        if current is not None and current.get("token") == marker["token"]:
            path.unlink()


def repository_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_rules_path() -> Path:
    return Path(__file__).with_name("knowledge-maintenance-rules.json")


def default_import_batches_path() -> Path:
    configured = os.environ.get("CODEHELPER_IMPORT_BATCHES")
    if configured:
        return Path(configured)
    return Path(r"D:\coderhelperresource\import-batches")


def sqlite_uri(path: Path, mode: str) -> str:
    return f"{path.resolve().as_uri()}?mode={mode}"


def connect_readonly(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise MaintenanceError(f"Database does not exist: {path}")
    connection = sqlite3.connect(sqlite_uri(path, "ro"), uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def connect_writable(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise MaintenanceError(f"Database does not exist: {path}")
    connection = sqlite3.connect(sqlite_uri(path, "rw"), uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=5000")
    connection.execute("PRAGMA foreign_keys=ON")
    if connection.execute("PRAGMA foreign_keys").fetchone()[0] != 1:
        connection.close()
        raise MaintenanceError("Unable to enable SQLite foreign_keys")
    return connection


def table_exists(connection: sqlite3.Connection, name: str) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
        is not None
    )


def table_columns(connection: sqlite3.Connection, name: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f"PRAGMA table_info({name})")}


def execute_sql_script_transactionally(connection: sqlite3.Connection, script: str) -> None:
    statement = ""
    for line in script.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            if statement.strip():
                connection.execute(statement)
            statement = ""
    if statement.strip():
        raise MaintenanceError("Incomplete embedded SQLite schema statement")


def validate_core_schema(connection: sqlite3.Connection) -> None:
    for table, required in (
        ("knowledge_docs", REQUIRED_DOC_COLUMNS),
        ("knowledge_chunks", REQUIRED_CHUNK_COLUMNS),
    ):
        if not table_exists(connection, table):
            raise MaintenanceError(f"Required table is missing: {table}")
        missing = required - table_columns(connection, table)
        if missing:
            raise MaintenanceError(
                f"Table {table} is incompatible; missing columns: {sorted(missing)}"
            )


def quick_check(connection: sqlite3.Connection) -> list[str]:
    return [str(row[0]) for row in connection.execute("PRAGMA quick_check")]


def quick_check_ok(results: Sequence[str]) -> bool:
    return len(results) == 1 and results[0].strip().lower() == "ok"


def read_component_schema_versions(
    connection: sqlite3.Connection,
) -> dict[str, int]:
    if not table_exists(connection, "schema_migrations"):
        return {}
    versions: dict[str, int] = {}
    for row in connection.execute(
        "SELECT component, version FROM schema_migrations ORDER BY component"
    ):
        component = row[0]
        version = row[1]
        if isinstance(component, str) and isinstance(version, int) and version >= 0:
            versions[component] = version
    return versions


def split_into_chunks(text: str, max_len: int) -> list[str]:
    """Character-for-character port of electron/utils/textUtils.ts."""

    def utf16_length(value: str) -> int:
        return len(value.encode("utf-16-le", errors="surrogatepass")) // 2

    chunks: list[str] = []
    paragraphs = re.split(r"\n\n+", text)
    current = ""
    for paragraph in paragraphs:
        if utf16_length(current + "\n\n" + paragraph) > max_len and current:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = current + "\n\n" + paragraph if current else paragraph
    if current.strip():
        chunks.append(current.strip())
    return chunks if chunks else [""]


def normalize_body(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(line.rstrip() for line in normalized.split("\n"))
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def split_frontmatter(content: str) -> tuple[dict[str, Any], str, list[str], int, str]:
    lines = content.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\r\n") != "---":
        raise MaintenanceError("Document is missing YAML frontmatter")
    closing_index = -1
    for index in range(1, len(lines)):
        if lines[index].rstrip("\r\n") == "---":
            closing_index = index
            break
    if closing_index < 0:
        raise MaintenanceError("Document has unclosed YAML frontmatter")
    yaml_text = "".join(lines[1:closing_index])
    try:
        parsed = yaml.safe_load(yaml_text) or {}
    except yaml.YAMLError as exc:
        raise MaintenanceError(f"Invalid YAML frontmatter: {exc}") from exc
    if not isinstance(parsed, dict):
        raise MaintenanceError("YAML frontmatter must be an object")
    body = "".join(lines[closing_index + 1 :])
    newline = "\r\n" if lines[0].endswith("\r\n") else "\n"
    return parsed, body, lines, closing_index, newline


def metadata_sources(metadata: Mapping[str, Any]) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for field in SOURCE_FIELDS:
        value = metadata.get(field)
        result[field] = None if value is None else str(value)
    return result


def clean_scalar(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def title_from_filename(filename: str) -> str:
    value = re.sub(r"\.(?:md|markdown|txt|pdf)$", "", filename, flags=re.I)
    value = value.split("__")[-1]
    value = re.sub(r"^[a-f0-9]{8,}_?", "", value, flags=re.I)
    return re.sub(r"[-_]+", " ", value).strip() or filename


def normalized_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        tag = clean_scalar(item)
        if tag and tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result


def document_kind(file_type: Any) -> str:
    normalized = str(file_type or "").removeprefix(".").casefold()
    return {
        "md": "markdown",
        "markdown": "markdown",
        "txt": "text",
        "pdf": "pdf",
    }.get(normalized, "document")


def build_metadata_record(
    row: Mapping[str, Any],
    metadata: Mapping[str, Any],
    assignment: Mapping[str, str],
) -> dict[str, Any]:
    filename = str(row["filename"])
    content = str(row.get("content") or "")
    return {
        "doc_id": int(row["id"]),
        "filename": filename,
        "display_title": clean_scalar(metadata.get("display_title"))
        or clean_scalar(metadata.get("title"))
        or title_from_filename(filename),
        "source_repo": clean_scalar(metadata.get("source_repo"))
        or clean_scalar(metadata.get("repository")),
        "source_url": clean_scalar(metadata.get("source_url")),
        "source_path": clean_scalar(metadata.get("source_path")),
        "source_commit": clean_scalar(metadata.get("source_commit")),
        "category_key": str(assignment["category_key"]),
        "category_label": str(assignment["category_label"]),
        "tags": normalized_tags(metadata.get("tags")),
        "import_target": clean_scalar(metadata.get("import_target")),
        "generated_at": clean_scalar(metadata.get("generated_at")),
        "document_kind": clean_scalar(metadata.get("document_kind"))
        or document_kind(row.get("file_type")),
        "visibility": clean_scalar(metadata.get("visibility")) or "local",
        "content_sha256": sha256_text(content),
    }


def update_frontmatter_scalars(content: str, changes: Mapping[str, str]) -> str:
    before, body, lines, closing_index, newline = split_frontmatter(content)
    before_sources = metadata_sources(before)
    if set(changes) - {"category", "category_dir"}:
        raise MaintenanceError("Only category and category_dir may be updated")

    for key, value in changes.items():
        matches = [
            index
            for index in range(1, closing_index)
            if re.match(rf"^{re.escape(key)}\s*:", lines[index])
        ]
        if len(matches) > 1:
            raise MaintenanceError(f"Frontmatter key appears more than once: {key}")
        encoded = json.dumps(str(value), ensure_ascii=False)
        replacement = f"{key}: {encoded}{newline}"
        if matches:
            lines[matches[0]] = replacement
        else:
            lines.insert(closing_index, replacement)
            closing_index += 1

    updated = "".join(lines)
    after, after_body, _, _, _ = split_frontmatter(updated)
    if after_body != body:
        raise MaintenanceError("Frontmatter update changed document body")
    if metadata_sources(after) != before_sources:
        raise MaintenanceError("Frontmatter update changed source tracking fields")
    for key, value in changes.items():
        if str(after.get(key)) != str(value):
            raise MaintenanceError(f"Frontmatter update did not set {key}")
    if "\r" not in content and "\r" in updated:
        raise MaintenanceError("Frontmatter update changed LF line endings")
    return updated


def normalize_repo(metadata: Mapping[str, Any]) -> str | None:
    for field in ("source_repo", "source_url"):
        raw = metadata.get(field)
        if raw is None:
            continue
        value = str(raw).strip().rstrip("/")
        github = re.match(
            r"^https?://(?:www\.)?github\.com/([^/]+/[^/]+)$", value, re.I
        )
        if github:
            return github.group(1).removesuffix(".git").casefold()
        if re.match(r"^[^/\s]+/[^/\s]+$", value):
            return value.removesuffix(".git").casefold()
    return None


def normalize_source_path(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().replace("\\", "/")
    normalized = posixpath.normpath(normalized).lstrip("/")
    return None if normalized in {"", "."} else normalized


def source_identity(metadata: Mapping[str, Any]) -> tuple[str, str, str] | None:
    repo = normalize_repo(metadata)
    path = normalize_source_path(metadata.get("source_path"))
    commit = metadata.get("source_commit")
    if not repo or not path or commit is None or not str(commit).strip():
        return None
    return repo, path, str(commit).strip().casefold()


def extract_link_targets(markdown: str) -> list[str]:
    return [
        str(occurrence["raw_target"])
        for occurrence in extract_link_occurrences(markdown)
    ]


def relative_target_candidates(source_path: str, raw_target: str) -> list[str]:
    target = unquote(raw_target.strip())
    if not target or target.startswith("#") or target.startswith("//"):
        return []
    try:
        parsed = urlparse(target)
    except ValueError:
        return []
    if parsed.scheme or parsed.netloc:
        return []
    path = parsed.path.replace("\\", "/")
    if not path:
        return []
    if path.startswith("/"):
        resolved = posixpath.normpath(path.lstrip("/"))
    else:
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source_path), path))
    if resolved == ".." or resolved.startswith("../"):
        return []
    candidates = [resolved]
    suffix = posixpath.splitext(resolved)[1].casefold()
    if not suffix:
        candidates.extend(
            [f"{resolved}.md", f"{resolved}/README.md", f"{resolved}/index.md"]
        )
    elif suffix in {".html", ".htm"}:
        candidates.append(posixpath.splitext(resolved)[0] + ".md")
    return list(dict.fromkeys(candidates))


def github_target_identity(raw_target: str) -> tuple[str, str] | None:
    try:
        parsed = urlparse(html.unescape(raw_target.strip()))
    except ValueError:
        return None
    host = (parsed.hostname or "").casefold()
    segments = [unquote(segment) for segment in parsed.path.split("/") if segment]
    if host in {"github.com", "www.github.com"}:
        if len(segments) < 5 or segments[2].casefold() not in {"blob", "raw"}:
            return None
        repo = f"{segments[0]}/{segments[1]}".casefold()
        source_path = normalize_source_path("/".join(segments[4:]))
    elif host == "raw.githubusercontent.com":
        if len(segments) < 4:
            return None
        repo = f"{segments[0]}/{segments[1]}".casefold()
        source_path = normalize_source_path("/".join(segments[3:]))
    else:
        return None
    return (repo, source_path) if source_path else None


def read_rules(path: Path) -> dict[str, Any]:
    rules = load_json(path)
    if not isinstance(rules, dict) or rules.get("schema_version") != RULES_SCHEMA_VERSION:
        raise MaintenanceError(f"Unsupported rules schema in {path}")
    chunk_size = rules.get("chunk_size")
    if not isinstance(chunk_size, int) or chunk_size <= 0:
        raise MaintenanceError("rules.chunk_size must be a positive integer")
    categories = rules.get("batch_categories")
    if not isinstance(categories, dict) or not categories:
        raise MaintenanceError("rules.batch_categories must be a non-empty object")
    required_count = rules.get("required_batch_count")
    if required_count is not None and len(categories) != required_count:
        raise MaintenanceError(
            f"Expected {required_count} batch categories, found {len(categories)}"
        )
    for batch_id, category in categories.items():
        if not isinstance(batch_id, str) or not isinstance(category, dict):
            raise MaintenanceError("Invalid batch category rule")
        if not all(
            isinstance(category.get(field), str) and category[field].strip()
            for field in ("category_key", "category_label")
        ):
            raise MaintenanceError(f"Invalid category mapping for {batch_id}")
    raw_manual = rules.get("manual_delete", [])
    if not isinstance(raw_manual, list):
        raise MaintenanceError("rules.manual_delete must be an array")
    manual = [dict(item) if isinstance(item, dict) else item for item in raw_manual]
    groups = rules.get("manual_delete_groups", [])
    if not isinstance(groups, list):
        raise MaintenanceError("rules.manual_delete_groups must be an array")
    for group in groups:
        if (
            not isinstance(group, dict)
            or not isinstance(group.get("reason_code"), str)
            or not group["reason_code"].strip()
            or not isinstance(group.get("reason"), str)
            or not group["reason"].strip()
            or not isinstance(group.get("evidence_set"), str)
            or not group["evidence_set"].strip()
            or not isinstance(group.get("ids"), list)
            or not group["ids"]
        ):
            raise MaintenanceError(
                "Each manual_delete_groups item requires reason_code, reason, evidence_set, and ids"
            )
        for doc_id in group["ids"]:
            manual.append(
                {
                    "id": doc_id,
                    "reason_code": group["reason_code"],
                    "reason": group["reason"],
                    "evidence_set": group["evidence_set"],
                }
            )
    seen_manual: set[int] = set()
    for item in manual:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("id"), int)
            or item["id"] <= 0
            or not isinstance(item.get("reason"), str)
            or not item["reason"].strip()
        ):
            raise MaintenanceError("Each manual_delete item requires positive id and reason")
        reason_code = item.get("reason_code", "manual-reviewed-delete")
        if not isinstance(reason_code, str) or not reason_code.strip():
            raise MaintenanceError("Each manual_delete item requires a valid reason_code")
        item["reason_code"] = reason_code.strip()
        evidence_set = item.get("evidence_set")
        if not isinstance(evidence_set, str) or not evidence_set.strip():
            raise MaintenanceError("Each manual_delete item requires an evidence_set")
        item["evidence_set"] = evidence_set.strip()
        if item["id"] in seen_manual:
            raise MaintenanceError(f"Duplicate manual_delete id: {item['id']}")
        seen_manual.add(item["id"])
    rules = dict(rules)
    rules["manual_delete"] = manual
    review = rules.get("manual_review")
    expected_fields = ["id", "filename", "content_sha256", "source_repo", "source_path", "source_commit"]
    if manual and (
        not isinstance(review, dict)
        or review.get("selected_count") != len(manual)
        or review.get("expected_fields") != expected_fields
        or not isinstance(review.get("expected_documents_sha256"), str)
        or len(review["expected_documents_sha256"]) != 64
    ):
        raise MaintenanceError("manual_review evidence contract is missing or incompatible")
    artifacts = rules.get("evidence_artifacts")
    if not isinstance(artifacts, dict) or set(artifacts) != set(EVIDENCE_ARTIFACT_NAMES):
        raise MaintenanceError(
            "rules.evidence_artifacts must bind candidate, readonly, remote, and confirmed-404 evidence"
        )
    for name in EVIDENCE_ARTIFACT_NAMES:
        descriptor = artifacts[name]
        if (
            not isinstance(descriptor, dict)
            or not isinstance(descriptor.get("source"), str)
            or not descriptor["source"].strip()
            or not isinstance(descriptor.get("sha256"), str)
            or not re.fullmatch(r"[0-9a-fA-F]{64}", descriptor["sha256"])
        ):
            raise MaintenanceError(f"Invalid evidence artifact descriptor: {name}")
        descriptor["source"] = descriptor["source"].strip()
        descriptor["sha256"] = descriptor["sha256"].casefold()
    if manual:
        candidate = artifacts["candidate_inbound"]
        if (
            review.get("source") != candidate["source"]
            or str(review.get("source_sha256") or "").casefold() != candidate["sha256"]
        ):
            raise MaintenanceError("manual_review must bind the candidate-inbound artifact")
    duplicate_evidence_set = rules.get("duplicate_evidence_set")
    if not isinstance(duplicate_evidence_set, str) or not duplicate_evidence_set.strip():
        raise MaintenanceError("rules.duplicate_evidence_set is required")
    rules["duplicate_evidence_set"] = duplicate_evidence_set.strip()
    return rules


def build_import_batch_map(
    import_batches: Path, rules: Mapping[str, Any]
) -> tuple[dict[str, dict[str, str]], dict[str, Any]]:
    assignments: dict[str, dict[str, str]] = {}
    duplicate_filenames: dict[str, list[str]] = defaultdict(list)
    counts: dict[str, int] = {}
    for batch_id, category_rule in rules["batch_categories"].items():
        knowledge_dir = import_batches / batch_id / "knowledge-docs"
        if not knowledge_dir.is_dir():
            raise MaintenanceError(f"Import batch knowledge-docs directory missing: {knowledge_dir}")
        files = sorted(knowledge_dir.rglob("*.md"))
        counts[batch_id] = len(files)
        for path in files:
            filename = path.relative_to(knowledge_dir).as_posix()
            if filename in assignments:
                duplicate_filenames[filename].extend(
                    [assignments[filename]["batch_id"], batch_id]
                )
                continue
            assignments[filename] = {
                "batch_id": batch_id,
                "category_key": str(category_rule["category_key"]),
                "category_label": str(category_rule["category_label"]),
            }
    if duplicate_filenames:
        preview = sorted(duplicate_filenames)[:10]
        raise MaintenanceError(f"Import batches contain duplicate filenames: {preview}")
    digest = sha256_bytes(canonical_json_bytes(assignments))
    return assignments, {
        "root": str(import_batches.resolve()),
        "batch_counts": counts,
        "filename_count": len(assignments),
        "mapping_sha256": digest,
    }


METADATA_STORAGE_FIELDS = (
    "doc_id",
    "display_title",
    "source_repo",
    "source_url",
    "source_path",
    "source_commit",
    "category_key",
    "category_label",
    "tags_json",
    "import_target",
    "generated_at",
    "document_kind",
    "visibility",
    "content_sha256",
)
LINK_STORAGE_FIELDS = (
    "doc_id",
    "line_number",
    "raw_target",
    "resolved_target",
    "link_kind",
    "status",
    "http_status",
    "checked_at",
    "detail",
)


def metadata_storage_row(record: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "doc_id": int(record["doc_id"]),
        "display_title": str(record["display_title"]),
        "source_repo": record.get("source_repo"),
        "source_url": record.get("source_url"),
        "source_path": record.get("source_path"),
        "source_commit": record.get("source_commit"),
        "category_key": record.get("category_key"),
        "category_label": record.get("category_label"),
        "tags_json": json.dumps(
            record.get("tags", []), ensure_ascii=False, separators=(",", ":")
        ),
        "import_target": record.get("import_target"),
        "generated_at": record.get("generated_at"),
        "document_kind": str(record["document_kind"]),
        "visibility": str(record["visibility"]),
        "content_sha256": str(record["content_sha256"]),
    }


def rows_fingerprint(
    label: str, rows: Sequence[Mapping[str, Any]], fields: Sequence[str]
) -> str:
    digest = hashlib.sha256()
    digest.update(f"codehelper-{label}-v1\n".encode("utf-8"))
    normalized = [{field: row.get(field) for field in fields} for row in rows]
    for row in sorted(normalized, key=lambda item: canonical_json_bytes(item)):
        digest.update(canonical_json_bytes(row))
        digest.update(b"\n")
    return digest.hexdigest()


def metadata_fingerprint(records: Sequence[Mapping[str, Any]]) -> str:
    return rows_fingerprint(
        "knowledge-metadata",
        [metadata_storage_row(record) for record in records],
        METADATA_STORAGE_FIELDS,
    )


def link_audit_fingerprint(records: Sequence[Mapping[str, Any]]) -> str:
    return rows_fingerprint("knowledge-link-audit", records, LINK_STORAGE_FIELDS)


def read_maintenance_state_from_connection(
    connection: sqlite3.Connection,
) -> dict[str, Any]:
    table_names = (
        "knowledge_doc_metadata",
        "knowledge_link_audit",
        "knowledge_maintenance_runs",
        "knowledge_maintenance_actions",
    )
    tables = {name: table_exists(connection, name) for name in table_names}
    metadata_rows: list[dict[str, Any]] = []
    if tables["knowledge_doc_metadata"]:
        metadata_rows = [
            dict(row)
            for row in connection.execute(
                "SELECT " + ",".join(METADATA_STORAGE_FIELDS)
                + " FROM knowledge_doc_metadata ORDER BY doc_id"
            )
        ]
    link_rows: list[dict[str, Any]] = []
    if tables["knowledge_link_audit"]:
        link_rows = [
            dict(row)
            for row in connection.execute(
                "SELECT " + ",".join(LINK_STORAGE_FIELDS)
                + " FROM knowledge_link_audit "
                "ORDER BY doc_id, line_number, raw_target"
            )
        ]
    run_rows = (
        int(connection.execute("SELECT COUNT(*) FROM knowledge_maintenance_runs").fetchone()[0])
        if tables["knowledge_maintenance_runs"]
        else 0
    )
    action_rows = (
        int(
            connection.execute(
                "SELECT COUNT(*) FROM knowledge_maintenance_actions"
            ).fetchone()[0]
        )
        if tables["knowledge_maintenance_actions"]
        else 0
    )
    return {
        "tables": tables,
        "metadata_rows": len(metadata_rows),
        "metadata_fingerprint": rows_fingerprint(
            "knowledge-metadata", metadata_rows, METADATA_STORAGE_FIELDS
        ),
        "link_audit_rows": len(link_rows),
        "link_audit_fingerprint": link_audit_fingerprint(link_rows),
        "maintenance_run_rows": run_rows,
        "maintenance_action_rows": action_rows,
    }


def live_maintenance_state(db_path: Path) -> dict[str, Any]:
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        state = read_maintenance_state_from_connection(connection)
        connection.execute("ROLLBACK")
        return state
    finally:
        connection.close()


def assert_maintenance_state_matches(actual: Mapping[str, Any], expected: Mapping[str, Any]) -> None:
    for field in (
        "metadata_rows", "metadata_fingerprint", "link_audit_rows",
        "link_audit_fingerprint", "maintenance_run_rows", "maintenance_action_rows",
    ):
        if actual[field] != expected[field]:
            raise MaintenanceError(f"Maintenance state changed after dry-run: {field}")


def load_remote_status_report(
    path: Path,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    report = load_json(path)
    if not isinstance(report, dict) or not isinstance(report.get("results"), list):
        raise MaintenanceError("Remote status report must contain a results array")
    generated_at = clean_scalar(report.get("generated_at"))
    if not generated_at:
        raise MaintenanceError("Remote status report is missing generated_at")
    by_url: dict[str, dict[str, Any]] = {}
    for item in report["results"]:
        if not isinstance(item, dict):
            raise MaintenanceError("Remote status result must be an object")
        url = clean_scalar(item.get("url"))
        category = clean_scalar(item.get("category"))
        if not url or not category:
            raise MaintenanceError("Remote status result is missing url/category")
        if category not in REMOTE_STATUS_MAPPING:
            raise MaintenanceError(f"Unsupported remote status category: {category}")
        if url in by_url:
            raise MaintenanceError(f"Remote status report contains duplicate URL: {url}")
        by_url[url] = item
    total_unique = report.get("total_unique")
    if not isinstance(total_unique, int) or total_unique != len(by_url):
        raise MaintenanceError("Remote status total_unique does not match results")
    return report, by_url


def strip_code_for_link_scan(markdown: str) -> str:
    normalized = markdown.replace("\r\n", "\n").replace("\r", "\n")

    def preserve_lines(match: re.Match[str]) -> str:
        return "\n" * match.group(0).count("\n")

    without_blocks = re.sub(
        r"(?ms)^(?P<fence>`{3,}|~{3,})[^\n]*\n.*?^(?P=fence)\s*$",
        preserve_lines,
        normalized,
    )
    return re.sub(r"`[^`\n]*`", lambda match: " " * len(match.group(0)), without_blocks)


def markdown_destination(raw: str) -> str:
    value = raw.strip()
    if value.startswith("<") and ">" in value:
        return value[1 : value.index(">")].strip()
    titled = re.match(r"^(\S+?)(?:\s+[\"'].*[\"'])?$", value)
    return (titled.group(1) if titled else value).strip()


def scan_inline_markdown_links(
    line: str,
) -> Iterable[tuple[int, int, str, str, str]]:
    """Yield balanced inline Markdown links as start/end/syntax/label/destination."""
    cursor = 0
    opener = re.compile(r"(!?)\[([^\]\r\n]*)\]\(")
    while cursor < len(line):
        match = opener.search(line, cursor)
        if match is None:
            return
        position = match.end()
        limit = min(len(line), position + MAX_MARKDOWN_DESTINATION_CHARS)
        depth = 1
        escaped = False
        while position < limit:
            char = line[position]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    yield (
                        match.start(),
                        position + 1,
                        "markdown-image" if match.group(1) else "markdown-link",
                        match.group(2),
                        line[match.end() : position],
                    )
                    cursor = position + 1
                    break
            position += 1
        else:
            cursor = limit


def inline_markdown_destinations(line: str) -> Iterable[tuple[str, str]]:
    for _, _, syntax, _, destination in scan_inline_markdown_links(line):
        yield syntax, destination


def strip_inline_markdown_links(value: str) -> str:
    result: list[str] = []
    cursor = 0
    for start, end, _, label, _ in scan_inline_markdown_links(value):
        result.append(value[cursor:start])
        result.append(label)
        cursor = end
    result.append(value[cursor:])
    return "".join(result)


def extract_link_occurrences(
    markdown: str, line_offset: int = 0
) -> list[dict[str, Any]]:
    scrubbed = strip_code_for_link_scan(markdown)
    definitions: dict[str, str] = {}
    for line in scrubbed.split("\n"):
        match = re.match(r"^\s*\[([^\]\r\n]+)\]:\s*(?:<([^>]+)>|(\S+))", line)
        if match:
            definitions[match.group(1).strip().casefold()] = match.group(2) or match.group(3)

    occurrences: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()

    def add(line_number: int, target: str, syntax: str) -> None:
        raw_target = target.strip()
        if not raw_target:
            return
        key = (line_number, raw_target)
        if key in seen:
            return
        seen.add(key)
        occurrences.append(
            {"line_number": line_number + line_offset, "raw_target": raw_target, "syntax": syntax}
        )

    for index, line in enumerate(scrubbed.split("\n"), start=1):
        if re.match(r"^\s*\[[^\]\r\n]+\]:", line):
            continue
        for syntax, raw_destination in inline_markdown_destinations(line):
            add(index, markdown_destination(raw_destination), syntax)
        for match in re.finditer(r"(!?)\[([^\]\r\n]+)\]\[([^\]\r\n]*)\]", line):
            reference = (match.group(3) or match.group(2)).strip().casefold()
            if reference in definitions:
                add(index, definitions[reference], "markdown-image" if match.group(1) else "markdown-link")
        for match in re.finditer(
            r"<(?:a|img)\b[^>]+?(?:href|src)=[\"']([^\"']+)", line, re.I
        ):
            add(index, html.unescape(match.group(1)), "html-media")
        for match in re.finditer(r"<(https?://[^\s<>]+|mailto:[^\s<>]+)>", line, re.I):
            add(index, html.unescape(match.group(1)), "autolink")
    return occurrences


def heading_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower()
    kept = "".join(
        char
        for char in normalized
        if char.isspace()
        or char == "-"
        or unicodedata.category(char)[0] in {"L", "N", "M"}
    )
    kept = re.sub(r"\s+", "-", kept.strip())
    kept = re.sub(r"-+", "-", kept).strip("-")
    return kept or "section"


def document_heading_ids(markdown: str) -> set[str]:
    scrubbed = strip_code_for_link_scan(markdown)
    result: set[str] = set()
    next_suffix: Counter[str] = Counter()
    for line in scrubbed.split("\n"):
        match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if not match:
            continue
        text = strip_inline_markdown_links(match.group(2))
        text = re.sub(r"[`*_~]", "", text)
        text = re.sub(r"<[^>]*>", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        base = heading_slug(text)
        candidate = base
        while candidate in result:
            next_suffix[base] += 1
            candidate = f"{base}-{next_suffix[base]}"
        result.add(candidate)
    return result


def fragment_matches_heading(raw_fragment: str, headings: set[str]) -> bool:
    decoded = unquote(raw_fragment).strip()
    if not decoded:
        return True
    return decoded in headings or heading_slug(decoded) in headings


def has_control_character(value: str) -> bool:
    return any(ord(char) <= 0x1F or ord(char) == 0x7F for char in value)


def remote_link_values(
    lookup_url: str,
    raw_target: str,
    remote_by_url: Mapping[str, Mapping[str, Any]],
    remote_checked_at: str,
) -> dict[str, Any]:
    item = remote_by_url.get(lookup_url)
    if item is None:
        return {
            "raw_target": raw_target,
            "resolved_target": lookup_url,
            "link_kind": "external",
            "status": "unchecked",
            "http_status": None,
            "checked_at": None,
            "detail": "URL was not present in the offline remote-status inventory",
        }
    category = str(item["category"])
    status = REMOTE_STATUS_MAPPING[category]
    http_status = item.get("get_status")
    if not isinstance(http_status, int):
        http_status = item.get("head_status")
    if (
        not isinstance(http_status, int)
        or isinstance(http_status, bool)
        or not 100 <= http_status <= 599
    ):
        http_status = None
    detail = {
        "remote_category": category,
        "error": item.get("error"),
        "detail": item.get("detail"),
    }
    return {
        "raw_target": raw_target,
        "resolved_target": clean_scalar(item.get("final_url")) or lookup_url,
        "link_kind": "external",
        "status": status,
        "http_status": http_status,
        "checked_at": remote_checked_at,
        "detail": json.dumps(detail, ensure_ascii=False, sort_keys=True),
    }


def github_blob_url(metadata: Mapping[str, Any], path: str, suffix: str = "") -> str | None:
    repo = normalize_repo(metadata)
    if not repo:
        return None
    ref = clean_scalar(metadata.get("source_commit")) or "HEAD"
    encoded_repo = "/".join(quote(segment, safe="") for segment in repo.split("/"))
    encoded_ref = "/".join(quote(segment, safe="") for segment in ref.split("/"))
    encoded_path = "/".join(quote(segment, safe="") for segment in path.split("/") if segment)
    return f"https://github.com/{encoded_repo}/blob/{encoded_ref}/{encoded_path}{suffix}"


def resolve_link_audit_record(
    occurrence: Mapping[str, Any],
    metadata: Mapping[str, Any],
    source_index: Mapping[tuple[str, str], list[int]],
    heading_ids: Mapping[int, set[str]],
    remote_by_url: Mapping[str, Mapping[str, Any]],
    remote_checked_at: str,
) -> dict[str, Any]:
    raw_target = str(occurrence["raw_target"]).strip()
    base = {
        "line_number": int(occurrence["line_number"]),
        "raw_target": raw_target,
    }
    if not raw_target or has_control_character(raw_target):
        return {
            **base,
            "resolved_target": None,
            "link_kind": "blocked",
            "status": "malformed",
            "http_status": None,
            "checked_at": None,
            "detail": "Link target is empty or contains control characters",
        }
    lookup_target = html.unescape(raw_target)
    try:
        parsed = urlparse(lookup_target)
    except ValueError as exc:
        return {
            **base,
            "resolved_target": None,
            "link_kind": "blocked",
            "status": "malformed",
            "http_status": None,
            "checked_at": None,
            "detail": f"Malformed URL: {exc}",
        }
    scheme = parsed.scheme.casefold()
    if scheme in {"http", "https"}:
        lookup_url, fragment = urldefrag(lookup_target)
        values = remote_link_values(lookup_url, raw_target, remote_by_url, remote_checked_at)
        if fragment and values.get("resolved_target"):
            values["resolved_target"] = urldefrag(str(values["resolved_target"])).url + f"#{fragment}"
        return {
            **base,
            **values,
        }
    if lookup_target.startswith("//"):
        absolute = "https:" + lookup_target
        lookup_url, fragment = urldefrag(absolute)
        values = remote_link_values(lookup_url, raw_target, remote_by_url, remote_checked_at)
        if fragment and values.get("resolved_target"):
            values["resolved_target"] = urldefrag(str(values["resolved_target"])).url + f"#{fragment}"
        return {
            **base,
            **values,
        }
    if scheme == "mailto":
        return {
            **base,
            "resolved_target": lookup_target,
            "link_kind": "special",
            "status": "unchecked",
            "http_status": None,
            "checked_at": None,
            "detail": "mailto links are not probed by offline maintenance",
        }
    if scheme:
        return {
            **base,
            "resolved_target": None,
            "link_kind": "blocked",
            "status": "malformed",
            "http_status": None,
            "checked_at": None,
            "detail": f"Unsupported URL scheme: {scheme}",
        }

    doc_id = int(metadata["doc_id"])
    fragment = parsed.fragment.strip()
    if not parsed.path:
        valid = fragment_matches_heading(fragment, heading_ids.get(doc_id, set()))
        return {
            **base,
            "resolved_target": lookup_target,
            "link_kind": "same-document",
            "status": "reachable" if valid else "unresolved_relative",
            "http_status": None,
            "checked_at": None,
            "detail": None if valid else "Same-document heading was not found",
        }

    source_path = normalize_source_path(metadata.get("source_path"))
    repo = normalize_repo(metadata)
    if not source_path or not repo:
        return {
            **base,
            "resolved_target": None,
            "link_kind": "relative",
            "status": "unresolved_relative",
            "http_status": None,
            "checked_at": None,
            "detail": "Source repository/path is unavailable",
        }
    candidates = relative_target_candidates(source_path, lookup_target)
    if not candidates:
        return {
            **base,
            "resolved_target": None,
            "link_kind": "relative",
            "status": "unresolved_relative",
            "http_status": None,
            "checked_at": None,
            "detail": "Relative path is invalid or escapes the repository root",
        }
    for candidate in candidates:
        target_ids = source_index.get((repo, candidate), [])
        if len(target_ids) != 1:
            continue
        target_id = target_ids[0]
        valid_fragment = fragment_matches_heading(fragment, heading_ids.get(target_id, set()))
        return {
            **base,
            "resolved_target": f"knowledge://document/{target_id}"
            + (f"#{parsed.fragment}" if parsed.fragment else ""),
            "link_kind": "corpus-document",
            "status": "reachable" if valid_fragment else "unresolved_relative",
            "http_status": None,
            "checked_at": None,
            "detail": None if valid_fragment else "Target document heading was not found",
        }
    target_path = candidates[0]
    suffix = (f"?{parsed.query}" if parsed.query else "") + (
        f"#{parsed.fragment}" if parsed.fragment else ""
    )
    traceable = github_blob_url(metadata, target_path, suffix)
    return {
        **base,
        "resolved_target": traceable or target_path + suffix,
        "link_kind": "relative",
        "status": "unchecked" if traceable else "unresolved_relative",
        "http_status": None,
        "checked_at": None,
        "detail": (
            "Resolved to a traceable upstream path; availability was not probed"
            if traceable
            else "Relative target is not present in the imported corpus"
        ),
    }


def build_link_audit_records(
    documents: Sequence[Mapping[str, Any]],
    metadata_records: Sequence[Mapping[str, Any]],
    remote_by_url: Mapping[str, Mapping[str, Any]],
    remote_checked_at: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    metadata_by_id = {int(record["doc_id"]): record for record in metadata_records}
    source_index: dict[tuple[str, str], list[int]] = defaultdict(list)
    heading_ids: dict[int, set[str]] = {}
    bodies: dict[int, tuple[str, int]] = {}
    for document in documents:
        doc_id = int(document["id"])
        _, body, _, closing_index, _ = split_frontmatter(str(document.get("content") or ""))
        bodies[doc_id] = (body, closing_index + 1)
        heading_ids[doc_id] = document_heading_ids(body)
        metadata = metadata_by_id[doc_id]
        repo = normalize_repo(metadata)
        source_path = normalize_source_path(metadata.get("source_path"))
        if repo and source_path:
            source_index[(repo, source_path)].append(doc_id)

    records: list[dict[str, Any]] = []
    for document in documents:
        doc_id = int(document["id"])
        body, line_offset = bodies[doc_id]
        metadata = metadata_by_id[doc_id]
        for occurrence in extract_link_occurrences(body, line_offset=line_offset):
            record = resolve_link_audit_record(
                occurrence,
                metadata,
                source_index,
                heading_ids,
                remote_by_url,
                remote_checked_at,
            )
            status = str(record["status"])
            if status not in LINK_AUDIT_STATUSES:
                raise MaintenanceError(f"Unsupported normalized link status: {status}")
            http_status = record.get("http_status")
            if http_status is not None and (
                not isinstance(http_status, int)
                or isinstance(http_status, bool)
                or not 100 <= http_status <= 599
            ):
                raise MaintenanceError(
                    f"Invalid normalized HTTP status for document {doc_id}: {http_status}"
                )
            records.append({"doc_id": doc_id, **record})
    records.sort(key=lambda item: (int(item["doc_id"]), int(item["line_number"]), str(item["raw_target"])))
    summary = {
        "rows": len(records),
        "status_counts": dict(Counter(str(record["status"]) for record in records)),
        "kind_counts": dict(Counter(str(record["link_kind"]) for record in records)),
        "fingerprint": link_audit_fingerprint(records),
    }
    return records, summary


def logical_fingerprint(
    documents: Sequence[Mapping[str, Any]], chunks: Sequence[Mapping[str, Any]]
) -> str:
    digest = hashlib.sha256()
    digest.update(b"codehelper-knowledge-logical-v1\n")
    for row in sorted(documents, key=lambda item: int(item["id"])):
        digest.update(
            canonical_json_bytes(
                {
                    "kind": "doc",
                    "id": int(row["id"]),
                    "filename": str(row["filename"]),
                    "file_type": None
                    if row.get("file_type") is None
                    else str(row.get("file_type")),
                    "content_sha256": sha256_text(str(row.get("content") or "")),
                    "chunk_count": int(row.get("chunk_count") or 0),
                }
            )
        )
        digest.update(b"\n")
    for row in sorted(
        chunks,
        key=lambda item: (
            int(item["doc_id"]),
            int(item.get("chunk_index") or 0),
            str(item.get("content") or ""),
        ),
    ):
        digest.update(
            canonical_json_bytes(
                {
                    "kind": "chunk",
                    "doc_id": int(row["doc_id"]),
                    "chunk_index": int(row.get("chunk_index") or 0),
                    "content_sha256": sha256_text(str(row.get("content") or "")),
                    "embedding_sha256": None
                    if row.get("embedding") is None
                    else sha256_text(str(row.get("embedding"))),
                }
            )
        )
        digest.update(b"\n")
    return digest.hexdigest()


def read_knowledge_snapshot(
    connection: sqlite3.Connection,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    validate_core_schema(connection)
    documents = [
        dict(row)
        for row in connection.execute(
            "SELECT id, filename, file_type, content, chunk_count, created_at "
            "FROM knowledge_docs ORDER BY id"
        )
    ]
    chunks = [
        dict(row)
        for row in connection.execute(
            "SELECT id, doc_id, content, embedding, chunk_index, created_at "
            "FROM knowledge_chunks ORDER BY doc_id, chunk_index, id"
        )
    ]
    return documents, chunks


def metadata_completeness(metadata: Mapping[str, Any]) -> int:
    fields = ("title", "category", "category_dir", *SOURCE_FIELDS)
    return sum(1 for field in fields if metadata.get(field) not in (None, "", []))


def choose_duplicate_keep(members: Sequence[Mapping[str, Any]]) -> int:
    def rank(member: Mapping[str, Any]) -> tuple[int, int, int, int]:
        filename = str(member["filename"]).casefold()
        category_dir = str(member["metadata"].get("category_dir") or "").casefold()
        recovered = int("recovered" in filename or "recovered" in category_dir)
        title = str(member["metadata"].get("title") or "")
        title_penalty = int(not title or title.casefold() in {"readme", "index", "document"})
        return (
            recovered,
            -metadata_completeness(member["metadata"]),
            title_penalty,
            int(member["id"]),
        )

    return int(min(members, key=rank)["id"])


def analyze_documents(
    documents: Sequence[Mapping[str, Any]],
    chunks: Sequence[Mapping[str, Any]],
    assignments: Mapping[str, Mapping[str, str]],
    chunk_size: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    chunks_by_doc: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for chunk in chunks:
        chunks_by_doc[int(chunk["doc_id"])].append(dict(chunk))

    analyzed: list[dict[str, Any]] = []
    parse_errors: list[dict[str, Any]] = []
    source_path_index: dict[tuple[str, str], list[int]] = defaultdict(list)
    body_groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)

    for row in documents:
        content = str(row.get("content") or "")
        try:
            metadata, body, _, _, _ = split_frontmatter(content)
        except MaintenanceError as exc:
            parse_errors.append(
                {"id": int(row["id"]), "filename": row["filename"], "error": str(exc)}
            )
            continue
        sources = metadata_sources(metadata)
        identity = source_identity(metadata)
        actual_chunks = chunks_by_doc.get(int(row["id"]), [])
        actual_contents = [str(item.get("content") or "") for item in actual_chunks]
        expected_chunks = split_into_chunks(content, chunk_size)
        assignment = assignments.get(str(row["filename"]))
        member = {
            "id": int(row["id"]),
            "filename": str(row["filename"]),
            "file_type": row.get("file_type"),
            "content_sha256": sha256_text(content),
            "body_sha256": sha256_text(normalize_body(body)),
            "body_chars": len(normalize_body(body)),
            "content_chars": len(content),
            "chunk_count": int(row.get("chunk_count") or 0),
            "actual_chunk_count": len(actual_chunks),
            "chunk_parity_1500": actual_contents == expected_chunks,
            "metadata": metadata,
            "sources": sources,
            "source_identity": list(identity) if identity else None,
            "inbound_doc_ids": [],
            "desired_category": dict(assignment) if assignment else None,
        }
        analyzed.append(member)
        repo = normalize_repo(metadata)
        source_path = normalize_source_path(metadata.get("source_path"))
        if repo and source_path:
            source_path_index[(repo, source_path)].append(int(row["id"]))
        if identity:
            body_groups[(*identity, member["body_sha256"])].append(member)

    analyzed_by_id = {int(item["id"]): item for item in analyzed}
    inbound: dict[int, set[int]] = defaultdict(set)
    for member in analyzed:
        metadata = member["metadata"]
        repo = normalize_repo(metadata)
        source_path = normalize_source_path(metadata.get("source_path"))
        if not repo or not source_path:
            continue
        document = next(row for row in documents if int(row["id"]) == int(member["id"]))
        _, body, _, _, _ = split_frontmatter(str(document.get("content") or ""))
        for target in extract_link_targets(body):
            absolute_identity = github_target_identity(target)
            if absolute_identity:
                target_ids = source_path_index.get(absolute_identity, [])
                if len(target_ids) == 1 and target_ids[0] != int(member["id"]):
                    inbound[target_ids[0]].add(int(member["id"]))
                    continue
            for candidate in relative_target_candidates(source_path, target):
                target_ids = source_path_index.get((repo, candidate), [])
                if len(target_ids) == 1 and target_ids[0] != int(member["id"]):
                    inbound[target_ids[0]].add(int(member["id"]))
                    break

    for doc_id, source_ids in inbound.items():
        if doc_id in analyzed_by_id:
            analyzed_by_id[doc_id]["inbound_doc_ids"] = sorted(source_ids)

    duplicate_groups: list[dict[str, Any]] = []
    for key, members in sorted(body_groups.items(), key=lambda item: item[0]):
        if len(members) < 2:
            continue
        keep_id = choose_duplicate_keep(members)
        candidates = [
            int(member["id"])
            for member in members
            if int(member["id"]) != keep_id and not member["inbound_doc_ids"]
        ]
        duplicate_groups.append(
            {
                "source_repo": key[0],
                "source_path": key[1],
                "source_commit": key[2],
                "body_sha256": key[3],
                "doc_ids": sorted(int(member["id"]) for member in members),
                "keep_id": keep_id,
                "delete_candidate_ids": sorted(candidates),
                "inbound_by_doc": {
                    str(member["id"]): member["inbound_doc_ids"] for member in members
                },
            }
        )

    summary = {
        "parse_errors": parse_errors,
        "chunk_parity_failures": [
            {"id": item["id"], "filename": item["filename"]}
            for item in analyzed
            if not item["chunk_parity_1500"]
        ],
        "chunk_count_mismatches": [
            {"id": item["id"], "filename": item["filename"]}
            for item in analyzed
            if item["chunk_count"] != item["actual_chunk_count"]
        ],
        "missing_batch_filenames": sorted(
            str(item["filename"])
            for item in analyzed
            if item["desired_category"] is None
        ),
    }
    return analyzed, duplicate_groups, summary


def _file_identity(path: Path, required: bool = False) -> dict[str, Any] | None:
    if not path.exists():
        if required:
            raise MaintenanceError(f"Database file is missing: {path}")
        return None
    if not path.is_file() or path.is_symlink():
        raise MaintenanceError(f"Database file is not a regular file: {path}")
    stat = path.stat()
    return {
        "path": str(path.resolve()),
        "size_bytes": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "device": stat.st_dev,
        "inode": stat.st_ino,
        "sha256": sha256_file(path),
    }


def database_file_state(path: Path) -> dict[str, Any]:
    """Return the byte identity of the main database and its committed WAL."""
    resolved = path.resolve()
    wal = _file_identity(Path(str(resolved) + "-wal"))
    if wal is not None and wal["size_bytes"] == 0:
        wal = None
    return {
        "database": _file_identity(resolved, required=True),
        "wal": wal,
    }


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _fingerprint_value(digest: "hashlib._Hash", value: Any) -> None:
    if value is None:
        encoded = b"null"
    elif isinstance(value, bytes):
        encoded = b"blob:" + str(len(value)).encode("ascii") + b":" + value
    elif isinstance(value, int):
        encoded = b"int:" + str(value).encode("ascii")
    elif isinstance(value, float):
        encoded = b"float:" + value.hex().encode("ascii")
    elif isinstance(value, Mapping) or isinstance(value, (list, tuple)):
        encoded = b"json:" + canonical_json_bytes(value)
    else:
        encoded = b"text:" + str(value).encode("utf-8")
    digest.update(str(len(encoded)).encode("ascii"))
    digest.update(b":")
    digest.update(encoded)
    digest.update(b"\n")


def full_database_fingerprint(connection: sqlite3.Connection) -> str:
    """Fingerprint every persisted schema object and table row visible to a snapshot."""
    digest = hashlib.sha256()
    digest.update(b"codehelper-full-database-logical-v1\n")
    for pragma in ("application_id", "user_version"):
        value = connection.execute(f"PRAGMA {pragma}").fetchone()[0]
        _fingerprint_value(digest, {"pragma": pragma, "value": value})

    schema_rows = connection.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_autoindex_%' "
        "ORDER BY type, name, tbl_name"
    ).fetchall()
    for row in schema_rows:
        _fingerprint_value(
            digest,
            {
                "schema": [
                    None if value is None else str(value)
                    for value in (row[0], row[1], row[2], row[3])
                ]
            },
        )

    table_names = [
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "ORDER BY name"
        )
    ]
    for table_name in table_names:
        columns = [
            (str(row[1]), int(row[5] or 0))
            for row in connection.execute(
                f"PRAGMA table_info({quote_identifier(table_name)})"
            )
        ]
        if not columns:
            continue
        column_names = [name for name, _ in columns]
        primary_key = [
            name for name, position in sorted(columns, key=lambda item: item[1]) if position
        ]
        selected = ",".join(quote_identifier(name) for name in column_names)
        order_columns = primary_key or column_names
        order_by = ",".join(quote_identifier(name) for name in order_columns)
        _fingerprint_value(digest, {"table": table_name, "columns": column_names})
        cursor = connection.execute(
            f"SELECT {selected} FROM {quote_identifier(table_name)} ORDER BY {order_by}"
        )
        for row in cursor:
            digest.update(b"row\n")
            for value in row:
                _fingerprint_value(digest, value)
    return digest.hexdigest()


def live_full_database_fingerprint(db_path: Path) -> str:
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        fingerprint = full_database_fingerprint(connection)
        connection.execute("ROLLBACK")
        return fingerprint
    finally:
        connection.close()


def run_audit(
    db_path: Path,
    import_batches: Path,
    rules_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    rules = read_rules(rules_path)
    assignments, batch_summary = build_import_batch_map(import_batches, rules)
    before_state = database_file_state(db_path)
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        checks = quick_check(connection)
        if not quick_check_ok(checks):
            raise MaintenanceError(f"Database quick_check failed: {checks}")
        documents, chunks = read_knowledge_snapshot(connection)
        database_full_fingerprint = full_database_fingerprint(connection)
        analyzed, duplicate_groups, analysis_summary = analyze_documents(
            documents, chunks, assignments, int(rules["chunk_size"])
        )
        schema_versions = read_component_schema_versions(connection)
        objects = {
            str(row[0]): str(row[1])
            for row in connection.execute(
                "SELECT name, type FROM sqlite_master "
                "WHERE name LIKE 'knowledge_chunks_%' ORDER BY name"
            )
        }
        journal_mode = str(connection.execute("PRAGMA journal_mode").fetchone()[0])
        data_version = int(connection.execute("PRAGMA data_version").fetchone()[0])
        connection.execute("ROLLBACK")
    finally:
        connection.close()

    filenames = {str(row["filename"]) for row in documents}
    extra_batch_filenames = sorted(set(assignments) - filenames)
    report = {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "tool_version": TOOL_VERSION,
        "run_id": str(uuid.uuid4()),
        "generated_at": utc_now(),
        "database": before_state,
        "safety": {"open_mode": "readonly", "query_only": True, "snapshot": "BEGIN"},
        "sqlite": {
            "python_sqlite_version": sqlite3.sqlite_version,
            "journal_mode": journal_mode,
            "data_version": data_version,
            "quick_check": checks,
            "component_schema_versions": schema_versions,
        },
        "fingerprint": logical_fingerprint(documents, chunks),
        "database_full_fingerprint": database_full_fingerprint,
        "totals": {
            "documents": len(documents),
            "chunks": len(chunks),
            "orphan_chunks": sum(
                1 for chunk in chunks if int(chunk["doc_id"]) not in {int(doc["id"]) for doc in documents}
            ),
        },
        "schema_objects": objects,
        "import_batches": {
            **batch_summary,
            "extra_batch_filenames": extra_batch_filenames,
        },
        "analysis": analysis_summary,
        "duplicate_groups": duplicate_groups,
        "documents": analyzed,
        "distributions": {
            "category": dict(
                Counter(
                    str(item["metadata"].get("category") or "<missing>")
                    for item in analyzed
                )
            ),
            "source_repo": dict(
                Counter(normalize_repo(item["metadata"]) or "<missing>" for item in analyzed)
            ),
        },
    }
    if report["totals"]["orphan_chunks"]:
        raise MaintenanceError("Audit found orphan knowledge chunks")
    if analysis_summary["parse_errors"]:
        raise MaintenanceError(
            f"Audit found invalid frontmatter in {len(analysis_summary['parse_errors'])} documents"
        )
    if analysis_summary["chunk_parity_failures"]:
        raise MaintenanceError(
            f"Audit found {len(analysis_summary['chunk_parity_failures'])} chunk parity failures"
        )
    if analysis_summary["chunk_count_mismatches"]:
        raise MaintenanceError(
            f"Audit found {len(analysis_summary['chunk_count_mismatches'])} chunk count mismatches"
        )
    if analysis_summary["missing_batch_filenames"] or extra_batch_filenames:
        raise MaintenanceError(
            "Database filenames and import-batch filename mapping are not one-to-one"
        )
    if batch_summary["filename_count"] != len(documents):
        raise MaintenanceError(
            f"Import batch map has {batch_summary['filename_count']} filenames; database has {len(documents)}"
        )
    after_state = database_file_state(db_path)
    if before_state != after_state:
        raise MaintenanceError("Read-only audit observed source database file state change")
    atomic_write_json(output_path, report)
    return report


def resolve_evidence_path(rules_path: Path, source: str) -> Path:
    configured = Path(source)
    return configured.resolve() if configured.is_absolute() else (rules_path.parent / configured).resolve()


def load_evidence_artifacts(
    rules: Mapping[str, Any],
    rules_path: Path,
    remote_status_path: Path,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    loaded: dict[str, Any] = {}
    summary: dict[str, dict[str, Any]] = {}
    for name in EVIDENCE_ARTIFACT_NAMES:
        descriptor = rules["evidence_artifacts"][name]
        path = resolve_evidence_path(rules_path, str(descriptor["source"]))
        if name == "remote_status" and path != remote_status_path.resolve():
            raise MaintenanceError("--remote-status does not match the rules evidence artifact")
        if not path.is_file() or path.is_symlink():
            raise MaintenanceError(f"Evidence artifact is missing or not a regular file: {path}")
        actual_sha = sha256_file(path)
        if actual_sha != descriptor["sha256"]:
            raise MaintenanceError(f"Evidence artifact SHA-256 mismatch: {name}")
        loaded[name] = load_json(path)
        summary[name] = {
            "path": str(path),
            "sha256": actual_sha,
        }
    return loaded, summary


def _required_positive_ids(value: Any, label: str) -> list[int]:
    if not isinstance(value, list) or any(not isinstance(item, int) or item <= 0 for item in value):
        raise MaintenanceError(f"{label} must be an array of positive document ids")
    ids = [int(item) for item in value]
    if len(ids) != len(set(ids)):
        raise MaintenanceError(f"{label} contains duplicate document ids")
    return ids


def validate_candidate_evidence(
    candidate: Any,
    rules: Mapping[str, Any],
    analyzed: Sequence[Mapping[str, Any]],
    duplicate_groups: Sequence[Mapping[str, Any]],
) -> None:
    if not isinstance(candidate, dict):
        raise MaintenanceError("Candidate-inbound evidence must be an object")
    sets = candidate.get("sets")
    items = candidate.get("items")
    set_counts = candidate.get("set_counts")
    if not isinstance(sets, dict) or not isinstance(items, dict) or not isinstance(set_counts, dict):
        raise MaintenanceError("Candidate-inbound evidence is missing sets/items/counts")
    if set(sets) != set(items) or set(sets) != set(set_counts):
        raise MaintenanceError("Candidate-inbound set names are inconsistent")

    ids_by_set: dict[str, list[int]] = {}
    items_by_set: dict[str, dict[int, Mapping[str, Any]]] = {}
    for set_name, raw_ids in sets.items():
        ids = _required_positive_ids(raw_ids, f"candidate set {set_name}")
        raw_items = items[set_name]
        if not isinstance(raw_items, list) or any(not isinstance(item, dict) for item in raw_items):
            raise MaintenanceError(f"Candidate evidence items are invalid: {set_name}")
        indexed = {int(item.get("id", 0)): item for item in raw_items}
        if set(indexed) != set(ids) or len(indexed) != len(raw_items):
            raise MaintenanceError(f"Candidate evidence ids/items differ: {set_name}")
        if set_counts[set_name] != len(ids):
            raise MaintenanceError(f"Candidate evidence count differs: {set_name}")
        ids_by_set[str(set_name)] = ids
        items_by_set[str(set_name)] = indexed
    union = {doc_id for ids in ids_by_set.values() for doc_id in ids}
    if candidate.get("union_count") != len(union):
        raise MaintenanceError("Candidate-inbound union_count is invalid")

    analyzed_by_id = {int(item["id"]): item for item in analyzed}
    unknown = sorted(union - set(analyzed_by_id))
    if unknown:
        raise MaintenanceError(f"Candidate evidence references unknown documents: {unknown}")
    duplicate_set = str(rules["duplicate_evidence_set"])
    if duplicate_set not in ids_by_set:
        raise MaintenanceError("Candidate evidence is missing the duplicate delete set")
    reviewed_delete_ids = set(ids_by_set[duplicate_set]) | {
        int(manual["id"]) for manual in rules.get("manual_delete", [])
    }
    identity_ids: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for document in analyzed:
        identity = source_identity(document["metadata"])
        if identity:
            identity_ids[identity].append(int(document["id"]))

    for set_name, indexed in items_by_set.items():
        for doc_id, evidence in indexed.items():
            document = analyzed_by_id[doc_id]
            sources = document["sources"]
            expected = {
                "filename": document["filename"],
                "source_repo": sources.get("source_repo"),
                "source_path": sources.get("source_path"),
                "source_commit": sources.get("source_commit"),
                "inbound_document_count": len(document.get("inbound_doc_ids", [])),
            }
            for field, value in expected.items():
                if evidence.get(field) != value:
                    raise MaintenanceError(
                        f"Candidate evidence field mismatch for {doc_id}: {field}"
                    )
            identity = source_identity(document["metadata"])
            expected_identity_ids = sorted(identity_ids.get(identity, [])) if identity else []
            if evidence.get("source_identity_doc_ids") != expected_identity_ids:
                raise MaintenanceError(
                    f"Candidate source identity members mismatch for {doc_id}"
                )
            if doc_id in reviewed_delete_ids and (
                evidence.get("inbound_link_occurrences") != 0
                or evidence.get("inbound_document_count") != 0
                or document.get("inbound_doc_ids")
            ):
                raise MaintenanceError(f"Candidate document has inbound links: {doc_id}")

    recomputed_duplicate_ids = sorted(
        int(doc_id)
        for group in duplicate_groups
        for doc_id in group["delete_candidate_ids"]
    )
    if sorted(ids_by_set[duplicate_set]) != recomputed_duplicate_ids:
        raise MaintenanceError("Candidate duplicate delete ids do not match live analysis")
    for manual in rules.get("manual_delete", []):
        evidence_set = str(manual["evidence_set"])
        if evidence_set not in ids_by_set or int(manual["id"]) not in ids_by_set[evidence_set]:
            raise MaintenanceError(
                f"Manual delete id is not present in its reviewed evidence set: {manual['id']}"
            )


def validate_readonly_evidence(
    readonly: Any,
    candidate: Mapping[str, Any],
    documents: Sequence[Mapping[str, Any]],
    chunks: Sequence[Mapping[str, Any]],
    analyzed: Sequence[Mapping[str, Any]],
    duplicate_groups: Sequence[Mapping[str, Any]],
) -> None:
    if not isinstance(readonly, dict):
        raise MaintenanceError("Readonly audit evidence must be an object")
    totals = readonly.get("totals")
    if not isinstance(totals, dict) or (
        totals.get("docs") != len(documents)
        or totals.get("chunks") != len(chunks)
        or totals.get("orphan_chunks") != 0
        or totals.get("chunk_count_mismatches") != 0
    ):
        raise MaintenanceError("Readonly audit totals do not match the live snapshot")
    mirror = readonly.get("mirror")
    if not isinstance(mirror, dict) or mirror.get("file_count") != len(documents):
        raise MaintenanceError("Readonly audit mirror count does not match the live snapshot")
    match_stats = mirror.get("match_stats")
    if not isinstance(match_stats, dict) or match_stats.get("exact") != len(documents):
        raise MaintenanceError("Readonly audit does not prove an exact resource mirror")
    if mirror.get("diff_examples") not in ([], None):
        raise MaintenanceError("Readonly audit reports resource mirror differences")

    duplicates = readonly.get("duplicates")
    raw_groups = duplicates.get("same_source_and_same_normalized_body") if isinstance(duplicates, dict) else None
    if not isinstance(raw_groups, list) or any(not isinstance(group, dict) for group in raw_groups):
        raise MaintenanceError("Readonly duplicate evidence is missing")
    readonly_groups = sorted(
        (
            tuple(sorted(_required_positive_ids(group.get("ids"), "readonly duplicate ids"))),
            int(group.get("keep_id", 0)),
            tuple(sorted(_required_positive_ids(
                group.get("delete_candidate_ids"), "readonly duplicate delete ids"
            ))),
        )
        for group in raw_groups
    )
    live_groups = sorted(
        (
            tuple(int(value) for value in group["doc_ids"]),
            int(group["keep_id"]),
            tuple(int(value) for value in group["delete_candidate_ids"]),
        )
        for group in duplicate_groups
    )
    if readonly_groups != live_groups:
        raise MaintenanceError("Readonly duplicate evidence does not match live analysis")

    quality = readonly.get("quality")
    quality_rows = quality.get("candidates") if isinstance(quality, dict) else None
    if not isinstance(quality_rows, list) or any(not isinstance(row, dict) for row in quality_rows):
        raise MaintenanceError("Readonly quality evidence is missing")
    quality_by_id = {int(row.get("id", 0)): row for row in quality_rows}
    analyzed_by_id = {int(item["id"]): item for item in analyzed}
    candidate_ids = {
        int(doc_id)
        for raw_ids in candidate["sets"].values()
        for doc_id in raw_ids
    }
    for doc_id in sorted(candidate_ids & set(quality_by_id)):
        row = quality_by_id[doc_id]
        document = analyzed_by_id[doc_id]
        expected = {
            "filename": document["filename"],
            "repo": document["sources"].get("source_repo"),
            "path": document["sources"].get("source_path"),
        }
        for field, value in expected.items():
            if row.get(field) != value:
                raise MaintenanceError(
                    f"Readonly quality evidence mismatch for {doc_id}: {field}"
                )


def validate_confirmed_404_evidence(
    report: Any,
    remote_by_url: Mapping[str, Mapping[str, Any]],
) -> set[str]:
    if not isinstance(report, dict) or not isinstance(report.get("items"), list):
        raise MaintenanceError("Confirmed-404 evidence must contain an items array")
    if report.get("count") != len(report["items"]):
        raise MaintenanceError("Confirmed-404 evidence count does not match items")
    confirmed: set[str] = set()
    for item in report["items"]:
        if not isinstance(item, dict):
            raise MaintenanceError("Confirmed-404 evidence item must be an object")
        raw_url = clean_scalar(item.get("url") or item.get("raw_target") or item.get("target"))
        lookup_url = clean_scalar(
            item.get("lookup_url") or item.get("base_url") or item.get("defragmented_url")
        )
        if not raw_url:
            raise MaintenanceError("Confirmed-404 evidence item is missing a URL")
        expected_lookup = urldefrag(raw_url).url
        if lookup_url and lookup_url != expected_lookup:
            raise MaintenanceError("Confirmed-404 defragmented URL evidence is inconsistent")
        remote = remote_by_url.get(expected_lookup)
        if remote is None or REMOTE_STATUS_MAPPING[str(remote["category"])] != "not_found":
            raise MaintenanceError("Confirmed-404 evidence is not backed by remote status")
        confirmed.add(expected_lookup)
    return confirmed


def plan_digest(plan: Mapping[str, Any]) -> str:
    payload = dict(plan)
    payload.pop("plan_sha256", None)
    return sha256_bytes(canonical_json_bytes(payload))


def load_plan(path: Path) -> dict[str, Any]:
    plan = load_json(path)
    if not isinstance(plan, dict) or plan.get("schema_version") != PLAN_SCHEMA_VERSION:
        raise MaintenanceError(f"Unsupported plan schema in {path}")
    expected = plan.get("plan_sha256")
    actual = plan_digest(plan)
    if not isinstance(expected, str) or expected != actual:
        raise MaintenanceError(f"Plan SHA-256 mismatch: {path}")
    required_hashes = (
        "fingerprint_before",
        "fingerprint_after",
        "database_full_fingerprint_before",
        "metadata_fingerprint_after",
        "link_audit_fingerprint_after",
    )
    for field in required_hashes:
        if not isinstance(plan.get(field), str) or not re.fullmatch(r"[0-9a-f]{64}", plan[field]):
            raise MaintenanceError(f"Plan is missing a valid SHA-256 field: {field}")
    actions = plan.get("actions")
    if not isinstance(actions, list) or any(not isinstance(action, dict) for action in actions):
        raise MaintenanceError("Plan actions must be an array of objects")
    action_ids = [str(action.get("action_id") or "") for action in actions]
    if len(action_ids) != len(set(action_ids)):
        raise MaintenanceError("Plan contains duplicate action ids")
    for action in actions:
        if action.get("action_id") != action_id(action):
            raise MaintenanceError("Plan action id does not bind the complete action snapshot")
    if plan.get("action_counts") != dict(Counter(str(action["action"]) for action in actions)):
        raise MaintenanceError("Plan action counts do not match actions")
    if not isinstance(plan.get("generated_at"), str) or not plan["generated_at"].strip():
        raise MaintenanceError("Plan generated_at is required for deterministic journaling")
    return plan


def validate_plan_rules_artifact(plan: Mapping[str, Any]) -> dict[str, Any]:
    rules_path = Path(str(plan.get("rules_path") or ""))
    expected = plan.get("rules_sha256")
    canonical_path = default_rules_path().resolve()
    if (
        not rules_path.is_absolute()
        or rules_path.resolve() != canonical_path
        or not rules_path.is_file()
        or rules_path.is_symlink()
        or not isinstance(expected, str)
        or sha256_file(rules_path) != expected
    ):
        raise MaintenanceError("Rules artifact changed after dry-run; regenerate the plan and backup")
    return read_rules(rules_path)


def validate_plan_audit_artifact(plan: Mapping[str, Any]) -> dict[str, Any]:
    audit_path = Path(str(plan.get("audit_path") or ""))
    expected = plan.get("audit_sha256")
    if (
        not audit_path.is_absolute()
        or not audit_path.is_file()
        or audit_path.is_symlink()
        or not isinstance(expected, str)
        or sha256_file(audit_path) != expected
    ):
        raise MaintenanceError("Audit artifact changed after dry-run; regenerate the plan and backup")
    audit = load_json(audit_path)
    if not isinstance(audit, dict) or audit.get("schema_version") != AUDIT_SCHEMA_VERSION:
        raise MaintenanceError("Plan audit artifact has an unsupported schema")
    return audit


def validate_plan_evidence_artifacts(plan: Mapping[str, Any]) -> None:
    artifacts = plan.get("evidence_artifacts")
    if not isinstance(artifacts, dict) or set(artifacts) != set(EVIDENCE_ARTIFACT_NAMES):
        raise MaintenanceError("Plan evidence artifact contract is missing")
    for name in EVIDENCE_ARTIFACT_NAMES:
        descriptor = artifacts[name]
        if not isinstance(descriptor, dict):
            raise MaintenanceError(f"Plan evidence descriptor is invalid: {name}")
        path = Path(str(descriptor.get("path") or ""))
        expected = descriptor.get("sha256")
        if (
            not path.is_absolute()
            or not path.is_file()
            or path.is_symlink()
            or not isinstance(expected, str)
            or sha256_file(path) != expected
        ):
            raise MaintenanceError(f"Evidence artifact changed after dry-run: {name}")


def live_snapshot(db_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        documents, chunks = read_knowledge_snapshot(connection)
        fingerprint = logical_fingerprint(documents, chunks)
        connection.execute("ROLLBACK")
        return documents, chunks, fingerprint
    finally:
        connection.close()


def action_id(action: Mapping[str, Any]) -> str:
    stable = {key: value for key, value in action.items() if key != "action_id"}
    return sha256_bytes(canonical_json_bytes(stable))


def read_existing_metadata_rows(db_path: Path) -> dict[int, dict[str, Any]]:
    connection = connect_readonly(db_path)
    try:
        if not table_exists(connection, "knowledge_doc_metadata"):
            return {}
        return {
            int(row["doc_id"]): dict(row)
            for row in connection.execute(
                "SELECT " + ",".join(METADATA_STORAGE_FIELDS)
                + " FROM knowledge_doc_metadata ORDER BY doc_id"
            )
        }
    finally:
        connection.close()


def authorized_deletion_rules(
    rules: Mapping[str, Any],
    duplicate_groups: Sequence[Mapping[str, Any]],
    analyzed: Sequence[Mapping[str, Any]],
    documents: Sequence[Mapping[str, Any]],
) -> dict[int, dict[str, Any]]:
    analyzed_by_id = {int(item["id"]): item for item in analyzed}
    db_docs = {int(item["id"]): item for item in documents}
    duplicate_candidates: dict[int, dict[str, Any]] = {}
    if rules.get("auto_delete_duplicates", True):
        for group in duplicate_groups:
            for doc_id in group["delete_candidate_ids"]:
                duplicate_candidates[int(doc_id)] = {
                    "reason_code": "duplicate-same-source-commit-body-zero-inbound",
                    "keep_doc_id": int(group["keep_id"]),
                    "evidence": {
                        "source_repo": group["source_repo"],
                        "source_path": group["source_path"],
                        "source_commit": group["source_commit"],
                        "body_sha256": group["body_sha256"],
                        "inbound_doc_ids": group["inbound_by_doc"].get(str(doc_id), []),
                    },
                }

    deletion_rules = dict(duplicate_candidates)
    for manual in rules.get("manual_delete", []):
        doc_id = int(manual["id"])
        if doc_id in deletion_rules:
            raise MaintenanceError(f"Manual delete overlaps an automatic duplicate: {doc_id}")
        deletion_rules[doc_id] = {
            "reason_code": str(manual.get("reason_code") or "manual-reviewed-delete"),
            "keep_doc_id": None,
            "evidence": {"review_reason": manual["reason"]},
        }

    unknown = sorted(set(deletion_rules) - set(db_docs))
    if unknown:
        raise MaintenanceError(f"Delete rules reference unknown document ids: {unknown}")
    inbound_manual = sorted(
        doc_id
        for doc_id in deletion_rules
        if doc_id not in duplicate_candidates
        and analyzed_by_id[doc_id].get("inbound_doc_ids")
    )
    if inbound_manual:
        raise MaintenanceError(
            f"Manual delete rules reference documents with inbound links: {inbound_manual}"
        )
    evidence_rows = []
    for doc_id in sorted(int(item["id"]) for item in rules.get("manual_delete", [])):
        document = analyzed_by_id[doc_id]
        evidence_rows.append(
            {
                "id": doc_id,
                "filename": str(document["filename"]),
                "content_sha256": str(document["content_sha256"]),
                "source_repo": document["sources"].get("source_repo"),
                "source_path": document["sources"].get("source_path"),
                "source_commit": document["sources"].get("source_commit"),
            }
        )
    expected_evidence = rules.get("manual_review", {}).get("expected_documents_sha256")
    if sha256_bytes(canonical_json_bytes(evidence_rows)) != expected_evidence:
        raise MaintenanceError("Manual delete evidence does not match the reviewed documents")
    return deletion_rules


def build_authorized_delete_actions(
    deletion_rules: Mapping[int, Mapping[str, Any]],
    analyzed: Sequence[Mapping[str, Any]],
    documents: Sequence[Mapping[str, Any]],
    assignments: Mapping[str, Mapping[str, str]],
) -> list[dict[str, Any]]:
    analyzed_by_id = {int(item["id"]): item for item in analyzed}
    db_docs = {int(item["id"]): item for item in documents}
    actions: list[dict[str, Any]] = []
    for doc_id, deletion in sorted(deletion_rules.items()):
        row = db_docs[doc_id]
        analyzed_doc = analyzed_by_id[doc_id]
        assignment = assignments.get(str(row["filename"]))
        if not assignment:
            raise MaintenanceError(f"No import-batch category for {row['filename']}")
        metadata_record = build_metadata_record(row, analyzed_doc["metadata"], assignment)
        action = {
            "action": "delete",
            "doc_id": doc_id,
            "filename": row["filename"],
            "reason_code": deletion["reason_code"],
            "reason_detail": deletion["evidence"].get("review_reason")
            or "Same source repository, path, commit, and normalized body; zero inbound links",
            "keep_doc_id": deletion["keep_doc_id"],
            "evidence": deletion["evidence"],
            "sources": analyzed_doc["sources"],
            "before_content_sha256": sha256_text(str(row.get("content") or "")),
            "after_content_sha256": None,
            "before_chunk_count": int(row.get("chunk_count") or 0),
            "inbound_doc_ids": analyzed_doc.get("inbound_doc_ids", []),
            "metadata": metadata_record,
            "before": {
                "chunk_count": int(row.get("chunk_count") or 0),
                "metadata": metadata_storage_row(metadata_record),
                "inbound_doc_ids": analyzed_doc.get("inbound_doc_ids", []),
            },
            "after": {"deleted": True},
        }
        action["action_id"] = action_id(action)
        actions.append(action)
    return actions


def existing_metadata_rows_from_connection(
    connection: sqlite3.Connection,
) -> dict[int, dict[str, Any]]:
    if not table_exists(connection, "knowledge_doc_metadata"):
        return {}
    return {
        int(row["doc_id"]): dict(row)
        for row in connection.execute(
            "SELECT " + ",".join(METADATA_STORAGE_FIELDS)
            + " FROM knowledge_doc_metadata ORDER BY doc_id"
        )
    }


def build_authorized_plan_payload(
    documents: Sequence[Mapping[str, Any]],
    chunks: Sequence[Mapping[str, Any]],
    analyzed: Sequence[Mapping[str, Any]],
    assignments: Mapping[str, Mapping[str, str]],
    deletion_rules: Mapping[int, Mapping[str, Any]],
    existing_metadata: Mapping[int, Mapping[str, Any]],
    remote_by_url: Mapping[str, Mapping[str, Any]],
    remote_checked_at: str,
) -> dict[str, Any]:
    analyzed_by_id = {int(item["id"]): item for item in analyzed}
    db_docs = {int(item["id"]): item for item in documents}
    transformed_documents = [
        dict(document)
        for document in documents
        if int(document["id"]) not in deletion_rules
    ]
    transformed_chunks = [
        dict(chunk) for chunk in chunks if int(chunk["doc_id"]) not in deletion_rules
    ]
    actions = build_authorized_delete_actions(
        deletion_rules, analyzed, documents, assignments
    )
    metadata_records: list[dict[str, Any]] = []
    for doc_id, row in sorted(db_docs.items()):
        if doc_id in deletion_rules:
            continue
        assignment = assignments.get(str(row["filename"]))
        if not assignment:
            raise MaintenanceError(f"No import-batch category for {row['filename']}")
        content = str(row.get("content") or "")
        analyzed_doc = analyzed_by_id[doc_id]
        desired = build_metadata_record(row, analyzed_doc["metadata"], assignment)
        metadata_records.append(desired)
        desired_storage = metadata_storage_row(desired)
        before_storage = existing_metadata.get(doc_id)
        if before_storage == desired_storage:
            continue
        action = {
            "action": "upsert_metadata",
            "doc_id": doc_id,
            "filename": row["filename"],
            "reason_code": "canonical-import-batch-category",
            "reason_detail": (
                f"Canonical category from import batch {assignment['batch_id']}: "
                f"{assignment['category_label']}"
            ),
            "keep_doc_id": None,
            "batch_id": assignment["batch_id"],
            "sources": analyzed_doc["sources"],
            "before_content_sha256": sha256_text(content),
            "after_content_sha256": sha256_text(content),
            "before_chunk_count": int(row.get("chunk_count") or 0),
            "after_chunk_count": int(row.get("chunk_count") or 0),
            "metadata": desired,
            "before": dict(before_storage) if before_storage else {},
            "after": desired_storage,
        }
        action["action_id"] = action_id(action)
        actions.append(action)

    link_records, link_summary = build_link_audit_records(
        transformed_documents,
        metadata_records,
        remote_by_url,
        remote_checked_at,
    )
    actions.sort(
        key=lambda item: (
            0 if item["action"] == "delete" else 1,
            int(item["doc_id"]),
        )
    )
    return {
        "actions": actions,
        "transformed_documents": transformed_documents,
        "transformed_chunks": transformed_chunks,
        "metadata_records": metadata_records,
        "metadata_fingerprint": metadata_fingerprint(metadata_records),
        "link_audit_records": link_records,
        "link_audit_summary": link_summary,
        "link_audit_fingerprint": link_audit_fingerprint(link_records),
    }


def reauthorize_plan_against_connection(
    plan: Mapping[str, Any], connection: sqlite3.Connection
) -> dict[str, Any]:
    rules = validate_plan_rules_artifact(plan)
    audit = validate_plan_audit_artifact(plan)
    validate_plan_evidence_artifacts(plan)

    import_summary = plan.get("import_batches")
    if not isinstance(import_summary, dict):
        raise MaintenanceError("Plan import-batch evidence is missing")
    import_root = Path(str(import_summary.get("root") or ""))
    canonical_import_root = default_import_batches_path().resolve()
    if not import_root.is_absolute() or import_root.resolve() != canonical_import_root:
        raise MaintenanceError("Plan import-batch root is not the canonical maintenance source")
    assignments, rebuilt_import_summary = build_import_batch_map(import_root, rules)
    if rebuilt_import_summary != import_summary:
        raise MaintenanceError("Import-batch mapping changed after dry-run")

    remote_status = plan.get("remote_status")
    if not isinstance(remote_status, dict):
        raise MaintenanceError("Plan remote-status evidence is missing")
    remote_path = Path(str(remote_status.get("path") or ""))
    evidence_artifacts, evidence_summary = load_evidence_artifacts(
        rules, default_rules_path(), remote_path
    )
    if evidence_summary != plan.get("evidence_artifacts"):
        raise MaintenanceError("Plan evidence artifacts do not match canonical rules")
    remote_report, remote_by_url = load_remote_status_report(remote_path)
    expected_remote = {
        "path": str(remote_path.resolve()),
        "sha256": sha256_file(remote_path),
        "generated_at": str(remote_report["generated_at"]),
        "total_unique": int(remote_report["total_unique"]),
        "counts": remote_report.get("counts", {}),
    }
    if remote_status != expected_remote or remote_report != evidence_artifacts["remote_status"]:
        raise MaintenanceError("Plan remote-status summary is not canonical")

    documents, chunks = read_knowledge_snapshot(connection)
    fingerprint = logical_fingerprint(documents, chunks)
    database_full_fingerprint = full_database_fingerprint(connection)
    if fingerprint != plan["fingerprint_before"]:
        raise MaintenanceError("Authorized source knowledge fingerprint does not match plan")
    if database_full_fingerprint != plan["database_full_fingerprint_before"]:
        raise MaintenanceError("Authorized full database fingerprint does not match plan")
    maintenance_before = read_maintenance_state_from_connection(connection)
    assert_maintenance_state_matches(maintenance_before, plan["maintenance_before"])
    if plan.get("counts_before") != {
        "documents": len(documents),
        "chunks": len(chunks),
        "metadata_rows": maintenance_before["metadata_rows"],
        "link_audit_rows": maintenance_before["link_audit_rows"],
    }:
        raise MaintenanceError("Plan pre-maintenance counts do not match authorized source")

    analyzed, duplicate_groups, analysis_summary = analyze_documents(
        documents, chunks, assignments, int(rules["chunk_size"])
    )
    expected_totals = {
        "documents": len(documents),
        "chunks": len(chunks),
        "orphan_chunks": sum(
            1
            for chunk in chunks
            if int(chunk["doc_id"]) not in {int(doc["id"]) for doc in documents}
        ),
    }
    if (
        audit.get("fingerprint") != fingerprint
        or audit.get("database_full_fingerprint") != database_full_fingerprint
        or audit.get("totals") != expected_totals
        or audit.get("documents") != analyzed
        or audit.get("duplicate_groups") != duplicate_groups
        or audit.get("analysis") != analysis_summary
        or not isinstance(audit.get("import_batches"), dict)
        or audit["import_batches"].get("mapping_sha256")
        != rebuilt_import_summary["mapping_sha256"]
    ):
        raise MaintenanceError("Audit artifact is not an exact analysis of the authorized source")

    validate_candidate_evidence(
        evidence_artifacts["candidate_inbound"], rules, analyzed, duplicate_groups
    )
    validate_readonly_evidence(
        evidence_artifacts["readonly_audit"],
        evidence_artifacts["candidate_inbound"],
        documents,
        chunks,
        analyzed,
        duplicate_groups,
    )
    confirmed_urls = validate_confirmed_404_evidence(
        evidence_artifacts["confirmed_404"], remote_by_url
    )
    if sorted(confirmed_urls) != plan.get("confirmed_404_evidence_urls"):
        raise MaintenanceError("Plan confirmed-404 authorization differs from evidence")

    deletion_rules = authorized_deletion_rules(
        rules, duplicate_groups, analyzed, documents
    )
    payload = build_authorized_plan_payload(
        documents,
        chunks,
        analyzed,
        assignments,
        deletion_rules,
        existing_metadata_rows_from_connection(connection),
        remote_by_url,
        str(remote_report["generated_at"]),
    )
    expected_actions = payload["actions"]
    expected_deletes = [action for action in expected_actions if action["action"] == "delete"]
    transformed_documents = payload["transformed_documents"]
    transformed_chunks = payload["transformed_chunks"]
    if (
        plan["actions"] != expected_actions
        or plan.get("metadata_records") != payload["metadata_records"]
        or plan.get("metadata_fingerprint_after") != payload["metadata_fingerprint"]
        or plan.get("link_audit_records") != payload["link_audit_records"]
        or plan.get("link_audit_summary") != payload["link_audit_summary"]
        or plan.get("link_audit_fingerprint_after") != payload["link_audit_fingerprint"]
        or plan["fingerprint_after"]
        != logical_fingerprint(transformed_documents, transformed_chunks)
        or plan.get("counts_after")
        != {
            "documents": len(transformed_documents),
            "chunks": len(transformed_chunks),
            "metadata_rows": len(payload["metadata_records"]),
            "link_audit_rows": len(payload["link_audit_records"]),
        }
        or plan.get("deletion_reason_counts")
        != dict(Counter(action["reason_code"] for action in expected_deletes))
        or plan.get("action_counts")
        != dict(Counter(action["action"] for action in expected_actions))
    ):
        raise MaintenanceError("Plan actions and derived records are not canonically authorized")
    return {
        "rules": rules,
        "audit": audit,
        "assignments": assignments,
        "documents": documents,
        "chunks": chunks,
        "actions": expected_actions,
        "database_full_fingerprint": database_full_fingerprint,
    }


def reauthorize_plan_against_database(
    plan: Mapping[str, Any], db_path: Path
) -> dict[str, Any]:
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        result = reauthorize_plan_against_connection(plan, connection)
        connection.execute("ROLLBACK")
        return result
    finally:
        connection.close()


def run_dry_run(
    db_path: Path,
    audit_path: Path,
    import_batches: Path,
    rules_path: Path,
    remote_status_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    audit = load_json(audit_path)
    if not isinstance(audit, dict) or audit.get("schema_version") != AUDIT_SCHEMA_VERSION:
        raise MaintenanceError("Unsupported audit report")
    rules = read_rules(rules_path)
    assignments, batch_summary = build_import_batch_map(import_batches, rules)
    if (
        not isinstance(audit.get("import_batches"), dict)
        or batch_summary["mapping_sha256"] != audit["import_batches"].get("mapping_sha256")
    ):
        raise MaintenanceError("Import-batch mapping changed after audit")
    evidence_artifacts, evidence_summary = load_evidence_artifacts(
        rules, rules_path, remote_status_path
    )
    remote_report, remote_by_url = load_remote_status_report(remote_status_path)
    if remote_report != evidence_artifacts["remote_status"]:
        raise MaintenanceError("Remote status evidence changed while it was being loaded")
    before_state = database_file_state(db_path)
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        documents, chunks = read_knowledge_snapshot(connection)
        fingerprint = logical_fingerprint(documents, chunks)
        database_full_fingerprint = full_database_fingerprint(connection)
        maintenance_before = read_maintenance_state_from_connection(connection)
        existing_metadata = (
            {
                int(row["doc_id"]): dict(row)
                for row in connection.execute(
                    "SELECT " + ",".join(METADATA_STORAGE_FIELDS)
                    + " FROM knowledge_doc_metadata ORDER BY doc_id"
                )
            }
            if table_exists(connection, "knowledge_doc_metadata")
            else {}
        )
        analyzed, duplicate_groups, analysis_summary = analyze_documents(
            documents, chunks, assignments, int(rules["chunk_size"])
        )
        connection.execute("ROLLBACK")
    finally:
        connection.close()
    if before_state != database_file_state(db_path):
        raise MaintenanceError("Database or WAL changed during dry-run snapshot validation")
    if fingerprint != audit.get("fingerprint"):
        raise MaintenanceError("Database changed after audit")
    if database_full_fingerprint != audit.get("database_full_fingerprint"):
        raise MaintenanceError("Full database state changed after audit")
    expected_totals = {
        "documents": len(documents),
        "chunks": len(chunks),
        "orphan_chunks": sum(
            1
            for chunk in chunks
            if int(chunk["doc_id"]) not in {int(doc["id"]) for doc in documents}
        ),
    }
    if audit.get("totals") != expected_totals:
        raise MaintenanceError("Audit totals do not match the live snapshot")
    if audit.get("documents") != analyzed:
        raise MaintenanceError("Audit document analysis does not match the live snapshot")
    if audit.get("duplicate_groups") != duplicate_groups:
        raise MaintenanceError("Audit duplicate evidence does not match the live snapshot")
    if audit.get("analysis") != analysis_summary:
        raise MaintenanceError("Audit analysis summary does not match the live snapshot")
    validate_candidate_evidence(
        evidence_artifacts["candidate_inbound"], rules, analyzed, duplicate_groups
    )
    validate_readonly_evidence(
        evidence_artifacts["readonly_audit"],
        evidence_artifacts["candidate_inbound"],
        documents,
        chunks,
        analyzed,
        duplicate_groups,
    )
    confirmed_404_urls = validate_confirmed_404_evidence(
        evidence_artifacts["confirmed_404"], remote_by_url
    )

    deletion_rules = authorized_deletion_rules(
        rules, duplicate_groups, analyzed, documents
    )
    remote_checked_at = str(remote_report["generated_at"])
    payload = build_authorized_plan_payload(
        documents,
        chunks,
        analyzed,
        assignments,
        deletion_rules,
        existing_metadata,
        remote_by_url,
        remote_checked_at,
    )
    actions = payload["actions"]
    transformed_docs = payload["transformed_documents"]
    transformed_chunks = payload["transformed_chunks"]
    metadata_records = payload["metadata_records"]
    link_records = payload["link_audit_records"]
    link_summary = payload["link_audit_summary"]
    generated_at = utc_now()
    plan = {
        "schema_version": PLAN_SCHEMA_VERSION,
        "tool_version": TOOL_VERSION,
        "plan_id": str(uuid.uuid4()),
        "generated_at": generated_at,
        "database_path": str(db_path.resolve()),
        "audit_path": str(audit_path.resolve()),
        "audit_sha256": sha256_file(audit_path),
        "evidence_artifacts": evidence_summary,
        "rules_path": str(rules_path.resolve()),
        "rules_sha256": sha256_file(rules_path),
        "remote_status": {
            "path": str(remote_status_path.resolve()),
            "sha256": sha256_file(remote_status_path),
            "generated_at": remote_checked_at,
            "total_unique": int(remote_report["total_unique"]),
            "counts": remote_report.get("counts", {}),
        },
        "import_batches": batch_summary,
        "chunk_size": int(rules["chunk_size"]),
        "fingerprint_before": fingerprint,
        "database_full_fingerprint_before": database_full_fingerprint,
        "fingerprint_after": logical_fingerprint(transformed_docs, transformed_chunks),
        "maintenance_before": maintenance_before,
        "counts_before": {
            "documents": len(documents),
            "chunks": len(chunks),
            "metadata_rows": maintenance_before["metadata_rows"],
            "link_audit_rows": maintenance_before["link_audit_rows"],
        },
        "counts_after": {
            "documents": len(transformed_docs),
            "chunks": len(transformed_chunks),
            "metadata_rows": len(transformed_docs),
            "link_audit_rows": link_summary["rows"],
        },
        "metadata_records": metadata_records,
        "metadata_fingerprint_after": metadata_fingerprint(metadata_records),
        "link_audit_records": link_records,
        "link_audit_fingerprint_after": link_audit_fingerprint(link_records),
        "link_audit_summary": link_summary,
        "confirmed_404_evidence_urls": sorted(confirmed_404_urls),
        "action_counts": dict(Counter(item["action"] for item in actions)),
        "deletion_reason_counts": dict(
            Counter(
                str(item["reason_code"])
                for item in actions
                if item["action"] == "delete"
            )
        ),
        "actions": actions,
    }
    plan["plan_sha256"] = plan_digest(plan)
    atomic_write_json(output_path, plan)
    return plan


def list_codehelper_processes(db_path: Path, repo_root: Path | None = None) -> list[dict[str, Any]]:
    if os.name != "nt":
        return []
    command = (
        "$ErrorActionPreference = 'Stop'; "
        "$json = Get-CimInstance Win32_Process -ErrorAction Stop | "
        "Select-Object ProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress; "
        "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$json))"
    )
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            check=True,
            capture_output=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise MaintenanceError(f"Unable to verify CodeHelper process state: {exc}") from exc
    encoded = completed.stdout.strip()
    if not encoded:
        return []
    try:
        raw = base64.b64decode(encoded, validate=True).decode("utf-8")
        parsed = json.loads(raw) if raw else []
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MaintenanceError("Unable to parse Windows process inventory") from exc
    if parsed is None:
        raise MaintenanceError("Windows process inventory unexpectedly returned null")
    rows = parsed if isinstance(parsed, list) else [parsed]
    repo = str((repo_root or repository_root()).resolve()).casefold()
    user_data = str(db_path.resolve().parent).casefold()
    conflicts: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise MaintenanceError("Windows process inventory contains a non-object row")
        name = str(row.get("Name") or "").casefold()
        executable = str(row.get("ExecutablePath") or "").casefold()
        cmdline = str(row.get("CommandLine") or "").casefold()
        combined = f"{executable} {cmdline}"
        is_conflict = False
        if name == "codehelper.exe":
            is_conflict = True
        elif name == "electron.exe" and (repo in combined or user_data in combined):
            is_conflict = True
        elif name == "node.exe" and repo in combined and (
            "electron-vite" in combined or "electron" in combined
        ):
            is_conflict = True
        if is_conflict:
            conflicts.append(
                {
                    "pid": row.get("ProcessId"),
                    "name": row.get("Name"),
                    "executable": row.get("ExecutablePath"),
                    "command_line": row.get("CommandLine"),
                }
            )
    return conflicts


def assert_codehelper_closed(db_path: Path) -> None:
    if os.name != "nt":
        raise MaintenanceError(
            "Writable maintenance must run under Windows so the Electron process guard is enforceable"
        )
    conflicts = list_codehelper_processes(db_path)
    if conflicts:
        compact = [{"pid": item["pid"], "name": item["name"]} for item in conflicts]
        raise MaintenanceError(f"CodeHelper is still running: {compact}")


def safe_timestamp(iso_timestamp: str) -> str:
    return iso_timestamp.replace(":", "-").replace(".", "-")


def application_version() -> str:
    package = load_json(repository_root() / "package.json")
    version = package.get("version") if isinstance(package, dict) else None
    if not isinstance(version, str) or not version:
        raise MaintenanceError("Unable to read application version from package.json")
    return version


def verify_backup_manifest(manifest_path: Path) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise MaintenanceError("Backup manifest must be an object")
    required = {
        "manifestVersion",
        "id",
        "kind",
        "createdAt",
        "verifiedAt",
        "fileName",
        "sizeBytes",
        "sha256",
        "integrity",
        "quickCheck",
        "applicationVersion",
        "applicationSchemaVersion",
        "componentSchemaVersions",
        "maintenanceState",
        "sourceDatabasePath",
        "sourceDatabaseIdentity",
        "sourceDatabaseFullFingerprint",
        "backupDatabaseFullFingerprint",
        "planSha256",
    }
    if not required.issubset(manifest):
        raise MaintenanceError("Backup manifest is missing required app fields")
    if manifest["manifestVersion"] != DATABASE_BACKUP_MANIFEST_VERSION:
        raise MaintenanceError("Unsupported backup manifest version")
    if manifest["kind"] not in {"manual", "pre-import", "pre-migration"}:
        raise MaintenanceError("Invalid backup kind")
    if not isinstance(manifest["sourceDatabaseIdentity"], dict):
        raise MaintenanceError("Backup source database identity is invalid")
    if not isinstance(manifest["sourceDatabasePath"], str) or not Path(manifest["sourceDatabasePath"]).is_absolute():
        raise MaintenanceError("Backup source database path is invalid")
    if not isinstance(manifest["planSha256"], str) or len(manifest["planSha256"]) != 64:
        raise MaintenanceError("Backup plan SHA-256 is invalid")
    for field in ("sourceDatabaseFullFingerprint", "backupDatabaseFullFingerprint", "sha256"):
        if not isinstance(manifest.get(field), str) or not re.fullmatch(
            r"[0-9a-f]{64}", str(manifest[field])
        ):
            raise MaintenanceError(f"Backup manifest SHA-256 field is invalid: {field}")
    if manifest["integrity"] != "ok" or manifest["quickCheck"] != ["ok"]:
        raise MaintenanceError("Backup manifest does not report verified integrity")
    filename = manifest["fileName"]
    if not isinstance(filename, str) or Path(filename).name != filename or not filename.endswith(".db"):
        raise MaintenanceError("Invalid backup filename")
    backup_path = manifest_path.parent / filename
    if not backup_path.is_file() or backup_path.is_symlink():
        raise MaintenanceError("Backup database is missing or not a regular file")
    if backup_path.stat().st_size != manifest["sizeBytes"]:
        raise MaintenanceError("Backup size does not match manifest")
    if sha256_file(backup_path) != str(manifest["sha256"]).casefold():
        raise MaintenanceError("Backup SHA-256 does not match manifest")
    connection = connect_readonly(backup_path)
    try:
        checks = quick_check(connection)
        if not quick_check_ok(checks):
            raise MaintenanceError(f"Backup quick_check failed: {checks}")
        versions = read_component_schema_versions(connection)
        if versions != manifest["componentSchemaVersions"]:
            raise MaintenanceError("Backup component schema versions do not match manifest")
        if versions.get("application", 0) != manifest["applicationSchemaVersion"]:
            raise MaintenanceError("Backup application schema version does not match manifest")
        documents, chunks = read_knowledge_snapshot(connection)
        fingerprint = logical_fingerprint(documents, chunks)
        database_full_fingerprint = full_database_fingerprint(connection)
        maintenance_state = read_maintenance_state_from_connection(connection)
    finally:
        connection.close()
    if manifest.get("maintenanceState") != maintenance_state:
        raise MaintenanceError("Backup manifest maintenance state does not match backup")
    if manifest["backupDatabaseFullFingerprint"] != database_full_fingerprint:
        raise MaintenanceError("Backup full database fingerprint does not match manifest")
    if manifest["sourceDatabaseFullFingerprint"] != database_full_fingerprint:
        raise MaintenanceError("Backup is not a complete logical copy of its source snapshot")
    return {
        "manifest": manifest,
        "manifest_path": str(manifest_path.resolve()),
        "backup_path": str(backup_path.resolve()),
        "fingerprint": fingerprint,
        "database_full_fingerprint": database_full_fingerprint,
        "maintenance_state": maintenance_state,
    }


def create_backup(
    db_path: Path,
    plan_path: Path,
    backup_directory: Path,
    process_guard: Callable[[Path], None] = assert_codehelper_closed,
) -> dict[str, Any]:
    plan = load_plan(plan_path)
    if str(db_path.resolve()) != plan["database_path"]:
        raise MaintenanceError("Plan targets a different database")
    with acquire_process_lease(db_path, "maintenance"):
        return _create_backup_with_lease(
            db_path, plan_path, plan, backup_directory, process_guard
        )


def checkpoint_database_wal(db_path: Path) -> None:
    connection = connect_writable(db_path)
    try:
        result = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if result is not None and int(result[0]) != 0:
            raise MaintenanceError(f"Unable to checkpoint database WAL before backup: {tuple(result)}")
    finally:
        connection.close()


def _create_backup_with_lease(
    db_path: Path,
    plan_path: Path,
    plan: Mapping[str, Any],
    backup_directory: Path,
    process_guard: Callable[[Path], None],
) -> dict[str, Any]:
    process_guard(db_path)
    reauthorize_plan_against_database(plan, db_path)
    checkpoint_database_wal(db_path)
    process_guard(db_path)

    created_at = utc_now()
    backup_id = str(uuid.uuid4())
    backup_directory.mkdir(parents=True, exist_ok=True)
    filename = f"codehelper-manual-{safe_timestamp(created_at)}-{backup_id}.db"
    backup_path = backup_directory / filename
    manifest_path = backup_directory / f"{filename}.manifest.json"
    if backup_path.exists() or manifest_path.exists():
        raise MaintenanceError("Backup destination already exists")
    lock = connect_writable(db_path)
    try:
        lock.execute("BEGIN IMMEDIATE")
        authorization = reauthorize_plan_against_connection(plan, lock)
        backup_fingerprint = plan["fingerprint_before"]
        source_full_fingerprint = authorization["database_full_fingerprint"]
        locked_source_identity = database_file_state(db_path)

        vacuum_source = connect_writable(db_path)
        try:
            vacuum_source.execute("VACUUM INTO ?", (str(backup_path),))
        finally:
            vacuum_source.close()

        verification = connect_readonly(backup_path)
        try:
            checks = quick_check(verification)
            versions = read_component_schema_versions(verification)
            backup_docs, backup_chunks = read_knowledge_snapshot(verification)
            copied_knowledge_fingerprint = logical_fingerprint(backup_docs, backup_chunks)
            backup_full_fingerprint = full_database_fingerprint(verification)
            backup_maintenance = read_maintenance_state_from_connection(verification)
        finally:
            verification.close()
        if not quick_check_ok(checks):
            raise MaintenanceError(f"Backup quick_check failed: {checks}")
        if copied_knowledge_fingerprint != plan["fingerprint_before"]:
            raise MaintenanceError("Backup knowledge fingerprint does not match plan")
        if backup_full_fingerprint != source_full_fingerprint:
            raise MaintenanceError("Backup is not a complete logical copy of the locked source")
        assert_maintenance_state_matches(backup_maintenance, plan["maintenance_before"])
        reauthorize_plan_against_database(plan, backup_path)
        if database_file_state(db_path) != locked_source_identity:
            raise MaintenanceError("Database or WAL changed while the backup was created")
        lock.execute("ROLLBACK")
    except Exception:
        if lock.in_transaction:
            lock.execute("ROLLBACK")
        raise
    finally:
        lock.close()
    process_guard(db_path)
    if database_file_state(db_path) != locked_source_identity:
        raise MaintenanceError("Database or WAL changed after the locked backup")
    if live_full_database_fingerprint(db_path) != source_full_fingerprint:
        raise MaintenanceError("Full database changed immediately after the locked backup")
    if database_file_state(db_path) != locked_source_identity:
        raise MaintenanceError("Database or WAL changed while finalizing backup evidence")
    manifest = {
        "manifestVersion": DATABASE_BACKUP_MANIFEST_VERSION,
        "id": backup_id,
        "kind": "manual",
        "createdAt": created_at,
        "verifiedAt": utc_now(),
        "fileName": filename,
        "sizeBytes": backup_path.stat().st_size,
        "sha256": sha256_file(backup_path),
        "integrity": "ok",
        "quickCheck": checks,
        "applicationVersion": application_version(),
        "applicationSchemaVersion": versions.get("application", 0),
        "componentSchemaVersions": versions,
        "maintenanceState": backup_maintenance,
        "sourceDatabasePath": str(db_path.resolve()),
        "sourceDatabaseIdentity": locked_source_identity,
        "sourceDatabaseFullFingerprint": source_full_fingerprint,
        "backupDatabaseFullFingerprint": backup_full_fingerprint,
        "planSha256": plan["plan_sha256"],
    }
    atomic_write_json(manifest_path, manifest)
    verified = verify_backup_manifest(manifest_path)
    process_guard(db_path)
    proof = {
        "schema_version": 1,
        "created_at": utc_now(),
        "plan_sha256": plan["plan_sha256"],
        "database_fingerprint": backup_fingerprint,
        "database_full_fingerprint": source_full_fingerprint,
        "manifest_path": str(manifest_path.resolve()),
        "manifest_sha256": sha256_file(manifest_path),
        "backup_sha256": manifest["sha256"],
        "source_database_path": str(db_path.resolve()),
        "source_database_identity": locked_source_identity,
    }
    atomic_write_json(plan_path.parent / "backup-proof.json", proof)
    return verified


def ensure_maintenance_schema(connection: sqlite3.Connection) -> None:
    execute_sql_script_transactionally(connection,
        """
        CREATE TABLE IF NOT EXISTS knowledge_doc_metadata (
          doc_id INTEGER PRIMARY KEY REFERENCES knowledge_docs(id) ON DELETE CASCADE,
          display_title TEXT NOT NULL CHECK(length(trim(display_title)) > 0),
          source_repo TEXT,
          source_url TEXT,
          source_path TEXT,
          source_commit TEXT,
          category_key TEXT,
          category_label TEXT,
          tags_json TEXT NOT NULL DEFAULT '[]'
            CHECK(json_valid(tags_json) AND json_type(tags_json) = 'array'),
          import_target TEXT,
          generated_at TEXT,
          document_kind TEXT NOT NULL DEFAULT 'document'
            CHECK(length(trim(document_kind)) > 0),
          visibility TEXT NOT NULL DEFAULT 'local'
            CHECK(length(trim(visibility)) > 0),
          content_sha256 TEXT NOT NULL
            CHECK(length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_doc_metadata_category
          ON knowledge_doc_metadata(category_key, category_label, doc_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_doc_metadata_source
          ON knowledge_doc_metadata(source_repo, source_path, doc_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_doc_metadata_hash
          ON knowledge_doc_metadata(content_sha256, doc_id);

        CREATE TABLE IF NOT EXISTS knowledge_link_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
          line_number INTEGER NOT NULL CHECK(line_number >= 1),
          raw_target TEXT NOT NULL CHECK(length(trim(raw_target)) > 0),
          resolved_target TEXT,
          link_kind TEXT NOT NULL CHECK(length(trim(link_kind)) > 0),
          status TEXT NOT NULL DEFAULT 'unchecked'
            CHECK(status IN ('reachable','not_found','temporary_error','restricted','malformed','unresolved_relative','unchecked')),
          http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
          checked_at TEXT,
          detail TEXT,
          UNIQUE(doc_id, line_number, raw_target)
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_link_audit_doc
          ON knowledge_link_audit(doc_id, line_number, id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_link_audit_status
          ON knowledge_link_audit(status, checked_at, doc_id);

        CREATE TABLE IF NOT EXISTS knowledge_maintenance_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_key TEXT NOT NULL UNIQUE CHECK(length(trim(run_key)) > 0),
          plan_sha256 TEXT NOT NULL
            CHECK(length(plan_sha256) = 64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
          operation TEXT NOT NULL CHECK(length(trim(operation)) > 0),
          status TEXT NOT NULL DEFAULT 'running'
            CHECK(status IN ('running','committed')),
          backup_path TEXT,
          report_path TEXT,
          before_doc_count INTEGER CHECK(before_doc_count IS NULL OR before_doc_count >= 0),
          after_doc_count INTEGER CHECK(after_doc_count IS NULL OR after_doc_count >= 0),
          before_chunk_count INTEGER CHECK(before_chunk_count IS NULL OR before_chunk_count >= 0),
          after_chunk_count INTEGER CHECK(after_chunk_count IS NULL OR after_chunk_count >= 0),
          summary_json TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(summary_json) AND json_type(summary_json) = 'object'),
          notes TEXT,
          started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS knowledge_maintenance_actions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id INTEGER NOT NULL REFERENCES knowledge_maintenance_runs(id) ON DELETE CASCADE,
          action_id TEXT NOT NULL CHECK(length(trim(action_id)) > 0),
          action_type TEXT NOT NULL CHECK(length(trim(action_type)) > 0),
          doc_id INTEGER,
          keep_doc_id INTEGER,
          reason_code TEXT NOT NULL CHECK(length(trim(reason_code)) > 0),
          reason_detail TEXT,
          filename TEXT NOT NULL CHECK(length(trim(filename)) > 0),
          display_title TEXT,
          source_repo TEXT,
          source_url TEXT,
          source_path TEXT,
          source_commit TEXT,
          category_key TEXT,
          category_label TEXT,
          content_sha256 TEXT CHECK(content_sha256 IS NULL OR
            (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
          before_content_sha256 TEXT CHECK(before_content_sha256 IS NULL OR
            (length(before_content_sha256) = 64 AND before_content_sha256 NOT GLOB '*[^0-9a-f]*')),
          after_content_sha256 TEXT CHECK(after_content_sha256 IS NULL OR
            (length(after_content_sha256) = 64 AND after_content_sha256 NOT GLOB '*[^0-9a-f]*')),
          before_json TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(before_json) AND json_type(before_json) = 'object'),
          after_json TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(after_json) AND json_type(after_json) = 'object'),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(run_id, action_id)
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_runs_started
          ON knowledge_maintenance_runs(started_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_actions_run
          ON knowledge_maintenance_actions(run_id, id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_actions_doc
          ON knowledge_maintenance_actions(doc_id, id);
        """
    )
    metadata_required = {
        "doc_id",
        "display_title",
        "category_key",
        "category_label",
        "source_repo",
        "source_url",
        "source_path",
        "source_commit",
        "tags_json",
        "import_target",
        "generated_at",
        "document_kind",
        "visibility",
        "content_sha256",
        "updated_at",
    }
    run_required = {
        "id",
        "run_key",
        "plan_sha256",
        "before_doc_count",
        "after_doc_count",
        "before_chunk_count",
        "after_chunk_count",
        "summary_json",
    }
    action_required = {
        "run_id",
        "action_id",
        "action_type",
        "doc_id",
        "keep_doc_id",
        "reason_code",
        "filename",
        "before_content_sha256",
        "after_content_sha256",
        "before_json",
        "after_json",
        "created_at",
    }
    link_required = set(LINK_STORAGE_FIELDS) | {"id"}
    if not metadata_required.issubset(table_columns(connection, "knowledge_doc_metadata")):
        raise MaintenanceError("Existing knowledge_doc_metadata table is incompatible")
    if not link_required.issubset(table_columns(connection, "knowledge_link_audit")):
        raise MaintenanceError("Existing knowledge_link_audit table is incompatible")
    if not run_required.issubset(table_columns(connection, "knowledge_maintenance_runs")):
        raise MaintenanceError("Existing knowledge_maintenance_runs table is incompatible")
    if not action_required.issubset(table_columns(connection, "knowledge_maintenance_actions")):
        raise MaintenanceError("Existing knowledge_maintenance_actions table is incompatible")
    expected_fk = {
        "knowledge_doc_metadata": ("doc_id", "knowledge_docs", "id", "CASCADE"),
        "knowledge_link_audit": ("doc_id", "knowledge_docs", "id", "CASCADE"),
        "knowledge_maintenance_actions": ("run_id", "knowledge_maintenance_runs", "id", "CASCADE"),
    }
    for table, expected in expected_fk.items():
        foreign_keys = {
            (str(row[3]), str(row[2]), str(row[4]), str(row[6]).upper())
            for row in connection.execute(f"PRAGMA foreign_key_list({table})")
        }
        if foreign_keys != {expected}:
            raise MaintenanceError(f"Existing {table} foreign key is incompatible")

    def unique_columns(table: str) -> set[tuple[str, ...]]:
        result: set[tuple[str, ...]] = set()
        for index in connection.execute(f"PRAGMA index_list({table})"):
            if int(index[2]) != 1:
                continue
            result.add(tuple(str(row[2]) for row in connection.execute(
                f"PRAGMA index_info({str(index[1])})"
            )))
        return result

    for table, columns in (
        ("knowledge_link_audit", ("doc_id", "line_number", "raw_target")),
        ("knowledge_maintenance_runs", ("run_key",)),
        ("knowledge_maintenance_actions", ("run_id", "action_id")),
    ):
        if columns not in unique_columns(table):
            raise MaintenanceError(f"Existing {table} UNIQUE constraint is incompatible")
    link_sql_row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='knowledge_link_audit'"
    ).fetchone()
    normalized_sql = re.sub(r"\s+", "", str(link_sql_row[0]).casefold())
    for status in sorted(LINK_AUDIT_STATUSES):
        if f"'{status}'" not in normalized_sql:
            raise MaintenanceError("Existing knowledge_link_audit status CHECK is incompatible")
    run_sql_row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='knowledge_maintenance_runs'"
    ).fetchone()
    run_sql = re.sub(r"\s+", "", str(run_sql_row[0]).casefold())
    if "check(statusin('running','committed'))" not in run_sql:
        raise MaintenanceError("Existing knowledge_maintenance_runs status CHECK is incompatible")


def ensure_fts_schema(connection: sqlite3.Connection) -> None:
    execute_sql_script_transactionally(connection,
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
          content,
          content='knowledge_chunks',
          content_rowid='id',
          tokenize='unicode61 remove_diacritics 2'
        );
        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_ai AFTER INSERT ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.id, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_ad AFTER DELETE ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content)
          VALUES ('delete', old.id, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_au AFTER UPDATE OF content ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content)
          VALUES ('delete', old.id, old.content);
          INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.id, new.content);
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_trigram USING fts5(
          content,
          content='knowledge_chunks',
          content_rowid='id',
          tokenize='trigram'
        );
        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_trigram_ai AFTER INSERT ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_trigram(rowid, content) VALUES (new.id, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_trigram_ad AFTER DELETE ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram, rowid, content)
          VALUES ('delete', old.id, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_trigram_au AFTER UPDATE OF content ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram, rowid, content)
          VALUES ('delete', old.id, old.content);
          INSERT INTO knowledge_chunks_trigram(rowid, content) VALUES (new.id, new.content);
        END;
        """
    )
    existing = {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE name IN ("
            + ",".join("?" for _ in FTS_OBJECTS)
            + ")",
            tuple(sorted(FTS_OBJECTS)),
        )
    }
    if existing != FTS_OBJECTS:
        raise MaintenanceError(f"FTS schema is incomplete: {sorted(FTS_OBJECTS - existing)}")
    if table_exists(connection, "schema_migrations"):
        connection.execute(
            "INSERT INTO schema_migrations(component, version, updated_at) "
            "VALUES('knowledge-retrieval', 2, ?) "
            "ON CONFLICT(component) DO UPDATE SET version=2, updated_at=excluded.updated_at",
            (utc_now(),),
        )


def create_run(connection: sqlite3.Connection, plan: Mapping[str, Any], backup_path: str) -> int:
    result = connection.execute(
        """INSERT INTO knowledge_maintenance_runs(
          run_key, plan_sha256, operation, status, backup_path,
          before_doc_count, before_chunk_count, summary_json
        ) VALUES(?,?,?,?,?,?,?,?)""",
        (plan["plan_id"], plan["plan_sha256"], "knowledge-cleanup", "running",
         backup_path, plan["counts_before"]["documents"], plan["counts_before"]["chunks"], "{}"),
    )
    return int(result.lastrowid)


def insert_run_action(
    connection: sqlite3.Connection,
    run_id: int,
    action: Mapping[str, Any],
    created_at: str,
) -> None:
    metadata = action.get("metadata") or {}
    sources = action.get("sources") or {}
    connection.execute(
        """INSERT INTO knowledge_maintenance_actions(
          run_id, action_id, action_type, doc_id, keep_doc_id, reason_code,
          reason_detail, filename, display_title, source_repo, source_url,
          source_path, source_commit, category_key, category_label, content_sha256,
          before_content_sha256, after_content_sha256, before_json, after_json, created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (run_id, action["action_id"], action["action"], action.get("doc_id"),
         action.get("keep_doc_id"), action["reason_code"], action.get("reason_detail"),
         action["filename"], metadata.get("display_title"), sources.get("source_repo"),
         sources.get("source_url"), sources.get("source_path"), sources.get("source_commit"),
         metadata.get("category_key"), metadata.get("category_label"), metadata.get("content_sha256"),
         action.get("before_content_sha256"), action.get("after_content_sha256"),
         json.dumps(action.get("before", {}), ensure_ascii=False, sort_keys=True),
         json.dumps(action.get("after", {}), ensure_ascii=False, sort_keys=True), created_at),
    )


def expected_action_storage(
    action: Mapping[str, Any],
    *,
    run_id: int | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    metadata = action.get("metadata") or {}
    sources = action.get("sources") or {}
    expected = {
        "action_id": action["action_id"], "action_type": action["action"],
        "doc_id": action.get("doc_id"), "keep_doc_id": action.get("keep_doc_id"),
        "reason_code": action["reason_code"], "reason_detail": action.get("reason_detail"),
        "filename": action["filename"], "display_title": metadata.get("display_title"),
        "source_repo": sources.get("source_repo"), "source_url": sources.get("source_url"),
        "source_path": sources.get("source_path"), "source_commit": sources.get("source_commit"),
        "category_key": metadata.get("category_key"), "category_label": metadata.get("category_label"),
        "content_sha256": metadata.get("content_sha256"),
        "before_content_sha256": action.get("before_content_sha256"),
        "after_content_sha256": action.get("after_content_sha256"),
        "before_json": json.dumps(action.get("before", {}), ensure_ascii=False, sort_keys=True),
        "after_json": json.dumps(action.get("after", {}), ensure_ascii=False, sort_keys=True),
    }
    if run_id is not None:
        expected["run_id"] = run_id
    if created_at is not None:
        expected["created_at"] = created_at
    return expected


def expected_actions_by_id(
    actions: Sequence[Mapping[str, Any]],
    *,
    run_id: int | None = None,
    created_at: str | None = None,
) -> dict[str, dict[str, Any]]:
    return {
        str(action["action_id"]): expected_action_storage(
            action, run_id=run_id, created_at=created_at
        )
        for action in actions
    }


def action_snapshot_sha256(actions: Sequence[Mapping[str, Any]]) -> str:
    rows = [
        {"action_id": action_id, **snapshot}
        for action_id, snapshot in expected_actions_by_id(actions).items()
    ]
    return sha256_bytes(canonical_json_bytes(sorted(rows, key=lambda row: row["action_id"])))


def backup_summary_evidence(
    backup: Mapping[str, Any], manifest_path: Path
) -> dict[str, Any]:
    manifest = backup["manifest"]
    return {
        "backup_manifest_path": str(manifest_path.resolve()),
        "backup_manifest_sha256": sha256_file(manifest_path),
        "backup_path": str(backup["backup_path"]),
        "backup_sha256": str(manifest["sha256"]),
        "backup_source_database_path": str(manifest["sourceDatabasePath"]),
        "backup_source_database_identity": manifest["sourceDatabaseIdentity"],
        "backup_source_database_full_fingerprint": str(
            manifest["sourceDatabaseFullFingerprint"]
        ),
    }


def expected_run_summary(
    plan: Mapping[str, Any],
    backup: Mapping[str, Any],
    manifest_path: Path,
) -> dict[str, Any]:
    return {
        "quick_check": ["ok"],
        "foreign_key_check": [],
        "fingerprint": plan["fingerprint_after"],
        "documents": plan["counts_after"]["documents"],
        "chunks": plan["counts_after"]["chunks"],
        "metadata_rows": plan["counts_after"]["metadata_rows"],
        "link_audit_rows": plan["counts_after"]["link_audit_rows"],
        "action_counts": plan["action_counts"],
        "action_snapshot_sha256": action_snapshot_sha256(plan["actions"]),
        **backup_summary_evidence(backup, manifest_path),
    }


def sync_metadata_table(connection: sqlite3.Connection, records: Sequence[Mapping[str, Any]]) -> int:
    connection.execute("DELETE FROM knowledge_doc_metadata")
    now = utc_now()
    connection.executemany(
        """INSERT INTO knowledge_doc_metadata(
          doc_id, display_title, source_repo, source_url, source_path, source_commit,
          category_key, category_label, tags_json, import_target, generated_at,
          document_kind, visibility, content_sha256, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [tuple(metadata_storage_row(record)[field] for field in METADATA_STORAGE_FIELDS) + (now,)
         for record in records],
    )
    return len(records)


def sync_link_audit_table(connection: sqlite3.Connection, records: Sequence[Mapping[str, Any]]) -> int:
    connection.execute("DELETE FROM knowledge_link_audit")
    connection.executemany(
        "INSERT INTO knowledge_link_audit(" + ",".join(LINK_STORAGE_FIELDS) + ") VALUES(" +
        ",".join("?" for _ in LINK_STORAGE_FIELDS) + ")",
        [tuple(record.get(field) for field in LINK_STORAGE_FIELDS) for record in records],
    )
    return len(records)


def _apply_action(
    connection: sqlite3.Connection,
    action: Mapping[str, Any],
) -> None:
    row = connection.execute(
        "SELECT id, filename, content, chunk_count FROM knowledge_docs WHERE id=?",
        (action["doc_id"],),
    ).fetchone()
    if row is None:
        raise MaintenanceError(f"Document disappeared before apply: {action['doc_id']}")
    content = str(row["content"] or "")
    if sha256_text(content) != action["before_content_sha256"]:
        raise MaintenanceError(f"Before hash mismatch for document {action['doc_id']}")
    metadata, _, _, _, _ = split_frontmatter(content)
    if metadata_sources(metadata) != action["sources"]:
        raise MaintenanceError(f"Source tracking changed for document {action['doc_id']}")

    if action["action"] == "delete":
        connection.execute("DELETE FROM knowledge_chunks WHERE doc_id=?", (action["doc_id"],))
        result = connection.execute("DELETE FROM knowledge_docs WHERE id=?", (action["doc_id"],))
        if result.rowcount != 1:
            raise MaintenanceError(f"Delete count mismatch for document {action['doc_id']}")
    elif action["action"] == "upsert_metadata":
        if action.get("after_content_sha256") != action["before_content_sha256"]:
            raise MaintenanceError("Metadata-only action attempted to change document content")
    else:
        raise MaintenanceError(f"Unsupported action type: {action['action']}")


def verify_invariants_in_transaction(
    connection: sqlite3.Connection, plan: Mapping[str, Any]
) -> dict[str, Any]:
    documents, chunks = read_knowledge_snapshot(connection)
    if len(documents) != plan["counts_after"]["documents"]:
        raise MaintenanceError("Document count does not match plan")
    if len(chunks) != plan["counts_after"]["chunks"]:
        raise MaintenanceError("Chunk count does not match plan")
    actual_by_doc = Counter(int(chunk["doc_id"]) for chunk in chunks)
    for document in documents:
        doc_id = int(document["id"])
        if int(document.get("chunk_count") or 0) != actual_by_doc[doc_id]:
            raise MaintenanceError(f"chunk_count mismatch for document {doc_id}")
        actual = [
            str(chunk.get("content") or "")
            for chunk in chunks
            if int(chunk["doc_id"]) == doc_id
        ]
        if actual != split_into_chunks(str(document.get("content") or ""), int(plan["chunk_size"])):
            raise MaintenanceError(f"Chunk parity mismatch for document {doc_id}")
    foreign_keys = list(connection.execute("PRAGMA foreign_key_check"))
    if foreign_keys:
        raise MaintenanceError(f"foreign_key_check failed: {foreign_keys[:10]}")
    checks = quick_check(connection)
    if not quick_check_ok(checks):
        raise MaintenanceError(f"quick_check failed during apply: {checks}")
    fingerprint = logical_fingerprint(documents, chunks)
    if fingerprint != plan["fingerprint_after"]:
        raise MaintenanceError("Post-apply fingerprint does not match plan")
    metadata_count = connection.execute(
        "SELECT COUNT(*) FROM knowledge_doc_metadata"
    ).fetchone()[0]
    if metadata_count != plan["counts_after"]["metadata_rows"]:
        raise MaintenanceError("Metadata row count does not match plan")
    maintenance = read_maintenance_state_from_connection(connection)
    if maintenance["metadata_fingerprint"] != plan["metadata_fingerprint_after"]:
        raise MaintenanceError("Metadata fingerprint does not match plan")
    if maintenance["link_audit_rows"] != plan["counts_after"]["link_audit_rows"]:
        raise MaintenanceError("Link audit row count does not match plan")
    if maintenance["link_audit_fingerprint"] != plan["link_audit_fingerprint_after"]:
        raise MaintenanceError("Link audit fingerprint does not match plan")
    return {
        "quick_check": checks,
        "foreign_key_check": [],
        "fingerprint": fingerprint,
        "documents": len(documents),
        "chunks": len(chunks),
        "metadata_rows": metadata_count,
        "link_audit_rows": maintenance["link_audit_rows"],
    }


def audit_run_present(connection: sqlite3.Connection, plan: Mapping[str, Any]) -> bool:
    if not table_exists(connection, "knowledge_maintenance_runs"):
        return False
    row = connection.execute(
        "SELECT 1 FROM knowledge_maintenance_runs WHERE run_key=? AND plan_sha256=? AND status='committed'",
        (plan["plan_id"], plan["plan_sha256"]),
    ).fetchone()
    return row is not None


def committed_run_is_exact(
    connection: sqlite3.Connection,
    plan: Mapping[str, Any],
    backup: Mapping[str, Any] | None = None,
    backup_manifest_path: Path | None = None,
) -> bool:
    if not audit_run_present(connection, plan):
        return False
    row = connection.execute(
        "SELECT * FROM knowledge_maintenance_runs WHERE run_key=? AND plan_sha256=? AND status='committed'",
        (plan["plan_id"], plan["plan_sha256"]),
    ).fetchone()
    if row is None:
        return False
    expected_run = {
        "run_key": plan["plan_id"],
        "plan_sha256": plan["plan_sha256"],
        "operation": "knowledge-cleanup",
        "status": "committed",
        "before_doc_count": plan["counts_before"]["documents"],
        "after_doc_count": plan["counts_after"]["documents"],
        "before_chunk_count": plan["counts_before"]["chunks"],
        "after_chunk_count": plan["counts_after"]["chunks"],
    }
    if any(row[field] != expected for field, expected in expected_run.items()):
        return False
    if not row["completed_at"]:
        return False
    action_rows = list(
        connection.execute(
            "SELECT * FROM knowledge_maintenance_actions WHERE run_id=? ORDER BY id",
            (int(row["id"]),),
        )
    )
    # SQLite assigns surrogate ids; they are not plan-deterministic, so require only
    # positive uniqueness while every semantic/generated field is compared exactly.
    row_ids = [int(action["id"]) for action in action_rows]
    if len(row_ids) != len(set(row_ids)) or any(value <= 0 for value in row_ids):
        return False
    expected_actions = expected_actions_by_id(
        plan["actions"], run_id=int(row["id"]), created_at=str(plan["generated_at"])
    )
    action_fields = tuple(expected_actions[next(iter(expected_actions))].keys()) if expected_actions else ()
    actual_actions = {
        str(action["action_id"]): {field: action[field] for field in action_fields}
        for action in action_rows
    }
    if actual_actions != expected_actions:
        return False
    try:
        summary = json.loads(str(row["summary_json"]))
    except (TypeError, json.JSONDecodeError):
        return False
    if backup is None or backup_manifest_path is None:
        return False
    if row["backup_path"] != backup["backup_path"]:
        return False
    return summary == expected_run_summary(plan, backup, backup_manifest_path)


def apply_plan(
    db_path: Path,
    plan_path: Path,
    backup_manifest_path: Path,
    yes: bool,
    process_guard: Callable[[Path], None] = assert_codehelper_closed,
    fail_after_actions: int | None = None,
) -> dict[str, Any]:
    if not yes:
        raise MaintenanceError("apply requires --yes")
    plan = load_plan(plan_path)
    if str(db_path.resolve()) != plan["database_path"]:
        raise MaintenanceError("Plan targets a different database")
    backup = verify_backup_manifest(backup_manifest_path)
    if backup["fingerprint"] != plan["fingerprint_before"]:
        raise MaintenanceError("Verified backup does not match plan fingerprint")
    if backup["database_full_fingerprint"] != plan["database_full_fingerprint_before"]:
        raise MaintenanceError("Verified backup does not match the plan's full database state")
    assert_maintenance_state_matches(backup["maintenance_state"], plan["maintenance_before"])
    if backup["manifest"].get("sourceDatabasePath") != str(db_path.resolve()):
        raise MaintenanceError("Backup was created from a different source database")
    if backup["manifest"].get("planSha256") != plan["plan_sha256"]:
        raise MaintenanceError("Backup was created for a different maintenance plan")
    with acquire_process_lease(db_path, "maintenance"):
        return _apply_plan_with_lease(
            db_path,
            plan_path,
            plan,
            backup_manifest_path,
            backup,
            process_guard,
            fail_after_actions,
        )


def _apply_plan_with_lease(
    db_path: Path,
    plan_path: Path,
    plan: Mapping[str, Any],
    backup_manifest_path: Path,
    backup: Mapping[str, Any],
    process_guard: Callable[[Path], None],
    fail_after_actions: int | None,
) -> dict[str, Any]:
    process_guard(db_path)
    reauthorize_plan_against_database(plan, Path(str(backup["backup_path"])))
    connection = connect_writable(db_path)
    journal_path = plan_path.parent / "apply-journal.jsonl"
    apply_attempt_id = str(uuid.uuid4())
    action_counter = 0
    try:
        connection.execute("BEGIN IMMEDIATE")
        documents, chunks = read_knowledge_snapshot(connection)
        current_fingerprint = logical_fingerprint(documents, chunks)
        if current_fingerprint == plan["fingerprint_after"] and audit_run_present(connection, plan):
            state = read_maintenance_state_from_connection(connection)
            if (
                committed_run_is_exact(
                    connection, plan, backup=backup,
                    backup_manifest_path=backup_manifest_path,
                )
                and state["metadata_fingerprint"] == plan["metadata_fingerprint_after"]
                and state["link_audit_fingerprint"] == plan["link_audit_fingerprint_after"]
            ):
                connection.execute("ROLLBACK")
                return {"status": "already-applied", "fingerprint": current_fingerprint}
            raise MaintenanceError("Post-apply database has an incomplete or tampered action journal")
        if (
            current_fingerprint == plan["fingerprint_after"]
            and current_fingerprint != plan["fingerprint_before"]
        ):
            raise MaintenanceError("Post-apply fingerprint exists without a committed maintenance run")
        if backup["manifest"].get("sourceDatabaseIdentity") != database_file_state(db_path):
            raise MaintenanceError("Source database or WAL identity changed after backup")
        current_full_fingerprint = full_database_fingerprint(connection)
        if current_full_fingerprint != plan["database_full_fingerprint_before"]:
            raise MaintenanceError("Full database state no longer matches the plan and backup")
        if current_fingerprint != plan["fingerprint_before"]:
            raise MaintenanceError("Database changed before transactional apply")
        reauthorize_plan_against_connection(plan, connection)
        process_guard(db_path)
        if backup["manifest"].get("sourceDatabaseIdentity") != database_file_state(db_path):
            raise MaintenanceError("Source database or WAL changed immediately before mutation")
        append_jsonl(
            journal_path,
            {
                "event": "started",
                "transaction_state": "pending",
                "apply_attempt_id": apply_attempt_id,
                "at": utc_now(),
                "plan_id": plan["plan_id"],
                "plan_sha256": plan["plan_sha256"],
                "backup_manifest": str(backup_manifest_path.resolve()),
                "backup_manifest_sha256": sha256_file(backup_manifest_path),
                "source_database_full_fingerprint": current_full_fingerprint,
            },
        )
        ensure_maintenance_schema(connection)
        ensure_fts_schema(connection)
        connection.execute("INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts) VALUES('rebuild')")
        connection.execute("INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram) VALUES('rebuild')")
        run_id = create_run(connection, plan, backup["backup_path"])
        batch_size = 100
        actions = list(plan["actions"])
        for batch_start in range(0, len(actions), batch_size):
            savepoint = f"knowledge_batch_{batch_start // batch_size}"
            connection.execute(f"SAVEPOINT {savepoint}")
            try:
                for action in actions[batch_start : batch_start + batch_size]:
                    _apply_action(connection, action)
                    insert_run_action(
                        connection, run_id, action, str(plan["generated_at"])
                    )
                    action_counter += 1
                    append_jsonl(
                        journal_path,
                        {
                            "event": "action-pending",
                            "transaction_state": "pending-not-committed",
                            "apply_attempt_id": apply_attempt_id,
                            "at": utc_now(),
                            "plan_id": plan["plan_id"],
                            "action_id": action["action_id"],
                            "action": action["action"],
                            "doc_id": action["doc_id"],
                            "reason_code": action["reason_code"],
                            "sources": action["sources"],
                        },
                    )
                    if fail_after_actions is not None and action_counter >= fail_after_actions:
                        raise MaintenanceError("Injected apply failure")
                connection.execute(f"RELEASE SAVEPOINT {savepoint}")
            except Exception:
                connection.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
                connection.execute(f"RELEASE SAVEPOINT {savepoint}")
                raise

        metadata_rows = sync_metadata_table(connection, plan["metadata_records"])
        if metadata_rows != plan["counts_after"]["metadata_rows"]:
            raise MaintenanceError("Metadata synchronization count mismatch")
        link_rows = sync_link_audit_table(connection, plan["link_audit_records"])
        if link_rows != plan["counts_after"]["link_audit_rows"]:
            raise MaintenanceError("Link audit synchronization count mismatch")
        connection.execute(
            "INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts) VALUES('rebuild')"
        )
        connection.execute(
            "INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram) VALUES('rebuild')"
        )
        connection.execute(
            "INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts) VALUES('integrity-check')"
        )
        connection.execute(
            "INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram) VALUES('integrity-check')"
        )
        verification = verify_invariants_in_transaction(connection, plan)
        summary = expected_run_summary(plan, backup, backup_manifest_path)
        summary_json = json.dumps(summary, ensure_ascii=False, sort_keys=True)
        connection.execute(
            """UPDATE knowledge_maintenance_runs SET status='committed',
              after_doc_count=?, after_chunk_count=?, summary_json=?, completed_at=? WHERE id=?""",
            (verification["documents"], verification["chunks"], summary_json, utc_now(), run_id),
        )
        connection.commit()
    except Exception as exc:
        connection.rollback()
        append_jsonl(
            journal_path,
            {
                "event": "aborted",
                "transaction_state": "rolled-back",
                "apply_attempt_id": apply_attempt_id,
                "at": utc_now(),
                "plan_id": plan["plan_id"],
                "actions_attempted": action_counter,
                "error": str(exc),
            },
        )
        raise
    finally:
        connection.close()

    append_jsonl(
        journal_path,
        {
            "event": "committed",
            "transaction_state": "committed",
            "apply_attempt_id": apply_attempt_id,
            "at": utc_now(),
            "plan_id": plan["plan_id"],
            "actions_committed": action_counter,
            "fingerprint": verification["fingerprint"],
        },
    )
    return {"status": "committed", **verification}


def fts_smoke(connection: sqlite3.Connection) -> dict[str, Any]:
    objects = {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE name IN ("
            + ",".join("?" for _ in FTS_OBJECTS)
            + ")",
            tuple(sorted(FTS_OBJECTS)),
        )
    }
    if objects != FTS_OBJECTS:
        raise MaintenanceError(f"FTS objects are missing: {sorted(FTS_OBJECTS - objects)}")
    sample = connection.execute(
        "SELECT content FROM knowledge_chunks WHERE length(content) >= 3 ORDER BY id LIMIT 100"
    ).fetchall()
    token = None
    for row in sample:
        match = re.search(r"[A-Za-z0-9]{3,}", str(row[0]))
        if match:
            token = match.group(0)
            break
    if token is None:
        return {"objects": len(objects), "token": None, "keyword_hits": None, "trigram_hits": None}
    query = '"' + token.replace('"', '""') + '"'
    keyword_hits = connection.execute(
        "SELECT COUNT(*) FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH ?",
        (query,),
    ).fetchone()[0]
    trigram_hits = connection.execute(
        "SELECT COUNT(*) FROM knowledge_chunks_trigram WHERE knowledge_chunks_trigram MATCH ?",
        (query,),
    ).fetchone()[0]
    if keyword_hits < 1 or trigram_hits < 1:
        raise MaintenanceError("FTS MATCH smoke test returned no hits")
    return {
        "objects": len(objects),
        "token": token,
        "keyword_hits": keyword_hits,
        "trigram_hits": trigram_hits,
    }


def verify_applied_plan(
    db_path: Path, plan_path: Path, output_path: Path
) -> dict[str, Any]:
    plan = load_plan(plan_path)
    if str(db_path.resolve()) != plan["database_path"]:
        raise MaintenanceError("Plan targets a different database")
    connection = connect_readonly(db_path)
    try:
        connection.execute("BEGIN")
        checks = quick_check(connection)
        if not quick_check_ok(checks):
            raise MaintenanceError(f"Database quick_check failed: {checks}")
        documents, chunks = read_knowledge_snapshot(connection)
        fingerprint = logical_fingerprint(documents, chunks)
        if fingerprint != plan["fingerprint_after"]:
            raise MaintenanceError("Database does not match expected post-apply fingerprint")
        if len(documents) != plan["counts_after"]["documents"] or len(chunks) != plan["counts_after"]["chunks"]:
            raise MaintenanceError("Post-apply counts do not match plan")
        actual_by_doc = Counter(int(chunk["doc_id"]) for chunk in chunks)
        for document in documents:
            doc_id = int(document["id"])
            if int(document.get("chunk_count") or 0) != actual_by_doc[doc_id]:
                raise MaintenanceError(f"chunk_count mismatch for {doc_id}")
            actual = [
                str(chunk.get("content") or "")
                for chunk in chunks
                if int(chunk["doc_id"]) == doc_id
            ]
            if actual != split_into_chunks(str(document.get("content") or ""), int(plan["chunk_size"])):
                raise MaintenanceError(f"Chunk parity mismatch for {doc_id}")
        if not all(table_exists(connection, name) for name in (
            "knowledge_doc_metadata", "knowledge_link_audit",
            "knowledge_maintenance_runs", "knowledge_maintenance_actions"
        )):
            raise MaintenanceError("Maintenance metadata/audit tables are missing")
        metadata_count = connection.execute(
            "SELECT COUNT(*) FROM knowledge_doc_metadata"
        ).fetchone()[0]
        if metadata_count != plan["counts_after"]["metadata_rows"]:
            raise MaintenanceError("Metadata row count does not match plan")
        maintenance = read_maintenance_state_from_connection(connection)
        if maintenance["metadata_fingerprint"] != plan["metadata_fingerprint_after"]:
            raise MaintenanceError("Metadata fingerprint does not match plan")
        if maintenance["link_audit_rows"] != plan["counts_after"]["link_audit_rows"]:
            raise MaintenanceError("Link audit row count does not match plan")
        if maintenance["link_audit_fingerprint"] != plan["link_audit_fingerprint_after"]:
            raise MaintenanceError("Link audit fingerprint does not match plan")
        run = connection.execute(
            "SELECT * FROM knowledge_maintenance_runs "
            "WHERE run_key=? AND plan_sha256=? AND status='committed'",
            (plan["plan_id"], plan["plan_sha256"]),
        ).fetchone()
        if run is None:
            raise MaintenanceError("Committed maintenance run is missing")
        expected_run = {
            "run_key": plan["plan_id"], "plan_sha256": plan["plan_sha256"],
            "operation": "knowledge-cleanup", "status": "committed",
            "before_doc_count": plan["counts_before"]["documents"],
            "after_doc_count": plan["counts_after"]["documents"],
            "before_chunk_count": plan["counts_before"]["chunks"],
            "after_chunk_count": plan["counts_after"]["chunks"],
        }
        for field, expected in expected_run.items():
            if run[field] != expected:
                raise MaintenanceError(f"Maintenance run field mismatch: {field}")
        if not run["backup_path"] or not run["completed_at"]:
            raise MaintenanceError("Maintenance run backup/completion evidence is missing")
        action_rows = list(
            connection.execute(
                "SELECT * FROM knowledge_maintenance_actions WHERE run_id=? ORDER BY id",
                (int(run["id"]),),
            )
        )
        # Surrogate ids are allocation details; all other stored fields are deterministic.
        action_row_ids = [int(action["id"]) for action in action_rows]
        if (
            len(action_row_ids) != len(set(action_row_ids))
            or any(value <= 0 for value in action_row_ids)
        ):
            raise MaintenanceError("Maintenance action surrogate ids are invalid")
        expected_actions = expected_actions_by_id(
            plan["actions"], run_id=int(run["id"]), created_at=str(plan["generated_at"])
        )
        action_fields = tuple(expected_actions[next(iter(expected_actions))].keys()) if expected_actions else ()
        actual_actions = {
            str(action["action_id"]): {field: action[field] for field in action_fields}
            for action in action_rows
        }
        if actual_actions != expected_actions:
            raise MaintenanceError("Maintenance action snapshots do not match plan")
        summary_details = json.loads(str(run["summary_json"]))
        if not isinstance(summary_details, dict):
            raise MaintenanceError("Maintenance run summary must be an object")
        manifest_value = summary_details.get("backup_manifest_path")
        if not isinstance(manifest_value, str) or not Path(manifest_value).is_absolute():
            raise MaintenanceError("Maintenance run backup manifest path is invalid")
        manifest_path = Path(manifest_value)
        if (
            not manifest_path.is_file()
            or manifest_path.is_symlink()
            or sha256_file(manifest_path) != summary_details.get("backup_manifest_sha256")
        ):
            raise MaintenanceError("Maintenance run backup manifest was replaced or corrupted")
        backup = verify_backup_manifest(manifest_path)
        reauthorize_plan_against_database(plan, Path(str(backup["backup_path"])))
        if summary_details != expected_run_summary(plan, backup, manifest_path):
            raise MaintenanceError("Maintenance run summary does not exactly match the plan")
        if run["backup_path"] != backup["backup_path"]:
            raise MaintenanceError("Maintenance run backup path does not match its manifest")
        manifest = backup["manifest"]
        if (
            manifest.get("planSha256") != plan["plan_sha256"]
            or manifest.get("sourceDatabasePath") != str(db_path.resolve())
            or manifest.get("sourceDatabaseFullFingerprint")
            != plan["database_full_fingerprint_before"]
        ):
            raise MaintenanceError("Maintenance backup is not bound to this plan and source")
        foreign_keys = list(connection.execute("PRAGMA foreign_key_check"))
        if foreign_keys:
            raise MaintenanceError(f"foreign_key_check failed: {foreign_keys[:10]}")
        fts = fts_smoke(connection)
        connection.execute("ROLLBACK")
    finally:
        connection.close()

    report = {
        "schema_version": 1,
        "tool_version": TOOL_VERSION,
        "verified_at": utc_now(),
        "database_path": str(db_path.resolve()),
        "plan_sha256": plan["plan_sha256"],
        "fingerprint": fingerprint,
        "quick_check": checks,
        "foreign_key_check": [],
        "counts": {
            "documents": len(documents),
            "chunks": len(chunks),
            "metadata_rows": metadata_count,
            "link_audit_rows": maintenance["link_audit_rows"],
        },
        "fts": fts,
        "status": "verified",
    }
    atomic_write_json(output_path, report)
    return report


def resolve_output_path(
    explicit: str | None, default_directory: Path, default_name: str
) -> Path:
    if explicit:
        return Path(explicit)
    return default_directory / default_name


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    audit = subcommands.add_parser("audit", help="Run a consistent read-only audit")
    audit.add_argument("--db", default=None)
    audit.add_argument("--import-batches", default=str(default_import_batches_path()))
    audit.add_argument("--rules", default=str(default_rules_path()))
    audit.add_argument("--output")

    dry_run = subcommands.add_parser("dry-run", help="Create an immutable mutation plan")
    dry_run.add_argument("--db", default=None)
    dry_run.add_argument("--audit", required=True)
    dry_run.add_argument("--import-batches", default=str(default_import_batches_path()))
    dry_run.add_argument("--rules", default=str(default_rules_path()))
    dry_run.add_argument("--remote-status", required=True)
    dry_run.add_argument("--output")

    backup = subcommands.add_parser("backup", help="Create an app-compatible verified backup")
    backup.add_argument("--db", default=None)
    backup.add_argument("--plan", required=True)
    backup.add_argument("--backup-directory")

    apply = subcommands.add_parser("apply", help="Apply a verified plan transactionally")
    apply.add_argument("--db", default=None)
    apply.add_argument("--plan", required=True)
    apply.add_argument("--backup-manifest", required=True)
    apply.add_argument("--yes", action="store_true")

    verify = subcommands.add_parser("verify", help="Verify an applied plan read-only")
    verify.add_argument("--db", default=None)
    verify.add_argument("--plan", required=True)
    verify.add_argument("--output")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    db_path = Path(args.db) if args.db else default_database_path()
    try:
        if args.command == "audit":
            run_id = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
            run_dir = default_maintenance_directory(db_path) / run_id
            output = resolve_output_path(args.output, run_dir, "audit.json")
            result = run_audit(
                db_path,
                Path(args.import_batches),
                Path(args.rules),
                output,
            )
            summary = {
                "status": "audited",
                "output": str(output.resolve()),
                "fingerprint": result["fingerprint"],
                "totals": result["totals"],
                "duplicate_groups": len(result["duplicate_groups"]),
            }
        elif args.command == "dry-run":
            audit_path = Path(args.audit)
            output = resolve_output_path(args.output, audit_path.parent, "plan.json")
            result = run_dry_run(
                db_path,
                audit_path,
                Path(args.import_batches),
                Path(args.rules),
                Path(args.remote_status),
                output,
            )
            summary = {
                "status": "planned",
                "output": str(output.resolve()),
                "plan_sha256": result["plan_sha256"],
                "action_counts": result["action_counts"],
                "counts_after": result["counts_after"],
            }
        elif args.command == "backup":
            backup_directory = (
                Path(args.backup_directory)
                if args.backup_directory
                else default_backup_directory(db_path)
            )
            result = create_backup(db_path, Path(args.plan), backup_directory)
            summary = {"status": "backed-up", **result}
        elif args.command == "apply":
            summary = apply_plan(
                db_path,
                Path(args.plan),
                Path(args.backup_manifest),
                args.yes,
            )
        elif args.command == "verify":
            plan_path = Path(args.plan)
            output = resolve_output_path(args.output, plan_path.parent, "verify.json")
            result = verify_applied_plan(db_path, plan_path, output)
            summary = {**result, "output": str(output.resolve())}
        else:  # pragma: no cover
            raise MaintenanceError(f"Unknown command: {args.command}")
    except MaintenanceError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
