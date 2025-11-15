# fischr Tours Plugin for Micro.blog

A comprehensive tours system for Micro.blog/Hugo that adds GPX-powered interactive maps, filterable archive pages, and automated data aggregation.

## Features

- **Tour Shortcode**: Display tour info boxes with interactive Leaflet maps powered by GPX tracks
- **Tours Archive Page**: Central `/tours/` page with filters (year, type) and live statistics
- **Interactive Maps**: Dynamic Leaflet maps with full GPX track rendering
- **Automated Data**: GitHub Action auto-generates tours.json from your blog posts
- **GPX Download**: Direct download links for GPX files in tour boxes
- **Responsive Design**: Mobile-friendly tour boxes and archive layout
- **Multiple Tour Types**: Hike, MTB, Gravel, Run, and custom types

## Installation

### 1. Install Plugin on Micro.blog

1. Go to your Micro.blog **Settings** → **Plugins**
2. Enter the repository URL: `https://github.com/flschr/mbplugin-fischr-tours`
3. Click **Install**

No additional setup required - the plugin is ready to use immediately!

### 2. Create Tours Page

1. In Micro.blog, go to **Posts** → **Pages**
2. Create a new page titled "Tours" with URL `/tours/`
3. Set the page layout to `tours` (under page settings)
4. Publish the page

## Usage

### Adding Tours to Blog Posts

Use the `tour` shortcode in any blog post:

```markdown
---
title: "Drei Gipfel gegen den Nebel"
date: 2025-11-07
---

Today I hiked three peaks in the Bavarian Prealps!

{{< tour
  id="drei-gipfel-2025"
  title="Drei Gipfel gegen den Nebel"
  date="2025-11-07"
  type="hike"
  region="Bayerische Voralpen"
  distance_km="10.54"
  elevation_m="897"
  max_height="1940"
  duration_h="6.13"
  gpx="/uploads/2025/drei-gipfel.gpx"
  bergfex_url="https://www.bergfex.de/mybergfex/activities/23511538"
  peaks="Hoher Fricken (1940m);Karkopf (1738m);Brünnstein (1619m)"
>}}

The views were spectacular...
```

### Shortcode Parameters

#### Required
- `id`: Unique identifier (slug-style)
- `title`: Tour title
- `date`: Date (YYYY-MM-DD format)
- `type`: Tour type (`hike`, `mtb`, `gravel`, `run`, `other`)
- `distance_km`: Distance in kilometers (float)
- `elevation_m`: Elevation gain in meters (integer)
- `gpx`: Path to GPX file (absolute or relative)

#### Optional
- `region`: Geographic region
- `duration_h`: Duration in hours (float)
- `max_height`: Maximum altitude in meters (integer)
- `bergfex_url`: Link to Bergfex activity
- `cover_image`: Path to cover image
- `peaks`: Semicolon-separated list of peaks with heights (e.g., "Peak 1 (1234m);Peak 2 (5678m)"). Append optional coordinates via `|lat|lng` or `:lat,lng:` style delimiters when you want the peak numbered on the map (e.g., `Hoher Fricken (1940m)|47.4769|11.1302` or `Hoher Fricken:47.4769,11.1302:(1940m)`).

### Peak markers on the map

Add numbered chips to the shortcode via `peaks="..."`. Each entry can optionally include latitude/longitude coordinates separated by pipes (`|`) or in the compact `Name:lat,lng:(Height)` format.

- Peaks **with coordinates** render a numbered marker on the Leaflet map (in chip order) and receive a tooltip with the name.
- Peaks **without coordinates** still appear in the chip list but won't place a marker.

Example with coordinates:

```
peaks="Hoher Fricken (1940m)|47.4769|11.1302;Karkopf (1738m)|47.4804|11.1449"
```

Alternative colon-separated style:

```
peaks="Jägerkamp:47.6736,11.9061:(1940m);Wildes Fräulein:47.6680,11.9036:(1738m)"
```

### GPX File Locations

GPX files can be stored in two locations:

1. **Micro.blog Uploads**: `/uploads/YYYY/filename.gpx`
2. **Plugin Static**: `/gpx/filename.gpx` (place in `static/gpx/` in this repo)

**Supported File Extensions**: The plugin accepts GPX files with any file extension (`.gpx`, `.xml`, etc.) as long as the file contains valid GPX XML data. The Leaflet GPX plugin parses the file content, not the extension.

## Automated Data Aggregation

Tours are automatically collected from your blog posts and aggregated into `data/tours.json` via GitHub Actions.

### Setup (in your Micro.blog backup repo)

1. Copy `.github/workflows/build-tours.yml` to your backup repo
2. Copy `.github/scripts/parse-tours.js` to your backup repo
3. Copy `.github/scripts/package.json` to your backup repo
4. Set up GitHub secrets:

#### Option A: Deploy Key (Recommended)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "github-actions-tours" -f tours-deploy-key

# Add public key to plugin repo
# Settings → Deploy keys → Add deploy key
# - Title: "GitHub Actions Tours"
# - Key: [paste tours-deploy-key.pub]
# - Allow write access: ✓

# Add private key to backup repo
# Settings → Secrets → Actions → New repository secret
# Name: PLUGIN_DEPLOY_KEY
# Value: [paste tours-deploy-key contents]
```

#### Option B: Personal Access Token

Create a PAT with `repo` scope and add as `PLUGIN_PAT` secret.

5. Configure environment variables in workflow:

```yaml
env:
  BLOG_BASE_URL: "https://fischr.org"
  PLUGIN_REPO: "flschr/mbplugin-fischr-tours"
  CONTENT_DIR: "./content/posts"
```

### What the Workflow Does

When triggered, the GitHub Action:
1. Parses all tour shortcodes from your markdown posts
2. Generates `tours.json` with aggregated tour data
3. Commits `tours.json` to the plugin repo

### Manual Trigger

Run the workflow manually:
1. Go to backup repo → **Actions** → **Build Tours Data**
2. Click **Run workflow**

## File Structure

```
mbplugin-fischr-tours/
├── plugin.json                           # Plugin metadata
├── data/
│   └── tours.json                       # Auto-generated tours data
├── layouts/
│   ├── shortcodes/
│   │   └── tour.html                    # Tour shortcode template
│   └── page/
│       └── tours.html                   # Tours archive page
├── static/
│   └── tours/
│       ├── archive.js                   # Archive filters & stats
│       └── tour-maps.js                 # Leaflet map initialization
├── assets/tours/
│   └── styles.css                       # Tour component styles
└── .github/
    ├── workflows/
    │   └── build-tours.yml              # GitHub Action workflow
    └── scripts/
        ├── parse-tours.js               # Tour data parser
        └── package.json                 # Script dependencies
```

## Tours Archive Page

The `/tours/` page displays:

- **Statistics**: Total tours, distance, elevation
- **Filters**: Filter by year and tour type
- **Tour List**: All tours with metadata and links to posts

Statistics update dynamically as you filter.

## Development

### Local Testing

To test the parser locally:

```bash
cd backup-repo
node .github/scripts/parse-tours.js
```

This generates `tours.json` in the current directory.

### Plugin Development

1. Clone this repo
2. Make changes to layouts, scripts, or styles
3. Test with Hugo locally if possible
4. Push changes (Micro.blog will pull updates)

## Security

- All user parameters are properly escaped (XSS protection)
- GPX URLs are validated before loading
- No `innerHTML` usage with user data
- Deploy keys/PAT have minimal required permissions

## Tour Types

The plugin supports these tour types with emoji indicators:

- 🥾 **hike**: Hiking tours
- 🚵 **mtb**: Mountain biking
- 🚴 **gravel**: Gravel cycling
- 🏃 **run**: Running tours
- ⛰️ **other**: Custom tour types

## Troubleshooting

### Maps not displaying
- Check that GPX file path is correct and accessible
- Verify Leaflet libraries are loading (check browser console)
- Ensure GPX file contains valid track points
- Check that `data-gpx` attribute is set correctly

### Tours not appearing on /tours/ page
- Check `data/tours.json` exists and contains tours
- Verify GitHub Action ran successfully
- Ensure page layout is set to `tours`
- Check browser console for JavaScript errors in archive.js

### Shortcode not rendering
- Verify all required parameters are present
- Check for typos in parameter names
- Ensure shortcode syntax is correct: `{{< tour ... >}}`

## Contributing

Issues and pull requests welcome!

## License

MIT License - see LICENSE file

## Credits

- [Leaflet](https://leafletjs.com/) - Interactive map library
- [Leaflet GPX Plugin](https://github.com/mpetazzoni/leaflet-gpx) - GPX track rendering for Leaflet
- [OpenStreetMap](https://www.openstreetmap.org/) - Map data and tiles

---

Built for [Micro.blog](https://micro.blog/) by [fischr](https://fischr.org)
