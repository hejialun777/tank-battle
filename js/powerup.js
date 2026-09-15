/* ==========================================================================
   道具
   打掉"红色闪光"的敌人会掉一个，玩家开车碾过去即可拾取
   ========================================================================== */

(function (TB) {
  'use strict';

  var SIZE = 28;
  var LIFETIME = 16;      // 场上停留时间（秒）
  var BLINK_AT = 4;       // 最后 4 秒开始闪

  var KINDS = {
    star:    { color: '#f2c14e', dark: '#8a6410', label: '火力升级' },
    helmet:  { color: '#62d0ff', dark: '#1f6d92', label: '无敌护盾' },
    clock:   { color: '#b18cff', dark: '#5a3ba3', label: '冻结敌人' },
    shovel:  { color: '#9aa6b5', dark: '#4c5866', label: '基地钢墙' },
    tank:    { color: '#7ee787', dark: '#2f7d3a', label: '额外生命' },
    grenade: { color: '#ff6b5a', dark: '#8f2b1e', label: '全屏轰炸' }
  };

  var POOL = ['star', 'star', 'helmet', 'clock', 'shovel', 'tank', 'grenade'];

  function PowerUp(x, y, kind) {
    this.w = SIZE;
    this.h = SIZE;
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.age = 0;
    this.dead = false;
    // 出场时从中心"弹"出来
    this.pop = 0;
  }

  PowerUp.prototype.step = function (dt) {
    this.age += dt;
    this.pop = Math.min(1, this.pop + dt * 5);
    if (this.age > LIFETIME) this.dead = true;
  };

  PowerUp.prototype.visible = function () {
    if (this.age < LIFETIME - BLINK_AT) return true;
    return Math.floor(this.age * 8) % 2 === 0;
  };

  PowerUp.prototype.rect = function () {
    return TB.rect(this.x, this.y, this.w, this.h);
  };

  /** 从道具池里随机挑一个（避开已经满级的火力升级） */
  PowerUp.pickKind = function (playerLevel) {
    var pool = POOL;
    if (playerLevel >= 3) pool = POOL.filter(function (k) { return k !== 'star'; });
    return TB.pick(pool);
  };

  /* ------------------------------------------------------------- 绘制 --- */

  PowerUp.prototype.draw = function (ctx) {
    if (!this.visible()) return;

    var meta = KINDS[this.kind];
    var cx = this.x + this.w / 2;
    var cy = this.y + this.h / 2;
    var s = this.pop;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    // 底板
    ctx.fillStyle = 'rgba(8,12,18,.92)';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2;
    roundRect(ctx, -14, -14, 28, 28, 6);
    ctx.fill();
    ctx.stroke();

    // 内圈微光
    ctx.globalAlpha = 0.16 + 0.1 * Math.sin(this.age * 6);
    ctx.fillStyle = meta.color;
    roundRect(ctx, -11, -11, 22, 22, 4);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = meta.color;
    drawIcon(ctx, this.kind);

    ctx.restore();
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawIcon(ctx, kind) {
    switch (kind) {
      case 'star': {
        ctx.beginPath();
        for (var i = 0; i < 10; i++) {
          var r = i % 2 === 0 ? 9 : 4;
          var a = -Math.PI / 2 + i * Math.PI / 5;
          var px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'helmet': {
        ctx.beginPath();
        ctx.arc(0, 1, 8, Math.PI, 0);
        ctx.lineTo(8, 3);
        ctx.lineTo(-8, 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-9, 4, 18, 3);
        break;
      }
      case 'clock': {
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0b0e13';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, -5);
        ctx.moveTo(0, 0); ctx.lineTo(4, 2);
        ctx.stroke();
        break;
      }
      case 'shovel': {
        ctx.fillRect(-2, -10, 4, 10);
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(4, 9); ctx.lineTo(-4, 9);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'tank': {
        ctx.fillRect(-9, -6, 5, 13);
        ctx.fillRect(4, -6, 5, 13);
        ctx.fillRect(-4, -4, 8, 10);
        ctx.fillRect(-1.5, -10, 3, 7);
        break;
      }
      case 'grenade': {
        ctx.beginPath();
        ctx.arc(0, 2, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-2.5, -9, 5, 4);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(2, -9);
        ctx.quadraticCurveTo(8, -12, 7, -5);
        ctx.stroke();
        break;
      }
    }
  }

  TB.PowerUp = PowerUp;
  TB.POWERUP_META = KINDS;

})(window.TB);
