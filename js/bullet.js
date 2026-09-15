/* ==========================================================================
   子弹
   - 分小步推进，避免高速时"穿墙"
   - 判定用一条垂直于飞行方向的窄条，这样一发子弹正好打掉半个到一个砖格，
     跟原版"一发打一个小缺口、两发打通一条路"的手感一致
   ========================================================================== */

(function (TB) {
  'use strict';

  var SIZE = 8;

  function Bullet(game, owner) {
    var v = TB.DV[owner.dir];
    var cx = owner.x + owner.w / 2;
    var cy = owner.y + owner.h / 2;

    this.game = game;
    this.owner = owner;
    this.fromPlayer = owner.isPlayer;
    this.dir = owner.dir;
    this.vx = v[0];
    this.vy = v[1];

    this.w = SIZE;
    this.h = SIZE;
    this.x = cx - SIZE / 2;
    this.y = cy - SIZE / 2;

    this.speed = owner.bulletSpeed;
    this.power = owner.power;     // 能打穿钢墙
    this.dead = false;
  }

  /** 垂直于飞行方向的判定条 */
  Bullet.prototype.hitRect = function () {
    if (this.vx !== 0) {
      return TB.rect(this.x, this.y + this.h / 2 - 3, this.w, 6);
    }
    return TB.rect(this.x + this.w / 2 - 3, this.y, 6, this.h);
  };

  Bullet.prototype.step = function (dt) {
    var dist = this.speed * dt;
    var steps = Math.max(1, Math.ceil(dist / 4));
    var stepLen = dist / steps;

    for (var i = 0; i < steps && !this.dead; i++) {
      this.x += this.vx * stepLen;
      this.y += this.vy * stepLen;
      this.collide();
    }
  };

  Bullet.prototype.collide = function () {
    var g = this.game;
    var box = this.hitRect();

    // 1) 飞出战场
    if (box.x + box.w < 0 || box.x > TB.W || box.y + box.h < 0 || box.y > TB.H) {
      this.die(g, box.x + box.w / 2, box.y + box.h / 2, true);
      return;
    }

    // 2) 打在基地上
    if (g.base.alive && TB.hit(box, g.base.rect)) {
      this.dead = true;
      // 自己的子弹打不掉自己的老巢 —— 原版可以，但那纯属手滑送命，这里放过玩家
      if (!this.fromPlayer) g.destroyBase(box.x + box.w / 2, box.y + box.h / 2);
      return;
    }

    // 3) 打在坦克上（只打敌对阵营，不打自己人）
    for (var i = 0; i < g.tanks.length; i++) {
      var t = g.tanks[i];
      if (t === this.owner || t.dead) continue;
      if (t.isPlayer === this.fromPlayer) continue;
      if (t.shield > 0) continue;                 // 护盾期间子弹直接穿过/被吸收
      if (!TB.hit(box, t.rect())) continue;

      this.dead = true;
      g.hitTank(t, this, box.x + box.w / 2, box.y + box.h / 2);
      return;
    }

    // 4) 打在地形上
    if (g.map.blocked(box.x, box.y, box.w, box.h, { fly: true })) {
      var res = g.map.shoot(box, this.vx === 0, this.power);
      this.dead = true;

      var hx = box.x + box.w / 2, hy = box.y + box.h / 2;

      if (res.steel) {
        TB.sfx.hitSteel();
        g.fx.spark(hx, hy, ['#dfe8f5', '#9fb0c4', '#ffffff']);
        if (this.power) g.fx.text(hx, hy - 10, '穿透!', '#7fd8ff');
      } else {
        TB.sfx.hitBrick();
        g.fx.spark(hx, hy, ['#d8a06a', '#a86a3c', '#ffe3a0']);
      }
    }
  };

  Bullet.prototype.die = function (game, x, y, silent) {
    this.dead = true;
    if (!silent) game.fx.spark(x, y, ['#ffe3a0', '#ff9f45']);
  };

  Bullet.prototype.draw = function (ctx) {
    var cx = this.x + this.w / 2;
    var cy = this.y + this.h / 2;

    // 拖尾
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = this.fromPlayer ? '#ffe3a0' : '#ffb3a6';
    ctx.fillRect(this.x - this.vx * 5, this.y - this.vy * 5, this.w, this.h);
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.fromPlayer ? '#fff6d8' : '#ffd0c8';
    ctx.fillRect(this.x, this.y, this.w, this.h);

    ctx.fillStyle = this.fromPlayer ? '#f2c14e' : '#ff6b5a';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  };

  TB.Bullet = Bullet;

})(window.TB);
