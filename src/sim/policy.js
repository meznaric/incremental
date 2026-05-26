// AI player policy. Called on each "decision tick" inside an active window.
//
// Goal: keep up with a real player's progression — closing several cycles in
// a normal week. Earlier iterations were way too conservative (gambles off,
// short paybacks, no Seed Relay placement, no buff stacking) and bottomed
// out at one cycle per ten days. The current shape:
//   - Permanents: buy if affordable AND payback ≤ payback budget (now hours,
//     not minutes — permanent muls compound forever, so they pay back even
//     when the foreground payback looks long).
//   - Buffs (rateMul / compound): stack them. Real play is "spam Carriers
//     when you see them" — gating on existing buffs was wrong.
//   - Gambles: enabled by default. Take any Hail with EV ≥ break-even AND
//     wager ≤ 25% of balance. Hails are a major progression engine in S1.
//   - Convert (Seed Relay): take when offered. The runner auto-places the
//     queued token on the cheapest-distance unoccupied hex it can find so
//     the placement step doesn't bottleneck the headless run.
//   - Coil: take when affordable AND we already have ≥ 1 relay (so the
//     mechanic has something to attach to).
//   - Gifts (Bleed): always free — take immediately.
//   - Reroll: if no slot is desirable, spend up to rerollBudgetSeconds of
//     current rate; or always reroll on banked free rerolls.
//   - Unlock new slot / reroll-unlock / pin-tier: buy when affordable.

import {
  tryBuy, tryReroll, tryUnlockSlot, tryUnlockReroll, tryUnlockPinTier,
  nextSlotUnlockCost, nextPinTierCost, REROLL_UNLOCK_COST,
  effectiveRate, computeRerollCost, isSlotPinned, marginalRateForPurchase,
  effectiveGambleChance,
} from '../shop.js';
import { resolveUpgrade } from '../upgrades.js';
import { getHexes, placeRelay, ensureNetwork } from '../network.js';

export const DEFAULT_POLICY = {
  allowGambles: true,
  // Permanents: 3 hours is the upper bound on payback. Muls compound; a 3-hour
  // payback today is a free 10x by tomorrow.
  paybackSeconds: 3 * 3600,
  // Buffs: spend up to 30 min of rate on a strong buff. Real play accepts
  // expensive Carriers when the headline mult is fat.
  buffCostSeconds: 1800,
  // Reroll if the cheapest slot is genuinely unaffordable AND we have rate.
  rerollBudgetSeconds: 600, // 10 min
  // Drift purchases: cheap-ish ceiling, since the foreground rate isn't moved
  // by Drift. ~10 min of current rate is reasonable.
  driftCostSeconds: 600,
  // Slot unlocks: amortised over how much rate they enable. Loose budget.
  unlockSlotPaybackSeconds: 3600,
  // Pin tiers — quality-of-life, buy when affordable.
  unlockPinTierAt: 1.5,
  // Gamble — only take when expected return > 1.0× wager. Wager ≤ 25% of bal.
  gambleMaxWagerPct: 0.25,
  gambleMinEvRatio: 1.0,
};

function slotIsSkipped(state, slot) {
  if (!slot) return true;
  const u = resolveUpgrade(slot);
  return !u;
}

// Inspect a permanent (or mul): payback time in seconds of resulting rate gain.
function permanentPayback(state, slot, now) {
  const gain = marginalRateForPurchase(state, slot, now);
  if (!(gain > 0)) return Infinity;
  return slot.cost / gain;
}

// Pick an unoccupied hex to place a queued Seed Relay token on. Heuristic:
// take the first available hex that has at least one online neighbour (for
// clustering bonus); if none, fall back to any unoccupied hex. The simulator
// only cares about getting yield online — it doesn't need to be optimal.
function pickHexForRelay(state) {
  const network = ensureNetwork(state);
  const occupied = new Set(network.relays.map((r) => `${r.hex.q},${r.hex.r}`));
  const hexes = getHexes();
  // Prefer adjacent-to-online so clustering yield kicks in.
  for (const h of hexes) {
    if (occupied.has(`${h.q},${h.r}`)) continue;
    const hasNeighbour = network.relays.some((r) => {
      const dq = Math.abs(r.hex.q - h.q);
      const dr = Math.abs(r.hex.r - h.r);
      const ds = Math.abs((-r.hex.q - r.hex.r) - (-h.q - h.r));
      return Math.max(dq, dr, ds) === 1;
    });
    if (hasNeighbour) return h;
  }
  // Fallback: any unoccupied.
  for (const h of hexes) {
    if (!occupied.has(`${h.q},${h.r}`)) return h;
  }
  return null;
}

// Drain any queued Seed Relay tokens onto hexes. Called every decision tick.
export function placeQueuedRelays(state, now) {
  const network = ensureNetwork(state);
  let placed = 0;
  while (network.queued && network.queued.length > 0) {
    const hex = pickHexForRelay(state);
    if (!hex) break;
    const r = placeRelay(state, hex, now);
    if (!r) break;
    placed++;
  }
  return placed;
}

// Decide one action. Returns the highest-value action the player would take
// at this instant. The runner loops `decide` several times per tick so a
// fresh post-purchase slot is considered immediately.
export function decide(state, policy, now) {
  // System unlocks — these reshape the slate, so do them first.
  if (!state.shop.rerollUnlocked && state.amount >= REROLL_UNLOCK_COST) {
    return { action: 'unlock-reroll' };
  }
  const slotCost = nextSlotUnlockCost(state);
  if (slotCost != null && state.amount >= slotCost) {
    const r = effectiveRate(state, now);
    if (r > 0 && slotCost / r <= policy.unlockSlotPaybackSeconds) {
      return { action: 'unlock-slot' };
    }
  }
  const pinCost = nextPinTierCost(state);
  if (pinCost != null && state.amount >= pinCost * policy.unlockPinTierAt) {
    return { action: 'unlock-pin' };
  }

  // Scan all slots once and gather the best candidate per category. Gifts
  // and converts always win when offered.
  let bestPermIdx = -1, bestPermPayback = Infinity;
  let bestBuffIdx = -1, bestBuffCostSec = Infinity;
  let bestDriftIdx = -1, bestDriftCostSec = Infinity;
  let bestCoilIdx = -1, bestCoilCostSec = Infinity;
  let giftIdx = -1, convertIdx = -1;
  let gambleIdx = -1, bestGambleEv = -Infinity;
  const r = effectiveRate(state, now);

  for (let i = 0; i < state.shop.slots.length; i++) {
    const slot = state.shop.slots[i];
    if (slotIsSkipped(state, slot)) continue;
    const u = resolveUpgrade(slot);

    if (u.kind === 'gift') { giftIdx = i; continue; }

    if (u.kind === 'gamble') {
      if (!policy.allowGambles) continue;
      const cd = state.gambleCd[slot.id] || 0;
      if (now < cd) continue;
      if (u.wagerPct > policy.gambleMaxWagerPct) continue;
      if (state.amount * u.wagerPct < 1) continue;
      const chance = effectiveGambleChance(state, u, now);
      const ev = chance * u.payout - 1;
      if (ev <= policy.gambleMinEvRatio - 1) continue;
      if (ev > bestGambleEv) { gambleIdx = i; bestGambleEv = ev; }
      continue;
    }

    // Everything below requires cash.
    if (state.amount < slot.cost) continue;

    if (u.kind === 'convert') {
      // Take the cheapest convert; auto-placement happens post-buy.
      if (convertIdx < 0 || slot.cost < state.shop.slots[convertIdx].cost) convertIdx = i;
      continue;
    }

    if (u.kind === 'coil') {
      const meshOnline = state.network && state.network.relays
        ? state.network.relays.filter((rl) => now >= rl.ripensAt).length : 0;
      if (meshOnline < 1) continue;
      const costSec = r > 0 ? slot.cost / r : Infinity;
      if (costSec < bestCoilCostSec) { bestCoilIdx = i; bestCoilCostSec = costSec; }
      continue;
    }

    if (u.kind === 'drift') {
      const costSec = r > 0 ? slot.cost / r : Infinity;
      if (costSec <= policy.driftCostSeconds && costSec < bestDriftCostSec) {
        bestDriftIdx = i; bestDriftCostSec = costSec;
      }
      continue;
    }

    if (u.kind === 'buff') {
      // Stack buffs — real players spam Carrier windows. Strength compares
      // are unreliable post-pattern/meta, so we just use cost-per-second-of-rate.
      const costSec = r > 0 ? slot.cost / r : Infinity;
      if (costSec <= policy.buffCostSeconds && costSec < bestBuffCostSec) {
        bestBuffIdx = i; bestBuffCostSec = costSec;
      }
      continue;
    }

    if (u.kind === 'permanent') {
      const pb = permanentPayback(state, slot, now);
      if (pb <= policy.paybackSeconds && pb < bestPermPayback) {
        bestPermIdx = i; bestPermPayback = pb;
      }
      continue;
    }
  }

  // Priority: gifts → cheap permanent → cheap buff → convert → coil →
  // drift → gamble. Permanent over buff: a permanent compounds; a buff
  // expires. Convert mid-cycle is high-value because relays ripen into
  // ongoing base.
  if (giftIdx >= 0) return { action: 'buy', slotIdx: giftIdx };
  if (bestPermIdx >= 0) return { action: 'buy', slotIdx: bestPermIdx };
  if (bestBuffIdx >= 0) return { action: 'buy', slotIdx: bestBuffIdx };
  if (convertIdx >= 0) return { action: 'buy', slotIdx: convertIdx };
  if (bestCoilIdx >= 0) return { action: 'buy', slotIdx: bestCoilIdx };
  if (bestDriftIdx >= 0) return { action: 'buy', slotIdx: bestDriftIdx };
  if (gambleIdx >= 0) return { action: 'buy', slotIdx: gambleIdx };

  // Nothing buyable — reroll. Free rerolls go first, then paid rerolls within
  // budget.
  if (state.shop.rerollUnlocked) {
    let nonPinned = 0;
    for (let i = 0; i < state.shop.slots.length; i++) if (!isSlotPinned(state, i)) nonPinned++;
    if (nonPinned > 0) {
      if ((state.freeRerolls || 0) > 0) return { action: 'reroll' };
      const cost = computeRerollCost(state, now, nonPinned);
      if (r > 0 && cost / r <= policy.rerollBudgetSeconds && state.amount >= cost) {
        return { action: 'reroll' };
      }
    }
  }

  return { action: 'idle' };
}

export function apply(state, action, now) {
  switch (action.action) {
    case 'buy': {
      const res = tryBuy(state, action.slotIdx, now);
      // If a convert just queued a token, place it immediately.
      placeQueuedRelays(state, now);
      return res;
    }
    case 'reroll':      return tryReroll(state, now);
    case 'unlock-slot': return tryUnlockSlot(state, now);
    case 'unlock-reroll': return tryUnlockReroll(state);
    case 'unlock-pin':  return tryUnlockPinTier(state);
    case 'idle':        return { ok: true, idle: true };
  }
  return { ok: false, reason: 'unknown-action' };
}
