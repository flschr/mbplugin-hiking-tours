# Quick Setup Guide

This guide walks you through setting up the fischr Tours plugin for Micro.blog.

## Part 1: Plugin Installation

### 1.1 Install Plugin on Micro.blog

1. Go to Micro.blog **Settings** → **Plugins**
2. Add repository: `https://github.com/flschr/mbplugin-fischr-tours`
3. Click **Install**

### 1.2 Leaflet Libraries

Leaflet and the GPX helper are now loaded directly from trusted CDNs by the shortcode. No manual downloads are required.

### 1.3 Create Tours Page

1. In Micro.blog: **Posts** → **Pages** → **New Page**
2. Title: "Tours"
3. URL: `/tours/`
4. Layout: `tours` (set in page settings/frontmatter)
5. Optional: Add description text in the page content
6. Publish

## Part 2: Backup Repo Automation

### 2.1 Copy Required Files

Copy from this plugin repo to your Micro.blog backup repo:

```
.github/
├── workflows/
│   └── build-tours.yml
└── scripts/
    └── parse-tours.js
```

### 2.2 Configure Secrets

**Generate SSH deploy key:**

```bash
ssh-keygen -t ed25519 -C "tours-actions" -f tours-key -N ""
```

**Add to plugin repo** (Settings → Deploy keys):
- Title: "GitHub Actions Tours"
- Key: Contents of `tours-key.pub`
- ✅ Allow write access

**Add to backup repo** (Settings → Secrets → Actions):
- Name: `PLUGIN_DEPLOY_KEY`
- Value: Contents of `tours-key` (private key)

#### Mapbox Access Token (Required)

1. Create or log into your Mapbox account at [account.mapbox.com](https://account.mapbox.com/)
2. Generate a new access token with **Styles: Read** access (Static Images API is included by default)
3. Add the token to your backup repo secrets as `MAPBOX_ACCESS_TOKEN`

> The GitHub Action uses this token when `generate-map-images.js` calls the Mapbox Static Image API. Without it, static PNGs will not be created.

### 2.3 Edit Workflow Configuration

In your backup repo, edit `.github/workflows/build-tours.yml`:

```yaml
# TODO: Update these values
env:
  BLOG_BASE_URL: "https://YOUR-BLOG.org"      # Your blog URL
  PLUGIN_REPO: "YOUR-USERNAME/mbplugin-fischr-tours"  # Plugin repo
  CONTENT_DIR: "./content/posts"              # Where your posts are
```

### 2.4 Test the Workflow

1. Go to backup repo → **Actions** tab
2. Select "Build Tours Data"
3. Click **Run workflow**
4. Verify it completes successfully
5. Check plugin repo's `data/tours.json` was updated

## Part 3: Create Your First Tour

### 3.1 Upload GPX File

Upload your GPX file to Micro.blog:
- **Posts** → **Uploads** → upload GPX file
- Note the path: `/uploads/YYYY/filename.gpx`

### 3.2 Write Post with Tour Shortcode

```markdown
---
title: "My Mountain Hike"
date: 2025-11-12
---

Today's hike was amazing!

{{< tour
  id="my-first-tour"
  title="My Mountain Hike"
  date="2025-11-12"
  type="hike"
  region="Alps"
  distance_km="10.5"
  elevation_m="850"
  duration_h="4.5"
  gpx="/uploads/2025/my-hike.gpx"
>}}

The views from the summit were incredible...
```

### 3.3 Publish and Wait

1. Publish the post
2. Wait for next scheduled workflow run (4 AM UTC daily)
   - Or manually trigger it via Actions tab
3. Check `/tours/` page on your blog
4. Your tour should appear with a map!

## Verification Checklist

- [ ] Plugin installed on Micro.blog
- [ ] Leaflet libraries downloaded and committed
- [ ] Tours page created at `/tours/`
- [ ] Workflow files copied to backup repo
- [ ] Secrets configured (PLUGIN_DEPLOY_KEY)
- [ ] Secrets configured (MAPBOX_ACCESS_TOKEN)
- [ ] Workflow environment variables updated
- [ ] Test workflow run completed successfully
- [ ] First tour post published
- [ ] Tour appears on blog post with map
- [ ] Tour appears on `/tours/` page

## Troubleshooting

### Maps not showing
→ Check that Leaflet libraries were downloaded (see 1.2)

### Static map workflow failing
→ Ensure the `MAPBOX_ACCESS_TOKEN` secret is present in your backup repo
→ Check the GitHub Action logs for Mapbox HTTP errors or quota issues

### Tours page shows "No tours yet"
→ Run workflow manually to generate tours.json

### Workflow fails with "Permission denied"
→ Verify deploy key has write access enabled

### Parser finds no tours
→ Check `CONTENT_DIR` path in workflow matches your repo structure

## Configuration Reference

### Required Shortcode Parameters

- `id`, `title`, `date`, `type`, `distance_km`, `elevation_m`, `gpx`

### Optional Shortcode Parameters

- `region`, `duration_h`, `max_alt_m`, `min_alt_m`, `bergfex_url`, `cover_image`

### Tour Types

- `hike`, `mtb`, `gravel`, `run`, `other`

### Workflow Schedule

Default: Daily at 4 AM UTC

Change in workflow file:
```yaml
schedule:
  - cron: '0 4 * * *'  # Modify as needed
```

## Example Posts

See `backup-repo-example/fixtures/content/posts/` for complete examples:

- Hike with all parameters
- MTB tour with altitude data
- Gravel ride with Bergfex link
- Multiple tours in one post

## Support

- Plugin issues: https://github.com/flschr/mbplugin-fischr-tours/issues
- Full documentation: See README.md

---

Happy touring! 🥾
