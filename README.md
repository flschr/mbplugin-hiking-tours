# fischr Tours Plugin for Micro.blog

A lightweight Micro.blog/Hugo plugin that keeps the "tour" workflow simple: drop a shortcode into a post, optionally add a GPX file, and the plugin renders a clean box that inherits almost all of its styles from your blog theme. An optional `/tours/` page lists the collected tours using the data file that ships with the plugin.

## Features

- **Minimal tour shortcode** – semantic HTML with only the markup you need. The page theme handles the styling.
- **Optional GPX maps** – Leaflet + leaflet-gpx are loaded only when a tour actually references a GPX file.
- **Peak lists** – Provide peaks with or without coordinates. Named markers are added when coordinates are present.
- **Simple archive** – `/tours/` renders a plain list plus aggregated totals directly from `data/tours.json`.
- **Automation friendly** – Keep editing `data/tours.json` manually or generate it via the included GitHub Action example.

## Installation

### 1. Install the plugin
1. Open your Micro.blog **Settings → Plugins**.
2. Add `https://github.com/flschr/mbplugin-fischr-tours` and click **Install**.

### 2. Create the tours page
1. Go to **Posts → Pages → New Page**.
2. Title: `Tours`, URL: `/tours/`.
3. Set the page layout to `tours`.
4. Publish the page (optional intro text becomes the page description).

## Usage

### Tour shortcode

```markdown
{{< tour
  id="drei-gipfel-2025"
  title="Drei Gipfel gegen den Nebel"
  date="2025-11-07"
  type="hike"
  region="Bayerische Voralpen"
  distance_km="10.54"
  elevation_m="897"
  duration_h="6.13"
  gpx="/uploads/2025/drei-gipfel.gpx"
  peaks="Hoher Fricken (1940m)|47.4769|11.1302;Karkopf (1738m)"
>}}
```

### Parameters

| Required        | Description                                  |
|-----------------|----------------------------------------------|
| `id`            | Unique identifier (slug)                      |
| `title`         | Tour title                                    |
| `date`          | Date (`YYYY-MM-DD`)                           |
| `type`          | `hike`, `mtb`, `gravel`, `run`, or custom     |
| `distance_km`   | Distance in kilometers                       |
| `elevation_m`   | Elevation gain in meters                      |
| `gpx`           | Path/URL to the GPX file (optional map)       |

| Optional        | Description                                                |
|-----------------|------------------------------------------------------------|
| `region`        | Region label                                               |
| `duration_h`    | Duration in hours                                          |
| `max_height`    | Highest point in meters                                    |
| `bergfex_url`   | Link to the tour on Bergfex                                |
| `cover_image`   | Static fallback image when no GPX map is shown             |
| `peaks`         | Semicolon-separated list (see below)                       |

### Peaks

Provide peaks as a semicolon-separated string. Add coordinates either via `Name|lat|lng` or `Name:lat,lng:(meta)` to place a marker on the GPX map.

```
peaks="Hoher Fricken (1940m)|47.4769|11.1302;Karkopf (1738m)|47.4804|11.1449"
```

Entries without coordinates still appear in the ordered "Gipfelbuch" list below the tour details.

### Tours archive

`layouts/page/tours.html` renders the bundled `data/tours.json`. Edit that file manually or generate it automatically from your posts with the GitHub Action that lives in `backup-repo-example/.github/`. The archive keeps things simple: totals (count, km, hm) plus an unordered list with metadata pulled from every entry.

## Optional automation

The `SETUP.md` file and the `backup-repo-example` directory document a minimal GitHub Actions workflow that can parse your Micro.blog backup repo and push an updated `data/tours.json` back into this plugin repository. Use it if you prefer automation; otherwise, edit `data/tours.json` whenever you publish a new tour.

## File structure

```
mbplugin-fischr-tours/
├── plugin.json                # Plugin metadata
├── data/tours.json            # Source for the /tours/ page
├── layouts/
│   ├── shortcodes/tour.html   # Minimal tour box markup
│   └── page/tours.html        # Simple tours archive page
├── static/tours/tour-maps.js  # Leaflet initialisation for GPX maps
├── README.md / SETUP.md       # Documentation
└── backup-repo-example/       # Optional GitHub Action helper
```
