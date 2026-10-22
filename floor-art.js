(function (Lab) {
  "use strict";
  Lab.floorRoles = [
    { id: "terrain", name: "泥土地形", required: true, order: 1, rule: "地形四角", note: "填充内部与边缘；完整地板必需。" },
    { id: "grass", name: "草皮覆盖", required: true, order: 2, rule: "地形四角 × 独立覆盖区", note: "只画透明草皮；00／15留空；不画泥土。" },
    { id: "wall", name: "背景墙", required: false, order: 0, rule: "独立墙体四角", note: "洞穴／室内可选；不改变前景占用。" }
  ];
  Lab.floorBoundary = function (mask, x, y) {
    const edges = ["", "se", "sw", "h", "ne", "v", "nw se", "nw",
      "nw", "ne sw", "v", "ne", "h", "sw", "se", ""];
    const arcs = { nw: [0, 0, 8], ne: [1, 0, 4], sw: [0, 1, 2], se: [1, 1, 1] };
    let distance = Infinity, normalY = 0;
    for (const part of edges[mask].split(" ").filter(Boolean)) {
      let d, ny;
      if (arcs[part]) {
        const [cx, cy, bit] = arcs[part], radius = Math.hypot(x - cx, y - cy);
        d = Math.abs(radius - .5);
        ny = (y - cy) / radius * (mask & bit ? 1 : -1);
      } else {
        d = Math.abs((part === "h" ? y : x) - .5);
        ny = part === "h" ? (mask === 12 ? 1 : -1) : 0;
      }
      if (d < distance) { distance = d; normalY = ny; }
    }
    return { distance, normalY };
  };
  // Original native-pixel artwork. No third-party pixels or texture downloads.
  Lab.floorRaster = function (role, size = 16, variant = 0) {
    const width = size * 4, data = new Uint8ClampedArray(width * width * 4);
    const soil = [[147, 104, 71], [164, 118, 79], [125, 85, 60]];
    Lab.layouts.continuous.forEach((mask, slot) => {
      const shape = Lab.pixelTile(mask, size, { connected: true }), coast = Math.max(1, Math.round(size * .12));
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          if (!shape[y * size + x]) continue;
          const boundary = Lab.floorBoundary(mask, (x + .5) / size, (y + .5) / size);
          const d = boundary.distance * size, noise = ((x >> 1) * 73856093 ^ (y >> 1) * 19349663 ^ variant * 83492791) >>> 0;
          let color;
          if (role === "grass") {
            if (boundary.normalY >= -.3 || d >= coast || mask === 0 || mask === 15) continue;
            color = d < Math.max(1, coast / 2) ? [52, 132, 52] : [112, 184, 73];
          } else if (role === "wall") {
            const mortar = y % Math.max(3, Math.round(size / 2)) === 0 ||
              (x + (y < size / 2 ? 0 : size / 2)) % Math.max(3, size) === 0;
            color = mortar ? [65, 61, 55] : noise % 5 === 0 ? [94, 82, 66] : [83, 74, 61];
          } else color = d < Math.max(1, size / 20) ? [104, 72, 51] : soil[noise % 13 === 0 ? 1 : noise % 17 === 0 ? 2 : 0];
          const at = ((Math.floor(slot / 4) * size + y) * width + slot % 4 * size + x) * 4;
          data.set([...color, 255], at);
        }
    });
    return { width, height: width, data };
  };
  Lab.floorSource = function (role, size = 16, variant = 0) {
    const raster = Lab.floorRaster(role, size, variant), canvas = Lab.canvas(raster.width, raster.height);
    canvas.getContext("2d").putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
    return canvas;
  };
  Lab.packCanvas = function (tiles, order = Lab.layouts.continuous) {
    const w = tiles[0].width, h = tiles[0].height, canvas = Lab.canvas(w * 4, h * 4), ctx = canvas.getContext("2d");
    order.forEach((mask, slot) => ctx.drawImage(tiles[mask], slot % 4 * w, Math.floor(slot / 4) * h));
    return canvas;
  };
})(globalThis.DualGridLab);
