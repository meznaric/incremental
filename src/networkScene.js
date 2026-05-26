// 3D Seed Relay network. Replaces the old SVG hex map with a three.js scene:
// transparent hex prisms floating above a slowly-rotating low-detail Milky Way
// galaxy, relays rendered as antenna stalks with tier-coded height and rings,
// cluster beams between adjacent online relays.
//
// Public surface:
//   makeNetworkScene({ canvas, getState, onSelect, onTapEmpty })
//     .open()        — attach pointer listeners, start render loop
//     .close()       — stop render loop, detach listeners
//     .resize()      — call when the parent element resizes
//     .refresh()     — re-sync hex/relay objects to current state.network
//     .setSelection({ kind, id?, q?, r?, pending? })
//     .focusHex(q, r)
//     .dispose()
//
// The pure logic stays in network.js — this file only reads state and renders.

import * as THREE from 'three';
import {
  SECTORS, getHexes, hexCenter, hexDistance, adjacentOnlineCount,
} from './network.js';

// Geometry — keep these in one block; tuning is "edit and see."
const HEX_R = 1.0;                   // cell pitch (center-to-corner of the layout grid)
const HEX_INSET = 0.06;              // shrink the rendered prism so adjacent
                                     // transparent faces don't share an edge —
                                     // z-fights make it look like the cells
                                     // are punching through each other.
const HEX_THICKNESS = 1.2;           // prism height. Tall enough that the
                                     // relay structure renders INSIDE the
                                     // cell, not perched on top of it.
const RELAY_STALK_BASE = 0.32;       // common-tier stalk height (kept under
                                     // HEX_THICKNESS so it fits inside).
const RELAY_STALK_PER_TIER = 0.16;   // added height per rarity step. Mythic
                                     // ends at 0.32 + 4*0.16 = 0.96 ≤ 1.2.
const TIER_RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };
const TIER_CORE_R = { common: 0.07, uncommon: 0.09, rare: 0.12, legendary: 0.14, mythic: 0.17 };
const ISOLATED_PULSE_PERIOD = 3.2;   // seconds between bleed pulses
const MAX_PIXEL_RATIO = 1.5;
const DRAG_THRESHOLD_PX = 8;
const CAMERA_PAN_LERP_MS = 280;      // camera target animation on tap-to-focus
const PAN_RUBBER_BAND_FACTOR = 1.6;  // allow drag overshoot up to this × panRadius
                                     // before the hard clamp catches; on release
                                     // we animate back inside panRadius.

// Linear 0..1 from a sector's discoveryMul. Drives edge-glow brightness AND
// the floor-halo intensity so high-risk sectors visibly glow.
function discFraction(sector) {
  const min = 0.2, max = 5.0;
  return Math.max(0, Math.min(1, (sector.discoveryMul - min) / (max - min)));
}

// A round soft sprite — used for the relay core glow, halos, and pulses. One
// canvas, many sprites: cheaper than per-sprite gradient textures.
function makeSoftDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

// A thin glow line texture for the cluster beams.
function makeBeamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,224,130,1)');
  g.addColorStop(0.4, 'rgba(255,224,130,0.5)');
  g.addColorStop(1, 'rgba(255,224,130,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

// Mini Milky Way — a flat spiral disk that sits directly under the hex grid
// so the player sees galactic arms and the warm core through the transparent
// hex prisms. Sized to match the grid's footprint (hex layout spans ~9 units
// from origin to outer ring corner). Stationary — no rotation, so the grid
// reads as suspended in a fixed-in-place galaxy.
function buildGalaxy(dotTex) {
  const group = new THREE.Group();
  const N = 2800;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const arms = 4;
  const armSpread = 0.55;
  const galaxyR = 12;   // matches the hex grid's outer reach
  for (let i = 0; i < N; i++) {
    // Density biased toward the core — denser middle, sparse outskirts.
    const t = Math.pow(Math.random(), 1.6);
    const r = t * galaxyR;
    const arm = Math.floor(Math.random() * arms);
    const baseAngle = (arm / arms) * Math.PI * 2;
    const armTwist = r * 0.32;
    const spread = (Math.random() - 0.5) * armSpread * (1 + r * 0.06);
    const angle = baseAngle + armTwist + spread;
    // Disk is essentially flat — tiny vertical jitter so points don't all
    // collapse onto a single plane (would z-fight with the hex halo sprites).
    const y = (Math.random() - 0.5) * 0.04;
    positions[i * 3 + 0] = Math.cos(angle) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * r;
    const u = r / galaxyR;
    colors[i * 3 + 0] = 1.0 - u * 0.55;
    colors[i * 3 + 1] = 0.85 - u * 0.45;
    colors[i * 3 + 2] = 0.55 + u * 0.35;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.16,
    map: dotTex,
    transparent: true,
    opacity: 0.85,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  group.add(points);

  // Warm glowing core sprite at the galactic centre.
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTex,
    color: 0xffd8a0,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  core.scale.set(5, 5, 1);
  group.add(core);

  // Just below the hex floor — close enough that the hex transparency reads
  // the galaxy through it, far enough that the floor halos don't z-fight.
  group.position.y = -0.12;
  return { group, points };
}

// Procedural Milky Way skybox — generates a 2:1 panoramic canvas with a dense
// star sprinkle plus a brighter galactic band running diagonally. The sphere
// is rendered with BackSide and ignores fog so it always reads as the deep
// background, no matter how far the camera pans.
function makeSkyboxTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Deep base colour.
  ctx.fillStyle = '#04060e';
  ctx.fillRect(0, 0, c.width, c.height);

  // Galactic band — a soft glow stripe running diagonally so the camera sees
  // the Milky Way "edge-on" no matter which way the player pans.
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-0.18);
  const bandW = c.height * 0.36;
  const bandGrad = ctx.createLinearGradient(0, -bandW, 0, bandW);
  bandGrad.addColorStop(0,    'rgba(60, 50, 120, 0)');
  bandGrad.addColorStop(0.45, 'rgba(150, 120, 200, 0.20)');
  bandGrad.addColorStop(0.55, 'rgba(180, 150, 220, 0.22)');
  bandGrad.addColorStop(1,    'rgba(60, 50, 120, 0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(-c.width, -bandW, c.width * 2, bandW * 2);

  // Bright bulge near one end of the band — the galactic core viewed from afar.
  const bulge = ctx.createRadialGradient(-300, 0, 0, -300, 0, 280);
  bulge.addColorStop(0,   'rgba(255, 220, 160, 0.55)');
  bulge.addColorStop(0.4, 'rgba(220, 180, 130, 0.20)');
  bulge.addColorStop(1,   'rgba(220, 180, 130, 0)');
  ctx.fillStyle = bulge;
  ctx.fillRect(-c.width, -c.height, c.width * 2, c.height * 2);

  // Dust lane — a thin darker streak through the band centre.
  const dust = ctx.createLinearGradient(0, -20, 0, 20);
  dust.addColorStop(0,   'rgba(0, 0, 0, 0)');
  dust.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
  dust.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = dust;
  ctx.fillRect(-c.width, -22, c.width * 2, 44);
  ctx.restore();

  // Stars — denser inside the band, sparser outside.
  const total = 7000;
  for (let i = 0; i < total; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    // Distance to the rotated band centre.
    const dx = x - c.width / 2;
    const dy = y - c.height / 2;
    const rot = -0.18;
    const yp = -dx * Math.sin(rot) + dy * Math.cos(rot);
    const inBand = Math.exp(-(yp * yp) / (180 * 180));
    if (Math.random() > 0.18 + inBand * 0.8) continue;
    const size = Math.random() < 0.92 ? 0.7 + Math.random() * 0.6 : 1.1 + Math.random() * 1.0;
    const b = 0.35 + Math.random() * 0.6;
    const r = 215 + Math.floor(Math.random() * 40);
    const g = 215 + Math.floor(Math.random() * 40);
    const bl = 230 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgba(${r},${g},${bl},${b})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSkybox(tex) {
  // Equirectangular texture wrapped around a sphere viewed from the inside.
  const geo = new THREE.SphereGeometry(180, 32, 18);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------

export function makeNetworkScene({ canvas, getState, onSelect }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060e, 0.012);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);

  // Ambient soft, hemi for sky/ground tint.
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const hemi = new THREE.HemisphereLight(0x88a0ff, 0x101020, 0.55);
  scene.add(hemi);
  const key = new THREE.PointLight(0xffd8a0, 0.6, 60);
  key.position.set(6, 12, 4);
  scene.add(key);

  // Textures shared by sprites.
  const dotTex = makeSoftDot();
  const beamTex = makeBeamTexture();

  // Skybox = "outside the Milky Way" — a panoramic procedural starfield with
  // a brighter galactic band. Sphere rendered BackSide, ignores fog, so it
  // stays put as the player pans the camera target across the grid.
  const skybox = buildSkybox(makeSkyboxTexture());
  scene.add(skybox);
  // Local galaxy disk — small spiral ring just outside the hex grid, rotates
  // gently so the network reads as suspended inside a living structure.
  const galaxy = buildGalaxy(dotTex);
  scene.add(galaxy.group);

  // Hex layer
  const hexLayer = new THREE.Group();
  scene.add(hexLayer);
  const hexEntries = new Map(); // 'q,r' → { group, mesh, edge, sector, basePos }
  const hexPickables = [];      // meshes we raycast

  // Relay layer (rebuilt per refresh, since relays come and go)
  const relayLayer = new THREE.Group();
  scene.add(relayLayer);
  const relayEntries = new Map(); // id → { group, top, beam, rings, isolated, tier, hex, ripening }
  const relayPickables = [];

  // Edges (cluster beams)
  const edgeLayer = new THREE.Group();
  scene.add(edgeLayer);
  let edgeMeshes = [];

  // Selection halo + ghost relay (pending placement)
  const selectGroup = new THREE.Group();
  scene.add(selectGroup);
  let selectionHalo = null;
  let pendingGhost = null;

  // Build hexes once at boot. Hex grid is deterministic — same hexes every run.
  buildHexGrid();

  // AOE-style camera: fixed angle looking down at the hex plane. Drag
  // translates the target across the plane; pinch / wheel zooms. The angle
  // never changes — same view every gesture.
  //
  // pitch is measured from the y axis (0 = looking straight down, π/2 = at
  // the horizon). 30° from the y axis ⇒ 60° from horizontal — the canonical
  // RTS isometric-feel angle.
  const cam = {
    target: new THREE.Vector3(0, 0, 0),
    radius: 14,
    pitch: Math.PI / 6,             // 30° from straight-down = 60° from horizon
    azimuth: -Math.PI / 2,          // viewing direction in the xz plane
    minRadius: 8,
    maxRadius: 26,
    // panRadius is the snap-back boundary (just past the outer hex ring);
    // PAN_RUBBER_BAND_FACTOR is how far past that the player may drag before
    // the hard limit kicks in. Release inside panRadius = stays put. Release
    // outside = focusOn() animates back to the nearest in-bounds point.
    panRadius: 9,
  };
  applyCamera();

  // Tap-to-focus camera animation.
  let camAnim = null;  // { startX, startZ, endX, endZ, t0 }
  // Track the hex currently nearest the camera target so we can fire a
  // selection event each time the centered cell changes (panning auto-selects).
  let centeredKey = null;

  // Live render-loop state.
  let raf = 0;
  let lastT = 0;
  let running = false;
  let needsResize = true;

  // Local cache so we don't allocate vectors per frame.
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _ndc = new THREE.Vector2();
  const _raycaster = new THREE.Raycaster();

  // Selection state lives outside, mirrored here so update() can grow halos.
  let selection = { kind: null }; // {kind:'relay', id} | {kind:'hex',q,r} | {kind:'pending',q,r,tier}

  function applyCamera() {
    // Hard clamp at the rubber-band limit so the camera can't escape into
    // deep space; the in-bounds snap-back happens on drag release in
    // snapBackToBounds().
    const hardLimit = cam.panRadius * PAN_RUBBER_BAND_FACTOR;
    const tx = Math.max(-hardLimit, Math.min(hardLimit, cam.target.x));
    const tz = Math.max(-hardLimit, Math.min(hardLimit, cam.target.z));
    cam.target.set(tx, 0, tz);
    const sinP = Math.sin(cam.pitch);
    const cosP = Math.cos(cam.pitch);
    camera.position.set(
      cam.target.x + cam.radius * sinP * Math.cos(cam.azimuth),
      cam.target.y + cam.radius * cosP,
      cam.target.z + cam.radius * sinP * Math.sin(cam.azimuth)
    );
    camera.lookAt(cam.target);
  }

  // After a drag ends past the play area, animate back inside panRadius.
  // Nudges target toward the closest in-bounds point.
  function snapBackToBounds() {
    const tx = Math.max(-cam.panRadius, Math.min(cam.panRadius, cam.target.x));
    const tz = Math.max(-cam.panRadius, Math.min(cam.panRadius, cam.target.z));
    if (Math.abs(tx - cam.target.x) > 0.001 || Math.abs(tz - cam.target.z) > 0.001) {
      focusOn(tx, tz);
    }
  }

  // Show only cells the player cares about: any cell hosting a relay, plus
  // the cell currently under the camera (pan focus), plus any staged
  // placement. Empty/unfocused cells keep their pickable mesh but render
  // invisible — the grid reads as "what you've built", not a flat plate.
  // Cheap enough (≤ 91 hexes) to call every frame; called from tick() so
  // visibility tracks the camera target without waiting for a state refresh.
  function updateHexVisibility() {
    const state = getState();
    const net = state && state.network;
    const relays = (net && net.relays) || [];
    const occupiedKeys = new Set();
    for (const r of relays) occupiedKeys.add(`${r.hex.q},${r.hex.r}`);
    const visibleKeys = new Set(occupiedKeys);
    if (centeredKey) visibleKeys.add(centeredKey);
    if (selection && (selection.kind === 'pending' || selection.kind === 'hex')) {
      visibleKeys.add(`${selection.q},${selection.r}`);
    }
    for (const [key, entry] of hexEntries.entries()) {
      const show = visibleKeys.has(key);
      entry.mesh.visible = show;
      entry.halo.visible = occupiedKeys.has(key);
      // Edges always draw. Active cells get full sector glow; empty cells
      // keep a faint trace so the grid bounds are legible.
      entry.edge.material.opacity = show
        ? entry.edgeActiveOpacity
        : entry.edgeActiveOpacity * 0.18;
    }
  }

  // Find the hex whose center is closest to (x, z) — used by both pan-auto-
  // select (target → centered cell) and tap-to-focus (raycast → animate).
  function nearestHexKey(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const [key, entry] of hexEntries.entries()) {
      const dx = entry.basePos.x - x;
      const dz = entry.basePos.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = key; }
    }
    return best;
  }

  // Re-emit a selection event when the cell under the camera target changes.
  // Skipped while the player is dragging an existing selection (relay or
  // pending placement) so we don't overwrite their explicit choice. The
  // owner's handleSelect picks an occupied hex's relay automatically.
  function checkCenteredSelection() {
    const key = nearestHexKey(cam.target.x, cam.target.z);
    if (key === centeredKey) return;
    centeredKey = key;
    if (!onSelect || !key) return;
    const [q, r] = key.split(',').map(Number);
    // via: 'pan' tells the owner this is a passive preview from panning —
    // skip side effects like staging a placement on every cell crossed.
    onSelect({ kind: 'hex', q, r, via: 'pan' });
  }

  // Animate cam.target toward (x, z). Lerp over CAMERA_PAN_LERP_MS, then snap.
  function focusOn(x, z) {
    camAnim = {
      startX: cam.target.x, startZ: cam.target.z,
      endX: Math.max(-cam.panRadius, Math.min(cam.panRadius, x)),
      endZ: Math.max(-cam.panRadius, Math.min(cam.panRadius, z)),
      t0: performance.now(),
    };
  }

  // Convert a screen-space delta (pixels) to a world-space pan delta in the
  // y=0 plane. Used so drag distance matches finger movement at the current
  // zoom + pitch.
  function screenDeltaToWorldPan(dxPx, dyPx) {
    const rect = canvas.getBoundingClientRect();
    const h = Math.max(1, rect.height);
    // Vertical extent of the y=0 plane visible at the target's depth.
    const planeDistance = cam.radius;
    const worldH = 2 * planeDistance * Math.tan((camera.fov * Math.PI / 180) / 2);
    const worldPerPixelV = worldH / h;
    // Screen y maps to ground "forward" (along -azimuth) scaled by 1/cos(pitch).
    // Tilted camera: a screen-y pixel covers more ground than a screen-x pixel.
    const forward = (dyPx) * worldPerPixelV / Math.max(0.001, Math.cos(cam.pitch));
    const right   = (dxPx) * worldPerPixelV;
    // azimuth points the camera in xz plane. Right = perpendicular to azimuth.
    const cosA = Math.cos(cam.azimuth);
    const sinA = Math.sin(cam.azimuth);
    // Camera looks toward target; "right" in world = +90° from azimuth in xz.
    const rx = -sinA, rz = cosA;
    const fx = cosA,  fz = sinA;
    return {
      dx: right * rx + forward * fx,
      dz: right * rz + forward * fz,
    };
  }

  function buildHexGrid() {
    // Pointy-top hex prism — CylinderGeometry with 6 radial segments. The
    // default first vertex is at +z (pointy-top in z direction) which already
    // matches the hexCenter layout formula. No additional rotation: rotating
    // by π/6 would swap vertices with edges, making adjacent cells overlap
    // since the layout pitch (R√3) only fits true pointy-top hexes.
    // Inset slightly so transparent edges don't share lines and z-fight.
    const renderR = HEX_R - HEX_INSET;
    const hexGeo = new THREE.CylinderGeometry(renderR, renderR, HEX_THICKNESS, 6, 1, false);
    const edgeGeoSrc = new THREE.EdgesGeometry(hexGeo);

    for (const h of getHexes()) {
      const sector = SECTORS[h.sector] || SECTORS.frontier;
      const { x, y: z } = hexCenter(h.q, h.r, HEX_R);

      // Hex face — transparent sector tint. Centered around y=0 so the prism
      // straddles the hex plane; the relay's "in-cell" content also sits at
      // y=0 in the group origin so it renders inside the volume.
      const faceMat = new THREE.MeshBasicMaterial({
        color: sector.color,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(hexGeo, faceMat);
      mesh.position.set(x, 0, z);
      mesh.userData = { kind: 'hex', q: h.q, r: h.r, sector: h.sector };
      hexLayer.add(mesh);
      hexPickables.push(mesh);

      // Glowing edge — same color, higher alpha. Brightness driven by disc mul
      // (set on the material color, so we can dim/brighten per-state too).
      // We track the bright "active" opacity here so updateHexVisibility can
      // switch between full-strength (occupied / focused) and a faint trace
      // opacity (empty cells) — the faint state gives the player a sense of
      // the grid's bounds without filling the map with chrome.
      const edgeActiveOpacity = 0.45 + 0.45 * discFraction(sector);
      const edgeMat = new THREE.LineBasicMaterial({
        color: sector.color,
        transparent: true,
        opacity: edgeActiveOpacity,
        depthWrite: false,
      });
      const edge = new THREE.LineSegments(edgeGeoSrc, edgeMat);
      edge.position.copy(mesh.position);
      hexLayer.add(edge);

      // Risk halo — sector-tinted floor wash beneath the prism. Only shown
      // when the cell is otherwise visible (relay placed or active focus).
      const haloSize = HEX_R * (1.05 + 0.45 * discFraction(sector));
      const haloMat = new THREE.SpriteMaterial({
        map: dotTex,
        color: sector.color,
        transparent: true,
        opacity: 0.10 + 0.20 * discFraction(sector),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(haloSize * 2.4, haloSize * 2.4, 1);
      halo.position.set(x, -HEX_THICKNESS / 2 + 0.01, z);
      hexLayer.add(halo);

      // Mesh + halo start hidden; refresh() turns these on per-frame for
      // occupied / centered / staged cells. The edge stays visible always —
      // faded for empty cells so the player can read the network's bounds,
      // brightened when the cell is "active". Mesh is still pickable while
      // invisible because raycaster doesn't filter on .visible.
      mesh.visible = false;
      halo.visible = false;
      edge.material.opacity = edgeActiveOpacity * 0.18;

      hexEntries.set(`${h.q},${h.r}`, {
        mesh, edge, halo, sector: h.sector,
        edgeActiveOpacity,
        basePos: new THREE.Vector3(x, 0, z),
      });
    }
  }

  // Rebuild dynamic objects (relays + cluster edges + ghost) from state.
  function refresh(now) {
    const state = getState();
    const net = state && state.network;
    const relays = (net && net.relays) || [];
    const seen = new Set();

    updateHexVisibility();

    for (const r of relays) {
      seen.add(r.id);
      const entry = relayEntries.get(r.id);
      const expectedRipening = now < r.ripensAt;
      const adj = adjacentOnlineCount(net, r, now);
      const expectedIsolated = !expectedRipening && adj === 0;
      // Recreate if status changed materially — cheaper than mutating
      // half a dozen materials and rebuilding rings count etc.
      if (!entry || entry.ripening !== expectedRipening || entry.isolated !== expectedIsolated || entry.tier !== r.tier) {
        if (entry) {
          relayLayer.remove(entry.group);
          disposeGroup(entry.group);
          const idx = relayPickables.indexOf(entry.hit);
          if (idx >= 0) relayPickables.splice(idx, 1);
        }
        const built = buildRelay(r, expectedRipening, expectedIsolated, now);
        relayLayer.add(built.group);
        if (built.hit) relayPickables.push(built.hit);
        relayEntries.set(r.id, built);
      } else {
        // Same shape — only progress changes. Update ripening fill if any.
        const e = relayEntries.get(r.id);
        if (e.ripening && e.fill) {
          const total = Math.max(0.001, r.ripensAt - r.plantedAt);
          const pct = Math.max(0, Math.min(1, (now - r.plantedAt) / total));
          e.fill.scale.y = Math.max(0.0001, pct);
          e.fill.position.y = e.stalkBaseY + (e.stalkHeight * pct) / 2;
        }
      }
    }
    // Remove relays that no longer exist (ComDef pulled them).
    for (const [id, e] of relayEntries.entries()) {
      if (seen.has(id)) continue;
      relayLayer.remove(e.group);
      disposeGroup(e.group);
      const idx = relayPickables.indexOf(e.hit);
      if (idx >= 0) relayPickables.splice(idx, 1);
      relayEntries.delete(id);
    }

    // Cluster edges — rebuilt each refresh. Cheap: O(n²) for ≤ MAP_RADIUS hexes.
    for (const m of edgeMeshes) { edgeLayer.remove(m); disposeGroup(m); }
    edgeMeshes = [];
    for (let i = 0; i < relays.length; i++) {
      const a = relays[i];
      if (now < a.ripensAt) continue;
      const ae = relayEntries.get(a.id);
      if (!ae) continue;
      for (let j = i + 1; j < relays.length; j++) {
        const b = relays[j];
        if (now < b.ripensAt) continue;
        if (hexDistance(a.hex, b.hex) !== 1) continue;
        const be = relayEntries.get(b.id);
        if (!be) continue;
        const beam = buildBeam(ae.topWorld, be.topWorld);
        edgeLayer.add(beam);
        edgeMeshes.push(beam);
      }
    }

    rebuildSelection(now);
  }

  function disposeGroup(g) {
    g.traverse?.((c) => {
      if (c.geometry && c.geometry.dispose) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose && m.dispose());
        else if (c.material.dispose) c.material.dispose();
      }
    });
  }

  function buildRelay(relay, ripening, isolated, now) {
    const hex = hexEntries.get(`${relay.hex.q},${relay.hex.r}`);
    const base = hex ? hex.basePos : new THREE.Vector3();
    const sector = SECTORS[relay.sector] || SECTORS.frontier;
    const tierRank = TIER_RANK[relay.tier] || 0;
    const stalkHeight = RELAY_STALK_BASE + tierRank * RELAY_STALK_PER_TIER;
    // The hex prism spans y ∈ [-HEX_THICKNESS/2, +HEX_THICKNESS/2] (centered
    // at the hex base). All relay content lives in that volume — the stalk
    // rises from the floor and the core orb sits below the ceiling.
    const floorY = -HEX_THICKNESS / 2;

    const group = new THREE.Group();
    group.position.set(base.x, 0, base.z);

    // Stalk — thin cylinder rising from the prism floor.
    const stalkRadius = 0.05 + tierRank * 0.014;
    const stalkColor = ripening ? 0xc084fc : (isolated ? 0x2dd4ff : sector.color);
    const stalkOpacity = ripening ? 0.35 : 0.6;
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(stalkRadius, stalkRadius * 1.4, stalkHeight, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: stalkColor,
        transparent: true,
        opacity: stalkOpacity,
        depthWrite: false,
      }),
    );
    stalk.position.y = floorY + stalkHeight / 2;
    group.add(stalk);

    // Ripening fill — opaque inner cylinder that climbs the stalk as it ripens.
    let fill = null;
    const stalkBaseY = floorY;
    if (ripening) {
      fill = new THREE.Mesh(
        new THREE.CylinderGeometry(stalkRadius * 0.7, stalkRadius * 1.0, stalkHeight, 8, 1, false),
        new THREE.MeshBasicMaterial({
          color: 0xc084fc,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      const total = Math.max(0.001, relay.ripensAt - relay.plantedAt);
      const pct = Math.max(0, Math.min(1, (now - relay.plantedAt) / total));
      fill.scale.y = Math.max(0.0001, pct);
      fill.position.y = floorY + (stalkHeight * pct) / 2;
      group.add(fill);
    }

    // Rarity rings — small horizontal rings spaced along the stalk.
    const ringCount = tierRank + 1;
    const rings = [];
    for (let i = 0; i < ringCount; i++) {
      const ringR = 0.18 + tierRank * 0.030;
      const y = floorY + stalkHeight * (0.25 + 0.55 * (i / Math.max(1, ringCount)));
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, 0.014, 6, 24),
        new THREE.MeshBasicMaterial({
          color: ripening ? 0x9b6cf0 : (isolated ? 0x2dd4ff : sector.color),
          transparent: true,
          opacity: ripening ? 0.5 : 0.85,
          depthWrite: false,
        }),
      );
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      rings.push(ring);
    }

    // Core orb at the tip of the stalk — glowing sprite.
    const coreSize = TIER_CORE_R[relay.tier] || TIER_CORE_R.common;
    const coreColor = ripening ? 0xc084fc : (isolated ? 0x6ee7ff : 0xffd86b);
    const topY = floorY + stalkHeight + coreSize * 1.1;
    const top = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex,
      color: coreColor,
      transparent: true,
      opacity: ripening ? 0.6 : 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    top.scale.set(coreSize * 8, coreSize * 8, 1);
    top.position.y = topY;
    group.add(top);

    // Picking proxy — fills the prism volume so taps anywhere on the cell
    // (or its glowing contents) register on the relay rather than the hex.
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, HEX_THICKNESS, 8, 1),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = 0;
    hit.userData = { kind: 'relay', id: relay.id };
    group.add(hit);

    // Isolated bleed pulse — additive sprite that grows/fades on a period.
    // Sits at the prism floor so the pulse "spreads out" beneath the cell.
    let pulse = null;
    if (isolated) {
      pulse = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex,
        color: 0x6ee7ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      pulse.scale.set(0.5, 0.5, 1);
      pulse.position.y = floorY + 0.04;
      group.add(pulse);
    }

    // Inner glow — soft additive column wrapping the stalk so the relay's
    // activity feels "alive inside the cell" rather than just a thin pole.
    let beam = null;
    if (!ripening) {
      beam = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex,
        color: isolated ? 0x6ee7ff : 0xffd86b,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      beam.scale.set(0.42, stalkHeight * 0.9, 1);
      beam.position.y = floorY + stalkHeight / 2;
      group.add(beam);
    }

    // World position of the top orb — used by cluster beams. Local + base.
    const topWorld = new THREE.Vector3(base.x, topY, base.z);

    return {
      group, top, beam, rings, fill, pulse, hit,
      ripening, isolated, tier: relay.tier,
      sector: relay.sector, q: relay.hex.q, r: relay.hex.r,
      stalkHeight, stalkBaseY,
      topWorld,
      _pulsePhase: Math.random() * ISOLATED_PULSE_PERIOD,
    };
  }

  // Cluster beam — a thin additive sprite stretched between the two endpoints.
  // Using sprites instead of LineBasic for the glow. The sprite's position is
  // the midpoint and its scale.y is the length.
  function buildBeam(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, len, 6, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffd86b,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    // Orient cylinder along the segment (default cylinder axis is +y).
    const dir = b.clone().sub(a).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    beam.quaternion.setFromUnitVectors(up, dir);
    beam.position.copy(mid);
    return beam;
  }

  function rebuildSelection(now) {
    // Tear down prior halo + ghost.
    if (selectionHalo) { selectGroup.remove(selectionHalo); disposeGroup(selectionHalo); selectionHalo = null; }
    if (pendingGhost)  { selectGroup.remove(pendingGhost);  disposeGroup(pendingGhost);  pendingGhost = null; }
    if (!selection || !selection.kind) return;

    let hex = null;
    if (selection.kind === 'hex' || selection.kind === 'pending') {
      hex = hexEntries.get(`${selection.q},${selection.r}`);
    } else if (selection.kind === 'relay') {
      const e = relayEntries.get(selection.id);
      if (e) hex = hexEntries.get(`${e.q},${e.r}`);
    }
    if (!hex) return;

    // Halo ring — TorusGeometry hugging the hex outline.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(HEX_R * 0.94, 0.05, 8, 32),
      new THREE.MeshBasicMaterial({
        color: selection.kind === 'pending' ? 0xffe082 : 0x2dd4ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(hex.basePos);
    halo.position.y += HEX_THICKNESS / 2 + 0.04;
    halo.rotation.x = Math.PI / 2;
    halo.userData = { animate: 'halo', t: 0 };
    selectGroup.add(halo);
    selectionHalo = halo;

    // Pending placement: ghost relay preview at this hex.
    if (selection.kind === 'pending' && selection.tier) {
      const fakeRelay = {
        id: '__ghost__', tier: selection.tier, hex: { q: selection.q, r: selection.r },
        plantedAt: now, ripensAt: now + 1,
        baseYield: 0, sector: selection.q !== undefined ? hex.sector : 'frontier',
      };
      const built = buildRelay(fakeRelay, false, false, now);
      // Make every material translucent + warm.
      built.group.traverse((c) => {
        if (c.material && c.material.opacity !== undefined) {
          c.material.opacity = Math.min(c.material.opacity, 0.55);
          if (c.material.color) c.material.color = new THREE.Color(0xffe082);
        }
      });
      pendingGhost = built.group;
      selectGroup.add(pendingGhost);
    }
  }

  // ------------------- input + interaction --------------------

  // Pinch/drag state.
  const pointers = new Map();
  let dragState = null;
  let pinchState = null;
  let suppressTapUntil = 0;

  function onPointerDown(e) {
    if (e.target !== canvas) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 1) return;
      pinchState = {
        startDist: dist,
        baseRadius: cam.radius,
      };
      dragState = null;
    } else {
      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        baseTargetX: cam.target.x, baseTargetZ: cam.target.z,
        active: false,
        downAt: performance.now(),
      };
    }
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchState && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 1) return;
      const ratio = pinchState.startDist / dist;
      cam.radius = Math.max(cam.minRadius, Math.min(cam.maxRadius, pinchState.baseRadius * ratio));
      applyCamera();
      return;
    }
    if (dragState && e.pointerId === dragState.pointerId) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.active && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragState.active = true;
      // Drag-the-world feel (Google Maps / piece of paper on a desk): the
      // point under the finger follows the finger. Counter-intuitive sign:
      // we ADD pan.dx / pan.dz (positive finger delta → positive target
      // delta) because this scene's camera basis maps screen-right to world
      // -X and screen-up to world +Z (lookAt with azimuth -π/2 builds the
      // local axes that way). Moving the camera target in world +X makes
      // the existing world content shift RIGHT on screen, and so on. The
      // `-dy` flip on Y is because screen-Y grows downward but the world
      // forward axis (+Z) corresponds to screen-up.
      const pan = screenDeltaToWorldPan(dx, -dy);
      cam.target.x = dragState.baseTargetX + pan.dx;
      cam.target.z = dragState.baseTargetZ + pan.dz;
      // Manual drag overrides any in-flight focus animation.
      camAnim = null;
      applyCamera();
      checkCenteredSelection();
    }
  }
  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinchState) {
      suppressTapUntil = performance.now() + 350;
      if (pointers.size < 2) {
        pinchState = null;
        if (pointers.size === 1) {
          const [id] = [...pointers.keys()];
          const p = pointers.get(id);
          dragState = {
            pointerId: id,
            startX: p.x, startY: p.y,
            baseTargetX: cam.target.x, baseTargetZ: cam.target.z,
            active: false,
            downAt: performance.now(),
          };
        }
      }
      return;
    }
    if (dragState && e.pointerId === dragState.pointerId) {
      const wasActive = dragState.active;
      const ds = dragState;
      dragState = null;
      if (wasActive) {
        suppressTapUntil = performance.now() + 100;
        // If the player overshot the play area while dragging, animate the
        // target back inside panRadius.
        snapBackToBounds();
        return;
      }
      if (performance.now() < suppressTapUntil) return;
      // Treat as tap — raycast.
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      _ndc.set(nx, ny);
      _raycaster.setFromCamera(_ndc, camera);
      // Relays first (smaller targets above hex), then hexes.
      let pick = _raycaster.intersectObjects(relayPickables, false)[0];
      if (!pick) pick = _raycaster.intersectObjects(hexPickables, false)[0];
      if (!pick) {
        if (onSelect) onSelect({ kind: 'empty-space' });
        return;
      }
      // Tap commits a selection. Also pan the camera onto the tapped cell so
      // the AOE-style "centered = focused" reading holds. The pan-watcher in
      // the tick loop uses via:'pan' for its updates, so the tap-tagged
      // event below is what triggers placement-staging on the owner side.
      const ud = pick.object.userData || {};
      if (ud.kind === 'relay') {
        const e2 = relayEntries.get(ud.id);
        if (e2) {
          focusOn(e2.topWorld.x, e2.topWorld.z);
          // Pre-seat centeredKey so the in-flight pan animation doesn't
          // re-fire a pan selection for the same hex.
          centeredKey = `${e2.q},${e2.r}`;
        }
        if (onSelect) onSelect({ kind: 'relay', id: ud.id, via: 'tap' });
      } else if (ud.kind === 'hex') {
        const hex = hexEntries.get(`${ud.q},${ud.r}`);
        if (hex) {
          focusOn(hex.basePos.x, hex.basePos.z);
          centeredKey = `${ud.q},${ud.r}`;
        }
        if (onSelect) onSelect({ kind: 'hex', q: ud.q, r: ud.r, via: 'tap' });
      }
    }
  }
  function onWheel(e) {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0012);
    cam.radius = Math.max(cam.minRadius, Math.min(cam.maxRadius, cam.radius * factor));
    applyCamera();
  }
  function onContextMenu(e) { e.preventDefault(); }

  function attachListeners() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
  }
  function detachListeners() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
  }

  // ------------------- render loop --------------------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    needsResize = false;
  }

  function tick(t) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (needsResize) resize();
    const ts = t / 1000;
    const dt = lastT > 0 ? Math.min(0.1, ts - lastT) : 0;
    lastT = ts;

    // Camera focus animation — lerp target toward camAnim.end with ease-out.
    if (camAnim) {
      const elapsed = t - camAnim.t0;
      const u = Math.min(1, elapsed / CAMERA_PAN_LERP_MS);
      const eased = 1 - Math.pow(1 - u, 3);
      cam.target.x = camAnim.startX + (camAnim.endX - camAnim.startX) * eased;
      cam.target.z = camAnim.startZ + (camAnim.endZ - camAnim.startZ) * eased;
      applyCamera();
      checkCenteredSelection();
      if (u >= 1) camAnim = null;
    }

    // Backdrop is fully static — the mini galaxy stays put beneath the grid
    // and the skybox stays fixed relative to the world so panning doesn't
    // make the stars appear to drift unnaturally.

    // Cheap per-frame visibility toggle. centeredKey moves with the camera
    // target, so cells fade in / out as the player pans without waiting for
    // a state refresh.
    updateHexVisibility();

    // Relay animations.
    for (const e of relayEntries.values()) {
      // Pulse the top orb for online relays.
      if (e.top && !e.ripening) {
        const s = 1 + Math.sin(ts * 2.2 + e.q * 0.7 + e.r * 0.3) * 0.08;
        const base = (TIER_CORE_R[e.tier] || 0.07) * 8;
        e.top.scale.set(base * s, base * s, 1);
      }
      if (e.beam && !e.ripening) {
        e.beam.material.opacity = 0.45 + 0.18 * (0.5 + 0.5 * Math.sin(ts * 1.6 + e.q));
      }
      // Isolated bleed: grow + fade pulse on a period.
      if (e.pulse) {
        e._pulsePhase += dt;
        if (e._pulsePhase > ISOLATED_PULSE_PERIOD) e._pulsePhase -= ISOLATED_PULSE_PERIOD;
        const p = e._pulsePhase / ISOLATED_PULSE_PERIOD;
        const size = 0.4 + p * 2.4;
        e.pulse.scale.set(size, size, 1);
        e.pulse.material.opacity = (1 - p) * 0.55;
      }
    }

    // Selection halo: gentle pulse + small lift.
    if (selectionHalo) {
      selectionHalo.userData.t += dt;
      const p = 0.5 + 0.5 * Math.sin(selectionHalo.userData.t * 3);
      selectionHalo.material.opacity = 0.55 + p * 0.4;
      selectionHalo.scale.set(1 + p * 0.05, 1 + p * 0.05, 1);
    }

    renderer.render(scene, camera);
  }

  function open() {
    if (running) return;
    running = true;
    needsResize = true;
    lastT = 0;
    // Seed the centered-cell tracker with whatever the target sits over so
    // the first auto-select fires when the player actually moves, not on
    // open. The owner already pushes any explicit prior selection separately.
    centeredKey = nearestHexKey(cam.target.x, cam.target.z);
    attachListeners();
    raf = requestAnimationFrame(tick);
  }
  function close() {
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    detachListeners();
  }

  function focusHex(q, r) {
    const hex = hexEntries.get(`${q},${r}`);
    if (!hex) return;
    focusOn(hex.basePos.x, hex.basePos.z);
  }

  function setSelection(sel, now) {
    selection = sel || { kind: null };
    rebuildSelection(now || (Date.now() / 1000));
  }

  function dispose() {
    close();
    disposeGroup(scene);
    renderer.dispose();
  }

  return {
    open, close, refresh, resize, setSelection, focusHex, dispose,
    get running() { return running; },
  };
}
