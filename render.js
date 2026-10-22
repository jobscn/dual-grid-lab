(function (Lab) {
  "use strict";
  Lab.canvas = function (width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  Lab.diamondClip = function (ctx, width, height) {
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width, height / 2);
    ctx.lineTo(width / 2, height);
    ctx.lineTo(0, height / 2);
    ctx.closePath();
    ctx.clip();
  };
  Lab.slice = function (source, config, mapping, hardDiamond = false) {
    if (!Lab.validateMapping(mapping)) throw new Error("16 个状态必须各出现一次。");
    const tiles = new Array(16);
    mapping.forEach((state, slot) => {
      const rect = Lab.sourceRect(config, slot), canvas = Lab.canvas(rect.width, rect.height);
      const ctx = canvas.getContext("2d");
      if (rect.clip === "diamond" && !hardDiamond) Lab.diamondClip(ctx, rect.width, rect.height);
      ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      if (rect.clip === "diamond" && hardDiamond) {
        const image = ctx.getImageData(0, 0, rect.width, rect.height);
        for (let y = 0; y < rect.height; y++)
          for (let x = 0; x < rect.width; x++)
            if (Math.abs((x + .5) / rect.width - .5) + Math.abs((y + .5) / rect.height - .5) > .5)
              image.data.fill(0, (y * rect.width + x) * 4, (y * rect.width + x) * 4 + 4);
        ctx.putImageData(image, 0, 0);
      }
      tiles[state] = canvas;
    });
    return tiles;
  };
  Lab.flattenTiles = function (tiles, geometry, filter = "nearest") {
    if (geometry === "square") return tiles;
    return tiles.map(tile => Lab.sampledTile(tile, tile.height, tile.height, filter, "flatten"));
  };
  Lab.prepareCanvas = function (canvas, map, size, view) {
    const projection = Lab.projection(map.width, map.height, size, view);
    if (canvas.width !== projection.width || canvas.height !== projection.height) {
      canvas.width = projection.width;
      canvas.height = projection.height;
    }
    const ctx = canvas.getContext("2d");
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.labView = { projection, size };
    canvas.labViewport?.setGrid(null);
    Lab.applyProjection(ctx, projection);
    return ctx;
  };
  Lab.drawGrid = function (ctx, map, size, options) {
    if (ctx.canvas.labViewport) {
      ctx.canvas.labViewport.setGrid(map, size, options);
      options = { ...options, grid: false, dual: false };
    }
    if (options.filter !== "bilinear") {
      Lab.drawPixelHelpers(ctx, map, size, options);
      return;
    }
    const width = map.width * size, height = map.height * size;
    const line = (x1, y1, x2, y2) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); };
    if (options.grid) {
      ctx.beginPath();
      ctx.lineWidth = Math.max(.5, size / 120);
      ctx.strokeStyle = "#c66752bb";
      for (let x = 0; x <= map.width; x++) line(x * size, 0, x * size, height);
      for (let y = 0; y <= map.height; y++) line(0, y * size, width, y * size);
      ctx.stroke();
    }
    if (options.dual) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([size / 18, size / 28]);
      ctx.lineWidth = Math.max(.5, size / 150);
      ctx.strokeStyle = "#5088b7b0";
      for (let x = .5; x < map.width; x++) line(x * size, 0, x * size, height);
      for (let y = .5; y < map.height; y++) line(0, y * size, width, y * size);
      ctx.stroke();
      ctx.restore();
    }
    if (options.logic) {
      for (let y = 0; y <= map.height; y++)
        for (let x = 0; x <= map.width; x++) {
          ctx.fillStyle = Lab.get(map, x, y) ? "#426f6a" : "#fffdf6";
          ctx.strokeStyle = "#5e7970";
          ctx.lineWidth = Math.max(.4, size / 160);
          ctx.beginPath();
          ctx.arc(x * size, y * size, Math.max(1.1, size / 44), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
    }
  };
  Lab.renderMap = function (canvas, map, tiles, options = {}) {
    const nativeSize = tiles[0].width, view = options.view || "ortho";
    const area = view === "iso" ? (map.width + map.height) ** 2 : map.width * map.height;
    // Keep preview buffers bounded without imposing the previous fixed 32/48 px source cap.
    const size = options.size || Math.min(nativeSize, Math.max(2, Math.floor(Math.sqrt(1500000 / area))));
    const ctx = Lab.prepareCanvas(canvas, map, size, view), filter = options.filter || "nearest";
    Lab.setFilter(canvas, filter);
    const directIso = view === "iso" && options.nativeTiles && options.geometry !== "square";
    const prepared = tiles.map((tile, mask) => view === "iso" ?
      Lab.sampledTile(directIso ? options.nativeTiles[mask] : tile, size * 2, size, filter,
        directIso ? "resize" : "diamond") : Lab.sampledTile(tile, size, size, filter));
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const mask = Lab.mask(map, x, y);
        ctx.save();
        ctx.resetTransform();
        if (view === "iso") ctx.drawImage(prepared[mask], (x - y + map.height - 1) * size,
          (x + y) * size / 2);
        else ctx.drawImage(prepared[mask], x * size, y * size);
        ctx.restore();
        if (options.selected === mask) {
          ctx.fillStyle = "#ed5c2928";
          ctx.fillRect(x * size, y * size, size, size);
          ctx.strokeStyle = "#d85a35";
          ctx.lineWidth = Math.max(.6, size / 80);
          ctx.strokeRect(x * size, y * size, size, size);
        }
      }
    Lab.drawGrid(ctx, map, size, options);
    ctx.resetTransform();
    canvas.labNativeScale = options.size ? 1 : nativeSize / size;
    return size;
  };
  Lab.sizePreview = function (canvas, zoom) {
    if (canvas.labViewport) { canvas.labViewport.update(); return; }
    if (!Number.isFinite(zoom)) zoom = 0;
    if (zoom === 0) {
      const surface = canvas.parentElement;
      let scale = Math.min((surface.clientWidth - 16) / canvas.width,
        (surface.clientHeight - 16) / canvas.height);
      if (scale > 1 && canvas.classList.contains("pixelated")) scale = Math.floor(scale);
      scale = Math.max(.02, scale);
      canvas.style.width = `${canvas.width * scale}px`;
      canvas.style.height = `${canvas.height * scale}px`;
    } else {
      const scale = zoom * (canvas.labNativeScale || 1);
      canvas.style.width = `${canvas.width * scale}px`;
      canvas.style.height = `${canvas.height * scale}px`;
    }
  };
  Lab.hit = function (event, canvas, map) {
    const rect = canvas.getBoundingClientRect(), view = canvas.labView;
    if (!view || !rect.width || !rect.height) return { inside: false };
    if (canvas.labViewport) {
      const clip = canvas.parentElement.getBoundingClientRect();
      if (event.clientX < clip.left || event.clientX > clip.right ||
          event.clientY < clip.top || event.clientY > clip.bottom) return { inside: false };
    }
    const point = Lab.inversePoint((event.clientX - rect.left) / rect.width * canvas.width,
      (event.clientY - rect.top) / rect.height * canvas.height, view.projection);
    const x = point.x / view.size, y = point.y / view.size;
    const inside = x >= 0 && y >= 0 && x <= map.width && y <= map.height;
    return { inside,
      x: Math.min(map.width - 1, Math.max(0, Math.floor(x))),
      y: Math.min(map.height - 1, Math.max(0, Math.floor(y))),
      sampleX: Math.min(map.width, Math.max(0, Math.round(x))),
      sampleY: Math.min(map.height, Math.max(0, Math.round(y))) };
  };
})(globalThis.DualGridLab);
