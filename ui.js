(function (Lab) {
  "use strict";
  Lab.bindUi = function (app) {
    const $ = app.$, dialog = $("source-panel");
    $("import-open").addEventListener("click", () => $("file").click());
    $("source-open").addEventListener("click", () => {
      dialog.showModal();
      document.querySelectorAll(".popover[open]").forEach(menu => menu.open = false);
    });
    $("source-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right ||
            event.clientY < box.top || event.clientY > box.bottom) dialog.close();
      }
    });
    const menus = Array.from(document.querySelectorAll(".popover"));
    menus.forEach(menu => menu.addEventListener("toggle", () => {
      if (menu.open) menus.filter(other => other !== menu).forEach(other => other.open = false);
    }));
    document.addEventListener("click", event => {
      menus.filter(menu => !menu.contains(event.target)).forEach(menu => menu.open = false);
    });
    document.addEventListener("keydown", event => {
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey &&
          !event.shiftKey && !dialog.open && !event.target.closest("input,select,textarea,[contenteditable]")) {
        const target = { g: "grid", l: "dual", p: "logic", n: "labels", w: "sea-preview", b: "background" }[event.key.toLowerCase()];
        if (target) { event.preventDefault(); $(target).click(); }
      }
      if (event.key !== "Escape") return;
      menus.filter(menu => menu.open).forEach(menu => {
        menu.open = false;
        menu.querySelector("summary").focus();
      });
    });
    document.querySelectorAll(".export-menu button").forEach(button =>
      button.addEventListener("click", () => button.closest("details").open = false));
    const observer = new ResizeObserver(app.schedule);
    document.querySelectorAll(".template-board,.paint-wrap").forEach(surface => observer.observe(surface));
  };
})(globalThis.DualGridLab);
