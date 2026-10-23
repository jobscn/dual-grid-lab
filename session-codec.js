(function (Lab) {
  "use strict";
  const format = "dual-grid-lab-state", version = 2;
  const values = ["view", "filter", "zoom", "seed"];
  const checks = ["grid", "dual", "logic", "labels", "sea-preview"];
  const layerFields = ["fileName", "isDemo", "mapping", "activeVariant", "variantMode",
    "variantSeed", "compareGuide", "floorGenerated"];
  const layerControls = ["source-geometry", "shape", "layout", "margin-x", "margin-y", "gap-x", "gap-y",
    "guide-style", "guide-size", "guide-color", "saddle", "relief-depth"];
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 4294967295;
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const text = (value, length = 512) => typeof value === "string" && value.length <= length;
  const cellArray = (cells, length) => Array.isArray(cells) && cells.length === length &&
    cells.every(value => value === 0 || value === 1);
  function validateGrid(data, width, height) {
    const length = (width + 1) * (height + 1);
    if (Array.isArray(data)) { ensure(cellArray(data, length), "试画数据不完整"); return; }
    ensure(record(data) && cellArray(data.cells, length), "试画数据不完整");
    if (data.chunks === undefined) return;
    ensure(Array.isArray(data.chunks) && data.chunks.length <= 16384, "试画分块无效");
    const keys = new Set();
    data.chunks.forEach(chunk => {
      ensure(Array.isArray(chunk) && chunk.length === 3 &&
        chunk.slice(0, 2).every(value => Number.isSafeInteger(value) &&
          Math.abs(value) < Math.floor((Number.MAX_SAFE_INTEGER - 64) / 32)) &&
        Array.isArray(chunk[2]) && chunk[2].length > 0 && chunk[2].length <= 1024, "试画分块无效");
      const [cx, cy, indices] = chunk, key = `${cx},${cy}`;
      ensure(!keys.has(key) && new Set(indices).size === indices.length, "试画分块重复");
      keys.add(key);
      indices.forEach(index => {
        ensure(Number.isInteger(index) && index >= 0 && index < 1024, "试画分块索引无效");
        const x = cx * 32 + index % 32, y = cy * 32 + Math.floor(index / 32);
        ensure(x < 0 || y < 0 || x > width || y > height, "试画分块与基准区域重叠");
      });
    });
  }
  function validateMap(map) {
    ensure(record(map) && Number.isInteger(map.width) && map.width > 0 && map.width <= 128 &&
      Number.isInteger(map.height) && map.height > 0 && map.height <= 128, "试画尺寸无效");
    validateGrid(map, map.width, map.height);
    ["title", "tag", "description"].forEach(key => ensure(text(map[key]), "试画说明无效"));
  }
  function validateView(view) {
    ensure(record(view) && typeof view.fit === "boolean" && typeof view.native === "boolean" &&
      Number.isFinite(view.zoom) && view.zoom >= 1 / 1024 && view.zoom <= 1048576 &&
      [view.centerX, view.centerY].every(value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 1024),
    "画布视图无效");
  }
  function validateControls(controls, ids, $) {
    ensure(record(controls), "缺少页面设置");
    ids.forEach(id => {
      const value = controls[id], element = $(id);
      ensure(text(value, 80), `设置无效：${id}`);
      if (element.tagName === "SELECT" && id !== "guide-size")
        ensure(Array.from(element.options).some(option => option.value === value), `未知设置：${id}`);
    });
    if (ids.includes("guide-size"))
      ensure(/^\d+$/.test(controls["guide-size"]) && Number(controls["guide-size"]) >= 2 &&
        Number(controls["guide-size"]) <= 256 && /^#[\da-f]{6}$/i.test(controls["guide-color"]), "底稿设置无效");
  }
  Lab.validateSession = function (data, $) {
    ensure(record(data) && data.format === format && [1, version].includes(data.version), "不支持的状态文件格式或版本");
    const s = data.state, f = data.floor;
    ensure(record(s) && record(f) && record(data.assets), "状态数据不完整");
    validateControls(data.controls, values, $);
    checks.forEach(id => ensure(typeof data.controls[id] === "boolean", `开关无效：${id}`));
    if (s.linkSelection !== undefined) ensure(typeof s.linkSelection === "boolean", "关联开关无效");
    ensure(uint(s.seed) && [0, 1, 2].includes(s.background) && typeof s.corners === "boolean" &&
      ["render", "logic"].includes(s.pickKind) &&
      (s.trackedMask === null || Number.isInteger(s.trackedMask) && s.trackedMask >= 0 && s.trackedMask < 16),
    "全局状态无效");
    validateMap(s.paint);
    validateMap(f.paint);
    ensure(typeof f.active === "boolean" && Number.isInteger(f.unitSize) && f.unitSize >= 2 && f.unitSize <= 256 &&
      Number.isSafeInteger(f.nextId) && f.nextId > 0 && Array.isArray(f.roles) &&
      f.roles.length >= 3 && f.roles.length <= 256 && record(f.slots), "图层结构无效");
    const ids = f.roles.map(role => role?.id);
    ensure(new Set(ids).size === ids.length && ["terrain", "grass", "wall"].every(id => ids.includes(id)),
      "缺少必需图层或图层编号重复");
    f.roles.forEach(role => {
      ensure(record(role) && /^(terrain|grass|wall|layer-[1-9]\d*)$/.test(role.id) &&
        text(role.name, 48) && role.name.trim() && Number.isInteger(role.order) &&
        role.order >= 0 && role.order <= Number.MAX_SAFE_INTEGER && text(role.note) && text(role.rule) &&
        (role.shapeFrom === undefined || ["", "terrain", "wall"].includes(role.shapeFrom)) &&
        typeof role.required === "boolean", "图层定义无效");
      ensure(/^layer-/.test(role.id) ? role.custom === true && !role.required &&
        Number(role.id.slice(6)) < f.nextId : !role.custom &&
        role.required === (role.id !== "wall"), "图层类型无效");
      if (["terrain", "wall"].includes(role.id)) ensure(!role.shapeFrom, "基础图层不能依附其他层");
      if (role.id === "grass") ensure(!role.shapeFrom || role.shapeFrom === "terrain", "草皮必须跟随地形选形");
    });
    ensure(new Set(f.roles.map(role => role.order)).size === ids.length && ids.includes(f.id) &&
      (f.previewId === null || ids.includes(f.previewId)), "图层顺序或选中层无效");
    const slotIds = Object.keys(f.slots);
    ensure(!slotIds.length && !f.active || slotIds.length === ids.length && ids.every(id => slotIds.includes(id)),
      "图层素材不完整");
    ensure(record(f.maps) && Object.keys(f.maps).length === ids.length &&
      ids.every(id => Object.hasOwn(f.maps, id)), "图层笔画不完整");
    ids.forEach(id => validateGrid(f.maps[id], f.paint.width, f.paint.height));
    const refs = new Set();
    function layer(snapshot) {
      ensure(record(snapshot) && text(snapshot.fileName) && typeof snapshot.isDemo === "boolean" &&
        Lab.validateMapping(snapshot.mapping || []) && uint(snapshot.variantSeed) &&
        ["mixed", "fixed"].includes(snapshot.variantMode) && typeof snapshot.compareGuide === "boolean" &&
        Array.isArray(snapshot.sources) && snapshot.sources.length <= 8, "图集状态无效");
      validateControls(snapshot.controls, layerControls, $);
      const entries = snapshot.sources.length ? snapshot.sources : [{ source: snapshot.source, name: snapshot.fileName }];
      ensure(Number.isInteger(snapshot.activeVariant) && snapshot.activeVariant >= 0 &&
        snapshot.activeVariant < entries.length && entries[snapshot.activeVariant].source === snapshot.source,
      "当前变体无效");
      entries.forEach(entry => {
        ensure(record(entry) && text(entry.name) && text(entry.source, 120) &&
          Object.hasOwn(data.assets, entry.source), "图集图片缺失");
        refs.add(entry.source);
      });
    }
    layer(data.single);
    Object.values(f.slots).forEach(snapshot => {
      layer(snapshot);
      ensure(typeof snapshot.enabled === "boolean", "图层显隐无效");
    });
    ensure(Object.keys(data.assets).length === refs.size, "图片清单无效");
    let pixels = 0;
    refs.forEach(id => {
      const asset = data.assets[id];
      ensure(record(asset) && Number.isInteger(asset.width) && asset.width >= 1 && asset.width <= 8192 &&
        Number.isInteger(asset.height) && asset.height >= 1 && asset.height <= 8192, "图片尺寸无效");
      pixels += asset.width * asset.height;
    });
    ensure(pixels <= 33554432, "状态图片超过33554432像素预算");
    const workspace = data.workspace, paint = data.paint;
    ensure(record(workspace) && typeof workspace.guideOpen === "boolean" &&
      ["none", "gallery", "paint"].includes(workspace.side) && ["gallery", "paint"].includes(workspace.previousSide) &&
      (workspace.guideOpen || workspace.side !== "none"), "工作区布局无效");
    if (workspace.collapsedLayers !== undefined)
      ensure(Array.isArray(workspace.collapsedLayers) && workspace.collapsedLayers.length <= ids.length &&
        new Set(workspace.collapsedLayers).size === workspace.collapsedLayers.length &&
        workspace.collapsedLayers.every(id => ids.includes(id)), "图层展开状态无效");
    ensure(record(paint) && typeof paint.eraser === "boolean" && ["draw", "move", "select"].includes(paint.tool) &&
      record(paint.histories), "笔刷状态无效");
    Object.entries(paint.histories).forEach(([id, entries]) => {
      ensure(id === "single" || ids.includes(id), "未知笔画图层");
      ensure(Array.isArray(entries) && entries.length <= 40, "撤销历史无效");
      const map = id === "single" ? s.paint : f.paint;
      entries.forEach(data => {
        if (!record(data) || !Object.hasOwn(data, "changes")) {
          validateGrid(data, map.width, map.height);
          return;
        }
        ensure(Array.isArray(data.changes) && data.changes.length <= 1048576, "笔画差量无效");
        const seen = new Set();
        data.changes.forEach(change => {
          ensure(Array.isArray(change) && change.length === 3 &&
            change.slice(0, 2).every(value => Number.isSafeInteger(value) &&
              Math.abs(value) < Number.MAX_SAFE_INTEGER - 32) &&
            (change[2] === 0 || change[2] === 1), "笔画差量无效");
          const key = `${change[0]},${change[1]}`;
          ensure(!seen.has(key), "笔画差量重复");
          seen.add(key);
        });
      });
    });
    ensure(Array.isArray(data.panes) && data.panes.length >= 1 && data.panes.length <= 5, "检查栏数量无效");
    data.panes.forEach(pane => {
      ensure(record(pane) && uint(pane.seed) && Number.isInteger(pane.index) && pane.index >= 0 &&
        pane.index < Lab.makeChecks(pane.seed).length, "检查栏状态无效");
      validateView(pane.view);
    });
    validateView(data.views?.template);
    validateView(data.views?.paint);
    if (data.position !== undefined) {
      ensure(record(data.position) && typeof data.position.sourceOpen === "boolean", "浏览位置无效");
      ["page", "layers", "gallery", "source"].forEach(key =>
        ensure(Array.isArray(data.position[key]) && data.position[key].length === 2 &&
          data.position[key].every(value => Number.isFinite(value) && value >= 0 && value <= 10000000),
        "滚动位置无效"));
    }
    if (data.selection !== null)
      ensure(record(data.selection) && Number.isInteger(data.selection.canvas) && data.selection.canvas >= 0 &&
        data.selection.canvas < data.panes.length + 2 &&
        ["single", ...ids].includes(data.selection.layer) && ["logic", "render"].includes(data.selection.kind) &&
        Number.isSafeInteger(data.selection.x) && Number.isSafeInteger(data.selection.y), "选区无效");
    return data;
  };
  Lab.sessionCodec = function (app, identify) {
    const $ = app.$;
    const position = () => ({
      page: [window.scrollX, window.scrollY],
      layers: [$("floor-layer-cards").scrollLeft, $("floor-layer-cards").scrollTop],
      gallery: [$("gallery").scrollLeft, $("gallery").scrollTop],
      source: [document.querySelector(".source-body").scrollLeft, document.querySelector(".source-body").scrollTop],
      sourceOpen: $("source-panel").open
    });
    function restorePosition(snapshot) {
      if (!snapshot) return;
      if (snapshot.sourceOpen && !$("source-panel").open) $("source-panel").showModal();
      if (!snapshot.sourceOpen && $("source-panel").open) $("source-panel").close();
      [["layers", $("floor-layer-cards")], ["gallery", $("gallery")],
        ["source", document.querySelector(".source-body")]].forEach(([key, element]) => {
        element.scrollLeft = snapshot[key][0];
        element.scrollTop = snapshot[key][1];
      });
      window.scrollTo(snapshot.page[0], snapshot.page[1]);
    }
    function mapData(map) {
      return { width: map.width, height: map.height, title: map.title, tag: map.tag,
        description: map.description, ...Lab.gridData(map) };
    }
    function mapFrom(data) {
      const map = Lab.map(data.width, data.height, data.title, data.tag, data.description);
      Lab.restoreGrid(map, data);
      return map;
    }
    function capture() {
      app.saveFloorLayer();
      const assets = {};
      function ref(source) {
        const id = identify(source);
        assets[id] = { width: source.width, height: source.height };
        return id;
      }
      function layer(snapshot) {
        const result = { controls: { ...snapshot.controls }, source: ref(snapshot.source),
          sources: snapshot.sources.map(entry => ({ name: entry.name, source: ref(entry.source) })) };
        layerFields.forEach(key => { if (snapshot[key] !== undefined) result[key] = snapshot[key]; });
        if (snapshot.enabled !== undefined) result.enabled = snapshot.enabled;
        return result;
      }
      const state = app.state, floor = app.floor;
      const single = layer(floor.active ? floor.single : app.captureLayerState());
      const slots = Object.fromEntries(Object.entries(floor.slots).map(([id, snapshot]) => [id, layer(snapshot)]));
      return { format, version, assets, controls: Object.fromEntries([
        ...values.map(id => [id, $(id).value]), ...checks.map(id => [id, $(id).checked])]),
      state: { seed: state.seed, background: state.background, corners: state.corners,
        pickKind: state.pickKind, linkSelection: state.linkSelection,
        trackedMask: state.trackedMask, paint: mapData(state.paint) },
      single, floor: { active: floor.active, id: floor.id, previewId: floor.previewId, unitSize: floor.unitSize,
        nextId: floor.nextId, roles: floor.roles.map(role => ({ ...role })), slots,
        paint: mapData(floor.paint), maps: Object.fromEntries(Object.entries(Lab.floorMaps(floor.paint, floor.roles))
          .map(([id, map]) => [id, Lab.gridData(map)])) },
      workspace: { ...app.workspaceState.capture(), collapsedLayers: app.layerCardsState.capture() },
      paint: app.paintState.capture(), panes: app.previewState.capture(),
      views: { template: $("template-canvas").labViewport.snapshot(), paint: $("paint-canvas").labViewport.snapshot() },
      selection: app.selectionState.capture(), sliceDetails: document.querySelector(".slice-details").open,
      position: position() };
    }
    async function restore(data, assets) {
      Lab.validateSession(data, $);
      const state = app.state, floor = app.floor;
      function layer(snapshot) {
        return app.compileLayerState({ ...snapshot, source: assets.get(snapshot.source),
          sources: snapshot.sources.map(entry => ({ name: entry.name, source: assets.get(entry.source) })) });
      }
      values.forEach(id => $(id).value = data.controls[id]);
      checks.forEach(id => $(id).checked = data.controls[id]);
      floor.active = false;
      Object.assign(state, data.state, { linkSelection: data.state.linkSelection === true,
        paint: mapFrom(data.state.paint), selection: null, hover: null });
      const single = layer(data.single);
      const slots = Object.fromEntries(Object.entries(data.floor.slots).map(([id, snapshot]) => [id, layer(snapshot)]));
      app.resetLayerCards();
      Object.assign(floor, data.floor, { single, slots, paint: mapFrom(data.floor.paint) });
      app.layerCardsState.restore(data.workspace.collapsedLayers || []);
      const maps = Lab.floorMaps(floor.paint, floor.roles);
      Object.entries(data.floor.maps).forEach(([id, data]) => Lab.restoreGrid(maps[id], data));
      app.restoreLayerState(floor.active ? slots[floor.id] : single);
      $("workflow").value = floor.active ? "floor" : "single";
      $("corners").setAttribute("aria-pressed", String(state.corners));
      $("corners").textContent = state.corners ? "隐藏四角" : "显示四角";
      const background = ["浅色棋盘", "深色棋盘", "纯色"][state.background];
      $("background").title = `画布背景：${background} · B`;
      $("background").setAttribute("aria-label", `画布背景：${background}，点击切换`);
      $("relief-setting").hidden = $("guide-style").value !== "pseudo";
      $("relief-value").value = `${$("relief-depth").value}%`;
      app.previewState.restore(data.panes);
      app.workspaceState.restore(data.workspace);
      app.paintState.restore(data.paint);
      app.rebuild();
      const tracked = state.trackedMask;
      state.trackedMask = null;
      if (tracked !== null) app.select(tracked);
      else $("unselect").hidden = true;
      document.querySelector(".slice-details").open = Boolean(data.sliceDetails);
      await new Promise(resolve => requestAnimationFrame(resolve));
      $("template-canvas").labViewport.restore(data.views.template);
      $("paint-canvas").labViewport.restore(data.views.paint);
      app.selectionState.restore(data.selection);
      await new Promise(resolve => requestAnimationFrame(resolve));
      restorePosition(data.position);
    }
    return { capture, restore };
  };
})(globalThis.DualGridLab);
