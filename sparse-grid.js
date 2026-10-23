(function (Lab) {
  "use strict";
  const side = 32;
  const coordinate = value => Number.isSafeInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER - side;
  // Retain the small reference rectangle for legacy scenes; allocate overflow blocks only on writes.
  Lab.enableSparse = function (map) {
    if (!map.chunks) map.chunks = new Map();
    return map;
  };
  const denseGet = Lab.get, denseSet = Lab.set;
  Lab.beginGridEdit = function (map) {
    const entry = { changes: [] };
    map.edit = { entry, seen: new Set() };
    return entry;
  };
  Lab.endGridEdit = map => { delete map.edit; };
  Lab.get = function (map, x, y) {
    if (x >= 0 && y >= 0 && x <= map.width && y <= map.height) return denseGet(map, x, y);
    if (!map.chunks || !coordinate(x) || !coordinate(y)) return 0;
    const cx = Math.floor(x / side), cy = Math.floor(y / side);
    return map.chunks.get(`${cx},${cy}`)?.cells[(y - cy * side) * side + x - cx * side] || 0;
  };
  Lab.set = function (map, x, y, value) {
    if (!coordinate(x) || !coordinate(y)) return;
    const previous = Lab.get(map, x, y), next = value ? 1 : 0;
    if (previous === next) return;
    if (map.edit) {
      const key = `${x},${y}`;
      if (!map.edit.seen.has(key)) {
        map.edit.seen.add(key);
        map.edit.entry.changes.push([x, y, previous]);
      }
    }
    if (x >= 0 && y >= 0 && x <= map.width && y <= map.height) return denseSet(map, x, y, value);
    if (!map.chunks) return;
    const cx = Math.floor(x / side), cy = Math.floor(y / side), key = `${cx},${cy}`;
    let chunk = map.chunks.get(key);
    if (!chunk) {
      if (!value) return;
      chunk = { x: cx, y: cy, count: 0, cells: new Uint8Array(side * side), occupied: new Set() };
      map.chunks.set(key, chunk);
    }
    const index = (y - cy * side) * side + x - cx * side;
    chunk.count += next - chunk.cells[index];
    chunk.cells[index] = next;
    if (next) chunk.occupied.add(index);
    else chunk.occupied.delete(index);
    chunk.tiles = chunk.logicTiles = null;
    if (!chunk.count) map.chunks.delete(key);
  };
  Lab.gridData = map => ({ cells: Array.from(map.cells),
    chunks: Array.from(map.chunks?.values() || [], chunk => [chunk.x, chunk.y,
      Array.from(chunk.occupied)]) });
  Lab.restoreGrid = function (map, data) {
    map.cells.set(Array.isArray(data) ? data : data.cells);
    Lab.enableSparse(map).chunks.clear();
    for (const [cx, cy, indices] of data.chunks || [])
      for (const index of indices) Lab.set(map, cx * side + index % side, cy * side + Math.floor(index / side), 1);
  };
  Lab.clearGrid = function (map) { map.cells.fill(0); map.chunks?.clear(); };
  Lab.undoGrid = function (map, entry) {
    if (Array.isArray(entry.changes)) entry.changes.forEach(([x, y, value]) => Lab.set(map, x, y, value));
    else Lab.restoreGrid(map, entry);
  };
  Lab.copyGrid = function (target, source) {
    target.cells.set(source.cells);
    if (source.chunks) Lab.restoreGrid(target, Lab.gridData(source));
  };
  Lab.eachSample = function (map, visit, bounds) {
    const accepts = (x, y) => !bounds || x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x <= map.width; x++) if (denseGet(map, x, y) && accepts(x, y)) visit(x, y);
    for (const chunk of map.chunks?.values() || []) {
      const x0 = chunk.x * side, y0 = chunk.y * side;
      if (bounds && (x0 > bounds.x1 || y0 > bounds.y1 || x0 + side <= bounds.x0 || y0 + side <= bounds.y0)) continue;
      for (const index of chunk.occupied) {
        const x = x0 + index % side, y = y0 + Math.floor(index / side);
        if (accepts(x, y)) visit(x, y);
      }
    }
  };
  function chunkTiles(chunk, logic) {
    const field = logic ? "logicTiles" : "tiles";
    if (chunk[field]) return chunk[field];
    const stride = side + (logic ? 2 : 1), marked = new Uint8Array(stride * stride);
    for (const index of chunk.occupied) {
      const x = index % side, y = Math.floor(index / side);
      for (let dy = 0; dy <= (logic ? 2 : 1); dy++)
        for (let dx = 0; dx <= (logic ? 2 : 1); dx++) marked[(y + dy) * stride + x + dx] = 1;
    }
    const indices = [];
    for (let i = 0; i < marked.length; i++) if (marked[i]) indices.push(i);
    return chunk[field] = Uint16Array.from(indices);
  }
  // Visit existing tiles and their one-sample halo; distance between islands costs no memory.
  Lab.eachGridTile = function (map, visit, bounds, logic = false) {
    const seen = new Set();
    const add = (x, y) => {
      if (bounds && (x < bounds.x0 || y < bounds.y0 || x > bounds.x1 || y > bounds.y1)) return;
      const key = `${x},${y}`;
      if (!seen.has(key)) { seen.add(key); visit(x, y); }
    };
    for (let y = 0; y < map.height + Number(logic); y++)
      for (let x = 0; x < map.width + Number(logic); x++) add(x, y);
    if (!map.chunks) return;
    const samples = bounds && { x0: bounds.x0 - 1, y0: bounds.y0 - 1, x1: bounds.x1 + 2, y1: bounds.y1 + 2 };
    Lab.eachSample({ width: map.width, height: map.height, cells: map.cells }, (x, y) => {
      for (let dy = -1; dy <= Number(logic); dy++)
        for (let dx = -1; dx <= Number(logic); dx++) add(x + dx, y + dy);
    }, samples);
    const stride = side + (logic ? 2 : 1);
    for (const chunk of map.chunks.values()) {
      const x0 = chunk.x * side - 1, y0 = chunk.y * side - 1;
      if (bounds && (x0 > bounds.x1 || y0 > bounds.y1 ||
          x0 + stride <= bounds.x0 || y0 + stride <= bounds.y0)) continue;
      for (const index of chunkTiles(chunk, logic)) add(x0 + index % stride, y0 + Math.floor(index / stride));
    }
  };
  Lab.gridBounds = function (maps) {
    const bounds = { x0: 0, y0: 0, x1: maps[0].width, y1: maps[0].height };
    maps.forEach(map => Lab.eachSample(map, (x, y) => {
      bounds.x0 = Math.min(bounds.x0, x - 1); bounds.y0 = Math.min(bounds.y0, y - 1);
      bounds.x1 = Math.max(bounds.x1, x + 1); bounds.y1 = Math.max(bounds.y1, y + 1);
    }));
    return bounds;
  };
  Lab.gridInside = (map, x, y, logic = false) => Boolean(map.chunks) ||
    x >= 0 && y >= 0 && x < map.width + Number(logic) && y < map.height + Number(logic);
})(globalThis.DualGridLab);
