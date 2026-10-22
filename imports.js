(function (Lab) {
  "use strict";
  Lab.bindImport = function (app) {
    const $ = app.$, zone = $("drop-zone"), input = $("file");
    let loadRevision = 0;
    async function load(file) {
      if (!file) return;
      const revision = ++loadRevision;
      if (!["image/png", "image/webp", "image/jpeg"].includes(file.type) ||
          file.size > 16 * 1024 * 1024) {
        app.notify("请选择不超过 16 MiB 的 PNG / WebP / JPEG。之前的图集保留。");
        return;
      }
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (revision !== loadRevision) return;
        if (image.naturalWidth > 8192 || image.naturalHeight > 8192 ||
            image.naturalWidth * image.naturalHeight > 16777216)
          throw new Error("图像过大；最长边需 ≤8192 px、总像素 ≤16777216。");
        const source = Lab.canvas(image.naturalWidth, image.naturalHeight);
        source.getContext("2d").drawImage(image, 0, 0);
        app.state.source = source;
        app.state.fileName = file.name;
        app.state.isDemo = false;
        app.state.compareGuide = false;
        app.rebuild();
        app.notify(file.type === "image/jpeg" ?
          "已导入。JPEG 没有透明通道且可能存在压缩接缝，建议使用透明 PNG。" :
          "已导入并更新全部模板。若轮廓错位，请核对排版与四角示意。");
      } catch (error) {
        if (revision === loadRevision)
          app.notify(`无法读取此图：${error.message} 之前的图集保留。`);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    input.addEventListener("change", () => {
      load(input.files[0]);
      input.value = "";
    });
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
      if (event.dataTransfer.files.length !== 1) {
        app.notify("每次请导入一张完整的 16-tile 图集。");
        return;
      }
      load(event.dataTransfer.files[0]);
    });
    window.addEventListener("dragover", event => event.preventDefault());
    window.addEventListener("drop", event => {
      event.preventDefault();
      if (zone.contains(event.target)) return;
      if (event.dataTransfer.files.length !== 1) {
        app.notify("每次请导入一张完整的 16-tile 图集。");
        return;
      }
      load(event.dataTransfer.files[0]);
    });
  };
})(globalThis.DualGridLab);
