(function (Lab) {
  "use strict";
  Lab.bindImport = function (app) {
    const $ = app.$, zone = $("drop-zone"), input = $("file");
    let loadRevision = 0;
    let layerPicker = null;
    app.cancelImport = () => ++loadRevision;
    async function load(files, append = false) {
      files = Array.from(files);
      if (!files.length) return;
      const revision = ++loadRevision;
      const kept = append ? app.state.sources.slice() : [];
      if (files.length + kept.length > 8 || files.some(file =>
        !["image/png", "image/webp", "image/jpeg"].includes(file.type) || file.size > 16 * 1024 * 1024) ||
        files.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024) {
        app.notify("最多8套变体；每张须为≤16 MiB的 PNG / WebP / JPEG，本批文件合计≤32 MiB。原图集保留。");
        return;
      }
      try {
        let pixels = app.otherLayerPixels() + kept.reduce((sum, entry) => sum + entry.source.width * entry.source.height, 0);
        const sources = kept;
        for (const file of files) {
          const url = URL.createObjectURL(file);
          try {
            const image = new Image();
            image.src = url;
            await image.decode();
            if (revision !== loadRevision) return;
            pixels += image.naturalWidth * image.naturalHeight;
            if (image.naturalWidth > 8192 || image.naturalHeight > 8192 || pixels > 16777216)
              throw new Error("最长边需≤8192 px，整组解码像素总量需≤16777216");
            const source = Lab.canvas(image.naturalWidth, image.naturalHeight);
            source.getContext("2d").drawImage(image, 0, 0);
            sources.push({ source, name: file.name });
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        if (revision !== loadRevision) return;
        if (sources.some(entry => entry.source.width !== sources[0].source.width ||
            entry.source.height !== sources[0].source.height))
          throw new Error("同组变体须尺寸一致；不同材质／尺寸请分组导入");
        // A multi-file batch is atomic; a single atlas can still enter the manual slicing workflow.
        if (sources.length > 1) sources.forEach(entry => app.inferSource(entry.source));
        app.validateLayerSources(sources);
        if (sources.length > 1) app.state.variantMode = "mixed";
        app.replaceSources(sources, { activeVariant: append ? sources.length - files.length : 0 });
        app.notify(`已导入${sources.length}套图集${sources.length > 1 ? "，右侧按位置稳定混用；左侧可逐套对照" : "并更新全部模板"}。${files.some(file => file.type === "image/jpeg") ?
          "JPEG可能存在压缩接缝，建议透明PNG。" : "请核对16态排版与跨变体接缝。"}`);
        input.dispatchEvent(new CustomEvent("lab-import-complete", { detail: { success: true } }));
      } catch (error) {
        if (revision === loadRevision) {
          app.notify(`无法导入：${error.message}。之前的图集保留。`);
          input.dispatchEvent(new CustomEvent("lab-import-complete", { detail: { success: false, message: error.message } }));
        }
      }
    }
    // Remember both the layer and its revision before opening the native file picker.
    app.chooseLayerImages = function (id, append) {
      if (!app.floor.active || !app.floor.slots[id]) return;
      app.switchFloorLayer(id);
      app.cancelImport();
      layerPicker = { id, revision: loadRevision, append: append && !app.state.floorGenerated };
      $("floor-files").value = "";
      $("floor-files").click();
    };
    app.importLayerFiles = function (id, files) {
      if (!app.floor.active || !app.floor.slots[id] || !files.length) return;
      app.switchFloorLayer(id);
      load(files, !app.state.floorGenerated);
    };
    $("floor-files").addEventListener("change", () => {
      const request = layerPicker, files = Array.from($("floor-files").files);
      layerPicker = null;
      $("floor-files").value = "";
      if (!request || !files.length) return;
      if (!app.floor.active || request.id !== app.floor.id || request.revision !== loadRevision) {
        app.notify("加图期间编辑目标已变化，本次选择未写入任何层；请在目标层重新加图。");
        return;
      }
      load(files, request.append);
    });
    $("floor-files").addEventListener("cancel", () => layerPicker = null);
    input.addEventListener("change", () => {
      load(input.files);
      input.value = "";
    });
    $("variant-add").addEventListener("click", () => $("variant-files").click());
    $("variant-files").addEventListener("change", () => {
      load($("variant-files").files, true);
      $("variant-files").value = "";
    });
    // Switching to the built-in example invalidates a pending asynchronous import too.
    $("variant-example").addEventListener("click", () => ++loadRevision);
    zone.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    ["dragenter", "dragover"].forEach(name => zone.addEventListener(name, event => {
      event.preventDefault();
      zone.classList.add("over");
    }));
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", event => {
      event.preventDefault();
      zone.classList.remove("over");
      load(event.dataTransfer.files);
    });
    window.addEventListener("dragover", event => event.preventDefault());
    window.addEventListener("drop", event => {
      event.preventDefault();
      if (zone.contains(event.target)) return;
      load(event.dataTransfer.files);
    });
  };
})(globalThis.DualGridLab);
