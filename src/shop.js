import { rollSlate, rerollSlot, isEligible, slotMatches, resolveUpgrade, SLOT_FILTERS, convertYieldFor } from './upgrades.js';
import { checkGamble, checkPurchase } from './interstitial.js';
import {
  patternBaseRateMul, patternRerollCostMul, patternBuffDurationMul,
  patternBuffRateMulStrength, patternGambleLuckBonus,
  patternFreeLeft, consumePatternFreePurchase,
  patternPurchaseCostMul, patternNetworkYieldMul,
} from './cyclePatterns.js';
import { networkContribution, queueToken, countOnlineRelays } from './network.js';

export const DEFAULT_SLOTS = 2;
export const MAX_SLOTS = 10;

// Hard ceiling on the effective Hail win-chance after Carry windows + pattern
// luck stack on top of the base. A 100% guaranteed win drains the danger out
// of the loop — the dark, the static, the *might not work* is what makes
// landing a phrase mean something. Stack as much luck as you like; the last
// few percent stay on the other side.
export const GAMBLE_CHANCE_CAP = 0.85;

// Single source of truth for the win-chance a Hail card actually rolls against.
// Both the renderer (so the % the player reads matches reality) and tryBuy
// (the actual roll) walk through this. Callers pass the current `now` so an
// expiring Carry stops counting the moment it's gone — the displayed % drops
// to the next % the rig would actually roll against.
export function effectiveGambleChance(state, upgrade, now) {
  if (!upgrade || typeof upgrade.chance !== 'number') return 0;
  const luckBuffs = (state && state.buffs && state.buffs.gambleLuck) || [];
  const luck = luckBuffs.reduce((s, b) => s + (now < b.expiresAt ? b.value : 0), 0);
  const pat = patternGambleLuckBonus(state);
  return Math.min(GAMBLE_CHANCE_CAP, upgrade.chance + luck + pat);
}

// Cost to unlock the Nth slot (the slot whose index === N). Slots 0 and 1 are free.
// 10× growth starting at 1k for slot index 2.
export const SLOT_UNLOCK_COSTS = (() => {
  const arr = [0, 0];
  let c = 1000;
  for (let i = 2; i < MAX_SLOTS; i++) { arr.push(c); c *= 10; }
  return arr;
})();

export const REROLL_UNLOCK_COST = 1000;
export const REROLL_UNLOCK_AT = 1000;
// Band Lock — five tiers. Each tier unlocks one additional pin slot so the
// player can hold more bands steady through a re-tune (every pinned slot is
// excluded from the reroll, dropping its cost and price-floor share).
// Cost grows ~3× per tier: 5k, 15k, 45k, 135k, 405k. Pin tier N requires
// tier N-1 already owned (enforced by tryUnlockPinTier).
export const PIN_TIER_COSTS = [5000, 15000, 45000, 135000, 405000];
export const MAX_PIN_SLOTS = PIN_TIER_COSTS.length;
// First pin shows up in the toolbar at this balance; the tier-cost is the
// hard gate. Visibility-only — mirrors the old PIN_UNLOCK_AT behaviour.
export const PIN_UNLOCK_AT = PIN_TIER_COSTS[0];
// Back-compat re-export: a few call sites (and tests) still import the old
// single-cost constant. Map it to tier-1 so nothing breaks during the rename.
export const PIN_UNLOCK_COST = PIN_TIER_COSTS[0];
export const REROLL_PCT_PER_SLOT = 0.015;
export const REROLL_FLOOR_SECONDS = 3;

// Reroll cost is based on the rate captured at roll time (state.shop.offeredRate)
// so the displayed price stays stable as production grows — but capped by the
// live effective rate so an expiring buff *drops* the floor. Without the cap,
// a Carrier window rolled while running ×7 keeps the reroll price 7× too high
// for the rest of the slate, well after the buff is gone.
export function computeRerollCost(state, now, nonPinnedCount) {
  const pct = REROLL_PCT_PER_SLOT * nonPinnedCount * state.amount;
  const live = effectiveRate(state, now);
  const offered = state.shop.offeredRate;
  const rate = offered != null ? Math.min(offered, live) : live;
  const floor = REROLL_FLOOR_SECONDS * rate * nonPinnedCount;
  return Math.max(pct, floor) * patternRerollCostMul(state);
}

export function makeShopState() {
  return {
    flatBonus: 0,
    permMul: 1,
    // Multiplier applied only to offline accrual at load time — see save.js.
    // Drifts ("while-you-are-away") fold into this. Default 1 means a clean
    // boot offers no offline bonus until the player buys some.
    offlineMul: 1,
    // Quiet-Law Bypass / Channel Leak — late-game cards that soften log
    // dampening's α and grant a separate multiplier bucket. Kept apart from
    // permMul so the Decode card stack stays clean. Counts feed
    // effectiveDampenAlpha(); dampenBreakMul applies at the same point as
    // permMul (pre-dampening). Resets on Cycle close, like permMul.
    dampenBreaks: { mythic: 0, legendary: 0 },
    dampenBreakMul: 1,
    owned: {},
    buffs: {
      rateMul:       [], // { value, duration, expiresAt }
      gambleLuck:    [], // { value, duration, expiresAt }
      gambleCushion: [], // { value, duration, expiresAt }
      compound:      [], // { rate,  duration, startedAt, expiresAt }
      // Meta-buffs ("Frames"): primes that scale subsequent buff applications
      // while active. metaStrength multiplies new rateMul `value`; metaDuration
      // multiplies every new buff's duration; metaLuck adds to new gambleLuck.
      metaStrength:  [], // { value, duration, expiresAt }
      metaDuration:  [], // { value, duration, expiresAt }
      metaLuck:      [], // { value, duration, expiresAt }
    },
    gambleCd: {},
    shop: {
      slots: Array(DEFAULT_SLOTS).fill(null),
      slotsUnlocked: DEFAULT_SLOTS,
      rerollUnlocked: false,
      // How many band-lock pins the player has unlocked (0..MAX_PIN_SLOTS).
      // Each tier of the Band Lock upgrade increments this. The number is the
      // soft cap on how many slot indices can live in pinnedSlots at once.
      pinSlots: 0,
      // Array of slot indices that are currently pinned. Length ≤ pinSlots.
      // Replaces the old scalar `pinnedSlot` field; save migration handles
      // legacy { pinUnlocked, pinnedSlot } shapes.
      pinnedSlots: [],
      offeredRate: 0,
    },
    messages: {
      shown: {},
      queue: [],
      stats: { gambles: 0, gambleLosses: 0, allInLost: false, peakAmount: 0 },
    },
  };
}

// Declarative table of rate-affecting buffs. Each buff key is a list of
// active instances. To add a new buff type:
//   1. Add an empty array under `state.buffs.<key>` in makeShopState().
//   2. Append a descriptor here with `multAt`, `transitions`, and (if time-varying)
//      `isContinuous` + `integral`.
//   3. Apply it in `applyBuff` below.
// `multAt(instances, t)` returns the combined multiplier at t (1 if none active).
// `transitions(instances)` returns timestamps where the multiplier changes.
// `isContinuous(instances, a, c)` returns true if the combined multiplier varies within [a, c].
// `integral(instances, a, c)` returns ∫(a→c) multAt(instances, t) dt, required when isContinuous can return true.
export const RATE_BUFFS = [
  {
    key: 'rateMul',
    transitions: (xs) => xs.map((b) => b.expiresAt),
    multAt: (xs, t) => xs.reduce((p, b) => (t < b.expiresAt ? p * b.value : p), 1),
  },
  {
    key: 'compound',
    transitions: (xs) => xs.flatMap((b) => [b.startedAt, b.expiresAt]),
    multAt: (xs, t) => xs.reduce((p, b) => (
      t >= b.startedAt && t < b.expiresAt ? p * Math.pow(1 + b.rate, t - b.startedAt) : p
    ), 1),
    isContinuous: (xs, a, c) => {
      const mid = (a + c) / 2;
      return xs.some((b) => mid >= b.startedAt && mid < b.expiresAt);
    },
    // multAt(τ) = ∏ᵢ (1+rᵢ)^(τ-sᵢ) = exp(K·τ + const) where K = Σ ln(1+rᵢ).
    // So ∫ multAt(τ) dτ from a→c = (multAt(c) − multAt(a)) / K. Works for
    // any mix of compound rates — previously the formula collapsed all
    // active buffs to active[0].rate, which silently underestimated accrual
    // by ~10× whenever a slow long-duration compound (Slow Burn / Black Sky
    // / Old Carrier) was running underneath a burst (Resonance Build /
    // Storm). Rate label uses multAt directly so the gap was visible as
    // "label moves but balance doesn't keep up" past quintillion. Each
    // factor (1+rᵢ)^(τ-sᵢ) uses elapsed time bounded by buff duration —
    // absolute Unix seconds (~1.7e9) would overflow pow().
    integral: (xs, a, c) => {
      const mid = (a + c) / 2;
      const active = xs.filter((b) => mid >= b.startedAt && mid < b.expiresAt);
      if (active.length === 0) return c - a;
      let K = 0;
      for (const b of active) K += Math.log(1 + b.rate);
      if (!(K > 0)) return c - a;
      let multC = 1, multA = 1;
      for (const b of active) {
        multC *= Math.pow(1 + b.rate, c - b.startedAt);
        multA *= Math.pow(1 + b.rate, a - b.startedAt);
      }
      return (multC - multA) / K;
    },
  },
];

// Echo Memory multiplier from the Contact Log. Scalar over the whole rate;
// state.memoryMul is derived (not persisted) and defaults to 1 if absent.
function memoryFactor(state) {
  return Number.isFinite(state.memoryMul) && state.memoryMul > 0 ? state.memoryMul : 1;
}

// Ascent exponent from Console Engravings. Lifts the entire effective rate to
// rate^(1+ascentExp). Stored as state.ascentExp (derived; defaults to 0).
// WHY: every existing rate term is multiplicative; once cost growth is super-
// exponential, multipliers asymptote. An exponent on the wire opens a new axis.
function ascentExp(state) {
  return Number.isFinite(state.ascentExp) && state.ascentExp > 0 ? state.ascentExp : 0;
}
function applyAscent(rate, exp) {
  if (exp <= 0 || rate <= 1) return rate;
  return Math.pow(rate, 1 + exp);
}

// Log-dampening on the final pre-ascent rate. Below DAMPEN_AT the rate is
// untouched; above, it is compressed so each decade of raw production yields
// only DAMPEN_ALPHA decades of effective production. Without this, additive
// permanents and multiplier stacks both compound past trillion into runaway.
// Tunable: dropping ALPHA tightens the cap; raising AT delays its bite.
export const DAMPEN_AT = 1e12;
// Each decade of raw output past DAMPEN_AT yields α decades of effective
// output, so a 1% bump on α directly buys back 1% of every late-game
// decade. Was 0.92 (8% tax/decade); at 0.94 a player at nonillion is hit
// roughly 2.3× less hard while the cliff still binds enough that the
// Quiet-Law Bypass cards stay meaningful.
export const DAMPEN_ALPHA = 0.94;
// Hard ceiling on α so the Quiet-Law Bypass / Channel Leak chain can never
// fully negate dampening — the cliff softens but never disappears.
export const DAMPEN_ALPHA_MAX = 0.99;
export const DAMPEN_ALPHA_PER_MYTHIC = 0.03;
export const DAMPEN_ALPHA_PER_LEGENDARY = 0.015;
export function effectiveDampenAlpha(state) {
  if (!state) return DAMPEN_ALPHA;
  const m = (state.dampenBreaks && state.dampenBreaks.mythic) || 0;
  const l = (state.dampenBreaks && state.dampenBreaks.legendary) || 0;
  return Math.min(
    DAMPEN_ALPHA_MAX,
    DAMPEN_ALPHA + DAMPEN_ALPHA_PER_MYTHIC * m + DAMPEN_ALPHA_PER_LEGENDARY * l,
  );
}
export function applyDampening(rate, alpha = DAMPEN_ALPHA) {
  if (!(rate > DAMPEN_AT)) return rate;
  return DAMPEN_AT * Math.pow(rate / DAMPEN_AT, alpha);
}

// Cost-side half-relief: super-exponential card ladders (permanent/drift/coil)
// don't see dampening at all, so balance growth lagging by f doubles their wall.
// sqrt(f) gives back half of that compression so DDc+ stays buyable.
export function dampeningCostMul(rate, alpha = DAMPEN_ALPHA) {
  if (!(rate > DAMPEN_AT)) return 1;
  return Math.pow(rate / DAMPEN_AT, (alpha - 1) / (2 * alpha));
}

// Seed-Relay yield folds into the additive base, same place as flatBonus,
// so it rides every multiplier downstream (permMul, buffs, memory, ascent).
// patternNetworkYieldMul scales just the mesh contribution — patterns like
// Echo Loom turn the network into the primary income, not the base rate.
function additiveBase(state, now) {
  return (state.basePerSecond || 0) + (state.flatBonus || 0)
    + networkContribution(state, now) * patternNetworkYieldMul(state);
}

export function effectiveRate(state, now) {
  let rate = additiveBase(state, now) * state.permMul * (state.dampenBreakMul || 1);
  rate *= patternBaseRateMul(state);
  for (const desc of RATE_BUFFS) rate *= desc.multAt(state.buffs[desc.key] || [], now);
  rate *= memoryFactor(state);
  rate = applyDampening(rate, effectiveDampenAlpha(state));
  return applyAscent(rate, ascentExp(state));
}

// Same chain as effectiveRate but without the RATE_BUFFS layer. Used by the
// HUD to detect whether a buff is currently lifting the rate — past 1e12
// dampening, raw pre-dampening baseRate is always greater than effectiveRate
// even with no buffs active, so comparing against that gives a false "off"
// reading for the buffed glow on the rate label.
export function unbufedEffectiveRate(state, now) {
  let rate = additiveBase(state, now) * state.permMul * (state.dampenBreakMul || 1);
  rate *= patternBaseRateMul(state);
  rate *= memoryFactor(state);
  rate = applyDampening(rate, effectiveDampenAlpha(state));
  return applyAscent(rate, ascentExp(state));
}

// Closed-form integral of effective rate from t0 to t1. Splits the window at every
// buff transition (start or expiry) AND every relay ripensAt, then for each
// segment multiplies all piecewise-constant buff factors at the midpoint with
// the segment's time integral. If a buff has a continuous multiplier (e.g.
// compound), its analytical integral replaces the (c - a) factor. Assumes at
// most one continuous descriptor is active per segment; extending to more
// would require generalized numerical integration.
export function integrateRate(state, t0, t1) {
  if (t1 <= t0) return 0;
  const transitions = new Set([t0, t1]);
  for (const desc of RATE_BUFFS) {
    const xs = state.buffs[desc.key] || [];
    for (const tr of desc.transitions(xs)) {
      if (tr > t0 && tr < t1) transitions.add(tr);
    }
  }
  // Relays that ripen mid-window change networkContribution at that
  // instant — split here too so post-ripen segments pick up the new
  // relay's yield. Discoveries are handled separately by reconcileOffline
  // before this call, so by t1 the surviving set is fixed.
  if (state.network && state.network.relays) {
    for (const r of state.network.relays) {
      if (r.ripensAt > t0 && r.ripensAt < t1) transitions.add(r.ripensAt);
    }
  }
  const sorted = [...transitions].sort((x, y) => x - y);
  const exp = ascentExp(state);
  const alpha = effectiveDampenAlpha(state);
  const flatBaseMul = state.permMul * (state.dampenBreakMul || 1) * patternBaseRateMul(state) * memoryFactor(state);
  let total = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], c = sorted[i + 1];
    if (c <= a) continue;
    const mid = (a + c) / 2;
    // Sample networkContribution per segment so ripening relays start
    // contributing only from their ripensAt onward. patternNetworkYieldMul
    // scales the mesh contribution (Echo Loom).
    const meshContribution = networkContribution(state, mid) * patternNetworkYieldMul(state);
    const segBase = ((state.basePerSecond || 0) + state.flatBonus + meshContribution) * flatBaseMul;
    let factor = 1;
    let timeIntegral = c - a;
    let continuousFound = false;
    for (const desc of RATE_BUFFS) {
      const xs = state.buffs[desc.key] || [];
      if (desc.isContinuous && desc.isContinuous(xs, a, c)) {
        if (!continuousFound) {
          timeIntegral = desc.integral(xs, a, c);
          continuousFound = true;
        } else {
          factor *= desc.multAt(xs, (a + c) / 2);
        }
      } else {
        factor *= desc.multAt(xs, (a + c) / 2);
      }
    }
    // Log-dampening + Ascent both apply to the segment's rate. Discrete
    // segments dampen exactly; continuous (compound) segments dampen the
    // segment-average rate, which is the strictest closed-form available
    // without numerical integration. Ascent stacks on top of dampening.
    const linearBase = segBase * factor;
    if (linearBase > 0) {
      const dt = c - a;
      let segmentTotal;
      if (continuousFound && dt > 0) {
        const avgRate = linearBase * (timeIntegral / dt);
        const dampened = applyDampening(avgRate, alpha);
        const lifted = exp > 0 ? applyAscent(dampened, exp) : dampened;
        segmentTotal = lifted * dt;
      } else {
        const dampened = applyDampening(linearBase, alpha);
        const lifted = exp > 0 ? applyAscent(dampened, exp) : dampened;
        segmentTotal = lifted * timeIntegral;
      }
      total += segmentTotal;
    }
  }
  return total;
}

export function rollContext(state, now) {
  const rate = effectiveRate(state, now);
  return {
    balance: state.amount,
    rate,
    baseAdditive: (state.basePerSecond || 0) + state.flatBonus,
    permMul: state.permMul || 1,
    owned: state.owned,
    // Number of currently-online Seed Relays. Used by isEligible to gate
    // mesh-aware upgrades (Patient Coil) until the mesh actually exists.
    meshOnline: countOnlineRelays(state, now),
    costRelief: dampeningCostMul(rate, effectiveDampenAlpha(state)),
  };
}

// Synchronous "what would my rate be if I bought this slot?" — mutates the
// state in-place, reads effectiveRate, then restores. Buffs and ascent flow
// through so the number on the card matches the immediate post-buy reality.
export function marginalRateForPurchase(state, slot, now) {
  if (!slot) return 0;
  const u = resolveUpgrade(slot);
  if (!u) return 0;
  const before = effectiveRate(state, now);
  let after = before;
  if (u.kind === 'permanent' && u.permType === 'add') {
    const orig = state.flatBonus;
    state.flatBonus = orig + u.value;
    after = effectiveRate(state, now);
    state.flatBonus = orig;
  } else if (u.kind === 'permanent' && u.permType === 'mul') {
    const orig = state.permMul;
    state.permMul = orig * u.value;
    after = effectiveRate(state, now);
    state.permMul = orig;
  } else if (u.kind === 'dampenBreak') {
    // Project both axes — the ×value mul and the α bump — so the card shows
    // the full lift, including the dampening curve softening past the cliff.
    const origMul = state.dampenBreakMul || 1;
    const origBreaks = state.dampenBreaks || { mythic: 0, legendary: 0 };
    state.dampenBreakMul = origMul * (u.value || 1);
    state.dampenBreaks = {
      mythic: (origBreaks.mythic || 0) + (u.tier === 'mythic' ? 1 : 0),
      legendary: (origBreaks.legendary || 0) + (u.tier === 'legendary' ? 1 : 0),
    };
    after = effectiveRate(state, now);
    state.dampenBreakMul = origMul;
    state.dampenBreaks = origBreaks;
  } else if (u.kind === 'convert') {
    // Convert is a placement queue — no immediate rate change. The shop card
    // surfaces "queue token" rather than effective /s; the actual gain lands
    // after the player places the relay and it ripens.
    after = before;
  } else if (u.kind === 'buff' && u.buffType === 'rateMul') {
    // Carrier window: flat multiplier the moment it lands. Mirror applyBuff's
    // value composition (pattern strength × meta strength) so the projection
    // matches what the buff will actually contribute.
    const sMul = patternBuffRateMulStrength(state);
    const metaStr = metaMulAt(state.buffs.metaStrength, now);
    const entry = { value: scaleBuffMult(u.mult, sMul, metaStr), duration: u.duration, expiresAt: now + u.duration };
    state.buffs.rateMul.push(entry);
    after = effectiveRate(state, now);
    state.buffs.rateMul.pop();
  }
  // Compound buffs ramp from ×1 at start — the marginal at the instant of
  // purchase is zero by design, so they fall through to after = before.
  return Math.max(0, after - before);
}

export function tryBuy(state, slotIdx, now) {
  const slot = state.shop.slots[slotIdx];
  if (!slot) return { ok: false, reason: 'invalid' };
  const u = resolveUpgrade(slot);
  if (!u) return { ok: false, reason: 'invalid' };
  // Pattern: free-purchase charges cover any non-hail, non-bleed purchase.
  // Gambles and gifts are excluded — gambles take a real wager, gifts are
  // already free.
  const isCharged = u.kind !== 'gamble' && u.kind !== 'gift';
  const usePatternFree = isCharged && patternFreeLeft(state) > 0;
  // Pattern: scale charged-purchase cost (Patched Frame). Free purchases bypass
  // cost entirely, so the multiplier only bites once the freebies run out.
  const cost = isCharged ? slot.cost * patternPurchaseCostMul(state) : slot.cost;

  if (u.kind === 'gamble') {
    if (now < (state.gambleCd[slot.id] || 0)) return { ok: false, reason: 'cooldown' };
    if (state.amount < cost) return { ok: false, reason: 'broke' };
    state.amount -= cost;
    const won = Math.random() < effectiveGambleChance(state, u, now);
    let result;
    if (won) {
      const payout = cost * u.payout;
      state.amount += payout;
      result = { id: slot.id, won: true, delta: payout - cost };
    } else {
      let lose = 1;
      for (const b of state.buffs.gambleCushion) if (now < b.expiresAt) lose *= 1 - Math.max(0, Math.min(1, b.value));
      const cushion = Math.min(0.15, 1 - lose);
      const refund = cost * cushion;
      state.amount += refund;
      result = { id: slot.id, won: false, delta: -(cost - refund) };
    }
    state.gambleCd[slot.id] = now + u.cooldown;
    checkGamble(state, { won: result.won, isAllIn: u.wagerPct >= 1, balanceAfter: state.amount });
    replaceSlot(state, slotIdx, now);
    return { ok: true, result };
  }

  if (u.kind === 'buff') {
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    applyBuff(state, u, now);
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'permanent') {
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    if (u.permType === 'add') state.flatBonus += u.value;
    if (u.permType === 'mul') state.permMul *= u.value;
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'convert') {
    // Convert no longer credits flatBonus directly. The burn buys a placement
    // token (tier + frozen baseYield = cost × ratio) that the player drops on
    // a hex in the Network screen. The hex's sector + adjacency then decide
    // how much that yield actually delivers.
    if (!usePatternFree && (cost <= 0 || state.amount < cost)) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    const baseAdd = (state.basePerSecond || 0) + (state.flatBonus || 0);
    // Yield credit follows the rolled cost, not the pattern-scaled price.
    // Patched Frame doubles what the player pays for a convert without doubling
    // what the relay ends up worth — the cost penalty has to actually bite.
    queueToken(state, u.rarity, convertYieldFor(u, slot.cost, baseAdd));
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'gift') {
    state.amount += u.reward;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'drift') {
    // Drift = offline-only permanent multiplier. Stacks into state.offlineMul
    // and is applied to earnings at welcomeBack time. Foreground rate is
    // untouched on purpose — the player pays for absence-efficiency, not
    // active rate.
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    state.offlineMul = (state.offlineMul || 1) * u.value;
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'dampenBreak') {
    // Quiet-Law Bypass / Channel Leak: lifts the dampening α and adds a
    // multiplier to the dedicated bucket. Counts go on state.dampenBreaks so
    // effectiveDampenAlpha can find them; the multiplier rides dampenBreakMul.
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    if (!state.dampenBreaks) state.dampenBreaks = { mythic: 0, legendary: 0 };
    state.dampenBreaks[u.tier] = (state.dampenBreaks[u.tier] || 0) + 1;
    state.dampenBreakMul = (state.dampenBreakMul || 1) * (u.value || 1);
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  if (u.kind === 'coil') {
    // Coil = mesh modifier. Buying it doesn't change rate or balance
    // directly. Patient Coil rolls a Mesh Bleed reroll-drop (see
    // coilDropChance + tickBleedDrip in network.js); Vigil Coil damps offline
    // discovery (see vigilOfflineDiscoveryMul + reconcileOffline).
    if (!usePatternFree && state.amount < cost) return { ok: false, reason: 'broke' };
    if (usePatternFree) consumePatternFreePurchase(state);
    else state.amount -= cost;
    state.owned[u.id] = (state.owned[u.id] || 0) + 1;
    checkPurchase(state, u);
    replaceSlot(state, slotIdx, now);
    return { ok: true };
  }

  return { ok: false, reason: 'unknown' };
}

// After buying, replace the slot and clear any pin on it — purchasing frees
// the slot so the replacement card lands unpinned (player request: a used pin
// shouldn't keep locking the next random roll).
function replaceSlot(state, slotIdx, now) {
  const ctx = rollContext(state, now);
  state.shop.slots[slotIdx] = rerollSlot(state.shop.slots, slotIdx, ctx);
  state.shop.offeredRate = ctx.rate;
  if (Array.isArray(state.shop.pinnedSlots)) {
    state.shop.pinnedSlots = state.shop.pinnedSlots.filter((i) => i !== slotIdx);
  }
}

export function pruneBuffs(state, now) {
  for (const k of Object.keys(state.buffs)) {
    state.buffs[k] = state.buffs[k].filter((b) => b.expiresAt > now);
  }
}

// Scale a rateMul buff's headline multiplier by pattern + meta strength.
// IMPORTANT: bonus is additive, not multiplicative — a ×1.05 buff under a ×2
// strength frame lands at ×1.10 (+5% × 2 = +10%), not ×2.10. Multiplying the
// raw mult would turn modest ramps into game-breakers and stack absurdly with
// any future strength source. Each strength factor scales the bonus
// independently and they compose multiplicatively: strength S then meta M
// yields 1 + (mult - 1) × S × M.
export function scaleBuffMult(mult, patternStrength, metaStrength) {
  const bonus = mult - 1;
  return 1 + bonus * patternStrength * metaStrength;
}

// Combined live multiplier from a list of meta-buffs. Each active entry's
// value compounds (so two ×1.5 strength frames give ×2.25); inactives return 1.
function metaMulAt(list, now) {
  if (!list || !list.length) return 1;
  let m = 1;
  for (const x of list) if (now < x.expiresAt) m *= x.value;
  return m;
}
// Additive bonus from a list of meta-buffs (used by metaLuck). Stacks linearly.
function metaSumAt(list, now) {
  if (!list || !list.length) return 0;
  let s = 0;
  for (const x of list) if (now < x.expiresAt) s += x.value;
  return s;
}

function applyBuff(state, u, now) {
  pruneBuffs(state, now);
  const b = state.buffs;
  const dMul = patternBuffDurationMul(state);
  const sMul = patternBuffRateMulStrength(state);
  // Meta-buffs are *primes* — they don't fire themselves; they just sit on the
  // file and scale anything applied while they hold. They have to compose with
  // pattern modifiers, not replace them.
  if (u.buffType === 'metaStrength' || u.buffType === 'metaDuration' || u.buffType === 'metaLuck') {
    const duration = u.duration * dMul;
    b[u.buffType].push({ value: u.value, duration, expiresAt: now + duration });
    return;
  }
  const metaDur = metaMulAt(b.metaDuration, now);
  const metaStr = metaMulAt(b.metaStrength, now);
  const metaLuck = metaSumAt(b.metaLuck, now);
  const duration = u.duration * dMul * metaDur;
  if (u.buffType === 'rateMul') {
    b.rateMul.push({ value: scaleBuffMult(u.mult, sMul, metaStr), duration, expiresAt: now + duration });
  } else if (u.buffType === 'gambleLuck') {
    b.gambleLuck.push({ value: u.bonus + metaLuck, duration, expiresAt: now + duration });
  } else if (u.buffType === 'gambleCushion') {
    b.gambleCushion.push({ value: u.refund, duration, expiresAt: now + duration });
  } else if (u.buffType === 'compound') {
    b.compound.push({ rate: u.rate, duration, startedAt: now, expiresAt: now + duration });
  }
}

export function validateSlate(state, now) {
  const ctx = rollContext(state, now);
  const target = state.shop.slotsUnlocked;
  while (state.shop.slots.length < target) state.shop.slots.push(null);
  if (state.shop.slots.length > target) state.shop.slots.length = target;
  let rerolled = false;
  for (let i = 0; i < state.shop.slots.length; i++) {
    const slot = state.shop.slots[i];
    const u = slot ? resolveUpgrade(slot) : null;
    // Pinned slots (those with a SLOT_FILTERS entry) skip the eligibility gate
    // so a seeded fresh-game upgrade (e.g. mult_starter) isn't wiped on reload.
    const pinned = i < SLOT_FILTERS.length;
    const bad = !u || !slotMatches(u, i) || (!pinned && !isEligible(u, ctx));
    if (bad) {
      state.shop.slots[i] = rerollSlot(state.shop.slots, i, ctx);
      rerolled = true;
    }
  }
  // Drop any pin pointing past the live slot count. Slot-removing scenarios
  // (engraving downgrades, schema changes) should never leave dangling pins.
  if (Array.isArray(state.shop.pinnedSlots)) {
    state.shop.pinnedSlots = state.shop.pinnedSlots.filter((i) => i >= 0 && i < state.shop.slots.length);
  }
  if (rerolled || state.shop.offeredRate == null) state.shop.offeredRate = ctx.rate;
}

export function rerollCost(state, now) {
  return computeRerollCost(state, now, countRerollable(state));
}

// Silent welcome-back reroll. If the player came back to a lower rate than
// they left at (typically: Carry windows expired mid-AFK), the slate is still
// priced for the peak — every unpinned card costs more than a fresh roll
// would. Roll one hypothetical reroll for each unpinned slot and swap in
// anything cheaper. Doesn't charge Echoes or consume freeRerolls — it's a
// quality-of-life nudge, gated by the caller on offline duration + rate drop.
export function applyOfflineCheapReroll(state, now) {
  const ctx = rollContext(state, now);
  let swapped = 0;
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (isSlotPinned(state, i)) continue;
    const cur = state.shop.slots[i];
    if (!cur) continue;
    const candidate = rerollSlot(state.shop.slots, i, ctx);
    if (candidate && candidate.cost < cur.cost) {
      state.shop.slots[i] = candidate;
      swapped++;
    }
  }
  if (swapped) state.shop.offeredRate = ctx.rate;
  return swapped;
}

function countRerollable(state) {
  let n = 0;
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (isSlotPinned(state, i)) continue;
    if (state.shop.slots[i]) n++;
  }
  return n;
}

export function tryReroll(state, now) {
  if (!state.shop.rerollUnlocked) return { ok: false, reason: 'locked' };
  const n = countRerollable(state);
  if (n === 0) return { ok: false, reason: 'empty' };
  // Free rerolls bypass the Echo cost. Consumed before charging.
  const usingFree = (state.freeRerolls || 0) > 0;
  let cost = 0;
  if (!usingFree) {
    cost = computeRerollCost(state, now, n);
    if (state.amount < cost || state.amount <= 0) return { ok: false, reason: 'broke' };
    state.amount -= cost;
  } else {
    state.freeRerolls = Math.max(0, (state.freeRerolls || 0) - 1);
  }
  const ctx = rollContext(state, now);
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (isSlotPinned(state, i)) continue;
    state.shop.slots[i] = rerollSlot(state.shop.slots, i, ctx);
  }
  state.shop.offeredRate = ctx.rate;
  return { ok: true, cost, rerolled: n, free: usingFree };
}

// Seconds until the cheapest currently-offered slot becomes affordable at the
// live effective rate. Returns 0 if any slot is already affordable, Infinity
// if rate <= 0 or no slot has a positive cost. Gambles and gifts (whose cost
// scales with balance, or is zero) are skipped — the player isn't "stuck"
// behind them.
export function etaToNextPurchase(state, now) {
  const rate = effectiveRate(state, now);
  let minCost = Infinity;
  for (const slot of state.shop.slots) {
    if (!slot) continue;
    const u = resolveUpgrade(slot);
    if (!u) continue;
    if (u.kind === 'gamble' || u.kind === 'gift' || u.kind === 'convert') continue;
    const cost = slot.cost;
    if (!(cost > 0)) continue;
    if (cost < minCost) minCost = cost;
  }
  if (!isFinite(minCost)) return Infinity;
  const deficit = minCost - state.amount;
  if (deficit <= 0) return 0;
  if (!(rate > 0)) return Infinity;
  return deficit / rate;
}

// How many free rerolls to grant for a given ETA-to-next-purchase. Capped at
// MAX_FREE_REROLL_GRANT so a single check can't dump dozens on the player.
export const FREE_REROLL_TIERS = [
  { atSeconds: 24 * 3600, grant: 3 },
  { atSeconds:  6 * 3600, grant: 2 },
  { atSeconds:      3600, grant: 1 },
];
export const MAX_FREE_REROLLS = 9;

export function freeRerollGrant(etaSeconds) {
  if (Number.isNaN(etaSeconds) || etaSeconds <= 0) return 0;
  // Infinity = no priceable slot, or rate=0 and broke — most-stuck case.
  // Granting the top tier lets a re-tune potentially produce a cheap slot.
  if (!isFinite(etaSeconds)) return FREE_REROLL_TIERS[0].grant;
  for (const t of FREE_REROLL_TIERS) {
    if (etaSeconds >= t.atSeconds) return t.grant;
  }
  return 0;
}

// Bumps state.freeRerolls by the grant for the current ETA. Returns the
// number actually added (0 if no grant or already at cap). Pure-ish: mutates
// state.freeRerolls; no scheduling, no UI.
export function grantFreeRerollsForStall(state, now) {
  if (!state.shop.rerollUnlocked) return 0;
  const eta = etaToNextPurchase(state, now);
  const want = freeRerollGrant(eta);
  if (want <= 0) return 0;
  const current = state.freeRerolls || 0;
  const next = Math.min(MAX_FREE_REROLLS, current + want);
  const added = next - current;
  state.freeRerolls = next;
  return added;
}

export function nextSlotUnlockCost(state) {
  const idx = state.shop.slotsUnlocked;
  if (idx >= MAX_SLOTS) return null;
  return SLOT_UNLOCK_COSTS[idx];
}

export function tryUnlockSlot(state, now) {
  const idx = state.shop.slotsUnlocked;
  if (idx >= MAX_SLOTS) return { ok: false, reason: 'maxed' };
  const cost = SLOT_UNLOCK_COSTS[idx];
  if (state.amount < cost) return { ok: false, reason: 'broke' };
  state.amount -= cost;
  state.shop.slotsUnlocked += 1;
  state.shop.slots.push(null);
  validateSlate(state, now);
  return { ok: true };
}

export function tryUnlockReroll(state) {
  if (state.shop.rerollUnlocked) return { ok: false, reason: 'owned' };
  if (state.amount < REROLL_UNLOCK_COST) return { ok: false, reason: 'broke' };
  state.amount -= REROLL_UNLOCK_COST;
  state.shop.rerollUnlocked = true;
  return { ok: true };
}

// Cost of the next Band Lock tier the player can buy, or null if maxed.
export function nextPinTierCost(state) {
  const owned = state.shop.pinSlots || 0;
  if (owned >= MAX_PIN_SLOTS) return null;
  return PIN_TIER_COSTS[owned];
}

// Whether a given slot index is currently pinned. Single source of truth for
// renderers and the reroll-skip logic — neither should poke pinnedSlots
// directly. Falsy / malformed arrays read as "nothing pinned".
export function isSlotPinned(state, slotIdx) {
  const arr = state.shop.pinnedSlots;
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.includes(slotIdx);
}

// Buy the next Band Lock tier. Each tier costs the next entry in
// PIN_TIER_COSTS and is gated by the previous tier (enforced implicitly by
// using the current count as the index into the cost ladder). Replaces the
// single-shot tryUnlockPin from the days when there was only one pin.
export function tryUnlockPinTier(state) {
  const cost = nextPinTierCost(state);
  if (cost == null) return { ok: false, reason: 'maxed' };
  if (state.amount < cost) return { ok: false, reason: 'broke' };
  state.amount -= cost;
  state.shop.pinSlots = (state.shop.pinSlots || 0) + 1;
  return { ok: true };
}

// Back-compat shim: legacy name still imported from mainUi and tests. Same
// behaviour as tryUnlockPinTier — buy the next available tier.
export const tryUnlockPin = tryUnlockPinTier;

export function tryTogglePin(state, slotIdx) {
  const cap = state.shop.pinSlots || 0;
  if (cap <= 0) return { ok: false, reason: 'locked' };
  if (slotIdx < 0 || slotIdx >= state.shop.slots.length) return { ok: false, reason: 'invalid' };
  if (!Array.isArray(state.shop.pinnedSlots)) state.shop.pinnedSlots = [];
  const arr = state.shop.pinnedSlots;
  const at = arr.indexOf(slotIdx);
  if (at >= 0) {
    arr.splice(at, 1);
    return { ok: true, pinned: false };
  }
  // Adding past capacity: drop the oldest pin (FIFO) so the new tap always
  // takes — feels nicer than rejecting the tap and forces the player to find
  // and un-pin an old slot manually.
  if (arr.length >= cap) arr.shift();
  arr.push(slotIdx);
  return { ok: true, pinned: true };
}
