/* ==========================================================================
   音效 —— 全部用 WebAudio 现场合成，不依赖任何音频文件
   ========================================================================== */

(function (TB) {
  'use strict';

  function Sfx() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._noise = null;   // 复用的白噪声 buffer
  }

  /** 必须由用户手势触发后再调用（浏览器自动播放策略） */
  Sfx.prototype.init = function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);
  };

  Sfx.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Sfx.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.16 : 0;
  };

  /** 一个简单的振荡器音符 */
  Sfx.prototype.tone = function (opt) {
    if (!this.enabled || !this.ctx) return;

    var t0 = this.ctx.currentTime + (opt.delay || 0);
    var dur = opt.dur || 0.08;

    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();

    osc.type = opt.type || 'square';
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t0 + dur);

    // 快起快落的包络，听起来更"颗粒"
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opt.vol || 0.55, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  /** 噪声（爆炸 / 击中） */
  Sfx.prototype.noise = function (opt) {
    if (!this.enabled || !this.ctx) return;

    if (!this._noise) {
      var len = Math.floor(this.ctx.sampleRate * 0.4);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }

    var t0 = this.ctx.currentTime + (opt.delay || 0);
    var dur = opt.dur || 0.25;

    var src = this.ctx.createBufferSource();
    src.buffer = this._noise;

    var filter = this.ctx.createBiquadFilter();
    filter.type = opt.filter || 'lowpass';
    filter.frequency.setValueAtTime(opt.freq || 900, t0);
    if (opt.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opt.sweepTo), t0 + dur);

    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opt.vol || 0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  };

  /* ------------------------------------------------------- 具体音效 --- */

  Sfx.prototype.fire = function () {
    this.tone({ freq: 660, to: 220, dur: 0.07, type: 'square', vol: 0.35 });
    this.noise({ freq: 2200, dur: 0.06, vol: 0.18, filter: 'highpass' });
  };

  Sfx.prototype.hitBrick = function () {
    this.noise({ freq: 1600, sweepTo: 400, dur: 0.07, vol: 0.25, filter: 'bandpass' });
  };

  Sfx.prototype.hitSteel = function () {
    this.tone({ freq: 1400, to: 900, dur: 0.05, type: 'square', vol: 0.22 });
  };

  Sfx.prototype.boom = function () {
    this.noise({ freq: 700, sweepTo: 60, dur: 0.42, vol: 0.7 });
    this.tone({ freq: 150, to: 40, dur: 0.32, type: 'triangle', vol: 0.4 });
  };

  Sfx.prototype.bigBoom = function () {
    this.noise({ freq: 1100, sweepTo: 40, dur: 0.85, vol: 0.9 });
    this.tone({ freq: 110, to: 28, dur: 0.7, type: 'triangle', vol: 0.5 });
  };

  Sfx.prototype.pickup = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.1, type: 'square', vol: 0.32, delay: i * 0.055 });
    });
  };

  Sfx.prototype.spawn = function () {
    this.tone({ freq: 220, to: 880, dur: 0.28, type: 'sawtooth', vol: 0.2 });
  };

  Sfx.prototype.levelClear = function () {
    var self = this;
    [523, 587, 659, 784, 1047, 1319].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.14, type: 'square', vol: 0.3, delay: i * 0.1 });
    });
  };

  Sfx.prototype.gameOver = function () {
    var self = this;
    [440, 392, 330, 262, 196].forEach(function (f, i) {
      self.tone({ freq: f, dur: 0.26, type: 'triangle', vol: 0.42, delay: i * 0.17 });
    });
    this.noise({ freq: 500, sweepTo: 50, dur: 1.1, vol: 0.5, delay: 0.1 });
  };

  Sfx.prototype.uiClick = function () {
    this.tone({ freq: 880, dur: 0.05, type: 'square', vol: 0.25 });
  };

  TB.sfx = new Sfx();

})(window.TB);
