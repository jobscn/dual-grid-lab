(function (Lab) {
  "use strict";
  let generated = null;
  Lab.drawArtwork = function (ctx, map, size, options) {
    if (options.filter !== "bilinear") {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(Lab.pixelCanvas(Lab.pixelSheet(map, size, { ...options, view: "ortho" }), options.color), 0, 0);
      return;
    }
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const mask = Lab.mask(map, x, y), contour = Lab.contour(mask, options.connected);
        ctx.save();
        ctx.translate(x * size, y * size);
        ctx.scale(size, size);
        if (options.fill !== false) {
          ctx.fillStyle = options.color || "#b7c6a3";
          ctx.fill(new Path2D(contour.fill), "evenodd");
        }
        if (options.style === "pseudo") Lab.drawRelief(ctx, mask, options, contour.fill);
        else if (options.coast !== false && contour.line) {
          ctx.save();
          ctx.clip(new Path2D(contour.fill), "evenodd");
          ctx.strokeStyle = "#ead5ab";
          ctx.lineWidth = .12;
          ctx.lineCap = "butt";
          ctx.stroke(new Path2D(contour.line));
          ctx.restore();
        }
        ctx.restore();
      }
  };
  Lab.drawLabels = function (ctx, map, size) {
    ctx.fillStyle = "#394c48";
    ctx.font = `${size / 12}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        ctx.fillText(String(Lab.mask(map, x, y)).padStart(2, "0"), (x + .5) * size, (y + .5) * size);
  };
  Lab.renderGuide = function (canvas, options = {}) {
    const map = Lab.continuousMap(), size = options.size || 128;
    let ctx = Lab.prepareCanvas(canvas, map, size, options.view || "ortho");
    if (!options.overlayOnly) {
      let tiles = options.tiles;
      if (!tiles) {
        const key = JSON.stringify([size, options.color, options.connected, options.style, options.depth, options.filter]);
        if (!generated || generated.key !== key) {
          const source = Lab.canvas(size * 4, size * 4);
          Lab.drawArtwork(source.getContext("2d"), map, size, options);
          generated = { key, tiles: Lab.slice(source,
            Lab.infer(source.width, source.height, "4x4", 0, 0, 0, 0, "square"), Lab.layouts.continuous) };
        }
        tiles = generated.tiles;
      }
      Lab.renderMap(canvas, map, tiles, { ...options, size, grid: false, dual: false, logic: false,
        nativeTiles: options.tiles ? options.nativeTiles : null,
        geometry: options.tiles ? options.geometry : "square" });
      ctx = canvas.getContext("2d");
      Lab.applyProjection(ctx, canvas.labView.projection);
    }
    Lab.drawGrid(ctx, map, size, options);
    if (options.labels && options.filter === "bilinear") Lab.drawLabels(ctx, map, size);
    ctx.resetTransform();
    Lab.setFilter(canvas, options.filter || "nearest");
    return canvas;
  };
  Lab.makeDemo = function (geometry = "square", options = {}) {
    const size = options.size || 128, canvas = Lab.canvas(1, 1);
    Lab.renderGuide(canvas, { ...options, size, view: geometry === "square" ? "ortho" : "iso" });
    if (geometry !== "iso-cells") return canvas;
    const sheetConfig = Lab.infer(canvas.width, canvas.height, "4x4", 0, 0, 0, 0, "iso-sheet");
    const tiles = Lab.slice(canvas, sheetConfig, Lab.layouts.continuous, options.filter !== "bilinear");
    const packed = Lab.canvas(size * 8, size * 4), ctx = packed.getContext("2d");
    Lab.layouts.continuous.forEach((mask, slot) =>
      ctx.drawImage(tiles[mask], slot % 4 * size * 2, Math.floor(slot / 4) * size));
    return packed;
  };
  Lab.guideSvg = function (options = {}) {
    if (options.filter !== "bilinear") return Lab.pixelGuideSvg(options);
    const map = Lab.continuousMap(), size = options.size || 128;
    const p = Lab.projection(4, 4, size, options.view || "ortho");
    const transform = `matrix(${p.a} ${p.b} ${p.c} ${p.d} ${p.e} ${p.f})`;
    const terrain = [], coast = [], clips = [], labels = [], cut = [], dual = [];
    const front = [], rim = [], lips = [], dots = [];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const mask = Lab.mask(map, x, y), shape = Lab.contour(mask, options.connected);
        const cell = `translate(${x * size} ${y * size}) scale(${size})`;
        const clipId = `land-mask-${x}-${y}`;
        terrain.push(`<path transform="${cell}" d="${shape.fill}" fill-rule="evenodd"/>`);
        clips.push(`<clipPath id="${clipId}"><path d="${shape.fill}" clip-rule="evenodd"/></clipPath>`);
        coast.push(`<g transform="${cell}" clip-path="url(#${clipId})"><path d="${shape.line}" stroke-width=".12"/></g>`);
        if (options.style === "pseudo") {
          const bands = Lab.reliefBands(mask, options.connected !== false, options.depth);
          for (const band of bands) {
            (band.kind === "front" ? front : rim).push(`<g transform="${cell}" clip-path="url(#${clipId})"><path d="${band.fill}" fill="${band.color}"/></g>`);
            lips.push(`<g transform="${cell}" clip-path="url(#${clipId})"><path d="${band.lip}" stroke-width=".022"/></g>`);
          }
        }
        labels.push(`<text x="${(x + .5) * size}" y="${(y + .5) * size}">${String(mask).padStart(2, "0")}</text>`);
      }
    for (let n = 0; n <= 4; n++) {
      cut.push(`<path d="M${n * size} 0V${4 * size}M0 ${n * size}H${4 * size}"/>`);
      if (n < 4) dual.push(`<path d="M${(n + .5) * size} 0V${4 * size}M0 ${(n + .5) * size}H${4 * size}"/>`);
    }
    for (let y = 0; y <= 4; y++)
      for (let x = 0; x <= 4; x++)
        dots.push(`<circle cx="${x * size}" cy="${y * size}" r="${Math.max(1.1, size / 44)}" fill="${Lab.get(map, x, y) ? "#426f6a" : "#fffdf6"}"/>`);
    const visibility = flag => flag ? "" : ' display="none"';
    const relief = options.style === "pseudo" ?
      `<g id="back-side-rim">${rim.join("")}</g>
<g id="front-wall">${front.join("")}</g>
<g id="top-lip" fill="none" stroke="#ead5ab" stroke-linecap="butt">${lips.join("")}</g>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}">
<title>Connected land / 16-state drawing template / ${Lab.convention}</title>
<desc>Row-major: ${Lab.layouts.continuous.join(",")}. ${options.connected === false ? "Separated saddles may produce disconnected land." : "Connected saddles join land inside this canvas; no edge wrapping needed."} Sea reference is hidden and must stay off when exporting the source atlas. Empty state retained. ${options.style === "pseudo" ? `Pseudo perspective: thin north rim, thick south-facing inset wall, depth ${Lab.reliefDepth(options.depth)} cell. No real height or overhang.` : "Isometric = 2:1 ground plane, no height."} Hide all reference grids, points and labels before importing your painted atlas.</desc>
<defs>${clips.join("")}</defs>
<g id="sea-reference" display="none"><rect width="${p.width}" height="${p.height}" fill="#d9e9ef"/></g>
<g transform="${transform}">
<g id="terrain-fill" fill="${options.color || "#b7c6a3"}">${terrain.join("")}</g>
<g id="coast-band" fill="none" stroke="#ead5ab" stroke-linecap="butt"${visibility(options.style !== "pseudo")}>${coast.join("")}</g>
${relief}
<g id="tile-cut-grid" fill="none" stroke="#c66752" stroke-width="1" opacity=".75"${visibility(options.grid !== false)}>${cut.join("")}</g>
<g id="logical-grid" fill="none" stroke="#5088b7" stroke-width=".8" stroke-dasharray="5 4" opacity=".65"${visibility(options.dual)}>${dual.join("")}</g>
<g id="sample-points" stroke="#5e7970" stroke-width="${Math.max(.4, size / 160)}"${visibility(options.logic)}>${dots.join("")}</g>
<g id="state-labels" fill="#394c48" font-family="Consolas,monospace" font-size="${size / 12}" text-anchor="middle" dominant-baseline="middle"${options.labels ? "" : ' display="none"'}>${labels.join("")}</g>
</g></svg>`;
  };
})(globalThis.DualGridLab);
