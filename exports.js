(function (Lab) {
  "use strict";
  Lab.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  Lab.downloadCanvas = function (canvas, name, notify) {
    canvas.toBlob(blob => {
      if (blob) Lab.download(blob, name);
      else notify("PNG 导出失败；请缩小 tile 尺寸后重试。");
    }, "image/png");
  };
  Lab.exportAtlas = function (tiles, name, notify) {
    const width = tiles[0].width, height = tiles[0].height, canvas = Lab.canvas(width * 4, height * 4);
    const ctx = canvas.getContext("2d");
    for (let state = 0; state < 16; state++)
      ctx.drawImage(tiles[state], state % 4 * width, Math.floor(state / 4) * height);
    Lab.downloadCanvas(canvas, `${name}-anyruled-4x4.png`, notify);
  };
  Lab.exportMapping = function (source, slice, mapping, layout, fileName) {
    const data = {
      format: "dual-grid-lab-mapping", version: 2,
      cornerConvention: Lab.convention, rowsFromTop: true,
      source: { name: fileName, width: source.width, height: source.height },
      layout, slice,
      slots: mapping.map((state, slot) => ({
        sourceSlot: slot, state, label: Lab.stateLabel(state),
        gridPosition: { x: slot % slice.cols, y: Math.floor(slot / slice.cols) },
        sourceRect: Lab.sourceRect(slice, slot)
      })),
      exportAtlas: { columns: 4, rows: 4, cellWidth: slice.tileWidth, cellHeight: slice.tileHeight,
        margin: 0, spacing: 0, states: Lab.layouts.anyrule,
        geometry: slice.geometry === "square" ? "square" : "iso-cells" },
      note: "Auxiliary description only. Not a native Unity TileLayoutTemplate; no GUIDs or rule assets are generated."
    };
    Lab.download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "dual-grid-mapping.json");
  };
})(globalThis.DualGridLab);
