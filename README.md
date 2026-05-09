# Main Menu (2 games)

Static HTML/CSS/JS games served from a simple main menu:

- `./flappy-blob/` (Flappy Blob)
- `./snake-game/` (Neon Snake)

## Run

Any static server works. For example (PowerShell):

```powershell
python -m http.server 5173
```

Then open `http://localhost:5173/`.

## Publish (GitHub Pages)

This repo is set up to deploy to **GitHub Pages** automatically on every push to `main` via `.github/workflows/pages.yml`.

High level steps:

- Create a GitHub repo and push this folder to its `main` branch
- In GitHub, enable Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**
- After the workflow finishes, your game will be live at your Pages URL

## URLs (GitHub Pages)

If your repository is named `main-menu`, your links will look like:

- Main menu: `https://<user>.github.io/main-menu/`
- Flappy Blob: `https://<user>.github.io/main-menu/flappy-blob/`
- Snake: `https://<user>.github.io/main-menu/snake-game/`

## Controls

- Move: Arrow keys / WASD / swipe / on-screen d-pad
- Start: Space (or Start button)
- Pause: P (or Pause button)
- Restart: R (or Restart button)

## Difficulty + audio

- Easy / Medium / Hard changes **snake speed** and **grid size**
- Music + SFX toggles are in the top-right (audio starts after your first click/key press)

