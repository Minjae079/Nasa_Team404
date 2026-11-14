# Catalog star background

Source: [d3-celestial by Olaf Frohn](https://github.com/ofrohn/d3-celestial).
The original stars.6.json (5,044 stars) and constellations.lines.json are included with the upstream BSD license in LICENSE.

The home screen now uses src/components/Starfield.jsx and src/skyProjection.js.
Catalog right ascension and declination become unit vectors on a sphere. A perspective projection follows the globe camera longitude, latitude, bearing and pitch, including intro motion, dragging and reset. Zoom does not enlarge stars: they represent a distant background.
Star size and brightness follow magnitude, with restrained B−V colors and soft halos on the brightest stars. Chart connection lines are omitted for a natural sky appearance. No runtime external sky requests are made.

This is a decorative inertial backdrop, not a date-, observer- or sidereal-time-calibrated astronomy simulation, and is not NASA imagery. The legacy build-sky.mjs / constellation-sky.svg remain optional offline chart tools; the app no longer loads that SVG.

The app imports stars.compact.json, a lossless tuple-only build of the source catalog. Run node assets/sky/build-sky.mjs to regenerate it together with the legacy SVG.
