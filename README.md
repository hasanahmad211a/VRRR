# Ember to Ocean

A field-notebook website for exploring the possible links between wildfire, smoke, river conditions, and salmon. This is the complete static website code, ready for a new GitHub repository. No build step or npm installation is required.

## Publish with GitHub Pages

1. Create a new **public** repository on GitHub.
2. Extract this ZIP and upload **all the extracted files and folders** to the repository root. `index.html`, `css/`, `js/`, and `data/` must be beside this README. Do not upload only the ZIP file.
3. Commit the files to `main`.
4. Open **Settings → Pages**. Choose **Deploy from a branch**, select **main** and **/ (root)**, then **Save**.
5. When deployment completes, GitHub displays your website URL on that Pages settings screen.

The included `.nojekyll` file lets Pages serve the static website directly. It is safe to include even if your upload tool hides it.

## What is included

- Warm field-notebook styling and an original schematic river illustration.
- Clickable Fire → Air → Water → Salmon explanations.
- The original scientific country/basin explorer, timeline, charts, and statistics.
- A three-question evidence challenge with feedback, score, and replay.
- Accessible fire-year shortcuts and shareable country/year/view/measurement links.
- A lightweight geographic overview when the full map is unavailable.

## Data and attribution

Based on [Samisaurus/Correction-VR](https://github.com/Samisaurus/Correction-VR), the Ember to Ocean NASA Space Apps 2026 project. Original data and statistical modules are retained. No missing measurements are filled with invented values. The current year may be incomplete.

This ZIP includes the site code, country geometry, small scope files, and the published precomputed data index. **Large spatial fire CSV files and several summary/outage CSVs stream from the original project's GitHub Pages deployment**, through URLs in `data/manifest.json`. That original data host must remain available for the corresponding spatial observations. This package does not contain the full raw data corpus. You can migrate those files to another host later and update their manifest URLs.

External libraries and services include Google Fonts, MapLibre and maplibre-contour from unpkg, Observable Plot from jsDelivr, OpenFreeMap, and AWS Terrain Tiles. The illustrated introduction and educational challenge use plain JavaScript.

## Edit the website

- `index.html`: the introduction, illustration, pathway, reading guide, and footer.
- `css/field-notes.css`: the redesign and responsive layouts.
- `js/ui/field-notes.js`: pathway explanations.
- `js/ui/field-challenge.js`: challenge questions and behavior.
- `js/main.js`: module mounting and shareable views.
- `js/map/`: full map and geographic fallback.
- `data/manifest.json`: remote data-file locations.

## Preview locally

From this folder, run `python3 -m http.server 3000`, then open `http://localhost:3000`. Use a static server because browser JavaScript modules and data loading do not work correctly by double-clicking the HTML file.

## Contributions

Once this repository is public, anyone can fork it, edit their fork, and open a pull request. Repository owners decide which changes to merge. Public visibility does not give everyone direct write access. See CONTRIBUTING.md.
