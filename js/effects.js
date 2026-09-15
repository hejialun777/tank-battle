/* ==========================================================================
   特效 —— 爆炸、火花、飘分
   全部是纯数据 + 每帧自绘，生命周期结束自动回收
   ========================================================================== */

(function (TB) {
  'use strict';

  /* ------------------------------------------------------------ 粒子 --- */

  function Spark(x, y, opt) {
    var a = TB.rand(0, Math.PI * 2);
    var sp = TB.rand(opt.minSpeed || 30, opt.maxSpeed || 190);

    this.x = x;
    this.y = y;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.life = opt.life || 0.5;
    this.age = 0;
    this.size = TB.rand(1.5, 3.5);
    this.color = TB.pick(opt.colors || ['#ffd166', '#ff9f45', '#ff6b5a']);
  }

  Spark.prototype.step = function (dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.93;
    this.vy *= 0.93;
    return this.age < this.life;
  };

  Spark.prototype.draw = function (ctx) {
    var t = this.age / this.life;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------ 爆环 --- */

  function Ring(x, y, opt) {
    this.x = x;
    this.y = y;
    this.life = opt.life || 0.38;
    this.age = 0;
    this.r0 = opt.r0 || 4;
    this.r1 = opt.r1 || 34;
    this.width = opt.width || 3;
    this.color = opt.color || '#ffd166';
  }

  Ring.prototype.step = function (dt) {
    this.age += dt;
    return this.age < this.life;
  };

  Ring.prototype.draw = function (ctx) {
    var t = this.age / this.life;
    var r = this.r0 + (this.r1 - this.r0) * (1 - Math.pow(1 - t, 2));

    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------ 飘分 --- */

  function FloatText(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color || '#ffe3a0';
    this.life = 0.9;
    this.age = 0;
  }

  FloatText.prototype.step = function (dt) {
    this.age += dt;
    this.y -= 26 * dt;
    return this.age < this.life;
  };

  FloatText.prototype.draw = function (ctx) {
    var t = this.age / this.life;
    ctx.globalAlpha = t < 0.6 ? 1 : (1 - (t - 0.6) / 0.4);
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------- 特效管理器 --- */

  function Effects() {
    this.items = [];
  }

  Effects.prototype.clear = function () {
    this.items.length = 0;
  };

  /** 子弹打在地形上 / 打在坦克上 */
  Effects.prototype.spark = function (x, y, colors) {
    for (var i = 0; i < 7; i++) {
      this.items.push(new Spark(x, y, { colors: colors, life: 0.28, maxSpeed: 140 }));
    }
    this.items.push(new Ring(x, y, { r0: 2, r1: 13, life: 0.2, width: 2, color: '#ffe3a0' }));
  };

  /** 坦克被击毁 */
  Effects.prototype.boom = function (x, y) {
    for (var i = 0; i < 22; i++) {
      this.items.push(new Spark(x, y, { life: TB.rand(0.35, 0.7), maxSpeed: 230 }));
    }
    this.items.push(new Ring(x, y, { r0: 4, r1: 36, life: 0.42, width: 4, color: '#ff9f45' }));
    this.items.push(new Ring(x, y, { r0: 2, r1: 22, life: 0.3, width: 3, color: '#fff2c2' }));
  };

  /** 大爆炸：基地被毁 / 全屏轰炸 */
  Effects.prototype.bigBoom = function (x, y) {
    for (var i = 0; i < 46; i++) {
      this.items.push(new Spark(x, y, { life: TB.rand(0.5, 1.1), maxSpeed: 340 }));
    }
    this.items.push(new Ring(x, y, { r0: 6,  r1: 78, life: 0.65, width: 7, color: '#ff9f45' }));
    this.items.push(new Ring(x, y, { r0: 3,  r1: 52, life: 0.5,  width: 5, color: '#fff2c2' }));
    this.items.push(new Ring(x, y, { r0: 10, r1: 96, life: 0.8,  width: 3, color: '#ff6b5a' }));
  };

  Effects.prototype.text = function (x, y, str, color) {
    this.items.push(new FloatText(x, y, str, color));
  };

  Effects.prototype.step = function (dt) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      if (!this.items[i].step(dt)) this.items.splice(i, 1);
    }
  };

  Effects.prototype.draw = function (ctx) {
    for (var i = 0; i < this.items.length; i++) this.items[i].draw(ctx);
  };

  TB.Effects = Effects;

})(window.TB);
