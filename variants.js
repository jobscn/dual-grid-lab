(function (Lab) {
  "use strict";
  // Coordinate hashing keeps choices stable through redraws, zoom, painting and PNG export.
  Lab.variantIndex = function (x, y, count, seed = 0) {
    let value = (Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b) ^ seed) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) % count;
  };
  Lab.bindVariants = function (app) {
    const $ = app.$, state = app.state;
    state.sources = [];
    state.variantPacks = [];
    state.activeVariant = 0;
    state.variantMode = "mixed";
    state.variantSeed = 42817;
    app.syncVariants = function () {
      const sources = state.sources, select = $("variant-source");
      const layered = Boolean(app.floor?.active);
      $("variant-controls").hidden = sources.length < 2;
      select.hidden = layered;
      $("variant-remove").hidden = layered;
      $("variant-controls").setAttribute("aria-label", layered ? "当前编辑层的变体显示方式" : "地形变体");
      select.replaceChildren(...sources.map((source, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${index + 1} · ${source.name}`;
        return option;
      }));
      select.value = String(state.activeVariant);
      $("variant-mode").value = state.variantMode;
      $("variant-seed").disabled = state.variantMode !== "mixed";
      $("variant-seed").title = `变体种子 ${state.variantSeed}；仅改变纹理，不改地形`;
      $("atlas-export").title = sources.length > 1 ? "仅导出左侧当前变体；不将多个变体拼成一种规则" : "";
    };
    app.inferSource = source => Lab.infer(source.width, source.height, $("shape").value,
      Number($("margin-x").value), Number($("margin-y").value),
      Number($("gap-x").value), Number($("gap-y").value), $("source-geometry").value);
    app.compileVariants = function () {
      const sources = state.sources.length ? state.sources : [{ source: state.source, name: state.fileName }];
      const packs = sources.map(entry => {
        if (entry.source.width !== state.source.width || entry.source.height !== state.source.height)
          throw new Error("变体须为相同尺寸、相同排版的完整16态图集；请分组导入。");
        const slice = app.inferSource(entry.source);
        const tiles = Lab.slice(entry.source, slice, state.mapping, state.isDemo && $("filter").value === "nearest");
        return { name: entry.name, tiles, flatTiles: Lab.flattenTiles(tiles, slice.geometry, $("filter").value) };
      });
      state.variantPacks = packs;
      const current = packs[state.activeVariant];
      state.tiles = current.tiles;
      state.flatTiles = current.flatTiles;
    };
    app.replaceSources = function (sources, options = {}) {
      app.cancelImport?.();
      state.sources = sources;
      state.activeVariant = options.activeVariant || 0;
      state.source = sources[state.activeVariant].source;
      state.fileName = sources[state.activeVariant].name;
      state.isDemo = false;
      state.compareGuide = false;
      app.syncVariants();
      app.rebuild();
    };
    app.selectVariant = function (index) {
      if (!Number.isInteger(index) || index < 0 || index >= state.sources.length) return;
      state.activeVariant = index;
      state.compareGuide = false;
      const entry = state.sources[state.activeVariant];
      state.source = entry.source;
      state.fileName = entry.name;
      app.syncVariants();
      app.rebuild();
    };
    $("variant-source").addEventListener("change", () => {
      app.selectVariant(Number($("variant-source").value));
    });
    $("variant-mode").addEventListener("change", () => {
      state.variantMode = $("variant-mode").value;
      app.syncVariants();
      app.schedule();
    });
    $("variant-seed").addEventListener("click", () => {
      state.variantSeed = (state.variantSeed + 1) >>> 0;
      app.syncVariants();
      app.schedule();
      app.notify(`纹理种子 ${state.variantSeed}；地形、试画和钉住栏不变。`);
    });
    app.removeVariant = function () {
      if (state.sources.length < 2) return;
      app.replaceSources(state.sources.filter((_, index) => index !== state.activeVariant),
        { generated: state.floorGenerated, activeVariant: Math.max(0, state.activeVariant - 1) });
    };
    $("variant-remove").addEventListener("click", app.removeVariant);
    $("variant-example").addEventListener("click", () => {
      if (app.floor?.active) { app.loadFloorVariants(); return; }
      $("source-geometry").value = "square";
      $("shape").value = "4x4";
      $("layout").value = "continuous";
      ["margin-x", "margin-y", "gap-x", "gap-y"].forEach(id => $(id).value = "0");
      state.mapping = Lab.layouts.continuous.slice();
      state.variantMode = "mixed";
      app.replaceSources(Lab.variantExample());
      $("source-panel").close();
      app.notify("已载入3套原创土壤变体；左侧逐套检查，右侧稳定混用。不是泰拉瑞亚素材。");
    });
    app.syncVariants();
  };
  Lab.variantExample = function () {
    const base = Lab.makeDemo("square", { size: 16, color: "#947052", filter: "nearest", connected: true });
    return [0, 1, 2].map(variant => {
      const source = Lab.canvas(base.width, base.height), ctx = source.getContext("2d");
      ctx.drawImage(base, 0, 0);
      const image = ctx.getImageData(0, 0, source.width, source.height), pixels = image.data;
      const palette = [[118, 85, 63], [175, 139, 100], [103, 78, 62]];
      for (let y = 2; y < source.height - 2; y++)
        for (let x = 2; x < source.width - 2; x++) {
          // Keep shared edge bands and coast pixels unchanged across variants.
          if (x % 16 < 2 || x % 16 > 13 || y % 16 < 2 || y % 16 > 13) continue;
          const at = (y * source.width + x) * 4;
          if (pixels[at] !== 148 || pixels[at + 1] !== 112 || pixels[at + 2] !== 82 ||
              pixels[at + 3] !== 255 || Lab.variantIndex(x, y, 17, variant + 1) > 1) continue;
          const color = palette[Lab.variantIndex(x, y, 3, variant + 29)];
          pixels.set(color, at);
        }
      ctx.putImageData(image, 0, 0);
      return { name: `原创土壤-变体${variant + 1}.png`, source };
    });
  };
})(globalThis.DualGridLab);
