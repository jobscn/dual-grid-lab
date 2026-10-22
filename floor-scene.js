(function (Lab) {
  "use strict";
  const auxiliary = new WeakMap();
  Lab.floorMaps = function (map, roles = Lab.floorRoles) {
    if (auxiliary.has(map)) {
      const result = auxiliary.get(map);
      for (const role of roles) {
        if (result[role.id]) continue;
        const layer = result[role.id] = Lab.map(map.width, map.height, role.name, "", "");
        // Inspection scenes exercise the atlas; the editable paint map is cleared at layer creation.
        if (role.shapeFrom) layer.cells.fill(1);
        else layer.cells.set(map.cells);
      }
      for (const id of Object.keys(result))
        if (!["terrain", "wall", "grass"].includes(id) && !roles.some(role => role.id === id)) delete result[id];
      return result;
    }
    const wall = Lab.map(map.width, map.height, "背景墙", "", "");
    const cover = Lab.map(map.width, map.height, "草皮覆盖区域", "", "");
    wall.cells.set(map.cells);
    cover.cells.fill(1);
    const result = { terrain: map, wall, grass: cover };
    auxiliary.set(map, result);
    return Lab.floorMaps(map, roles);
  };
  Lab.makeFloorSample = function (width = 48, height = 28) {
    const map = Lab.map(width, height, "横版地表与洞穴", "LAYERED FLOOR",
      "泥土＋透明草皮；独立背景墙；裸土／覆盖收口／洞顶与洞底");
    const maps = Lab.floorMaps(map);
    for (let y = 0; y <= height; y++)
      for (let x = 0; x <= width; x++) {
        const u = x / width, v = y / height;
        const top = .36 + Math.sin(u * 8) * .045 + (u > .62 && u < .8 ? .08 : 0);
        const cave = ((u - .31) / .17) ** 2 + ((v - .72) / .14) ** 2 < 1 ||
          ((u - .77) / .15) ** 2 + ((v - .8) / .1) ** 2 < 1;
        const shaft = u >= .48 && u <= .53 && v < .8;
        const tunnel = u > .4 && u < .78 && v > .73 && v < .78;
        const platform = u >= .14 && u <= .29 && v >= .14 && v <= .18 ||
          u >= .65 && u <= .76 && v >= .21 && v < .24;
        Lab.set(map, x, y, platform || v >= top && !cave && !shaft && !tunnel);
        Lab.set(maps.wall, x, y, u > .04 && u < .96 && v > top + .1 && v < .97);
        // Coverage is a separate editable region, not a hidden terrain mutation.
        Lab.set(maps.grass, x, y, v < top + .06 && !(u > .36 && u < .44));
      }
    return map;
  };
  Lab.renderFloor = function (canvas, base, layers, options = {}) {
    const view = options.view || "ortho", nativeSize = options.unitSize;
    const area = view === "iso" ? (base.width + base.height) ** 2 : base.width * base.height;
    const size = options.size || Math.min(nativeSize, Math.max(2, Math.floor(Math.sqrt(1500000 / area))));
    const roles = options.roles || Lab.floorRoles;
    const ctx = Lab.prepareCanvas(canvas, base, size, view), maps = Lab.floorMaps(base, roles);
    const buffer = canvas.labFloorBuffer || (canvas.labFloorBuffer = Lab.canvas(1, 1));
    const activeMap = options.activeLayer === "grass" ? maps.grass : maps[options.activeLayer] || base;
    ctx.resetTransform();
    for (const role of roles.slice().sort((a, b) => a.order - b.order)) {
      const layer = layers[role.id], shapeFrom = role.id === "grass" ? "terrain" : role.shapeFrom;
      if (!layer || !layer.valid || (options.solo ? role.id !== options.activeLayer : !layer.enabled)) continue;
      const map = maps[shapeFrom || role.id];
      Lab.renderMap(buffer, map, layer.flatTiles, { ...options, size,
        grid: false, dual: false, logic: false, selected: null,
        geometry: "square", nativeTiles: layer.tiles,
        variantPacks: layer.variantMode === "mixed" ? layer.variantPacks : null, variantSeed: layer.variantSeed });
      if (shapeFrom) {
        const clip = Lab.pixelCanvas(Lab.pixelSheet(maps[role.id], size, { view, connected: true }), "#ffffff");
        const brush = buffer.getContext("2d");
        brush.save();
        brush.globalCompositeOperation = "destination-in";
        brush.drawImage(clip, 0, 0);
        brush.restore();
      }
      ctx.drawImage(buffer, 0, 0);
    }
    Lab.applyProjection(ctx, canvas.labView.projection);
    if (options.selected !== null && options.selected !== undefined) {
      const selectedRole = roles.find(role => role.id === options.activeLayer);
      const selectedMap = options.activeLayer === "grass" ? base : maps[selectedRole?.shapeFrom] || activeMap;
      ctx.fillStyle = "#ed5c2930";
      for (let y = 0; y < base.height; y++)
        for (let x = 0; x < base.width; x++)
          if (Lab.mask(selectedMap, x, y) === options.selected) ctx.fillRect(x * size, y * size, size, size);
    }
    Lab.drawGrid(ctx, activeMap, size, options);
    ctx.resetTransform();
    Lab.setFilter(canvas, options.filter);
    canvas.labNativeScale = options.size ? 1 : nativeSize / size;
    return size;
  };
})(globalThis.DualGridLab);
