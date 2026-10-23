(function (Lab) {
  "use strict";
  Lab.bindSession = function (app) {
    const example = Lab.exampleId();
    const $ = app.$, key = `dual-grid-lab:state:v1:${location.pathname}${example ? `:example:${example}` : ""}`;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const sources = new Map(), identities = new WeakMap();
    const codec = Lab.sessionCodec(app, source => {
      if (!identities.has(source) || !sources.has(identities.get(source))) {
        const id = crypto.randomUUID();
        identities.set(source, id);
        sources.set(id, { source, stored: false });
      }
      return identities.get(source);
    });
    let database, ready = false, paused = false, busy = false, timer = 0, writing = null;
    let lastRaw = null, lastData = "", lastSaved = null;
    let exampleInitialized = false;
    function status(kind, label, detail) {
      $("session-indicator").dataset.state = kind;
      $("session-indicator").textContent = label;
      $("session-detail").textContent = detail;
    }
    function failed(error) {
      status("error", "未保存", `自动保存失败：${error.message}。请重试或导出状态文件备份。`);
    }
    function lock(value) {
      document.body.classList.toggle("session-loading", value);
      document.querySelector("header.masthead").inert = value;
      document.querySelector("main").inert = value;
    }
    function openDatabase() {
      if (database) return Promise.resolve(database);
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("dual-grid-lab-state-v1", 1);
        const timeout = setTimeout(() => reject(new Error("本地图片数据库连接超时")), 5000);
        request.onupgradeneeded = () => request.result.createObjectStore("sources");
        request.onerror = () => { clearTimeout(timeout); reject(request.error); };
        request.onblocked = () => { clearTimeout(timeout); reject(new Error("本地数据库被其他页面阻塞")); };
        request.onsuccess = () => {
          clearTimeout(timeout);
          database = request.result;
          database.onversionchange = () => { database.close(); database = null; };
          resolve(database);
        };
      });
    }
    async function storeAssets(data) {
      const pending = Object.keys(data.assets).filter(id => !sources.get(id)?.stored);
      if (!pending.length) return;
      const db = await openDatabase();
      // Capture immutable original pixels once; display tiles and thumbnail canvases are rebuilt.
      const records = pending.map(id => {
        const source = sources.get(id).source;
        return { id, width: source.width, height: source.height,
          pixels: source.getContext("2d").getImageData(0, 0, source.width, source.height).data };
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("sources", "readwrite"), store = transaction.objectStore("sources");
        records.forEach(({ id, ...record }) => store.put(record, id));
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("图片写入中断"));
      });
      pending.forEach(id => { if (sources.has(id)) sources.get(id).stored = true; });
    }
    async function loadAssets(data) {
      const db = await openDatabase(), canvases = new Map(), records = new Map();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("sources", "readonly"), store = transaction.objectStore("sources");
        Object.keys(data.assets).forEach(id => {
          const request = store.get(id);
          request.onsuccess = () => records.set(id, request.result);
        });
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("图片读取中断"));
      });
      for (const [id, dimensions] of Object.entries(data.assets)) {
        const record = records.get(id);
        if (!record && typeof dimensions.png === "string" && dimensions.png.startsWith("data:image/png;base64,")) {
          const image = new Image();
          image.src = dimensions.png;
          await image.decode();
          if (image.naturalWidth !== dimensions.width || image.naturalHeight !== dimensions.height)
            throw new Error("临时保存的图片尺寸不一致");
          const canvas = Lab.canvas(dimensions.width, dimensions.height);
          canvas.getContext("2d").drawImage(image, 0, 0);
          identities.set(canvas, id);
          sources.set(id, { source: canvas, stored: false });
          canvases.set(id, canvas);
          continue;
        }
        if (!record || record.width !== dimensions.width || record.height !== dimensions.height ||
            !(record.pixels instanceof Uint8ClampedArray) || record.pixels.length !== record.width * record.height * 4)
          throw new Error("保存的图片数据缺失或损坏");
        const canvas = Lab.canvas(record.width, record.height);
        canvas.getContext("2d").putImageData(new ImageData(record.pixels, record.width, record.height), 0, 0);
        identities.set(canvas, id);
        sources.set(id, { source: canvas, stored: true });
        canvases.set(id, canvas);
      }
      return canvases;
    }
    function commit(data, serialized) {
      if (localStorage.getItem(key) !== lastRaw) {
        paused = true;
        throw new Error("其他页面已更新本地状态；自动保存已暂停，当前页面内容保留");
      }
      const savedAt = new Date().toISOString(), raw = JSON.stringify({ savedAt, data, exampleInitialized });
      // Only point the synchronous checkpoint at images whose IndexedDB transaction completed.
      localStorage.setItem(key, raw);
      lastRaw = raw;
      lastData = serialized;
      lastSaved = savedAt;
      // Previous checkpoints keep their database images; release only unused in-memory canvases.
      for (const id of sources.keys()) if (!Object.hasOwn(data.assets, id)) sources.delete(id);
      status("saved", "已保存", `已于 ${new Date(savedAt).toLocaleTimeString("zh-CN")} 保存到当前浏览器。刷新后自动恢复。`);
    }
    function flush() {
      clearTimeout(timer);
      if (!ready || paused || busy) return Promise.resolve(false);
      try {
        const data = codec.capture(), serialized = JSON.stringify(data);
        const durable = Object.keys(data.assets).every(id => sources.get(id).stored);
        if (serialized === lastData && durable) {
          if (!writing && $("session-indicator").dataset.state === "pending")
            status("saved", "已保存", `已于 ${new Date(lastSaved).toLocaleTimeString("zh-CN")} 保存到当前浏览器。刷新后自动恢复。`);
          return writing || Promise.resolve(true);
        }
        if (durable) {
          commit(data, serialized);
          return Promise.resolve(true);
        }
        if (writing) return writing;
        status("pending", "保存中", "正在将新素材保存到当前浏览器…");
        writing = (async () => {
          let snapshot = data;
          for (;;) {
            await storeAssets(snapshot);
            if (paused || busy) return false;
            snapshot = codec.capture();
            if (Object.keys(snapshot.assets).some(id => !sources.get(id).stored)) continue;
            commit(snapshot, JSON.stringify(snapshot));
            return true;
          }
        })().catch(error => { failed(error); return false; }).finally(() => { writing = null; });
        return writing;
      } catch (error) {
        failed(error);
        return Promise.resolve(false);
      }
    }
    function queue() {
      if (!ready || paused || busy) return;
      if ($("session-indicator").dataset.state !== "error")
        status("pending", "待保存", "当前修改正在等待保存到本机…");
      clearTimeout(timer);
      timer = setTimeout(flush, 150);
    }
    app.session = { queue, flush };
    app.session.markExampleInitialized = () => { exampleInitialized = true; lastData = ""; };
    function guardUnload(event) {
      if (!ready || busy) { event.preventDefault(); event.returnValue = ""; return; }
      app.finishPaintStroke();
      // Existing images are already durable, so the final brush/control/view change can save synchronously.
      flush();
      try {
        const data = codec.capture(), serialized = JSON.stringify(data);
        if (serialized === lastData) return;
        if (!paused) {
          // A refresh can arrive before a new-image transaction finishes. Inline just those
          // PNGs in the synchronous checkpoint so ordinary immediate refreshes stay lossless.
          Object.keys(data.assets).filter(id => !sources.get(id).stored).forEach(id => {
            data.assets[id].png = sources.get(id).source.toDataURL("image/png");
          });
          commit(data, serialized);
          return;
        }
      } catch (_) { /* Keep the browser's unsaved-work prompt if capture fails. */ }
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", guardUnload);
    window.addEventListener("pagehide", () => { if (!busy) flush(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
    ["input", "change", "click", "keyup", "pointerup", "pointercancel", "wheel"].forEach(name =>
      document.addEventListener(name, queue, { passive: true }));
    document.addEventListener("scroll", queue, { capture: true, passive: true });
    $("source-panel").addEventListener("close", queue);
    document.querySelector(".slice-details").addEventListener("toggle", queue);
    window.addEventListener("storage", event => {
      if (event.key !== key || event.newValue === lastRaw) return;
      paused = true;
      status("error", "保存已暂停", "其他页面已更新本地状态。当前工作保留；请先导出备份，再刷新或手动保存。");
    });
    $("session-save").addEventListener("click", async () => {
      try {
        if (paused) {
          const current = localStorage.getItem(key);
          if (current !== null) localStorage.setItem(`${key}:recovery:${Date.now()}`, current);
          lastRaw = current;
          paused = false;
          lastData = "";
        }
        if (await flush()) app.notify("当前页面状态已保存到本机，刷新后自动恢复。");
      } catch (error) { failed(error); }
    });
    function exportState(prefix = "dual-grid-state") {
      const data = codec.capture();
      Object.keys(data.assets).forEach(id => {
        data.assets[id].png = sources.get(id).source.toDataURL("image/png");
      });
      const date = new Date().toISOString().replace(/[:.]/g, "-");
      Lab.download(new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() })],
        { type: "application/json" }), `${prefix}-${date}.json`);
    }
    $("session-export").addEventListener("click", () => {
      try {
        exportState();
        app.notify("已请求下载完整状态文件，包含素材、图层、试画、撤销历史与工作区设置。");
      } catch (error) { app.notify(`状态导出失败：${error.message}`); }
    });
    let importWorkflow = null;
    function chooseImport(workflow = null) {
      importWorkflow = workflow;
      $("session-file").click();
    }
    app.session.chooseLayeredCase = () => chooseImport("floor");
    $("session-import").addEventListener("click", () => chooseImport());
    $("session-file").addEventListener("cancel", () => importWorkflow = null);
    $("session-file").addEventListener("change", async () => {
      const file = $("session-file").files[0];
      const workflow = importWorkflow;
      importWorkflow = null;
      $("session-file").value = "";
      if (!file || busy) return;
      let backup = null;
      try {
        if (file.size > 192 * 1024 * 1024) throw new Error("状态文件超过192 MiB");
        const data = JSON.parse(await file.text());
        Lab.validateSession(data, $);
        if (workflow === "floor") {
          if (!data.floor.slots.terrain)
            throw new Error("此文件没有分层素材；单层备份请从「文件→载入备份」打开");
          if (!data.floor.active) data.selection = null;
          data.floor.active = true;
        }
        const decoded = [];
        for (const [id, asset] of Object.entries(data.assets)) {
          if (typeof asset.png !== "string" || !asset.png.startsWith("data:image/png;base64,"))
            throw new Error("状态文件必须内含PNG素材");
          const image = new Image();
          image.src = asset.png;
          await image.decode();
          if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height)
            throw new Error("状态图片尺寸与清单不一致");
          const source = Lab.canvas(asset.width, asset.height);
          source.getContext("2d").drawImage(image, 0, 0);
          decoded.push({ id, source });
        }
        // Validate and decode everything before replacing either the page or its saved checkpoint.
        busy = true;
        lock(true);
        app.finishPaintStroke();
        backup = codec.capture();
        exportState("dual-grid-before-load");
        const canvases = new Map();
        for (const { id: oldId, source } of decoded) {
          const id = crypto.randomUUID();
          identities.set(source, id);
          sources.set(id, { source, stored: false });
          canvases.set(oldId, source);
        }
        // Restore uses the original references; capture after restoring assigns fresh local image IDs.
        await codec.restore(data, canvases);
        const next = codec.capture();
        await storeAssets(next);
        const current = localStorage.getItem(key);
        if (current !== null) localStorage.setItem(`${key}:recovery:${Date.now()}`, current);
        lastRaw = current;
        paused = false;
        if (example) exampleInitialized = true;
        commit(next, JSON.stringify(next));
        app.notify("已载入状态文件并保存到本机；载入前的工作已请求下载为备份。");
      } catch (error) {
        if (backup) {
          const canvases = new Map(Object.keys(backup.assets).map(id => [id, sources.get(id).source]));
          await codec.restore(backup, canvases);
        }
        app.notify(`状态载入失败：${error.message}。原工作与保存记录保留。`);
      } finally {
        busy = false;
        lock(false);
      }
    });
    async function start() {
      lock(true);
      try {
        lastRaw = localStorage.getItem(key);
        if (lastRaw !== null) {
          const saved = JSON.parse(lastRaw);
          exampleInitialized = saved.exampleInitialized === true;
          const data = Lab.validateSession(saved.data, $);
          await codec.restore(data, await loadAssets(data));
          lastData = JSON.stringify(codec.capture());
          lastSaved = saved.savedAt;
          status("saved", "已恢复", `已恢复 ${new Date(lastSaved).toLocaleString("zh-CN")} 的本机状态；后续修改自动保存。`);
        }
      } catch (error) {
        paused = true;
        status("error", "恢复失败", `${error.message}。原记录保留，自动保存已暂停；可导出当前状态或载入备份。手动保存前会保留原记录副本。`);
      } finally {
        ready = true;
        lock(false);
      }
      if (!paused) flush();
      return { hasSavedState: lastRaw !== null, restored: !paused, exampleInitialized };
    }
    app.session.ready = Lab.sessionReady = start();
  };
})(globalThis.DualGridLab);
