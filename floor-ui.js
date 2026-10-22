(function (Lab) {
  "use strict";
  Lab.bindFloorUi = function (app) {
    const $ = app.$, state = app.state, floor = app.floor;
    const role = () => floor.roles.find(item => item.id === floor.id);
    Lab.bindLayerCards(app);
    function guideTiles() {
      if (!state.compareGuide && state.valid) return state.tiles;
      const source = role().custom ? Lab.canvas(floor.unitSize * 4, floor.unitSize * 4) :
        Lab.floorSource(floor.id, floor.unitSize);
      return Lab.slice(source, Lab.infer(source.width, source.height, "4x4", 0, 0, 0, 0), Lab.layouts.continuous);
    }
    app.syncFloorUi = function () {
      const active = floor.active;
      $("floor-controls").hidden = !active;
      $("import-open").hidden = active;
      $("floor-layer-note").hidden = !active;
      $("source-layer-label").hidden = !active;
      const pinned = active && floor.roles.find(item => item.id === floor.previewId);
      document.querySelectorAll(".floor-preview-status").forEach(status => {
        status.hidden = !pinned;
        status.querySelector("[data-floor-preview-name]").textContent = pinned ? `已固定层：${pinned.name}` : "";
        status.querySelector("[data-floor-preview-name]").title = pinned ? `已固定层：${pinned.name}` : "";
      });
      app.syncLayerCards();
      app.syncVariants();
      $("floor-size").value = String(floor.unitSize);
      if (!active) {
        $("import-open").textContent = "导入图集";
        $("import-open").title = "可多选同一地形的完整16态变体图集；替换当前组";
        $("source-open").title = "图集切分与映射";
        $("source-open").setAttribute("aria-label", "图集切分与映射");
        $("paint-hint").textContent = "滚轮缩放 · 空格拖动 · Shift / 右键擦除";
        return;
      }
      $("floor-size").disabled = Object.values(floor.slots).some(slot => !slot.floorGenerated);
      $("floor-size").title = $("floor-size").disabled ? "已有导入作品：保持原生尺寸，不覆盖作品" : "统一重建底稿与透明空白层";
      $("source-open").title = `${role().name} · 切分与映射`;
      $("source-open").setAttribute("aria-label", `${role().name}的切分与映射`);
      $("source-layer-label").textContent = `当前层：${role().name}。仅导入原生单格${floor.unitSize}px的方格16态图集；本层独立保存切分／映射与变体。`;
      $("floor-layer-note").textContent = `${role().name} · ${role().required ? "必需" : "可选"} · ${role().note} ${floor.id === "grass" ? "右侧合成时再按覆盖区域裁切；底稿不包含泥土。" : ""}`;
      $("paint-hint").textContent = `编辑：${role().name}${floor.id === "grass" || role().shapeFrom ? "覆盖区（不改所属层）" : "独立占用"} · Shift / 右键擦除`;
    };
    app.drawFloorTemplate = function () {
      if (!floor.active) return false;
      const canvas = $("template-canvas"), tiles = guideTiles();
      const invalid = !state.compareGuide && !state.valid;
      $("template-title").textContent = `${role().name} · ${state.compareGuide ? "底稿对照" :
        state.floorGenerated ? (role().custom ? "透明空白底稿" : "原创底稿") : "作品 / 参考"}`;
      $("compare-guide").hidden = false;
      $("compare-guide").textContent = state.compareGuide ? "返回当前层" : "对照底稿";
      $("compare-guide").setAttribute("aria-pressed", String(state.compareGuide));
      $("guide-style").closest(".inline-field").hidden = true;
      document.querySelector(".template-settings").hidden = true;
      $("template-legend").hidden = true;
      $("template-topology").textContent = `${floor.roles.length} 层 · 当前层16态`;
      $("template-topology").classList.remove("separated");
      $("template-warning").hidden = !invalid;
      $("template-warning").textContent = "当前层切分无效；请修正切分，或点对照底稿查看参考。";
      canvas.parentElement.classList.remove("sea-preview");
      const options = { ...app.guideOptions(), size: floor.unitSize, tiles, nativeTiles: tiles,
        geometry: "square", style: "flat", selected: state.trackedMask };
      if (invalid) Lab.prepareCanvas(canvas, Lab.continuousMap(), floor.unitSize, options.view);
      else Lab.renderGuide(canvas, options);
      Lab.sizePreview(canvas, Number($("zoom").value));
      $("template-dimensions").textContent = `${floor.unitSize * 4} × ${floor.unitSize * 4} px · 单层16态 · ${state.sources.length || 1}套变体`;
      return true;
    };
    app.exportFloorTemplate = function (kind) {
      if (!floor.active) return false;
      const tiles = guideTiles(), size = floor.unitSize, canvas = Lab.canvas(1, 1);
      const name = `floor-${floor.id}-${size}px`;
      if (kind === "svg") {
        const source = Lab.packCanvas(tiles).toDataURL("image/png");
        const ground = Lab.packCanvas(floor.slots[role().shapeFrom || "terrain"].tiles).toDataURL("image/png");
        Lab.download(new Blob([Lab.floorGuideSvg(floor.id, size, source, ground, floor.roles)],
          { type: "image/svg+xml" }), `${name}-layered-guide.svg`);
      } else {
        const helpers = kind !== "art";
        Lab.renderGuide(canvas, { ...app.guideOptions(), size, view: "ortho",
          tiles, nativeTiles: tiles, geometry: "square", style: "flat", selected: null,
          grid: helpers && $("grid").checked, dual: helpers && $("dual").checked,
          logic: helpers && $("logic").checked, labels: helpers && $("labels").checked,
          overlayOnly: kind === "helpers" });
        Lab.downloadCanvas(canvas, `${name}-${kind}.png`, app.notify);
      }
      app.notify(`已请求导出${role().name}底稿；16态连续排版。参考／辅助线请在新图层绘制后隐藏，不要把泥土合入草皮。`);
      return true;
    };
    $("workflow").addEventListener("change", () => app.setFloorWorkflow($("workflow").value === "floor"));
    document.querySelectorAll("[data-floor-preview-clear]").forEach(button =>
      button.addEventListener("click", () => app.setFloorPreview(null)));
    $("floor-size").addEventListener("change", () => {
      if (!app.resizeFloor(Number($("floor-size").value))) {
        $("floor-size").value = String(floor.unitSize);
        app.notify("无法重建：已有导入作品，或全层超过16777216原图像素预算；保持原尺寸与作品。");
      }
    });
    $("floor-package").addEventListener("click", async () => {
      const button = $("floor-package");
      button.disabled = true;
      try {
        const blob = await Lab.exportFloorBundle(app);
        Lab.download(blob, `dual-grid-floor-${floor.unitSize}px.zip`);
        app.notify("绘制包已生成，包含导出时全部图层与变体；layer-plan.json记录叠放顺序、显隐及点缀所属层。");
      } catch (error) { app.notify(`绘制包导出失败：${error.message}`); }
      finally { button.disabled = false; }
    });
  };
})(globalThis.DualGridLab);
