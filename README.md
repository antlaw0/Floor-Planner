# Rowan Furniture Planner v6

Static GitHub Pages edition for:

https://github.com/antlaw0/Floor-Planner

The deployed Pages URL will normally be:

https://antlaw0.github.io/Floor-Planner/

## Architecture


## Adaptive screen layout

V6 detects the usable browser viewport at runtime rather than relying on one fixed mobile
breakpoint.

The app switches among four interface profiles:

- desktop
- unfolded/foldable portrait
- unfolded/foldable landscape
- compact phone

On an unfolded Samsung Galaxy Z Fold-class screen in portrait orientation, the screen is
split into two live panes:

- the upper pane keeps the entire floor plan visible at Fit/100%
- the lower pane contains independently scrollable controls

The map therefore stays visible while configuration, reusable furniture, editing, grid,
calibration, and backup controls are used.

On an unfolded device in landscape orientation, the app uses a side-by-side map/control
layout.

A sticky seven-button section bar in the control pane jumps directly to Layout, Library,
Edit, Placed, Grid, Scale, or Backup controls. Compact layouts keep one control section
open at a time to reduce scrolling.

The layout is recalculated on:

- initial launch
- browser resize
- fold/unfold viewport changes exposed to the browser
- orientation changes
- Android browser UI changes that resize the visual viewport

The Fit control recalculates the floor-plan size from the space actually available to the
map, so 100% means "fully visible in the current map pane" rather than "full image pixel
size."


This version has no Node server and no external database.

GitHub Pages hosts only the static application:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `assets/`

Saved data stays on the device in the browser's IndexedDB storage.

There are two independent saved-data collections:

1. Configurations
2. Reusable furniture

Reusable furniture behaves as a template. Adding furniture from the library creates an
independent copy in the current room configuration. Editing or deleting the library
template later does not change copies that are already stored in configurations.

## Important device-storage limitation

A configuration saved on one device does NOT automatically appear on another device.

For example:

- a layout saved on Briana's Fold remains on that Fold;
- a layout saved on a Windows computer remains in that browser on that computer.

This is intentional for the current no-database version.

Use the built-in JSON export/import tools to move individual configurations or furniture,
or use **Export full device backup** to move everything.

Clearing browser/site data can erase IndexedDB. Export full backups periodically.

## GitHub Pages setup

1. Extract this ZIP.
2. Upload all files and the `assets` folder to the root of:
   `https://github.com/antlaw0/Floor-Planner`
3. Commit the files to the `main` branch.
4. In GitHub, open the repository.
5. Open **Settings**.
6. Open **Pages**.
7. Under **Build and deployment**, choose **Deploy from a branch**.
8. Choose branch `main`.
9. Choose folder `/ (root)`.
10. Save.
11. Wait for GitHub Pages deployment to finish.

The site should then appear at:

https://antlaw0.github.io/Floor-Planner/

## PWA / phone use

The app includes a manifest and service worker.

Once the GitHub Pages site is live, Chrome on Android can add it to the home screen.
The service worker caches the app assets for offline startup after the first successful
visit.

Saved configurations and furniture remain in IndexedDB on that browser/device.

## Configuration compatibility

Current room-configuration schema: 4.

The app imports/migrates:

- v1/unversioned layouts from the original standalone app
- v2 layouts
- v3 local-server layouts
- v4 local-server layouts

Current reusable-furniture schema: 1.

## Backup formats

Individual configurations:
`*.rowan-layout.json`

Individual reusable furniture:
`*.rowan-furniture.json`

Full-device backup:
`rowan-floor-planner-backup-YYYY-MM-DD.json`

The full-device backup includes all saved configurations and all reusable furniture from
the current browser/device.

## Updating the app

Replace the repository files with a newer version and commit them.

Do not manually delete browser site data when upgrading unless you have first exported a
full device backup.

The static application version can change independently from the saved JSON schema
versions.
