# Neon Snake (aesthetic Google-style Snake)

Static HTML/CSS/JS snake game with a neon/glass UI, particles, best score storage, keyboard + touch controls.

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

## Controls

- Move: Arrow keys / WASD / swipe / on-screen d-pad
- Start: Space (or Start button)
- Pause: P (or Pause button)
- Restart: R (or Restart button)

## Difficulty + audio

- Easy / Medium / Hard changes **snake speed** and **grid size**
- Music + SFX toggles are in the top-right (audio starts after your first click/key press)

