(function (Lab) {
  "use strict";
  const nw = "M0 .5A.5 .5 0 0 0 .5 0H0Z";
  const ne = "M.5 0A.5 .5 0 0 0 1 .5V0Z";
  const sw = "M.5 1A.5 .5 0 0 0 0 .5V1Z";
  const se = "M1 .5A.5 .5 0 0 0 .5 1H1Z";
  const square = "M0 0H1V1H0Z";
  const arcs = {
    nw: "M0 .5A.5 .5 0 0 0 .5 0", ne: "M.5 0A.5 .5 0 0 0 1 .5",
    sw: "M.5 1A.5 .5 0 0 0 0 .5", se: "M1 .5A.5 .5 0 0 0 .5 1"
  };
  Lab.contour = function (mask, connected = true) {
    const fills = ["", se, sw, "M0 .5H1V1H0Z", ne, "M.5 0H1V1H.5Z",
      ne + sw, square + nw, nw, nw + se, "M0 0H.5V1H0Z",
      square + ne, "M0 0H1V.5H0Z", square + sw, square + se, square];
    const lines = ["", arcs.se, arcs.sw, "M0 .5H1", arcs.ne, "M.5 0V1",
      arcs.ne + arcs.sw, arcs.nw, arcs.nw, arcs.nw + arcs.se, "M.5 0V1",
      arcs.ne, "M0 .5H1", arcs.sw, arcs.se, ""];
    if (connected && mask === 6) return { fill: square + nw + se, line: arcs.nw + arcs.se };
    if (connected && mask === 9) return { fill: square + ne + sw, line: arcs.ne + arcs.sw };
    return { fill: fills[mask], line: lines[mask] };
  };
  Lab.projection = function (width, height, size, view) {
    return view === "iso" ?
      { width: (width + height) * size, height: (width + height) * size / 2,
        a: 1, b: .5, c: -1, d: .5, e: height * size, f: 0 } :
      { width: width * size, height: height * size, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  };
  Lab.projectPoint = function (x, y, projection) {
    return { x: projection.a * x + projection.c * y + projection.e,
      y: projection.b * x + projection.d * y + projection.f };
  };
  Lab.inversePoint = function (x, y, projection) {
    const dx = x - projection.e, dy = y - projection.f;
    const determinant = projection.a * projection.d - projection.b * projection.c;
    return { x: (projection.d * dx - projection.c * dy) / determinant,
      y: (-projection.b * dx + projection.a * dy) / determinant };
  };
  Lab.applyProjection = function (ctx, projection) {
    ctx.setTransform(projection.a, projection.b, projection.c, projection.d, projection.e, projection.f);
  };
  Lab.continuousMap = function () {
    const map = Lab.map(4, 4, "连续16态绘制模板", "ARTIST SHEET", "");
    const samples = [[0, 1, 0, 0], [0, 1, 1, 1], [1, 1, 1, 0], [0, 0, 1, 0]];
    for (let y = 0; y <= 4; y++)
      for (let x = 0; x <= 4; x++) Lab.set(map, x, y, samples[y % 4][x % 4]);
    return map;
  };
})(globalThis.DualGridLab);
