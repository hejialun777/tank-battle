/* ==========================================================================
   地图
   两层数据：
     base[r][c]  —— 这一格是什么地形
     mask[r][c]  —— 如果是砖墙，四个"半格"里还剩哪几块（位掩码）
   位掩码顺序：  bit0 左上   bit1 右上   bit2 左下   bit3 右下
   碰撞与破坏都按半格（16px）判定，所以砖墙可以被打出半个格子的缺口。
   ========================================================================== */

(function (TB) {
  'use strict';

  function TileMap(rows) {
    this.rows = rows;
    this.base = [];
    this.mask = [];
    this.snapshot = null;    // 挖钢墙道具用的现场备份
    this.load(rows);
  }

  TileMap.prototype.load = function (rows) {
    this.rows = rows;
    this.base = [];
    this.mask = [];

    for (var r = 0; r < TB.ROWS; r++) {
      var line = rows[r] || '';
      var bRow = [], mRow = [];

      for (var c = 0; c < TB.COLS; c++) {
        var t = TB.CHAR_TILE[line.charAt(c)];
        if (t === undefined) t = TB.EMPTY;

        bRow.push(t);
        mRow.push(t === TB.BRICK ? 15 : 0);   // 15 = 1111，四块半砖都在
      }

      this.base.push(bRow);
      this.mask.push(mRow);
    }

    // 基地那一格永远是空的（老鹰单独画）
    this.base[TB.BASE_ROW][TB.BASE_COL] = TB.EMPTY;
    this.mask[TB.BASE_ROW][TB.BASE_COL] = 0;

    this.snapshot = null;
  };

  /* --------------------------------------------------------- 子格查询 --- */

  /** 半格坐标 -> 位掩码里对应的位 */
  TileMap.prototype._bit = function (sr, sc) {
    return 1 << (((sr & 1) * 2) + (sc & 1));
  };

  /** 这个半格是不是"坦克过不去"的实体 */
  TileMap.prototype.solid = function (sr, sc) {
    if (sr < 0 || sc < 0 || sr >= TB.SUB_COLS || sc >= TB.SUB_COLS) return true;

    var r = sr >> 1, c = sc >> 1;
    var t = this.base[r][c];

    if (t === TB.STEEL) return true;
    if (t === TB.BRICK) return (this.mask[r][c] & this._bit(sr, sc)) !== 0;
    return false;
  };

  TileMap.prototype.water = function (sr, sc) {
    if (sr < 0 || sc < 0 || sr >= TB.SUB_COLS || sc >= TB.SUB_COLS) return false;
    return this.base[sr >> 1][sc >> 1] === TB.WATER;
  };

  /**
   * 矩形是否撞到地形
   * @param opts.fly  true 表示"飞过水面"（子弹用）
   */
  TileMap.prototype.blocked = function (x, y, w, h, opts) {
    opts = opts || {};

    var sc0 = Math.floor(x / TB.SUB);
    var sc1 = Math.floor((x + w - 0.001) / TB.SUB);
    var sr0 = Math.floor(y / TB.SUB);
    var sr1 = Math.floor((y + h - 0.001) / TB.SUB);

    for (var sr = sr0; sr <= sr1; sr++) {
      for (var sc = sc0; sc <= sc1; sc++) {
        if (this.solid(sr, sc)) return true;
        if (!opts.fly && this.water(sr, sc)) return true;
      }
    }

    return false;
  };

  /* ------------------------------------------------------------- 破坏 --- */

  /**
   * 子弹打墙。
   *
   * 规则是"一发只打一条"：正对炮口的那一条子格先试，打空了就往旁边挪一条。
   * 一条清掉的是**整格 tile 里属于这条的两个子格**，所以：
   *   - 第 1 发轰掉一条
   *   - 第 2 发自动挪到旁边那条，轰掉另一条
   *   - 两发之后正好是一个坦克宽的口子
   * 一堵一格厚的墙要两发才穿，跟原版手感一致。
   *
   * @param vertical 子弹是不是在竖直飞
   * @returns {{brick:boolean, steel:boolean}}
   */
  TileMap.prototype.shoot = function (box, vertical, canBreakSteel) {
    var center = vertical ? box.x + box.w / 2 : box.y + box.h / 2;
    var primary = Math.floor(center / TB.SUB);

    var lanes = [primary, primary - 1, primary + 1];

    for (var i = 0; i < lanes.length; i++) {
      var lane = lanes[i];
      if (lane < 0 || lane >= TB.SUB_COLS) continue;

      var res = this.punchLane(box, vertical, lane, canBreakSteel);
      if (res.brick || res.steel) return res;   // 一发子弹只打一条
    }

    return { brick: false, steel: false };
  };

  /**
   * 打单独一条子格。
   *   vertical = true  -> lane 是子格列号，沿飞行方向扫子弹盒覆盖的那几行
   *   vertical = false -> lane 是子格行号，沿飞行方向扫子弹盒覆盖的那几列
   */
  TileMap.prototype.punchLane = function (box, vertical, lane, canBreakSteel) {
    var res = { brick: false, steel: false };

    var lo, hi;
    if (vertical) {
      lo = Math.floor(box.y / TB.SUB);
      hi = Math.floor((box.y + box.h - 0.001) / TB.SUB);
    } else {
      lo = Math.floor(box.x / TB.SUB);
      hi = Math.floor((box.x + box.w - 0.001) / TB.SUB);
    }

    for (var k = lo; k <= hi; k++) {
      var sr = vertical ? k : lane;
      var sc = vertical ? lane : k;

      if (sr < 0 || sc < 0 || sr >= TB.SUB_COLS || sc >= TB.SUB_COLS) continue;

      var r = sr >> 1, c = sc >> 1;
      var t = this.base[r][c];

      if (t === TB.STEEL) {
        res.steel = true;
        if (canBreakSteel) { this.base[r][c] = TB.EMPTY; this.mask[r][c] = 0; }
        return res;
      }

      if (t === TB.BRICK) {
        var idx = (sr & 1) * 2 + (sc & 1);
        if (!(this.mask[r][c] & (1 << idx))) continue;   // 这个子格已经没了，继续往下扫

        this.mask[r][c] &= ~(1 << idx);
        this.mask[r][c] &= ~(1 << (idx ^ (vertical ? 2 : 1)));   // 同一条上的另一半
        if (this.mask[r][c] === 0) this.base[r][c] = TB.EMPTY;

        res.brick = true;
        return res;
      }
    }

    return res;
  };

  /* ------------------------------------------------- 基地钢墙（道具） --- */

  /** 把基地周围那圈砖墙临时换成钢墙 */
  TileMap.prototype.fortifyBase = function () {
    if (!this.snapshot) {
      this.snapshot = TB.BASE_WALLS.map(function (p) {
        return { c: p.c, r: p.r, base: this.base[p.r][p.c], mask: this.mask[p.r][p.c] };
      }, this);
    }

    TB.BASE_WALLS.forEach(function (p) {
      // 已经被打掉的砖墙也补回来，变成钢墙
      this.base[p.r][p.c] = TB.STEEL;
      this.mask[p.r][p.c] = 0;
    }, this);
  };

  /** 道具失效，恢复成原来的砖墙 */
  TileMap.prototype.restoreBase = function () {
    if (!this.snapshot) return;

    // 还原成砖墙时补成完整的四块半砖（原版就是这个行为）
    this.snapshot.forEach(function (s) {
      if (s.base === TB.BRICK) {
        this.base[s.r][s.c] = TB.BRICK;
        this.mask[s.r][s.c] = 15;
      } else {
        this.base[s.r][s.c] = s.base;
        this.mask[s.r][s.c] = s.mask;
      }
    }, this);

    this.snapshot = null;
  };

  TB.TileMap = TileMap;

})(window.TB);
