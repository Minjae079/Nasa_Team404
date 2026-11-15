/* SARSCOPE: basemaps are geographic context, not SAR measurements. */
export function createExplorer(maplibregl, { onSelection, onCamera } = {}) {
  const IIT = Object.freeze({ lat: 41.83531, lng: -87.627, name: "Illinois Tech" });
  const START = { center: [-86, 34], zoom: 2.0, bearing: 0, pitch: 0 };
  const INTRO_ZOOM = -0.75;
  const homeZoom = () => window.innerWidth > 0 && window.innerWidth <= 900 ? 0.95 : START.zoom;
  const DETAIL_ZOOM = 6;
  const PHOTO_ZOOM = 2.2; // Slightly wider Earth framing while the analysis panel is open.
  // 수정된 부분: duration in milliseconds for View local map.
  const LOCAL_MAP_FLIGHT_MS = 2400;
  const SCENE_FLIGHT_MS = 1200;
  const $ = id => document.getElementById(id);
  const globeScene = $("globeScene");
  globeScene.style?.setProperty("--scene-motion-duration", `${SCENE_FLIGHT_MS}ms`);
  const mapScene = $("mapScene");
  const compareScene = $("compareScene");
  const fallback = $("globeFallback");
  const listeners = [];
  let disposed = false;
  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }
  let map;
  let marker;
  let framePaddingKey = "";
  let updatingMapFrame = false;
  let mode = "globe";
  let currentTarget = { ...IIT };
  let comparisonRequestId = 0;
  let comparisonPairs = [];
  let lastComparedPoint = null;
  let activeBasemap = "satellite";
  let rasterConfig = null;
  let selectedLocation = false;
  let cameraDestination = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileLayout = window.matchMedia("(max-width: 800px)");

  let rotationFrame = null;
  let previousRotationTime = null;
  let homeMotionPending = false;
  let motionInterrupted = false;
  let introActive = false;
  function stopGlobeMotion() {
    homeMotionPending = false;
    introActive = false;
    if (rotationFrame !== null) window.cancelAnimationFrame(rotationFrame);
    rotationFrame = null;
    previousRotationTime = null;
  }
  function startGlobeRotation({ intro = false } = {}) {
    if (disposed || reducedMotion.matches || mode !== "globe" || rotationFrame !== null) return;
    introActive = intro;
    let introElapsed = 0;
    function rotate(time) {
      rotationFrame = null;
      if (disposed || reducedMotion.matches || mode !== "globe") return;
      const elapsed = previousRotationTime === null ? 0 : Math.min(time - previousRotationTime, 64);
      previousRotationTime = time;
      if (!document.hidden) {
        const center = map.getCenter();
        const camera = { center: [((center.lng - elapsed * 0.006 + 540) % 360) - 180, center.lat] };
        if (introActive) {
          introElapsed += elapsed;
          const progress = Math.min(introElapsed / 3000, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          camera.zoom = progress === 1 ? homeZoom() : INTRO_ZOOM + (homeZoom() - INTRO_ZOOM) * eased;
          if (progress === 1) introActive = false;
        }
        // One camera update rotates and approaches together, then keeps rotating.
        map.jumpTo(camera);
      }
      rotationFrame = window.requestAnimationFrame(rotate);
    }
    rotationFrame = window.requestAnimationFrame(rotate);
  }

  // A single MapLibre canvas renders the globe and local map.
  function initGlobe() {
    if (typeof maplibregl === "undefined") { fallback.hidden = false; return; }
    try {
      map = new maplibregl.Map({
        container: "globeViz", ...START, center: reducedMotion.matches ? START.center : [START.center[0] + 18, START.center[1]], zoom: reducedMotion.matches ? homeZoom() : INTRO_ZOOM, minZoom: INTRO_ZOOM, maxZoom: 19,
        attributionControl: { compact: true }, doubleClickZoom: false,
        style: {
          version: 8, projection: { type: "globe" },
          sources: {
            earth: { type: "raster", tileSize: 256, maxzoom: 8,
              tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"],
              attribution: "Earth imagery: NASA Blue Marble / GIBS" },
            satellite: { type: "raster", tileSize: 256, maxzoom: 19,
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              attribution: "Imagery &copy; Esri and its imagery contributors" },
            streets: { type: "raster", tileSize: 256, maxzoom: 19,
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
          },
          layers: [
            { id: "satellite", type: "raster", source: "satellite" },
            { id: "earth", type: "raster", source: "earth", paint: {
              "raster-opacity": ["interpolate", ["linear"], ["zoom"], 4, 1, 6, 0],
              "raster-saturation": -0.12,
              "raster-contrast": 0.015,
              "raster-brightness-min": 0.055,
              "raster-fade-duration": 400
            } },
            { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } }
          ],
          sky: { "sky-color": "#050b16", "horizon-color": "#bddfff",
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 5, 0.85, 7, 0] }
        }
      });
      syncMapFrame();
      map.getCanvas().setAttribute("aria-label", "Earth map: drag, scroll or pinch to zoom continuously from globe to streets");
      // No second renderer, tile cache reset, delayed swap or click is needed.
      function syncSkyCamera() {
        onCamera?.({ lng: map.getCenter().lng, lat: map.getCenter().lat,
          bearing: map.getBearing(), pitch: map.getPitch(),
          offsetX: ((map.getPadding?.().left || 0) - (map.getPadding?.().right || 0)) / 2,
          offsetY: ((map.getPadding?.().top || 0) - (map.getPadding?.().bottom || 0)) / 2 });
      }
      map.on("move", syncSkyCamera);
      syncSkyCamera();
      map.on("zoom", syncZoomMode);
      // Stop before a drag or wheel gesture so animation never fights the user.
      for (const eventName of ["mousedown", "touchstart", "wheel"]) {
        map.on(eventName, () => {
          motionInterrupted = true;
          const interruptIntro = homeMotionPending || introActive;
          stopGlobeMotion();
          if (interruptIntro) map.stop();
        });
      }
      map.on("movestart", event => {
        if (event.originalEvent) {
          motionInterrupted = true;
          stopGlobeMotion();
          cameraDestination = null;
        }
      });
      map.on("moveend", () => {
        if (updatingMapFrame) return;
        cameraDestination = null;
        syncZoomMode();
        if (homeMotionPending && mode === "globe") {
          homeMotionPending = false;
          startGlobeRotation();
        }
      });
      map.on("dblclick", event => {
        const { lat, lng } = event.lngLat;
        if (mode === "map") {
          currentTarget = { lat, lng, name: isNearIIT(lat, lng) ? IIT.name : "Selected location" };
          selectedLocation = true;
          showSelectionMarker(lat, lng);
          updateLocationPanel();
        } else flyTo(lat, lng);
      });
      map.on("load", () => {
        applyBasemap();
        installRasterLayers();
        if (!motionInterrupted && mode === "globe" && !reducedMotion.matches) {
          startGlobeRotation({ intro: true });
        }
      });
      map.on("error", event => {
        console.error("Map resource unavailable", event.error);
        $("mapLoadStatus").hidden = false;
        $("mapLoadStatus").textContent = "Some map tiles could not load. Check your connection and try zooming again.";
      });
      map.on("idle", () => { $("mapLoadStatus").hidden = true; });
      listen(window, "resize", resizeGlobe);
    } catch (error) {
      console.error("Unable to create Earth map", error);
      fallback.hidden = false;
    }
  }
  function showSelectionMarker(lat, lng) {
    if (!map) return;
    marker ??= new maplibregl.Marker({ color: "#d5fa79" });
    marker.setLngLat([lng, lat]).addTo(map);
  }
  function scenePadding() {
    const desktop = window.innerWidth > 900;
    // The non-modal comparison occupies the left side on desktop and the
    // lower portion on phones. Keep the selected location in the free globe area.
    // Padding is applied to the map camera, never to the canvas with CSS transforms.
    if (mode === "compare") {
      if (desktop) return {
        left: Math.round(Math.min(620, Math.max(420, window.innerWidth * 0.4))),
        right: 0, top: 80, bottom: 80,
      };
      return { left: 0, right: 0, top: 0, bottom: Math.round(globeScene.clientHeight * 0.43) };
    }
    const home = mode === "globe" && !selectedLocation;
    return home
      ? desktop ? { left: Math.round(window.innerWidth * 0.32), right: 0, top: 80, bottom: 80 }
        : { left: 0, right: 0, top: 390, bottom: 150 }
      : { left: 0, right: 0, top: 0, bottom: 0 };
  }
  function syncMapFrame() {
    if (!map?.setPadding) return;
    const padding = scenePadding();
    const key = JSON.stringify(padding);
    if (key === framePaddingKey) return;
    framePaddingKey = key;
    updatingMapFrame = true;
    try { map.setPadding(padding); } finally { updatingMapFrame = false; }
  }
  function moveSceneCamera(camera) {
    if (!map) return;
    const padding = scenePadding();
    framePaddingKey = JSON.stringify(padding);
    const options = { ...camera, padding, duration: reducedMotion.matches ? 0 : SCENE_FLIGHT_MS,
      easing: t => t * t * (3 - 2 * t) };
    // Cancelled-flight events must not resume home rotation before the new flight.
    updatingMapFrame = true;
    try {
      if (map.easeTo) map.easeTo(options);
      else map.flyTo(options);
    } finally { updatingMapFrame = false; }
  }
  function setHomePresentation(visible) {
    const hero = $("homeHero");
    if (!hero) return;
    hero.inert = !visible;
    hero.setAttribute("aria-hidden", String(!visible));
  }
  function resizeGlobe() { if (map) { map.resize(); syncMapFrame();
    if (mode === "globe" && !selectedLocation && !introActive) map.jumpTo({ zoom: homeZoom() });
  } }
  function coordLabel(lat, lng) {
    return Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S") + " · " + Math.abs(lng).toFixed(5) + "° " + (lng >= 0 ? "E" : "W");
  }
  function isNearIIT(lat, lng) { return Math.abs(lat - IIT.lat) < 0.1 && Math.abs(lng - IIT.lng) < 0.14; }
  function setLocationPanelExpanded(expanded) {
    $("locationCard").classList.toggle("is-collapsed", !expanded);
    $("toggleLocationPanel").setAttribute("aria-expanded", String(expanded));
    $("panelToggleText").textContent = expanded ? "Hide location details" : "Show location details";
  }
  function updateLocationPanel() {
    const { lat, lng } = currentTarget;
    $("selectedPlace").textContent = currentTarget.name;
    $("selectedCoords").textContent = coordLabel(lat, lng);
    const near = isNearIIT(lat, lng);
    $("iitDataPanel").hidden = !near;
    $("outsideDataPanel").hidden = near;
    if (marker) marker.setLngLat([lng, lat]);
    refreshRasterLayers(mode === "map" && near);
  }
  function updateLocationFromCenter() {
    if (selectedLocation) return;
    const { lat, lng } = map.getCenter();
    currentTarget = { lat, lng, name: isNearIIT(lat, lng) ? IIT.name : "Map center" };
    // Choose once on entering the local map; camera movement preserves this point.
    selectedLocation = true;
    updateLocationPanel();
  }
  // 수정된 부분: zoom changes only UI overlays; the underlying map stays mounted.
  function syncZoomMode() {
    if (updatingMapFrame || !map || (cameraDestination !== null && cameraDestination < DETAIL_ZOOM)) return;
    if (map.getZoom() >= DETAIL_ZOOM && mode !== "map") {
      comparisonRequestId++;
      mode = "map";
      setHomePresentation(false);
      syncMapFrame();
      compareScene.hidden = true;
      globeScene.classList.remove("is-comparing");
      globeScene.classList.add("is-detail");
      mapScene.hidden = false;
      if (mobileLayout.matches) setLocationPanelExpanded(true);
      updateLocationFromCenter();
      updateLocationPanel();
    } else if (map.getZoom() < DETAIL_ZOOM - 0.5 && mode === "map") {
      mode = "globe";
      setHomePresentation(true);
      syncMapFrame();
      mapScene.hidden = true;
      globeScene.classList.remove("is-detail");
      refreshRasterLayers(false);
    }
  }
  function globeZoom(direction) {
    motionInterrupted = true;
    stopGlobeMotion();
    cameraDestination = null;
    if (map) map.zoomTo(map.getZoom() + (direction === "in" ? 1 : -1), { duration: reducedMotion.matches ? 0 : 250 });
  }
  function flyTo(lat, lng) {
    motionInterrupted = true;
    stopGlobeMotion();
    cameraDestination = PHOTO_ZOOM;
    selectedLocation = true;
    // 수정된 부분: search starts immediately, independently of camera animation.
    openComparison(lat, lng);
  }
  function goHome() {
    // Home always shows the natural Earth imagery, regardless of local-map choice.
    setBasemap("satellite");
    motionInterrupted = true;
    stopGlobeMotion();
    onSelection?.(null);
    marker?.remove();
    marker = null;
    cameraDestination = START.zoom;
    comparisonRequestId++;
    mode = "globe";
    selectedLocation = false;
    setHomePresentation(true);
    globeScene.hidden = false;
    globeScene.classList.remove("is-comparing", "is-detail");
    compareScene.hidden = true;
    mapScene.hidden = true;
    refreshRasterLayers(false);
    homeMotionPending = !reducedMotion.matches;
    moveSceneCamera({ ...START, zoom: homeZoom() });
  }
  function showComparisonFromMap() {
    motionInterrupted = true;
    stopGlobeMotion();
    cameraDestination = PHOTO_ZOOM;
    const { lat, lng } = currentTarget;
    globeScene.classList.remove("is-detail");
    mapScene.hidden = true;
    const reuse = lastComparedPoint && Math.abs(lastComparedPoint.lat - lat) < 0.000001 &&
      Math.abs(lastComparedPoint.lng - lng) < 0.000001 && comparisonPairs.length;
    if (reuse) {
      mode = "compare";
      setHomePresentation(false);
      globeScene.classList.add("is-comparing");
      compareScene.hidden = false;
      moveSceneCamera({ center: [lng, lat], zoom: PHOTO_ZOOM });
    } else openComparison(lat, lng);
    refreshRasterLayers(false);
  }
  function openMap(lat, lng) {
    motionInterrupted = true;
    stopGlobeMotion();
    onSelection?.(null);
    cameraDestination = null;
    if (!map) { fallback.hidden = false; return; }
    comparisonRequestId++;
    currentTarget = { lat, lng, name: isNearIIT(lat, lng) ? IIT.name : "Selected location" };
    selectedLocation = true;
    showSelectionMarker(lat, lng);
    compareScene.hidden = true;
    globeScene.classList.remove("is-comparing");
    mode = "globe";
    syncMapFrame();
    // 수정된 부분: one uninterrupted camera flight, without screen-switch timers.
    map.flyTo({ center: [lng, lat], zoom: isNearIIT(lat, lng) ? 15 : 12, duration: reducedMotion.matches ? 0 : LOCAL_MAP_FLIGHT_MS });
    syncZoomMode();
    updateLocationPanel();
  }
  function updateComparisonStatus(message, kind = "info") {
    const node = $("compareStatus");
    node.textContent = message;
    node.dataset.kind = kind;
  }
  function formatDate(date) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Unknown date";
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  // 수정된 부분: keep one URL parser for original and preview-wrapped image links.
  // 수정된 부분: unwrap preview URLs before assigning the original NASA image URL.
  function extractImageUrl(input) {
    if (typeof input !== "string" || input.length > 8000) throw new Error("Invalid image URL");
    let raw = input.trim();
    for (let depth = 0; depth < 5; depth++) {
      if (/^https?%3a/i.test(raw)) raw = decodeURIComponent(raw);
      const parsed = new URL(raw, "https://sarscope.invalid");
      if (parsed.pathname === "/api/preview" && parsed.searchParams.has("url")) {
        raw = parsed.searchParams.get("url");
        continue;
      }
      if (parsed.protocol !== "https:" || parsed.hostname !== "nisar.asf.earthdatacloud.nasa.gov" ||
          parsed.port || parsed.username || parsed.password || !parsed.pathname.startsWith("/BROWSE/")) {
        throw new Error("Invalid NASA image URL");
      }
      const match = parsed.pathname.match(/\.png(?=\/|$)/i);
      if (!match) throw new Error("Image extension not found");
      // Remove appended paths, query strings and fragments left by wrapped links.
      parsed.pathname = parsed.pathname.slice(0, match.index + match[0].length);
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    }
    throw new Error("Too many nested preview URLs");
  }

  function setImage(elementId, errorId, url) {
    const image = $(elementId);
    const error = $(errorId);

    const side = elementId.replace('Image', '');
    const loading = $(side + 'Loading');
    const expand = $(side + 'Expand');
    loading.hidden = false;
    expand.disabled = true;
    error.hidden = true;
    image.hidden = true;

    image.onload = () => {
      loading.hidden = true;
      expand.disabled = false;
      image.hidden = false;
      error.hidden = true;
    };

    image.onerror = () => {
      loading.hidden = true;
      expand.disabled = true;
      image.hidden = true;
      error.hidden = false;
      console.error("Image loading failed:", image.src);
    };

    try {
      image.src = extractImageUrl(url);
    } catch (error) {
      image.removeAttribute("src");
      image.onerror();
    }
  }

  function renderPair(pair) {
    $("sarCompareGrid").hidden = false;
    $("beforeDate").textContent = formatDate(pair.before.date);
    $("afterDate").textContent = formatDate(pair.after.date);
    $(
      "beforeMeta"
    ).textContent = `Track ${pair.track} · Frame ${pair.frame} · ${pair.direction}`;
    $(
      "afterMeta"
    ).textContent = `${pair.polarization} · ${pair.dayGap} days apart`;
    for (const item of ["before", "after"]) {
      const link = $(item + "Source");
      try { link.href = extractImageUrl(pair[item].browse); }
      catch { link.removeAttribute("href"); }
      link.title = pair[item].id;
      setImage(item + "Image", item + "Error", pair[item].browse);
    }
  }

  // 수정된 부분: clear stale results before searching and save the location only on success.
  async function openComparison(lat, lng) {
    lastComparedPoint = null;
    comparisonPairs = [];
    const requestId = ++comparisonRequestId;
    stopGlobeMotion();
    cameraDestination = PHOTO_ZOOM;
    selectedLocation = true;
    mode = "compare";
    setHomePresentation(false);
    currentTarget = {
      lat,
      lng,
      name: isNearIIT(lat, lng)
        ? "Illinois Tech · Chicago"
        : "Selected Earth region",
    };
    // Create a pin only after an explicit location selection.
    showSelectionMarker(lat, lng);
    globeScene.hidden = false;
    globeScene.classList.remove("is-detail");
    globeScene.classList.add("is-comparing");
    moveSceneCamera({ center: [lng, lat], zoom: PHOTO_ZOOM });
    refreshRasterLayers(false);
    mapScene.hidden = true;
    compareScene.hidden = false;
    $("compareRegion").textContent = currentTarget.name;
    $("compareCoordinates").textContent = coordLabel(lat, lng);
    $("sarCompareGrid").hidden = true;
    $("pairChooser").hidden = true;
    if (onSelection) {
      onSelection({ lat, lng });
      return;
    }
    updateComparisonStatus(
      "Searching NASA ASF catalog for matched NISAR GCOV acquisitions…"
    );
    try {
      const response = await fetch(
        `/api/coverage?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(
          lng
        )}`,
        { headers: { Accept: "application/json" } }
      );
      if (!response.ok)
        throw new Error(
          `Backend returned HTTP ${response.status}. Use npm run dev or deploy the Vercel API functions.`
        );
      const result = await response.json();
      if (requestId !== comparisonRequestId || mode !== "compare") return;
      comparisonPairs = result.pairs || [];
      if (!comparisonPairs.length) {
        const detail = result.warning
          ? " Search service was also unavailable."
          : "";
        updateComparisonStatus(
          `No two matching NISAR GCOV dates found at this location.${detail} Select another location or try Illinois Tech.`,
          "empty"
        );
        return;
      }
      // 수정된 부분: mark this location reusable only after matching observations are available.
      lastComparedPoint = { lat, lng };
      const chooser = $("pairSelect");
      chooser.replaceChildren();
      comparisonPairs.forEach((p, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `Track ${p.track} · Frame ${p.frame} · ${p.before.date} → ${p.after.date} (${p.matchedObservations} dates)`;
        chooser.append(option);
      });
      $("pairChooser").hidden = false;
      $(
        "pairCount"
      ).textContent = `${result.matchedGCOVObservations} GCOV scenes covering location`;
      updateComparisonStatus(
        `Showing the latest available matched observations (${
          result.source === "asf-live"
            ? "ASF live catalog"
            : "uploaded IIT catalog"
        }). ${result.warning || ""}`,
        "ready"
      );
      renderPair(comparisonPairs[0]);
    } catch (error) {
      if (requestId !== comparisonRequestId || mode !== "compare") return;
      updateComparisonStatus(`Unable to search: ${error.message}`, "error");
    }
  }
  // 수정된 부분: switch layers on the same style; preserve projection and tile cache.
  function setBasemap(name) {
    if (!["streets", "satellite"].includes(name)) return;
    activeBasemap = name;
    applyBasemap();
  }
  function applyBasemap() {
    if (!map || !map.getLayer("streets")) return;
    map.setLayoutProperty("streets", "visibility", activeBasemap === "streets" ? "visible" : "none");
    if (map.getLayer("satellite")) map.setLayoutProperty("satellite", "visibility", activeBasemap === "streets" ? "none" : "visible");
    if (map.getLayer("earth")) map.setLayoutProperty("earth", "visibility", activeBasemap === "streets" ? "none" : "visible");
    $("streetLayer").classList.toggle("is-selected", activeBasemap === "streets");
    $("satelliteLayer").classList.toggle("is-selected", activeBasemap === "satellite");
  }
  // 수정된 부분: optional prepared SAR images use MapLibre image sources.
  async function tryLoadSarLayers() {
    try {
      const response = await fetch("./data/sar_layers.json", { cache: "no-store" });
      if (!response.ok) return;
      const config = await response.json();
      const bounds = config.bounds;
      if (!config.before_image || !config.after_image || !Array.isArray(bounds) || bounds.length !== 2 ||
          !bounds.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return;
      const [[south, west], [north, east]] = bounds;
      if (south >= north || west >= east || south < -90 || north > 90 || west < -180 || east > 180) return;
      if (disposed) return;
      rasterConfig = config;
      installRasterLayers();
    } catch (error) { console.debug("Optional SAR layers unavailable", error); }
  }
  function installRasterLayers() {
    if (!rasterConfig || !map || !map.isStyleLoaded() || map.getSource("sar-before")) return;
    const [[south, west], [north, east]] = rasterConfig.bounds;
    const coordinates = [[west, north], [east, north], [east, south], [west, south]];
    for (const time of ["before", "after"]) {
      map.addSource("sar-" + time, { type: "image", url: rasterConfig[time + "_image"], coordinates });
      map.addLayer({ id: "sar-" + time, type: "raster", source: "sar-" + time,
        layout: { visibility: "none" }, paint: { "raster-opacity": time === "before" ? 0.78 : 0.4 } });
    }
    $("comparisonControls").hidden = false;
    $("rasterStatus").textContent = (rasterConfig.before_date || "Before") + " / " + (rasterConfig.after_date || "After");
    const badge = document.querySelector(".data-status");
    badge.classList.add("is-ready");
    badge.querySelector("span:last-child").textContent = "Prepared raster overlay loaded - review quality";
    badge.querySelector(".data-status-icon").textContent = "OK";
    listen($("compareSlider"), "input", event => {
      const opacity = Number(event.target.value) / 100;
      map.setPaintProperty("sar-after", "raster-opacity", opacity * 0.8);
      $("comparePct").textContent = Math.round(opacity * 100) + "% after";
    });
    refreshRasterLayers(mode === "map" && isNearIIT(currentTarget.lat, currentTarget.lng));
  }
  function refreshRasterLayers(show) {
    if (!map) return;
    for (const id of ["sar-before", "sar-after"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    }
  }
  function toggleModal(visible) {
    $("aboutModal").hidden = !visible;
  }
  function bindControls() {
    for (const side of ['before', 'after']) {
      listen($(side + 'Expand'), 'click', () => {
        const image = $(side + 'Image');
        if (image.hidden || !image.naturalWidth) return;
        window.dispatchEvent(new CustomEvent('sarscope:preview', { detail: {
          url: image.src, title: `${side === 'before' ? 'Before' : 'After'} · ${$(side + 'Date').textContent}`,
        } }));
      });
    }
    listen($("brandHome"), "click", goHome);
    listen($("compareBack"), "click", goHome);
    listen($("compareMap"), "click", () =>
      openMap(currentTarget.lat, currentTarget.lng)
    );
    listen($("backToComparison"), "click", showComparisonFromMap);
    listen($("pairSelect"), "change", (e) => {
      const pair = comparisonPairs[Number(e.target.value)];
      if (pair) renderPair(pair);
    });
    listen($("navExplore"), "click", goHome);
    listen($("navHow"), "click", () => toggleModal(true));
    listen($("learnMore"), "click", () => toggleModal(true));
    listen($("mobileAbout"), "click", () => toggleModal(true));
    listen($("toggleLocationPanel"), "click", () => {
      const expanded =
        $("toggleLocationPanel").getAttribute("aria-expanded") === "true";
      setLocationPanelExpanded(!expanded);
    });
    listen($("closeAbout"), "click", () => toggleModal(false));
    listen($("startExplore"), "click", () => toggleModal(false));
    listen($("aboutModal"), "click", (event) => {
      if (event.target === $("aboutModal")) toggleModal(false);
    });
    listen(document, "keydown", (event) => {
      if (event.key === "Escape") toggleModal(false);
    });
    listen($("exploreIIT"), "click", () =>
      flyTo(IIT.lat, IIT.lng, IIT.name)
    );
    listen($("jumpToIITFromMap"), "click", () =>
      openMap(IIT.lat, IIT.lng)
    );
    listen($("backToGlobe"), "click", goHome);
    listen($("resetGlobe"), "click", goHome);
    listen($("zoomInGlobe"), "click", () => globeZoom("in"));
    listen($("zoomOutGlobe"), "click", () => globeZoom("out"));
    listen($("streetLayer"), "click", () => setBasemap("streets"));
    listen($("satelliteLayer"), "click", () =>
      setBasemap("satellite")
    );
  }
  // 수정된 부분: the Close label now lives in HTML instead of being overwritten at startup.
  function start() {
    // React keeps the comparison overlay inside GlobeScene.

    bindControls();
    initGlobe();
    // No API keys, SAR claims or mock detection results are embedded in the demo.
    // Prepared overlays attach to the shared map after its style loads.
    tryLoadSarLayers();
  }
  function selectCoordinates(lat, lng) {
    if (disposed || !map || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    if (mode === "map") openMap(lat, lng);
    else { setBasemap("satellite"); flyTo(lat, lng); }
    return true;
  }
  return {
    start,
    selectCoordinates,
    isReady: () => !!map && !disposed,
    destroy() {
      disposed = true;
      stopGlobeMotion();
      onSelection?.(null);
      comparisonRequestId++;
      listeners.splice(0).forEach(remove => remove());
      if (map) map.remove();
      map = null;
    },
  };
}
