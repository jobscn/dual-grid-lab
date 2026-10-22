(function (Lab) {
  "use strict";
  function overview() {
    const rows = [
      ".............................",
      ".............................",
      "..#########........#.........",
      "..#########.......###........",
      "..##....###......#####.......",
      "..##....###.......###........",
      "..#########........#.........",
      "..#########..................",
      "......##......#.#.#.#.#......",
      "......##.......#.#.#.#.......",
      "...############..............",
      "...##.........##....#........",
      "...##..........##..#.........",
      "...##...........###..........",
      "...##########....#...........",
      "............##...............",
      "..#..##......#######.........",
      ".............................",
      "............................."
    ];
    const map = Lab.map(28, 18, "综合拼接", "OVERVIEW",
      "直边 / 内外角 / 孔洞 / 窄路 / 孤点 / 对角");
    rows.forEach((row, y) => Array.from(row).forEach((value, x) =>
      Lab.set(map, x, y, value === "#")));
    return map;
  }
  function edgePairs() {
    const map = Lab.map(66, 34, "共边组合", "128 EDGE PAIRS",
      "64 种横向＋64 种纵向相邻组合；放大检查共边");
    // Two adjacent cells share six binary corner samples: 2^6 possibilities per direction.
    for (let direction = 0; direction < 2; direction++)
      for (let pattern = 0; pattern < 64; pattern++) {
        const x0 = 2 + (pattern % 8 + direction * 8) * 4;
        const y0 = 2 + Math.floor(pattern / 8) * 4;
        const width = direction === 0 ? 3 : 2, height = direction === 0 ? 2 : 3;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            Lab.set(map, x0 + x, y0 + y, pattern & (1 << (y * width + x)));
      }
    return map;
  }
  function sideView() {
    return Lab.makeFloorSample();
  }
  Lab.makeChecks = function (seed) {
    const batch = Lab.makeBatch(seed);
    return [overview(), ...batch.slice(0, 5), edgePairs(), batch[5], sideView()];
  };
})(globalThis.DualGridLab);
