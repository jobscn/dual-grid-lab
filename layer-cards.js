(function (Lab) {
  "use strict";
  Lab.bindLayerCards = function (app) {
    const $ = app.$, floor = app.floor, cards = new Map(), collapsed = new Set();
    app.resetLayerCards = function () {
      finishDrag(false);
      cards.forEach(ui => ui.card.remove());
      cards.clear();
      collapsed.clear();
    };
    const hints = { grass: "透明覆盖 · 不含泥土", terrain: "地板轮廓与内部", wall: "独立占用 · 洞穴可选" };
    const host = $("floor-layer-cards"), motions = new Map();
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let drag = null, dragFrame = 0, suppressClick = false;
    function selectLayer(id) {
      const opened = collapsed.delete(id);
      app.switchFloorLayer(id);
      if (opened) {
        app.syncLayerCards();
        app.schedule();
      }
    }
    function setCollapsed(ids, value) {
      finishDrag(false);
      ids.forEach(id => cards.get(id)?.finishRename(true));
      ids.forEach(id => value ? collapsed.add(id) : collapsed.delete(id));
      app.syncLayerCards();
      app.schedule();
    }
    app.layerCardsState = {
      capture: () => floor.roles.filter(role => collapsed.has(role.id)).map(role => role.id),
      restore(ids) {
        collapsed.clear();
        ids.forEach(id => collapsed.add(id));
      }
    };
    $("floor-expand-all").addEventListener("click", () => setCollapsed(floor.roles.map(role => role.id), false));
    $("floor-collapse-all").addEventListener("click", () => setCollapsed(floor.roles.map(role => role.id), true));
    function updatePositions() {
      Array.from(host.children).forEach((card, index, ordered) => {
        const role = floor.roles.find(role => role.id === card.dataset.layer);
        card.querySelector(".floor-layer-position").textContent = String(ordered.length - index).padStart(2, "0");
        card.setAttribute("aria-label", `${role.name} · 从上到下第${index + 1}层`);
      });
      if (drag?.ghost) drag.ghost.querySelector(".floor-layer-position").textContent =
        drag.card.querySelector(".floor-layer-position").textContent;
    }
    function moveGhost() {
      const left = Math.max(4, Math.min(innerWidth - drag.width - 4, drag.x - drag.offsetX));
      drag.ghost.style.transform = `translate(${Math.round(left)}px, ${Math.round(drag.y - drag.offsetY)}px)`;
    }
    function updateDropTarget() {
      const bounds = host.getBoundingClientRect();
      if (drag.x < bounds.left - 32 || drag.x > bounds.right + 32) return;
      const candidates = Array.from(host.children).filter(card => card !== drag.card);
      // Layout offsets ignore the visual transforms used to animate neighboring cards.
      const target = candidates.find(card => {
        return drag.y < bounds.top + card.offsetTop - host.scrollTop + card.offsetHeight / 2;
      }) || null;
      if (drag.card.nextElementSibling === target) return;
      const previous = new Map(candidates.map(card => [card, card.getBoundingClientRect().top]));
      motions.forEach(motion => motion.cancel());
      motions.clear();
      host.insertBefore(drag.card, target);
      if (!reduceMotion.matches) candidates.forEach(card => {
        const delta = previous.get(card) - card.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        motions.set(card, card.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" }));
      });
      updatePositions();
    }
    function scrollWhileDragging() {
      if (!drag?.moved) return;
      const bounds = host.getBoundingClientRect();
      if (drag.x >= bounds.left - 32 && drag.x <= bounds.right + 32) {
        const edge = Math.min(36, bounds.height / 4);
        const speed = drag.y < bounds.top + edge ? -Math.min(12, (bounds.top + edge - drag.y) / 3) :
          drag.y > bounds.bottom - edge ? Math.min(12, (drag.y - bounds.bottom + edge) / 3) : 0;
        if (speed) {
          host.scrollTop += speed;
          updateDropTarget();
        }
      }
      dragFrame = requestAnimationFrame(scrollWhileDragging);
    }
    function finishDrag(commit) {
      if (!drag) return;
      const finished = drag, bounds = host.getBoundingClientRect();
      const next = finished.card.nextElementSibling, previous = finished.card.previousElementSibling;
      const changed = Array.from(host.children).some((card, index) => card !== finished.original[index]);
      drag = null;
      cancelAnimationFrame(dragFrame);
      motions.forEach(motion => motion.cancel());
      motions.clear();
      finished.ghost?.remove();
      finished.card.classList.remove("sorting");
      document.body.classList.remove("sorting-layers");
      if (host.hasPointerCapture(finished.pointerId)) host.releasePointerCapture(finished.pointerId);
      if (!finished.moved) {
        if (commit && finished.surface) selectLayer(finished.id);
        return;
      }
      suppressClick = true;
      if (commit && changed && finished.x >= bounds.left - 32 && finished.x <= bounds.right + 32 && (next || previous)) {
        app.reorderFloorLayer(finished.id, (next || previous).dataset.layer, Boolean(next));
        finished.handle.focus({ preventScroll: true });
        app.notify("已调整图层顺序，上方图层覆盖下方。");
      } else {
        app.syncLayerCards();
        finished.handle.focus({ preventScroll: true });
      }
    }
    host.addEventListener("pointermove", event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        const rect = drag.card.getBoundingClientRect(), compact = drag.card.cloneNode(true);
        compact.classList.remove("active");
        compact.classList.add("collapsed");
        compact.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
        compact.querySelector(".floor-image-strip").remove();
        compact.querySelector(".floor-card-footer").remove();
        drag.ghost = document.createElement("div");
        drag.ghost.className = "floor-sort-ghost";
        drag.ghost.setAttribute("aria-hidden", "true");
        drag.ghost.inert = true;
        drag.width = rect.width;
        drag.offsetX = drag.startX - rect.left;
        drag.ghost.style.width = `${rect.width}px`;
        drag.ghost.append(compact);
        document.body.append(drag.ghost);
        drag.offsetY = Math.min(drag.startY - rect.top, compact.offsetHeight / 2);
        drag.card.classList.add("sorting");
        document.body.classList.add("sorting-layers");
        dragFrame = requestAnimationFrame(scrollWhileDragging);
      }
      moveGhost();
      updateDropTarget();
    });
    host.addEventListener("pointerup", event => {
      if (drag?.pointerId === event.pointerId) finishDrag(true);
    });
    ["pointercancel", "lostpointercapture"].forEach(name => host.addEventListener(name, event => {
      if (drag?.pointerId === event.pointerId) finishDrag(false);
    }));
    host.addEventListener("click", event => {
      if (!suppressClick || !event.detail) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    window.addEventListener("blur", () => finishDrag(false));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        finishDrag(false);
      }
    });
    function selectVariant(id, index) {
      app.switchFloorLayer(id);
      app.selectVariant(index);
    }
    function createCard(role) {
      const card = document.createElement("article");
      card.className = "floor-card";
      card.dataset.layer = role.id;
      card.innerHTML = `<div class="floor-card-heading">
        <button class="floor-layer-handle" type="button" title="拖拽排序；也可用上下方向键调整" aria-keyshortcuts="ArrowUp ArrowDown Home End">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12"/></svg>
        </button>
        <button class="floor-layer-toggle" type="button" aria-expanded="true" aria-controls="floor-images-${role.id} floor-footer-${role.id}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></button>
        <div class="floor-layer-title">
          <button class="floor-layer-select" type="button" aria-pressed="false">
            <span class="floor-layer-position"></span><strong></strong>
            <svg class="floor-layer-rename" viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4 4 4M4 12l9-9 4 4-9 9-5 1z"/></svg>
            <span class="floor-edit-badge sr-only">编辑此层</span>
          </button>
          <input class="floor-layer-name-input" type="text" maxlength="48" aria-label="图层名称" hidden>
        </div>
        <div class="floor-layer-actions">
          <button class="floor-layer-preview" type="button" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="10" cy="10" r="2.5"/></svg></button>
          <button class="floor-layer-delete" type="button"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg></button>
        </div>
        <label class="floor-visibility"><input type="checkbox" id="floor-show-${role.id}"
          aria-label="显示图层"></label>
      </div>
      <div class="floor-card-meta"><span class="floor-layer-hint"></span><span class="floor-card-status"></span></div>
      <div class="floor-image-strip" id="floor-images-${role.id}" role="group" aria-label="本层16态图集">
        <div class="floor-thumbnails"></div>
        <button class="floor-image floor-add-image" type="button"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button>
      </div>
      <div class="floor-card-footer" id="floor-footer-${role.id}"><span class="floor-current-file"></span>
        <button class="floor-remove-image text-button" type="button">移除所选</button>
        <button class="floor-replace-images text-button" type="button">替换本层</button>
      </div>`;
      const find = selector => card.querySelector(selector);
      const select = find(".floor-layer-select"), add = find(".floor-add-image");
      const remove = find(".floor-remove-image"), replace = find(".floor-replace-images");
      const handle = find(".floor-layer-handle"), nameInput = find(".floor-layer-name-input");
      const toggle = find(".floor-layer-toggle");
      toggle.addEventListener("click", () => setCollapsed([role.id], !collapsed.has(role.id)));
      const visibility = find(".floor-visibility input");
      find(".floor-layer-preview").addEventListener("click", () =>
        app.setFloorPreview(floor.previewId === role.id ? null : role.id));
      find(".floor-layer-delete").hidden = !role.custom;
      find(".floor-layer-delete").addEventListener("click", () => app.removeFloorLayer(role.id));
      function finishRename(commit, focus = false) {
        if (nameInput.hidden) return;
        const name = nameInput.value.trim().slice(0, 48);
        nameInput.hidden = true;
        select.hidden = false;
        if (commit && name && name !== role.name) {
          role.name = name;
          app.syncFloorUi();
          app.schedule();
        }
        if (focus) select.focus({ preventScroll: true });
      }
      function startRename() {
        if (collapsed.has(role.id)) { selectLayer(role.id); return; }
        app.switchFloorLayer(role.id);
        nameInput.value = role.name;
        select.hidden = true;
        nameInput.hidden = false;
        nameInput.focus({ preventScroll: true });
        nameInput.select();
      }
      nameInput.addEventListener("blur", () => finishRename(true));
      nameInput.addEventListener("keydown", event => {
        if (event.isComposing || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        finishRename(event.key === "Enter", true);
      });
      select.addEventListener("keydown", event => {
        if (event.key !== "F2") return;
        event.preventDefault();
        startRename();
      });
      card.addEventListener("pointerdown", event => {
        suppressClick = false;
        if (event.button !== 0 || !event.isPrimary || drag) return;
        const control = event.target.closest("button,label,input");
        if (control && control !== handle) return;
        event.preventDefault();
        handle.focus({ preventScroll: true });
        drag = { id: role.id, card, handle, pointerId: event.pointerId,
          startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
          moved: false, surface: !control, original: Array.from(host.children) };
        // Capture on the stationary list so moving the card cannot lose the pointer.
        host.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("keydown", event => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          app.moveFloorLayer(role.id, event.key === "ArrowUp" ? 1 : -1);
        } else {
          const ordered = floor.roles.slice().sort((a, b) => b.order - a.order);
          const first = event.key === "Home";
          app.reorderFloorLayer(role.id, ordered[first ? 0 : ordered.length - 1].id, first);
        }
        handle.focus({ preventScroll: true });
        card.scrollIntoView({ block: "nearest" });
        app.notify("已调整图层顺序，上方图层覆盖下方。");
      });
      visibility.addEventListener("change", event => {
        floor.slots[role.id].enabled = event.target.checked;
        app.syncLayerCards();
        app.schedule();
      });
      select.addEventListener("click", event => {
        if (collapsed.has(role.id) || event.target.closest(".floor-layer-position")) selectLayer(role.id);
        else startRename();
      });
      card.addEventListener("click", event => {
        if (!event.target.closest("button,label,input")) selectLayer(role.id);
      });
      add.addEventListener("click", () => app.chooseLayerImages(role.id, true));
      replace.addEventListener("click", () => app.chooseLayerImages(role.id, false));
      remove.addEventListener("click", () => {
        app.switchFloorLayer(role.id);
        app.removeVariant();
      });
      // The card owns drops; do not let the page import into a different active layer.
      ["dragenter", "dragover"].forEach(name => card.addEventListener(name, event => {
        event.preventDefault();
        event.stopPropagation();
        card.classList.add("drag-over");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }));
      card.addEventListener("dragleave", event => {
        if (!card.contains(event.relatedTarget)) card.classList.remove("drag-over");
      });
      card.addEventListener("drop", event => {
        event.preventDefault();
        event.stopPropagation();
        card.classList.remove("drag-over");
        app.importLayerFiles(role.id, event.dataTransfer.files);
      });
      $("floor-layer-cards").append(card);
      cards.set(role.id, { card, select, add, remove, replace, handle, toggle, nameInput, finishRename, visibility, badge: find(".floor-edit-badge"),
        status: find(".floor-card-status"), file: find(".floor-current-file"),
        thumbnails: find(".floor-thumbnails"), sources: null, filter: null });
    }
    app.syncLayerCards = function () {
      if (drag) finishDrag(false);
      $("editor-layout").dataset.floor = String(floor.active);
      $("floor-layers").hidden = !floor.active;
      if (!floor.active) return;
      for (const [id, ui] of cards) {
        if (floor.slots[id]) continue;
        ui.card.remove();
        cards.delete(id);
        collapsed.delete(id);
      }
      const ordered = floor.roles.slice().sort((a, b) => b.order - a.order);
      ordered.forEach((role, index) => {
        if (!cards.has(role.id)) createCard(role);
        const slot = floor.slots[role.id], ui = cards.get(role.id), active = floor.id === role.id;
        // Reorder only when needed, preserving focus and in-place name editing.
        const host = $("floor-layer-cards");
        if (host.children[index] !== ui.card) host.insertBefore(ui.card, host.children[index] || null);
        ui.card.setAttribute("aria-label", `${role.name} · 从上到下第${index + 1}层`);
        ui.select.querySelector("strong").textContent = role.name;
        ui.select.querySelector(".floor-layer-position").textContent = String(ordered.length - index).padStart(2, "0");
        const folded = collapsed.has(role.id);
        ui.card.classList.toggle("collapsed", folded);
        ui.select.title = `${role.name} · ${folded ? "点击展开并选中" : "点击名称改名"}`;
        ui.select.setAttribute("aria-label", ui.select.title);
        ui.select.setAttribute("aria-expanded", String(!folded));
        ui.toggle.setAttribute("aria-expanded", String(!folded));
        ui.toggle.title = `${folded ? "展开" : "收起"}${role.name}`;
        ui.toggle.setAttribute("aria-label", ui.toggle.title);
        ui.handle.setAttribute("aria-label", `拖拽调整${role.name}顺序，也可用上下方向键`);
        ui.nameInput.setAttribute("aria-label", `${role.name}的图层名称`);
        ui.card.querySelector(".floor-layer-hint").textContent = hints[role.id] ||
          (role.shapeFrom ? `${floor.roles.find(item => item.id === role.shapeFrom).name}点缀 · 独立覆盖区` : "独立占用");
        ui.visibility.checked = slot.enabled;
        ui.visibility.setAttribute("aria-label", `显示${role.name}`);
        ui.visibility.parentElement.title = `${role.name}：${slot.enabled ? "已显示，点击隐藏" : "已隐藏，点击显示"}`;
        const deleteLayer = ui.card.querySelector(".floor-layer-delete");
        deleteLayer.title = `移除${role.name}`;
        deleteLayer.setAttribute("aria-label", deleteLayer.title);
        const sources = slot.sources.length ? slot.sources : [{ source: slot.source, name: slot.fileName }];
        ui.card.classList.toggle("active", active);
        const preview = ui.card.querySelector(".floor-layer-preview"), pinned = floor.previewId === role.id;
        ui.card.classList.toggle("preview-pinned", pinned);
        preview.setAttribute("aria-pressed", String(pinned));
        preview.setAttribute("aria-label", `${pinned ? "取消固定预览" : "固定预览"}${role.name}`);
        preview.title = pinned ? "再次点击恢复合成预览" : "只预览此层；切换编辑层仍保持固定";
        ui.card.classList.toggle("muted", !slot.enabled);
        ui.card.classList.toggle("invalid", !slot.valid);
        ui.select.setAttribute("aria-pressed", String(active));
        ui.badge.textContent = active ? "正在编辑" : "编辑此层";
        ui.status.textContent = !slot.valid ? "切分待修正" : slot.floorGenerated ?
          (role.custom ? "透明空白 · 待加图" : "原创底稿") : `${sources.length} 图集 · ${floor.unitSize}px`;
        const current = sources[slot.activeVariant];
        ui.file.textContent = slot.floorGenerated ? (role.custom ? "透明空白 · 添加图集后试画" : "底稿参考 · 首次加图替换底稿") : current.name;
        ui.file.title = current.name;
        ui.add.disabled = !slot.floorGenerated && sources.length >= 8;
        ui.add.setAttribute("aria-label", `给${role.name}加图`);
        ui.add.title = ui.add.disabled ? "本层已满8套变体，可先移除所选或替换本层" : slot.floorGenerated ?
          "选择完整16态图集，替换本层教学底稿；可多选" : "追加同尺寸、同排版的16态变体，不覆盖已有图片";
        ui.replace.title = `替换${role.name}的全部图集，其他层保留`;
        ui.remove.hidden = sources.length < 2;
        ui.remove.title = `移除${role.name}当前选中的图集：${current.name}`;
        const filter = $("filter").value;
        if (ui.sources !== slot.sources || (!slot.sources.length && ui.source !== slot.source) ||
            ui.filter !== filter || ui.name !== role.name) {
          const buttons = sources.map((entry, index) => {
            const button = document.createElement("button"), canvas = Lab.canvas(48, 48);
            button.type = "button";
            button.className = "floor-image";
            button.title = entry.name;
            button.setAttribute("aria-label", `${role.name} · 变体${index + 1} · ${entry.name}`);
            const ctx = canvas.getContext("2d"), scale = 48 / Math.max(entry.source.width, entry.source.height);
            const width = entry.source.width * scale, height = entry.source.height * scale;
            ctx.imageSmoothingEnabled = filter !== "nearest";
            ctx.drawImage(entry.source, (48 - width) / 2, (48 - height) / 2, width, height);
            Lab.setFilter(canvas, filter);
            const caption = document.createElement("span");
            caption.textContent = `V${index + 1}`;
            button.append(canvas, caption);
            button.addEventListener("click", () => selectVariant(role.id, index));
            return button;
          });
          ui.thumbnails.replaceChildren(...buttons);
          ui.sources = slot.sources;
          ui.source = slot.source;
          ui.filter = filter;
          ui.name = role.name;
        }
        Array.from(ui.thumbnails.children).forEach((button, index) => {
          button.setAttribute("aria-pressed", String(index === slot.activeVariant));
        });
      });
      $("floor-expand-all").disabled = ordered.every(role => !collapsed.has(role.id));
      $("floor-collapse-all").disabled = ordered.every(role => collapsed.has(role.id));
      $("floor-layer-count").textContent = `${ordered.length} 层 · 上方覆盖下方`;
    };
    $("floor-add-layer").addEventListener("click", () => {
      app.addFloorLayer($("floor-layer-name").value, $("floor-layer-kind").value);
      $("floor-layer-name").value = "";
      $("floor-add-menu").open = false;
      cards.get(floor.id)?.select.focus({ preventScroll: true });
      cards.get(floor.id)?.card.scrollIntoView({ block: "nearest" });
    });
  };
})(globalThis.DualGridLab);
