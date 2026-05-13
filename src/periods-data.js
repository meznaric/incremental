// Static period table — name, suffix, shape key, color. Kept separate from
// periods.js so non-rendering modules (bignum, save) can use it without
// pulling in the three.js dependency.
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
