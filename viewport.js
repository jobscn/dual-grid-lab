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
    function setGrid(map, size, settings = {}) {
      const visible = Boolean(map && (settings.grid || settings.dual));
      grid.toggleAttribute("hidden", !visible);
      if (!visible) return;
      const p = canvas.labView.projection, paths = [[], []];
      const line = (target, x1, y1, x2, y2) => {
        const a = Lab.projectPoint(x1, y1, p), b = Lab.projectPoint(x2, y2, p);
        target.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
      };
      if (settings.grid) {
        for (let x = 0; x <= map.width; x++) line(paths[0], x * size, 0, x * size, map.height * size);
        for (let y = 0; y <= map.height; y++) line(paths[0], 0, y * size, map.width * size, y * size);
      }
      if (settings.dual) {
        for (let x = .5; x < map.width; x++) line(paths[1], x * size, 0, x * size, map.height * size);
        for (let y = .5; y < map.height; y++) line(paths[1], 0, y * size, map.width * size, y * size);
      }
      grid.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
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
      for (const key of ["width", "height", "left", "top"]) grid.style[key] = canvas.style[key];
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
      refreshCursor: cursor,
      dispose() { finish(); abort.abort(); tools.remove(); grid.remove(); delete canvas.labViewport; }
    };
    listen(out, "click", () => zoomTo(relativeZoom() / 1.25));
    listen(inside, "click", () => zoomTo(relativeZoom() * 1.25));
    listen(ratio, "click", () => zoomTo(1));
    listen(home, "click", api.reset);
    listen(surface, "wheel", event => {
      if (!usable() || event.target.closest(".viewport-tools")) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1);
      if (!delta) return;
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      zoomTo(relativeZoom() * Math.exp(clamp(-delta * .0015, -.7, .7)),
        { x: event.clientX - rect.left - surface.clientLeft, y: event.clientY - rect.top - surface.clientTop });
    }, { passive: false });
    listen(surface, "pointerdown", event => {
      if (event.target.closest(".viewport-tools") || !usable() || drag || event.isPrimary === false ||
          (event.button !== 0 && event.button !== 1) || (event.button !== 1 && !api.wantsPan())) return;
      event.preventDefault();
      event.stopPropagation();
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
      if (event.target.closest(".viewport-tools") || !suppressClick) return;
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
