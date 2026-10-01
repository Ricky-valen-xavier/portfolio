# Portfolio — Ricky Valen Xavier

Personal portfolio site. Static HTML, CSS and JavaScript with no build step and no
dependencies — open `index.html` in a browser, or serve the folder over HTTP.

- `index.html` — page content
- `styles.css` — layout, the black-and-white design, animations
- `script.js` — scroll-driven motion and interactions
- `assets/` — portrait and résumé

Type is Apple's SF Pro on Apple devices via the system font stack, falling back to Inter
elsewhere. All motion respects `prefers-reduced-motion`.

## Running locally

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>.
