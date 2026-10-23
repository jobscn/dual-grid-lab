(function (Lab) {
  "use strict";
  const padded = mask => String(mask).padStart(2, "0");
  Lab.selectionContext = function (app, selection) {
    const { canvas, map } = selection, state = app.state;
    const floor = app.floor.active, template = canvas.id === "template-canvas";
    const role = floor ? (!template && app.floor.previewId || app.floor.id) : "single";
    const definition = floor ? app.floor.roles.find(item => item.id === role) : null;
    const shapeFrom = role === "grass" ? "terrain" : definition?.shapeFrom;
    const maps = floor && !template ? Lab.floorMaps(map, app.floor.roles) : null;
    const hidden = maps && !app.floor.previewId && !app.floor.slots[role].enabled;
    return { role, name: definition?.name || "单层地形",
      map: maps ? maps[role] : map, shape: maps ? maps[shapeFrom || role] : map,
      slot: floor && !template && role !== app.floor.id ? app.floor.slots[role] : state,
      template, coverage: Boolean(maps && shapeFrom),
      label: floor ? definition.name +
        (template ? "图集四角样本" : shapeFrom ? "覆盖区域" : "占用") +
        (hidden ? "（当前层隐藏，仅读取数据）" : "") : "单层地形" };
  };
  Lab.selectionTileInfo = function (app, selection, tile) {
    const context = Lab.selectionContext(app, selection), slot = context.slot;
    const mask = Lab.mask(context.shape, tile.x, tile.y), region = Lab.mask(context.map, tile.x, tile.y);
    const packs = slot.variantPacks;
    const index = !context.template && slot.variantMode === "mixed" ?
      Lab.variantIndex(tile.x, tile.y, packs.length, slot.variantSeed) : slot.activeVariant;
    const pack = packs[index], rect = Lab.sourceRect(slot.slice, slot.mapping.indexOf(mask));
    const outside = !Lab.gridInside(context.map, tile.x, tile.y);
    // Generated guide comparison is not a crop from the imported source.
    const reference = context.template && app.state.compareGuide;
    return { ...tile, mask, region, context, index, rect, reference, outside,
      name: outside ? "素材范围外（未渲染）" : reference ? "生成参考（非导入原图）" : pack.name,
      image: reference || outside ? null : pack.tiles[mask] };
  };
  Lab.selectionSummary = function (app, selection) {
    const context = Lab.selectionContext(app, selection), { x, y } = selection;
    if (selection.kind === "logic") {
      const value = Lab.get(context.map, x, y);
      return `${context.label} · L(${x}, ${y}) = ${value} · 关联4个渲染格` +
        (!Lab.gridInside(context.map, x, y, true) ? " · 素材范围外，逻辑值为0" : "") +
        (context.coverage ? " · 覆盖区用于裁切；选图使用所属层四角" : "");
    }
    const tile = Lab.selectionTileInfo(app, selection, { x, y });
    return `${context.label} · R(${x}, ${y}) · ${context.coverage ? "所属层选图 " : ""}STATE ${padded(tile.mask)} / ${tile.mask.toString(2).padStart(4, "0")}` +
      ` · NW/NE/SW/SE ${[8, 4, 2, 1].map(bit => tile.mask & bit ? 1 : 0).join("/")}` +
      (context.coverage ? ` · 覆盖区状态 ${padded(tile.region)}` : "") +
      ` · ${tile.name}${tile.reference || tile.outside ? "" : ` · 原图(${tile.rect.x}, ${tile.rect.y}) ${tile.rect.width}×${tile.rect.height}px`}`;
  };
  Lab.bindCanvasInfo = function (app, canvas) {
    const panel = document.createElement("div"), text = document.createElement("div");
    const heading = document.createElement("strong"), detail = document.createElement("span");
    const close = document.createElement("button");
    panel.className = "viewport-info";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "画布选格信息");
    close.type = "button";
    close.textContent = "×";
    close.title = "取消选区及关联 · Esc";
    close.setAttribute("aria-label", "取消选区及关联");
    close.addEventListener("click", () => app.clearSelection());
    text.append(heading, detail);
    panel.append(text, close);
    canvas.parentElement.append(panel);
    return {
      update(selection, hover, links) {
        const current = selection || hover;
        panel.hidden = !current && !links;
        if (panel.hidden) return;
        close.hidden = !selection && !links;
        panel.dataset.mode = selection ? "selected" : hover && !links ? "hover" : "linked";
        if (current) {
          const context = Lab.selectionContext(app, current);
          heading.textContent = `${selection ? "选中" : "悬停"} · ${context.name} · ${current.kind === "logic" ? "L" : "R"}(${current.x}, ${current.y})`;
          const tiles = Lab.selectionTiles(current).map(tile => Lab.selectionTileInfo(app, current, tile));
          detail.textContent = current.kind === "logic" ?
            `值 ${Lab.get(context.map, current.x, current.y)} · 四格 ${tiles.map(tile => tile.outside ? "外" : padded(tile.mask)).join(" / ")}` :
            tiles[0].outside ? "素材范围外 · 未渲染" :
              `状态 ${padded(tiles[0].mask)}${context.coverage ? ` · 覆盖 ${padded(tiles[0].region)}` : ""} · 变体 ${tiles[0].index + 1}`;
          if (links) detail.textContent += ` · 本图关联 ${links.matches.length}${links.kind === "logic" ? "处" : "格"}`;
          panel.title = Lab.selectionSummary(app, current);
          if (current.kind === "logic") panel.title += "\n四格顺序：左上 / 右上 / 左下 / 右下\n" +
            tiles.map(tile => `${tile.corner} · R(${tile.x}, ${tile.y}) · 状态 ${padded(tile.mask)} · ${tile.name}` +
              (tile.outside || tile.reference ? "" :
                ` · 变体 ${tile.index + 1} · 原图(${tile.rect.x}, ${tile.rect.y}) ${tile.rect.width}×${tile.rect.height}px`)).join("\n");
        } else {
          heading.textContent = `关联 · ${Lab.selectionContext(app, links.source).name}`;
          detail.textContent = `${links.source.kind === "logic" ? "四格" : "状态"} ${links.orderedMasks.map(mask => mask < 0 ? "外" : padded(mask)).join(" / ")} · ${links.matches.length}${links.kind === "logic" ? "处匹配" : "格匹配"}`;
          panel.title = links.kind === "logic" ?
            "匹配中心值与左上、右上、左下、右下四格；点×取消全部关联。" :
            "同一图层的状态切片；点×取消全部关联。";
        }
      },
      dispose() { panel.remove(); }
    };
  };
})(globalThis.DualGridLab);
