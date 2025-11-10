# Hiking Tours Plugin for Micro.blog / Hugo

Ein Hugo-Plugin für die Visualisierung von Wandertouren aus GPX-Dateien - eine einfache, datenschutzfreundliche Alternative zu Komoot.

## Features

🗺️ **Interaktive Karte** - Alle Touren auf einer Leaflet-Karte mit Heatmap-Visualisierung
📋 **Filterbare Tour-Liste** - Nach Distanz, Höhe, Datum und Schwierigkeit filtern
⛰️ **Automatisches Gipfelbuch** - Erkennt und listet alle bestiegenen Gipfel
📊 **Detaillierte Statistiken** - Gesamtdistanz, Höhenmeter, Zeit pro Tour
🔍 **Zoom & Explore** - Von Heatmap-Übersicht bis zur einzelnen Tour

## Quick Start

### 🌐 Live Demo

**GitHub Pages:** [https://flschr.github.io/mbplugin-hiking-tours](https://flschr.github.io/mbplugin-hiking-tours)

Oder lokal: Öffne `demo/index.html` im Browser für eine vollständige Demo aller Features.

#### GitHub Pages aktivieren

1. Gehe zu deinem Repository → **Settings** → **Pages**
2. Unter **Source** wähle:
   - **Branch:** `main` (oder dein Hauptbranch)
   - **Folder:** `/ (root)` oder `/docs`
3. Klicke **Save**
4. Nach 1-2 Minuten ist deine Demo online unter `https://<username>.github.io/<repo-name>`

### Installation (Coming Soon)

```bash
# Als Hugo Module
hugo mod get github.com/flschr/mbplugin-hiking-tours

# Oder als Git Submodule
git submodule add https://github.com/flschr/mbplugin-hiking-tours.git themes/hiking-tours
```

## Verwendung

### 1. GPX-Dateien hochladen

Lege deine GPX-Dateien in `static/uploads/gpx/` ab.

### 2. Shortcodes nutzen

```markdown
# Meine Wandertouren

{{< hiking-map >}}

## Alle Touren
{{< hiking-list filters="true" >}}

## Gipfelbuch
{{< hiking-summit-book >}}
```

## Konfiguration

In deiner `config.toml`:

```toml
[params.hikingTours]
  gpxDirectory = "uploads/gpx"
  summitMinElevation = 1000  # Mindesthöhe für Gipfel in Metern
  summitProminence = 100     # Minimale Prominenz für Gipfelerkennung
  mapCenter = [47.0, 11.0]   # Zentrum der Karte [Lat, Lng]
  mapZoom = 9                # Standard-Zoom-Level
  heatmapRadius = 15         # Radius der Heatmap-Punkte
```

## Technologie

- **Leaflet.js** - Kartendarstellung
- **Leaflet.heat** - Heatmap-Visualisierung
- **GPX Parser** - Client-seitiges oder Build-Zeit Parsing
- **Vanilla JavaScript** - Keine Framework-Abhängigkeiten

## Roadmap

- [x] Interaktive Demo
- [ ] Hugo Shortcodes
- [ ] GPX Build-Zeit Processing
- [ ] Höhenprofil-Visualisierung
- [ ] Export-Funktionen
- [ ] Mobile Optimierung
- [ ] Offline-Karten Support

## Lizenz

MIT License - siehe [LICENSE](LICENSE)

## Autor

Entwickelt für die Micro.blog Community
