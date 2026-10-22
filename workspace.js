(function (Lab) {
  "use strict";
  Lab.bindWorkspace = function (app) {
    const $ = app.$, host = $("workbench"), modes = ["gallery", "paint"];
    let guideOpen = true, side = "gallery", previousSide = side;
    function apply() {
      host.dataset.guide = guideOpen ? "expanded" : "collapsed";
      host.dataset.side = side;
      $("guide-content").hidden = !guideOpen;
      $("guide-restore").hidden = guideOpen;
      $("guide-toggle").setAttribute("aria-expanded", String(guideOpen));
      $("side-content").hidden = side === "none";
      $("side-restore").hidden = side !== "none";
      $("side-toggle").setAttribute("aria-expanded", String(side !== "none"));
      $("side-restore").textContent = previousSide === "gallery" ? "‹ 拼接检查" : "‹ 自由试画";
      modes.forEach(mode => {
        const active = side === mode;
        $(`${mode}-panel`).hidden = !active;
        $(`${mode}-tab`).classList.toggle("active", active);
        $(`${mode}-tab`).setAttribute("aria-selected", String(active));
        $(`${mode}-tab`).tabIndex = active ? 0 : -1;
      });
      app.schedule();
    }
    function showSide(mode) {
      side = mode;
      previousSide = mode;
      apply();
    }
    $("guide-toggle").addEventListener("click", () => {
      guideOpen = false;
      // Never leave both work areas folded into empty rails.
      if (side === "none") side = previousSide;
      apply();
      $("guide-restore").focus({ preventScroll: true });
    });
    $("guide-restore").addEventListener("click", () => {
      guideOpen = true;
      apply();
      $("guide-toggle").focus({ preventScroll: true });
    });
    $("side-toggle").addEventListener("click", () => {
      side = "none";
      if (!guideOpen) guideOpen = true;
      apply();
      $("side-restore").focus({ preventScroll: true });
    });
    $("side-restore").addEventListener("click", () => {
      showSide(previousSide);
      $(`${side}-tab`).focus({ preventScroll: true });
    });
    modes.forEach(mode => $(`${mode}-tab`).addEventListener("click", () => showSide(mode)));
    document.querySelector(".tabs").addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const mode = event.key === "Home" ? modes[0] : event.key === "End" ? modes[1] :
        modes[(modes.indexOf(side) + 1) % modes.length];
      showSide(mode);
      $(`${mode}-tab`).focus();
    });
    apply();
  };
})(globalThis.DualGridLab);
