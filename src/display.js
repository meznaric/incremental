import * as THREE from 'three';
import { PERIODS, geometryFor } from './periods.js';
import { decomposeByBase100, periodForBase100 } from './bignum.js';

const GRID_W = 5;
const GRID_H = 20;
const SLOT_COUNT = GRID_W * GRID_H;
const CELL_W = 0.55;
const CELL_H = 0.5;
const COLUMN_WIDTH = GRID_W * CELL_W;
const COLUMN_SPACING = COLUMN_WIDTH + 1.6;
const SPAWN_DISTANCE = 8.0;
const FLIGHT_TIME = 1.4;
const BOTTOM_EXIT_Y = -3.0;
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

function formatRate(r) {
  if (r < 1000) return `${r.toFixed(0)}/s`;
  if (r < 1e6) return `${(r / 1000).toFixed(1)}k/s`;
  if (r < 1e9) return `${(r / 1e6).toFixed(1)}M/s`;
  return `${(r / 1e9).toFixed(1)}B/s`;
}

function makeLabel(text, color = 0x8a8ac0, fontSize = 22) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.6, 0.65, 1);
  sprite.userData = { canvas, ctx, tex, fontSize };
  return sprite;
}

function updateLabel(sprite, text, color) {
  const { canvas, ctx, tex, fontSize } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, 128, 32);
  tex.needsUpdate = true;
}

function makeGridOutline(color) {
  const w = COLUMN_WIDTH;
  const h = GRID_H * CELL_H;
  const bottom = -CELL_H * 0.6;
  const top = h - CELL_H * 0.6;
  const points = [
    new THREE.Vector3(-w / 2, bottom, 0),
    new THREE.Vector3(w / 2, bottom, 0),
    new THREE.Vector3(w / 2, top, 0),
    new THREE.Vector3(-w / 2, top, 0),
    new THREE.Vector3(-w / 2, bottom, 0),
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
    transparent: true,
    opacity: 1,
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

    this.particles = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = makeMaterial();
      const mesh = new THREE.Mesh(geometryFor(0), mat);
      mesh.visible = false;
      this.root.add(mesh);
      this.particles.push({
        mesh,
        mat,
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
      });
    }

    this.tagLabel = makeLabel('', 0xaaaacc, 22);
    this.tagLabel.position.y = -1.6;
    this.root.add(this.tagLabel);
    this.valueLabel = makeLabel('', 0xffffff, 30);
    this.valueLabel.position.y = -2.3;
    this.root.add(this.valueLabel);

    this.m100 = -1;
    this.period = 0;
    this.rank = 0;
    this.mode = 'discrete';
    this.phase = 'filling';
    this.processed = 0;
    this.cycleSpawnCount = 0;
    this.aliveCount = 0;
    this.lastSpawnT = -10;
    this._lastTarget = 0;
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
    this._lastTarget = 0;
    this._rateEstimate = 0;
    for (const p of this.particles) {
      p.state = 'idle';
      p.mesh.visible = false;
      p.mat.opacity = 1;
    }
  }

  _styleParticle(p) {
    const pDef = PERIODS[Math.min(this.period, PERIODS.length - 1)];
    p.mat.color.setHex(pDef.color);
    p.mat.emissive.setHex(pDef.color);
    p.mat.opacity = 1;
    p.mesh.geometry = geometryFor(this.period);
    p.mesh.scale.setScalar(0.32 + this.rank * 0.08);
  }

  _findIdle() {
    for (const p of this.particles) if (p.state === 'idle') return p;
    return null;
  }

  _spawnDiscrete(now) {
    const p = this._findIdle();
    if (!p) return false;
    this._styleParticle(p);
    p.slotIndex = this.cycleSpawnCount;
    const slot = slotPos(p.slotIndex);
    p.slotX = slot.x;
    p.slotY = slot.y;
    p.spawnY = slot.y + SPAWN_DISTANCE;
    p.spawnT = now;
    p.mesh.position.set(slot.x, p.spawnY, 0);
    p.mesh.visible = true;
    p.mat.opacity = 1;
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
    const p = this._findIdle();
    if (!p) return false;
    this._styleParticle(p);
    const x = (Math.random() - 0.5) * COLUMN_WIDTH * 0.85;
    p.slotX = x;
    p.slotY = 0;
    p.spawnY = (GRID_H - 1) * CELL_H + SPAWN_DISTANCE;
    p.spawnT = now;
    p.mesh.position.set(x, p.spawnY, 0);
    p.mesh.visible = true;
    p.mat.opacity = 1;
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
        p.leaveStartY = p.mesh.position.y;
        p.velY = OVERFLOW_INITIAL_VEL + (Math.random() - 0.5) * 0.6;
      }
    }
  }

  _onArrive(p, now) {
    p.mesh.position.set(p.slotX, p.slotY, 0);
    if (this.mode === 'discrete' && this.phase === 'filling') {
      p.state = 'settled';
    } else {
      p.state = 'leaving';
      p.leaveT0 = now;
      p.leaveStartY = p.slotY;
      p.velY = FLOW_THROUGH_VEL;
    }
  }

  _snapTo(amount, now) {
    const target = Math.floor(amount / Math.pow(100, this.m100));
    this.processed = target;
    this.cycleSpawnCount = target % SLOT_COUNT;
    this.aliveCount = this.cycleSpawnCount;
    this.phase = 'filling';
    this.lastSpawnT = now - SPAWN_INTERVAL;
    for (const p of this.particles) {
      p.state = 'idle';
      p.mesh.visible = false;
      p.mat.opacity = 1;
    }
    for (let i = 0; i < this.cycleSpawnCount; i++) {
      const p = this._findIdle();
      if (!p) break;
      this._styleParticle(p);
      const slot = slotPos(i);
      p.slotX = slot.x;
      p.slotY = slot.y;
      p.slotIndex = i;
      p.mesh.position.set(slot.x, slot.y, 0);
      p.mesh.visible = true;
      p.state = 'settled';
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
        p.leaveStartY = p.mesh.position.y;
        p.velY = OVERFLOW_INITIAL_VEL + (Math.random() - 0.5) * 0.6;
      }
    }
  }

  _exitContinuous(amount, now) {
    this.mode = 'discrete';
    this._snapTo(amount, now);
  }

  assignMagnitude(m100, amount, now) {
    this.m100 = m100;
    const pr = periodForBase100(m100);
    this.period = pr.period;
    this.rank = pr.rank;
    const pDef = PERIODS[Math.min(this.period, PERIODS.length - 1)];
    this.outline.material.color.setHex(pDef.color);
    this.mode = 'discrete';
    this._lastTarget = Math.floor(amount / Math.pow(100, m100));
    this._rateEstimate = 0;
    this._snapTo(amount, now);
  }

  update(now, dt, amount) {
    if (this.m100 < 0) return;
    const target = Math.floor(amount / Math.pow(100, this.m100));

    const inst = Math.max(0, target - this._lastTarget) / Math.max(dt, 0.0001);
    this._rateEstimate = this._rateEstimate * 0.92 + inst * 0.08;
    this._lastTarget = target;

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
        this._snapTo(amount, now);
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
        const t = (now - p.spawnT) / FLIGHT_TIME;
        if (t >= 1) {
          this._onArrive(p, now);
        } else {
          const e = easeOutCubic(t);
          p.mesh.position.set(p.slotX, p.spawnY + (p.slotY - p.spawnY) * e, 0);
          p.mesh.rotation.x = now * 2 + p.spin;
          p.mesh.rotation.y = now * 3 + p.spin;
        }
      } else if (p.state === 'settled') {
        p.mesh.rotation.x += dt * 0.3;
        p.mesh.rotation.y += dt * 0.45;
      } else if (p.state === 'streaming') {
        p.mesh.position.y -= this._streamSpeed * dt;
        p.mesh.rotation.x += dt * 2.5;
        p.mesh.rotation.y += dt * 3.5;
        if (p.mesh.position.y < BOTTOM_EXIT_Y) {
          p.state = 'idle';
          p.mesh.visible = false;
          this.aliveCount = Math.max(0, this.aliveCount - 1);
        }
      } else if (p.state === 'leaving') {
        p.velY -= OVERFLOW_GRAVITY * dt;
        p.mesh.position.y += p.velY * dt;
        const fallRange = Math.max(0.5, p.leaveStartY - BOTTOM_EXIT_Y);
        p.mat.opacity = Math.max(0, (p.mesh.position.y - BOTTOM_EXIT_Y) / fallRange);
        p.mesh.rotation.x += dt * 2.5;
        p.mesh.rotation.y += dt * 3.5;
        if (p.mesh.position.y < BOTTOM_EXIT_Y) {
          p.state = 'idle';
          p.mesh.visible = false;
          p.mat.opacity = 1;
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

    const pDef = PERIODS[Math.min(this.period, PERIODS.length - 1)];
    const lo = 2 * this.m100;
    const hi = lo + 1;
    updateLabel(this.tagLabel, `10^${lo}–10^${hi}  ${pDef.abbrev || 'u'}`, pDef.color);
    if (this.mode === 'continuous') {
      updateLabel(this.valueLabel, `≈ ${formatRate(this._rateEstimate)}`, 0xffaa44);
    } else {
      updateLabel(this.valueLabel, `${this.aliveCount.toString().padStart(2, '0')}`, 0xffffff);
    }
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

  update(amount, now, dt) {
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
      if (col.m100 >= 0) col.update(now, dt, amount);
      col.animate(dt);
      if (!col.assigned && col.root.scale.x < 0.02 && col.m100 >= 0) {
        col.reset();
      }
    }
  }
}
