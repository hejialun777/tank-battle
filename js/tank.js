/* ==========================================================================
   坦克
   Tank        —— 公共部分：移动、卡墙滑动、开炮、绘制
   PlayerTank  —— 读键盘，火力可升级
   EnemyTank   —— 电脑 AI：朝玩家/基地方向推进，对准了就开炮
   ========================================================================== */

(function (TB) {
  'use strict';

  /* =========================================================== 基础坦克 = */

  function Tank(game, opt) {
    this.game = game;
    this.isPlayer = !!opt.isPlayer;

    this.w = TB.TANK;
    this.h = TB.TANK;
    this.x = opt.x;
    this.y = opt.y;
    this.dir = opt.dir === undefined ? TB.DOWN : opt.dir;

    this.speed = opt.speed || 80;
    this.bulletSpeed = opt.bulletSpeed || 200;
    this.fireDelay = opt.fireDelay || 0.3;

    this.hp = opt.hp || 1;
    this.maxHp = this.hp;
    this.type = opt.type || 'basic';
    this.colorKey = opt.colorKey || 'basic';
    this.score = opt.score || 0;
    this.bonus = !!opt.bonus;

    this.maxBullets = 1;
    this.liveBullets = 0;
    this.cooldown = 0;
    this.power = false;

    this.shield = opt.shield || 0;
    this.spawnDuration = opt.spawnTime || 0;
    this.spawnTime = this.spawnDuration;

    this.frozen = 0;
    this.dead = false;
    this.moving = false;
    this.treadPhase = 0;

    this.noClip = 0;      // > 0 时无视坦克碰撞（解卡用）
    this.stuckTime = 0;

    this.wantDir = -1;
    this.wantMove = false;
  }

  Object.defineProperty(Tank.prototype, 'spawning', {
    get: function () { return this.spawnTime > 0; }
  });

  Tank.prototype.rect = function () {
    return TB.rect(this.x, this.y, this.w, this.h);
  };

  /** 内缩一点的碰撞盒，避免贴着墙边走时被卡住 */
  Tank.prototype.box = function () {
    return TB.rect(this.x + TB.PAD, this.y + TB.PAD,
                   this.w - TB.PAD * 2, this.h - TB.PAD * 2);
  };

  Tank.prototype.center = function () {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  };

  /* ----------------------------------------------------------- 位置判定 -- */

  Tank.prototype.boxAt = function (x, y) {
    return TB.rect(x + TB.PAD, y + TB.PAD, this.w - TB.PAD * 2, this.h - TB.PAD * 2);
  };

  /** 边界 / 地形 / 基地有没有挡住 */
  Tank.prototype.blockedByWorld = function (x, y) {
    if (x < 0 || y < 0 || x + this.w > TB.W || y + this.h > TB.H) return true;

    var b = this.boxAt(x, y);
    if (this.game.map.blocked(b.x, b.y, b.w, b.h)) return true;
    if (this.game.base.alive && TB.hit(b, this.game.base.rect)) return true;

    return false;
  };

  /** 别的坦克有没有挡住 */
  Tank.prototype.blockedByTank = function (x, y) {
    var b = this.boxAt(x, y);
    var tanks = this.game.tanks;

    for (var i = 0; i < tanks.length; i++) {
      var o = tanks[i];
      if (o === this || o.dead) continue;
      if (TB.hit(b, o.rect())) return true;
    }

    return false;
  };

  Tank.prototype.canBeAt = function (x, y) {
    if (this.blockedByWorld(x, y)) return false;
    if (this.noClip > 0) return true;      // 正在解卡，允许从别的坦克身上挪开
    return !this.blockedByTank(x, y);
  };

  /**
   * 兜底：万一两辆车叠在一起（比如刚出生就被别的车挤住），
   * 四个方向都会被对方挡住，就会永久卡死、关卡永远打不完。
   * 这里检测到"只被坦克堵死"超过 0.8 秒，就短暂关掉坦克碰撞让它们散开。
   */
  Tank.prototype.updateStuck = function (dt) {
    if (this.noClip > 0) {
      this.noClip -= dt;
      this.stuckTime = 0;
      return;
    }

    var trapped = true;

    for (var d = 0; d < 4; d++) {
      var v = TB.DV[d];
      var nx = this.x + v[0] * 5;
      var ny = this.y + v[1] * 5;

      if (this.blockedByWorld(nx, ny)) continue;      // 这方向本来就通不了，不算数
      if (!this.blockedByTank(nx, ny)) { trapped = false; break; }
    }

    if (!trapped) {
      this.stuckTime = 0;
      return;
    }

    this.stuckTime += dt;
    if (this.stuckTime > 0.8) {
      this.noClip = 0.6;
      this.stuckTime = 0;
    }
  };

  /* --------------------------------------------------------------- 移动 -- */

  /** 转向时把垂直方向的位置吸到半格网格上，方便钻窄道 */
  Tank.prototype.faceDir = function (dir) {
    if (dir < 0 || dir > 3 || dir === this.dir) return;

    var vertical = (dir === TB.UP || dir === TB.DOWN);
    if (vertical) {
      var nx = TB.snap(this.x, TB.SUB);
      if (nx !== this.x && this.canBeAt(nx, this.y)) this.x = nx;
    } else {
      var ny = TB.snap(this.y, TB.SUB);
      if (ny !== this.y && this.canBeAt(this.x, ny)) this.y = ny;
    }

    this.dir = dir;
  };

  Tank.prototype.advance = function (dt, dir) {
    var v = TB.DV[dir];
    var dist = this.speed * dt;
    var fx = v[0] * dist;
    var fy = v[1] * dist;

    if (this.canBeAt(this.x + fx, this.y + fy)) {
      this.x += fx;
      this.y += fy;
      this.moving = true;
      this.treadPhase += dist;
      return;
    }

    // 撞墙了：朝最近的通道中心滑一点，前提是滑过去之后真的能继续走
    var vertical = (fy !== 0);
    var cur = vertical ? this.x : this.y;
    var limit = vertical ? TB.W - this.w : TB.H - this.h;
    var aligned = TB.clamp(TB.snap(cur, TB.TILE), 0, limit);

    var delta = TB.clamp(aligned - cur, -dist, dist);
    if (delta === 0) return;

    var nx = vertical ? cur + delta : this.x;
    var ny = vertical ? this.y : cur + delta;

    if (!this.canBeAt(nx, ny)) return;
    if (!this.canBeAt(nx + fx, ny + fy)) return;

    this.x = nx;
    this.y = ny;
    this.moving = true;
    this.treadPhase += Math.abs(delta);
  };

  /* --------------------------------------------------------------- 开炮 -- */

  Tank.prototype.fire = function () {
    if (this.cooldown > 0) return false;
    if (this.liveBullets >= this.maxBullets) return false;

    this.cooldown = this.fireDelay;

    var b = new TB.Bullet(this.game, this);
    this.game.bullets.push(b);
    this.liveBullets++;

    var c = this.center();
    var v = TB.DV[this.dir];
    this.game.fx.spark(c.x + v[0] * 14, c.y + v[1] * 14,
                       this.isPlayer ? ['#fff6d8', '#f2c14e'] : ['#ffd0c8', '#ff6b5a']);
    TB.sfx.fire();

    return true;
  };

  /* --------------------------------------------------------------- 受伤 -- */

  Tank.prototype.hurt = function () {
    if (this.shield > 0) return false;

    this.hp--;
    return this.hp <= 0;
  };

  /** 装甲坦克掉血后换色 */
  Tank.prototype.palette = function () {
    if (this.type === 'armor' && this.hp <= 2) return TB.COLORS.armorHurt;
    return TB.COLORS[this.colorKey] || TB.COLORS.basic;
  };

  /* --------------------------------------------------------------- 每帧 -- */

  Tank.prototype.step = function (dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.shield > 0) this.shield -= dt;

    if (this.spawnTime > 0) {
      this.spawnTime -= dt;
      this.moving = false;
      return;
    }

    if (this.frozen > 0) {
      this.frozen -= dt;
      this.moving = false;
      return;
    }

    this.updateStuck(dt);

    this.wantDir = -1;
    this.wantMove = false;
    this.think(dt);

    if (this.wantDir >= 0) this.faceDir(this.wantDir);
    if (this.wantMove) this.advance(dt, this.dir);
  };

  /** 由子类实现 */
  Tank.prototype.think = function () {};

  /* --------------------------------------------------------------- 绘制 -- */

  Tank.prototype.draw = function (ctx) {
    if (this.spawning) { drawSpawn(ctx, this); return; }

    var c = this.palette();
    var cx = this.x + this.w / 2;
    var cy = this.y + this.h / 2;

    // 会掉道具的敌人：红色闪光
    if (this.bonus && Math.floor(performance.now() / 130) % 2 === 0) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.dir * Math.PI / 2);   // 一律按"朝上"绘制

    // 履带
    ctx.fillStyle = c.track;
    ctx.fillRect(-16, -15, 7, 30);
    ctx.fillRect(9, -15, 7, 30);

    // 履带纹（滚动动画）
    ctx.fillStyle = c.dark;
    var off = this.treadPhase % 6;
    for (var i = 0; i < 5; i++) {
      var ty = -15 + ((i * 6 + off) % 30);
      ctx.fillRect(-16, ty, 7, 2);
      ctx.fillRect(9, ty, 7, 2);
    }

    // 车体
    ctx.fillStyle = c.body;
    ctx.fillRect(-9, -11, 18, 24);

    // 车体高光
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = c.trim;
    ctx.fillRect(-9, -11, 18, 3);
    ctx.fillRect(-9, -11, 3, 24);
    ctx.globalAlpha = 1;

    // 炮塔
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.arc(0, 1, 6.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.arc(0, 1, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // 炮管
    ctx.fillStyle = c.dark;
    ctx.fillRect(-2, -16, 4, 16);

    ctx.restore();

    if (this.shield > 0) drawShield(ctx, this);
  };

  /* ------------------------------------------------------- 绘制小工具 -- */

  function drawShield(ctx, t) {
    var time = performance.now() / 1000;
    var cx = t.x + t.w / 2;
    var cy = t.y + t.h / 2;

    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 14);
    ctx.strokeStyle = '#62d0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#62d0ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function drawSpawn(ctx, t) {
    var p = 1 - TB.clamp(t.spawnTime / (t.spawnDuration || 1), 0, 1);
    var cx = t.x + t.w / 2;
    var cy = t.y + t.h / 2;
    var r = 3 + 15 * p;
    var a = p * Math.PI * 3;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = t.isPlayer ? '#f2c14e' : '#dfe8f5';
    ctx.lineWidth = 2;

    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -r);
      ctx.stroke();
      ctx.rotate(Math.PI / 2);
    }

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* =========================================================== 玩家坦克 = */

  function PlayerTank(game, x, y) {
    Tank.call(this, game, {
      isPlayer: true,
      x: x, y: y,
      dir: TB.UP,
      speed: 108,
      bulletSpeed: 265,
      hp: 1,
      type: 'player',
      colorKey: 'player',
      fireDelay: 0.26,
      spawnTime: 0.8,
      shield: 3
    });

    this.level = 0;
    this.applyLevel();
  }

  PlayerTank.prototype = Object.create(Tank.prototype);
  PlayerTank.prototype.constructor = PlayerTank;

  PlayerTank.prototype.applyLevel = function () {
    this.level = TB.clamp(this.level, 0, 3);
    this.maxBullets = this.level >= 2 ? 2 : 1;
    this.bulletSpeed = this.level >= 1 ? 385 : 265;
    this.power = this.level >= 3;       // 满级子弹能打穿钢墙
  };

  PlayerTank.prototype.upgrade = function () {
    if (this.level >= 3) return false;
    this.level++;
    this.applyLevel();
    return true;
  };

  PlayerTank.prototype.think = function () {
    var input = this.game.input;

    this.wantDir = input.direction();
    this.wantMove = this.wantDir >= 0;

    if (input.held('fire')) this.fire();
  };

  /* =========================================================== 敌方坦克 = */

  function EnemyTank(game, x, y, type, bonus) {
    var st = TB.ENEMY_STATS[type];

    Tank.call(this, game, {
      x: x, y: y,
      dir: TB.DOWN,
      speed: st.speed,
      bulletSpeed: st.bulletSpeed,
      hp: st.hp,
      type: type,
      colorKey: st.color,
      score: st.score,
      fireDelay: 0.4,
      bonus: bonus,
      spawnTime: 1.0
    });

    this.stats = st;
    this.aiTimer = TB.rand(0.2, 0.8);
    this.fireTimer = TB.rand(st.fireDelay[0], st.fireDelay[1]);
    this.maxBullets = type === 'p' ? 2 : 1;

    // 出生时就"锁定猎物"，中途只是偶尔改主意。
    // 如果每帧都重新掷骰子，坦克会在玩家和基地之间反复横跳，变成直冲基地。
    this.huntPlayer = Math.random() < EnemyTank.AGGRESSION[type];
  }

  EnemyTank.prototype = Object.create(Tank.prototype);
  EnemyTank.prototype.constructor = EnemyTank;

  /** 各型号"盯着玩家而不是基地"的概率 */
  EnemyTank.AGGRESSION = { b: 0.62, f: 0.55, p: 0.72, a: 0.66 };

  /** 这只坦克现在盯着谁：玩家还是基地（纯查询，不掷骰子） */
  EnemyTank.prototype.targetPoint = function () {
    var p = this.game.player;

    if (this.huntPlayer && p && !p.dead) {
      var pc = p.center();
      return { x: pc.x, y: pc.y };
    }

    return {
      x: this.game.base.rect.x + this.game.base.rect.w / 2,
      y: this.game.base.rect.y + this.game.base.rect.h / 2
    };
  };

  EnemyTank.prototype.canGo = function (dir) {
    var v = TB.DV[dir];
    return this.canBeAt(this.x + v[0] * 6, this.y + v[1] * 6);
  };

  EnemyTank.prototype.chooseDirection = function (urgent) {
    var back = (this.dir + 2) % 4;
    var dirs = [];
    var d;

    for (d = 0; d < 4; d++) {
      if (d === back) continue;            // 掉头是最后手段
      if (this.canGo(d)) dirs.push(d);
    }

    if (dirs.length === 0) {
      if (this.canGo(back)) this.faceDir(back);
      this.aiTimer = TB.rand(0.3, 0.9);
      return;
    }

    // 还能往前走就大概率继续走，免得在原地抽搐
    if (!urgent && dirs.indexOf(this.dir) >= 0 && Math.random() < 0.62) {
      this.aiTimer = TB.rand(0.5, 1.8);
      // 闲逛时偶尔换个猎物目标，免得一整局只干一件事
      if (Math.random() < 0.25) this.huntPlayer = !this.huntPlayer;
      return;
    }

    var t = this.targetPoint();
    var best = dirs[0];
    var bestScore = -Infinity;

    for (var i = 0; i < dirs.length; i++) {
      var v = TB.DV[dirs[i]];
      var nx = this.x + this.w / 2 + v[0] * 12;
      var ny = this.y + this.h / 2 + v[1] * 12;
      var dist = Math.abs(nx - t.x) + Math.abs(ny - t.y);

      // 目标方向只是"倾向"：随机扰动给得很大，所以大部分时候是在乱逛，
      // 跟原版那种"敌人四处游荡、偶尔直奔老家"的感觉一致
      var score = -dist * 0.55 + TB.rand(0, 460);
      if (dirs[i] === this.dir) score += 40;

      if (score > bestScore) { bestScore = score; best = dirs[i]; }
    }

    this.faceDir(best);
    this.aiTimer = TB.rand(0.6, 2.2);
  };

  /** 炮口是否大致对准了目标 */
  EnemyTank.prototype.alignedWithTarget = function () {
    var t = this.targetPoint();
    var c = this.center();
    var dx = t.x - c.x;
    var dy = t.y - c.y;
    var v = TB.DV[this.dir];

    if (v[1] !== 0) {
      if (Math.abs(dx) > 20) return false;
      return (dy > 0) === (v[1] > 0);
    }

    if (Math.abs(dy) > 20) return false;
    return (dx > 0) === (v[0] > 0);
  };

  EnemyTank.prototype.think = function (dt) {
    this.aiTimer -= dt;
    this.fireTimer -= dt;

    if (this.aiTimer <= 0) this.chooseDirection(false);
    else if (!this.canGo(this.dir)) this.chooseDirection(true);

    this.wantDir = this.dir;
    this.wantMove = true;

    if (this.fireTimer <= 0) {
      if (this.alignedWithTarget() || Math.random() < 0.2) {
        if (this.fire()) {
          this.fireTimer = TB.rand(this.stats.fireDelay[0], this.stats.fireDelay[1]);
        } else {
          this.fireTimer = 0.25;
        }
      } else {
        this.fireTimer = 0.2;
      }
    }
  };

  TB.Tank = Tank;
  TB.PlayerTank = PlayerTank;
  TB.EnemyTank = EnemyTank;

})(window.TB);
