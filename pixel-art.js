(function (Lab) {
  "use strict";
  const arcs = {
    nw: [0, 0, 8], ne: [1, 0, 4], sw: [0, 1, 2], se: [1, 1, 1]
  };
  const edges = ["", "se", "sw", "h", "ne", "v", "ne sw", "nw",
    "nw", "nw se", "v", "ne", "h", "sw", "se", ""];
  let cacheKey = "", tiles = new Map();
  // Slot 3 stays reserved so diagnostic palette indices do not shift.
  Lab.pixelPalette = color => ["#000000", color || "#b7c6a3", "#ead5ab", "#ead5ab",
    "#a98a68", "#c66752", "#5088b7", "#426f6a", "#fffdf6", "#5e7970", "#394c48"];

  function occupied(mask, x, y, connected) {
    const nw = x * x + y * y <= .25, ne = (x - 1) ** 2 + y * y <= .25;
    const sw = x * x + (y - 1) ** 2 <= .25, se = (x - 1) ** 2 + (y - 1) ** 2 <= .25;
    switch (mask) {
      case 0: return false; case 15: return true;
      case 1: return se; case 2: return sw; case 4: return ne; case 8: return nw;
      case 3: return y >= .5; case 12: return y < .5;
      case 5: return x >= .5; case 10: return x < .5;
      case 7: return !nw; case 11: return !ne; case 13: return !sw; case 14: return !se;
      case 6: return connected ? !nw && !se : ne || sw;
      case 9: return connected ? !ne && !sw : nw || se;
    }
    return false;
  }
  // Evaluate the original contour at native pixel centers, never an antialiased
  // intermediate. Indices select exact palette colors with binary alpha.
  Lab.pixelTile = function (mask, size, options = {}) {
    const connected = options.connected !== false, depth = Lab.reliefDepth(options.depth);
    const key = `${size}/${connected}/${options.style}/${depth}`;
    if (cacheKey !== key) { cacheKey = key; tiles = new Map(); }
    if (tiles.has(mask)) return tiles.get(mask);
    let names = edges[mask];
    if (connected && mask === 6) names = "nw se";
    if (connected && mask === 9) names = "ne sw";
    const parts = names.split(" ").filter(Boolean), data = new Uint8Array(size * size);
    const coast = Math.max(size >= 16 ? 2 : 1, Math.round(size * .06));
    const rim = Math.max(1, Math.round(size * .035)), front = Math.max(rim, Math.round(size * depth));
    for (let py = 0; py < size; py++)
      for (let px = 0; px < size; px++) {
        const x = (px + .5) / size, y = (py + .5) / size;
        if (!occupied(mask, x, y, connected)) continue;
        let distance = Infinity, normalY = 0;
        for (const name of parts) {
          let d, ny;
          if (arcs[name]) {
            const [cx, cy, bit] = arcs[name], radius = Math.hypot(x - cx, y - cy);
            d = Math.abs(radius - .5);
            ny = (y - cy) / radius * (mask & bit ? 1 : -1);
          } else {
            d = Math.abs((name === "h" ? y : x) - .5);
            ny = name === "h" ? (mask === 12 ? 1 : -1) : 0;
          }
          if (d < distance) { distance = d; normalY = ny; }
        }
        distance *= size;
        let index = 1;
        if (options.style === "pseudo") {
          const width = Math.round(rim + (front - rim) * Math.max(0, normalY));
          if (distance < width) index = 4;
          if (size >= 16 && Math.abs(distance - width) < .5) index = 2;
        } else if (distance < coast) index = 2;
        data[py * size + px] = index;
      }
    tiles.set(mask, data);
    return data;
  };
  Lab.pixelSheet = function (map, size, options = {}) {
    const p = Lab.projection(map.width, map.height, size, options.view || "ortho");
    const data = new Uint8Array(p.width * p.height);
    const prepared = Array.from({ length: 16 }, (_, mask) => Lab.pixelTile(mask, size, options));
    const determinant = p.a * p.d - p.b * p.c;
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++) {
        const dx = x + .5 - p.e, dy = y + .5 - p.f;
        const sx = Math.floor((p.d * dx - p.c * dy) / determinant);
        const sy = Math.floor((-p.b * dx + p.a * dy) / determinant);
        if (sx < 0 || sy < 0 || sx >= map.width * size || sy >= map.height * size) continue;
        const mask = Lab.mask(map, Math.floor(sx / size), Math.floor(sy / size));
        data[y * p.width + x] = prepared[mask][sy % size * size + sx % size];
      }
    return { width: p.width, height: p.height, data };
  };
  Lab.pixelCanvas = function (raster, color) {
    const canvas = Lab.canvas(raster.width, raster.height), ctx = canvas.getContext("2d");
    const image = ctx.createImageData(raster.width, raster.height);
    const palette = Lab.pixelPalette(color).map(hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)));
    for (let i = 0; i < raster.data.length; i++) {
      const index = raster.data[i];
      if (!index) continue;
      image.data.set(palette[index], i * 4);
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  };
})(globalThis.DualGridLab);
