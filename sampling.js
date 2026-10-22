(function (Lab) {
  "use strict";
  const cache = new WeakMap();
  function pixels(source) {
    return source.getContext("2d").getImageData(0, 0, source.width, source.height).data;
  }
  // Pixel-center coordinates; interpolate premultiplied RGBA to avoid dark transparent fringes.
  function sample(data, width, height, x, y, nearest, output, offset) {
    x = Math.max(0, Math.min(width - 1, x));
    y = Math.max(0, Math.min(height - 1, y));
    if (nearest) {
      const at = (Math.round(y) * width + Math.round(x)) * 4;
      for (let c = 0; c < 4; c++) output[offset + c] = data[at + c];
      return;
    }
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const indices = [(y0 * width + x0) * 4, (y0 * width + x1) * 4,
      (y1 * width + x0) * 4, (y1 * width + x1) * 4];
    const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let i = 0; i < 4; i++) {
      const at = indices[i], weight = weights[i] * data[at + 3];
      alpha += weight;
      red += data[at] * weight;
      green += data[at + 1] * weight;
      blue += data[at + 2] * weight;
    }
    output[offset] = alpha ? red / alpha : 0;
    output[offset + 1] = alpha ? green / alpha : 0;
    output[offset + 2] = alpha ? blue / alpha : 0;
    output[offset + 3] = alpha;
  }
  Lab.sampledTile = function (source, width, height, filter = "nearest", transform = "resize") {
    if (transform === "resize" && source.width === width && source.height === height) return source;
    let entries = cache.get(source);
    if (!entries) { entries = new Map(); cache.set(source, entries); }
    const key = `${width}:${height}:${filter}:${transform}`;
    if (entries.has(key)) return entries.get(key);
    const canvas = Lab.canvas(width, height), ctx = canvas.getContext("2d");
    const image = ctx.createImageData(width, height), input = pixels(source);
    const nearest = filter === "nearest";
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const u = (x + .5) / width, v = (y + .5) / height;
        let sx = u, sy = v;
        if (transform === "diamond") {
          sx = u + v - .5;
          sy = v - u + .5;
          if (sx < 0 || sx >= 1 || sy < 0 || sy >= 1) continue;
        } else if (transform === "flatten") {
          sx = (u - v + 1) / 2;
          sy = (u + v) / 2;
        }
        sample(input, source.width, source.height, sx * source.width - .5,
          sy * source.height - .5, nearest, image.data, (y * width + x) * 4);
      }
    ctx.putImageData(image, 0, 0);
    // A source can be displayed in several views; bound retained raster variants.
    if (entries.size >= 6) entries.delete(entries.keys().next().value);
    entries.set(key, canvas);
    return canvas;
  };
  Lab.setFilter = function (canvas, filter) {
    const nearest = filter !== "bilinear";
    canvas.classList.toggle("pixelated", nearest);
    canvas.getContext("2d").imageSmoothingEnabled = !nearest;
    canvas.getContext("2d").imageSmoothingQuality = "low";
  };
})(globalThis.DualGridLab);
