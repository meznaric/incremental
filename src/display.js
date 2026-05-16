import * as THREE from 'three';
import { PERIODS, geometryFor } from './periods.js';
import { decomposeByBase100, periodForBase100 } from './bignum.js';

// SLOT_COUNT must equal the decomposition base (100, see decomposeByBase100)
// so a column visually fills exactly when its value rolls into the next column.
const GRID_W = 5;
const GRID_H = 20;
const SLOT_COUNT = GRID_W * GRID_H;
const CELL_W = 0.55;
const CELL_H = 0.5;
const COLUMN_WIDTH = GRID_W * CELL_W;
const COLUMN_SPACING = COLUMN_WIDTH + 1.6;
const COLUMN_TOP_Y = GRID_H * CELL_H - CELL_H * 0.6;
const COLUMN_BOTTOM_Y = -CELL_H * 0.6;
const SPAWN_DISTANCE = 8.0;
const FLIGHT_TIME = 1.4;
const BOTTOM_EXIT_Y = COLUMN_BOTTOM_Y;
const OVERFLOW_GRAVITY = 14;
const OVERFLOW_INITIAL_VEL = -1.0;
const FLOW_THROUGH_VEL = -3.0;

const POOL_SIZE = 320;
const SPAWN_INTERVAL = 0.025;
const SNAP_BACKLOG = 400;

const CONTINUOUS_FALL_SPEED = 8.5;
const CONTINUOUS_SPAWN_INTERVAL = 0.035;
const RATE_TO_CONTINUOUS = 30;
const RATE_TO_DISCRETE = 18;
const STREAM_MAX_SPEED = 38;
const STREAM_SPEED_LOG_SCALE = 6.5;
const STREAM_MIN_INTERVAL = 0.008;

const COLUMN_COUNT = 5;
const POS_LERP_K = 5.5;
const SCALE_LERP_K = 7;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _color = new THREE.Color();
const _hiddenMat = new THREE.Matrix4().makeScale(0, 0, 0);

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Path curves: map t in [0,1] to a 3D offset (dx, dy, dz) added on top of the
// straight-line spawn->slot interpolation. Each curve fades its swing to 0 at
// t=1 so particles still land exactly in their grid slot. Amplitudes capped at
// ~CELL_W * 2 horizontally and similar in depth so columns stay readable.
// `seed` is per-particle (p.spin); `period` is the column's period index.
const PI2 = Math.PI * 2;
const CURVE_MAX_XY = CELL_W * 2;
const CURVE_MAX_Z = CELL_W * 2;

function curveStraight() {
  return { dx: 0, dy: 0, dz: 0 };
}

function curveSineS(t, seed, period) {
  const fade = Math.sin(Math.PI * t);
  const amp = CELL_W * 0.9;
  return { dx: Math.sin(t * Math.PI + seed * 0.5) * amp * fade, dy: 0, dz: 0 };
}

function curveHelix(t, seed, period) {
  // Spiral around column axis. Higher period = more turns + a bit more depth.
  const turns = 1.5 + Math.min(period, 3) * 0.4;
  const a = t * PI2 * turns + seed;
  const fade = 1 - t;
  const rxy = CELL_W * 0.85 * fade;
  const rz = CELL_W * 0.9 * fade;
  return { dx: Math.cos(a) * rxy, dy: 0, dz: Math.sin(a) * rz };
}

function curveLissajous(t, seed, period) {
  // Figure-8-ish in XZ. Period tilts the frequency ratio.
  const fx = 1 + ((period - 4) % 3) * 0.5;
  const fz = 2 + ((period - 4) % 2);
  const phase = seed * 0.7;
  const fade = Math.sin(Math.PI * t);
  return {
    dx: Math.sin(t * Math.PI * fx + phase) * CELL_W * 1.1 * fade,
    dy: 0,
    dz: Math.sin(t * Math.PI * fz + phase * 1.3) * CELL_W * 1.2 * fade,
  };
}

function curveCone(t, seed, period) {
  // Helix whose radius grows with t (wide at top, narrow at landing).
  const turns = 2 + Math.min(period - 7, 4) * 0.35;
  const a = t * PI2 * turns + seed;
  const r = CELL_W * 1.6 * (1 - t) * (0.4 + (1 - t) * 0.8);
  const rz = CELL_W * 1.6 * (1 - t) * (0.4 + (1 - t) * 0.8);
  return { dx: Math.cos(a) * r, dy: 0, dz: Math.sin(a) * rz };
}

function curveDoubleHelix(t, seed, period) {
  // Two interleaved spirals + depth pulse. Used for the biggest periods.
  const turns = 3 + Math.min(period - 11, 10) * 0.25;
  const a = t * PI2 * turns + seed;
  const wobble = Math.sin(t * Math.PI * 3 + seed);
  const fade = 1 - t * t;
  const ampXY = Math.min(CURVE_MAX_XY, CELL_W * (1.0 + Math.min(period - 11, 8) * 0.08));
  const ampZ = Math.min(CURVE_MAX_Z, CELL_W * (1.1 + Math.min(period - 11, 8) * 0.1));
  return {
    dx: Math.cos(a) * ampXY * fade,
    dy: wobble * 0.18 * fade,
    dz: (Math.sin(a) * 0.85 + Math.cos(a * 0.5) * 0.4) * ampZ * fade,
  };
}

const CURVE_BY_PERIOD = [
  curveStraight,    // 0 unit
  curveSineS,       // 1 thousand
  curveHelix,       // 2 million
  curveHelix,       // 3 billion
  curveLissajous,   // 4 trillion
  curveLissajous,   // 5 quadrillion
  curveLissajous,   // 6 quintillion
  curveCone,        // 7 sextillion
  curveCone,        // 8 septillion
  curveCone,        // 9 octillion
  curveCone,        // 10 nonillion
];

function curveForPeriod(period) {
  if (period < CURVE_BY_PERIOD.length) return CURVE_BY_PERIOD[period];
  return curveDoubleHelix;
}

// Per-period rotation speeds (rad/s) on the three axes. Higher periods spin
// harder on more axes so they look more frantic / dimensional.
function rotSpeedsForPeriod(period) {
  const p = Math.max(0, period);
  return {
    sx: 2.0 + p * 0.12,
    sy: 3.0 + p * 0.18,
    sz: 0.4 + p * 0.22,
  };
}

// Streaming-mode horizontal wobble. Cheap sin of time, scaled by period.
function streamWobbleX(period, now, seed) {
  if (period === 0) return 0;
  const amp = Math.min(CELL_W * 0.6, CELL_W * 0.08 * period);
  const freq = 1.2 + period * 0.08;
  return Math.sin(now * freq + seed) * amp;
}
function streamWobbleZ(period, now, seed) {
  if (period < 2) return 0;
  const amp = Math.min(CELL_W * 0.8, CELL_W * 0.12 * period);
  const freq = 0.9 + period * 0.07;
  return Math.cos(now * freq * 0.85 + seed * 1.3) * amp;
}

function slotPos(slotIndex) {
  const col = slotIndex % GRID_W;
  const row = Math.floor(slotIndex / GRID_W);
  return {
    x: (col - (GRID_W - 1) / 2) * CELL_W,
    y: row * CELL_H,
  };
}

function makeGridOutline(color) {
  const w = COLUMN_WIDTH;
  const points = [
    new THREE.Vector3(-w / 2, COLUMN_BOTTOM_Y, 0),
    new THREE.Vector3(w / 2, COLUMN_BOTTOM_Y, 0),
    new THREE.Vector3(w / 2, COLUMN_TOP_Y, 0),
    new THREE.Vector3(-w / 2, COLUMN_TOP_Y, 0),
    new THREE.Vector3(-w / 2, COLUMN_BOTTOM_Y, 0),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 });
  return new THREE.Line(geo, mat);
}

function makeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.4,
    metalness: 0.35,
    roughness: 0.35,
    flatShading: true,
  });
}

class Column {
  constructor(parent, x) {
    this.root = new THREE.Group();
    this.root.position.x = x;
    this.root.scale.setScalar(0);
    parent.add(this.root);

    this.targetX = x;
    this.scaleTarget = 0;
    this.assigned = false;

    this.outline = makeGridOutline(0x444466);
    this.root.add(this.outline);

    this.material = makeMaterial();
    this.imesh = new THREE.InstancedMesh(geometryFor(0), this.material, POOL_SIZE);
    this.imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.imesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL_SIZE * 3), 3);
    this.imesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    // Per-instance color carries period color × opacity; particles outside the
    // grid still need to render so the instanced mesh can't be frustum-culled
    // against its own (origin-anchored) bounding box.
    this.imesh.frustumCulled = false;
    for (let i = 0; i < POOL_SIZE; i++) this.imesh.setMatrixAt(i, _hiddenMat);
    this.imesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.imesh);

    this._periodColor = new THREE.Color(0xffffff);

    this.particles = [];
    this.freeList = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      this.particles.push({
        index: i,
        state: 'idle',
        spawnT: 0,
        spawnY: 0,
        slotX: 0,
        slotY: 0,
        slotIndex: -1,
        velY: 0,
        leaveStartY: 0,
        leaveT0: 0,
        spin: Math.random() * 6.28,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        scale: 0,
        opacity: 1,
      });
      this.freeList.push(i);
    }

    this.m100 = -1;
    this.period = 0;
    this.rank = 0;
    this.mode = 'discrete';
    this.phase = 'filling';
    this.processed = 0;
    this.cycleSpawnCount = 0;
    this.aliveCount = 0;
    this.lastSpawnT = -10;
    this._rateEstimate = 0;
    this._streamSpeed = CONTINUOUS_FALL_SPEED;
    this._streamInterval = CONTINUOUS_SPAWN_INTERVAL;
    this._curve = curveStraight;
    this._rotSpeeds = rotSpeedsForPeriod(0);
    this._gfx = null;
  }

  animate(dt) {
    const tp = 1 - Math.exp(-dt * POS_LERP_K);
    this.root.position.x += (this.targetX - this.root.position.x) * tp;
    const ts = 1 - Math.exp(-dt * SCALE_LERP_K);
    const s = this.root.scale.x + (this.scaleTarget - this.root.scale.x) * ts;
    this.root.scale.setScalar(s);
  }

  reset() {
    this.m100 = -1;
    this.mode = 'discrete';
    this.phase = 'filling';
    this.processed = 0;
    this.cycleSpawnCount = 0;
    this.aliveCount = 0;
    this._rateEstimate = 0;
    this.freeList.length = 0;
    for (const p of this.particles) {
      p.state = 'idle';
      p.scale = 0;
      p.opacity = 1;
      this.imesh.setMatrixAt(p.index, _hiddenMat);
      this.freeList.push(p.index);
    }
    this.imesh.instanceMatrix.needsUpdate = true;
  }

  _acquire() {
    if (!this.freeList.length) return null;
    return this.particles[this.freeList.pop()];
  }

  _release(p) {
    if (p.state === 'idle') return;
    p.state = 'idle';
    p.scale = 0;
    p.opacity = 1;
    p.z = 0;
    p.rotZ = 0;
    this.freeList.push(p.index);
  }

  _styleParticle(p) {
    p.scale = 0.32 + this.rank * 0.08;
    p.opacity = 1;
  }

  _spawnDiscrete(now) {
    const p = this._acquire();
    if (!p) return false;
    this._styleParticle(p);
    p.slotIndex = this.cycleSpawnCount;
    const slot = slotPos(p.slotIndex);
    p.slotX = slot.x;
    p.slotY = slot.y;
    p.spawnY = Math.min(slot.y + SPAWN_DISTANCE, COLUMN_TOP_Y);
    p.spawnT = now;
    p.x = slot.x;
    p.y = p.spawnY;
    p.z = 0;
    p.state = 'flying';
    this.cycleSpawnCount++;
    this.processed++;
    this.aliveCount++;
    this.lastSpawnT = now;
    if (this.cycleSpawnCount >= SLOT_COUNT) {
      this._beginDrain(now);
    }
    return true;
  }

  _spawnContinuous(now) {
    const p = this._acquire();
    if (!p) return false;
    this._styleParticle(p);
    const x = (Math.random() - 0.5) * COLUMN_WIDTH * 0.85;
    p.slotX = x;
    p.slotY = 0;
    p.spawnY = COLUMN_TOP_Y;
    p.spawnT = now;
    p.x = x;
    p.y = p.spawnY;
    p.z = 0;
    p.velY = -this._streamSpeed;
    p.state = 'streaming';
    this.aliveCount++;
    this.lastSpawnT = now;
    return true;
  }

  _beginDrain(now) {
    this.phase = 'draining';
    for (const p of this.particles) {
      if (p.state === 'settled') {
        p.state = 'leaving';
        p.leaveT0 = now;
        p.leaveStartY = p.y;
        p.velY = OVERFLOW_INITIAL_VEL + (Math.random() - 0.5) * 0.6;
      }
    }
  }

  _onArrive(p, now) {
    p.x = p.slotX;
    p.y = p.slotY;
    p.z = 0;
    if (this.mode === 'discrete' && this.phase === 'filling') {
      p.state = 'settled';
    } else {
      p.state = 'leaving';
      p.leaveT0 = now;
      p.leaveStartY = p.slotY;
      p.velY = FLOW_THROUGH_VEL;
    }
  }

  _snapHard(amount, now) {
    const target = Math.floor(amount / this._magFactor);
    this.processed = target;
    this.cycleSpawnCount = target % SLOT_COUNT;
    this.aliveCount = this.cycleSpawnCount;
    this.phase = 'filling';
    this.lastSpawnT = now - SPAWN_INTERVAL;
    this.freeList.length = 0;
    for (const p of this.particles) {
      p.state = 'idle';
      p.scale = 0;
      p.opacity = 1;
      this.freeList.push(p.index);
    }
    for (let i = 0; i < this.cycleSpawnCount; i++) {
      const p = this._acquire();
      if (!p) break;
      this._styleParticle(p);
      const slot = slotPos(i);
      p.slotX = slot.x;
      p.slotY = slot.y;
      p.slotIndex = i;
      p.x = slot.x;
      p.y = slot.y;
      p.z = 0;
      p.state = 'settled';
    }
  }

  _snapSmooth(amount, now) {
    const target = Math.floor(amount / this._magFactor);
    this.processed = target;
    this.cycleSpawnCount = target % SLOT_COUNT;
    this.phase = 'filling';
    this.lastSpawnT = now;

    const occupied = new Set();
    for (const p of this.particles) {
      if (p.state === 'settled' || p.state === 'flying') {
        if (p.slotIndex >= this.cycleSpawnCount) {
          p.state = 'leaving';
          p.leaveT0 = now;
          p.leaveStartY = p.y;
          p.velY = OVERFLOW_INITIAL_VEL + (Math.random() - 0.5) * 0.6;
        } else {
          occupied.add(p.slotIndex);
        }
      } else if (p.state === 'streaming') {
        p.state = 'leaving';
        p.leaveT0 = now;
        p.leaveStartY = p.y;
      }
    }

    for (let i = 0; i < this.cycleSpawnCount; i++) {
      if (occupied.has(i)) continue;
      const p = this._acquire();
      if (!p) break;
      this._styleParticle(p);
      p.slotIndex = i;
      const slot = slotPos(i);
      p.slotX = slot.x;
      p.slotY = slot.y;
      p.spawnY = Math.min(slot.y + SPAWN_DISTANCE, COLUMN_TOP_Y);
      p.spawnT = now + Math.random() * 0.2;
      p.x = slot.x;
      p.y = p.spawnY;
      p.z = 0;
      p.state = 'flying';
      this.aliveCount++;
    }
  }

  _enterContinuous(now) {
    this.mode = 'continuous';
    this.phase = 'filling';
    this.cycleSpawnCount = 0;
    for (const p of this.particles) {
      if (p.state === 'settled') {
        p.state = 'leaving';
        p.leaveT0 = now;
        p.leaveStartY = p.y;
        p.velY = OVERFLOW_INITIAL_VEL + (Math.random() - 0.5) * 0.6;
      }
    }
  }

  _exitContinuous(amount, now) {
    this.mode = 'discrete';
    this._snapSmooth(amount, now);
  }

  // Gamble result FX: capture every alive particle as part of this column's
  // contribution to the centre-bound swarm. Each tagged particle stores a
  // randomised orbit angle + outward direction so phase 2/3 reads as a live
  // cloud, not a parallel sheet. We resolve the world attractor into this
  // column's local frame so the per-instance write can stay cheap.
  triggerGambleFx(now, durationMs, attractorWorld, won) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    // Local attractor: undo this column's root position + scale. Scale is
    // usually 1 when the column is fully shown; guard against the tiny-scale
    // edge case so we don't divide by zero during fade-out.
    const sx = this.root.scale.x || 1;
    const ax = (attractorWorld.x - this.root.position.x) / sx;
    const ay = (attractorWorld.y - this.root.position.y) / sx;
    const az = (attractorWorld.z - this.root.position.z) / sx;
    const tagged = [];
    for (const p of this.particles) {
      if (p.state === 'idle') continue;
      p._gfxOrigX = p.x;
      p._gfxOrigY = p.y;
      p._gfxOrigZ = p.z || 0;
      p._gfxAngle = Math.random() * Math.PI * 2;
      p._gfxOrbit = 0.18 + Math.random() * 0.35;
      // Outward direction for phase 3 — slight randomisation so the swarm
      // doesn't collapse into a single line on release.
      const a = Math.random() * Math.PI * 2;
      p._gfxOutX = Math.cos(a);
      p._gfxOutY = won ? Math.sin(a) * 0.9 : -0.6 - Math.random() * 0.5;
      p._gfxOutZ = Math.sin(a) * 0.6;
      p._gfxActive = true;
      tagged.push(p);
    }
    this._gfx = {
      startedAt: now,
      durationS: durationMs / 1000,
      ax, ay, az,
      won,
      tagged,
    };
  }

  _clearGambleFx() {
    if (!this._gfx) return;
    for (const p of this._gfx.tagged) {
      if (p._gfxActive) {
        p._gfxActive = false;
        // Particles that rode the effect are "spent" — release them so the
        // column's normal spawn loop can replenish without snap-back.
        if (p.state !== 'idle') {
          this._release(p);
          this.aliveCount = Math.max(0, this.aliveCount - 1);
        }
      }
    }
    this._gfx = null;
  }

  assignMagnitude(m100, amount, now) {
    this.m100 = m100;
    this._magFactor = Math.pow(100, m100);
    const pr = periodForBase100(m100);
    this.period = pr.period;
    this.rank = pr.rank;
    const pDef = PERIODS[Math.min(this.period, PERIODS.length - 1)];
    this.outline.material.color.setHex(pDef.color);
    this._periodColor.setHex(pDef.color);
    this.imesh.geometry = geometryFor(this.period);
    this._curve = curveForPeriod(this.period);
    this._rotSpeeds = rotSpeedsForPeriod(this.period);
    this.mode = 'discrete';
    this._rateEstimate = 0;
    this._snapHard(amount, now);
  }

  update(now, dt, amount, rate) {
    if (this.m100 < 0) return;
    // Skip the entire column update when it's effectively invisible (fading
    // out and already tiny). assignMagnitude will repaint instances when the
    // column is brought back to life.
    if (this.scaleTarget < 0.02 && this.root.scale.x < 0.02) return;

    const target = Math.floor(amount / this._magFactor);
    const localRate = (rate || 0) / this._magFactor;
    this._rateEstimate = this._rateEstimate * 0.85 + localRate * 0.15;

    if (this.mode === 'discrete' && this._rateEstimate > RATE_TO_CONTINUOUS) {
      this._enterContinuous(now);
    } else if (this.mode === 'continuous' && this._rateEstimate < RATE_TO_DISCRETE) {
      this._exitContinuous(amount, now);
    }

    if (this.mode === 'continuous') {
      const over = Math.max(1, this._rateEstimate / RATE_TO_CONTINUOUS);
      this._streamSpeed = Math.min(STREAM_MAX_SPEED, CONTINUOUS_FALL_SPEED + Math.log10(over) * STREAM_SPEED_LOG_SCALE);
      this._streamInterval = Math.max(STREAM_MIN_INTERVAL, CONTINUOUS_SPAWN_INTERVAL * (CONTINUOUS_FALL_SPEED / this._streamSpeed));
    }

    const backlog = target - this.processed;

    if (this.mode === 'discrete') {
      if (backlog > SNAP_BACKLOG || backlog < 0) {
        this._snapSmooth(amount, now);
      } else if (this.phase === 'filling' && this.processed < target && (now - this.lastSpawnT) >= SPAWN_INTERVAL) {
        this._spawnDiscrete(now);
      }
    } else {
      this.processed = target;
      if ((now - this.lastSpawnT) >= this._streamInterval) {
        this._spawnContinuous(now);
      }
    }

    const curve = this._curve || curveStraight;
    const rs = this._rotSpeeds || rotSpeedsForPeriod(this.period);
    const periodIdx = this.period;
    for (const p of this.particles) {
      if (p.state === 'flying') {
        const t = Math.max(0, (now - p.spawnT) / FLIGHT_TIME);
        if (t >= 1) {
          this._onArrive(p, now);
        } else {
          const e = easeOutCubic(t);
          const baseY = p.spawnY + (p.slotY - p.spawnY) * e;
          const o = curve(e, p.spin, periodIdx);
          p.x = p.slotX + o.dx;
          p.y = baseY + o.dy;
          p.z = o.dz;
          p.rotX = now * rs.sx + p.spin;
          p.rotY = now * rs.sy + p.spin * 0.7;
          p.rotZ = now * rs.sz + p.spin * 0.4;
        }
      } else if (p.state === 'settled') {
        p.rotX += dt * 0.3;
        p.rotY += dt * 0.45;
        p.rotZ += dt * 0.2;
      } else if (p.state === 'streaming') {
        p.y -= this._streamSpeed * dt;
        p.x = p.slotX + streamWobbleX(periodIdx, now, p.spin);
        p.z = streamWobbleZ(periodIdx, now, p.spin);
        p.rotX += dt * rs.sx;
        p.rotY += dt * rs.sy;
        p.rotZ += dt * rs.sz;
        if (p.y < BOTTOM_EXIT_Y) {
          this._release(p);
          this.aliveCount = Math.max(0, this.aliveCount - 1);
        }
      } else if (p.state === 'leaving') {
        p.velY -= OVERFLOW_GRAVITY * dt;
        p.y += p.velY * dt;
        const fallRange = Math.max(0.5, p.leaveStartY - BOTTOM_EXIT_Y);
        p.opacity = Math.max(0, (p.y - BOTTOM_EXIT_Y) / fallRange);
        p.rotX += dt * (rs.sx * 0.9);
        p.rotY += dt * (rs.sy * 0.9);
        p.rotZ += dt * (rs.sz * 0.9);
        if (p.y < BOTTOM_EXIT_Y) {
          this._release(p);
          this.aliveCount = Math.max(0, this.aliveCount - 1);
        }
      }
    }

    if (this.mode === 'discrete' && this.phase === 'draining') {
      let stillActive = false;
      for (const p of this.particles) {
        if (p.state !== 'idle') {
          stillActive = true;
          break;
        }
      }
      if (!stillActive) {
        this.phase = 'filling';
        this.cycleSpawnCount = 0;
        this.aliveCount = 0;
      }
    }

    this._writeInstances(now);
  }

  _writeInstances(now) {
    const im = this.imesh;
    const streamT = Math.max(0, Math.min(1, (this._streamSpeed - CONTINUOUS_FALL_SPEED) / (STREAM_MAX_SPEED - CONTINUOUS_FALL_SPEED)));
    const stretchY = 1 + 2 * streamT;
    const gfx = this._gfx;
    let gfxT = 0;
    if (gfx) {
      gfxT = (now - gfx.startedAt) / gfx.durationS;
      if (gfxT >= 1) { this._clearGambleFx(); }
    }
    for (const p of this.particles) {
      if (p.state === 'idle') {
        im.setMatrixAt(p.index, _hiddenMat);
        continue;
      }
      let px = p.x, py = p.y, pz = p.z || 0;
      let opacity = p.opacity;
      let tintR = 1, tintG = 1, tintB = 1;
      if (this._gfx && p._gfxActive) {
        const t = Math.max(0, Math.min(1, (now - this._gfx.startedAt) / this._gfx.durationS));
        const ax = this._gfx.ax, ay = this._gfx.ay, az = this._gfx.az;
        if (t < 0.35) {
          // Phase 1: smooth curve to centre. easeInOutCubic on the blend so
          // it eases in (lets the column motion read for a beat) then snaps
          // toward the attractor.
          const e = easeInOutCubic(t / 0.35);
          px = p._gfxOrigX + (ax - p._gfxOrigX) * e;
          py = p._gfxOrigY + (ay - p._gfxOrigY) * e;
          pz = p._gfxOrigZ + (az - p._gfxOrigZ) * e;
        } else if (t < 0.60) {
          // Phase 2: hold with tight orbit + jitter. Orbits in local XZ
          // around the attractor so the cloud breathes without dispersing.
          const u = (t - 0.35) / 0.25;
          const a = p._gfxAngle + u * Math.PI * 2 * 0.6;
          const r = p._gfxOrbit * (0.7 + 0.3 * Math.sin(u * Math.PI));
          px = ax + Math.cos(a) * r;
          py = ay + Math.sin(u * Math.PI * 2) * 0.08;
          pz = az + Math.sin(a) * r;
        } else {
          // Phase 3: outward release. Linear distance ramp × ease so it
          // accelerates; loss case biases downward via p._gfxOutY.
          const u = (t - 0.60) / 0.40;
          const e = easeOutCubic(u) * (this._gfx.won ? 9 : 7);
          px = ax + p._gfxOutX * e;
          py = ay + p._gfxOutY * e;
          pz = az + p._gfxOutZ * e;
          // Fade fully to 0 over phase 3, weighted so most of the fade lands
          // in the second half — the particles travel visibly before dissolving.
          opacity = p.opacity * Math.max(0, 1 - Math.pow(u, 1.6));
        }
        if (this._gfx.won) {
          // Green tint that grows as we approach centre, then explodes.
          const k = t < 0.6 ? t / 0.6 : 1;
          tintR = 1 - 0.5 * k;
          tintG = 1 + 0.6 * k;
          tintB = 1 - 0.2 * k;
        } else {
          // Loss: dim + desaturate (multiplicative, single tint factor).
          const k = t < 0.6 ? t / 0.6 : 1;
          const dim = 1 - 0.55 * k;
          tintR = dim;
          tintG = dim * 0.85;
          tintB = dim * 0.9;
        }
      }
      _pos.set(px, py, pz);
      _euler.set(p.rotX, p.rotY, p.rotZ || 0);
      _quat.setFromEuler(_euler);
      _scl.setScalar(p.scale);
      // Streaming stretch reads as motion blur along the column's fall axis;
      // suppress it during the attractor pull so centre-bound particles look
      // like deliberate orbs, not motion-blurred streaks.
      if (!p._gfxActive && p.state === 'streaming' && stretchY > 1) {
        // Stretch along world Y (fall axis) after rotation so column footprint stays at p.scale.
        _mat.compose(_pos, _quat, _scl);
        _mat.elements[1] *= stretchY;
        _mat.elements[5] *= stretchY;
        _mat.elements[9] *= stretchY;
      } else {
        _mat.compose(_pos, _quat, _scl);
      }
      im.setMatrixAt(p.index, _mat);
      // Bake opacity into the per-instance color. Against the dark fog
      // background this fades particles to invisible without needing a
      // per-instance alpha attribute (which InstancedMesh doesn't ship).
      _color.copy(this._periodColor).multiplyScalar(opacity);
      _color.r *= tintR; _color.g *= tintG; _color.b *= tintB;
      im.setColorAt(p.index, _color);
    }
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  }
}

export class MagnitudeDisplay {
  constructor() {
    this.group = new THREE.Group();
    this.columns = [];
    for (let i = 0; i < COLUMN_COUNT; i++) {
      this.columns.push(new Column(this.group, 0));
    }
    this.visibleColumns = COLUMN_COUNT;
  }

  setVisibleColumns(n) {
    const clamped = Math.max(1, Math.min(COLUMN_COUNT, n | 0));
    this.visibleColumns = clamped;
  }

  // Pull every alive particle across every column toward `attractorWorld`,
  // hold, then disperse. `attractorWorld` is a THREE.Vector3-ish world-space
  // point (typically screen-centre unprojected onto z=0). Reduced-motion is
  // the caller's call — main.js can skip this entirely.
  triggerGambleFx({ won, durationMs, attractorWorld, now }) {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const col of this.columns) {
      if (col.m100 < 0 || !col.assigned) continue;
      col.triggerGambleFx(now, durationMs, attractorWorld, won);
    }
  }

  update(amount, rate, now, dt) {
    const { cols } = decomposeByBase100(amount, this.visibleColumns);
    const desired = cols.map((c) => c.m).filter((m) => m >= 0);
    const desiredSet = new Set(desired);

    for (const col of this.columns) {
      if (col.assigned && !desiredSet.has(col.m100)) {
        col.assigned = false;
        col.scaleTarget = 0;
      }
    }

    const byM = new Map();
    for (const col of this.columns) {
      if (col.m100 >= 0) byM.set(col.m100, col);
    }

    const positioned = [];
    const freshAssigns = [];
    for (const m of desired) {
      let col = byM.get(m);
      if (col) {
        col.assigned = true;
        col.scaleTarget = 1;
      } else {
        col = this.columns.find((c) => c.m100 < 0 && !c.assigned);
        if (!col) col = this.columns.find((c) => !c.assigned);
        if (!col) continue;
        col.assigned = true;
        col.scaleTarget = 1;
        freshAssigns.push({ col, m });
      }
      positioned.push(col);
    }

    const n = positioned.length;
    for (let i = 0; i < n; i++) {
      positioned[i].targetX = (i - (n - 1) / 2) * COLUMN_SPACING;
    }

    for (const { col, m } of freshAssigns) {
      if (col.root.scale.x < 0.1) col.root.position.x = col.targetX;
      col.assignMagnitude(m, amount, now);
    }

    for (const col of this.columns) {
      if (col.m100 >= 0) col.update(now, dt, amount, rate);
      col.animate(dt);
      if (!col.assigned && col.root.scale.x < 0.02 && col.m100 >= 0) {
        col.reset();
      }
    }
  }
}
