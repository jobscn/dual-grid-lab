(function (Lab) {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = {
    source: Lab.makeDemo(), fileName: "连续绘制底稿", isDemo: true,
    slice: null, tiles: null, flatTiles: null, mapping: Lab.layouts.continuous.slice(),
    selected: null, corners: false, background: 0, valid: false, compareGuide: false,
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
    selected: state.selected, view: $("view").value, filter: $("filter").value,
    geometry: state.slice ? state.slice.geometry : "square", nativeTiles: state.tiles });
  app.select = mask => {
    state.selected = state.selected === mask ? null : mask;
    $("unselect").hidden = state.selected === null;
    $("mapping-info").textContent = state.selected === null ?
      "点选切片追踪状态。" :
      `正在追踪状态 ${String(mask).padStart(2, "0")}（${Lab.stateLabel(mask)}）；橙框标记其全部使用位置。`;
    document.querySelectorAll(".tile-button").forEach(button =>
      button.classList.toggle("active", Number(button.dataset.state) === state.selected));
    app.schedule();
  };
  app.inspect = function (event, canvas, map) {
    if (!state.valid) return;
    const hit = Lab.hit(event, canvas, map);
    if (!hit.inside) return;
    const mask = Lab.mask(map, hit.x, hit.y);
    const slot = state.mapping.indexOf(mask), rect = Lab.sourceRect(state.slice, slot);
    const corners = [8, 4, 2, 1].map(bit => mask & bit ? 1 : 0);
    $("inspection").textContent = `STATE ${String(mask).padStart(2, "0")} / ${mask.toString(2).padStart(4, "0")} · ${Lab.stateLabel(mask)} | tile (${hit.x}, ${hit.y}) | NW/NE/SW/SE ${corners.join("/")} | 原图 (${rect.x}, ${rect.y}) ${rect.width}×${rect.height}px`;
  };
  app.exportMap = function (map, name) {
    if (!state.valid) return;
    const canvas = Lab.canvas(1, 1);
    Lab.renderMap(canvas, map, state.flatTiles, { ...app.options(), size: state.slice.size,
      grid: false, dual: false, logic: false, selected: null });
    Lab.downloadCanvas(canvas, name, app.notify);
    app.notify("已请求导出透明 PNG，未包含检查网格、高亮或页面背景。");
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
      button.classList.toggle("active", state.selected === mask);
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
    const canvas = $("paint-canvas");
    if (!state.valid) {
      canvas.width = canvas.height = 1;
      canvas.style.width = canvas.style.height = "1px";
      canvas.labViewport.update();
      return;
    }
    if (!$("paint-panel").hidden) {
      Lab.renderMap(canvas, state.paint, state.flatTiles, app.options());
      Lab.sizePreview(canvas, Number($("zoom").value));
    }
  }
  app.schedule = function () {
    if (!state.frame) state.frame = requestAnimationFrame(draw);
  };
  app.rebuild = function () {
    $("file-info").textContent = `${state.fileName} · ${state.source.width} × ${state.source.height} px${state.isDemo ? " · 示例素材" : ""}`;
    try {
      state.slice = Lab.infer(state.source.width, state.source.height, $("shape").value,
        Number($("margin-x").value), Number($("margin-y").value),
        Number($("gap-x").value), Number($("gap-y").value), $("source-geometry").value);
      if (["margin-x", "margin-y", "gap-x", "gap-y"].some(id => $(id).value.trim() === ""))
        throw new Error("请填写边距和间距，不能留空。");
      state.tiles = Lab.slice(state.source, state.slice, state.mapping, state.isDemo && $("filter").value === "nearest");
      state.flatTiles = Lab.flattenTiles(state.tiles, state.slice.geometry, $("filter").value);
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
      $("coverage-count").innerHTML = `—<span>/16</span>`;
      $("inspection").textContent = "切分无效，预览已暂停；修正参数后自动恢复。";
      $("source-open").classList.add("error");
    }
    app.syncGuideSize();
    ["atlas-export", "mapping-export", "paint-export"].forEach(id => $(id).disabled = !state.valid);
    $("gallery").setAttribute("aria-label", state.valid ? "拼接检查分栏" : "切分无效，预览暂停");
    atlas();
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
    if (state.valid) state.flatTiles = Lab.flattenTiles(state.tiles, state.slice.geometry, $("filter").value);
    document.querySelectorAll("#atlas canvas").forEach(canvas => Lab.setFilter(canvas, $("filter").value));
    app.schedule();
  });
  $("background").addEventListener("click", () => {
    state.background = (state.background + 1) % 3;
    const name = ["浅色棋盘", "深色棋盘", "纯色"][state.background];
    $("background").title = `画布背景：${name} · B`;
    $("background").setAttribute("aria-label", `画布背景：${name}，点击切换`);
    app.schedule();
  });
  $("unselect").addEventListener("click", () => app.select(state.selected));
  $("atlas-export").addEventListener("click", () => {
    if (state.valid) Lab.exportAtlas(state.tiles, "dual-grid", app.notify);
  });
  $("mapping-export").addEventListener("click", () => {
    if (state.valid) Lab.exportMapping(state.source, state.slice, state.mapping, $("layout").value, state.fileName);
  });
  window.addEventListener("resize", app.schedule);
  Lab.bindTemplate(app);
  Lab.bindImport(app);
  Lab.bindPaint(app);
  Lab.bindUi(app);
  Lab.bindPreview(app);
  Lab.bindWorkspace(app);
  app.rebuild();
})(globalThis.DualGridLab);
