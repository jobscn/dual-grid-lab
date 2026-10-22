(function (Lab) {
  "use strict";
  Lab.bindTemplate = function (app) {
    const $ = app.$, state = app.state, canvas = $("template-canvas"), map = Lab.continuousMap();
    Lab.bindViewport(canvas, { label: "左侧底稿" });
    app.guideOptions = () => ({
      size: !state.isDemo && state.valid ? state.slice.size : Number($("guide-size").value), color: $("guide-color").value,
      connected: $("saddle").value === "connected", view: $("view").value,
      style: $("guide-style").value, depth: Number($("relief-depth").value) / 100,
      grid: $("grid").checked, dual: $("dual").checked, logic: $("logic").checked,
      labels: $("labels").checked, filter: $("filter").value
    });
    app.drawTemplate = function () {
      const options = { ...app.guideOptions(), selected: state.selected };
      const isArt = !state.isDemo && !state.compareGuide;
      const pseudo = options.style === "pseudo" && !isArt;
      $("template-title").textContent = isArt ? "作品预览" : state.isDemo ? "绘制底稿" : "底稿对照";
      $("compare-guide").hidden = state.isDemo;
      $("compare-guide").textContent = state.compareGuide ? "返回作品" : "对照底稿";
      $("compare-guide").setAttribute("aria-pressed", String(state.compareGuide));
      $("guide-style").closest(".inline-field").hidden = isArt;
      document.querySelector(".template-settings").hidden = isArt;
      $("template-legend").hidden = isArt;
      if (isArt && state.valid) options.size = state.slice.size;
      canvas.parentElement.classList.toggle("sea-preview", $("sea-preview").checked);
      $("template-topology").textContent = isArt ? "导入图集" :
        pseudo ? "上薄 · 下厚" : options.connected ? "连续底稿" : "分离对角";
      $("template-topology").classList.toggle("separated", !isArt && !options.connected);
      $("template-warning").hidden = !isArt || state.valid;
      $("edge-caption").textContent = pseudo ? "上沿薄边" : "海岸";
      $("wall-caption").hidden = !pseudo;
      document.querySelector(".wall-key").hidden = !pseudo;
      if (isArt && !state.valid) {
        $("template-warning").textContent = "切分无效，作品预览已暂停。可点「对照底稿」查看参考，或修正切分参数。";
        Lab.prepareCanvas(canvas, map, options.size, options.view);
      } else Lab.renderGuide(canvas, isArt ?
        { ...options, tiles: state.flatTiles, nativeTiles: state.tiles, geometry: state.slice.geometry } : options);
      if (!$("guide-content").hidden) Lab.sizePreview(canvas, Number($("zoom").value));
      $("template-dimensions").textContent = `${canvas.width} × ${canvas.height} px · ${options.view === "iso" ? "2:1 等距 / 4×4逻辑格" : pseudo ? `4×4 伪透视 · 立面 ${Math.round(options.depth * 100)}%` : "4×4 正视角"}`;
    };
    app.syncGuideSize = function () {
      const select = $("guide-size"), custom = $("import-size"), imported = !state.isDemo && state.valid;
      select.disabled = imported;
      select.title = imported ? "对照与底稿导出使用作品单格尺寸" : "生成底稿的原生单格尺寸";
      if (imported) {
        const size = String(state.slice.size);
        const standard = Array.from(select.options).some(option => option !== custom && option.value === size);
        custom.hidden = standard;
        custom.value = standard ? "custom" : size;
        custom.textContent = `${size} px · 按作品`;
        select.value = size;
      } else {
        const selected = select.value;
        custom.hidden = true;
        custom.value = "custom";
        select.value = ["4", "8", "16", "32", "64", "128", "256"].includes(selected) ? selected : "128";
      }
    };
    app.useDemo = function (notify = true) {
      const options = app.guideOptions();
      state.source = Lab.makeDemo($("source-geometry").value, {
        size: options.size, color: options.color, connected: options.connected, filter: options.filter,
        style: options.style, depth: options.depth
      });
      state.fileName = options.style === "pseudo" ? "伪透视连续底稿" : "连续绘制底稿";
      state.isDemo = true;
      state.compareGuide = false;
      state.mapping = Lab.layouts.continuous.slice();
      $("layout").value = "continuous";
      $("shape").value = "auto";
      ["margin-x", "margin-y", "gap-x", "gap-y"].forEach(id => $(id).value = "0");
      app.rebuild();
      if (notify) app.notify("已装入干净连续底稿，未带辅助线；正视／等距输入类型与当前选择一致，不是游戏作者素材。");
    };
    function refreshGenerated() {
      $("relief-setting").hidden = $("guide-style").value !== "pseudo";
      $("relief-value").value = `${$("relief-depth").value}%`;
      if (state.isDemo) app.useDemo(false);
      else app.schedule();
    }
    ["guide-size", "guide-color", "saddle", "relief-depth"].forEach(id =>
      $(id).addEventListener("input", refreshGenerated));
    $("guide-style").addEventListener("change", () => {
      if ($("guide-style").value === "pseudo") $("view").value = "ortho";
      refreshGenerated();
    });
    $("view").addEventListener("change", () => {
      if ($("view").value === "iso") $("guide-style").value = "flat";
      refreshGenerated();
    });
    ["labels", "sea-preview"].forEach(id =>
      $(id).addEventListener("input", app.schedule));
    $("compare-guide").addEventListener("click", () => {
      state.compareGuide = !state.compareGuide;
      app.schedule();
    });
    $("source-geometry").addEventListener("change", () => {
      if (state.isDemo) app.useDemo();
      else app.rebuild();
    });
    canvas.addEventListener("pointermove", event => app.inspect(event, canvas, map));
    canvas.addEventListener("click", event => {
      const hit = Lab.hit(event, canvas, map);
      if (hit.inside) app.select(Lab.mask(map, hit.x, hit.y));
    });
    $("example-export").addEventListener("click", () => {
      const options = app.guideOptions(), output = Lab.canvas(1, 1);
      Lab.renderGuide(output, options);
      Lab.downloadCanvas(output, `dual-grid-reference-${options.style}-${options.view}-${options.size}px.png`, app.notify);
      app.notify("已请求导出示例底稿 PNG（生成底色＋当前辅助线，海域透明）。请在新图层作画；需要可隐藏的辅助层时，使用旁边箭头导出分层 SVG 或两张独立 PNG。");
    });
    $("template-export").addEventListener("click", () => {
      const options = app.guideOptions(), output = Lab.canvas(1, 1);
      Lab.renderGuide(output, { ...options, grid: false, dual: false, logic: false, labels: false });
      Lab.downloadCanvas(output, `dual-grid-continuous-${options.style}-${options.view}-${options.size}px.png`, app.notify);
      app.notify(`已导出无网格的连续底稿。${options.view === "iso" ? "导回时选择「等距·整张连续菱形图」。" : "导回时选择「正视角·方格图集」。"}排版选择「连续绘制」。`);
    });
    $("overlay-export").addEventListener("click", () => {
      const options = app.guideOptions(), output = Lab.canvas(1, 1);
      Lab.renderGuide(output, { ...options, overlayOnly: true });
      Lab.downloadCanvas(output, `dual-grid-guide-overlay-${options.view}-${options.size}px.png`, app.notify);
      app.notify("已导出独立辅助线层，与底稿同尺寸；作画时叠在上层，导回前隐藏此层。");
    });
    $("guide-export").addEventListener("click", () => {
      Lab.download(new Blob([Lab.guideSvg(app.guideOptions())], { type: "image/svg+xml" }),
        `dual-grid-continuous-${$("guide-style").value}-${$("view").value}-layered.svg`);
      app.notify("已导出分层SVG：陆地、边带／立面、轮廓和辅助线独立；海面默认隐藏。请在新图层作画，导回前隐藏网格、角点、编号及参考层，保留原画板尺寸。");
    });
  };
})(globalThis.DualGridLab);
