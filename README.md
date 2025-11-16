# fischr Tours Plugin

Ein Micro.blog Plugin für interaktive Tour-Widgets mit Karte, Statistiken und Gipfellisten.

## Installation

**Settings → Plugins** → `https://github.com/flschr/mbplugin-fischr-tours` → **Install**

## Verwendung

Shortcode in deinen Blog-Post einfügen:

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

**GPX hochladen:** Posts → Uploads → GPX-Datei hochladen → Pfad notieren

## Parameter

### Pflichtfelder
- `id` – Eindeutige ID (slug)
- `title` – Titel der Tour
- `date` – Datum (YYYY-MM-DD)
- `type` – Typ: `hike`, `mtb`, `gravel`, `run`
- `distance_km` – Distanz in km
- `elevation_m` – Höhenmeter
- `gpx` – Pfad zur GPX-Datei

### Optional
- `region` – Region
- `duration_h` – Dauer in Stunden
- `max_height` – Höchster Punkt in Metern
- `bergfex_url` – Link zu Bergfex
- `cover_image` – Fallback-Bild ohne Karte
- `peaks` – Gipfelliste (siehe unten)

### Gipfel

Gipfel als Semikolon-getrennte Liste. Mit Koordinaten (`Name:lat,lng`) werden Marker auf der Karte angezeigt:

```
peaks="Hoher Fricken (1940m):47.4769,11.1302;Karkopf (1738m):47.4804,11.1449"
```

## Was du bekommst

- Interaktive Leaflet-Karte mit GPX-Track
- Richtungspfeile und Start/Ziel-Marker (A/B)
- Nummerierte Peak-Marker auf der Karte
- Statistik-Grid (Distanz, Höhenmeter, Dauer)
- Feed-freundliche Ausgabe für RSS

## Support

Issues: https://github.com/flschr/mbplugin-fischr-tours/issues
