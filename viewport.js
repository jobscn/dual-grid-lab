(function (Lab) {
  "use strict";
  const minimum = 1 / 1024, maximum = 32;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const editing = target => target instanceof Element && target.closest("input,select,textarea,button,[contenteditable=true]");
  Lab.bindViewport = function (canvas, options = {}) {
    const surface = canvas.parentElement, abort = new AbortController();
    const listen = (target, name, callback, extra = {}) =>
      target.addEventListener(name, callback, { ...extra, signal: abort.signal });
    let fit = true, native = false, zoom = 1, scale = 1, centerX = .5, centerY = .5;
    let drag = null, space = false, suppressClick = false;
    const tools = document.createElement("div");
    tools.className = "viewport-tools";
    tools.setAttribute("role", "toolbar");
    tools.setAttribute("aria-label", `${options.label || "画布"}视图控制`);
    tools.innerHTML = '<button class="viewport-out" aria-label="缩小画布" title="缩小">−</button><button class="viewport-scale" aria-label="回到画布基准1倍" title="1×：适应当前窗口的基准大小">100%</button><button class="viewport-in" aria-label="放大画布" title="放大">＋</button><button class="viewport-home" aria-label="画布回正" title="回正并适应画布">⌖</button>';
    surface.classList.add("viewport-host");
    surface.tabIndex = 0;
    surface.setAttribute("aria-label", options.label || "画布");
    surface.append(tools);
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    grid.classList.add("viewport-grid");
    grid.setAttribute("aria-hidden", "true");
    grid.setAttribute("preserveAspectRatio", "none");
    grid.innerHTML = '<path fill="none" stroke="#c66752" stroke-opacity=".7" stroke-width="1" vector-effect="non-scaling-stroke"/><path fill="none" stroke="#5088b7" stroke-opacity=".7" stroke-width="1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>';
    grid.setAttribute("hidden", "");
    surface.append(grid);
    const gridPaths = grid.querySelectorAll("path");
    let gridState = null;
    function setGrid(map, size, settings = {}) {
      gridState = map && (settings.grid || settings.dual) ? { size, settings } : null;
      updateGrid();
    }
    function updateGrid() {
      const visible = Boolean(gridState && canvas.labView && usable());
      grid.toggleAttribute("hidden", !visible);
      if (!visible) return;
      const { size, settings } = gridState, p = canvas.labView.projection;
      const width = surface.clientWidth, height = surface.clientHeight;
      const left = parseFloat(canvas.style.left), top = parseFloat(canvas.style.top);
      const sx = parseFloat(canvas.style.width) / canvas.width;
      const sy = parseFloat(canvas.style.height) / canvas.height;
      if (![left, top, sx, sy].every(Number.isFinite) || sx <= 0 || sy <= 0) return;
      // Invert the visible surface, including the empty space outside the image.
      const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) =>
        Lab.inversePoint((x - left) / sx, (y - top) / sy, p));
      const x0 = Math.floor(Math.min(...corners.map(point => point.x)) / size) - 1;
      const x1 = Math.ceil(Math.max(...corners.map(point => point.x)) / size) + 1;
      const y0 = Math.floor(Math.min(...corners.map(point => point.y)) / size) - 1;
      const y1 = Math.ceil(Math.max(...corners.map(point => point.y)) / size) + 1;
      const paths = [[], []];
      const line = (target, x1, y1, x2, y2) => {
        const a = Lab.projectPoint(x1 * size, y1 * size, p);
        const b = Lab.projectPoint(x2 * size, y2 * size, p);
        target.push(`M${left + a.x * sx} ${top + a.y * sy}L${left + b.x * sx} ${top + b.y * sy}`);
      };
      const determinant = Math.abs(p.a * p.d - p.b * p.c) * sx * sy;
      const spacing = size * determinant / Math.max(Math.hypot(p.a * sx, p.b * sy), Math.hypot(p.c * sx, p.d * sy));
      // Skip subpixel lines at extreme zoom-out, keeping the grid anchored to the same origin.
      const step = Math.max(1, 2 ** Math.ceil(Math.log2(2 / spacing)));
      for (const [index, enabled, offset] of [[0, settings.grid, 0], [1, settings.dual, .5]]) {
        if (!enabled) continue;
        for (let x = Math.ceil((x0 - offset) / step) * step + offset; x <= x1; x += step)
          line(paths[index], x, y0, x, y1);
        for (let y = Math.ceil((y0 - offset) / step) * step + offset; y <= y1; y += step)
          line(paths[index], x0, y, x1, y);
      }
      grid.style.width = `${width}px`;
      grid.style.height = `${height}px`;
      grid.setAttribute("viewBox", `0 0 ${width} ${height}`);
      paths.forEach((path, index) => gridPaths[index].setAttribute("d", path.join("")));
    }
    const out = tools.querySelector(".viewport-out"), inside = tools.querySelector(".viewport-in");
    const ratio = tools.querySelector(".viewport-scale"), home = tools.querySelector(".viewport-home");
    const dimensions = () => ({ width: canvas.width * (canvas.labNativeScale || 1),
      height: canvas.height * (canvas.labNativeScale || 1), w: surface.clientWidth, h: surface.clientHeight });
    const usable = () => canvas.width > 1 && canvas.height > 1 && surface.clientWidth > 0 && surface.clientHeight > 0;
    function baseline(d = dimensions()) {
      let value = Math.min((d.w - 16) / d.width, (d.h - 16) / d.height);
      if (value > 1 && canvas.classList.contains("pixelated")) value = Math.floor(value);
      return Math.max(minimum, value);
    }
    const relativeZoom = () => native ? 1 / baseline() : zoom;
    const limit = () => Math.max(maximum, maximum / baseline());
    function cursor() {
      surface.dataset.pan = String(api.wantsPan());
      surface.classList.toggle("is-panning", Boolean(drag && drag.moved));
    }
    function update() {
      if (!usable()) {
        grid.setAttribute("hidden", "");
        canvas.labSelection?.update();
        tools.querySelectorAll("button").forEach(button => button.disabled = true);
        ratio.textContent = "—";
        return;
      }
      const d = dimensions();
      if (fit) { zoom = 1; native = false; }
      zoom = clamp(zoom, minimum, limit());
      // Keep a resolution-independent view multiplier; only the CSS/native scale
      // changes when source resolution or viewport size changes.
      scale = native ? 1 : baseline(d) * zoom;
      const width = d.width * scale, height = d.height * scale;
      // Keep at least a small portion reachable; the reset control always stays outside the image.
      centerX = clamp(centerX, (24 - d.w / 2) / width, (d.w / 2 + width - 24) / width);
      centerY = clamp(centerY, (24 - d.h / 2) / height, (d.h / 2 + height - 24) / height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.left = `${d.w / 2 - centerX * width}px`;
      canvas.style.top = `${d.h / 2 - centerY * height}px`;
      updateGrid();
      canvas.labSelection?.update();
      const percent = zoom * 100;
      ratio.textContent = native ? "1:1" : `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
      ratio.title = `点击回到适应基准1×；当前原像素倍率 ${scale.toFixed(2)}×`;
      ratio.disabled = home.disabled = false;
      out.disabled = relativeZoom() <= minimum;
      inside.disabled = relativeZoom() >= limit();
      cursor();
    }
    function local() {
      document.getElementById("zoom").value = "local";
    }
    function finish() {
      if (!drag) return;
      const previous = drag;
      drag = null;
      if (previous.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id);
      cursor();
    }
    function zoomTo(value, point) {
      if (!usable()) return;
      finish();
      canvas.labSelection?.clearHover();
      options.onNavigate?.();
      const d = dimensions(), next = clamp(value, minimum, limit()), nextScale = baseline(d) * next;
      const x = (point ? point.x : d.w / 2) - d.w / 2;
      const y = (point ? point.y : d.h / 2) - d.h / 2;
      // Preserve the image coordinate under the cursor while changing CSS/native-pixel scale.
      centerX += x / (d.width * scale) - x / (d.width * nextScale);
      centerY += y / (d.height * scale) - y / (d.height * nextScale);
      zoom = next;
      fit = false;
      native = false;
      local();
      update();
    }
    function preset(value, markLocal = false) {
      finish();
      canvas.labSelection?.clearHover();
      options.onNavigate?.();
      fit = value === 0;
      native = value === "native";
      zoom = fit || native ? 1 : clamp(value, minimum, limit());
      centerX = centerY = .5;
      if (markLocal) local();
      update();
    }
    const api = canvas.labViewport = {
      get space() { return space; },
      wantsPan: () => options.canPan ? options.canPan(api) : true,
      update, preset, setGrid,
      reset: () => preset(0, true),
      copyFrom(other) {
        ({ fit, native, zoom, centerX, centerY } = other.snapshot());
        update();
      },
      snapshot: () => ({ fit, native, zoom, centerX, centerY }),
      restore(snapshot) {
        ({ fit, native, zoom, centerX, centerY } = snapshot);
        // Hidden canvases keep these coordinates until their first visible draw.
        if (usable()) update();
      },
      refreshCursor: cursor,
      dispose() {
        finish(); abort.abort(); tools.remove(); grid.remove();
        canvas.labSelection?.dispose();
        delete canvas.labViewport;
      }
    };
    listen(out, "click", () => zoomTo(relativeZoom() / 1.25));
    listen(inside, "click", () => zoomTo(relativeZoom() * 1.25));
    listen(ratio, "click", () => zoomTo(1));
    listen(home, "click", api.reset);
    listen(surface, "wheel", event => {
      if (!usable() || event.target.closest(".viewport-tools,.viewport-info")) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1);
      if (!delta) return;
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      zoomTo(relativeZoom() * Math.exp(clamp(-delta * .0015, -.7, .7)),
        { x: event.clientX - rect.left - surface.clientLeft, y: event.clientY - rect.top - surface.clientTop });
    }, { passive: false });
    listen(surface, "pointerdown", event => {
      if (event.target.closest(".viewport-tools,.viewport-info") || !usable() || drag || event.isPrimary === false ||
          (event.button !== 0 && event.button !== 1) || (event.button !== 1 && !api.wantsPan())) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.labSelection?.clearHover();
      options.onNavigate?.();
      surface.focus({ preventScroll: true });
      suppressClick = false;
      const target = event.target === canvas ? canvas : surface;
      drag = { id: event.pointerId, target, x: event.clientX, y: event.clientY,
        centerX, centerY, moved: false };
      target.setPointerCapture(event.pointerId);
      cursor();
    }, { capture: true });
    listen(surface, "pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      event.stopPropagation();
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y, d = dimensions();
      drag.moved ||= Math.hypot(dx, dy) >= 3;
      if (!drag.moved) return;
      fit = false;
      centerX = drag.centerX - dx / (d.width * scale);
      centerY = drag.centerY - dy / (d.height * scale);
      local();
      update();
    }, { capture: true });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => listen(surface, name, event => {
      if (!drag || event.pointerId !== drag.id) return;
      suppressClick = name === "pointerup" && drag.moved;
      event.stopPropagation();
      finish();
    }, { capture: true }));
    listen(surface, "click", event => {
      if (event.target.closest(".viewport-tools,.viewport-info") || !suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
    listen(surface, "auxclick", event => { if (event.button === 1) event.preventDefault(); });
    listen(surface, "keydown", event => {
      if (editing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        zoomTo(relativeZoom() * (event.key === "-" ? 1 / 1.25 : 1.25));
      } else if (event.key === "0" || event.key === "Home") {
        event.preventDefault();
        api.reset();
      }
    });
    listen(window, "keydown", event => {
      if (event.code !== "Space" || editing(event.target) || event.ctrlKey || event.metaKey || event.altKey ||
          (!surface.matches(":hover") && !surface.contains(document.activeElement))) return;
      event.preventDefault();
      if (!space) options.onNavigate?.();
      space = true;
      cursor();
    });
    listen(window, "keyup", event => { if (event.code === "Space") { space = false; cursor(); } });
    listen(window, "blur", () => { space = false; finish(); options.onNavigate?.(); cursor(); });
    const initial = document.getElementById("zoom").value;
    preset(initial === "native" ? initial : Number.isFinite(Number(initial)) ? Number(initial) : 0);
    return api;
  };
})(globalThis.DualGridLab);
