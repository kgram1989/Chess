# Chess vs Computer

A browser chess game against a computer opponent. No build step and no dependencies.
Open `index.html`, or serve the folder with any static web server.

- Full chess rules: castling, en passant, promotion, check, checkmate, stalemate, draw rules
- Five difficulty levels, from Beginner (mostly random) to Master
- Move history with back and forward navigation, undo, plain-English move list
- Several piece sets and board themes

The engine (`engine.js`) is plain JavaScript with an alpha-beta search; the UI is in `index.html`.

## Piece artwork

The SVG pieces in `pieces/` are third-party artwork under their own licences. See
[`pieces/LICENSES.md`](pieces/LICENSES.md) for authors and terms. In short:

- Cburnett and Merida: GPLv2+
- Staunty and Maestro: CC BY-NC-SA 4.0, **non-commercial use only**
