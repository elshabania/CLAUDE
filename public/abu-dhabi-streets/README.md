# Abu Dhabi Streets

A standalone web app that shows Abu Dhabi on a Google Maps basemap with the
city's street network rendered as glowing, toggleable overlay layers:

- **Main Streets** — motorways, trunk, primary, secondary and tertiary roads
  (warm sunset palette, width scaled by road class)
- **Local Streets** — residential, living streets, unclassified and pedestrian
  streets (cyan)

Street geometry is fetched live from OpenStreetMap via the Overpass API for
the current viewport and rendered with [deck.gl](https://deck.gl) on top of
the Google Maps JavaScript API.

## Features

- Layer switches to activate/deactivate main and local streets independently
- Per-layer stats: segment count and total kilometres in view
- Hover any street to see its name and classification
- Dark / Light / Satellite basemap switcher (custom dark style by default)
- "Fly to" shortcuts: Corniche, Yas Island, Saadiyat, Al Reem, Khalifa City
- Glassmorphism control panel, collapsible on small screens

## Run

No build step — it's a static page:

```bash
cd public/abu-dhabi-streets
python3 -m http.server 8080
# open http://localhost:8080
```

It also ships with the repo's Next.js deployment at `/abu-dhabi-streets`.

On first launch the app asks for a **Google Maps JavaScript API key**
(create one in the [Google Cloud Console](https://developers.google.com/maps/documentation/javascript/get-api-key)
with the *Maps JavaScript API* enabled). The key is stored in your browser's
localStorage only. You can also pass it in the URL:

```
http://localhost:8080/?key=YOUR_KEY
```

Use the **API key** button in the panel footer to change it later.

## Notes

- Local streets load when zoomed to level 13 or closer (the dataset is dense);
  a hint appears in the panel when you need to zoom in.
- Data is re-fetched automatically as you pan/zoom, with a padded bounding box
  and multiple Overpass mirrors for resilience.
- Street data © OpenStreetMap contributors.
