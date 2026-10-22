(function (Lab) {
  "use strict";
  const crcTable = new Uint32Array(256), encoder = new TextEncoder();
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[i] = value >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // Small, uncompressed ZIPs avoid a network/npm dependency and multiple-download prompts.
  Lab.zipFiles = function (files) {
    const local = [], central = [];
    let offset = 0, directorySize = 0;
    for (const file of files) {
      const name = encoder.encode(file.name), bytes = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const crc = crc32(bytes), head = new Uint8Array(30), view = new DataView(head.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
      view.setUint16(12, 33, true);
      view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true);
      view.setUint16(26, name.length, true);
      local.push(head, name, bytes);
      const record = new Uint8Array(46), entry = new DataView(record.buffer);
      entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x800, true); entry.setUint32(16, crc, true);
      entry.setUint16(14, 33, true);
      entry.setUint32(20, bytes.length, true); entry.setUint32(24, bytes.length, true);
      entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
      central.push(record, name);
      directorySize += record.length + name.length;
      offset += head.length + name.length + bytes.length;
    }
    const end = new Uint8Array(22), footer = new DataView(end.buffer);
    footer.setUint32(0, 0x06054b50, true); footer.setUint16(8, files.length, true);
    footer.setUint16(10, files.length, true); footer.setUint32(12, directorySize, true); footer.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  };
  const png = canvas => new Promise((resolve, reject) => canvas.toBlob(async blob => {
    if (!blob) { reject(new Error("PNG编码失败")); return; }
    try { resolve(new Uint8Array(await blob.arrayBuffer())); } catch (error) { reject(error); }
  }, "image/png"));
  Lab.exportFloorBundle = async function (app) {
    const floor = app.floor, files = [], size = floor.unitSize;
    const roles = floor.roles.map(role => ({ ...role })), plan = Lab.floorPlan(size, roles);
    app.saveFloorLayer();
    if (Object.values(floor.slots).some(slot => !slot.valid))
      throw new Error("请先修正所有图层的切分；绘制包包含全部图层（包括隐藏层）");
    // Freeze references before asynchronous PNG encoding; UI may switch layers meanwhile.
    const slots = Object.fromEntries(Object.entries(floor.slots).map(([id, slot]) =>
      [id, { ...slot, variantPacks: slot.variantPacks.slice() }]));
    for (const role of roles) {
      const slot = slots[role.id], folder = role.required ? `required/${role.id}` : `optional/${role.id}`;
      const ground = Lab.packCanvas(slots[role.shapeFrom || "terrain"].tiles).toDataURL("image/png");
      for (let index = 0; index < slot.variantPacks.length; index++) {
        const pack = slot.variantPacks[index], name = `${folder}/v${index + 1}`;
        const drawing = Lab.packCanvas(pack.tiles);
        files.push({ name: `${name}-drawing.png`, data: await png(drawing) });
        files.push({ name: `${name}-anyruled.png`, data: await png(Lab.packCanvas(pack.tiles, Lab.layouts.anyrule)) });
        files.push({ name: `${name}-guide.svg`, data: Lab.floorGuideSvg(role.id, size,
          drawing.toDataURL("image/png"), ground, roles) });
      }
    }
    plan.layers = plan.layers.map(role => ({ ...role, enabled: slots[role.id].enabled,
      variants: slots[role.id].variantPacks.map((pack, index) => ({ name: pack.name, index: index + 1 })),
      variantMode: slots[role.id].variantMode, variantSeed: slots[role.id].variantSeed,
      activeVariant: slots[role.id].activeVariant }));
    files.push({ name: "layer-plan.json", data: JSON.stringify(plan, null, 2) });
    files.push({ name: "绘制清单.txt", data: [
      `本包共${roles.length}层（含隐藏层）；各层保留16个槽位和自己的变体。叠放顺序与所属层以layer-plan.json为准。`,
      "required/terrain：泥土地形，包含轮廓与内部。required/grass：透明草皮，00／15留空；不需要草的其他状态也可留空。",
      "optional/wall：独立背景墙；洞穴／室内可选，不属于完整地板的必需图集。",
      "drawing.png：连续绘制排版。anyruled.png：状态0～15排版。两者内容相同，仅排版不同。",
      "guide.svg：参考与绘制层分开；完成后隐藏参考、切分线、编号，只保留作品并维持原画板。",
      "各层单格与像素密度相同。composition从底到顶；shapeFrom表示选形来源，覆盖区独立，不随显隐删除。",
      "新增层从透明空白开始；独立层有独立占用，点缀层以所属层四角选图并按本层覆盖区裁切。",
      "绘制包只保存素材与图层说明，不保存试画笔画／覆盖区，不是可恢复工程存档。",
      "覆盖区域收口是本工具的四角几何裁切示意；不代表已生成对应Unity／AnyRuleD装配或规则。",
      "随工具底稿为原创示意；你导入的参考和作品保持其原有权利，不因导出改变许可。"
    ].join("\r\n") });
    return Lab.zipFiles(files);
  };
})(globalThis.DualGridLab);
