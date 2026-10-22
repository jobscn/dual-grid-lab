(function (Lab) {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = {
    source: Lab.makeDemo(), fileName: "连续绘制底稿", isDemo: true,
    slice: null, tiles: null, flatTiles: null, mapping: Lab.layouts.continuous.slice(),
    trackedMask: null, corners: false, background: 0, valid: false, compareGuide: false,
    seed: 42817,
    paint: Lab.map(32, 22, "自由试画", "FREE PAINT", ""), frame: 0
  };
  // Copy via coordinates because the two sample grids have different row strides.
  const initial = Lab.makeBatch(state.seed)[5];
  for (let y = 0; y <= initial.height; y++)
    for (let x = 0; x <= initial.width; x++) Lab.set(state.paint, x + 3, y + 2, Lab.get(initial, x, y));
  const app = { $, state };
  app.notify = text => $("notice").textContent = text;
  app.options = () => ({ grid: $("grid").checked, dual: $("dual").checked, logic: $("logic").checked,
    selected: state.trackedMask, view: $("view").value, filter: $("filter").value,
    geometry: state.slice ? state.slice.geometry : "square", nativeTiles: state.tiles,
    variantPacks: state.variantMode === "mixed" ? state.variantPacks : null, variantSeed: state.variantSeed });
  app.exportMap = function (map, name) {
    if (!app.sceneValid()) return;
    const canvas = Lab.canvas(1, 1);
    const size = app.floor.active ? app.floor.unitSize : state.slice.size;
    const projection = Lab.projection(map.width, map.height, size, $("view").value);
    if (projection.width * projection.height > 16777216) {
      app.notify("原生场景导出超过16777216像素，请使用较小模板或原生图集尺寸；不会自动缩小作品。");
      return;
    }
    app.drawScene(canvas, map, { size,
      grid: false, dual: false, logic: false, selected: null });
    Lab.downloadCanvas(canvas, name, app.notify);
    app.notify("已请求导出当前预览PNG，遵循图层显隐与固定层预览；未包含检查网格、高亮或页面背景。");
  };
  function atlas() {
    const host = $("atlas");
    host.replaceChildren();
    if (!state.valid) return;
    state.mapping.forEach((mask, slot) => {
      const wrapper = document.createElement("div");
      wrapper.className = "tile-slot";
      const button = document.createElement("button");
      button.className = "tile-button";
      button.dataset.state = mask;
      button.classList.toggle("active", state.trackedMask === mask);
      button.title = `原图第 ${slot + 1} 格 → 状态 ${mask}：${Lab.stateLabel(mask)}`;
      button.setAttribute("aria-label", button.title);
      const canvas = Lab.canvas(state.slice.tileWidth, state.slice.tileHeight);
      canvas.getContext("2d").drawImage(state.tiles[mask], 0, 0);
      Lab.setFilter(canvas, $("filter").value);
      const caption = document.createElement("span");
      caption.textContent = `${String(mask).padStart(2, "0")} · ${mask.toString(2).padStart(4, "0")}`;
      button.append(canvas, caption);
      button.addEventListener("click", () => app.select(mask));
      if (state.corners) {
        const dots = document.createElement("div");
        dots.className = "corner-dots";
        dots.setAttribute("aria-hidden", "true");
        dots.innerHTML = [8, 4, 2, 1].map(bit => `<i class="${mask & bit ? "on" : ""}"></i>`).join("");
        button.append(dots);
      }
      wrapper.append(button);
      if ($("layout").value === "custom") {
        const select = document.createElement("select");
        select.setAttribute("aria-label", `原图第 ${slot + 1} 格的四角状态`);
        select.innerHTML = Lab.layouts.anyrule.map(value =>
          `<option value="${value}">${String(value).padStart(2, "0")} ${Lab.stateLabel(value)}</option>`).join("");
        select.value = mask;
        select.addEventListener("change", () => {
          const target = Number(select.value), other = state.mapping.indexOf(target);
          [state.mapping[slot], state.mapping[other]] = [target, mask];
          app.rebuild();
          app.notify(`已交换原图第 ${slot + 1} 格与第 ${other + 1} 格的状态，确保 16 态不重不漏。`);
        });
        wrapper.append(select);
      }
      host.append(wrapper);
    });
  }
  function draw() {
    state.frame = 0;
    if (!$("guide-content").hidden) app.drawTemplate();
    document.querySelectorAll(".preview-surface").forEach(surface => {
      surface.classList.toggle("dark", state.background === 1);
      surface.classList.toggle("plain", state.background === 2);
    });
    app.drawPreview();
    $("paint-export").disabled = !app.sceneValid();
    const canvas = $("paint-canvas");
    if (!app.sceneValid()) {
      canvas.width = canvas.height = 1;
      canvas.style.width = canvas.style.height = "1px";
      canvas.labViewport.update();
      app.refreshSelection();
      return;
    }
    if (!$("paint-panel").hidden) {
      app.drawScene(canvas, app.basePaint());
      Lab.sizePreview(canvas, Number($("zoom").value));
    }
    app.refreshSelection();
  }
  app.schedule = function () {
    if (!state.frame) state.frame = requestAnimationFrame(draw);
    app.session?.queue();
  };
  app.rebuild = function () {
    try {
      state.slice = app.inferSource(state.source);
      if (["margin-x", "margin-y", "gap-x", "gap-y"].some(id => $(id).value.trim() === ""))
        throw new Error("请填写边距和间距，不能留空。");
      app.compileVariants();
      state.valid = true;
      const slice = state.slice;
      $("slice-info").textContent = `${slice.cols}×${slice.rows} · 16 格 · 单格 ${slice.tileWidth}×${slice.tileHeight} px · ${slice.geometry === "iso-sheet" ? "菱形逻辑行列" : "从上往下"}`;
      $("slice-info").classList.remove("error");
      $("tile-size").textContent = `${slice.tileWidth} × ${slice.tileHeight} px`;
      $("source-open").classList.remove("error");
    } catch (error) {
      state.valid = false;
      $("slice-info").textContent = error.message;
      $("slice-info").classList.add("error");
      $("tile-size").textContent = "切分待修正";
      $("source-open").classList.add("error");
    }
    app.syncGuideSize();
    app.saveFloorLayer();
    app.syncFloorUi();
    ["atlas-export", "mapping-export"].forEach(id => $(id).disabled = !state.valid);
    $("paint-export").disabled = !app.sceneValid();
    $("gallery").setAttribute("aria-label", state.valid ? "拼接检查分栏" : "切分无效，预览暂停");
    atlas();
    app.syncPaintHistory?.();
    app.schedule();
  };
  ["shape", "margin-x", "margin-y", "gap-x", "gap-y"].forEach(id =>
    $(id).addEventListener("input", app.rebuild));
  $("layout").addEventListener("change", () => {
    if ($("layout").value !== "custom") state.mapping = Lab.layouts[$("layout").value].slice();
    app.rebuild();
  });
  $("corners").addEventListener("click", () => {
    state.corners = !state.corners;
    $("corners").setAttribute("aria-pressed", String(state.corners));
    $("corners").textContent = state.corners ? "隐藏四角" : "显示四角";
    atlas();
  });
  ["grid", "dual", "logic"].forEach(id => $(id).addEventListener("change", app.schedule));
  $("zoom").addEventListener("change", () => {
    const raw = $("zoom").value, value = raw === "native" ? raw : Number(raw);
    if (value !== "native" && !Number.isFinite(value)) return;
    document.querySelectorAll("canvas").forEach(canvas => canvas.labViewport?.preset(value));
    app.schedule();
  });
  $("filter").addEventListener("change", () => {
    if (state.isDemo) { app.useDemo(false); return; }
    app.rebuild();
  });
  $("background").addEventListener("click", () => {
    state.background = (state.background + 1) % 3;
    const name = ["浅色棋盘", "深色棋盘", "纯色"][state.background];
    $("background").title = `画布背景：${name} · B`;
    $("background").setAttribute("aria-label", `画布背景：${name}，点击切换`);
    app.schedule();
  });
  $("unselect").addEventListener("click", () => app.select(state.trackedMask));
  $("atlas-export").addEventListener("click", () => {
    if (state.valid) Lab.exportAtlas(state.tiles,
      `${app.floor.active ? `floor-${app.floor.id}` : "dual-grid"}-variant-${state.activeVariant + 1}`, app.notify);
  });
  $("mapping-export").addEventListener("click", () => {
    if (state.valid) Lab.exportMapping(state.source, state.slice, state.mapping, $("layout").value, state.fileName,
      app.floor.active ? { ...Lab.floorPlan(app.floor.unitSize, app.floor.roles), currentLayer: app.floor.id } : null);
  });
  window.addEventListener("resize", app.schedule);
  Lab.bindSelectionTools(app);
  Lab.bindTemplate(app);
  Lab.bindVariants(app);
  Lab.bindFloorState(app);
  Lab.bindFloorUi(app);
  Lab.bindImport(app);
  Lab.bindPaint(app);
  Lab.bindUi(app);
  Lab.bindPreview(app);
  Lab.bindWorkspace(app);
  app.rebuild();
  Lab.bindSession(app);
})(globalThis.DualGridLab);
