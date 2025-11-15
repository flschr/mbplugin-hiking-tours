# fischr Tours Plugin for Micro.blog

A comprehensive tours system for Micro.blog/Hugo that adds GPX-powered tour tracking with auto-generated static maps, filterable archive pages, and automated data aggregation.

## Features

- **Tour Shortcode**: Display tour info boxes with auto-generated static maps (with GPX-based live fallback if no PNG exists)
- **Tours Archive Page**: Central `/tours/` page with filters (year, type) and live statistics
- **Automatic Map Generation**: GitHub Actions call the Geoapify Static Map API to create PNG maps from every GPX track
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

### 2. Configure Plugin Settings (Optional)

For static map previews generated at Hugo build time:

1. Go to your Micro.blog **Settings** → **Plugins**
2. Click **Edit** on the fischr Tours plugin
3. Configure the following:
   - **Geoapify API Key**: Get a free key at [geoapify.com](https://www.geoapify.com/) (3000 requests/day)
   - **Map Style**: Choose from `osm-carto` (default), `osm-bright`, `dark-matter`, `positron`, etc.
   - **Map Width/Height**: Adjust dimensions (default: 768x432, 16:9 aspect ratio)

Without an API key, the plugin will use pre-generated map PNGs (via GitHub Actions) or dynamic Leaflet maps.

### 3. Create Tours Page

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
  map_center="47.7,11.9"
  map_zoom="13"
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
- `map_center`: Center coordinates for static map preview (format: "lat,lon", e.g., "47.5,11.0")
- `map_zoom`: Zoom level for static map preview (0-19, default: 12)
- `map_image`: Path to custom static map image (overrides all other map sources)
- `peaks`: Semicolon-separated list of peaks with heights (e.g., "Peak 1 (1234m);Peak 2 (5678m)")

**Map Display Priority:**
1. Custom `map_image` (if provided)
2. Geoapify static map (if `map_center` provided + API key configured in plugin settings)
3. Pre-generated PNG from GitHub Actions (`/maps/{id}.png`)
4. Dynamic Leaflet map with GPX track (if `gpx` provided)

### GPX File Locations

GPX files can be stored in two locations:

1. **Micro.blog Uploads**: `/uploads/YYYY/filename.gpx`
2. **Plugin Static**: `/gpx/filename.gpx` (place in `static/gpx/` in this repo)

## Automated Data & Map Generation

Tours are automatically collected from your blog posts, aggregated into `data/tours.json`, and static map images are generated from GPX files - all via GitHub Actions.

> ℹ️ Map generation now relies on the Geoapify Static Map API. Create a free Geoapify API key (3000 requests/day free tier) and add it to your backup repo as `GEOAPIFY_API_KEY` so the workflow can request the PNGs.

### Setup (in your Micro.blog backup repo)

1. Copy `.github/workflows/build-tours.yml` to your backup repo
2. Copy `.github/scripts/parse-tours.js` to your backup repo
3. Copy `.github/scripts/generate-map-images.js` to your backup repo
4. Copy `.github/scripts/package.json` to your backup repo
5. Set up GitHub secrets:

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

#### Geoapify API Key (Required)

1. Create a free account at [Geoapify](https://www.geoapify.com/) (3000 requests/day free tier)
2. Go to your [Geoapify Dashboard](https://myprojects.geoapify.com/) and generate an API key
3. Add a repository secret named `GEOAPIFY_API_KEY` in your backup repo with that API key value

> The GitHub Action uses this key to request static PNG maps for each GPX track. Without it, map generation will fail. The free tier is generous enough for most personal blogs.

6. Configure environment variables in workflow:

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
3. Finds all GPX files referenced in tours
4. Generates static PNG map images for each GPX track via the Geoapify Static Map API
5. Commits both `tours.json` and map images to the plugin repo

### Map Rendering Options

Customize how the generated PNGs look by setting environment variables before running `generate-map-images.js`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAP_IMAGE_WIDTH` / `MAP_IMAGE_HEIGHT` | `800` / `400` | Output PNG size |
| `MAP_SCALE_FACTOR` | `2` | Scale factor for retina displays (1 or 2) |
| `GEOAPIFY_STYLE` | `osm-carto` | Map style (see [Geoapify styles](https://apidocs.geoapify.com/docs/maps/map-tiles/)) |
| `MAP_PATH_COLOR` | `#0ea5e9` | Track color (hex) |
| `MAP_PATH_WIDTH` | `3` | Track stroke width in pixels |
| `MAP_PATH_OPACITY` | `0.9` | Track stroke opacity (0–1) |
| `MAX_TRACK_POINTS` | `2000` | Maximum GPX points (simplified if exceeded) |

**Available Geoapify Styles**: `osm-carto`, `osm-bright`, `osm-bright-grey`, `klokantech-basic`, `dark-matter`, `positron`, and more.

All variables are optional—the defaults are tuned for typical outdoor tour previews.

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
│   ├── tours/
│   │   └── archive.js                   # Archive filters & stats
│   └── maps/
│       └── *.png                        # Auto-generated map images
├── assets/tours/
│   └── styles.css                       # Tour component styles
└── .github/
    ├── workflows/
    │   └── build-tours.yml              # GitHub Action workflow
    └── scripts/
        ├── parse-tours.js               # Tour data parser
        ├── generate-map-images.js       # Static map generator
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
- Check that the GitHub Action ran successfully and generated map images
- Verify map images exist in `static/maps/` directory in plugin repo
- Check that GPX file paths in tours are correct
- Look for `*.png` files matching your tour IDs

### Tours not appearing on /tours/ page
- Check `data/tours.json` exists and contains tours
- Verify GitHub Action ran successfully
- Ensure page layout is set to `tours`
- Check browser console for JavaScript errors in archive.js

### Map generation failing
- Ensure GPX files are accessible in your backup repo
- Check GitHub Action logs for errors (especially Geoapify API responses)
- Verify the `GEOAPIFY_API_KEY` secret exists and is valid
- Check you haven't exceeded the free tier limit (3000 requests/day)
- Ensure GPX files are valid and contain track points

### Shortcode not rendering
- Verify all required parameters are present
- Check for typos in parameter names
- Ensure shortcode syntax is correct: `{{< tour ... >}}`

## Contributing

Issues and pull requests welcome!

## License

MIT License - see LICENSE file

## Credits

- [Geoapify Static Map API](https://www.geoapify.com/static-maps-api/) - Static map rendering for PNG exports
- [OpenStreetMap](https://www.openstreetmap.org/) - Map data and Leaflet fallback tiles
- [Leaflet](https://leafletjs.com/) - Interactive map library for dynamic fallback

---

Built for [Micro.blog](https://micro.blog/) by [fischr](https://fischr.org)
