(function (Lab) {
  "use strict";
  Lab.bindPaint = function (app) {
    const $ = app.$, canvas = $("paint-canvas"), histories = new WeakMap();
    function history() {
      const map = app.paintMap();
      if (!histories.has(map)) histories.set(map, []);
      return histories.get(map);
    }
    let stroke = null, eraser = false, moveMode = false, selectMode = false;
    function finishStroke() {
      if (!stroke) return;
      const id = stroke.pointerId;
      Lab.endGridEdit(stroke.map);
      stroke = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    app.finishPaintStroke = finishStroke;
    app.syncPaintHistory = () => $("undo").disabled = history().length === 0;
    const viewport = Lab.bindViewport(canvas, { label: "自由试画", canPan: view => moveMode || selectMode || view.space,
      onNavigate: finishStroke, onViewChange: app.schedule });
    app.bindSelection(canvas, () => app.basePaint(), () => selectMode && app.sceneValid(), () => app.sceneValid());
    function setTool(tool) {
      finishStroke();
      moveMode = tool === "move";
      selectMode = tool === "select";
      $("paint-pan").setAttribute("aria-pressed", String(moveMode));
      $("paint-pan").textContent = moveMode ? "移动中" : "移动";
      $("paint-pick").setAttribute("aria-pressed", String(selectMode));
      $("paint-mode").setAttribute("aria-pressed", String(!moveMode && !selectMode));
      if (!selectMode) app.clearSelection(canvas);
      viewport.refreshCursor();
    }
    $("paint-pan").addEventListener("click", () => setTool(moveMode ? "draw" : "move"));
    $("paint-pick").addEventListener("click", () => setTool(selectMode ? "draw" : "select"));
    const remember = (delta = false) => {
      const entries = history();
      entries.push(delta ? Lab.beginGridEdit(app.paintMap()) : Lab.gridData(app.paintMap()));
      if (entries.length > 40) entries.shift();
      $("undo").disabled = false;
    };
    function drawLine(from, to, value, map) {
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
      const map = stroke.map;
      const hit = Lab.hitGrid(event, canvas);
      if (!hit.inside) { stroke.last = null; return; }
      const point = { x: hit.sampleX, y: hit.sampleY };
      drawLine(stroke.last || point, point, stroke.value, map);
      stroke.last = point;
      app.schedule();
    }
    canvas.addEventListener("pointerdown", event => {
      if (!app.state.valid || selectMode || stroke || viewport.wantsPan() || (event.button !== 0 && event.button !== 2)) return;
      app.basePaint();
      const map = app.paintMap();
      if (!Lab.hitGrid(event, canvas).inside) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      remember(true);
      stroke = { pointerId: event.pointerId, map, value: eraser || event.shiftKey || event.button === 2 ? 0 : 1 };
      canvas.setPointerCapture(event.pointerId);
      paint(event);
    });
    canvas.addEventListener("pointermove", event => {
      paint(event);
    });
    function end(event) {
      if (stroke && stroke.pointerId === event.pointerId) finishStroke();
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => canvas.addEventListener(name, end));
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    $("paint-mode").addEventListener("click", () => {
      if (!moveMode && !selectMode) eraser = !eraser;
      $("paint-mode").textContent = eraser ? "模式：擦除" : "模式：绘制";
      setTool("draw");
    });
    function undo() {
      const entries = history();
      if (!entries.length || stroke) return;
      Lab.undoGrid(app.paintMap(), entries.pop());
      $("undo").disabled = entries.length === 0;
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
      Lab.clearGrid(app.paintMap());
      app.schedule();
    });
    $("paint-export").addEventListener("click", () => app.exportMap(app.basePaint(), "dual-grid-freepaint.png"));
    app.paintState = {
      capture() {
        const maps = { single: app.state.paint, ...Lab.floorMaps(app.floor.paint, app.floor.roles) };
        return { eraser, tool: moveMode ? "move" : selectMode ? "select" : "draw",
          histories: Object.fromEntries(Object.entries(maps).map(([id, map]) =>
            [id, (histories.get(map) || []).slice()])) };
      },
      restore(snapshot) {
        eraser = snapshot.eraser;
        $("paint-mode").textContent = eraser ? "模式：擦除" : "模式：绘制";
        setTool(snapshot.tool);
        const maps = { single: app.state.paint, ...Lab.floorMaps(app.floor.paint, app.floor.roles) };
        Object.entries(maps).forEach(([id, map]) =>
          histories.set(map, (snapshot.histories[id] || []).slice()));
        app.syncPaintHistory();
      }
    };
  };
})(globalThis.DualGridLab);
