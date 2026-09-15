/* ==========================================================================
   键盘输入
   held()     —— 按键是否被按住（移动、开炮用）
   consume()  —— 一次性动作，取走即清除（开始 / 暂停 / 重开 / 静音）
   ========================================================================== */

(function (TB) {
  'use strict';

  var KEYMAP = {
    ArrowUp: 'up',    KeyW: 'up',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down',  KeyS: 'down',
    ArrowLeft: 'left',  KeyA: 'left',
    Space: 'fire',    KeyJ: 'fire', KeyK: 'fire',
    Enter: 'start',   NumpadEnter: 'start',
    KeyP: 'pause',    Escape: 'pause',
    KeyR: 'restart',
    KeyM: 'mute'
  };

  // 这些键按下时要阻止页面滚动
  var SWALLOW = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Space', 'Enter'];

  function Input() {
    this.down = Object.create(null);     // 当前按住
    this.flash = Object.create(null);    // 本帧新按下
    this.anyKeyHandlers = [];

    var self = this;

    window.addEventListener('keydown', function (e) {
      // 输入框里打字时不拦截
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      var action = KEYMAP[e.code];
      if (SWALLOW.indexOf(e.code) >= 0) e.preventDefault();

      if (!action) return;
      if (e.repeat) return;                 // 长按不重复触发"一次性动作"

      self.down[action] = true;
      self.flash[action] = true;

      for (var i = 0; i < self.anyKeyHandlers.length; i++) self.anyKeyHandlers[i]();
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      var action = KEYMAP[e.code];
      if (action) self.down[action] = false;
    });

    // 失焦时清空，避免"卡住一直往前走"
    window.addEventListener('blur', function () {
      self.down = Object.create(null);
      self.flash = Object.create(null);
    });
  }

  Input.prototype.held = function (action) {
    return !!this.down[action];
  };

  Input.prototype.consume = function (action) {
    if (this.flash[action]) { this.flash[action] = false; return true; }
    return false;
  };

  /** 每帧末尾调用，清掉没被取走的一次性动作 */
  Input.prototype.endFrame = function () {
    this.flash = Object.create(null);
  };

  /** 方向键 -> 方向枚举，没按返回 -1 */
  Input.prototype.direction = function () {
    if (this.down.up) return TB.UP;
    if (this.down.down) return TB.DOWN;
    if (this.down.left) return TB.LEFT;
    if (this.down.right) return TB.RIGHT;
    return -1;
  };

  TB.Input = Input;

})(window.TB);
