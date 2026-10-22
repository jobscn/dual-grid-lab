(function (Lab) {
  "use strict";
  Lab.floorPlan = function (size = 16, roles = Lab.floorRoles) {
    return { format: "dual-grid-lab-layered-floor", version: 1, cellPixels: size,
      cornerConvention: Lab.convention, drawingLayout: Lab.layouts.continuous, pluginLayout: Lab.layouts.anyrule,
      pureSoilAtlasCount: 1, requiredAtlasCount: roles.filter(role => role.required).length,
      optionalAtlasCount: roles.filter(role => !role.required).length, minimumVariantCountPerLayer: 1,
      layers: roles.map(role => ({ ...role, states: 16,
        transparentStates: role.id === "grass" ? [0, 15] : [0] })),
      composition: roles.slice().sort((a, b) => a.order - b.order).map(role => role.id), grassShape: "terrain four-corner mask",
      grassPresence: "separate coverage mask; pixel-hard geometric clipping in this tool",
      walls: "independent four-corner occupancy, same cell size; no native 32px wall overscan",
      integration: "Artist reference only; not a Unity asset or generated AnyRuleD rule set.",
      reference: "Original side-view teaching artwork; not bundled Terraria artwork." };
  };
  function rasterSvg(raster) {
    const paths = new Map();
    for (let y = 0; y < raster.height; y++) {
      let x = 0;
      while (x < raster.width) {
        const at = (y * raster.width + x) * 4;
        if (!raster.data[at + 3]) { x++; continue; }
        const color = Array.from(raster.data.slice(at, at + 3)), start = x++;
        while (x < raster.width) {
          const next = (y * raster.width + x) * 4;
          if (raster.data[next + 3] !== 255 || color.some((value, i) => raster.data[next + i] !== value)) break;
          x++;
        }
        const key = `#${color.map(value => value.toString(16).padStart(2, "0")).join("")}`;
        paths.set(key, (paths.get(key) || "") + `M${start} ${y}h${x - start}v1h-${x - start}z`);
      }
    }
    return Array.from(paths, ([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join("");
  }
  Lab.floorGuideSvg = function (id, size = 16, reference = null, ground = null, roles = Lab.floorRoles) {
    const role = roles.find(item => item.id === id), width = size * 4;
    const title = role.name.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
    const artwork = reference ? `<image width="${width}" height="${width}" href="${reference}"/>` :
      role.custom ? "" : rasterSvg(Lab.floorRaster(id, size));
    let grid = "", labels = "";
    for (let i = 0; i <= 4; i++) grid += `<path d="M${i * size} 0V${width}M0 ${i * size}H${width}"/>`;
    Lab.layouts.continuous.forEach((mask, slot) => labels +=
      `<text x="${(slot % 4 + .5) * size}" y="${(Math.floor(slot / 4) + .6) * size}">${String(mask).padStart(2, "0")}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" shape-rendering="crispEdges">
<title>${title} · ${role.required ? "必需" : "可选"}16态绘制底稿</title>
<metadata>${JSON.stringify({ ...Lab.floorPlan(size, roles), currentLayer: id, hideBeforeImport: ["placement-reference", "reference-art", "cut-lines", "state-labels"] }).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</metadata>
<g id="placement-reference" inkscape:groupmode="layer" inkscape:label="地形位置参考_导出前隐藏" opacity=".2">${(id === "grass" || role.shapeFrom) && ground ? `<image width="${width}" height="${width}" href="${ground}"/>` : ""}</g>
<g id="reference-art" inkscape:groupmode="layer" inkscape:label="当前图层参考_导出前隐藏" opacity=".45">${artwork}</g>
<g id="paint-${id}" inkscape:groupmode="layer" inkscape:label="在此绘制_${id}"></g>
<g id="cut-lines" inkscape:groupmode="layer" inkscape:label="切分线_导出前隐藏" fill="none" stroke="#c66752" stroke-width=".5">${grid}</g>
<g id="state-labels" inkscape:groupmode="layer" inkscape:label="编号_导出前隐藏" fill="#394c48" font-family="monospace" font-size="${Math.max(2, size / 7)}" text-anchor="middle">${labels}</g>
</svg>`;
  };
})(globalThis.DualGridLab);
