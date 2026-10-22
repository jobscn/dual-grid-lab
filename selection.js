(function (Lab) {
  "use strict";
  Lab.sameSelection = (a, b) => Boolean(a && b && a.canvas === b.canvas && a.map === b.map &&
    a.layer === b.layer && a.kind === b.kind && a.x === b.x && a.y === b.y);
  // A logical sample contributes one bit to each adjacent render tile, not four owned tiles.
  Lab.selectionTiles = function (selection) {
    const { x, y, kind } = selection;
    const neighbours = kind === "logic" ?
      [[x - 1, y - 1, "SE", 1], [x, y - 1, "SW", 2], [x - 1, y, "NE", 4], [x, y, "NW", 8]] :
      [[x, y, null, 0]];
    return neighbours.map(([tx, ty, corner, bit]) => ({ x: tx, y: ty, corner, bit }));
  };
  Lab.bindSelectionOverlay = function (canvas, read) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("viewport-selection");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    canvas.parentElement.append(svg);
    function path(left, top, right, bottom) {
      const { size, projection } = canvas.labView;
      return [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y], index) => {
        const p = Lab.projectPoint(x * size, y * size, projection);
        return `${index ? "L" : "M"}${p.x} ${p.y}`;
      }).join("") + "Z";
    }
    function draw(selection, hover) {
      if (!selection || selection.canvas !== canvas) return "";
      const { x, y, kind } = selection;
      const element = (d, name) => `<path d="${d}" class="${name}" vector-effect="non-scaling-stroke"/>`;
      let content = "";
      if (kind === "logic") {
        Lab.selectionTiles(selection).forEach(tile => {
          content += element(path(tile.x, tile.y, tile.x + 1, tile.y + 1), "selection-related");
          content += element(path(Math.max(tile.x, x - .5), Math.max(tile.y, y - .5),
            Math.min(tile.x + 1, x + .5), Math.min(tile.y + 1, y + .5)), "selection-contribution");
        });
        content += element(path(x - .5, y - .5, x + .5, y + .5), "selection-primary");
      } else content = element(path(x, y, x + 1, y + 1), "selection-primary");
      return `<g class="${hover ? "hover-selection" : "locked-selection"}">${content}</g>`;
    }
    function drawLinks(links) {
      if (!links?.matches.length) return "";
      const tiles = new Map(), centers = [];
      for (const match of links.matches) {
        if (links.kind === "logic") {
          centers.push(path(match.x - .5, match.y - .5, match.x + .5, match.y + .5));
          Lab.selectionTiles({ ...match, kind: "logic" }).forEach(tile => {
            tiles.set(`${tile.x},${tile.y}`, tile);
          });
        } else tiles.set(`${match.x},${match.y}`, match);
      }
      const cells = [...tiles.values()].map(tile => path(tile.x, tile.y, tile.x + 1, tile.y + 1)).join("");
      return `<g class="linked-selection" data-match-count="${links.matches.length}" data-kind="${links.kind}">` +
        `<path d="${cells}" class="selection-linked-tile" vector-effect="non-scaling-stroke"/>` +
        (centers.length ? `<path d="${centers.join("")}" class="selection-linked-logic" vector-effect="non-scaling-stroke"/>` : "") + "</g>";
    }
    return {
      update() {
        const { selection, hover, links } = read();
        const surface = canvas.parentElement, width = surface.clientWidth, height = surface.clientHeight;
        const visible = width > 0 && height > 0 && canvas.width > 1 && canvas.height > 1 &&
          canvas.labView && (selection || hover || links?.matches.length);
        svg.toggleAttribute("hidden", !visible);
        if (!visible) { svg.replaceChildren(); return; }
        svg.style.width = `${width}px`;
        svg.style.height = `${height}px`;
        svg.style.left = svg.style.top = "0px";
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const sx = parseFloat(canvas.style.width) / canvas.width, sy = parseFloat(canvas.style.height) / canvas.height;
        const left = parseFloat(canvas.style.left), top = parseFloat(canvas.style.top);
        svg.innerHTML = `<g transform="matrix(${sx} 0 0 ${sy} ${left} ${top})">` +
          drawLinks(links) + draw(selection, false) +
          (Lab.sameSelection(selection, hover) ? "" : draw(hover, true)) + "</g>";
      },
      dispose() { svg.remove(); }
    };
  };
})(globalThis.DualGridLab);
