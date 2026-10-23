(function (Lab) {
  "use strict";
  const cache = new WeakMap(), clips = new Map(), cropped = new Map(), tileIds = new WeakMap();
  let nextTileId = 0, croppedPixels = 0;
  function tileImage(tile, view, filter) {
    let variants = cache.get(tile);
    if (!variants) { variants = new Map(); cache.set(tile, variants); }
    const key = `${view}/${filter}`;
    if (!variants.has(key)) variants.set(key, view === "iso" ?
      Lab.sampledTile(tile, tile.width * 2, tile.height, filter, "diamond") : tile);
    return variants.get(key);
  }
  function coverageTile(mask, size, view) {
    const key = `${mask}/${size}/${view}`;
    if (!clips.has(key)) {
      const raster = Lab.pixelCanvas({ width: size, height: size,
        data: Lab.pixelTile(mask, size, { connected: true }) }, "#ffffff");
      clips.set(key, tileImage(raster, view, "nearest"));
      if (clips.size > 128) clips.delete(clips.keys().next().value);
    }
    return clips.get(key);
  }
  function coveredImage(tile, mask, size, view) {
    if (mask === 15) return tile;
    if (!tileIds.has(tile)) tileIds.set(tile, ++nextTileId);
    const key = `${tileIds.get(tile)}/${mask}/${size}/${view}`;
    if (cropped.has(key)) return cropped.get(key);
    const width = view === "iso" ? size * 2 : size, result = Lab.canvas(width, size);
    const ctx = result.getContext("2d");
    ctx.drawImage(tile, 0, 0, width, size);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(coverageTile(mask, size, view), 0, 0, width, size);
    ctx.globalCompositeOperation = "source-over";
    cropped.set(key, result);
    croppedPixels += width * size;
    while (cropped.size > 256 || croppedPixels > 4194304) {
      const first = cropped.keys().next().value, image = cropped.get(first);
      croppedPixels -= image.width * image.height;
      cropped.delete(first);
    }
    return result;
  }
  Lab.sparseExportBounds = function (map, layers, options) {
    const maps = layers ? Lab.floorMaps(map, options.roles) : { single: map };
    const visible = layers ? options.roles.filter(role => options.solo ? role.id === options.activeLayer :
      layers[role.id]?.enabled).map(role => maps[role.shapeFrom || (role.id === "grass" ? "terrain" : role.id)]) : [map];
    return Lab.gridBounds(visible.length ? visible : [map]);
  };
  Lab.renderSparseScene = function (canvas, map, layers, options) {
    const size = options.unitSize, view = options.view || "ortho", filter = options.filter || "nearest";
    const maps = layers ? Lab.floorMaps(map, options.roles) : { single: map };
    if (canvas.labViewport) canvas.labViewport.setInfinite(map, size, view);
    else {
      const b = options.bounds || Lab.sparseExportBounds(map, layers, options);
      const p = Lab.projection(b.x1 - b.x0, b.y1 - b.y0, size, view);
      p.e -= (p.a * b.x0 + p.c * b.y0) * size;
      p.f -= (p.b * b.x0 + p.d * b.y0) * size;
      canvas.width = p.width; canvas.height = p.height;
      canvas.labView = { projection: p, size };
    }
    const p = canvas.labView.projection, ctx = canvas.getContext("2d");
    ctx.resetTransform(); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const corners = [[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]]
      .map(([x, y]) => Lab.inversePoint(x, y, p));
    const bounds = { x0: Math.floor(Math.min(...corners.map(v => v.x)) / size) - 1,
      y0: Math.floor(Math.min(...corners.map(v => v.y)) / size) - 1,
      x1: Math.ceil(Math.max(...corners.map(v => v.x)) / size) + 1,
      y1: Math.ceil(Math.max(...corners.map(v => v.y)) / size) + 1 };
    if (options.bounds && !canvas.labViewport) {
      bounds.x0 = Math.max(bounds.x0, options.bounds.x0);
      bounds.y0 = Math.max(bounds.y0, options.bounds.y0);
      bounds.x1 = Math.min(bounds.x1, options.bounds.x1 - 1);
      bounds.y1 = Math.min(bounds.y1, options.bounds.y1 - 1);
    }
    const roles = layers ? options.roles.slice().sort((a, b) => a.order - b.order) : [{ id: "single" }];
    for (const role of roles) {
      const layer = layers ? layers[role.id] : options.single;
      if (!layer?.valid || layers && (options.solo ? role.id !== options.activeLayer : !layer.enabled)) continue;
      const shapeFrom = role.id === "grass" ? "terrain" : role.shapeFrom;
      const shape = maps[shapeFrom || role.id], region = maps[role.id];
      const packs = layer.variantMode === "mixed" ? layer.variantPacks : [layer];
      Lab.eachGridTile(shape, (x, y) => {
        const mask = Lab.mask(shape, x, y);
        // Infinite empty space has no atlas pixels; the original reference rectangle is preserved.
        if (!mask && (x < 0 || y < 0 || x >= map.width || y >= map.height)) return;
        const pack = packs[Lab.variantIndex(x, y, packs.length, layer.variantSeed)];
        const directIso = view === "iso" && !layers && options.geometry !== "square";
        const tile = directIso ? pack.tiles[mask] : tileImage(pack.flatTiles[mask], view, filter);
        const point = Lab.projectPoint(x * size, y * size, p);
        const scale = Math.hypot(p.a, p.c) / (view === "iso" ? Math.SQRT2 : 1);
        const width = size * (view === "iso" ? 2 : 1), left = view === "iso" ? point.x - size * scale : point.x;
        let image = tile;
        if (shapeFrom) {
          const clipMask = Lab.mask(region, x, y);
          if (!clipMask) return;
          image = coveredImage(tile, clipMask, size, view);
        }
        ctx.imageSmoothingEnabled = filter === "bilinear";
        ctx.drawImage(image, left, point.y, width * scale, size * scale);
        if (options.selected === mask && (!layers || role.id === options.activeLayer)) {
          ctx.save(); Lab.applyProjection(ctx, p);
          ctx.fillStyle = "#ed5c2930"; ctx.fillRect(x * size, y * size, size, size); ctx.restore();
        }
      }, bounds);
    }
    if (options.logic) {
      const active = maps[options.activeLayer] || map;
      const spacing = size * Math.hypot(p.a, p.b), step = Math.max(1, 2 ** Math.ceil(Math.log2(6 / spacing)));
      ctx.fillStyle = "#5e7970";
      for (let y = Math.ceil(bounds.y0 / step) * step; y <= bounds.y1; y += step)
        for (let x = Math.ceil(bounds.x0 / step) * step; x <= bounds.x1; x += step) {
          const at = Lab.projectPoint(x * size, y * size, p);
          ctx.fillStyle = Lab.get(active, x, y) ? "#426f6a" : "#fffdf6";
          ctx.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 2, 2);
        }
    }
    canvas.labViewport?.setGrid(map, size, options);
    Lab.setFilter(canvas, filter);
    return size;
  };
})(globalThis.DualGridLab);
