// Signal Diagnostic — decompose effectiveRate(state, now) into named rows so
// the player can see where Echoes/s comes from.
//
// Pure logic, no DOM. Keeps strict parity with src/shop.js effectiveRate():
//
//   rate = (basePerSecond + flatBonus) * permMul
//        * (rateMul buff product)
//        * (compound buff product at t=now)
//        * memoryFactor
//        ; then if ascentExp > 0 and rate > 1: rate = rate ^ (1 + ascentExp)
//
// Each row returns { kind, label, op, factor, note }. Kinds:
//   'base'    — additive baseline before any multiplier
//   'mul'     — multiplicative factor
//   'exp'     — exponent applied to the running rate
//   'total'   — final rate after everything
// `op` is the display operator for the leftmost column ('+ /s', '×', '^', '=').

const MEMORY_PER_SHARD = 0.10; // mirror of contactLog.ECHO_MEMORY_PER_SHARD

function activeRateMul(buffs, now) {
  let p = 1;
  let n = 0;
  for (const b of buffs.rateMul || []) {
    if (now < b.expiresAt) { p *= b.value; n++; }
  }
  return { factor: p, count: n };
}

function activeCompound(buffs, now) {
  let p = 1;
  let n = 0;
  for (const b of buffs.compound || []) {
    if (now >= b.startedAt && now < b.expiresAt) {
      p *= Math.pow(1 + b.rate, now - b.startedAt);
      n++;
    }
  }
  return { factor: p, count: n };
}

export function breakdownRate(state, now) {
  const rows = [];
  const base = (state.basePerSecond || 0) + (state.flatBonus || 0);
  rows.push({
    kind: 'base',
    label: 'Base listening yield',
    op: '+ /s',
    factor: base,
    note: state.flatBonus > 0
      ? `${state.basePerSecond || 0} core · +${state.flatBonus} from patched relays`
      : null,
  });

  const permMul = state.permMul || 1;
  if (permMul !== 1) {
    rows.push({
      kind: 'mul',
      label: 'Decode efficiency',
      op: '×',
      factor: permMul,
      note: 'Every decode upgrade ever cut into the stack',
    });
  }

  const rateMul = activeRateMul(state.buffs || {}, now);
  if (rateMul.count > 0) {
    rows.push({
      kind: 'mul',
      label: rateMul.count === 1 ? 'Carrier window' : `Carrier windows (${rateMul.count})`,
      op: '×',
      factor: rateMul.factor,
      note: 'Temporary atmospheric or orbital boost',
    });
  }

  const compound = activeCompound(state.buffs || {}, now);
  if (compound.count > 0) {
    rows.push({
      kind: 'mul',
      label: compound.count === 1 ? 'Resonance build' : `Resonance builds (${compound.count})`,
      op: '×',
      factor: compound.factor,
      note: 'Compounding from the moment the window opened',
    });
  }

  const memory = Number.isFinite(state.memoryMul) && state.memoryMul > 0 ? state.memoryMul : 1;
  if (memory !== 1) {
    const shards = Math.round((memory - 1) / MEMORY_PER_SHARD);
    rows.push({
      kind: 'mul',
      label: 'Echo Memory',
      op: '×',
      factor: memory,
      note: `${shards} name${shards === 1 ? '' : 's'} on the Contact Log`,
    });
  }

  // Pre-exponent product — the rate before Ascent lifts it.
  const linear = rows.reduce((acc, r) => {
    if (r.kind === 'base') return r.factor;
    if (r.kind === 'mul') return acc * r.factor;
    return acc;
  }, 0);

  const ascentExp = Number.isFinite(state.ascentExp) && state.ascentExp > 0 ? state.ascentExp : 0;
  let final = linear;
  if (ascentExp > 0 && linear > 1) {
    final = Math.pow(linear, 1 + ascentExp);
    const lvl = Math.round(ascentExp / 0.02);
    rows.push({
      kind: 'exp',
      label: 'Ascent exponent',
      op: '^',
      factor: 1 + ascentExp,
      note: `Carrier Engraving · ${lvl} cut${lvl === 1 ? '' : 's'} into the frame`,
    });
  }

  rows.push({
    kind: 'total',
    label: 'Current pulse',
    op: '=',
    factor: final,
    note: null,
  });

  return rows;
}
