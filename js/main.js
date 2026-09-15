/* ==========================================================================
   启动脚本 —— 把 Game 和页面上的 DOM 接起来
   ========================================================================== */

(function (TB) {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function boot() {
    var canvas = $('game');

    var ui = {
      score:   $('ui-score'),
      level:   $('ui-level'),
      lives:   $('ui-lives'),
      enemies: $('ui-enemies'),
      stars:   $('ui-stars')
    };

    var el = {
      overlay: $('overlay'),
      title:   $('ov-title'),
      text:    $('ov-text'),
      keys:    $('ov-keys'),
      btn:     $('ov-btn'),
      pause:   $('btn-pause'),
      mute:    $('btn-mute'),
      restart: $('btn-restart')
    };

    var game = new TB.Game(canvas, ui);
    game.setupCanvas();
    game.start();

    /* ------------------------------------------------------ 遮罩层文案 -- */

    var SCREENS = {
      menu: {
        title: '坦克大战',
        text: '保卫基地，消灭所有敌方坦克。',
        keys: true,
        btn: '开始游戏'
      },
      paused: {
        title: '已暂停',
        text: '按 P 或点击下面按钮继续。',
        keys: false,
        btn: '继续游戏'
      },
      levelclear: {
        title: '关卡完成！',
        text: '准备进入下一关……',
        keys: false,
        btn: null
      },
      gameover: {
        title: '游戏结束',
        text: '',
        keys: false,
        btn: '再来一局'
      },
      win: {
        title: '胜利！',
        text: '',
        keys: false,
        btn: '再玩一次'
      }
    };

    function showOverlay(name, payload) {
      var s = SCREENS[name];
      if (!s) return;

      el.title.textContent = s.title;
      el.text.textContent = s.text;
      el.keys.style.display = s.keys ? '' : 'none';

      if (s.btn) {
        el.btn.style.display = '';
        el.btn.textContent = s.btn;
        el.btn.dataset.action = name;
      } else {
        el.btn.style.display = 'none';
      }

      // 结算界面上补一句战况
      if (name === 'gameover') {
        el.text.textContent = (payload.reason || '游戏结束') + ' · 本局得分 ' + (payload.score || 0);
      } else if (name === 'win') {
        el.text.textContent = '全部关卡通关 · 最终得分 ' + (payload.score || 0);
      } else if (name === 'levelclear') {
        el.text.textContent = '第 ' + (game.levelIndex + 1) + ' 关完成，准备进入下一关……';
      }

      el.overlay.classList.remove('hidden');
    }

    function hideOverlay() {
      el.overlay.classList.add('hidden');
    }

    game.onState = function (state, payload) {
      if (state === 'playing') {
        hideOverlay();
        el.pause.textContent = '暂停';
      } else {
        showOverlay(state, payload);
        el.pause.textContent = state === 'paused' ? '继续' : '暂停';
      }
    };

    /* ---------------------------------------------------------- 交互 -- */

    function unlockAudio() {
      TB.sfx.init();
      TB.sfx.resume();
    }

    function primaryAction() {
      unlockAudio();
      TB.sfx.uiClick();

      if (game.state === 'paused') {
        game.togglePause();
      } else {
        game.newGame();
      }
    }

    el.btn.addEventListener('click', primaryAction);

    el.pause.addEventListener('click', function () {
      unlockAudio();
      TB.sfx.uiClick();
      if (game.state === 'menu') { game.newGame(); return; }
      game.togglePause();
    });

    el.restart.addEventListener('click', function () {
      unlockAudio();
      TB.sfx.uiClick();
      game.newGame();
    });

    el.mute.addEventListener('click', function () {
      unlockAudio();
      TB.sfx.setEnabled(!TB.sfx.enabled);
      el.mute.textContent = TB.sfx.enabled ? '🔊 音效' : '🔇 静音';
    });

    // 点画面也能开始 / 恢复，手机上方便
    canvas.addEventListener('pointerdown', function () {
      unlockAudio();
      if (game.state === 'menu' || game.state === 'gameover' || game.state === 'win') {
        game.newGame();
      } else if (game.state === 'paused') {
        game.togglePause();
      }
    });

    // 切到后台自动暂停，免得回来时已经被打死了
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game.state === 'playing') game.togglePause();
    });

    window.addEventListener('resize', function () {
      // canvas 的显示尺寸由 CSS 控制，这里只需要保证内部分辨率跟得上 DPR
      game.setupCanvas();
    });

    // 先亮出开始界面
    game.syncUI();
    showOverlay('menu');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.TB);
