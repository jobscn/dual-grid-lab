(function (Lab) {
  "use strict";
  const pinIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7Zm4 13v6"/></svg>';
  Lab.bindPreview = function (app) {
    const $ = app.$, state = app.state, host = $("gallery"), panes = [];
    let sequence = 0;
    const observer = new ResizeObserver(app.schedule);
    const selected = pane => pane.cases[pane.index];
    function update(pane, resetView = false) {
      const map = selected(pane), prefix = pane.pinned ? `钉住栏 ${pane.id}` : "浏览栏";
      pane.canvas.map = map;
      pane.card.querySelector("h2").textContent = map.title;
      pane.card.querySelector(".pane-kind").textContent = pane.pinned ? "PINNED" : "BROWSE";
      pane.card.querySelector(".case-index").textContent = `${String(pane.index + 1).padStart(2, "0")} / ${String(pane.cases.length).padStart(2, "0")}`;
      pane.card.querySelector(".case-targets").textContent = map.description;
      pane.card.querySelector(".case-seed").textContent = `${map.width}×${map.height} · ${pane.seed}`;
      pane.canvas.setAttribute("aria-label", `${prefix}：${map.title}`);
      pane.card.setAttribute("aria-label", `${prefix}：${map.title}`);
      pane.card.querySelectorAll(".page-dot").forEach((dot, index) => {
        dot.classList.toggle("active", index === pane.index);
        if (index === pane.index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      if (resetView) pane.canvas.labViewport.reset();
      app.schedule();
    }
    function move(pane, offset) {
      pane.index = (pane.index + offset + pane.cases.length) % pane.cases.length;
      update(pane, true);
    }
    function sync() {
      const count = panes.length - 1;
      $("pin-count").textContent = `${count} / 4`;
      panes[0].card.querySelector(".pin-case").disabled = count >= 4;
      panes[0].card.querySelector(".pin-case").title = count >= 4 ? "已钉住 4 个；先取消一个" : "钉住当前模板并继续浏览";
      panes[0].coverage = Lab.coverage(panes[0].cases).filter(Boolean).length;
      $("coverage-count").textContent = `${panes[0].coverage}/16`;
      $("coverage-count").title = "当前浏览组的四角状态覆盖，不是正确性评分";
      host.dataset.panes = panes.length;
    }
    function pin(pane) {
      if (pane.pinned) {
        observer.unobserve(pane.canvas.parentElement);
        pane.canvas.labViewport.dispose();
        panes.splice(panes.indexOf(pane), 1);
        pane.card.remove();
        sync();
        panes[0].card.querySelector(".pin-case").focus({ preventScroll: true });
        app.notify(`已取消钉住；${panes.length - 1}/4。`);
        app.schedule();
        return;
      }
      if (panes.length >= 5) return;
      const copy = add(pane.seed, pane.cases, pane.index, true);
      copy.canvas.labViewport.copyFrom(pane.canvas.labViewport);
      move(pane, 1);
      sync();
      copy.card.scrollIntoView({ block: "nearest", inline: "nearest" });
      app.notify(`已钉住「${selected(copy).title}」；${panes.length - 1}/4。`);
    }
    function add(seed, cases, index, pinned) {
      const pane = { id: ++sequence, seed, cases, index, pinned };
      const card = pane.card = document.createElement("article");
      card.className = `check-pane${pinned ? " pinned" : ""}`;
      card.innerHTML = '<header class="pane-head"><div><span class="pane-kind"></span><h2></h2></div><span class="case-index"></span><button class="pin-case icon-button"></button></header><div class="check-surface preview-surface"></div><div class="case-targets"></div><div class="case-navigation"><button class="previous-case icon-button" title="上一张" aria-label="上一张检查模板">←</button><div class="case-pagination" role="group" aria-label="检查模板页码"></div><button class="next-case"><span>下一张</span><b aria-hidden="true">→</b></button></div><footer class="pane-footer"><span class="case-seed"></span><button class="text-button export-case">导出 PNG ↗</button></footer>';
      const pinButton = card.querySelector(".pin-case");
      pinButton.innerHTML = pinIcon;
      pinButton.setAttribute("aria-label", pinned ? "取消钉住此栏" : "钉住当前模板");
      pinButton.setAttribute("aria-pressed", String(pinned));
      pinButton.title = pinned ? "取消钉住此栏" : "钉住当前模板并继续浏览";
      pinButton.addEventListener("click", () => pin(pane));
      const canvas = pane.canvas = Lab.canvas(1, 1);
      card.querySelector(".check-surface").append(canvas);
      Lab.bindViewport(canvas, { label: pinned ? "钉住检查图" : "拼接检查" });
      canvas.addEventListener("pointermove", event => app.inspect(event, canvas, selected(pane)));
      canvas.addEventListener("click", event => {
        if (!state.valid) return;
        const hit = Lab.hit(event, canvas, selected(pane));
        if (hit.inside) app.select(Lab.mask(selected(pane), hit.x, hit.y));
      });
      cases.forEach((map, index) => {
        const dot = document.createElement("button");
        dot.className = "page-dot";
        dot.innerHTML = "<span></span>";
        dot.title = `${index + 1} · ${map.title}`;
        dot.setAttribute("aria-label", `第 ${index + 1} 张：${map.title}`);
        dot.addEventListener("click", () => { pane.index = index; update(pane, true); });
        card.querySelector(".case-pagination").append(dot);
      });
      card.querySelector(".previous-case").addEventListener("click", () => move(pane, -1));
      card.querySelector(".next-case").addEventListener("click", () => move(pane, 1));
      card.querySelector(".case-navigation").addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        move(pane, event.key === "ArrowRight" ? 1 : -1);
      });
      card.querySelector(".export-case").addEventListener("click", () =>
        app.exportMap(selected(pane), `dual-grid-check-${pane.seed}-${pane.index + 1}.png`));
      panes.push(pane);
      host.append(card);
      observer.observe(canvas.parentElement);
      update(pane);
      return pane;
    }
    function regenerate() {
      const raw = $("seed").value, input = Number(raw);
      if (!raw.trim() || !Number.isInteger(input) || input < 0 || input > 4294967295) {
        app.notify("种子须为 0–4294967295 的整数。");
        return;
      }
      const pane = panes[0], seed = input === pane.seed ? (input + 1) >>> 0 : input;
      $("seed").value = seed;
      pane.seed = seed;
      pane.cases = Lab.makeChecks(seed);
      update(pane, true);
      sync();
      app.notify(`浏览组已更新：${seed}。钉住栏保持原来的组。`);
    }
    app.drawPreview = function () {
      const hidden = $("gallery-panel").hidden;
      $("coverage-count").textContent = state.valid ? `${panes[0].coverage}/16` : "—/16";
      panes.forEach(pane => {
        pane.card.querySelector(".export-case").disabled = !state.valid;
        if (!state.valid) {
          pane.canvas.width = pane.canvas.height = 1;
          pane.canvas.style.width = pane.canvas.style.height = "1px";
          pane.canvas.labViewport.update();
          pane.card.classList.add("invalid");
          return;
        }
        pane.card.classList.remove("invalid");
        if (hidden) return;
        Lab.renderMap(pane.canvas, selected(pane), state.flatTiles, app.options());
        Lab.sizePreview(pane.canvas, Number($("zoom").value));
      });
    };
    $("regenerate").addEventListener("click", regenerate);
    $("seed").addEventListener("keydown", event => { if (event.key === "Enter") regenerate(); });
    add(state.seed, Lab.makeChecks(state.seed), 0, false);
    sync();
  };
})(globalThis.DualGridLab);
