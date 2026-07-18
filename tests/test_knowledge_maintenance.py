import importlib.util
import base64
import json
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from contextlib import closing, contextmanager
from pathlib import Path
from unittest import mock


try:
    import yaml as _yaml  # noqa: F401
except ModuleNotFoundError:
    yaml_stub = types.ModuleType("yaml")
    yaml_stub.YAMLError = ValueError
    yaml_stub.safe_load = lambda value: {
        line.split(":", 1)[0].strip(): line.split(":", 1)[1].strip()
        for line in value.splitlines() if ":" in line
    }
    sys.modules["yaml"] = yaml_stub


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "knowledge_maintenance.py"
SPEC = importlib.util.spec_from_file_location("knowledge_maintenance", MODULE_PATH)
km = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(km)


class KnowledgeMaintenanceApplyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "test.db"
        self.rules = self.root / "rules.json"
        self.rules.write_text("{}\n", encoding="utf-8")
        self.evidence_artifacts = {}
        self.mock_backup = None
        for name in km.EVIDENCE_ARTIFACT_NAMES:
            path = self.root / f"{name}.json"
            km.atomic_write_json(path, {})
            self.evidence_artifacts[name] = {
                "path": str(path.resolve()),
                "sha256": km.sha256_file(path),
            }
        connection = sqlite3.connect(self.db)
        connection.executescript(
            """
            CREATE TABLE knowledge_docs(
              id INTEGER PRIMARY KEY, filename TEXT NOT NULL, file_type TEXT,
              content TEXT, chunk_count INTEGER DEFAULT 0, created_at TEXT
            );
            CREATE TABLE knowledge_chunks(
              id INTEGER PRIMARY KEY, doc_id INTEGER REFERENCES knowledge_docs(id) ON DELETE CASCADE,
              content TEXT NOT NULL, embedding TEXT, chunk_index INTEGER, created_at TEXT
            );
            """
        )
        self.content = "---\ntitle: Example\n---\n# Example\n\nBody"
        connection.execute(
            "INSERT INTO knowledge_docs VALUES(1,'example.md','md',?,1,'now')",
            (self.content,),
        )
        connection.execute(
            "INSERT INTO knowledge_chunks VALUES(1,1,?,NULL,0,'now')", (self.content,)
        )
        connection.commit()
        connection.close()

    def tearDown(self):
        self.temp.cleanup()

    @contextmanager
    def trust_internal_plan(self, plan):
        authorization = {
            "database_full_fingerprint": plan["database_full_fingerprint_before"],
        }
        with (
            mock.patch.object(
                km, "reauthorize_plan_against_database", return_value=authorization
            ),
            mock.patch.object(
                km, "reauthorize_plan_against_connection", return_value=authorization
            ),
        ):
            yield

    def make_plan(self):
        documents, chunks, fingerprint = km.live_snapshot(self.db)
        database_full_fingerprint = km.live_full_database_fingerprint(self.db)
        maintenance = km.live_maintenance_state(self.db)
        metadata = {
            "doc_id": 1, "display_title": "Example", "source_repo": None,
            "source_url": None, "source_path": None, "source_commit": None,
            "category_key": "core", "category_label": "Core", "tags": [],
            "import_target": None, "generated_at": None, "document_kind": "markdown",
            "visibility": "local", "content_sha256": km.sha256_text(self.content),
        }
        action = {
            "action": "upsert_metadata", "doc_id": 1, "filename": "example.md",
            "reason_code": "canonical-import-batch-category", "reason_detail": "test",
            "keep_doc_id": None, "sources": {field: None for field in km.SOURCE_FIELDS},
            "before_content_sha256": km.sha256_text(self.content),
            "after_content_sha256": km.sha256_text(self.content), "metadata": metadata,
            "before": {}, "after": km.metadata_storage_row(metadata),
        }
        action["action_id"] = km.action_id(action)
        plan = {
            "schema_version": km.PLAN_SCHEMA_VERSION, "tool_version": km.TOOL_VERSION,
            "plan_id": "test-run", "generated_at": "2026-07-18T00:00:00.000Z",
            "database_path": str(self.db.resolve()),
            "rules_path": str(self.rules.resolve()), "rules_sha256": km.sha256_file(self.rules),
            "chunk_size": 1500, "fingerprint_before": fingerprint,
            "database_full_fingerprint_before": database_full_fingerprint,
            "fingerprint_after": fingerprint, "maintenance_before": maintenance,
            "evidence_artifacts": self.evidence_artifacts,
            "counts_before": {"documents": 1, "chunks": 1, "metadata_rows": 0, "link_audit_rows": 0},
            "counts_after": {"documents": 1, "chunks": 1, "metadata_rows": 1, "link_audit_rows": 0},
            "metadata_records": [metadata], "metadata_fingerprint_after": km.metadata_fingerprint([metadata]),
            "link_audit_records": [], "link_audit_fingerprint_after": km.link_audit_fingerprint([]),
            "action_counts": {"upsert_metadata": 1}, "actions": [action],
        }
        plan["plan_sha256"] = km.plan_digest(plan)
        path = self.root / "plan.json"
        km.atomic_write_json(path, plan)
        return path, plan

    def apply(self, plan_path, plan, fail_after_actions=None):
        manifest_path = self.root / "manifest.json"
        if self.mock_backup is None:
            backup_path = self.root / "backup.db"
            backup_path.write_bytes(b"test backup evidence")
            km.atomic_write_json(manifest_path, {"test": True})
            self.mock_backup = {"fingerprint": plan["fingerprint_before"],
                      "database_full_fingerprint": plan["database_full_fingerprint_before"],
                      "maintenance_state": plan["maintenance_before"],
                      "backup_path": str(backup_path.resolve()),
                      "manifest": {"sourceDatabasePath": str(self.db.resolve()),
                                   "sourceDatabaseIdentity": km.database_file_state(self.db),
                                   "sourceDatabaseFullFingerprint": plan["database_full_fingerprint_before"],
                                   "sha256": km.sha256_file(backup_path),
                                   "planSha256": plan["plan_sha256"]}}
        with (
            mock.patch.object(km, "verify_backup_manifest", return_value=self.mock_backup),
            self.trust_internal_plan(plan),
        ):
            return km.apply_plan(
                self.db, plan_path, manifest_path, True,
                process_guard=lambda _: None, fail_after_actions=fail_after_actions,
            )

    def test_apply_is_metadata_only_and_idempotent(self):
        plan_path, plan = self.make_plan()
        result = self.apply(plan_path, plan)
        self.assertEqual(result["status"], "committed")
        self.assertEqual(km.live_snapshot(self.db)[2], plan["fingerprint_after"])
        self.assertEqual(self.apply(plan_path, plan)["status"], "already-applied")

    def test_injected_failure_rolls_back_actions_and_metadata(self):
        plan_path, plan = self.make_plan()
        with self.assertRaises(km.MaintenanceError):
            self.apply(plan_path, plan, fail_after_actions=1)
        state = km.live_maintenance_state(self.db)
        self.assertEqual(state["metadata_rows"], 0)
        self.assertEqual(state["maintenance_run_rows"], 0)
        connection = sqlite3.connect(self.db)
        self.assertIsNone(connection.execute(
            "SELECT 1 FROM sqlite_master WHERE name='knowledge_doc_metadata'"
        ).fetchone())
        self.assertIsNone(connection.execute(
            "SELECT 1 FROM sqlite_master WHERE name='knowledge_chunks_fts'"
        ).fetchone())
        connection.close()

    def test_corrupted_action_journal_is_not_idempotent(self):
        plan_path, plan = self.make_plan()
        self.apply(plan_path, plan)
        connection = sqlite3.connect(self.db)
        connection.execute("DELETE FROM knowledge_maintenance_actions")
        connection.commit()
        connection.close()
        with self.assertRaises(km.MaintenanceError):
            self.apply(plan_path, plan)

    def test_real_backup_manifest_binds_source_and_plan(self):
        with closing(sqlite3.connect(self.db)) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE application_state(key TEXT PRIMARY KEY, value TEXT)")
            connection.execute("INSERT INTO application_state VALUES('mode', 'before')")
            connection.commit()
        plan_path, plan = self.make_plan()
        guard_calls = 0

        def write_and_revert_after_unlock(_):
            nonlocal guard_calls
            guard_calls += 1
            if guard_calls != 3:
                return
            connection = sqlite3.connect(self.db)
            try:
                connection.execute("UPDATE application_state SET value='after' WHERE key='mode'")
                connection.commit()
                connection.execute("UPDATE application_state SET value='before' WHERE key='mode'")
                connection.commit()
            finally:
                connection.close()

        with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
            km.create_backup(
                self.db,
                plan_path,
                self.root / "drifted-backups",
                process_guard=write_and_revert_after_unlock,
            )
        with self.trust_internal_plan(plan):
            result = km.create_backup(
                self.db, plan_path, self.root / "backups", process_guard=lambda _: None
            )
        manifest = result["manifest"]
        self.assertEqual(manifest["sourceDatabasePath"], str(self.db.resolve()))
        self.assertEqual(manifest["planSha256"], plan["plan_sha256"])
        self.assertEqual(manifest["sourceDatabaseIdentity"], km.database_file_state(self.db))
        self.assertEqual(
            manifest["sourceDatabaseFullFingerprint"],
            plan["database_full_fingerprint_before"],
        )
        writer = sqlite3.connect(self.db)
        try:
            writer.execute("UPDATE application_state SET value='after' WHERE key='mode'")
            writer.commit()
            with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
                km.apply_plan(
                    self.db, plan_path, Path(result["manifest_path"]), True,
                    process_guard=lambda _: None,
                )
        finally:
            writer.close()

    def test_real_backup_apply_and_same_manifest_retry_is_idempotent(self):
        plan_path, plan = self.make_plan()
        with self.trust_internal_plan(plan):
            backup = km.create_backup(
                self.db, plan_path, self.root / "backups", process_guard=lambda _: None
            )
        manifest_path = Path(backup["manifest_path"])
        with self.trust_internal_plan(plan):
            first = km.apply_plan(
                self.db, plan_path, manifest_path, True, process_guard=lambda _: None
            )
        self.assertEqual(first["status"], "committed")
        with self.trust_internal_plan(plan):
            second = km.apply_plan(
                self.db, plan_path, manifest_path, True, process_guard=lambda _: None
            )
        self.assertEqual(second["status"], "already-applied")

    def test_verify_checks_database_path_and_full_action_snapshot(self):
        plan_path, plan = self.make_plan()
        with self.trust_internal_plan(plan):
            backup = km.create_backup(
                self.db, plan_path, self.root / "backups", process_guard=lambda _: None
            )
            km.apply_plan(
                self.db, plan_path, Path(backup["manifest_path"]), True,
                process_guard=lambda _: None,
            )
            report = km.verify_applied_plan(self.db, plan_path, self.root / "verify.json")
        self.assertEqual(report["status"], "verified")
        with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
            km.verify_applied_plan(self.root / "other.db", plan_path, self.root / "wrong.json")
        backup_path = Path(backup["backup_path"])
        backup_bytes = backup_path.read_bytes()
        backup_path.write_bytes(b"broken")
        with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
            km.verify_applied_plan(self.db, plan_path, self.root / "broken-backup.json")
        backup_path.write_bytes(backup_bytes)
        connection = sqlite3.connect(self.db)
        original_summary = connection.execute(
            "SELECT summary_json FROM knowledge_maintenance_runs"
        ).fetchone()[0]
        connection.execute("UPDATE knowledge_maintenance_actions SET created_at='tampered'")
        connection.commit()
        connection.close()
        with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
            km.verify_applied_plan(self.db, plan_path, self.root / "tampered-created-at.json")
        connection = sqlite3.connect(self.db)
        connection.execute(
            "UPDATE knowledge_maintenance_actions SET created_at=?",
            (plan["generated_at"],),
        )
        tampered_summary = json.loads(original_summary)
        tampered_summary["unexpected"] = True
        connection.execute(
            "UPDATE knowledge_maintenance_runs SET summary_json=?",
            (json.dumps(tampered_summary, sort_keys=True),),
        )
        connection.commit()
        connection.close()
        with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
            km.verify_applied_plan(self.db, plan_path, self.root / "tampered-summary.json")
        connection = sqlite3.connect(self.db)
        connection.execute(
            "UPDATE knowledge_maintenance_runs SET summary_json=?", (original_summary,)
        )
        connection.execute("UPDATE knowledge_maintenance_actions SET reason_detail='tampered'")
        connection.commit()
        connection.close()
        with self.trust_internal_plan(plan), self.assertRaises(km.MaintenanceError):
            km.verify_applied_plan(self.db, plan_path, self.root / "tampered.json")

    def test_transactional_recheck_catches_process_guard_toctou(self):
        plan_path, plan = self.make_plan()
        backup_path = self.root / "backup.db"
        backup_path.write_bytes(b"test backup evidence")
        manifest_path = self.root / "manifest.json"
        km.atomic_write_json(manifest_path, {"test": True})
        backup = {"fingerprint": plan["fingerprint_before"],
                  "database_full_fingerprint": plan["database_full_fingerprint_before"],
                  "maintenance_state": plan["maintenance_before"],
                  "backup_path": str(backup_path.resolve()),
                  "manifest": {"sourceDatabasePath": str(self.db.resolve()),
                               "sourceDatabaseIdentity": km.database_file_state(self.db),
                               "sourceDatabaseFullFingerprint": plan["database_full_fingerprint_before"],
                               "sha256": km.sha256_file(backup_path),
                               "planSha256": plan["plan_sha256"]}}

        def mutate_after_manifest_check(_):
            connection = sqlite3.connect(self.db)
            connection.execute("UPDATE knowledge_docs SET content=content || ' changed'")
            connection.commit()
            connection.close()

        with (
            mock.patch.object(km, "verify_backup_manifest", return_value=backup),
            self.trust_internal_plan(plan),
        ):
            with self.assertRaises(km.MaintenanceError):
                km.apply_plan(self.db, plan_path, manifest_path, True,
                              process_guard=mutate_after_manifest_check)
        with closing(sqlite3.connect(self.db)) as connection:
            self.assertFalse(km.table_exists(connection, "knowledge_doc_metadata"))

    def test_real_delete_removes_document_and_chunks(self):
        documents, chunks, before = km.live_snapshot(self.db)
        maintenance = km.live_maintenance_state(self.db)
        action = {
            "action": "delete", "doc_id": 1, "filename": "example.md",
            "reason_code": "forged-delete", "reason_detail": "self-authorized deletion",
            "keep_doc_id": None, "sources": {field: None for field in km.SOURCE_FIELDS},
            "before_content_sha256": km.sha256_text(self.content), "after_content_sha256": None,
            "metadata": {"display_title": "Example", "content_sha256": km.sha256_text(self.content)},
            "before": {"chunk_count": 1}, "after": {"deleted": True},
        }
        action["action_id"] = km.action_id(action)
        plan = {
            "schema_version": km.PLAN_SCHEMA_VERSION, "tool_version": km.TOOL_VERSION,
            "plan_id": "delete-run", "generated_at": "2026-07-18T00:00:00.000Z",
            "database_path": str(self.db.resolve()), "chunk_size": 1500,
            "rules_path": str(self.rules.resolve()), "rules_sha256": km.sha256_file(self.rules),
            "fingerprint_before": before, "fingerprint_after": km.logical_fingerprint([], []),
            "database_full_fingerprint_before": km.live_full_database_fingerprint(self.db),
            "evidence_artifacts": self.evidence_artifacts,
            "maintenance_before": maintenance,
            "counts_before": {"documents": 1, "chunks": 1, "metadata_rows": 0, "link_audit_rows": 0},
            "counts_after": {"documents": 0, "chunks": 0, "metadata_rows": 0, "link_audit_rows": 0},
            "metadata_records": [], "metadata_fingerprint_after": km.metadata_fingerprint([]),
            "link_audit_records": [], "link_audit_fingerprint_after": km.link_audit_fingerprint([]),
            "action_counts": {"delete": 1}, "actions": [action],
        }
        plan["plan_sha256"] = km.plan_digest(plan)
        path = self.root / "delete-plan.json"
        km.atomic_write_json(path, plan)
        with self.assertRaises(km.MaintenanceError):
            km.create_backup(
                self.db, path, self.root / "forged-backups", process_guard=lambda _: None
            )

        forged_backup_path = self.root / "forged-backup.db"
        source = sqlite3.connect(self.db)
        destination = sqlite3.connect(forged_backup_path)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        forged_manifest_path = self.root / "forged-manifest.json"
        km.atomic_write_json(forged_manifest_path, {"forged": True})
        forged_backup = {
            "fingerprint": plan["fingerprint_before"],
            "database_full_fingerprint": plan["database_full_fingerprint_before"],
            "maintenance_state": plan["maintenance_before"],
            "backup_path": str(forged_backup_path.resolve()),
            "manifest": {
                "sourceDatabasePath": str(self.db.resolve()),
                "sourceDatabaseIdentity": km.database_file_state(self.db),
                "sourceDatabaseFullFingerprint": plan["database_full_fingerprint_before"],
                "sha256": km.sha256_file(forged_backup_path),
                "planSha256": plan["plan_sha256"],
            },
        }
        with (
            mock.patch.object(km, "verify_backup_manifest", return_value=forged_backup),
            self.assertRaises(km.MaintenanceError),
        ):
            km.apply_plan(
                self.db, path, forged_manifest_path, True, process_guard=lambda _: None
            )
        self.assertEqual(self.apply(path, plan)["status"], "committed")
        self.assertEqual(km.live_snapshot(self.db)[:2], ([], []))

    def test_non_windows_default_guard_fails_closed(self):
        if km.os.name != "nt":
            with self.assertRaises(km.MaintenanceError):
                km.assert_codehelper_closed(self.db)

    def test_process_lease_excludes_app_and_cleans_stale_dead_owner(self):
        lease_path = km.process_lease_path(self.db)
        with km.acquire_process_lease(self.db, "maintenance"):
            self.assertTrue(lease_path.is_file())
            with self.assertRaises(km.MaintenanceError):
                with km.acquire_process_lease(self.db, "app"):
                    pass
        self.assertFalse(lease_path.exists())

        km.atomic_write_json(
            lease_path,
            {
                "pid": 999999,
                "kind": "maintenance",
                "startedAt": "2020-01-01T00:00:00.000Z",
                "token": "stale-token",
            },
        )
        os.utime(lease_path, (0, 0))
        cleanup_path = lease_path.with_name(lease_path.name + ".cleanup")
        cleanup_path.write_text("", encoding="utf-8")
        os.utime(cleanup_path, (0, 0))
        with km.acquire_process_lease(
            self.db,
            "app",
            stale_after_seconds=1,
            pid_checker=lambda _: False,
        ) as lease:
            self.assertNotEqual(lease["token"], "stale-token")
        self.assertFalse(lease_path.exists())
        self.assertFalse(cleanup_path.exists())

    def test_process_probe_keeps_current_process_alive(self):
        self.assertTrue(km.process_is_alive(os.getpid()))

    def test_chunk_split_uses_javascript_utf16_length(self):
        first = ("a" * 1496) + "\U0001f600"
        self.assertEqual(km.split_into_chunks(f"{first}\n\nb", 1500), [first, "b"])

    def test_remote_link_values_discards_non_http_status_codes(self):
        values = km.remote_link_values(
            "https://example.invalid/custom-status",
            "https://example.invalid/custom-status",
            {
                "https://example.invalid/custom-status": {
                    "category": "other-status",
                    "get_status": 600,
                    "head_status": None,
                    "error": None,
                    "detail": "proxy-specific status",
                }
            },
            "2026-07-18T00:00:00Z",
        )
        self.assertEqual(values["status"], "temporary_error")
        self.assertIsNone(values["http_status"])

    def test_windows_process_inventory_uses_utf8_base64_transport(self):
        inventory = [
            {
                "ProcessId": 42,
                "Name": "electron.exe",
                "ExecutablePath": "D:\\工具\\electron.exe",
                "CommandLine": f"electron {self.root.resolve()}",
            }
        ]
        payload = base64.b64encode(
            json.dumps(inventory, ensure_ascii=False).encode("utf-8")
        )
        completed = mock.Mock(stdout=payload)
        with (
            mock.patch.object(km.os, "name", "nt"),
            mock.patch.object(km.subprocess, "run", return_value=completed) as run,
        ):
            conflicts = km.list_codehelper_processes(
                self.db, repo_root=self.root
            )
        self.assertEqual(conflicts[0]["pid"], 42)
        self.assertNotIn("encoding", run.call_args.kwargs)
        command = run.call_args.args[0][-1]
        self.assertIn("$ErrorActionPreference = 'Stop'", command)
        self.assertIn("-ErrorAction Stop", command)

    def test_windows_process_inventory_rejects_null_non_object_and_malformed_base64(self):
        payloads = [
            base64.b64encode(b"null"),
            base64.b64encode(b"[1]"),
            b"not base64!",
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                completed = mock.Mock(stdout=payload)
                with (
                    mock.patch.object(km.os, "name", "nt"),
                    mock.patch.object(km.subprocess, "run", return_value=completed),
                    self.assertRaises(km.MaintenanceError),
                ):
                    km.list_codehelper_processes(self.db, repo_root=self.root)

    def test_checked_in_rules_preserve_the_reviewed_delete_set(self):
        rules_path = MODULE_PATH.with_name("knowledge-maintenance-rules.json")
        rules = km.read_rules(rules_path)
        groups = {
            group["reason_code"]: group["ids"]
            for group in rules["manual_delete_groups"]
        }
        self.assertEqual(
            {reason: len(ids) for reason, ids in groups.items()},
            {
                "empty-body-zero-inbound": 22,
                "template-zero-inbound": 4,
                "explicit-placeholder-zero-inbound": 3,
                "company-list-stub-zero-inbound": 7,
                "sidebar-navigation-zero-inbound": 25,
            },
        )
        self.assertEqual(len(rules["manual_delete"]), 61)
        self.assertEqual(len({item["id"] for item in rules["manual_delete"]}), 61)

    def test_audit_and_dry_run_build_a_stable_end_to_end_plan(self):
        database_path = self.root / "pipeline.db"
        import_root = self.root / "import-batches"
        knowledge_dir = import_root / "batch-one" / "knowledge-docs"
        knowledge_dir.mkdir(parents=True)

        canonical = (
            "---\n"
            "title: Canonical\n"
            "source_repo: acme/docs\n"
            "source_path: guides/shared.md\n"
            "source_commit: abc123\n"
            "---\n"
            "# Shared body\n\n"
            "#### Deep Section\n\n"
            "[jump](#deep-section)\n"
            "#### Foo-1\n"
            "#### Foo\n"
            "#### Foo\n"
            "[collision-safe](#foo-2)\n"
            "#### API (v2): Deep!\n"
            "[encoded](#API%20(v2)%3A%20Deep!)\n"
            "[reference](https://en.wikipedia.org/wiki/Function_(mathematics)?q=(nested)#History)\n"
        )
        duplicate = canonical.replace("title: Canonical", "title: Duplicate")
        empty = (
            "---\n"
            "title: Empty\n"
            "source_repo: acme/docs\n"
            "source_path: guides/empty.md\n"
            "source_commit: abc123\n"
            "---\n"
        )
        documents = [(1, "keep.md", canonical), (2, "duplicate.md", duplicate), (3, "empty.md", empty)]

        connection = sqlite3.connect(database_path)
        connection.executescript(
            """
            CREATE TABLE knowledge_docs(
              id INTEGER PRIMARY KEY, filename TEXT NOT NULL, file_type TEXT,
              content TEXT, chunk_count INTEGER DEFAULT 0, created_at TEXT
            );
            CREATE TABLE knowledge_chunks(
              id INTEGER PRIMARY KEY, doc_id INTEGER REFERENCES knowledge_docs(id) ON DELETE CASCADE,
              content TEXT NOT NULL, embedding TEXT, chunk_index INTEGER, created_at TEXT
            );
            """
        )
        for doc_id, filename, content in documents:
            chunks = km.split_into_chunks(content, 1500)
            connection.execute(
                "INSERT INTO knowledge_docs VALUES(?,?,?,?,?,?)",
                (doc_id, filename, "md", content, len(chunks), "now"),
            )
            connection.executemany(
                "INSERT INTO knowledge_chunks(doc_id,content,embedding,chunk_index,created_at) "
                "VALUES(?,?,NULL,?,?)",
                [(doc_id, chunk, index, "now") for index, chunk in enumerate(chunks)],
            )
            (knowledge_dir / filename).write_text(content, encoding="utf-8")
        connection.commit()
        connection.close()

        rules_path = self.root / "pipeline-rules.json"
        candidate_path = self.root / "candidate-inbound.json"
        readonly_path = self.root / "readonly-audit.json"
        remote_path = self.root / "remote-status.json"
        confirmed_path = self.root / "confirmed404.json"
        duplicate_body_chars = len(km.normalize_body(km.split_frontmatter(duplicate)[1]))
        candidate = {
            "sets": {
                "same_source_duplicate_delete": [2],
                "empty_body": [3],
            },
            "set_counts": {
                "same_source_duplicate_delete": 1,
                "empty_body": 1,
            },
            "union_count": 2,
            "items": {
                "same_source_duplicate_delete": [{
                    "id": 2, "filename": "duplicate.md", "source_repo": "acme/docs",
                    "source_path": "guides/shared.md", "source_commit": "abc123",
                    "body_chars": duplicate_body_chars, "source_identity_doc_ids": [1, 2],
                    "inbound_link_occurrences": 0, "inbound_document_count": 0,
                }],
                "empty_body": [{
                    "id": 3, "filename": "empty.md", "source_repo": "acme/docs",
                    "source_path": "guides/empty.md", "source_commit": "abc123",
                    "body_chars": 0, "source_identity_doc_ids": [3],
                    "inbound_link_occurrences": 0, "inbound_document_count": 0,
                }],
            },
        }
        km.atomic_write_json(candidate_path, candidate)
        km.atomic_write_json(
            readonly_path,
            {
                "totals": {
                    "docs": 3, "chunks": 3, "orphan_chunks": 0,
                    "chunk_count_mismatches": 0,
                },
                "mirror": {"file_count": 3, "match_stats": {"exact": 3}, "diff_examples": []},
                "duplicates": {
                    "same_source_and_same_normalized_body": [{
                        "ids": [1, 2], "keep_id": 1, "delete_candidate_ids": [2],
                    }],
                },
                "quality": {
                    "candidates": [
                        {
                            "id": 2, "filename": "duplicate.md", "repo": "acme/docs",
                            "path": "guides/shared.md", "body_chars": duplicate_body_chars,
                        },
                        {
                            "id": 3, "filename": "empty.md", "repo": "acme/docs",
                            "path": "guides/empty.md", "body_chars": 0,
                        },
                    ],
                },
            },
        )
        lookup_url = "https://en.wikipedia.org/wiki/Function_(mathematics)?q=(nested)"
        km.atomic_write_json(
            remote_path,
            {
                "generated_at": "2026-07-17T00:00:00Z",
                "total_unique": 1,
                "counts": {"confirmed-404-410": 1},
                "results": [{
                    "url": lookup_url, "category": "confirmed-404-410",
                    "head_status": 404, "get_status": 404, "final_url": None,
                }],
            },
        )
        km.atomic_write_json(
            confirmed_path,
            {
                "count": 1,
                "items": [{
                    "url": lookup_url + "#History",
                    "lookup_url": lookup_url,
                }],
            },
        )
        reviewed_evidence = [{
            "id": 3, "filename": "empty.md", "content_sha256": km.sha256_text(empty),
            "source_repo": "acme/docs", "source_path": "guides/empty.md",
            "source_commit": "abc123",
        }]
        km.atomic_write_json(
            rules_path,
            {
                "schema_version": 1,
                "required_batch_count": 1,
                "chunk_size": 1500,
                "auto_delete_duplicates": True,
                "duplicate_evidence_set": "same_source_duplicate_delete",
                "evidence_artifacts": {
                    "candidate_inbound": {
                        "source": candidate_path.name,
                        "sha256": km.sha256_file(candidate_path),
                    },
                    "readonly_audit": {
                        "source": readonly_path.name,
                        "sha256": km.sha256_file(readonly_path),
                    },
                    "remote_status": {
                        "source": remote_path.name,
                        "sha256": km.sha256_file(remote_path),
                    },
                    "confirmed_404": {
                        "source": confirmed_path.name,
                        "sha256": km.sha256_file(confirmed_path),
                    },
                },
                "batch_categories": {
                    "batch-one": {
                        "category_key": "core",
                        "category_label": "Core",
                    }
                },
                "manual_delete": [
                    {
                        "id": 3,
                        "reason_code": "empty-body-zero-inbound",
                        "reason": "Reviewed empty document",
                        "evidence_set": "empty_body",
                    }
                ],
                "manual_review": {
                    "source": candidate_path.name,
                    "source_sha256": km.sha256_file(candidate_path),
                    "selected_count": 1,
                    "expected_fields": ["id", "filename", "content_sha256", "source_repo", "source_path", "source_commit"],
                    "expected_documents_sha256": km.sha256_bytes(km.canonical_json_bytes(reviewed_evidence)),
                },
            },
        )
        audit_path = self.root / "audit.json"
        plan_path = self.root / "pipeline-plan.json"

        audit = km.run_audit(database_path, import_root, rules_path, audit_path)
        tampered = json.loads(json.dumps(audit))
        tampered["duplicate_groups"][0]["delete_candidate_ids"] = [1]
        km.atomic_write_json(audit_path, tampered)
        with self.assertRaises(km.MaintenanceError):
            km.run_dry_run(
                database_path, audit_path, import_root, rules_path, remote_path, plan_path
            )
        km.atomic_write_json(audit_path, audit)
        plan = km.run_dry_run(
            database_path,
            audit_path,
            import_root,
            rules_path,
            remote_path,
            plan_path,
        )

        self.assertEqual(audit["totals"], {"documents": 3, "chunks": 3, "orphan_chunks": 0})
        self.assertEqual(plan["action_counts"], {"delete": 2, "upsert_metadata": 1})
        self.assertEqual(plan["counts_after"]["documents"], 1)
        self.assertEqual(plan["counts_after"]["chunks"], 1)
        self.assertEqual(plan["counts_after"]["metadata_rows"], 1)
        self.assertEqual([record["doc_id"] for record in plan["metadata_records"]], [1])
        self.assertEqual(
            [record["status"] for record in plan["link_audit_records"]],
            ["reachable", "reachable", "reachable", "not_found"],
        )
        self.assertEqual(
            {action["doc_id"] for action in plan["actions"] if action["action"] == "delete"},
            {2, 3},
        )
        with (
            mock.patch.object(km, "default_rules_path", return_value=rules_path),
            mock.patch.object(km, "default_import_batches_path", return_value=import_root),
        ):
            authorization = km.reauthorize_plan_against_database(plan, database_path)
        self.assertEqual(authorization["actions"], plan["actions"])

    def test_incompatible_existing_link_schema_fails_closed(self):
        connection = sqlite3.connect(self.db)
        connection.execute(
            """CREATE TABLE knowledge_link_audit(
              id INTEGER PRIMARY KEY, doc_id INTEGER, line_number INTEGER,
              raw_target TEXT, resolved_target TEXT, link_kind TEXT, status TEXT,
              http_status INTEGER, checked_at TEXT, detail TEXT
            )"""
        )
        connection.commit()
        with self.assertRaises(km.MaintenanceError):
            km.ensure_maintenance_schema(connection)
        connection.close()


if __name__ == "__main__":
    unittest.main()
