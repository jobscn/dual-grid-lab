(function (Lab) {
  "use strict";
  const cache = new Map();
  const corners = {
    nw: [0, 0, Math.PI / 2, 8], ne: [1, 0, Math.PI, 4],
    sw: [0, 1, 0, 2], se: [1, 1, -Math.PI / 2, 1]
  };
  const boundaries = ["", "se", "sw", "h", "ne", "v", "ne sw", "nw",
    "nw", "nw se", "v", "ne", "h", "sw", "se", ""];
  const point = p => `${Number(p.x.toFixed(6))} ${Number(p.y.toFixed(6))}`;
  const path = points => `M${points.map(point).join("L")}`;

  Lab.reliefDepth = value => Math.max(.06, Math.min(.28, Number(value) || .18));
  // Ribbons follow the existing coast inward. Shared endpoints/normals depend only
  // on the two edge samples, so thickness never needs a seventeenth tile/context.
  Lab.reliefBands = function (mask, connected = true, depth = .18) {
    depth = Math.round(Lab.reliefDepth(depth) * 100) / 100;
    const key = `${mask}/${connected}/${depth}`;
    if (cache.has(key)) return cache.get(key);
    let names = boundaries[mask];
    if (connected && mask === 6) names = "nw se";
    if (connected && mask === 9) names = "ne sw";
    const bands = names.split(" ").filter(Boolean).map(name => {
      const outer = [], inner = [], corner = corners[name], steps = corner ? 32 : 1;
      for (let i = 0; i <= steps; i++) {
        let x, y, nx, ny;
        if (corner) {
          const angle = corner[2] - i / steps * Math.PI / 2;
          const dx = Math.cos(angle), dy = Math.sin(angle), sign = mask & corner[3] ? 1 : -1;
          x = corner[0] + dx * .5; y = corner[1] + dy * .5;
          nx = dx * sign; ny = dy * sign;
        } else if (name === "h") {
          x = i; y = .5; nx = 0; ny = mask === 12 ? 1 : -1;
        } else {
          x = .5; y = i; nx = mask === 10 ? 1 : -1; ny = 0;
        }
        const width = .035 + (depth - .035) * Math.max(0, ny);
        outer.push({ x, y });
        inner.push({ x: x - nx * width, y: y - ny * width });
      }
      const middle = corner ? corner[2] - Math.PI / 4 : 0;
      const normalY = corner ? Math.sin(middle) * (mask & corner[3] ? 1 : -1) :
        name === "h" ? (mask === 12 ? 1 : -1) : 0;
      const kind = normalY > .001 ? "front" : normalY < -.001 ? "back" : "side";
      return { kind, fill: path(outer.concat(inner.slice().reverse())) + "Z",
        lip: path(inner), color: "#a98a68" };
    });
    cache.set(key, bands);
    return bands;
  };
  Lab.drawRelief = function (ctx, mask, options, fill) {
    ctx.save();
    ctx.clip(new Path2D(fill), "evenodd");
    const bands = Lab.reliefBands(mask, options.connected !== false, options.depth);
    for (const band of bands) {
      ctx.fillStyle = band.color;
      ctx.fill(new Path2D(band.fill));
    }
    ctx.strokeStyle = "#ead5ab";
    ctx.lineWidth = .022;
    ctx.lineCap = "butt";
    for (const band of bands) ctx.stroke(new Path2D(band.lip));
    ctx.restore();
  };
})(globalThis.DualGridLab);
