# 🚒 Little Firefighters

A little browser rescue game built with **Three.js**. A fire is spreading through
a building — guide two young heroes through the smoke, reach the trapped people
and carry them to the safe exit before time runs out.

- **No build step, no assets** — every texture is drawn on a `<canvas>`, all sound
  is synthesized with the Web Audio API, and all 3D is procedural geometry.
- **Three.js loads from a CDN** via an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap), so the whole game is a few dozen KB of static files.
- **Mobile-first** (virtual joystick + action button) with full keyboard/mouse support on desktop.

## Controls

| Device | Move | Grab / drop | Look |
| --- | --- | --- | --- |
| **Mobile** | drag the left side | tap the right button | drag the scene |
| **Desktop** | `WASD` / Arrows | `E` | drag with the mouse |

## Run it locally

```bash
npm start        # starts a tiny static server (node server.mjs) on http://localhost:8000
```

The game needs to be served over HTTP(S) (so ES modules load) — don't open
`index.html` straight from `file://`.

## 🌐 Publish it on GitHub Pages

Because the game is 100% static with relative paths, it runs on GitHub Pages with
no changes. Pick **either** method below.

### Method 1 — Auto-deploy with GitHub Actions (recommended)

A workflow is included (`.github/workflows/deploy.yml`) that publishes the game
on every push.

1. Push this folder to a GitHub repository.
2. On GitHub: **Settings → Pages → “Build and deployment” → Source** → choose
   **GitHub Actions**.
3. Push a commit (or run the workflow manually from the **Actions** tab).

Within a couple of minutes the game is live at:

```
https://<your-username>.github.io/<this-repo>/
```

The workflow copies only the game files (`index.html`, `styles.css`, `js/*.js`)
into the published site, so dev files like `server.mjs` and `package.json` stay
out of the public site.

### Method 2 — Deploy from a branch (no workflow)

1. Push this folder to a GitHub repository.
2. On GitHub: **Settings → Pages → “Build and deployment” → Source** → choose
   **Deploy from a branch**.
3. Pick the branch (`main` or `master`) and the folder **`/ (root)`**, then Save.

GitHub rebuilds automatically whenever you push to that branch. The game will be
at `https://<your-username>.github.io/<this-repo>/`.

> Note: with Method 2 the whole branch root is published, which is fine here —
> `server.mjs` / `package.json` are just harmless extra files.

## Project structure

```
index.html              page, UI overlays, import map
styles.css              all UI styling
js/
  main.js               entry: renderer, scene, loop, UI wiring
  game.js               game logic (heroes, victims, fire, win/lose)
  world.js              building, fire, exit, ground
  characters.js         hero + victim models (procedural)
  effects.js            post-processing (bloom, vignette)
  input.js              touch + keyboard input
  audio.js              Web Audio sound engine
server.mjs              local dev server (not needed when published)
```
