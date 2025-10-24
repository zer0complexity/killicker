Show MapMenu.trackColours

This small Python 3.12 tool reproduces the `MapMenu.trackColours` palette generation and shows 64 colour swatches.

Usage

- Open GUI: python3 tools/show_colours.py
- Print RGB array (JSON): python3 tools/show_colours.py -p
- Print hex array: python3 tools/show_colours.py -p --hex
- Skip GUI and do nothing else: python3 tools/show_colours.py --no-gui

Notes

- Uses only standard library (Tkinter) to display swatches.
- The palette generator mirrors the JS implementation in `js/mapMenu.js` (HSL candidate sampling, CIE-Lab farthest-point sampling) and excludes a blue hue band to avoid map water colours.
