/* ==========================================================================
   游戏主体 —— 状态机、关卡流程、碰撞裁决、渲染
   状态： menu / playing / paused / levelclear / gameover / win
   ========================================================================== */

(function (TB) {
  'use strict';

  function Game(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;

    this.input = new TB.Input();
    this.fx = new TB.Effects();

    this.state = 'menu';
    this.reason = '';

    this.levelIndex = 0;
    this.score = 0;
    this.lives = 3;
    this.playerLevel = 0;      // 跨关卡保留，阵亡后清零

    this.map = new TB.TileMap(TB.LEVELS[0].map);
    this.base = {
      alive: true,
      rect: TB.rect(TB.BASE_COL * TB.TILE, TB.BASE_ROW * TB.TILE, TB.TILE, TB.TILE)
    };

    this.tanks = [];
    this.bullets = [];
    this.powerups = [];
    this.player = null;

    this.roster = [];          // 本关全部敌人（按出场顺序）
    this.queue = [];           // 还没出场的
    this.spawned = 0;
    this.killed = 0;
    this.spawnTimer = 0;
    this.spawnSlot = 0;

    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.respawnTimer = 0;
    this.clearTimer = 0;
    this.overTimer = 0;
    this.bannerTimer = 0;

    this.time = 0;
    this.shake = 0;

    this.onState = null;       // 由 main.js 注入，用来切遮罩层

    this._last = 0;
    this._raf = null;
  }

  /* ========================================================== 生命周期 == */

  Game.prototype.setupCanvas = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(TB.W * dpr);
    this.canvas.height = Math.round(TB.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 之后一律用"游戏坐标"画
    this.ctx.imageSmoothingEnabled = true;
  };

  Game.prototype.start = function () {
    var self = this;

    function frame(ts) {
      self._raf = requestAnimationFrame(frame);

      if (!self._last) self._last = ts;
      var dt = (ts - self._last) / 1000;
      self._last = ts;

      // 切标签页回来时 dt 会很大，钳一下免得物理穿模
      dt = TB.clamp(dt, 0, 0.05);

      self.update(dt);
      self.render();
      self.input.endFrame();
    }

    this._raf = requestAnimationFrame(frame);
  };

  /* ============================================================== 流程 == */

  Game.prototype.newGame = function () {
    this.score = 0;
    this.lives = 3;
    this.playerLevel = 0;
    this.levelIndex = 0;
    this.startLevel(0);
  };

  Game.prototype.startLevel = function (index) {
    this.levelIndex = index;

    var cfg = this.cfg();
    this.map.load(cfg.map);

    this.base.alive = true;
    this.tanks.length = 0;
    this.bullets.length = 0;
    this.powerups.length = 0;
    this.fx.clear();
    this.player = null;

    this.roster = cfg.enemies.slice();
    this.queue = cfg.enemies.slice();
    this.bonusSlots = TB.bonusSlots(cfg.enemies.length);
    this.spawned = 0;
    this.killed = 0;
    this.spawnTimer = 0.6;
    this.spawnSlot = 0;

    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.respawnTimer = 0;
    this.clearTimer = 0;
    this.bannerTimer = 1.9;
    this.shake = 0;

    this.spawnPlayer(true);

    this.state = 'playing';
    this.emit('playing');
    this.syncUI();
  };

  Game.prototype.spawnPlayer = function (fresh) {
    var p = new TB.PlayerTank(this, TB.PLAYER_SPAWN.c * TB.TILE, TB.PLAYER_SPAWN.r * TB.TILE);

    if (!fresh) p.level = this.playerLevel;
    p.applyLevel();

    // 出生保护。给得比较长（5 秒）是因为出生点就在基地旁边，
    // 敌人一旦压过来很容易在出生点连着把人打死，形成死亡螺旋。
    p.shield = 5;

    this.tanks.push(p);
    this.player = p;
    TB.sfx.spawn();
  };

  Game.prototype.cfg = function () {
    return TB.LEVELS[this.levelIndex];
  };

  Game.prototype.aliveEnemies = function () {
    var n = 0;
    for (var i = 0; i < this.tanks.length; i++) {
      if (!this.tanks[i].isPlayer && !this.tanks[i].dead) n++;
    }
    return n;
  };

  Game.prototype.emit = function (state, payload) {
    if (typeof this.onState === 'function') this.onState(state, payload || {});
  };

  /* ============================================================== 更新 == */

  Game.prototype.update = function (dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

    this.handleHotkeys();

    switch (this.state) {
      case 'playing':     this.updatePlaying(dt); break;
      case 'levelclear':  this.updateLevelClear(dt); break;
      case 'gameover':
      case 'win':         this.updateEpilogue(dt); break;
    }

    // 特效和飘分在任何状态下都继续跑，看起来更自然
    this.fx.step(dt);
  };

  Game.prototype.handleHotkeys = function () {
    var i = this.input;

    if (i.consume('mute')) TB.sfx.setEnabled(!TB.sfx.enabled);
    if (i.consume('restart')) this.newGame();

    if (i.consume('pause')) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.emit('paused');
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.emit('playing');
      }
    }

    if (i.consume('start')) {
      if (this.state === 'menu' || this.state === 'gameover' || this.state === 'win') {
        this.newGame();
      }
    }
  };

  Game.prototype.togglePause = function () {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.emit('paused');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.emit('playing');
    }
  };

  /* ------------------------------------------------------------- 主循环 -- */

  Game.prototype.updatePlaying = function (dt) {
    var i;

    if (this.bannerTimer > 0) this.bannerTimer -= dt;

    // --- 道具计时器 ---
    if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);

    if (this.shovelTimer > 0) {
      this.shovelTimer -= dt;
      if (this.shovelTimer <= 0) this.map.restoreBase();
    }

    // --- 敌人出场 ---
    this.updateSpawn(dt);

    // --- 坦克 ---
    for (i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (t.dead) continue;

      // 冻结：每帧把剩余时间刷回去
      if (!t.isPlayer && this.freezeTimer > 0) t.frozen = this.freezeTimer;

      t.step(dt);
    }

    // --- 子弹 ---
    for (i = 0; i < this.bullets.length; i++) {
      if (!this.bullets[i].dead) this.bullets[i].step(dt);
    }
    this.resolveBulletDuel();

    // --- 道具拾取 ---
    this.updatePickups();

    // --- 收尸 ---
    this.reap();

    // --- 玩家重生（出生点被敌人占着就再等等，避免一出生就叠在一起） ---
    if (!this.player && this.lives > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        if (this.spawnPointClear(TB.PLAYER_SPAWN.c, TB.PLAYER_SPAWN.r)) this.spawnPlayer(false);
        else this.respawnTimer = 0.3;
      }
    }

    // --- 过关判定 ---
    if (this.base.alive && this.player && !this.player.dead &&
        this.queue.length === 0 && this.aliveEnemies() === 0) {
      this.state = 'levelclear';
      this.clearTimer = 2.4;
      TB.sfx.levelClear();
      this.emit('levelclear');
    }

    this.syncUI();
  };

  Game.prototype.updateSpawn = function (dt) {
    if (this.queue.length === 0) return;
    if (this.aliveEnemies() >= this.cfg().maxAlive) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    this.spawnTimer = this.cfg().spawnInterval;

    // 三个出生点轮流找空位
    for (var n = 0; n < TB.ENEMY_SPAWNS.length; n++) {
      var slot = (this.spawnSlot + n) % TB.ENEMY_SPAWNS.length;
      var sp = TB.ENEMY_SPAWNS[slot];

      var x = sp.c * TB.TILE;
      var y = sp.r * TB.TILE;
      if (this.blockedForSpawn(x, y)) continue;

      this.spawnSlot = (slot + 1) % TB.ENEMY_SPAWNS.length;

      var type = this.queue.shift();
      var bonus = this.bonusSlots.indexOf(this.spawned) >= 0;

      var e = new TB.EnemyTank(this, x, y, type, bonus);
      this.tanks.push(e);
      this.spawned++;
      TB.sfx.spawn();
      return;
    }
  };

  Game.prototype.blockedForSpawn = function (x, y) {
    var r = TB.rect(x, y, TB.TANK, TB.TANK);
    for (var i = 0; i < this.tanks.length; i++) {
      if (this.tanks[i].dead) continue;
      if (TB.hit(r, this.tanks[i].rect())) return true;
    }
    return false;
  };

  Game.prototype.spawnPointClear = function (c, r) {
    return !this.blockedForSpawn(c * TB.TILE, r * TB.TILE);
  };

  /** 玩家子弹可以打掉敌方子弹 */
  Game.prototype.resolveBulletDuel = function () {
    for (var i = 0; i < this.bullets.length; i++) {
      var a = this.bullets[i];
      if (a.dead || !a.fromPlayer) continue;

      var ab = a.hitRect();

      for (var j = 0; j < this.bullets.length; j++) {
        var b = this.bullets[j];
        if (b === a || b.dead || b.fromPlayer) continue;

        if (TB.hit(ab, b.hitRect())) {
          a.dead = true;
          b.dead = true;
          this.fx.spark((ab.x + ab.w / 2), (ab.y + ab.h / 2), ['#ffffff', '#62d0ff']);
          TB.sfx.hitSteel();
          break;
        }
      }
    }
  };

  Game.prototype.updatePickups = function () {
    var p = this.player;
    if (!p || p.dead || p.spawning) return;

    var pr = p.rect();

    for (var i = this.powerups.length - 1; i >= 0; i--) {
      var u = this.powerups[i];
      if (u.dead) continue;
      if (!TB.hit(pr, u.rect())) continue;

      u.dead = true;
      this.applyPowerUp(u);
    }
  };

  Game.prototype.reap = function () {
    var i;

    for (i = this.bullets.length - 1; i >= 0; i--) {
      if (!this.bullets[i].dead) continue;
      var owner = this.bullets[i].owner;
      if (owner && owner.liveBullets > 0) owner.liveBullets--;
      this.bullets.splice(i, 1);
    }

    for (i = this.tanks.length - 1; i >= 0; i--) {
      if (!this.tanks[i].dead) continue;
      if (this.tanks[i] === this.player) this.player = null;
      this.tanks.splice(i, 1);
    }

    for (i = this.powerups.length - 1; i >= 0; i--) {
      if (this.powerups[i].dead) this.powerups.splice(i, 1);
    }
  };

  Game.prototype.updateLevelClear = function (dt) {
    this.clearTimer -= dt;
    if (this.clearTimer > 0) return;

    if (this.levelIndex + 1 < TB.LEVELS.length) {
      this.playerLevel = this.player ? this.player.level : this.playerLevel;
      this.startLevel(this.levelIndex + 1);
    } else {
      this.state = 'win';
      this.overTimer = 0;
      this.emit('win', { score: this.score });
    }
  };

  Game.prototype.updateEpilogue = function (dt) {
    this.overTimer += dt;
  };

  /* ============================================================== 裁决 == */

  Game.prototype.hitTank = function (t, bullet, hx, hy) {
    if (t.shield > 0) {
      this.fx.spark(hx, hy, ['#62d0ff', '#ffffff']);
      TB.sfx.hitSteel();
      return;
    }

    var destroyed = t.hurt();

    if (!destroyed) {
      // 装甲坦克还有血
      TB.sfx.hitSteel();
      this.fx.spark(hx, hy, ['#dfe8f5', '#ffd0c8']);
      this.fx.text(t.x + t.w / 2, t.y + 6, 'HP ' + t.hp, '#ffd0c8');
      return;
    }

    t.dead = true;
    TB.sfx.boom();
    this.fx.boom(t.x + t.w / 2, t.y + t.h / 2);

    if (t.isPlayer) {
      this.onPlayerDeath();
      return;
    }

    this.killed++;
    this.score += t.score;
    this.fx.text(t.x + t.w / 2, t.y + t.h / 2, '+' + t.score, '#ffe3a0');

    if (t.bonus) this.dropPowerUp(t.x + t.w / 2, t.y + t.h / 2);
  };

  Game.prototype.onPlayerDeath = function () {
    this.playerLevel = 0;         // 阵亡后火力清零，跟原版一致
    this.lives--;

    if (this.lives <= 0) {
      this.gameOver('生命耗尽');
    } else {
      this.respawnTimer = 1.3;
    }
  };

  Game.prototype.destroyBase = function (x, y) {
    if (!this.base.alive) return;

    this.base.alive = false;
    this.shake = 1;
    TB.sfx.bigBoom();
    this.fx.bigBoom(this.base.rect.x + TB.TILE / 2, this.base.rect.y + TB.TILE / 2);
    this.gameOver('基地被摧毁');
  };

  Game.prototype.gameOver = function (reason) {
    this.reason = reason;
    this.state = 'gameover';
    this.overTimer = 0;
    TB.sfx.gameOver();
    this.emit('gameover', { score: this.score, reason: reason });
  };

  /* ============================================================== 道具 == */

  Game.prototype.dropPowerUp = function (x, y) {
    var kind = TB.PowerUp.pickKind(this.player ? this.player.level : 0);

    // 放在离掉落点最近的空地上，避免卡在墙里
    var pos = this.findFreeSpot(x, y);

    this.powerups.push(new TB.PowerUp(pos.x, pos.y, kind));
    TB.sfx.pickup();
  };

  Game.prototype.findFreeSpot = function (x, y) {
    var size = 28;
    var sx = TB.clamp(x - size / 2, 0, TB.W - size);
    var sy = TB.clamp(y - size / 2, 0, TB.H - size);

    for (var ring = 0; ring < 6; ring++) {
      for (var a = 0; a < 8; a++) {
        var ox = sx + Math.cos(a / 8 * Math.PI * 2) * ring * 10;
        var oy = sy + Math.sin(a / 8 * Math.PI * 2) * ring * 10;
        var px = TB.clamp(ox, 0, TB.W - size);
        var py = TB.clamp(oy, 0, TB.H - size);
        if (!this.map.blocked(px, py, size, size, { fly: true })) {
          return { x: px, y: py };
        }
      }
    }

    return { x: sx, y: sy };
  };

  Game.prototype.applyPowerUp = function (u) {
    var meta = TB.POWERUP_META[u.kind];
    var label = meta ? meta.label : '道具';

    switch (u.kind) {
      case 'star':
        if (this.player && this.player.upgrade()) label = '火力 ' + this.player.level + ' 级';
        else label = '火力已满';
        break;

      case 'helmet':
        if (this.player) this.player.shield = 10;
        break;

      case 'clock':
        this.freezeTimer = 8;
        break;

      case 'shovel':
        this.shovelTimer = 15;
        this.map.fortifyBase();
        break;

      case 'tank':
        this.lives++;
        break;

      case 'grenade':
        this.blowUpAll();
        break;
    }

    TB.sfx.pickup();
    this.fx.text(u.x + u.w / 2, u.y - 6, label, meta ? meta.color : '#ffe3a0');
    this.syncUI();

    this.powerups.splice(this.powerups.indexOf(u), 1);
  };

  Game.prototype.blowUpAll = function () {
    for (var i = 0; i < this.tanks.length; i++) {
      var t = this.tanks[i];
      if (t.isPlayer || t.dead || t.spawning) continue;

      t.dead = true;
      this.killed++;
      this.score += t.score;
      this.fx.boom(t.x + t.w / 2, t.y + t.h / 2);
      this.fx.text(t.x + t.w / 2, t.y + t.h / 2, '+' + t.score, '#ffe3a0');
    }
    this.shake = 0.8;
    TB.sfx.bigBoom();
  };

  /* ============================================================== 渲染 == */

  Game.prototype.render = function () {
    var ctx = this.ctx;

    ctx.save();

    if (this.shake > 0) {
      var m = this.shake * 5;
      ctx.translate(TB.rand(-m, m), TB.rand(-m, m));
    }

    // 底色
    ctx.fillStyle = '#05070a';
    ctx.fillRect(-8, -8, TB.W + 16, TB.H + 16);

    this.drawGround(ctx);
    this.drawBase(ctx);
    this.drawPowerUps(ctx);

    for (var i = 0; i < this.tanks.length; i++) {
      if (!this.tanks[i].dead) this.tanks[i].draw(ctx);
    }

    for (var j = 0; j < this.bullets.length; j++) this.bullets[j].draw(ctx);

    this.drawGrass(ctx);      // 草丛盖在坦克上面，可以藏身

    this.fx.draw(ctx);

    ctx.restore();

    this.drawOverlayFx(ctx);
    if (this.bannerTimer > 0 && this.state === 'playing') this.drawBanner(ctx);
  };

  Game.prototype.drawGround = function (ctx) {
    var t0 = this.time;

    for (var r = 0; r < TB.ROWS; r++) {
      for (var c = 0; c < TB.COLS; c++) {
        var t = this.map.base[r][c];
        if (t === TB.EMPTY || t === TB.GRASS) continue;

        var px = c * TB.TILE;
        var py = r * TB.TILE;

        if (t === TB.BRICK) this.drawBrick(ctx, px, py, this.map.mask[r][c]);
        else if (t === TB.STEEL) this.drawSteel(ctx, px, py);
        else if (t === TB.WATER) this.drawWater(ctx, px, py, t0);
      }
    }
  };

  Game.prototype.drawBrick = function (ctx, px, py, mask) {
    for (var i = 0; i < 4; i++) {
      if (!(mask & (1 << i))) continue;

      var sx = px + (i & 1) * TB.SUB;
      var sy = py + (i >> 1) * TB.SUB;

      ctx.fillStyle = '#6d3520';
      ctx.fillRect(sx, sy, TB.SUB, TB.SUB);

      ctx.fillStyle = '#b8603a';
      ctx.fillRect(sx + 1, sy + 1, 14, 6);
      ctx.fillRect(sx + 1, sy + 9, 14, 6);

      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(sx + 1, sy + 1, 14, 2);

      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(sx, sy + 7, TB.SUB, 2);
      ctx.fillRect(sx + 7, sy, 2, 7);
      ctx.fillRect(sx + 1, sy + 9, 2, 7);
    }
  };

  Game.prototype.drawSteel = function (ctx, px, py) {
    ctx.fillStyle = '#5b6672';
    ctx.fillRect(px, py, TB.TILE, TB.TILE);

    var half = TB.SUB;
    ctx.fillStyle = '#aab6c4';
    ctx.fillRect(px + 2, py + 2, half - 3, half - 3);
    ctx.fillRect(px + half + 1, py + half + 1, half - 3, half - 3);

    ctx.fillStyle = '#7d8896';
    ctx.fillRect(px + half + 1, py + 2, half - 3, half - 3);
    ctx.fillRect(px + 2, py + half + 1, half - 3, half - 3);

    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(px + 2, py + 2, half - 3, 2);
    ctx.fillRect(px + 2, py + 2, 2, half - 3);
  };

  Game.prototype.drawWater = function (ctx, px, py, t0) {
    ctx.fillStyle = '#0f3357';
    ctx.fillRect(px, py, TB.TILE, TB.TILE);

    ctx.strokeStyle = 'rgba(110,190,255,.45)';
    ctx.lineWidth = 2;

    for (var k = 0; k < 3; k++) {
      var yy = py + 6 + k * 10;
      var ph = t0 * 2.2 + k * 1.1 + (px + py) * 0.05;
      ctx.beginPath();
      for (var x = 0; x <= TB.TILE; x += 4) {
        var wy = yy + Math.sin(ph + x * 0.28) * 2.2;
        if (x === 0) ctx.moveTo(px + x, wy); else ctx.lineTo(px + x, wy);
      }
      ctx.stroke();
    }
  };

  Game.prototype.drawGrass = function (ctx) {
    for (var r = 0; r < TB.ROWS; r++) {
      for (var c = 0; c < TB.COLS; c++) {
        if (this.map.base[r][c] !== TB.GRASS) continue;

        var px = c * TB.TILE;
        var py = r * TB.TILE;

        ctx.fillStyle = '#1d5c2c';
        ctx.fillRect(px, py, TB.TILE, TB.TILE);

        // 用格子坐标做种子，保证草丛图案固定不闪烁
        var seed = (r * 31 + c * 17) % 97;
        ctx.fillStyle = '#2e8a45';
        for (var i = 0; i < 9; i++) {
          var s = (seed + i * 37) % 97;
          var x = px + (s % 7) * 4 + 2;
          var y = py + ((s * 3) % 7) * 4 + 2;
          ctx.fillRect(x, y, 3, 3);
        }

        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(px, py + TB.TILE - 2, TB.TILE, 2);
      }
    }
  };

  Game.prototype.drawBase = function (ctx) {
    var r = this.base.rect;
    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;

    // 底板
    ctx.fillStyle = '#2a313b';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

    if (!this.base.alive) {
      ctx.fillStyle = '#3c434d';
      ctx.fillRect(r.x + 4, r.y + 20, 24, 8);
      ctx.strokeStyle = '#ff6b5a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.x + 8, r.y + 8);
      ctx.lineTo(r.x + 24, r.y + 24);
      ctx.moveTo(r.x + 24, r.y + 8);
      ctx.lineTo(r.x + 8, r.y + 24);
      ctx.stroke();
      return;
    }

    // 老鹰
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.moveTo(cx, r.y + 4);
    ctx.lineTo(cx + 4, r.y + 10);
    ctx.lineTo(cx + 12, r.y + 8);
    ctx.lineTo(cx + 7, r.y + 15);
    ctx.lineTo(cx + 11, r.y + 26);
    ctx.lineTo(cx, r.y + 21);
    ctx.lineTo(cx - 11, r.y + 26);
    ctx.lineTo(cx - 7, r.y + 15);
    ctx.lineTo(cx - 12, r.y + 8);
    ctx.lineTo(cx - 4, r.y + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(cx, r.y + 9, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 底座阴影
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(r.x + 4, r.y + 26, 24, 3);
  };

  Game.prototype.drawPowerUps = function (ctx) {
    for (var i = 0; i < this.powerups.length; i++) this.powerups[i].draw(ctx);
  };

  Game.prototype.drawOverlayFx = function (ctx) {
    // 冻结：全屏淡蓝
    if (this.freezeTimer > 0) {
      ctx.globalAlpha = 0.16 * Math.min(1, this.freezeTimer / 2);
      ctx.fillStyle = '#62d0ff';
      ctx.fillRect(0, 0, TB.W, TB.H);
      ctx.globalAlpha = 1;
    }

    // 挖钢墙道具生效中：基地周围微微发亮
    if (this.shovelTimer > 0) {
      ctx.globalAlpha = 0.1 + 0.08 * Math.sin(this.time * 8);
      ctx.fillStyle = '#dfe8f5';
      for (var i = 0; i < TB.BASE_WALLS.length; i++) {
        var p = TB.BASE_WALLS[i];
        ctx.fillRect(p.c * TB.TILE, p.r * TB.TILE, TB.TILE, TB.TILE);
      }
      ctx.globalAlpha = 1;
    }
  };

  Game.prototype.drawBanner = function (ctx) {
    var p = TB.clamp(this.bannerTimer / 1.9, 0, 1);
    var a = p > 0.75 ? (1 - p) / 0.25 : Math.min(1, p / 0.25);

    ctx.globalAlpha = a * 0.62;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, TB.H / 2 - 34, TB.W, 68);

    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#f2c14e';
    ctx.font = 'bold 21px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(this.cfg().name, TB.W / 2, TB.H / 2 - 8);

    ctx.fillStyle = '#8fa0b5';
    ctx.font = '12px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('消灭全部 ' + this.roster.length + ' 辆敌方坦克', TB.W / 2, TB.H / 2 + 15);

    ctx.globalAlpha = 1;
  };

  /* ================================================================ UI == */

  Game.prototype.syncUI = function () {
    var ui = this.ui;
    if (!ui) return;

    ui.score.textContent = this.score;
    ui.level.textContent = (this.levelIndex + 1) + ' / ' + TB.LEVELS.length;
    ui.lives.textContent = this.lives > 0 ? new Array(this.lives + 1).join('♥') : '—';

    // 剩余敌人（还没被打掉的）
    var left = this.roster.length - this.killed;
    if (left !== this._leftShown) {
      this._leftShown = left;
      var html = '';
      for (var i = this.killed; i < this.roster.length; i++) {
        var type = this.roster[i];
        var cls = TB.ENEMY_STATS[type].color;
        html += '<i class="' + cls + '"></i>';
      }
      ui.enemies.innerHTML = html;
    }

    var lv = this.player ? this.player.level : this.playerLevel;
    if (lv !== this._lvShown) {
      this._lvShown = lv;
      var stars = ui.stars.children;
      for (var s = 0; s < stars.length; s++) {
        stars[s].className = s < lv ? 'on' : '';
      }
    }
  };

  TB.Game = Game;

})(window.TB);
