(function (Lab) {
  "use strict";
  const commit = "c7663b9bc83b9f6dbacd240573c2b4b09f568da0";
  const base = `https://raw.githubusercontent.com/SandboxWorldOnline/Open-Terraria/${commit}/public/sprites/vanilla/`;
  const sources = {
    dirt: ["Tiles_0.png", 288, 270, "73b5dcacf4e1621ca61ce6a46c86d50dce2818c48366fde898d498b9437c11a2"],
    stone: ["Tiles_1.png", 288, 270, "8c6cd50a8b9d70f08d0aa08cfbd862c714b2874cb5c60a7caa9ddea4d55307d9"],
    grass: ["Tiles_2.png", 288, 1980, "b741ac1e4c67812ae338385713f197a018030b4a8690eb751795a29bdcdfdc68"],
    dirtWall: ["Wall_2.png", 468, 180, "b667ec7a8768cda7965f8b1edea12e72515dd8b1a117ecea2b1fe494f5dd9951"],
    stoneWall: ["Wall_1.png", 468, 180, "1bdabe1003efbd19cffe87e74347bde75d49799710ebdd4e9886d7fbdae3d464"]
  };
  async function download(key) {
    const [name, width, height, expected] = sources[key];
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    let url;
    try {
      const response = await fetch(base + name, { signal: controller.signal });
      if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 4 * 1024 * 1024) throw new Error(`${name} 文件过大`);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        value => value.toString(16).padStart(2, "0")).join("");
      if (hash !== expected) throw new Error(`${name} 与固定来源版本不一致`);
      const image = new Image();
      url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      image.src = url;
      await image.decode();
      if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error(`${name} 尺寸不符`);
      const canvas = Lab.canvas(width, height);
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas;
    } finally {
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    }
  }
  const bits = [[8, 4], [2, 1]];
  function frame(qx, qy, horizontal, vertical, diagonal, variant) {
    if (horizontal && vertical) return diagonal ? [1 + variant, 1, true] : [6 + variant, qy === 0 ? 1 : 2, false];
    if (horizontal) return [1 + variant, qy === 0 ? 0 : 2, false];
    if (vertical) return [qx === 0 ? 0 : 4, variant, false];
    return [qx + variant * 2, 3 + qy, false];
  }
  function quarters(source, variant, fill) {
    return Array.from({ length: 16 }, (_, mask) => {
      const tile = Lab.canvas(16, 16), ctx = tile.getContext("2d");
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        if (!(mask & bits[y][x])) continue;
        const qx = 1 - x, qy = 1 - y;
        const [col, row, center] = frame(qx, qy, mask & bits[y][1 - x], mask & bits[1 - y][x],
          mask & bits[1 - y][1 - x], variant);
        ctx.drawImage(center && fill ? fill : source, col * 18 + qx * 8, row * 18 + qy * 8, 8, 8, x * 8, y * 8, 8, 8);
      }
      return tile;
    });
  }
  function terrainVariants(source, name, fill) {
    const canonical = quarters(source, 0, fill);
    return [0, 1, 2].map(variant => {
      const tiles = quarters(source, variant, fill).map((tile, mask) => {
        const ctx = tile.getContext("2d");
        const top = (mask & 8 ? 10 : 0) | (mask & 4 ? 5 : 0);
        const bottom = (mask & 2 ? 10 : 0) | (mask & 1 ? 5 : 0);
        const left = (mask & 8 ? 12 : 0) | (mask & 2 ? 3 : 0);
        const right = (mask & 4 ? 12 : 0) | (mask & 1 ? 3 : 0);
        // Replace complete strips, including transparent pixels, to keep variant edges consistent.
        for (const [prototype, x, y, w, h] of [[top, 0, 0, 16, 2], [bottom, 0, 14, 16, 2],
          [left, 0, 0, 2, 16], [right, 14, 0, 2, 16]]) {
          ctx.clearRect(x, y, w, h);
          ctx.drawImage(canonical[prototype], x, y, w, h, x, y, w, h);
        }
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
          ctx.clearRect(x * 14, y * 14, 2, 2);
          if (mask & bits[y][x]) ctx.drawImage(canonical[15], x * 14, y * 14, 2, 2, x * 14, y * 14, 2, 2);
        }
        if (fill) {
          const image = ctx.getImageData(0, 0, 16, 16), pixels = image.data;
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const at = (y * 16 + x) * 4, boundary = Lab.floorBoundary(mask, (x + .5) / 16, (y + .5) / 16);
            if (mask === 0 || mask === 15 || !pixels[at + 3] ||
                pixels[at + 1] <= Math.max(pixels[at], pixels[at + 2]) + 16 ||
                boundary.normalY >= -.3 || boundary.distance * 16 >= 4) pixels.fill(0, at, at + 4);
          }
          ctx.putImageData(image, 0, 0);
        }
        return tile;
      });
      return { name: `${name}-v${variant + 1}.png`, source: Lab.packCanvas(tiles) };
    });
  }
  function wallSource(source, name) {
    const canvas = Lab.floorSource("wall", 16), ctx = canvas.getContext("2d");
    const image = ctx.getImageData(0, 0, 64, 64);
    const texture = source.getContext("2d").getImageData(44, 44, 16, 16).data;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const at = (y * 64 + x) * 4;
      if (image.data[at + 3]) image.data.set(texture.subarray(((y % 16) * 16 + x % 16) * 4,
        ((y % 16) * 16 + x % 16) * 4 + 4), at);
    }
    ctx.putImageData(image, 0, 0);
    return [{ name: `${name}.png`, source: canvas }];
  }
  Lab.loadTerrariaExample = async function (app, id) {
    const $ = app.$, cave = id === "terraria-cave", main = document.querySelector("main");
    const header = document.querySelector(".masthead");
    document.body.classList.add("example-loading");
    header.inert = main.inert = true;
    try {
      const keys = ["dirt", "grass", cave ? "stoneWall" : "dirtWall", ...(cave ? ["stone"] : [])];
      const decoded = await Promise.all(keys.map(async key => [key, await download(key)]));
      const images = Object.fromEntries(decoded);
      // Download, verify and prepare every image before changing any workspace layer.
      const packs = { terrain: terrainVariants(images.dirt, "dirt"),
        grass: terrainVariants(images.grass, "grass", images.dirt),
        wall: wallSource(images[cave ? "stoneWall" : "dirtWall"], cave ? "stone-wall" : "dirt-wall") };
      if (cave) packs.stone = terrainVariants(images.stone, "stone");
      app.setFloorWorkflow(true);
      app.floor.roles.find(role => role.id === "grass").name = "透明草皮";
      app.floor.roles.find(role => role.id === "wall").name = cave ? "石背景墙" : "泥土背景墙";
      let stoneId;
      if (cave) {
        app.addFloorLayer("岩石地形", "");
        stoneId = app.floor.id;
        const ordered = app.floor.roles.filter(role => role.id !== stoneId).sort((a, b) => a.order - b.order);
        ordered.splice(ordered.findIndex(role => role.id === "terrain") + 1, 0,
          app.floor.roles.find(role => role.id === stoneId));
        ordered.forEach((role, index) => role.order = index);
      }
      for (const [key, sources] of Object.entries(packs)) {
        app.switchFloorLayer(key === "stone" ? stoneId : key);
        app.replaceSources(sources);
        app.state.variantMode = "mixed";
        app.rebuild();
      }
      app.floor.paint = Lab.makeFloorSample(48, 28);
      if (stoneId) {
        const map = app.floor.paint, rock = Lab.floorMaps(map, app.floor.roles)[stoneId];
        for (let y = 0; y <= map.height; y++) for (let x = 0; x <= map.width; x++)
          Lab.set(rock, x, y, Lab.get(map, x, y) && y / map.height > .59 + Math.sin(x / map.width * 10) * .045);
      }
      app.floor.previewId = null;
      app.switchFloorLayer("terrain");
      $("grid").checked = false;
      $("paint-tab").click();
      app.session.markExampleInitialized();
      app.rebuild();
      app.notify(`已从 Open-Terraria ${commit.slice(0, 7)} 载入${cave ? "4" : "3"}层案例，后续刷新从本机恢复。`);
    } finally {
      document.body.classList.remove("example-loading");
      header.inert = main.inert = false;
    }
  };
})(globalThis.DualGridLab);
