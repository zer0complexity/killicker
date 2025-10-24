#!/usr/bin/env python3
"""
Show MapMenu.trackColours swatches and optionally print the RGB array to stdout.

Usage:
  python tools/show_colours.py        # opens a Tk window showing 8x8 swatches
  python tools/show_colours.py -p    # prints the RGB array (list of [r,g,b]) to stdout as JSON
  python tools/show_colours.py --hex # prints hex list to stdout

Requires Python 3.12 (uses only stdlib).
"""
from __future__ import annotations
import json
import sys
import argparse
from math import sqrt
try:
    import tkinter as tk
    from tkinter import ttk
except Exception:
    tk = None

# Port of the JS generator in js/mapMenu.js

def hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    h = (h % 360) / 360.0
    if s == 0:
        r = g = b = l
    else:
        def hue2rgb(p: float, q: float, t: float) -> float:
            if t < 0:
                t += 1
            if t > 1:
                t -= 1
            if t < 1/6:
                return p + (q - p) * 6 * t
            if t < 1/2:
                return q
            if t < 2/3:
                return p + (q - p) * (2/3 - t) * 6
            return p
        q = l * (1 + s) if l < 0.5 else l + s - l * s
        p = 2 * l - q
        r = hue2rgb(p, q, h + 1/3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1/3)
    return (round(r * 255), round(g * 255), round(b * 255))


def rgb_to_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    # sRGB 0..255 -> linear -> XYZ -> Lab (D65)
    srgb = [v / 255.0 for v in rgb]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    x = linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375
    y = linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.0721750
    z = linear[0] * 0.0193339 + linear[1] * 0.1191920 + linear[2] * 0.9503041
    xn, yn, zn = 0.95047, 1.0, 1.08883
    def f(t: float) -> float:
        return t ** (1/3) if t > 0.008856 else (7.787037 * t + 16.0/116.0)
    fx, fy, fz = f(x / xn), f(y / yn), f(z / zn)
    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)
    return (L, a, b)


def lab_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    dL = a[0] - b[0]
    da = a[1] - b[1]
    db = a[2] - b[2]
    return sqrt(dL * dL + da * da + db * db)


def generate_track_colours() -> list[tuple[int, int, int]]:
    num_colors = 64
    candidates: list[dict] = []
    # Exclude blue band
    exclude_start = 195.0
    exclude_end = 245.0
    hues_sample = 180
    saturation = 0.92
    lightness_levels = [0.38, 0.56, 0.72]
    for l in lightness_levels:
        for i in range(hues_sample):
            t = i / hues_sample
            hue = t * 360.0
            if exclude_start <= hue <= exclude_end:
                hue = exclude_end + (hue - exclude_start)
            hue = (hue % 360.0 + 360.0) % 360.0
            rgb = hsl_to_rgb(hue, saturation, l)
            candidates.append({"rgb": rgb, "lab": rgb_to_lab(rgb)})

    if not candidates:
        return []

    # Greedy farthest-point sampling in Lab space
    selected: list[dict] = []
    # Seed: pick candidate with L closest to targetL=60
    targetL = 60.0
    seed_idx = 0
    min_diff = float("inf")
    for idx, c in enumerate(candidates):
        diff = abs(c["lab"][0] - targetL)
        if diff < min_diff:
            min_diff = diff
            seed_idx = idx
    selected.append(candidates.pop(seed_idx))

    while len(selected) < num_colors and candidates:
        best_idx = 0
        best_score = -1.0
        for idx, cand in enumerate(candidates):
            min_dist = float("inf")
            for s in selected:
                d = lab_distance(cand["lab"], s["lab"])
                if d < min_dist:
                    min_dist = d
            if min_dist > best_score:
                best_score = min_dist
                best_idx = idx
        selected.append(candidates.pop(best_idx))

    # If fewer than needed, pad (unlikely)
    while len(selected) < num_colors and candidates:
        selected.append(candidates.pop(0))

    return [c["rgb"] for c in selected[:num_colors]]


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def print_rgb_array(colours: list[tuple[int, int, int]], as_hex: bool = False) -> None:
    if as_hex:
        print(json.dumps([rgb_to_hex(c) for c in colours], ensure_ascii=False))
    else:
        print(json.dumps(colours, ensure_ascii=False))


def show_window(colours: list[tuple[int, int, int]]) -> None:
    if tk is None:
        print("Tkinter not available; cannot open GUI.", file=sys.stderr)
        return
    root = tk.Tk()
    root.title("MapMenu.trackColours — 64 swatches")
    frame = ttk.Frame(root, padding=8)
    frame.grid()
    cols = 8
    size = 64
    for idx, rgb in enumerate(colours):
        r, g, b = rgb
        hexcol = rgb_to_hex(rgb)
        row = idx // cols
        col = idx % cols
        c = tk.Canvas(frame, width=size, height=size, bg=hexcol, highlightthickness=1, highlightbackground="#444")
        c.grid(row=row*2, column=col, padx=4, pady=4)
        lbl = ttk.Label(frame, text=hexcol)
        lbl.grid(row=row*2+1, column=col)
    root.mainloop()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Show MapMenu.trackColours swatches and optionally print the RGB array")
    parser.add_argument("-p", "--print", action="store_true", help="Print RGB array to stdout as JSON and exit")
    parser.add_argument("--hex", action="store_true", help="When printing, output hex strings instead of RGB tuples")
    parser.add_argument("--no-gui", action="store_true", help="Don't open the GUI window")
    args = parser.parse_args(argv)

    colours = generate_track_colours()
    if args.print:
        print_rgb_array(colours, as_hex=args.hex)
        return 0
    if args.no_gui:
        return 0
    show_window(colours)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
