(function (Lab) {
  "use strict";
  Lab.bindSelectionTools = function (app) {
    const $ = app.$, state = app.state, bindings = new Map();
    state.pickKind = "render";
    state.linkSelection = false;
    state.selection = state.hover = null;
    const layer = canvas => app.floor?.active ?
      (canvas.id !== "template-canvas" && app.floor.previewId || app.floor.id) : "single";
    function usable(selection, hover = false) {
      const binding = selection && bindings.get(selection.canvas);
      return Boolean(binding && selection.layer === layer(selection.canvas) && selection.map === binding.map() &&
        (hover ? binding.available() : binding.enabled()) &&
        selection.canvas.isConnected && !selection.canvas.closest("[hidden]"));
    }
    function refresh(details = true) {
      if (!usable(state.selection)) state.selection = null;
      if (!usable(state.hover, true)) state.hover = null;
      bindings.forEach((binding, canvas) => {
        if (details) {
          binding.links = null;
          if (state.linkSelection && state.selection && binding.available() &&
              !canvas.closest("[hidden]") && layer(canvas) === state.selection.layer) {
            const target = { canvas, map: binding.map(), layer: layer(canvas) };
            const links = Lab.matchSelectionLinks(app, state.selection, target);
            if (links.masks.length) binding.links = { ...links, source: state.selection };
          }
        }
        binding.update();
      });
    }
    app.refreshSelection = refresh;
    app.clearSelection = function (canvas) {
      if (!canvas || state.selection?.canvas === canvas) state.selection = null;
      if (!canvas || state.hover?.canvas === canvas) state.hover = null;
      refresh();
    };
    app.select = function (mask) {
      state.trackedMask = state.trackedMask === mask ? null : mask;
      $("unselect").hidden = state.trackedMask === null;
      $("mapping-info").textContent = state.trackedMask === null ? "点选切片追踪状态；画布选格可用右上角链条关联。" :
        `正在追踪状态 ${String(mask).padStart(2, "0")}（${Lab.stateLabel(mask)}）；橙色标记其全部使用位置。`;
      document.querySelectorAll(".tile-button").forEach(button =>
        button.classList.toggle("active", Number(button.dataset.state) === state.trackedMask));
      app.schedule();
    };
    function hit(event, canvas, map) {
      const point = Lab.hitGrid(event, canvas);
      if (!point.inside) return null;
      return { canvas, map, layer: layer(canvas), kind: state.pickKind,
        x: state.pickKind === "logic" ? point.sampleX : point.x,
        y: state.pickKind === "logic" ? point.sampleY : point.y };
    }
    app.bindSelection = function (canvas, map, enabled = () => state.valid, available = enabled) {
      const abort = new AbortController(), surface = canvas.parentElement;
      let clickPoint = null;
      const info = Lab.bindCanvasInfo(app, canvas);
      const local = () => ({
        selection: state.selection?.canvas === canvas && usable(state.selection) ? state.selection : null,
        hover: state.hover?.canvas === canvas && usable(state.hover, true) ? state.hover : null,
        links: binding.links
      });
      const overlay = Lab.bindSelectionOverlay(canvas, local);
      const binding = { map, enabled, available, links: null, update() {
        overlay.update();
        const { selection, hover, links } = local();
        info.update(selection, hover, links);
      } };
      bindings.set(canvas, binding);
      const clearHover = () => {
        if (state.hover?.canvas !== canvas) return;
        state.hover = null;
        refresh(false);
      };
      canvas.labSelection = {
        update: binding.update, clearHover,
        dispose() {
          abort.abort();
          bindings.delete(canvas);
          overlay.dispose();
          info.dispose();
          delete canvas.labSelection;
          app.clearSelection(canvas);
        }
      };
      surface.addEventListener("pointermove", event => {
        if (event.target.closest(".viewport-info")) return;
        if (event.target.closest(".viewport-tools")) { clearHover(); return; }
        if (!available() || event.buttons || canvas.labViewport.space) { clearHover(); return; }
        const next = hit(event, canvas, map());
        if (Lab.sameSelection(next, state.hover) || !next && !state.hover) return;
        state.hover = next;
        refresh(false);
      }, { signal: abort.signal });
      surface.addEventListener("pointerleave", clearHover, { signal: abort.signal });
      surface.addEventListener("pointerdown", () => { clickPoint = null; }, { capture: true, signal: abort.signal });
      surface.addEventListener("pointercancel", () => { clickPoint = null; }, { capture: true, signal: abort.signal });
      surface.addEventListener("pointerup", event => {
        // Click coordinates lose fractions; keep pointer precision for subpixel cells.
        clickPoint = { clientX: event.clientX, clientY: event.clientY };
      }, { capture: true, signal: abort.signal });
      surface.addEventListener("click", event => {
        const point = event.detail && clickPoint || event;
        clickPoint = null;
        if (event.button !== 0 || !enabled() || canvas.labViewport.space ||
            event.target.closest(".viewport-tools,.viewport-info")) return;
        const next = hit(point, canvas, map());
        if (!next) return;
        state.selection = Lab.sameSelection(next, state.selection) ? null : next;
        state.hover = null;
        refresh();
      }, { signal: abort.signal });
    };
    ["render", "logic"].forEach(kind => $(`pick-${kind}`).addEventListener("click", () => {
      if (state.pickKind === kind) return;
      app.finishPaintStroke?.();
      state.pickKind = kind;
      ["render", "logic"].forEach(value => $(`pick-${value}`).setAttribute("aria-pressed", String(value === kind)));
      app.clearSelection();
    }));
    $("link-selection").addEventListener("click", () => {
      state.linkSelection = !state.linkSelection;
      $("link-selection").setAttribute("aria-pressed", String(state.linkSelection));
      state.hover = null;
      refresh();
      app.session?.queue();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]") &&
          !event.target.closest("input,select,textarea,[contenteditable],.popover")) app.clearSelection();
    });
    app.selectionState = {
      capture() {
        const selection = state.selection;
        if (!selection) return null;
        return { canvas: Array.from(bindings.keys()).indexOf(selection.canvas), layer: selection.layer,
          kind: selection.kind, x: selection.x, y: selection.y };
      },
      restore(snapshot) {
        $("link-selection").setAttribute("aria-pressed", String(state.linkSelection));
        ["render", "logic"].forEach(kind =>
          $(`pick-${kind}`).setAttribute("aria-pressed", String(kind === state.pickKind)));
        if (snapshot) {
          const canvas = Array.from(bindings.keys())[snapshot.canvas], binding = bindings.get(canvas);
          if (binding) state.selection = { ...snapshot, canvas, map: binding.map() };
        }
        refresh();
      }
    };
  };
})(globalThis.DualGridLab);
