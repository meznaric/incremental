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
        rotX: 0,
        rotY: 0,
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

    for (const p of this.particles) {
      if (p.state === 'flying') {
        const t = Math.max(0, (now - p.spawnT) / FLIGHT_TIME);
        if (t >= 1) {
          this._onArrive(p, now);
        } else {
          const e = easeOutCubic(t);
          p.x = p.slotX;
          p.y = p.spawnY + (p.slotY - p.spawnY) * e;
          p.rotX = now * 2 + p.spin;
          p.rotY = now * 3 + p.spin;
        }
      } else if (p.state === 'settled') {
        p.rotX += dt * 0.3;
        p.rotY += dt * 0.45;
      } else if (p.state === 'streaming') {
        p.y -= this._streamSpeed * dt;
        p.rotX += dt * 2.5;
        p.rotY += dt * 3.5;
        if (p.y < BOTTOM_EXIT_Y) {
          this._release(p);
          this.aliveCount = Math.max(0, this.aliveCount - 1);
        }
      } else if (p.state === 'leaving') {
        p.velY -= OVERFLOW_GRAVITY * dt;
        p.y += p.velY * dt;
        const fallRange = Math.max(0.5, p.leaveStartY - BOTTOM_EXIT_Y);
        p.opacity = Math.max(0, (p.y - BOTTOM_EXIT_Y) / fallRange);
        p.rotX += dt * 2.5;
        p.rotY += dt * 3.5;
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

    this._writeInstances();
  }

  _writeInstances() {
    const im = this.imesh;
    const streamT = Math.max(0, Math.min(1, (this._streamSpeed - CONTINUOUS_FALL_SPEED) / (STREAM_MAX_SPEED - CONTINUOUS_FALL_SPEED)));
    const stretchY = 1 + 2 * streamT;
    for (const p of this.particles) {
      if (p.state === 'idle') {
        im.setMatrixAt(p.index, _hiddenMat);
        continue;
      }
      _pos.set(p.x, p.y, 0);
      _euler.set(p.rotX, p.rotY, 0);
      _quat.setFromEuler(_euler);
      _scl.setScalar(p.scale);
      if (p.state === 'streaming' && stretchY > 1) {
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
      _color.copy(this._periodColor).multiplyScalar(p.opacity);
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
  }

  update(amount, rate, now, dt) {
    const { cols } = decomposeByBase100(amount, COLUMN_COUNT);
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
