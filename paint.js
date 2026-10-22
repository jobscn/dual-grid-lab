(function (Lab) {
  "use strict";
  Lab.bindPaint = function (app) {
    const $ = app.$, canvas = $("paint-canvas"), map = app.state.paint;
    const history = [];
    let stroke = null, eraser = false, moveMode = false;
    function finishStroke() {
      if (!stroke) return;
      const id = stroke.pointerId;
      stroke = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    const viewport = Lab.bindViewport(canvas, { label: "自由试画", canPan: view => moveMode || view.space,
      onNavigate: finishStroke });
    function setMove(value) {
      finishStroke();
      moveMode = value;
      $("paint-pan").setAttribute("aria-pressed", String(moveMode));
      $("paint-pan").textContent = moveMode ? "移动中" : "移动";
      viewport.refreshCursor();
    }
    $("paint-pan").addEventListener("click", () => setMove(!moveMode));
    const remember = () => {
      history.push(map.cells.slice());
      if (history.length > 40) history.shift();
      $("undo").disabled = false;
    };
    function drawLine(from, to, value) {
      let x = from.x, y = from.y;
      const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y);
      const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
      let error = dx + dy;
      for (;;) {
        Lab.set(map, x, y, value);
        if (x === to.x && y === to.y) break;
        const e2 = 2 * error;
        if (e2 >= dy) { error += dy; x += sx; }
        if (e2 <= dx) { error += dx; y += sy; }
      }
    }
    function paint(event) {
      if (!stroke || stroke.pointerId !== event.pointerId || viewport.wantsPan()) return;
      const hit = Lab.hit(event, canvas, map);
      if (!hit.inside) { stroke.last = null; return; }
      const point = { x: hit.sampleX, y: hit.sampleY };
      drawLine(stroke.last || point, point, stroke.value);
      stroke.last = point;
      app.inspect(event, canvas, map);
      app.schedule();
    }
    canvas.addEventListener("pointerdown", event => {
      if (!app.state.valid || stroke || viewport.wantsPan() || (event.button !== 0 && event.button !== 2)) return;
      if (!Lab.hit(event, canvas, map).inside) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      remember();
      stroke = { pointerId: event.pointerId, value: eraser || event.shiftKey || event.button === 2 ? 0 : 1 };
      canvas.setPointerCapture(event.pointerId);
      paint(event);
    });
    canvas.addEventListener("pointermove", event => {
      app.inspect(event, canvas, map);
      paint(event);
    });
    function end(event) {
      if (stroke && stroke.pointerId === event.pointerId) stroke = null;
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => canvas.addEventListener(name, end));
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    $("paint-mode").addEventListener("click", () => {
      setMove(false);
      eraser = !eraser;
      $("paint-mode").textContent = eraser ? "模式：擦除" : "模式：绘制";
      $("paint-mode").setAttribute("aria-pressed", String(eraser));
    });
    function undo() {
      if (!history.length || stroke) return;
      map.cells.set(history.pop());
      $("undo").disabled = history.length === 0;
      app.schedule();
    }
    $("undo").disabled = true;
    $("undo").addEventListener("click", undo);
    canvas.parentElement.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    });
    $("clear").addEventListener("click", () => {
      finishStroke();
      remember();
      map.cells.fill(0);
      app.schedule();
    });
    $("paint-export").addEventListener("click", () => app.exportMap(map, "dual-grid-freepaint.png"));
  };
})(globalThis.DualGridLab);
