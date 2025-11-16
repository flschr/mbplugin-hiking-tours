# Micro.blog Mini-Komoot Tour-Plugin

A Micro.blog plugin for interactive tour widgets with maps, statistics, and peak lists for your hike and bike trips. Very much like what you can get from Komoot, but without relying on their infrastructure.

## Usage

Add the shortcode to your blog post:

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
  peaks="Hoher Fricken (1940m):47.4769,11.1302;Karkopf (1738m)"
>}}
```

**Upload GPX:** Posts → Uploads → Upload GPX file → Note the path

## Parameters

### Required
- `id` – Unique identifier (slug)
- `title` – Tour title
- `date` – Date (YYYY-MM-DD)
- `type` – Type: `hike`, `mtb`, `gravel`, `run`
- `distance_km` – Distance in kilometers
- `elevation_m` – Elevation gain in meters
- `gpx` – Path to GPX file

### Optional
- `region` – Region name
- `duration_h` – Duration in hours
- `max_height` – Highest point in meters
- `bergfex_url` – Link to Bergfex
- `cover_image` – Fallback image without map
- `peaks` – Peak list (see below)

### Peaks

Peaks as semicolon-separated list. Add coordinates (`Name:lat,lng`) to display markers on the map:

```
peaks="Hoher Fricken (1940m):47.4769,11.1302;Karkopf (1738m):47.4804,11.1449"
```

## What you get

- Interactive Leaflet map with GPX track
- Direction arrows and start/finish markers (A/B)
- Numbered peak markers on the map
- Peaks that you passed multiple times in a trip, get a larger marker
- Statistics grid (distance, elevation, duration)

## Setup

Add a free MapTiler API key, to get beautiful outdoor maps. Without this key, rendering falls back to OSM standard map.
