# Voxel Earth

**Interactive browser prototype for a live 3D voxel Earth with weather-model-driven atmospheric layers.**

## Live Demo

View it here: https://barnickelus.github.io/Voxel-Earth/

(Enable GitHub Pages on the `main` branch in repo settings if the link doesn't work yet — it's already configured with `.nojekyll`.)

## What it does
- Real-time(ish) weather data from Open-Meteo sampled across the globe
- Voxelized visualization of:
  - Temperature columns (height + color = heat)
  - Cloud layers at different altitudes
  - Rain cells
  - Wind direction traces
  - Atmospheric voxel grid shell
- Toggle layers on/off
- Hover for live sample data
- Timeline scrubber to "rewind" the weather layers
- Procedural fallback if live API is unavailable

## Tech
- Three.js (via esm.sh for reliable static hosting)
- ES modules, no build step
- Pure vanilla JS + CSS

## Local development
Just open `index.html` in a browser (or use `npx serve`). Works great locally too.

## Recent fixes
- Switched to stable esm.sh CDN imports so OrbitControls and Three.js load reliably on GitHub Pages (previous jsDelivr paths were broken).

Made with ❤️ for the weird and wonderful.