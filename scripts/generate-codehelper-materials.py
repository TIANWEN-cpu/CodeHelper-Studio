from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "assets" / "generated" / "codehelper-materials"

BG = (11, 14, 20)
PANEL = (17, 20, 30)
CARD = (22, 26, 38)
BORDER = (42, 50, 74)
TEXT = (243, 244, 246)
MUTED = (156, 163, 175)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/inter.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                pass
    return ImageFont.load_default()


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def alpha(color: tuple[int, int, int], a: int) -> tuple[int, int, int, int]:
    return (*color, a)


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        c = mix(top, bottom, t)
        for x in range(w):
            px[x, y] = c
    return img.convert("RGBA")


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int] | tuple[int, int, int],
    outline: tuple[int, int, int, int] | tuple[int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def add_glow(
    img: Image.Image,
    xy: tuple[int, int],
    radius: int,
    color: tuple[int, int, int],
    opacity: int = 90,
) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = xy
    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=alpha(color, opacity))
    layer = layer.filter(ImageFilter.GaussianBlur(radius / 2))
    img.alpha_composite(layer)


def add_grid(img: Image.Image, spacing: int = 48, opacity: int = 32) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    for x in range(0, w, spacing):
        d.line((x, 0, x, h), fill=(148, 163, 184, opacity), width=1)
    for y in range(0, h, spacing):
        d.line((0, y, w, y), fill=(148, 163, 184, opacity), width=1)


def add_window(
    img: Image.Image,
    box: tuple[int, int, int, int],
    title_color: tuple[int, int, int],
    accent: tuple[int, int, int],
    code_lines: int = 9,
) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    x1, y1, x2, y2 = box
    rounded_rect(d, box, 28, alpha(PANEL, 232), alpha(BORDER, 210), 2)
    rounded_rect(d, (x1 + 1, y1 + 1, x2 - 1, y1 + 74), 28, alpha((255, 255, 255), 10))
    for i, c in enumerate([(239, 68, 68), (245, 158, 11), (16, 185, 129)]):
        d.ellipse((x1 + 28 + i * 26, y1 + 28, x1 + 42 + i * 26, y1 + 42), fill=alpha(c, 230))
    d.rounded_rectangle((x1 + 128, y1 + 24, x2 - 28, y1 + 48), radius=10, fill=alpha(CARD, 230))
    d.text((x1 + 148, y1 + 26), "CodeHelper", font=font(18, True), fill=alpha(title_color, 220))
    gutter = x1 + 36
    top = y1 + 104
    for i in range(code_lines):
        y = top + i * 34
        d.text((gutter, y - 2), f"{i + 1:02}", font=font(16), fill=alpha(MUTED, 120))
        width = int((x2 - x1) * (0.42 + 0.34 * ((i * 37) % 91) / 90))
        line_color = accent if i % 4 == 0 else (99, 102, 241) if i % 3 == 0 else (148, 163, 184)
        d.rounded_rectangle(
            (gutter + 54, y, gutter + 54 + width, y + 12),
            radius=6,
            fill=alpha(line_color, 160 if i % 4 == 0 else 92),
        )
    d.rounded_rectangle((x2 - 170, y2 - 96, x2 - 36, y2 - 52), radius=14, fill=alpha(accent, 230))
    d.text((x2 - 132, y2 - 86), "Run", font=font(20, True), fill=(255, 255, 255, 240))


def add_nodes(img: Image.Image, center: tuple[int, int], accent: tuple[int, int, int], count: int = 7) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy = center
    points: list[tuple[int, int]] = []
    for i in range(count):
        a = (math.tau / count) * i - math.pi / 2
        r = 92 + (i % 2) * 46
        points.append((int(cx + math.cos(a) * r), int(cy + math.sin(a) * r)))
    for p in points:
        d.line((cx, cy, p[0], p[1]), fill=alpha(accent, 82), width=4)
    d.ellipse((cx - 38, cy - 38, cx + 38, cy + 38), fill=alpha(accent, 230))
    d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill=(255, 255, 255, 220))
    for i, (x, y) in enumerate(points):
        c = accent if i % 2 else (59, 130, 246)
        d.ellipse((x - 24, y - 24, x + 24, y + 24), fill=alpha(c, 220), outline=alpha((255, 255, 255), 80), width=2)
        d.ellipse((x - 8, y - 8, x + 8, y + 8), fill=(255, 255, 255, 210))


def add_badge_symbol(img: Image.Image, symbol: str, accent: tuple[int, int, int]) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    add_glow(img, (w // 2, h // 2), 180, accent, 130)
    d.rounded_rectangle((94, 94, w - 94, h - 94), radius=78, fill=alpha(PANEL, 238), outline=alpha(accent, 210), width=5)
    d.rounded_rectangle((138, 138, w - 138, h - 138), radius=52, fill=alpha(accent, 38), outline=alpha((255, 255, 255), 58), width=2)
    d.text((w // 2, h // 2 - 18), symbol, font=font(130, True), anchor="mm", fill=alpha((255, 255, 255), 238))
    for i in range(18):
        a = i * math.tau / 18
        r = 206
        x = w // 2 + math.cos(a) * r
        y = h // 2 + math.sin(a) * r
        d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=alpha(accent, 130))


def title(img: Image.Image, main: str, sub: str, accent: tuple[int, int, int]) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    x = 72
    y = 68
    d.rounded_rectangle((x, y, x + 56, y + 56), radius=16, fill=alpha(accent, 220))
    d.line((x + 17, y + 30, x + 28, y + 42, x + 42, y + 17), fill=(255, 255, 255, 240), width=6, joint="curve")
    d.text((x, y + 84), main, font=font(54, True), fill=alpha(TEXT, 242))
    d.text((x, y + 150), sub, font=font(24), fill=alpha(MUTED, 210))


def canvas(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int], accent: tuple[int, int, int]) -> Image.Image:
    img = gradient(size, top, bottom)
    add_grid(img, 56, 22)
    add_glow(img, (int(size[0] * 0.18), int(size[1] * 0.12)), int(size[0] * 0.22), accent, 92)
    add_glow(img, (int(size[0] * 0.82), int(size[1] * 0.20)), int(size[0] * 0.18), (139, 92, 246), 70)
    return img


@dataclass(frozen=True)
class Asset:
    key: str
    file: str
    title: str
    category: str
    size: tuple[int, int]
    accent: tuple[int, int, int]
    render: Callable[[Image.Image, "Asset"], None]


def render_hero(img: Image.Image, asset: Asset) -> None:
    title(img, asset.title, "ready-to-use learning workspace visual", asset.accent)
    add_window(img, (720, 120, 1490, 778), TEXT, asset.accent, 11)
    add_nodes(img, (450, 585), asset.accent, 8)
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(3):
        x = 250 + i * 145
        d.rounded_rectangle((x, 790, x + 98, 828), radius=18, fill=alpha(asset.accent, 55 + i * 30), outline=alpha(asset.accent, 100), width=1)


def render_card(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    title(img, asset.title, "module card artwork", asset.accent)
    rounded_rect(d, (96, 246, 864, 468), 30, alpha(PANEL, 232), alpha(BORDER, 230), 2)
    for i in range(5):
        x = 140 + i * 135
        h = 48 + (i * 29) % 94
        d.rounded_rectangle((x, 404 - h, x + 78, 404), radius=16, fill=alpha(asset.accent if i % 2 else (59, 130, 246), 120 + i * 18))
    d.line((150, 428, 820, 428), fill=alpha(MUTED, 90), width=2)
    add_nodes(img, (728, 180), asset.accent, 6)


def render_empty(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    add_glow(img, (480, 330), 230, asset.accent, 98)
    rounded_rect(d, (250, 160, 710, 560), 44, alpha(PANEL, 230), alpha(BORDER, 210), 2)
    d.ellipse((385, 222, 575, 412), fill=alpha(asset.accent, 46), outline=alpha(asset.accent, 160), width=4)
    for i in range(4):
        y = 452 + i * 26
        d.rounded_rectangle((328, y, 632 - i * 38, y + 12), radius=6, fill=alpha(MUTED if i % 2 else asset.accent, 80))
    d.text((480, 104), asset.title, font=font(38, True), anchor="mm", fill=alpha(TEXT, 238))


def render_badge(img: Image.Image, asset: Asset) -> None:
    symbols = {
        "streak-badge": "7",
        "focus-badge": "{}",
        "review-badge": "R",
        "practice-badge": ">",
        "mastery-badge": "*",
    }
    add_badge_symbol(img, symbols.get(asset.key, "*"), asset.accent)


def render_bg(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(9):
        x = 126 + i * 190
        y = 150 + (i % 3) * 130
        rounded_rect(d, (x, y, x + 210, y + 94), 24, alpha(PANEL, 118), alpha(BORDER, 95), 1)
        d.rounded_rectangle((x + 24, y + 26, x + 174, y + 38), radius=7, fill=alpha(asset.accent, 95))
        d.rounded_rectangle((x + 24, y + 54, x + 132, y + 64), radius=5, fill=alpha(MUTED, 66))
    for i in range(7):
        d.arc((360 + i * 120, 610 - i * 18, 740 + i * 120, 970 - i * 18), 210, 338, fill=alpha(asset.accent, 56), width=3)


def render_icon_grid(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    title(img, asset.title, "compact UI illustration", asset.accent)
    for row in range(3):
        for col in range(4):
            x = 405 + col * 128
            y = 126 + row * 112
            rounded_rect(d, (x, y, x + 82, y + 82), 22, alpha(PANEL, 230), alpha(BORDER, 190), 2)
            d.ellipse((x + 22, y + 20, x + 60, y + 58), fill=alpha(asset.accent if (row + col) % 2 else (16, 185, 129), 190))
            d.line((x + 24, y + 62, x + 58, y + 62), fill=alpha(TEXT, 175), width=4)


def render_landscape(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    palette = {
        "landscape-mountain-dawn": ((15, 23, 42), (56, 189, 248), (251, 191, 36)),
        "landscape-rainy-city": ((12, 18, 28), (59, 130, 246), (168, 85, 247)),
        "landscape-forest-terminal": ((8, 22, 18), (16, 185, 129), (132, 204, 22)),
        "landscape-ocean-night": ((7, 15, 30), (14, 165, 233), (99, 102, 241)),
    }
    base, mid, sun = palette.get(asset.key, ((15, 23, 42), asset.accent, (255, 255, 255)))
    add_glow(img, (int(w * 0.72), int(h * 0.25)), 320, sun, 120)
    add_glow(img, (int(w * 0.28), int(h * 0.35)), 280, mid, 80)
    d.ellipse((w * 0.68, h * 0.12, w * 0.82, h * 0.36), fill=alpha(sun, 130))
    for i in range(6):
        y = int(h * (0.48 + i * 0.055))
        points = [(-80, h), (-80, y)]
        for x in range(-80, w + 160, 180):
            peak = y - 110 - ((x // 180 + i) % 3) * 56
            points.extend([(x + 90, peak), (x + 180, y + 24)])
        points.extend([(w + 120, h), (-80, h)])
        color = mix(base, mid, min(0.6, 0.16 + i * 0.1))
        d.polygon(points, fill=alpha(color, 180))
    for i in range(16):
        x = int((i * 137) % w)
        y = int(h * 0.62 + (i % 4) * 32)
        d.rounded_rectangle((x, y, x + 120, y + 12), radius=6, fill=alpha(mid, 34))
    d.rectangle((0, int(h * 0.78), w, h), fill=alpha(mix(base, mid, 0.16), 190))
    for x in range(0, w, 96):
        d.line((x, int(h * 0.78), x - 90, h), fill=alpha(mid, 38), width=2)


def render_anime_assistant(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    accent2 = (236, 72, 153) if asset.key != "anime-cyber-sakura" else (244, 114, 182)
    add_glow(img, (int(w * 0.35), int(h * 0.25)), 360, accent2, 96)
    add_glow(img, (int(w * 0.78), int(h * 0.18)), 320, asset.accent, 92)
    # Background panels
    for i in range(8):
        x = 110 + i * 210
        y = 98 + (i % 3) * 86
        rounded_rect(d, (x, y, x + 148, y + 58), 18, alpha(PANEL, 92), alpha(asset.accent, 56), 1)
        d.rounded_rectangle((x + 18, y + 18, x + 98, y + 26), radius=4, fill=alpha(asset.accent, 82))
    # Character silhouette: wholesome anime study assistant, fully clothed.
    cx, cy = int(w * 0.38), int(h * 0.49)
    hair = (37, 30, 64) if asset.key != "anime-neon-study" else (44, 24, 78)
    skin = (255, 219, 199)
    outfit = asset.accent
    d.ellipse((cx - 126, cy - 246, cx + 126, cy + 26), fill=alpha(hair, 245))
    d.ellipse((cx - 84, cy - 204, cx + 84, cy - 40), fill=alpha(skin, 255))
    d.polygon(
        [(cx - 150, cy + 28), (cx + 150, cy + 28), (cx + 224, cy + 360), (cx - 224, cy + 360)],
        fill=alpha(outfit, 232),
    )
    d.polygon(
        [(cx - 86, cy + 20), (cx, cy + 92), (cx + 86, cy + 20), (cx + 122, cy + 248), (cx - 122, cy + 248)],
        fill=alpha((248, 250, 252), 238),
    )
    d.ellipse((cx - 42, cy - 130, cx - 22, cy - 106), fill=alpha((15, 23, 42), 240))
    d.ellipse((cx + 22, cy - 130, cx + 42, cy - 106), fill=alpha((15, 23, 42), 240))
    d.arc((cx - 34, cy - 92, cx + 34, cy - 54), 20, 160, fill=alpha((180, 83, 107), 220), width=4)
    for side in [-1, 1]:
        d.polygon(
            [
                (cx + side * 72, cy - 192),
                (cx + side * 188, cy - 62),
                (cx + side * 88, cy + 34),
            ],
            fill=alpha(hair, 230),
        )
    # Desk and code window
    rounded_rect(d, (int(w * 0.55), int(h * 0.28), int(w * 0.92), int(h * 0.72)), 34, alpha(PANEL, 225), alpha(asset.accent, 126), 2)
    for i in range(10):
        y = int(h * 0.34) + i * 34
        c = accent2 if i % 3 == 0 else asset.accent if i % 2 == 0 else (148, 163, 184)
        d.rounded_rectangle((int(w * 0.6), y, int(w * (0.72 + (i % 4) * 0.045)), y + 12), radius=6, fill=alpha(c, 138))
    rounded_rect(d, (int(w * 0.18), int(h * 0.76), int(w * 0.88), int(h * 0.86)), 28, alpha((8, 12, 20), 210), alpha(asset.accent, 95), 1)


def render_anime_pet(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    add_glow(img, (w // 2, h // 2), 360, asset.accent, 110)
    rounded_rect(d, (560, 130, 1360, 860), 70, alpha(PANEL, 228), alpha(asset.accent, 120), 2)
    for i in range(14):
        a = math.tau * i / 14
        x = int(w // 2 + math.cos(a) * 270)
        y = int(h // 2 + math.sin(a) * 230)
        d.ellipse((x - 10, y - 10, x + 10, y + 10), fill=alpha(asset.accent, 155))
    cx, cy = w // 2, h // 2
    d.ellipse((cx - 170, cy - 210, cx + 170, cy + 130), fill=alpha((40, 32, 74), 248))
    d.ellipse((cx - 112, cy - 156, cx + 112, cy + 62), fill=alpha((255, 222, 204), 255))
    d.polygon([(cx - 105, cy - 130), (cx - 250, cy - 20), (cx - 132, cy + 80)], fill=alpha((40, 32, 74), 235))
    d.polygon([(cx + 105, cy - 130), (cx + 250, cy - 20), (cx + 132, cy + 80)], fill=alpha((40, 32, 74), 235))
    d.ellipse((cx - 56, cy - 58, cx - 28, cy - 22), fill=alpha((15, 23, 42), 245))
    d.ellipse((cx + 28, cy - 58, cx + 56, cy - 22), fill=alpha((15, 23, 42), 245))
    d.arc((cx - 42, cy - 12, cx + 42, cy + 34), 18, 162, fill=alpha((190, 85, 120), 230), width=5)
    d.polygon([(cx - 180, cy + 100), (cx + 180, cy + 100), (cx + 250, cy + 360), (cx - 250, cy + 360)], fill=alpha(asset.accent, 224))


def render_workspace_scene(img: Image.Image, asset: Asset) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    add_glow(img, (int(w * 0.52), int(h * 0.38)), 420, asset.accent, 110)
    rounded_rect(d, (170, 150, 900, 790), 52, alpha(PANEL, 218), alpha(asset.accent, 105), 2)
    rounded_rect(d, (1010, 190, 1700, 720), 46, alpha(PANEL, 226), alpha((59, 130, 246), 110), 2)
    for i in range(9):
        y = 250 + i * 46
        d.rounded_rectangle((1080, y, 1560 - (i % 3) * 70, y + 14), radius=7, fill=alpha(asset.accent if i % 2 else (59, 130, 246), 120))
    for i in range(7):
        x = 250 + i * 82
        d.rounded_rectangle((x, 660 - i * 28, x + 44, 660), radius=12, fill=alpha(asset.accent, 92 + i * 16))
    add_nodes(img, (535, 405), asset.accent, 9)


ASSETS: list[Asset] = [
    Asset("hero-workbench", "hero-workbench.png", "Workbench", "hero", (1600, 900), (99, 102, 241), render_hero),
    Asset("hero-ai-tutor", "hero-ai-tutor.png", "AI Tutor", "hero", (1600, 900), (139, 92, 246), render_hero),
    Asset("hero-practice-lab", "hero-practice-lab.png", "Practice Lab", "hero", (1600, 900), (16, 185, 129), render_hero),
    Asset("hero-learning-path", "hero-learning-path.png", "Learning Path", "hero", (1600, 900), (59, 130, 246), render_hero),
    Asset("hero-knowledge-base", "hero-knowledge-base.png", "Knowledge Base", "hero", (1600, 900), (245, 158, 11), render_hero),
    Asset("card-code-review", "card-code-review.png", "Review", "card", (960, 540), (239, 68, 68), render_card),
    Asset("card-algorithm-map", "card-algorithm-map.png", "Algorithm Map", "card", (960, 540), (16, 185, 129), render_card),
    Asset("card-debug-console", "card-debug-console.png", "Debug Console", "card", (960, 540), (59, 130, 246), render_card),
    Asset("card-note-capture", "card-note-capture.png", "Notes", "card", (960, 540), (245, 158, 11), render_card),
    Asset("card-ai-agent", "card-ai-agent.png", "AI Agent", "card", (960, 540), (139, 92, 246), render_card),
    Asset("card-progress-chart", "card-progress-chart.png", "Progress", "card", (960, 540), (236, 72, 153), render_card),
    Asset("empty-no-activity", "empty-no-activity.png", "No Activity", "empty-state", (960, 720), (99, 102, 241), render_empty),
    Asset("empty-no-lessons", "empty-no-lessons.png", "No Lessons", "empty-state", (960, 720), (59, 130, 246), render_empty),
    Asset("empty-no-practice", "empty-no-practice.png", "No Practice", "empty-state", (960, 720), (16, 185, 129), render_empty),
    Asset("empty-no-knowledge", "empty-no-knowledge.png", "No Knowledge", "empty-state", (960, 720), (245, 158, 11), render_empty),
    Asset("empty-no-search-results", "empty-no-search-results.png", "No Results", "empty-state", (960, 720), (139, 92, 246), render_empty),
    Asset("empty-offline-mode", "empty-offline-mode.png", "Offline", "empty-state", (960, 720), (148, 163, 184), render_empty),
    Asset("streak-badge", "streak-badge.png", "Streak Badge", "badge", (512, 512), (245, 158, 11), render_badge),
    Asset("focus-badge", "focus-badge.png", "Focus Badge", "badge", (512, 512), (99, 102, 241), render_badge),
    Asset("review-badge", "review-badge.png", "Review Badge", "badge", (512, 512), (239, 68, 68), render_badge),
    Asset("practice-badge", "practice-badge.png", "Practice Badge", "badge", (512, 512), (16, 185, 129), render_badge),
    Asset("mastery-badge", "mastery-badge.png", "Mastery Badge", "badge", (512, 512), (139, 92, 246), render_badge),
    Asset("background-aurora-grid", "background-aurora-grid.png", "Aurora Grid", "background", (1920, 1080), (20, 184, 166), render_bg),
    Asset("background-nebula-panels", "background-nebula-panels.png", "Nebula Panels", "background", (1920, 1080), (236, 72, 153), render_bg),
    Asset("background-graphite-flow", "background-graphite-flow.png", "Graphite Flow", "background", (1920, 1080), (56, 189, 248), render_bg),
    Asset("landscape-mountain-dawn", "landscape-mountain-dawn.png", "Mountain Dawn", "wallpaper", (1920, 1080), (56, 189, 248), render_landscape),
    Asset("landscape-rainy-city", "landscape-rainy-city.png", "Rainy City", "wallpaper", (1920, 1080), (59, 130, 246), render_landscape),
    Asset("landscape-forest-terminal", "landscape-forest-terminal.png", "Forest Terminal", "wallpaper", (1920, 1080), (16, 185, 129), render_landscape),
    Asset("landscape-ocean-night", "landscape-ocean-night.png", "Ocean Night", "wallpaper", (1920, 1080), (14, 165, 233), render_landscape),
    Asset("anime-neon-study", "anime-neon-study.png", "Neon Study", "wallpaper", (1920, 1080), (139, 92, 246), render_anime_assistant),
    Asset("anime-cyber-sakura", "anime-cyber-sakura.png", "Cyber Sakura", "wallpaper", (1920, 1080), (236, 72, 153), render_anime_assistant),
    Asset("anime-coding-assistant", "anime-coding-assistant.png", "Coding Assistant", "wallpaper", (1920, 1080), (99, 102, 241), render_anime_pet),
    Asset("workspace-focus-scene", "workspace-focus-scene.png", "Focus Scene", "wallpaper", (1920, 1080), (99, 102, 241), render_workspace_scene),
]

EXTERNAL_ASSETS = [
    {
        "key": "theme-deep-space",
        "file": "theme-deep-space.png",
        "title": "Deep Space",
        "category": "wallpaper",
        "width": 1672,
        "height": 941,
    },
    {
        "key": "theme-forest-focus",
        "file": "theme-forest-focus.png",
        "title": "Forest Focus",
        "category": "wallpaper",
        "width": 1672,
        "height": 941,
    },
    {
        "key": "theme-anime-study",
        "file": "theme-anime-study.png",
        "title": "Anime Study",
        "category": "wallpaper",
        "width": 1672,
        "height": 941,
    },
]


def write_index(manifest: list[dict[str, object]]) -> None:
    imports: list[str] = []
    entries: list[str] = []
    for item in manifest:
        name = "".join(part.capitalize() if i else part for i, part in enumerate(str(item["key"]).split("-")))
        imports.append(f"import {name} from './{item['file']}'")
        entries.append(
            "  {\n"
            f"    key: '{item['key']}',\n"
            f"    title: '{item['title']}',\n"
            f"    category: '{item['category']}',\n"
            f"    width: {item['width']},\n"
            f"    height: {item['height']},\n"
            f"    src: {name},\n"
            "  },"
        )
    content = "\n".join(imports)
    content += "\n\nexport type CodeHelperMaterialCategory = 'hero' | 'card' | 'empty-state' | 'badge' | 'background' | 'wallpaper'\n\n"
    content += "export interface CodeHelperMaterial {\n"
    content += "  key: string\n  title: string\n  category: CodeHelperMaterialCategory\n  width: number\n  height: number\n  src: string\n}\n\n"
    content += "export const codeHelperMaterials: CodeHelperMaterial[] = [\n"
    content += "\n".join(entries)
    content += "\n]\n\n"
    content += "export const codeHelperMaterialByKey = Object.fromEntries(\n"
    content += "  codeHelperMaterials.map((asset) => [asset.key, asset]),\n"
    content += ") as Record<string, CodeHelperMaterial>\n"
    (OUT_DIR / "index.ts").write_text(content, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for asset in ASSETS:
        img = canvas(asset.size, BG, mix(BG, asset.accent, 0.08), asset.accent)
        asset.render(img, asset)
        img.save(OUT_DIR / asset.file, optimize=True)
        manifest.append(
            {
                "key": asset.key,
                "file": asset.file,
                "title": asset.title,
                "category": asset.category,
                "width": asset.size[0],
                "height": asset.size[1],
            }
        )
    manifest.extend(EXTERNAL_ASSETS)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_index(manifest)
    print(f"Generated {len(manifest)} assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
