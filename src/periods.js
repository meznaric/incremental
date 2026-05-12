import * as THREE from 'three';

export const PERIODS = [
  { name: 'unit',              abbrev: '',     shape: 'sphere',     color: 0xc4cad2 },
  { name: 'thousand',          abbrev: 'k',    shape: 'cube',       color: 0x4ea8ff },
  { name: 'million',           abbrev: 'm',    shape: 'tetra',      color: 0x4cd07d },
  { name: 'billion',           abbrev: 'b',    shape: 'octa',       color: 0xf5d34a },
  { name: 'trillion',          abbrev: 't',    shape: 'dodeca',     color: 0xff8a3a },
  { name: 'quadrillion',       abbrev: 'Qa',   shape: 'icosa',      color: 0xff4a4a },
  { name: 'quintillion',       abbrev: 'Qi',   shape: 'cone',       color: 0xff4ad0 },
  { name: 'sextillion',        abbrev: 'Sx',   shape: 'cylinder',   color: 0xb44aff },
  { name: 'septillion',        abbrev: 'Sp',   shape: 'torus',      color: 0x6a4aff },
  { name: 'octillion',         abbrev: 'Oc',   shape: 'knot',       color: 0x4a8aff },
  { name: 'nonillion',         abbrev: 'No',   shape: 'ring',       color: 0x4adfff },
  { name: 'decillion',         abbrev: 'Dc',   shape: 'prism5',     color: 0x4affb4 },
  { name: 'undecillion',       abbrev: 'UDc',  shape: 'prism6',     color: 0xbeff4a },
  { name: 'duodecillion',      abbrev: 'DDc',  shape: 'prism8',     color: 0xffe14a },
  { name: 'tredecillion',      abbrev: 'TDc',  shape: 'capsule',    color: 0xff7a4a },
  { name: 'quattuordecillion', abbrev: 'QaDc', shape: 'star4',      color: 0xff4a7a },
  { name: 'quindecillion',     abbrev: 'QiDc', shape: 'star5',      color: 0xc8a2ff },
  { name: 'sexdecillion',      abbrev: 'SxDc', shape: 'star6',      color: 0xa2c8ff },
  { name: 'septendecillion',   abbrev: 'SpDc', shape: 'star8',      color: 0xa2ffe1 },
  { name: 'octodecillion',     abbrev: 'OcDc', shape: 'bipyramid',  color: 0xfff5a2 },
  { name: 'novemdecillion',    abbrev: 'NoDc', shape: 'spindle',    color: 0xffb88c },
  { name: 'vigintillion',      abbrev: 'Vi',   shape: 'crown',      color: 0xffffff },
];

const _geoCache = new Map();

function starShape(points, inner = 0.45, outer = 1) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function crownShape() {
  const s = new THREE.Shape();
  const peaks = 5;
  const baseY = -0.4;
  const peakY = 0.7;
  const dipY = 0.1;
  s.moveTo(-1, baseY);
  s.lineTo(1, baseY);
  for (let i = 0; i < peaks; i++) {
    const x0 = 1 - (i / peaks) * 2;
    const x1 = 1 - ((i + 0.5) / peaks) * 2;
    const x2 = 1 - ((i + 1) / peaks) * 2;
    s.lineTo(x0, dipY);
    s.lineTo(x1, peakY);
    s.lineTo(x2, dipY);
  }
  s.lineTo(-1, baseY);
  s.closePath();
  return s;
}

function buildGeometry(key) {
  switch (key) {
    case 'sphere':    return new THREE.SphereGeometry(0.42, 18, 12);
    case 'cube':      return new THREE.BoxGeometry(0.7, 0.7, 0.7);
    case 'tetra':     return new THREE.TetrahedronGeometry(0.55);
    case 'octa':      return new THREE.OctahedronGeometry(0.55);
    case 'dodeca':    return new THREE.DodecahedronGeometry(0.5);
    case 'icosa':     return new THREE.IcosahedronGeometry(0.5);
    case 'cone':      return new THREE.ConeGeometry(0.5, 0.9, 16);
    case 'cylinder':  return new THREE.CylinderGeometry(0.45, 0.45, 0.7, 24);
    case 'torus':     return new THREE.TorusGeometry(0.4, 0.16, 12, 24);
    case 'knot':      return new THREE.TorusKnotGeometry(0.34, 0.12, 80, 12);
    case 'ring': {
      const g = new THREE.RingGeometry(0.28, 0.55, 24);
      g.rotateX(Math.PI / 2);
      return g;
    }
    case 'prism5':    return new THREE.CylinderGeometry(0.5, 0.5, 0.7, 5);
    case 'prism6':    return new THREE.CylinderGeometry(0.5, 0.5, 0.7, 6);
    case 'prism8':    return new THREE.CylinderGeometry(0.5, 0.5, 0.7, 8);
    case 'capsule':   return new THREE.CapsuleGeometry(0.3, 0.5, 6, 12);
    case 'star4':     return new THREE.ExtrudeGeometry(starShape(4, 0.4, 0.55), { depth: 0.2, bevelEnabled: false });
    case 'star5':     return new THREE.ExtrudeGeometry(starShape(5, 0.4, 0.55), { depth: 0.2, bevelEnabled: false });
    case 'star6':     return new THREE.ExtrudeGeometry(starShape(6, 0.4, 0.55), { depth: 0.2, bevelEnabled: false });
    case 'star8':     return new THREE.ExtrudeGeometry(starShape(8, 0.4, 0.55), { depth: 0.2, bevelEnabled: false });
    case 'bipyramid': {
      const g = new THREE.OctahedronGeometry(0.55);
      g.scale(0.7, 1.3, 0.7);
      return g;
    }
    case 'spindle': {
      const g = new THREE.OctahedronGeometry(0.55, 1);
      g.scale(0.55, 1.4, 0.55);
      return g;
    }
    case 'crown':     return new THREE.ExtrudeGeometry(crownShape(), { depth: 0.2, bevelEnabled: false });
    default:          return new THREE.SphereGeometry(0.4, 12, 8);
  }
}

export function geometryFor(periodIndex) {
  const p = PERIODS[periodIndex];
  if (!_geoCache.has(p.shape)) _geoCache.set(p.shape, buildGeometry(p.shape));
  return _geoCache.get(p.shape);
}

const _matCache = new Map();
export function materialFor(periodIndex) {
  if (_matCache.has(periodIndex)) return _matCache.get(periodIndex);
  const p = PERIODS[periodIndex];
  const m = new THREE.MeshStandardMaterial({
    color: p.color,
    emissive: p.color,
    emissiveIntensity: 0.35,
    metalness: 0.35,
    roughness: 0.35,
    flatShading: true,
  });
  _matCache.set(periodIndex, m);
  return m;
}

export function makeGlyph(periodIndex) {
  return new THREE.Mesh(geometryFor(periodIndex), materialFor(periodIndex));
}
