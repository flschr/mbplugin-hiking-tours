# fischr Tours Plugin for Micro.blog

A lightweight Micro.blog/Hugo plugin that adds an interactive tour widget to your blog posts. Drop a shortcode into your post, optionally add a GPX file, and the plugin renders a clean tour box with an interactive map, statistics, and peak lists.

## Features

- **Minimal tour shortcode** – semantic HTML with clean styling that adapts to your blog theme
- **Optional GPX maps** – Interactive Leaflet maps with track visualization, direction arrows, and endpoint markers
- **Peak lists** – Display peak lists with optional map markers when coordinates are provided
- **Feed-friendly** – Simplified text output for RSS/JSON/Atom feeds

## Installation

1. Open your Micro.blog **Settings → Plugins**
2. Add `https://github.com/flschr/mbplugin-fischr-tours` and click **Install**

That's it! The plugin is ready to use.

## Usage

### Tour shortcode

Add a tour widget to any blog post:

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

Peak markers on GPX maps use OpenStreetMap's stock note flag icon.

### Uploading GPX files

1. Go to **Posts** → **Uploads** in Micro.blog
2. Upload your GPX file
3. Note the path: `/uploads/YYYY/filename.gpx`
4. Use this path in the `gpx` parameter

**Note**: GPX files can have `.gpx` or `.xml` extensions - both work!

## File structure

```
mbplugin-fischr-tours/
├── plugin.json                # Plugin metadata
├── layouts/shortcodes/
│   └── tour.html              # Tour widget shortcode
├── static/tours/
│   ├── tour-maps.js           # Leaflet map initialization
│   └── note.svg               # Peak marker icon
└── README.md                  # Documentation
```

## Features

### Interactive Maps

When you provide a GPX file, the plugin renders an interactive Leaflet map with:

- **Track visualization** – Blue track line with white outline
- **Direction arrows** – Evenly spaced arrows showing direction of travel
- **Start/End markers** – "A" and "B" markers showing route endpoints
- **Peak markers** – Numbered flag markers for peaks with coordinates
- **Responsive design** – Maps adapt to all screen sizes

### Statistics Grid

The widget displays key tour statistics in a clean grid layout:

- Distance (km)
- Elevation gain (m)
- Duration (hours)
- Highest point (m)

### Peak List (Gipfelbuch)

Named peaks appear in a numbered list with orange badges. When coordinates are provided, clicking a peak name opens a popup on the map showing the peak location.

## Support

- Issues: https://github.com/flschr/mbplugin-fischr-tours/issues
