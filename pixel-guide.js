(function (Lab) {
  "use strict";
  const digits = ["111101101101111", "010110010010111", "111001111100111", "111001111001111",
    "101101111001001", "111100111001111", "111100111101111", "111001001001001",
    "111101111101111", "111101111001111"];
  Lab.pixelHelpers = function (map, size, options = {}) {
    const p = Lab.projection(map.width, map.height, size, options.view || "ortho");
    const data = new Uint8Array(p.width * p.height);
    const put = (x, y, color) => {
      if (x >= 0 && y >= 0 && x < p.width && y < p.height) data[y * p.width + x] = color;
    };
    function line(x1, y1, x2, y2, color, dashed = false) {
      const a = Lab.projectPoint(x1, y1, p), b = Lab.projectPoint(x2, y2, p);
      let x = Math.min(p.width - 1, Math.round(a.x)), y = Math.min(p.height - 1, Math.round(a.y));
      const endX = Math.min(p.width - 1, Math.round(b.x)), endY = Math.min(p.height - 1, Math.round(b.y));
      const dx = Math.abs(endX - x), dy = -Math.abs(endY - y), sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
      let error = dx + dy, step = 0;
      while (true) {
        if (!dashed || Math.floor(step / Math.max(1, Math.round(size / 18))) % 2 === 0) put(x, y, color);
        if (x === endX && y === endY) break;
        const twice = error * 2;
        if (twice >= dy) { error += dy; x += sx; }
        if (twice <= dx) { error += dx; y += sy; }
        step++;
      }
    }
    if (options.grid) {
      for (let x = 0; x <= map.width; x++) line(x * size, 0, x * size, map.height * size, 5);
      for (let y = 0; y <= map.height; y++) line(0, y * size, map.width * size, y * size, 5);
    }
    if (options.dual) {
      for (let x = .5; x < map.width; x++) line(x * size, 0, x * size, map.height * size, 6, true);
      for (let y = .5; y < map.height; y++) line(0, y * size, map.width * size, y * size, 6, true);
    }
    if (options.logic)
      for (let y = 0; y <= map.height; y++)
        for (let x = 0; x <= map.width; x++) {
          const at = Lab.projectPoint(x * size, y * size, p);
          const radius = Math.max(0, Math.min(3, Math.floor(size / 44)));
          for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++)
              put(Math.min(p.width - 1, Math.round(at.x)) + dx, Math.min(p.height - 1, Math.round(at.y)) + dy,
                radius > 0 && (Math.abs(dx) === radius || Math.abs(dy) === radius) ? 9 : Lab.get(map, x, y) ? 7 : 8);
        }
    if (options.labels && size >= 16)
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const at = Lab.projectPoint((x + .5) * size, (y + .5) * size, p);
          const text = String(Lab.mask(map, x, y)).padStart(2, "0"), scale = Math.max(1, Math.floor(size / 80));
          for (let digit = 0; digit < 2; digit++)
            for (let i = 0; i < 15; i++)
              if (digits[Number(text[digit])][i] === "1")
                for (let dy = 0; dy < scale; dy++)
                  for (let dx = 0; dx < scale; dx++)
                    put(Math.round(at.x) - 3 * scale + (digit * 4 + i % 3) * scale + dx,
                      Math.round(at.y) - 2 * scale + Math.floor(i / 3) * scale + dy, 10);
        }
    return { width: p.width, height: p.height, data };
  };
  Lab.drawPixelHelpers = function (ctx, map, size, options) {
    if (!options.grid && !options.dual && !options.logic && !options.labels) return;
    const overlay = Lab.pixelCanvas(Lab.pixelHelpers(map, size, options));
    ctx.save();
    ctx.resetTransform();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overlay, 0, 0);
    ctx.restore();
  };
  function runs(raster, accepts) {
    const parts = [];
    for (let y = 0; y < raster.height; y++)
      for (let x = 0; x < raster.width;) {
        if (!accepts(raster.data[y * raster.width + x])) { x++; continue; }
        const start = x++;
        while (x < raster.width && accepts(raster.data[y * raster.width + x])) x++;
        parts.push(`M${start} ${y}h${x - start}v1H${start}Z`);
      }
    return parts.join("");
  }
  Lab.pixelGuideSvg = function (options = {}) {
    const map = Lab.continuousMap(), size = options.size || 128, palette = Lab.pixelPalette(options.color);
    const art = Lab.pixelSheet(map, size, options), layers = [];
    const group = (id, fill, d, visible = true) =>
      `<g id="${id}" fill="${fill}"${visible ? "" : ' display="none"'}><path d="${d}"/></g>`;
    layers.push(group("terrain-fill", palette[1], runs(art, value => value > 0)));
    for (const [id, index] of [["coast-band", 2], ["front-wall", 4]])
      layers.push(group(id, palette[index], runs(art, value => value === index)));
    for (const [id, key, indices] of [["tile-cut-grid", "grid", [5]], ["logical-grid", "dual", [6]],
      ["sample-points", "logic", [7, 8, 9]], ["state-labels", "labels", [10]]]) {
      const raster = Lab.pixelHelpers(map, size, { ...options, grid: false, dual: false, logic: false, labels: false, [key]: true });
      const paths = indices.map(index => `<path fill="${palette[index]}" d="${runs(raster, value => value === index)}"/>`).join("");
      layers.push(`<g id="${id}"${options[key] || key === "grid" && options.grid !== false ? "" : ' display="none"'}>${paths}</g>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}" viewBox="0 0 ${art.width} ${art.height}" shape-rendering="crispEdges">
<title>Native pixel drawing guide / ${size}px / ${options.style || "flat"}</title>
<desc>${Lab.convention}; row-major ${Lab.layouts.continuous.join(",")}. Integer pixel runs, opaque palette and transparent sea. Hide reference layers before importing your artwork. Thickness quantized to whole pixels; labels omitted below 16px. No real height or overhang.</desc>
<g id="sea-reference" display="none"><rect width="${art.width}" height="${art.height}" fill="#d9e9ef"/></g>
${layers.join("\n")}
</svg>`;
  };
})(globalThis.DualGridLab);
