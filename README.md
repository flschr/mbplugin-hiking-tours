# fischr Tours Plugin for Micro.blog

A comprehensive tours system for Micro.blog/Hugo that adds GPX-powered tour tracking with auto-generated static maps, filterable archive pages, and automated data aggregation.

## Features

- **Tour Shortcode**: Display tour info boxes with static map images in blog posts
- **Tours Archive Page**: Central `/tours/` page with filters (year, type) and live statistics
- **Automatic Map Generation**: GitHub Actions auto-generate static PNG maps from GPX files
- **Automated Data**: GitHub Action auto-generates tours.json from your blog posts
- **GPX Download**: Direct download links for GPX files in tour boxes
- **Responsive Design**: Mobile-friendly tour boxes and archive layout
- **Multiple Tour Types**: Hike, MTB, Gravel, Run, and custom types
- **Zero External Dependencies**: No CDN libraries, no JavaScript mapping libraries

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
  duration_h="6.13"
  gpx="/uploads/2025/drei-gipfel.gpx"
  bergfex_url="https://www.bergfex.de/mybergfex/activities/23511538"
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
- `max_alt_m`: Maximum altitude
- `min_alt_m`: Minimum altitude
- `bergfex_url`: Link to Bergfex activity
- `cover_image`: Path to cover image
- `map_image`: Path to custom static map image (defaults to auto-generated `/maps/{id}.png`)

### GPX File Locations

GPX files can be stored in two locations:

1. **Micro.blog Uploads**: `/uploads/YYYY/filename.gpx`
2. **Plugin Static**: `/gpx/filename.gpx` (place in `static/gpx/` in this repo)

## Automated Data & Map Generation

Tours are automatically collected from your blog posts, aggregated into `data/tours.json`, and static map images are generated from GPX files - all via GitHub Actions.

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

4. Configure environment variables in workflow:

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
4. Generates static PNG map images for each GPX track
5. Commits both `tours.json` and map images to the plugin repo

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
- Check GitHub Action logs for errors
- Verify `staticmaps` npm package installed correctly
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

- [staticmaps](https://github.com/StephanGeorg/staticmaps) - Static map image generation
- [OpenStreetMap](https://www.openstreetmap.org/) - Map tiles and data

---

Built for [Micro.blog](https://micro.blog/) by [fischr](https://fischr.org)
