// Signal Diagnostic — decompose effectiveRate(state, now) into named rows so
// the player can see where Echoes/s comes from.
//
// Pure logic, no DOM. Keeps strict parity with src/shop.js effectiveRate():
//
//   rate = (basePerSecond + flatBonus) * permMul
//        * patternBaseRateMul
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

import { patternBaseRateMul, getActivePattern } from './cyclePatterns.js';
import { applyDampening, DAMPEN_AT, effectiveDampenAlpha, DAMPEN_ALPHA } from './shop.js';
import {
  networkContribution, coverageMultiplier, adjacentOnlineCount, bleedValue, TIER_INFO,
} from './network.js';

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
  const core = state.basePerSecond || 0;
  const flat = state.flatBonus || 0;
  rows.push({
    kind: 'base',
    label: 'Base listening yield',
    op: '+ /s',
    factor: core + flat,
    note: flat > 0 ? `${core} core · +${flat} from patched relays` : null,
  });

  const mesh = networkContribution(state, now);
  if (mesh > 0) {
    const net = state.network;
    let online = 0;
    let bleedPerMin = 0;
    for (const r of net.relays || []) {
      if (now < r.ripensAt) continue;
      online++;
      if (adjacentOnlineCount(net, r, now) === 0) {
        const tier = TIER_INFO[r.tier] || TIER_INFO.common;
        if (tier.bleedPeriodSec > 0) bleedPerMin += bleedValue(r) * (60 / tier.bleedPeriodSec);
      }
    }
    const cov = coverageMultiplier(net, now);
    rows.push({
      kind: 'add',
      label: 'Seed mesh',
      op: '+ /s',
      factor: mesh,
      note: `${online} online relay${online === 1 ? '' : 's'}${cov > 1 ? ` · ×${cov.toFixed(2)} coverage` : ''}`,
    });
    if (bleedPerMin > 0) {
      rows.push({
        kind: 'info',
        label: 'Echo Bleed drip',
        op: '+ /min',
        factor: bleedPerMin,
        note: 'Direct to balance — bypasses multipliers below',
      });
    }
  }

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

  const breakMul = state.dampenBreakMul || 1;
  if (breakMul !== 1) {
    const breaks = state.dampenBreaks || { mythic: 0, legendary: 0 };
    const parts = [];
    if (breaks.mythic) parts.push(`${breaks.mythic} Quiet-Law Bypass`);
    if (breaks.legendary) parts.push(`${breaks.legendary} Channel Leak`);
    rows.push({
      kind: 'mul',
      label: 'Bypass stack',
      op: '×',
      factor: breakMul,
      note: parts.length ? parts.join(' · ') : 'Pre-Union carrier circuitry',
    });
  }

  const patternMul = patternBaseRateMul(state);
  if (patternMul !== 1) {
    const p = getActivePattern(state);
    rows.push({
      kind: 'mul',
      label: 'Cycle Pattern',
      op: '×',
      factor: patternMul,
      note: p ? `${p.name} — base carrier reshaped for this cycle` : 'Pattern modifier active',
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

  // Pre-exponent product — the rate before dampening compresses it. 'base'
  // sets the starting additive value, 'add' rows lift it, 'mul' rows multiply
  // it, 'info' rows are display-only (Echo Bleed drips raw to balance, not
  // through the rate pipeline).
  const linear = rows.reduce((acc, r) => {
    if (r.kind === 'base') return r.factor;
    if (r.kind === 'add') return acc + r.factor;
    if (r.kind === 'mul') return acc * r.factor;
    return acc;
  }, 0);

  // Log-dampening kicks in once raw output passes DAMPEN_AT. Surface it as a
  // multiplicative factor (dampened / raw) so the diagnostic stays additive in
  // log space and the total row matches effectiveRate.
  let postDampen = linear;
  if (linear > DAMPEN_AT) {
    const alpha = effectiveDampenAlpha(state);
    postDampen = applyDampening(linear, alpha);
    const baseNote = 'High-rate compression — each decade past trillion yields less than a full decade of output';
    const relieved = alpha > DAMPEN_ALPHA + 1e-9;
    rows.push({
      kind: 'mul',
      label: 'Log dampening',
      op: '×',
      factor: postDampen / linear,
      note: relieved
        ? `${baseNote} · α ${alpha.toFixed(3)} (Bypass stack softened the cliff)`
        : baseNote,
    });
  }

  const ascentExp = Number.isFinite(state.ascentExp) && state.ascentExp > 0 ? state.ascentExp : 0;
  let final = postDampen;
  if (ascentExp > 0 && postDampen > 1) {
    final = Math.pow(postDampen, 1 + ascentExp);
    const lvl = Math.round(ascentExp / 0.02);
    rows.push({
      kind: 'exp',
      label: 'Ascent exponent',
      op: '^',
      factor: 1 + ascentExp,
      note: `Console Engraving · ${lvl} cut${lvl === 1 ? '' : 's'} into the frame`,
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
