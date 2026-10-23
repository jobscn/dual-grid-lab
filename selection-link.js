(function (Lab) {
  "use strict";
  const inside = Lab.gridInside;
  const masks = (map, selection) => Lab.selectionTiles({ ...selection, kind: "logic" })
    .map(tile => inside(map, tile.x, tile.y) ? Lab.mask(map, tile.x, tile.y) : -1);
  Lab.selectionLinkPattern = function (context, selection) {
    return [Lab.get(context.shape, selection.x, selection.y), ...masks(context.shape, selection)];
  };
  Lab.matchSelectionLinks = function (app, source, target) {
    const from = Lab.selectionContext(app, source), to = Lab.selectionContext(app, target);
    const result = { kind: source.kind, matches: [], masks: [], orderedMasks: [] };
    if (from.role !== to.role || !inside(from.map, source.x, source.y, source.kind === "logic")) return result;
    const sourceMasks = source.kind === "logic" ? masks(from.shape, source) :
      [Lab.mask(from.shape, source.x, source.y)];
    result.orderedMasks = sourceMasks;
    result.masks = [...new Set(sourceMasks.filter(mask => mask >= 0))];
    // The atlas contains one tile per state, rather than every possible logical neighbourhood.
    if (to.template || source.kind === "render") {
      result.kind = "render";
      const region = Lab.mask(from.map, source.x, source.y);
      Lab.eachGridTile(to.shape, (x, y) => {
        if (result.masks.includes(Lab.mask(to.shape, x, y)) &&
            (to.template || from.template || !from.coverage || Lab.mask(to.map, x, y) === region))
          result.matches.push({ x, y });
      });
      return result;
    }
    const pattern = Lab.selectionLinkPattern(from, source);
    const coverage = from.coverage && !from.template ? Lab.selectionLinkPattern({ shape: from.map }, source) : null;
    Lab.eachGridTile(to.shape, (x, y) => {
      const candidate = { x, y };
      if (!Lab.selectionLinkPattern(to, candidate).every((value, index) => value === pattern[index])) return;
      if (coverage && !Lab.selectionLinkPattern({ shape: to.map }, candidate)
        .every((value, index) => value === coverage[index])) return;
      result.matches.push(candidate);
    }, null, true);
    return result;
  };
})(globalThis.DualGridLab);
