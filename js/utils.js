/* ==========================================================================
   常量与工具函数
   所有模块都挂在全局的 TB 命名空间上，避免使用 ES Module —— 这样直接
   双击 index.html 用 file:// 打开也能跑，不需要起本地服务器。
   ========================================================================== */

window.TB = window.TB || {};

(function (TB) {
  'use strict';

  /* ------------------------------------------------------------- 尺寸 --- */

  TB.TILE = 32;                    // 一格地图的边长
  TB.SUB = TB.TILE / 2;            // 砖块的最小破坏单位（半格）
  TB.COLS = 13;                    // 地图宽 13 格
  TB.ROWS = 13;                    // 地图高 13 格
  TB.W = TB.TILE * TB.COLS;        // 战场 416 x 416
  TB.H = TB.TILE * TB.ROWS;
  TB.SUB_COLS = TB.W / TB.SUB;     // 26 —— 子格总数（碰撞以子格为单位）

  TB.TANK = 32;                    // 坦克边长（正好一格）
  TB.PAD = 1;                      // 碰撞盒内缩，避免贴着墙卡住

  /* ------------------------------------------------------------- 方向 --- */

  TB.UP = 0;
  TB.RIGHT = 1;
  TB.DOWN = 2;
  TB.LEFT = 3;

  // 方向 -> 单位向量（屏幕坐标，y 向下）
  TB.DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  TB.DIR_NAME = ['up', 'right', 'down', 'left'];

  /* ------------------------------------------------------------- 地形 --- */

  TB.EMPTY = 0;
  TB.BRICK = 1;
  TB.STEEL = 2;
  TB.WATER = 3;
  TB.GRASS = 4;

  // 关卡字符 -> 地形
  TB.CHAR_TILE = { '#': TB.BRICK, '@': TB.STEEL, '~': TB.WATER, '*': TB.GRASS };

  /* ------------------------------------------------------------- 调色 --- */

  TB.COLORS = {
    player:      { body: '#f2c14e', dark: '#a97b18', track: '#7a5710', trim: '#ffe3a0' },
    basic:       { body: '#b9c2cc', dark: '#69737f', track: '#4a525c', trim: '#e6ecf3' },
    fast:        { body: '#7fd8ff', dark: '#2c7d9e', track: '#1e5a73', trim: '#d5f3ff' },
    power:       { body: '#a6e26b', dark: '#4d8a26', track: '#37641a', trim: '#e0f9c6' },
    armor:       { body: '#ff8a6b', dark: '#a13d24', track: '#782c19', trim: '#ffd0c2' },
    armorHurt:   { body: '#d9a0ff', dark: '#6d3a9e', track: '#4e2873', trim: '#efd8ff' }
  };

  /* ------------------------------------------------------------- 工具 --- */

  TB.clamp = function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };

  /** 四舍五入到 g 的倍数 */
  TB.snap = function (v, g) {
    return Math.round(v / g) * g;
  };

  TB.rand = function (lo, hi) {
    return lo + Math.random() * (hi - lo);
  };

  TB.randInt = function (n) {
    return Math.floor(Math.random() * n);
  };

  TB.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };

  /** 轴对齐矩形相交（对象需含 x / y / w / h） */
  TB.hit = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  };

  TB.rect = function (x, y, w, h) {
    return { x: x, y: y, w: w, h: h };
  };

  /** 角度（弧度）转方向枚举 */
  TB.dirFromVec = function (dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? TB.RIGHT : TB.LEFT;
    return dy > 0 ? TB.DOWN : TB.UP;
  };

})(window.TB);
