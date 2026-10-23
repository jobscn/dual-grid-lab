(function (Lab) {
  "use strict";
  Lab.bindFloorState = function (app) {
    const $ = app.$, state = app.state;
    const fields = ["source", "fileName", "isDemo", "slice", "tiles", "flatTiles", "mapping", "valid",
      "sources", "variantPacks", "activeVariant", "variantMode", "variantSeed", "compareGuide", "floorGenerated"];
    const controls = ["source-geometry", "shape", "layout", "margin-x", "margin-y", "gap-x", "gap-y",
      "guide-style", "guide-size", "guide-color", "saddle", "relief-depth"];
    const floor = app.floor = { active: false, id: "terrain", previewId: null, unitSize: 16, slots: {}, single: null,
      roles: Lab.floorRoles.map(role => ({ ...role })), nextId: 1,
      paint: Lab.makeFloorSample(32, 22) };
    function capture() {
      const result = { controls: {} };
      fields.forEach(key => result[key] = key === "mapping" ? state.mapping.slice() : state[key]);
      controls.forEach(id => result.controls[id] = $(id).value);
      return result;
    }
    function restore(snapshot) {
      fields.forEach(key => state[key] = key === "mapping" ? snapshot[key].slice() : snapshot[key]);
      controls.forEach(id => {
        const value = snapshot.controls[id];
        if (id === "guide-size" && !Array.from($(id).options).some(option => option.value === value))
          $("import-size").value = value;
        $(id).value = value;
      });
      app.syncVariants();
    }
    app.captureLayerState = capture;
    app.restoreLayerState = restore;
    app.compileLayerState = function (snapshot) {
      restore(snapshot);
      try {
        state.slice = app.inferSource(state.source);
        if (["margin-x", "margin-y", "gap-x", "gap-y"].some(id => $(id).value.trim() === ""))
          throw new Error("切分参数未填写");
        app.compileVariants();
        state.valid = true;
      } catch (_) {
        state.valid = false;
      }
      return { ...capture(), enabled: snapshot.enabled };
    };
    function create(role) {
      const source = role.custom ? Lab.canvas(floor.unitSize * 4, floor.unitSize * 4) :
        Lab.floorSource(role.id, floor.unitSize);
      const slice = Lab.infer(source.width, source.height, "4x4", 0, 0, 0, 0);
      const tiles = Lab.slice(source, slice, Lab.layouts.continuous);
      return { source, fileName: `${role.id}-${floor.unitSize}px-original.png`, isDemo: false, slice, tiles,
        flatTiles: tiles, mapping: Lab.layouts.continuous.slice(), valid: true, sources: [], activeVariant: 0,
        variantMode: "mixed", variantSeed: 42817, compareGuide: false, floorGenerated: true,
        variantPacks: [{ name: role.name, tiles, flatTiles: tiles }], enabled: role.required,
        controls: { "source-geometry": "square", shape: "4x4", layout: "continuous",
          "margin-x": "0", "margin-y": "0", "gap-x": "0", "gap-y": "0",
          "guide-style": "flat", "guide-size": String(floor.unitSize), "guide-color": "#947052",
          saddle: "connected", "relief-depth": "18" } };
    }
    app.saveFloorLayer = function () {
      if (!floor.active) return;
      const enabled = floor.slots[floor.id].enabled;
      floor.slots[floor.id] = { ...capture(), enabled };
    };
    app.switchFloorLayer = function (id) {
      if (!floor.active || !floor.slots[id] || id === floor.id) return;
      app.finishPaintStroke?.();
      app.cancelImport?.();
      app.saveFloorLayer();
      floor.id = id;
      restore(floor.slots[id]);
      app.rebuild();
    };
    app.setFloorPreview = function (id) {
      if (!floor.active || id !== null && !floor.slots[id]) return;
      app.finishPaintStroke?.();
      floor.previewId = id;
      app.syncFloorUi();
      app.clearSelection();
      app.schedule();
    };
    app.setFloorWorkflow = function (enabled) {
      if (enabled === floor.active) return;
      app.finishPaintStroke?.();
      app.cancelImport?.();
      if (enabled) {
        floor.single = capture();
        if (!floor.slots.terrain) floor.roles.forEach(role => floor.slots[role.id] = create(role));
        floor.active = true;
        restore(floor.slots[floor.id]);
      } else {
        app.saveFloorLayer();
        floor.active = false;
        restore(floor.single);
      }
      $("workflow").value = enabled ? "floor" : "single";
      app.rebuild();
      if (enabled) app.showFloorCase?.();
    };
    app.resizeFloor = function (size) {
      if (Object.values(floor.slots).some(slot => !slot.floorGenerated)) return false;
      if (floor.roles.length * size * size * 16 > 16777216) return false;
      floor.unitSize = size;
      floor.roles.forEach(role => {
        const enabled = floor.slots[role.id].enabled;
        floor.slots[role.id] = { ...create(role), enabled };
      });
      restore(floor.slots[floor.id]);
      app.rebuild();
      return true;
    };
    app.addFloorLayer = function (name, shapeFrom) {
      if (!floor.active || !["", "terrain", "wall"].includes(shapeFrom)) return;
      const pixels = Object.values(floor.slots).reduce((total, slot) => total +
        (slot.sources.length ? slot.sources : [{ source: slot.source }])
          .reduce((sum, entry) => sum + entry.source.width * entry.source.height, 0), 0);
      if (pixels + floor.unitSize * floor.unitSize * 16 > 16777216) {
        app.notify("已达到全层16777216原图像素预算；请先移除不需要的自定义层或变体。");
        return;
      }
      app.finishPaintStroke?.();
      app.cancelImport?.();
      app.saveFloorLayer();
      const id = `layer-${floor.nextId++}`;
      const role = { id, name: name.trim().slice(0, 48) || "新图层", custom: true,
        required: false, shapeFrom, order: floor.roles.length,
        rule: shapeFrom ? "所属层四角 × 独立覆盖区" : "独立占用四角",
        note: shapeFrom ? "透明点缀；按所属层选形，由本层区域裁切，不改变所属层。" : "独立绘制占用；不改变其他层。" };
      // Place decorations directly above their owner rather than above all foreground layers.
      const ordered = floor.roles.slice().sort((a, b) => a.order - b.order);
      ordered.splice(shapeFrom ? ordered.findIndex(item => item.id === shapeFrom) + 1 : ordered.length, 0, role);
      floor.roles = ordered;
      ordered.forEach((item, index) => item.order = index);
      floor.slots[id] = { ...create(role), enabled: true };
      Lab.clearGrid(Lab.floorMaps(floor.paint, floor.roles)[id]);
      floor.id = id;
      restore(floor.slots[id]);
      app.rebuild();
      app.notify("已添加透明空白层；加图后检查场景展示选形，自由试画从空区域开始，不改其他层。");
    };
    app.moveFloorLayer = function (id, delta) {
      const ordered = floor.roles.slice().sort((a, b) => a.order - b.order);
      const index = ordered.findIndex(role => role.id === id), target = index + delta;
      if (index < 0 || target < 0 || target >= ordered.length) return;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      ordered.forEach((role, order) => role.order = order);
      app.syncFloorUi();
      app.schedule();
    };
    app.reorderFloorLayer = function (id, targetId, before) {
      const ordered = floor.roles.slice().sort((a, b) => b.order - a.order);
      const index = ordered.findIndex(role => role.id === id);
      if (index < 0 || id === targetId || !ordered.some(role => role.id === targetId)) return;
      const [moving] = ordered.splice(index, 1);
      const target = ordered.findIndex(role => role.id === targetId);
      ordered.splice(target + (before ? 0 : 1), 0, moving);
      ordered.forEach((role, index) => role.order = ordered.length - index - 1);
      app.syncFloorUi();
      app.schedule();
    };
    app.removeFloorLayer = function (id) {
      const role = floor.roles.find(item => item.id === id);
      if (!role?.custom || !window.confirm(`移除“${role.name}”及其本地图片和笔画？此操作不能撤销。`)) return;
      app.finishPaintStroke?.();
      app.cancelImport?.();
      if (floor.id === id) app.switchFloorLayer("terrain");
      if (floor.previewId === id) floor.previewId = null;
      floor.roles = floor.roles.filter(item => item.id !== id);
      delete floor.slots[id];
      app.rebuild();
    };
    app.otherLayerPixels = function () {
      if (!floor.active) return 0;
      return Object.entries(floor.slots).reduce((sum, [id, slot]) => sum + (id === floor.id ? 0 :
        (slot.sources.length ? slot.sources : [{ source: slot.source }])
          .reduce((total, entry) => total + entry.source.width * entry.source.height, 0)), 0);
    };
    app.validateLayerSources = function (sources) {
      if (!floor.active) return;
      for (const entry of sources) {
        const slice = app.inferSource(entry.source);
        if (slice.geometry !== "square" || slice.size !== floor.unitSize)
          throw new Error(`分层素材须为正视方格，原生单格${floor.unitSize}px；各层不能靠缩放对齐`);
      }
    };
    const replaceSources = app.replaceSources;
    app.replaceSources = function (sources, options = {}) {
      app.validateLayerSources(sources);
      if (floor.active) {
        state.floorGenerated = Boolean(options.generated);
        floor.slots[floor.id].enabled = true;
      }
      replaceSources(sources, options);
    };
    app.loadFloorVariants = function () {
      if (floor.roles.find(role => role.id === floor.id).custom) {
        app.notify("自定义层从透明空白开始，请使用加图导入自己的16态图集。");
        return;
      }
      const sources = [0, 1, 2].map(index => ({ name: `${floor.id}-original-v${index + 1}.png`,
        source: Lab.floorSource(floor.id, floor.unitSize, index) }));
      app.replaceSources(sources, { generated: true });
      $("source-panel").close();
      app.notify("已载入当前层的3套原创变体；没有混入其他层。");
    };
    app.basePaint = () => {
      if (!floor.active) return Lab.enableSparse(state.paint);
      Object.values(Lab.floorMaps(floor.paint, floor.roles)).forEach(Lab.enableSparse);
      return floor.paint;
    };
    app.paintMap = () => floor.active ? Lab.floorMaps(floor.paint, floor.roles)[floor.id] : state.paint;
    app.sceneValid = function () {
      if (!floor.active) return state.valid;
      app.saveFloorLayer();
      const slots = Object.entries(floor.slots).filter(([id, slot]) =>
        floor.previewId ? id === floor.previewId : slot.enabled);
      return slots.every(([, slot]) => slot.valid);
    };
    app.drawScene = function (canvas, map, options = {}) {
      if (map.chunks) {
        app.saveFloorLayer();
        return Lab.renderSparseScene(canvas, map, floor.active ? floor.slots : null,
          { ...app.options(), ...options, roles: floor.roles, unitSize: floor.active ? floor.unitSize : state.slice.size,
            activeLayer: floor.previewId || floor.id, solo: Boolean(floor.previewId), single: state });
      }
      if (!floor.active) return Lab.renderMap(canvas, map, state.flatTiles, { ...app.options(), ...options });
      app.saveFloorLayer();
      return Lab.renderFloor(canvas, map, floor.slots, { ...app.options(), ...options,
        roles: floor.roles, unitSize: floor.unitSize,
        activeLayer: floor.previewId || floor.id, solo: Boolean(floor.previewId) });
    };
  };
})(globalThis.DualGridLab);
