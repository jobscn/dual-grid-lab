/* Pure layout and sample-grid logic. No Unity or AnyRuleD source is included. */
(function (root) {
  "use strict";
  const Lab = root.DualGridLab = {};
  Lab.convention = "NW8-NE4-SW2-SE1-v1";
  Lab.layouts = {
    continuous: [5, 11, 3, 2, 7, 15, 14, 9, 12, 13, 10, 4, 1, 6, 8, 0],
    artist: [1, 3, 2, 7, 5, 15, 10, 11, 4, 12, 8, 13, 14, 6, 9, 0],
    anyrule: Array.from({ length: 16 }, (_, i) => i),
    legacy: Array.from({ length: 16 }, (_, i) =>
      ((i & 1) << 3) | ((i & 2) << 1) | ((i & 4) >> 1) | ((i & 8) >> 3))
  };
  Lab.stateLabel = function (mask) {
    if (mask === 0) return "空白";
    if (mask === 15) return "填满";
    return ["左上", "右上", "左下", "右下"].filter((_, i) => mask & (8 >> i)).join("＋");
  };
  Lab.validateMapping = function (mapping) {
    return mapping.length === 16 && new Set(mapping).size === 16 &&
      mapping.every(value => Number.isInteger(value) && value >= 0 && value <= 15);
  };
  Lab.infer = function (width, height, shape, marginX, marginY, gapX, gapY, geometry = "square") {
    const values = [marginX, marginY, gapX, gapY];
    if (!values.every(value => Number.isInteger(value) && value >= 0 && value <= 512))
      throw new Error("边距和间距须为 0–512 的整数像素。");
    if (geometry === "iso-sheet") {
      if (shape !== "auto" && shape !== "4x4")
        throw new Error("整张菱形图采用 4×4 逻辑排版，请选择自动或 4×4。");
      if (values.some(Boolean))
        throw new Error("整张菱形图须裁到菱形外接框，无外边距／格间距。");
      const tileWidth = width / 4, tileHeight = height / 4;
      if (tileWidth !== tileHeight * 2 || !Number.isInteger(tileHeight) || tileHeight < 2 || tileHeight > 256)
        throw new Error("整张等距图须为 2:1，宽高各可整除 4；单格菱形高度 2–256 px。");
      return { cols: 4, rows: 4, size: tileHeight, tileWidth, tileHeight, geometry, marginX, marginY, gapX, gapY };
    }
    const shapes = shape === "auto" ? [[4, 4], [8, 2], [2, 8], [16, 1], [1, 16]] :
      [shape.split("x").map(Number)];
    for (const [cols, rows] of shapes) {
      if (cols * rows !== 16) continue;
      const cellX = (width - marginX * 2 - gapX * (cols - 1)) / cols;
      const cellY = (height - marginY * 2 - gapY * (rows - 1)) / rows;
      const ratio = geometry === "iso-cells" ? 2 : 1;
      if (cellX === cellY * ratio && Number.isInteger(cellX) && Number.isInteger(cellY) && cellY >= 2 && cellY <= 256)
        return { cols, rows, size: cellY, tileWidth: cellX, tileHeight: cellY,
          geometry, marginX, marginY, gapX, gapY };
    }
    throw new Error(`无法切成 16 个${geometry === "iso-cells" ? "2:1 菱形外接框" : "正方形"}（单格高度 2–256 px）。请核对形状、边距和间距。`);
  };
  Lab.sourceRect = function (slice, slot) {
    if (slice.geometry === "iso-sheet") {
      const x = slot % 4, y = Math.floor(slot / 4);
      return { x: (x - y + 3) * slice.tileWidth / 2, y: (x + y) * slice.tileHeight / 2,
        width: slice.tileWidth, height: slice.tileHeight, clip: "diamond" };
    }
    return {
      x: slice.marginX + (slot % slice.cols) * (slice.tileWidth + slice.gapX),
      y: slice.marginY + Math.floor(slot / slice.cols) * (slice.tileHeight + slice.gapY),
      width: slice.tileWidth, height: slice.tileHeight,
      clip: slice.geometry === "iso-cells" ? "diamond" : "rectangle"
    };
  };
  Lab.random = function (seed) {
    let value = Number(seed) >>> 0;
    return function () {
      value = (value + 0x6d2b79f5) >>> 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Lab.map = function (width, height, title, tag, description) {
    return { width, height, title, tag, description, cells: new Uint8Array((width + 1) * (height + 1)) };
  };
  Lab.get = function (map, x, y) {
    return x >= 0 && y >= 0 && x <= map.width && y <= map.height ?
      map.cells[y * (map.width + 1) + x] : 0;
  };
  Lab.set = function (map, x, y, value) {
    if (x >= 0 && y >= 0 && x <= map.width && y <= map.height)
      map.cells[y * (map.width + 1) + x] = value ? 1 : 0;
  };
  Lab.mask = function (map, x, y) {
    return Lab.get(map, x, y) * 8 + Lab.get(map, x + 1, y) * 4 +
      Lab.get(map, x, y + 1) * 2 + Lab.get(map, x + 1, y + 1);
  };
  Lab.coverage = function (maps) {
    const counts = new Array(16).fill(0);
    for (const map of maps)
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) counts[Lab.mask(map, x, y)]++;
    return counts;
  };
  Lab.makeBatch = function (seed) {
    const rng = Lab.random(seed);
    const maps = [
      Lab.map(25, 17, "16 态全景", "ALL CORNERS", "独立四角印章，完整覆盖 00–15，找出错格与缺格。"),
      Lab.map(25, 17, "孤岛与外缘", "OUTER EDGES", "大小地形块、单点与相邻孤岛，检查外角和轮廓。"),
      Lab.map(25, 17, "孔洞与内角", "INNER CORNERS", "连续实心区域里的空洞，检查内凹、边缘与底色泄漏。"),
      Lab.map(25, 17, "窄路与阶梯", "THIN PATHS", "单格通道、折返与阶梯，观察薄连接和重复纹理。"),
      Lab.map(25, 17, "对角压力", "SADDLE CASES", "两种对角、棋盘和斜向连接，重点看状态 06 / 09。"),
      Lab.map(25, 17, "随机洞网", "SEEDED CAVES", "同一套图在不规则地形里的连续表现；种子可复现。")
    ];
    const states = Array.from({ length: 16 }, (_, i) => i);
    for (let i = 15; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [states[i], states[j]] = [states[j], states[i]];
    }
    states.forEach((mask, i) => {
      const x = 3 + (i % 4) * 6, y = 2 + Math.floor(i / 4) * 4;
      [[0, 0, 8], [1, 0, 4], [0, 1, 2], [1, 1, 1]].forEach(([dx, dy, bit]) =>
        Lab.set(maps[0], x + dx, y + dy, mask & bit));
    });
    for (let i = 0; i < 9; i++) {
      const cx = 2 + rng() * 21, cy = 2 + rng() * 13;
      const radius = 1 + rng() * 2.8;
      for (let y = 1; y < 17; y++)
        for (let x = 1; x < 25; x++)
          if (((x - cx) / radius) ** 2 + ((y - cy) / (radius * .7)) ** 2 < 1)
            Lab.set(maps[1], x, y, 1);
    }
    Lab.set(maps[1], 1, 1, 1);
    const holes = Array.from({ length: 5 }, (_, i) =>
      ({ x: 4 + i * 4 + rng(), y: 5 + rng() * 7, r: 1.4 + rng() * 1.1 }));
    for (let y = 2; y < 16; y++)
      for (let x = 2; x < 24; x++)
        if (!holes.some(h => (x - h.x) ** 2 + (y - h.y) ** 2 < h.r ** 2))
          Lab.set(maps[2], x, y, 1);
    const shift = Math.floor(rng() * 3);
    for (let y = 1; y < 17; y++)
      for (let x = 1; x < 25; x++) {
        const lane = y === 3 || y === 8 || y === 13;
        const turn = (x === 22 && y >= 3 && y <= 8) || (x === 3 && y >= 8 && y <= 13);
        const stair = y === 16 - Math.floor((x + shift) / 2) && x > 6 && x < 20;
        if ((lane && x >= 3 && x <= 22) || turn || stair) Lab.set(maps[3], x, y, 1);
      }
    for (let y = 2; y < 16; y++)
      for (let x = 2; x < 24; x++) {
        const checker = x < 11 && ((x + y + shift) % 2 === 0);
        const diagonal = x > 13 && (Math.abs(x - y - 10) <= 0 || Math.abs(x + y - 29) <= 0);
        if (checker || diagonal) Lab.set(maps[4], x, y, 1);
      }
    for (let y = 1; y < 17; y++)
      for (let x = 1; x < 25; x++) Lab.set(maps[5], x, y, rng() > .43);
    for (let pass = 0; pass < 2; pass++) {
      const copy = maps[5].cells.slice();
      for (let y = 1; y < 17; y++)
        for (let x = 1; x < 25; x++) {
          let neighbours = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              neighbours += copy[(y + dy) * 26 + x + dx];
          Lab.set(maps[5], x, y, neighbours >= 5);
        }
    }
    return maps;
  };
})(globalThis);
