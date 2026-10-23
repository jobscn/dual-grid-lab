(function (Lab) {
  "use strict";
  Lab.exampleId = () => {
    const id = new URLSearchParams(location.search).get("example");
    return ["layers", "variants", "terraria-surface", "terraria-cave"].includes(id) ? id : null;
  };
  Lab.bindExamples = function (app) {
    const $ = app.$, dialog = $("examples-panel");
    document.querySelectorAll("[data-example]").forEach(link => {
      const url = new URL(location.href);
      url.searchParams.set("example", link.dataset.example);
      url.searchParams.set("workflow", "floor");
      url.hash = "";
      link.href = url.href;
    });
    function previews() {
      if (dialog.dataset.drawn) return;
      const size = 16, map = Lab.makeFloorSample(18, 10), slots = {};
      Lab.floorRoles.forEach(role => {
        const source = Lab.floorSource(role.id, size);
        const tiles = Lab.slice(source, Lab.infer(64, 64, "4x4", 0, 0, 0, 0), Lab.layouts.continuous);
        slots[role.id] = { tiles, flatTiles: tiles, enabled: true, valid: true };
      });
      Lab.renderFloor($("example-layers-preview"), map, slots,
        { roles: Lab.floorRoles, unitSize: size, view: "ortho", filter: "nearest" });
      const packs = Lab.variantExample().map(entry => {
        const tiles = Lab.slice(entry.source, Lab.infer(64, 64, "4x4", 0, 0, 0, 0), Lab.layouts.continuous);
        return { tiles, flatTiles: tiles };
      });
      Lab.renderMap($("example-variants-preview"), map, packs[0].tiles,
        { size, view: "ortho", filter: "nearest", variantPacks: packs, variantSeed: 42817 });
      dialog.dataset.drawn = "true";
    }
    $("examples-open").addEventListener("click", () => {
      document.querySelectorAll(".popover[open]").forEach(menu => menu.open = false);
      previews();
      dialog.showModal();
    });
    $("examples-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    $("example-import").addEventListener("click", () => {
      dialog.close();
      app.session.chooseLayeredCase();
    });
    // Local reference pages may add their own cards without bundling private assets in the app.
    Lab.addLocalExample = function ({ title, description, href }) {
      const url = new URL(href, location.href);
      if (!["file:", "http:", "https:"].includes(url.protocol)) return;
      url.searchParams.set("workflow", "floor");
      url.searchParams.delete("example");
      const card = document.createElement("article");
      card.className = "example-card local-example";
      const body = document.createElement("div"), tag = document.createElement("span");
      tag.className = "example-tag";
      tag.textContent = "本地参考 · 私有素材";
      const heading = document.createElement("h3"), text = document.createElement("p"), link = document.createElement("a");
      heading.textContent = title;
      text.textContent = description;
      link.className = "button";
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "打开素材案例 ↗";
      body.append(tag, heading, text, link);
      card.append(body);
      $("examples-list").prepend(card);
    };
    Lab.examplesReady = app.session.ready.then(async memory => {
      const id = Lab.exampleId();
      const layered = id || new URLSearchParams(location.search).get("workflow") === "floor";
      if (!layered || !memory.restored) return memory;
      if (id?.startsWith("terraria-")) {
        app.setFloorWorkflow(true);
        if (!memory.exampleInitialized) await Lab.loadTerrariaExample(app, id);
        return memory;
      }
      const newLayers = !app.floor.slots.terrain;
      // Case links declare their workflow even when an older checkpoint saved single mode.
      app.setFloorWorkflow(true);
      if (!id || memory.hasSavedState && !newLayers) return memory;
      $("grid").checked = false;
      app.floor.slots.wall.enabled = true;
      if (id === "variants") app.loadFloorVariants();
      app.rebuild();
      app.notify("已打开原创分层案例；此案例的工作状态单独保存。");
      return memory;
    });
    Lab.examplesReady.catch(error => app.notify(`案例初始化失败：${error.message}`));
    // Reference pages initialize through the same readiness barrier as restored examples.
    Lab.initializeLocalExample = async function (initialize) {
      const memory = await Lab.examplesReady;
      if (!memory.restored || Lab.exampleId()) return;
      app.setFloorWorkflow(true);
      if (!memory.hasSavedState) await initialize(app);
      app.syncFloorUi();
      app.rebuild();
      return memory;
    };
  };
})(globalThis.DualGridLab);
