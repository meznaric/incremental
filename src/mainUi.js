// HUD + shop + buff + toolbar + modal rendering. main.js is the bootstrap and
// game loop; everything DOM-side that the player taps or that rerenders on
// the 100ms HUD tick lives here. Follows the foo.js / fooUi.js convention.
//
// Entry: initMainUi(state, deps) — returns:
//   renderHud(now)          — call from the rAF tick on the HUD interval
//   showToast(text)         — bottom-right ephemeral toast
//   syncInputsToState()     — write state.amount / state.basePerSecond into the inputs
//
// deps.triggerGambleFx({ won, durationMs, now }) bridges to the THREE display
// in main.js (camera-aware attractor + display.triggerGambleFx). Keeps mainUi
// free of three.js so the test suite never has to touch it.

import { formatAbbrev, parseAmount } from './bignum.js';
import { resolveUpgrade, KIND_THEME, kindLabel, getUpgrade, convertYieldFor } from './upgrades.js';
import { coilDropChance, COIL_ID, COIL_DROP_K, COIL_DROP_PMAX } from './network.js';
import {
  effectiveRate, tryBuy, tryReroll, tryUnlockSlot, tryUnlockReroll, tryUnlockPinTier, tryTogglePin,
  nextSlotUnlockCost, computeRerollCost, grantFreeRerollsForStall,
  marginalRateForPurchase, effectiveGambleChance, nextPinTierCost, isSlotPinned,
  REROLL_UNLOCK_COST, REROLL_UNLOCK_AT, PIN_UNLOCK_AT, MAX_PIN_SLOTS,
} from './shop.js';
import { nowSeconds } from './save.js';
import { installTap } from './tap.js';
import { isGambleFxActive, fireGambleResult } from './gambleFx.js';
import { patternPurchaseCostMul } from './cyclePatterns.js';

export function initMainUi(state, deps) {
  const { triggerGambleFx } = deps;

  const amountInput = document.getElementById('amountInput');
  const rateInput = document.getElementById('rateInput');
  const slotsEl = document.getElementById('slots');
  const buffsEl = document.getElementById('buffs');
  const metaBuffsEl = document.getElementById('metaBuffs');
  const buffModalEl = document.getElementById('buffModal');

  const openBuffModal = () => buffModalEl.classList.add('open');
  const closeBuffModal = () => buffModalEl.classList.remove('open');

  installTap(buffModalEl, (e) => {
    if (e.target === buffModalEl || e.target.closest('.bm-close')) closeBuffModal();
  });

  const slotModalEl = document.getElementById('slotModal');
  const slotModalTitleEl = document.getElementById('slotModalTitle');
  const slotModalBodyEl = document.getElementById('slotModalBody');
  const closeSlotModal = () => slotModalEl.classList.remove('open');
  installTap(slotModalEl, (e) => {
    if (e.target === slotModalEl || e.target.closest('.bm-close')) { closeSlotModal(); return; }
    // Cross-link: a buff-kind upgrade card surfaces a "What's a Window?" link
    // that hands the player straight to the four-kind overview. The detail
    // modal stays open behind so they can return.
    if (e.target.closest('[data-act="open-buff-overview"]')) openBuffModal();
  });
  // Bridge between lore labels and mechanics. Surfaces inside the per-upgrade
  // modal under the description so a player meeting "Hail" for the first time
  // learns the wager / payout / cushion loop without leaving the card.
  const KIND_EXPLAIN = {
    gamble:
      'Hail = wager. Spend the listed % of your balance for a roll. Win → you get back Return × wager. Miss → wager lost (active Buffer windows refund part of it). Each Hail has its own cooldown after a roll.',
    buff:
      'Window = timed boost. Stacks while it holds. Multiple Carrier windows multiply (×3 × ×3 = ×9). Multiple Carry windows add. The duration runs in real time, even when the tab is hidden.',
    convert:
      'Seed Relay = a placement token. The burn queues a relay; drop it on a hex in the Network map. It ripens (20m–2h), then carries Echoes until ComDef finds it. Sector picks risk vs reward; clustering pays more but is easier to triangulate.',
    gift:
      'Bleed = a one-shot Echo payout. Adds the listed Echoes to your balance. No ongoing effect.',
    drift:
      'Drift = permanent offline multiplier. Only fires while you are away — when you come back, the integrated rate is multiplied by your stacked Drift. Foreground Echoes/s is unchanged.',
  };
  function permExplain(u) {
    if (u.permType === 'mul') {
      return 'Decode = permanent rate multiplier. Stacks multiplicatively with every other Decode. Lost on cycle close — buy Engravings (Rig tab) for cross-cycle multipliers.';
    }
    return 'Relay = permanent base-rate add. Stacks additively. Lost on cycle close — Echo Memory (Names tab) is the cross-cycle base bonus.';
  }

  // Echo glyph — broadcast-fill reads as concentric arcs (a signal returning).
  // Kept tagged `.cc-icon` (warm tungsten) so it pops against the cool UI.
  const ECHO_ICON = '<i class="ri-broadcast-fill cc-icon"></i>';

  function fmtPct(p) {
    const v = p * 100;
    if (v < 1) return `${v.toFixed(2)}%`;
    if (v < 10) return `${v.toFixed(1)}%`;
    return `${v.toFixed(0)}%`;
  }

  function fmtDuration(s) {
    if (s < 60) return `${s.toFixed(1)}s`;
    if (s < 3600) return `${(s / 60).toFixed(1)}m`;
    if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
    const d = s / 86400;
    return `${d.toFixed(1)} day${d >= 2 ? 's' : ''}`;
  }

  // Render a buff multiplier without float artefacts. Pattern/meta scaling
  // produces values like 1.0500000000000003 or 2.1000000000000005 — capping
  // at three decimals and casting back through Number drops the trailing
  // garbage and any redundant zeros (1.7 stays "1.7", 70 stays "70").
  function fmtMult(v) {
    if (!Number.isFinite(v)) return '0';
    return Number(v.toFixed(3)).toString();
  }

  function openSlotModal(idx) {
    const slot = state.shop.slots[idx];
    const u = slot ? resolveUpgrade(slot) : null;
    if (!u || !slot) return;
    slotModalTitleEl.textContent = u.name;
    // Pattern-scaled cost (Patched Frame doubles charged purchases). Gambles
    // and gifts skip the multiplier.
    const isChargedKindM = u.kind !== 'gamble' && u.kind !== 'gift';
    const dispCost = isChargedKindM ? slot.cost * patternPurchaseCostMul(state) : slot.cost;
    const costCell = u.kind === 'gift' ? 'FREE' : `<span class="cc">${ECHO_ICON}${formatAbbrev(dispCost)}</span>`;
    const rows = [`<div class="slot-modal-row"><span>Cost</span><span>${costCell}</span></div>`];
    if (u.kind === 'gamble') {
      const effChance = effectiveGambleChance(state, u, nowSeconds());
      rows.push(
        `<div class="slot-modal-row"><span>Carry chance</span><span>${fmtPct(effChance)}</span></div>`,
        `<div class="slot-modal-row"><span>Return</span><span>${u.payout}× wager</span></div>`,
        `<div class="slot-modal-row"><span>Cooldown</span><span>${u.cooldown}s</span></div>`,
      );
    } else if (u.kind === 'convert') {
      // Token-style preview: this purchase queues a placement, not a /s bump.
      // Show what the token carries; sector and clustering multipliers land later.
      const baseAdd = (state.basePerSecond || 0) + (state.flatBonus || 0);
      const tokenYield = convertYieldFor(u, slot.cost, baseAdd);
      rows.push(
        `<div class="slot-modal-row"><span>Token tier</span><span>${u.rarity}</span></div>`,
        `<div class="slot-modal-row"><span>Base yield</span><span>+${formatAbbrev(tokenYield)}/s (before sector × cluster)</span></div>`,
        `<div class="slot-modal-row"><span>On purchase</span><span>Queue for placement on the Network map</span></div>`,
      );
    } else if (u.kind === 'permanent' && u.permType === 'add') {
      const eff = marginalRateForPurchase(state, slot, nowSeconds());
      rows.push(
        `<div class="slot-modal-row"><span>Effective gain</span><span>+${formatAbbrev(eff)} Echoes/s</span></div>`,
        `<div class="slot-modal-row"><span>Base added</span><span>+${formatAbbrev(u.value)}/s before multipliers</span></div>`,
      );
    } else if (u.kind === 'permanent' && u.permType === 'mul') {
      const eff = marginalRateForPurchase(state, slot, nowSeconds());
      rows.push(
        `<div class="slot-modal-row"><span>Effective gain</span><span>+${formatAbbrev(eff)} Echoes/s</span></div>`,
        `<div class="slot-modal-row"><span>Multiplier</span><span>×${u.value}</span></div>`,
      );
    } else if (u.kind === 'buff') {
      rows.push(`<div class="slot-modal-row"><span>Duration</span><span>${u.duration}s</span></div>`);
    } else if (u.kind === 'drift') {
      const newMul = (state.offlineMul || 1) * u.value;
      rows.push(
        `<div class="slot-modal-row"><span>Multiplier</span><span>×${u.value}</span></div>`,
        `<div class="slot-modal-row"><span>Total offline mul (after buy)</span><span>×${newMul.toFixed(2)}</span></div>`,
        `<div class="slot-modal-row"><span>Effect</span><span>Applies only to offline earnings.</span></div>`,
      );
    } else if (u.kind === 'gift') {
      rows.push(`<div class="slot-modal-row"><span>Returns</span><span class="cc">${ECHO_ICON}+${formatAbbrev(u.reward)}</span></div>`);
    }
    const explain = u.kind === 'permanent' ? permExplain(u) : (KIND_EXPLAIN[u.kind] || '');
    const crossLink = u.kind === 'buff'
      ? `<button type="button" class="bm-link" data-act="open-buff-overview">View all four Window kinds <i class="ri ri-arrow-right-s-line"></i></button>`
      : '';
    slotModalBodyEl.innerHTML = `
      <span class="slot-modal-tag rarity-${u.rarity}">${u.rarity} · ${kindLabel(u)}</span>
      <p class="slot-modal-desc">${u.desc}</p>
      ${explain ? `<p class="slot-modal-explain">${explain}</p>` : ''}
      ${rows.join('')}
      ${crossLink}
    `;
    slotModalEl.classList.add('open');
  }

  amountInput.value = '0';
  rateInput.value = '1';
  state.amount = parseAmount(amountInput.value);
  state.basePerSecond = parseAmount(rateInput.value);

  amountInput.addEventListener('input', () => {
    state.amount = parseAmount(amountInput.value);
  });
  rateInput.addEventListener('input', () => {
    state.basePerSecond = parseAmount(rateInput.value);
  });

  // Skip innerHTML assignment when content is unchanged. Avoids tearing down
  // child nodes between mousedown and mouseup, which would silently eat clicks.
  function setHtmlIfChanged(el, html) {
    if (el._lastHtml === html) return;
    el._lastHtml = html;
    el.innerHTML = html;
  }

  // Re-trigger a one-shot animation class. Strip stale fx classes, force reflow, re-add.
  function playSlotFx(el, cls) {
    el.classList.remove('fx-buy', 'fx-drop', 'fx-reject');
    // Force reflow so re-adding the class restarts the animation.
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth;
    el.classList.add(cls);
  }
  // On purchase: fly the current card up + out, then run renderShop and fly the
  // new card in from below. The slot DOM is reused, so we gate renderShop on the
  // fx-fly-up class to keep the outgoing content stable mid-animation.
  function flyOutAndReplace(el) {
    el.classList.remove('fx-content', 'fx-fly-up');
    void el.offsetWidth;
    el.classList.add('fx-fly-up');
    setTimeout(() => {
      el.classList.remove('fx-fly-up');
      renderShop();
      markContentFresh(el);
    }, 170);
  }
  function markContentFresh(el) {
    el.classList.remove('fx-content');
    void el.offsetWidth;
    el.classList.add('fx-content');
  }
  function spawnEchoBurn(el) {
    const c = document.createElement('i');
    c.className = 'ri-broadcast-fill echo-burn';
    el.appendChild(c);
    c.addEventListener('animationend', () => c.remove(), { once: true });
    // Safety fallback if animationend doesn't fire (reduced motion hides it).
    setTimeout(() => { if (c.parentNode) c.remove(); }, 600);
  }

  // Hail win burst — a wave of carrier returning. The card pulses, a triple-arc
  // glyph blooms outward, twelve ringed dots radiate, the page rim glows once.
  // All DOM, all CSS-keyframed, self-collected under one container so a single
  // remove() tears the whole thing down. Total wall-clock budget: 1.2s.
  const winFxRootId = 'winFxRoot';
  function ensureWinFxRoot() {
    let r = document.getElementById(winFxRootId);
    if (!r) {
      r = document.createElement('div');
      r.id = winFxRootId;
      document.body.appendChild(r);
    }
    return r;
  }
  function fireWinBurst(slotEl) {
    const root = ensureWinFxRoot();
    const burst = document.createElement('div');
    burst.className = 'win-burst';
    // Anchor the burst at the centre of the card the player just tapped, so the
    // wave feels like it came *from* the Hail, not from the page.
    const rect = slotEl.getBoundingClientRect();
    burst.style.left = `${rect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top + rect.height / 2}px`;
    // Build the parts: a central glyph, three expanding rings, twelve radiating
    // motes. innerHTML keeps the markup terse — there is no per-element JS.
    const motes = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * 360;
      return `<span class="wb-mote" style="--a:${angle}deg; --d:${80 + (i % 3) * 30}ms"></span>`;
    }).join('');
    burst.innerHTML = `
      <span class="wb-flash"></span>
      <i class="wb-glyph ri-broadcast-fill"></i>
      <span class="wb-ring wb-ring-1"></span>
      <span class="wb-ring wb-ring-2"></span>
      <span class="wb-ring wb-ring-3"></span>
      ${motes}
    `;
    root.appendChild(burst);
    // Card-level kick: a glow halo on the slot itself so the card stays a
    // present, on-stage object inside the burst.
    slotEl.classList.add('fx-win-glow');
    setTimeout(() => slotEl.classList.remove('fx-win-glow'), 900);
    // Cleanup after the longest sub-animation. setTimeout guards against
    // animationend not firing under reduced-motion or backgrounded tabs.
    setTimeout(() => { if (burst.parentNode) burst.remove(); }, 1300);
  }

  // Lightweight toast — used by the stall-help grant. Stacks bottom-right; each
  // row fades itself out after a few seconds. No queue, no priority, no state.
  const toastsEl = document.getElementById('toasts');
  function showToast(text) {
    if (!toastsEl) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    toastsEl.appendChild(t);
    // Trigger the entrance transition on the next frame.
    requestAnimationFrame(() => t.classList.add('toast-in'));
    setTimeout(() => { t.classList.remove('toast-in'); t.classList.add('toast-out'); }, 4200);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 5000);
  }

  // After a purchase, wait 5–10s and check whether the cheapest next slot is
  // far enough out to warrant a free Re-tune. The delay is deliberate: the
  // grant should *feel* like Sera reaching across the gap rather than a reward
  // dispensed by the click.
  let pendingFreeRerollTimer = null;
  function scheduleFreeRerollCheck() {
    if (!state.shop.rerollUnlocked) return;
    if (pendingFreeRerollTimer != null) {
      clearTimeout(pendingFreeRerollTimer);
      pendingFreeRerollTimer = null;
    }
    const delay = 5000 + Math.floor(Math.random() * 5000);
    pendingFreeRerollTimer = setTimeout(() => {
      pendingFreeRerollTimer = null;
      const added = grantFreeRerollsForStall(state, nowSeconds());
      if (added > 0) {
        // voice: Sera. Second person, procedural, periods only. She has read
        // the wait off the rig; the grant is an observation, not a reward.
        const msg = added === 1
          ? 'Your carrier is sitting on a long wait. One free re-roll is on the file.'
          : `Your carrier is sitting on a long wait. ${added} free re-rolls are on the file.`;
        showToast(msg);
        renderShop();
      }
    }, delay);
  }
  // Single delegated handler to clear fx classes after they finish so they don't leak.
  slotsEl.addEventListener('animationend', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    if (e.animationName === 'slot-buy' || e.animationName === 'slot-flash') slot.classList.remove('fx-buy');
    if (e.animationName === 'slot-drop' || e.animationName === 'slot-flash') slot.classList.remove('fx-drop');
    if (e.animationName === 'slot-reject' || e.animationName === 'slot-flash') slot.classList.remove('fx-reject');
    if (e.animationName === 'slot-content-in') {
      slot.classList.remove('fx-content');
    }
    if (e.animationName === 'slot-content-out') {
      slot.classList.remove('fx-fly-up');
    }
  });

  const slotsLeftBtn = document.getElementById('slotsLeft');
  const slotsRightBtn = document.getElementById('slotsRight');
  function updateSlotsNav() {
    const max = slotsEl.scrollWidth - slotsEl.clientWidth;
    const overflow = max > 1;
    slotsLeftBtn.classList.toggle('hidden', !overflow || slotsEl.scrollLeft <= 0);
    slotsRightBtn.classList.toggle('hidden', !overflow || slotsEl.scrollLeft >= max - 1);
  }
  function scrollSlotsBy(dir) {
    const step = Math.max(slotsEl.clientWidth * 0.8, 200);
    slotsEl.scrollBy({ left: dir * step, behavior: 'smooth' });
  }
  installTap(slotsLeftBtn, () => scrollSlotsBy(-1));
  installTap(slotsRightBtn, () => scrollSlotsBy(1));
  slotsEl.addEventListener('scroll', updateSlotsNav, { passive: true });
  slotsEl.addEventListener('wheel', (e) => {
    const dy = e.deltaY;
    if (!dy) return;
    const max = slotsEl.scrollWidth - slotsEl.clientWidth;
    if (max <= 1) return;
    e.preventDefault();
    slotsEl.scrollLeft += dy;
  }, { passive: false });
  new ResizeObserver(updateSlotsNav).observe(slotsEl);

  const toolbarEl = document.getElementById('shopToolbar');

  const slotEls = [];
  function ensureSlotEls() {
    while (slotEls.length < state.shop.slotsUnlocked) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `
        <button class="pin" type="button" aria-label="Lock"><i class="ri ri-pushpin-2-fill"></i></button>
        <div class="head">
          <i class="kind-icon"></i>
          <div class="rarity"></div>
        </div>
        <div class="name"></div>
        <div class="desc"></div>
        <div class="cost"></div>
        <div class="outcomes"></div>
        <div class="meta"></div>
        <div class="foot">
          <button class="slot-info" type="button" aria-label="Details"><i class="ri ri-information-line"></i></button>
        </div>
      `;
      installTap(el, (_e, target) => {
        const idx = slotEls.indexOf(el);
        if (target.closest('.pin')) {
          const r = tryTogglePin(state, idx);
          if (r.ok) renderShop();
          return;
        }
        if (target.closest('.slot-info')) { openSlotModal(idx); return; }
        // Block taps on a gamble slot while a WIN/LOSS banner is on screen —
        // double-rolling through the reveal is jarring and lets the player
        // stack overlapping bursts. Non-gamble slots still buy through.
        if (isGambleFxActive()) {
          const slot = state.shop.slots[idx];
          const u = slot ? resolveUpgrade(slot) : null;
          if (u && u.kind === 'gamble') return;
        }
        const res = tryBuy(state, idx, nowSeconds());
        if (res.ok) {
          // Gambles get the dramatic centred reveal flow — gravity pull, hold,
          // then a WIN/LOSS banner with a green burst or a quiet fall. The
          // ordinary fly-up/fly-in card swap is replaced by an onMid callback
          // that triggers renderShop midway through the burst so the new card
          // appears while the banner is the focal point. Non-gamble purchases
          // keep the existing per-card fly-up animation.
          if (res.result) {
            // Skip the local fx-buy scale-pulse and echo-glyph float — both
            // would scribble over the inline transforms the gravity pull
            // applies to this card. The centred banner is the feedback.
            const won = !!res.result.won;
            const deltaText = formatAbbrev(Math.abs(res.result.delta || 0));
            fireGambleResult({
              tappedEl: el,
              won,
              deltaText,
              onMid: () => { renderShop(); markContentFresh(el); },
              onStart: () => {
                triggerGambleFx({ won, durationMs: 1400, now: nowSeconds() });
              },
            });
            // Keep the card-anchored ring burst as a secondary flourish on
            // wins — it blooms around the tapped card while the central
            // banner pops, composing rather than competing.
            if (won) fireWinBurst(el);
          } else {
            playSlotFx(el, 'fx-buy'); spawnEchoBurn(el); flyOutAndReplace(el);
          }
          scheduleFreeRerollCheck();
        } else { playSlotFx(el, 'fx-reject'); }
      });
      if (unlockSlotEl && unlockSlotEl.parentNode === slotsEl) {
        slotsEl.insertBefore(el, unlockSlotEl);
      } else {
        slotsEl.appendChild(el);
      }
      slotEls.push(el);
      // Fly the brand-new slot in from below on first paint.
      requestAnimationFrame(() => markContentFresh(el));
    }
    while (slotEls.length > state.shop.slotsUnlocked) {
      const el = slotEls.pop();
      el.remove();
    }
  }

  // Preview of what kind of upgrade slot N will roll. Mirrors SLOT_FILTERS in
  // upgrades.js. Slots past the pinned set ("any") show a neutral wildcard.
  const SLOT_PREVIEW = [
    { icon: KIND_THEME.permanent.icon, color: KIND_THEME.permanent.color, label: KIND_THEME.permanent.label },
    { icon: KIND_THEME.permanent.icon, color: KIND_THEME.permanent.color, label: KIND_THEME.permanent.permLabel },
    { icon: KIND_THEME.buff.icon,      color: KIND_THEME.buff.color,      label: KIND_THEME.buff.label },
    { icon: KIND_THEME.gamble.icon,    color: KIND_THEME.gamble.color,    label: KIND_THEME.gamble.label },
    { icon: KIND_THEME.buff.icon,      color: KIND_THEME.buff.color,      label: 'Surge' },
  ];
  const SLOT_PREVIEW_ANY = { icon: 'ri-shuffle-line', color: '#8aa0ff', label: 'Any' };
  function slotPreview(idx) { return SLOT_PREVIEW[idx] || SLOT_PREVIEW_ANY; }

  const unlockSlotEl = document.createElement('div');
  unlockSlotEl.className = 'slot slot-unlock';
  unlockSlotEl.innerHTML = `
    <div class="head">
      <i class="kind-icon"></i>
      <div class="rarity">Locked</div>
    </div>
    <div class="name"></div>
    <div class="desc">Open a new band. The next card lands here.</div>
    <div class="cost"></div>
    <div class="outcomes"></div>
    <div class="meta"></div>
    <div class="foot"></div>
  `;
  installTap(unlockSlotEl, () => {
    const res = tryUnlockSlot(state, nowSeconds());
    if (res.ok) { playSlotFx(unlockSlotEl, 'fx-buy'); renderShop(); }
    else { playSlotFx(unlockSlotEl, 'fx-reject'); }
  });
  slotsEl.appendChild(unlockSlotEl);

  const SHOP_UNLOCK_AT = 100;
  let shopUnlocked = state.amount > SHOP_UNLOCK_AT;

  // Stable toolbar buttons. Rewriting innerHTML every HUD tick would race with
  // mousedown/mouseup and prevent clicks from firing.
  function makeTbBtn(act, icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn';
    b.dataset.act = act;
    b.innerHTML = `<i class="ri ${icon}"></i><span class="tb-label"></span>`;
    toolbarEl.appendChild(b);
    return b;
  }
  const tbButtons = {
    'free-reroll':   makeTbBtn('free-reroll',   'ri-refresh-line'),
    'reroll':        makeTbBtn('reroll',        'ri-refresh-line'),
    'unlock-reroll': makeTbBtn('unlock-reroll', 'ri-refresh-line'),
    'unlock-pin':    makeTbBtn('unlock-pin',    'ri-pushpin-2-fill'),
  };
  tbButtons['free-reroll'].classList.add('tb-free');
  function setTbBtn(act, visible, locked, label) {
    const b = tbButtons[act];
    b.style.display = visible ? '' : 'none';
    if (!visible) return;
    b.classList.toggle('locked', !!locked);
    setHtmlIfChanged(b.querySelector('.tb-label'), label);
  }

  function renderToolbar() {
    const rerollUnlockVisible = !state.shop.rerollUnlocked && state.amount >= REROLL_UNLOCK_AT;
    const rerollVisible = state.shop.rerollUnlocked;
    setTbBtn('unlock-reroll', rerollUnlockVisible,
      rerollUnlockVisible && state.amount < REROLL_UNLOCK_COST,
      `Unlock Re-roll · <span class="cc">${ECHO_ICON}${formatAbbrev(REROLL_UNLOCK_COST)}</span>`);
    if (rerollVisible) {
      const n = countRerollableForUi();
      const cost = computeRerollCost(state, nowSeconds(), n);
      setTbBtn('reroll', true, !(n > 0 && state.amount >= cost && state.amount > 0),
        `Re-roll ${n} · <span class="cc">${ECHO_ICON}${formatAbbrev(cost)}</span>`);
    } else {
      setTbBtn('reroll', false, false, '');
    }

    const freeCount = state.freeRerolls || 0;
    const freeVisible = rerollVisible && freeCount > 0;
    const freeN = freeVisible ? countRerollableForUi() : 0;
    setTbBtn('free-reroll', freeVisible, freeVisible && freeN === 0,
      `<i class="ri ri-gift-fill"></i> Free Re-roll (${freeCount})`);

    // Lock Bands — the button cycles through five tiers; each buy increments
    // state.shop.pinSlots and reveals the next tier's price. Once tier 5 lands
    // the button retreats. Label uses Roman numerals so the progression reads
    // at a glance (Lock Bands · I/II/III/IV/V).
    const pinCost = nextPinTierCost(state);
    const pinOwned = state.shop.pinSlots || 0;
    const pinVisible = state.shop.rerollUnlocked && pinCost != null && state.amount >= PIN_UNLOCK_AT;
    const tierRoman = ['I', 'II', 'III', 'IV', 'V'][pinOwned] || '';
    const pinLabel = `Lock Bands ${tierRoman} · <span class="cc">${ECHO_ICON}${formatAbbrev(pinCost || 0)}</span>`;
    setTbBtn('unlock-pin', pinVisible, pinVisible && state.amount < (pinCost || 0), pinLabel);

    const anyVisible = rerollUnlockVisible || rerollVisible || pinVisible || freeVisible;
    toolbarEl.style.display = anyVisible ? '' : 'none';
  }

  function countRerollableForUi() {
    let n = 0;
    for (let i = 0; i < state.shop.slots.length; i++) {
      if (isSlotPinned(state, i)) continue;
      if (state.shop.slots[i]) n++;
    }
    return n;
  }

  // Tap-stable: the toolbar buttons (reroll, unlock-pin, unlock-reroll) share
  // the same iOS Chrome failure mode as the upgrade cards — renderShop rewrites
  // their innerHTML every 100ms, and a tap whose pointerdown lands on a child
  // that gets replaced before pointerup drops the synthetic click.
  installTap(toolbarEl, (_e, target) => {
    const btn = target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    let res;
    if (act === 'unlock-reroll') res = tryUnlockReroll(state);
    else if (act === 'unlock-pin') res = tryUnlockPinTier(state);
    else if (act === 'reroll' || act === 'free-reroll') {
      res = tryReroll(state, nowSeconds());
      if (res.ok) {
        for (let i = 0; i < slotEls.length; i++) {
          if (isSlotPinned(state, i)) continue;
          markContentFresh(slotEls[i]);
        }
      }
    }
    if (res && res.ok) renderShop();
  });

  // Per-buffType swatch for the shop card. Mirrors the glyph + colour the live
  // buff renders with (BUFF_ICONS below + the .kind-* CSS), so buying a Hunch
  // previews the same red sparkles you'll see in the buff bar a moment later.
  const BUFF_TYPE_THEME = {
    rateMul:       { icon: 'ri-flashlight-fill',  color: '#9d6ee0' },
    gambleLuck:    { icon: 'ri-sparkling-2-fill', color: '#ff5a6e' },
    gambleCushion: { icon: 'ri-shield-fill',      color: '#ff8a8a' },
    compound:      { icon: 'ri-stack-fill',       color: '#7c5ad4' },
    metaStrength:  { icon: 'ri-flashlight-line',  color: '#c084ff' },
    metaDuration:  { icon: 'ri-time-line',        color: '#9d6ee0' },
    metaLuck:      { icon: 'ri-sparkling-2-line', color: '#d8a5f0' },
  };

  function renderShop() {
    const now = nowSeconds();
    if (!shopUnlocked && state.amount > SHOP_UNLOCK_AT) shopUnlocked = true;
    const shopEl = document.getElementById('shop');
    if (shopEl) shopEl.style.display = shopUnlocked ? '' : 'none';
    if (!shopUnlocked) return;
    ensureSlotEls();
    renderToolbar();
    for (let i = 0; i < state.shop.slotsUnlocked; i++) {
      const slot = state.shop.slots[i];
      const u = slot ? resolveUpgrade(slot) : null;
      const el = slotEls[i];
      if (!u || !slot) { el.style.display = 'none'; continue; }
      // While the card is flying up after a purchase, freeze its rendering so the
      // outgoing content stays put. renderShop fires every 100ms; without this the
      // mid-animation HUD tick would swap in the new card under the fly-up motion.
      if (el.classList.contains('fx-fly-up')) continue;
      el.style.display = '';
      // Pattern: Patched Frame doubles charged-purchase cost. Display the
      // post-pattern price so the cost cell matches what tryBuy will deduct.
      // Gambles (wager %) and gifts (free) skip the multiplier — keep slot.cost.
      const isChargedKind = u.kind !== 'gamble' && u.kind !== 'gift';
      const cost = isChargedKind ? slot.cost * patternPurchaseCostMul(state) : slot.cost;
      const cdLeft = u.kind === 'gamble' ? (state.gambleCd[u.id] || 0) - now : 0;
      const theme = KIND_THEME[u.kind] || {};
      const buffTheme = u.kind === 'buff' ? BUFF_TYPE_THEME[u.buffType] : null;
      el.dataset.kind = u.kind;
      // Tint the whole slot (icon + border + glow) per buffType. The
      // data-kind="buff" CSS rule derives --kind-border/--kind-glow from
      // --kind-color via color-mix, so overriding the colour alone shifts
      // border + buy-pulse to match.
      if (buffTheme) el.style.setProperty('--kind-color', buffTheme.color);
      else el.style.removeProperty('--kind-color');
      const iconEl = el.querySelector('.kind-icon');
      iconEl.className = `kind-icon ri ${(buffTheme || theme).icon || ''}`;
      iconEl.style.color = buffTheme ? buffTheme.color : '';
      el.querySelector('.rarity').textContent = `${u.rarity} · ${kindLabel(u)}`;
      el.querySelector('.rarity').className = `rarity rarity-${u.rarity}`;
      el.querySelector('.name').textContent = u.name;
      el.querySelector('.desc').textContent = u.desc;
      // Pattern free-purchase coverage applies to any non-hail, non-bleed slot.
      // Surface it as "FREE" on the cost cell so the player sees the charge being
      // used before they tap.
      const patternFree = (state.patternFreeLeft || 0) > 0 && u.kind !== 'gamble' && u.kind !== 'gift';
      const costHtml = u.kind === 'gift'
        ? 'FREE'
        : patternFree
          ? `<span class="cc">FREE</span> <span class="cc-strike">${ECHO_ICON}${formatAbbrev(cost)}</span>`
          : `${ECHO_ICON}${formatAbbrev(cost)}`;
      setHtmlIfChanged(el.querySelector('.cost'), costHtml);

      let outcomes = '';
      if (u.kind === 'gamble') {
        const winNet = cost * (u.payout - 1);
        // Effective chance: base + active Carry windows + pattern luck bonus, clamped at CAP.
        // This is the same number tryBuy rolls against, so what the player reads is reality.
        const effChance = effectiveGambleChance(state, u, now);
        const winPct = fmtPct(effChance);
        const losePct = fmtPct(1 - effChance);
        outcomes =
          `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> <span class="cc">${ECHO_ICON}+${formatAbbrev(winNet)}</span> · ${winPct}</div>` +
          `<div class="outcome lose"><i class="ri ri-arrow-down-line"></i> <span class="cc">${ECHO_ICON}−${formatAbbrev(cost)}</span> · ${losePct}</div>`;
      } else if (u.kind === 'convert') {
        // Convert no longer credits flatBonus on purchase — the burn buys a
        // placement token. Preview what the token will be worth before sector
        // and clustering multipliers. Yield uses the rolled cost (slot.cost),
        // not the pattern-scaled price — Patched Frame doubles the price
        // without doubling the yield, so the preview must match.
        const baseAdd = (state.basePerSecond || 0) + (state.flatBonus || 0);
        const tokenYield = convertYieldFor(u, slot.cost, baseAdd);
        outcomes = `<div class="outcome win"><i class="ri ri-add-circle-line"></i> Queue token · +${formatAbbrev(tokenYield)}/s base</div>`;
      } else if (u.kind === 'permanent' && (u.permType === 'add' || u.permType === 'mul')) {
        const eff = marginalRateForPurchase(state, slot, now);
        outcomes = `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> +${formatAbbrev(eff)}/s effective</div>`;
      } else if (u.kind === 'drift') {
        // Drift previews the offline-only multiplier — never lies about a
        // foreground /s gain (it doesn't move foreground rate).
        const pct = Math.round((u.value - 1) * 100);
        outcomes = `<div class="outcome win"><i class="ri ri-moon-line"></i> +${pct}% offline gain</div>`;
      } else if (u.kind === 'coil') {
        // Show the current → post-purchase Mesh-Bleed drop chance for a sweep
        // token. Cap announced inline so the player sees the ceiling.
        const ownedN = state.owned[COIL_ID] || 0;
        const curr = ownedN <= 0 ? 0 : Math.min(COIL_DROP_PMAX, COIL_DROP_K * Math.log(1 + ownedN));
        const next = Math.min(COIL_DROP_PMAX, COIL_DROP_K * Math.log(2 + ownedN));
        const fmt = (x) => `${(x * 100).toFixed(1)}%`;
        outcomes = `<div class="outcome win"><i class="ri ri-shuffle-line"></i> ${fmt(curr)} → ${fmt(next)} sweep-drop per Mesh Bleed</div>`;
      } else if (u.kind === 'gift') {
        outcomes = `<div class="outcome win"><i class="ri ri-arrow-up-line"></i> <span class="cc">${ECHO_ICON}+${formatAbbrev(u.reward)}</span></div>`;
      }
      setHtmlIfChanged(el.querySelector('.outcomes'), outcomes);

      let meta = '';
      if (u.kind === 'gamble' && cdLeft > 0) meta = `cooldown ${cdLeft.toFixed(1)}s`;
      else if ((u.kind === 'permanent' || u.kind === 'drift' || u.kind === 'coil') && state.owned[u.id]) meta = `owned ×${state.owned[u.id]}`;
      el.querySelector('.meta').textContent = meta;
      const pinEl = el.querySelector('.pin');
      pinEl.style.display = (state.shop.pinSlots || 0) > 0 ? '' : 'none';
      el.classList.toggle('pinned', isSlotPinned(state, i));
      const canAfford = state.amount >= cost;
      el.classList.toggle('locked', !canAfford || cdLeft > 0);
    }
    renderUnlockSlot();
    updateSlotsNav();
  }

  function renderUnlockSlot() {
    const cost = nextSlotUnlockCost(state);
    if (cost == null) { unlockSlotEl.style.display = 'none'; return; }
    unlockSlotEl.style.display = '';
    const idx = state.shop.slotsUnlocked;
    const p = slotPreview(idx);
    unlockSlotEl.style.setProperty('--kind-color', p.color);
    unlockSlotEl.style.setProperty('--kind-border', p.color);
    unlockSlotEl.style.setProperty('--kind-glow', p.color);
    unlockSlotEl.querySelector('.kind-icon').className = `kind-icon ri ${p.icon}`;
    const rarityEl = unlockSlotEl.querySelector('.rarity');
    rarityEl.textContent = `Slot ${idx + 1} · ${p.label}`;
    rarityEl.className = 'rarity';
    unlockSlotEl.querySelector('.name').textContent = 'Unlock';
    setHtmlIfChanged(unlockSlotEl.querySelector('.cost'),
      `${ECHO_ICON}${formatAbbrev(cost)}`);
    unlockSlotEl.classList.toggle('locked', state.amount < cost);
  }

  const BUFF_ICONS = {
    rate:     'ri-flashlight-fill',
    luck:     'ri-sparkling-2-fill',
    cushion:  'ri-shield-fill',
    compound: 'ri-stack-fill',
  };

  // Kind → category copy reused by the per-buff detail modal. Mirrors the
  // #buffModal blurbs but tightened for the single-effect view — the "How"
  // line bridges the lore label to the mechanic so a player meeting an
  // effect for the first time knows what to do with it.
  const BUFF_KIND_DESC = {
    rate:     'A Carrier window. Production multiplies for the duration. Multiple Carriers stack multiplicatively (×3 × ×3 = ×9).',
    luck:     'A Carry window. Adds % to Hail win-chance for the duration. Stacks additively with other Carries.',
    cushion:  'A Buffer window. Returns % of a failed Hail wager. Stacks additively with other Buffers, capped at 100%.',
    compound: 'A Resonance window. Your multiplier climbs from ×1 every second it holds. The shown value is the current state.',
  };

  // Named provenance for distinctive buffs minted outside the upgrade-purchase
  // path. Keyed by the `sourceId` we stamp onto the buff record at spawn time.
  // Falls back to the kind-category labels.
  const BUFF_SOURCES = {
    wake:       { name: 'Wake',       desc: 'A standing nudge at every cycle open — the rig pings itself awake.' },
    quick_wake: { name: 'Quick Wake', desc: 'A Carrier Engraving. Each new cycle opens with the carrier already warm.' },
  };

  function kindName(kind) {
    if (kind === 'rate') return 'Carrier';
    if (kind === 'luck') return 'Carry';
    if (kind === 'cushion') return 'Buffer';
    if (kind === 'compound') return 'Resonance';
    return '';
  }
  function buffDescriptor(kind, source) {
    if (source && BUFF_SOURCES[source]) return BUFF_SOURCES[source];
    return { name: kindName(kind), desc: BUFF_KIND_DESC[kind] || '' };
  }

  const buffDetailModalEl = document.getElementById('buffDetailModal');
  const buffDetailTitleEl = document.getElementById('buffDetailTitle');
  const buffDetailBodyEl = document.getElementById('buffDetailBody');
  const closeBuffDetailModal = () => buffDetailModalEl.classList.remove('open');
  installTap(buffDetailModalEl, (e) => {
    if (e.target === buffDetailModalEl || e.target.closest('.bm-close')) { closeBuffDetailModal(); return; }
    if (e.target.closest('[data-act="open-buff-overview"]')) openBuffModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && buffDetailModalEl.classList.contains('open')) closeBuffDetailModal();
  });

  // Snapshots of the active buffs in the order they were rendered. A tap on
  // a collapsed tile reads its `data-idx` and pulls the matching record.
  let renderedBuffs = [];

  function openBuffDetail(idx) {
    const b = renderedBuffs[idx];
    if (!b) return;
    const remain = Math.max(0, b.expiresAt - nowSeconds());
    const dur = b.duration;
    const pct = Math.max(0, Math.min(1, remain / dur));
    buffDetailTitleEl.textContent = b.title;
    buffDetailBodyEl.innerHTML = `
      <section class="bm-section kind-${b.kind}">
        <div class="bm-section-head">
          <i class="ri ${BUFF_ICONS[b.kind]}"></i>
          <span class="bm-section-name">${kindName(b.kind)}</span>
        </div>
        <p class="bm-section-desc">${b.desc}</p>
        <div class="slot-modal-row"><span>Current</span><span class="buff-val">${b.value}</span></div>
        <div class="slot-modal-row"><span>Time left</span><span>${fmtDuration(remain)}</span></div>
        <div class="slot-modal-row"><span>Duration</span><span>${fmtDuration(dur)}</span></div>
        <div class="buff-bar" style="margin-top:10px;"><div class="buff-bar-fill" style="width:${pct * 100}%"></div></div>
      </section>
      <button type="button" class="bm-link" data-act="open-buff-overview">Compare all four Window kinds <i class="ri ri-arrow-right-s-line"></i></button>
    `;
    buffDetailModalEl.classList.add('open');
  }

  // Tap-stable: buff-tile, buff-stack-card, and buff-info all live inside
  // #buffs and get their innerHTML rewritten by renderBuffs on each 100ms tick.
  installTap(buffsEl, (_e, target) => {
    if (target.closest('.buff-info')) { openBuffModal(); return; }
    if (target.closest('.buff-combined')) { openBuffModal(); return; }
    const hit = target.closest('.buff-tile, .buff-stack-card');
    if (!hit) return;
    const idx = Number(hit.dataset.idx);
    if (Number.isInteger(idx)) openBuffDetail(idx);
  });

  // Expansion via JS class instead of :hover. :hover hit-tests against the
  // group's current bounding box, which shrinks mid-transition — cursor falls
  // off, hover toggles, layout flickers. mouseover/mouseout fire only on real
  // cursor crossings, and we persist expandedBuffKind across the 100ms
  // re-render so the class survives innerHTML rewrites.
  let expandedBuffKind = null;
  buffsEl.addEventListener('mouseover', (e) => {
    const group = e.target.closest('.buff-group');
    if (!group) return;
    if (group.contains(e.relatedTarget)) return;
    for (const g of buffsEl.querySelectorAll('.buff-group.is-expanded')) g.classList.remove('is-expanded');
    group.classList.add('is-expanded');
    expandedBuffKind = group.dataset.kind;
  });
  buffsEl.addEventListener('mouseout', (e) => {
    const group = e.target.closest('.buff-group');
    if (!group) return;
    if (group.contains(e.relatedTarget)) return;
    group.classList.remove('is-expanded');
    if (expandedBuffKind === group.dataset.kind) expandedBuffKind = null;
  });

  function renderBuffs(now) {
    const items = [];
    const tiles = [];
    // groups[kind] collects every active buff per kind so each stack
    // renders as one combined card + N individuals peeking underneath.
    const groups = { rate: [], luck: [], cushion: [], compound: [] };
    const b = state.buffs;
    const push = (kind, value, numeric, remain, duration, sourceId) => {
      const pct = Math.max(0, Math.min(1, remain / duration));
      const icon = BUFF_ICONS[kind] || '';
      const { name, desc } = buffDescriptor(kind, sourceId);
      const idx = items.length;
      items.push({ kind, value, duration, expiresAt: now + remain, title: name, desc });
      groups[kind].push({ idx, value, numeric, remain, duration, pct, icon, name });
      tiles.push(`
        <button type="button" class="buff-tile kind-${kind}" data-idx="${idx}" aria-label="${name} ${value}">
          <div class="buff-tile-bar" style="transform: scaleX(${pct});"></div>
          <div class="buff-tile-fg">
            <i class="ri ri-fw ${icon} buff-tile-glyph"></i>
            <span class="buff-tile-val">${value}</span>
          </div>
        </button>
      `);
    };
    const active = (list) => list.filter((x) => x.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
    for (const x of active(b.rateMul))       push('rate',     `×${fmtMult(x.value)}`,                                  x.value,                                      x.expiresAt - now, x.duration, x.sourceId);
    for (const x of active(b.gambleLuck))    push('luck',     `+${Math.round(x.value * 100)}%`,                       x.value,                                      x.expiresAt - now, x.duration, x.sourceId);
    for (const x of active(b.gambleCushion)) push('cushion',  `${Math.round(x.value * 100)}%`,                        x.value,                                      x.expiresAt - now, x.duration, x.sourceId);
    for (const x of active(b.compound))      push('compound', `×${Math.pow(1 + x.rate, now - x.startedAt).toFixed(2)}`, Math.pow(1 + x.rate, now - x.startedAt),     x.expiresAt - now, x.duration, x.sourceId);

    const cardHtml = (g, extraClass = '', extraAttrs = '') => {
      // Combined card with 2+ stacked buffs shows one mini bar per buff,
      // sized proportionally to remaining time. The single time + bar pair
      // is reserved for the count-1 combined card and the individual cards
      // inside the expand popup, where one buff = one progress readout.
      const tail = g.bars && g.bars.length > 1
        ? `<div class="buff-bars-multi">${g.bars.map((b) => `<div class="buff-mini" style="flex:${Math.max(b.remain, 0.001)};"></div>`).join('')}</div>`
        : `<div class="buff-time"><i class="ri ri-fw ri-time-line"></i> ${fmtDuration(g.remain)}</div>
           <div class="buff-bar"><div class="buff-bar-fill" style="width:${g.pct * 100}%"></div></div>`;
      // Numeric stack-count badge only on the combined card with 2+ buffs.
      // The multi-bar already encodes count visually, but a number reads
      // faster at a glance when bars are tightly packed. Lives as its own
      // flex item (not inside .buff-name) so it survives the name truncation
      // when value or name are wide.
      const count = g.count > 1
        ? `<span class="buff-count">×${g.count}</span>`
        : '';
      return `
        <div class="buff-card kind-${g.kind || ''} ${extraClass}" ${extraAttrs}>
          <div class="buff-head">
            <span class="buff-name"><i class="ri ri-fw ${g.icon}"></i><span class="buff-name-text">${g.name}</span></span>
            ${count}
            <button type="button" class="buff-info" aria-label="What does this do?"><i class="ri ri-information-line"></i></button>
            <span class="buff-val">${g.value}</span>
          </div>
          ${tail}
        </div>
      `;
    };
    const combine = (kind, list) => {
      // rate + compound are multiplicative; luck + cushion are additive percents.
      let value, numeric;
      if (kind === 'rate' || kind === 'compound') {
        numeric = list.reduce((acc, x) => acc * x.numeric, 1);
        value = `×${numeric.toFixed(2)}`;
      } else {
        numeric = list.reduce((acc, x) => acc + x.numeric, 0);
        const pct = Math.round(numeric * 100);
        value = kind === 'luck' ? `+${pct}%` : `${pct}%`;
      }
      // Soonest-expiring still drives `remain` for any single-bar fallback.
      // The multi-bar render uses the per-buff `bars` list instead.
      const soon = list.reduce((a, x) => (x.remain < a.remain ? x : a), list[0]);
      const bars = list.map((x) => ({ remain: x.remain }));
      return { kind, icon: list[0].icon, name: kindName(kind), value, remain: soon.remain, duration: soon.duration, pct: soon.pct, bars, count: list.length };
    };

    const groupHtml = [];
    for (const kind of ['rate', 'luck', 'cushion', 'compound']) {
      const list = groups[kind];
      if (!list.length) continue;
      const combined = combine(kind, list);
      const inner = list.map((g) => cardHtml({ ...g, kind }, 'buff-stack-card', `data-idx="${g.idx}"`)).join('');
      groupHtml.push(`
        <div class="buff-group kind-${kind}" data-kind="${kind}" data-count="${list.length}">
          ${cardHtml(combined, 'buff-combined')}
          <div class="buff-stack">${inner}</div>
        </div>
      `);
    }
    renderedBuffs = items;
    buffsEl.style.display = items.length ? 'flex' : 'none';
    buffsEl.innerHTML = groupHtml.join('') + tiles.join('');
    if (expandedBuffKind) {
      const g = buffsEl.querySelector(`.buff-group[data-kind="${expandedBuffKind}"]`);
      if (g) g.classList.add('is-expanded');
      else expandedBuffKind = null;
    }
  }

  const META_DEFS = {
    metaStrength: { kind: 'strength', icon: 'ri-flashlight-line',    fmt: (v) => `×${fmtMult(v)}` },
    metaDuration: { kind: 'duration', icon: 'ri-time-line',          fmt: (v) => `×${fmtMult(v)}` },
    metaLuck:     { kind: 'luck',     icon: 'ri-sparkling-2-line',   fmt: (v) => `+${Math.round(v * 100)}%` },
  };

  function renderMetaBuffs(now) {
    const b = state.buffs;
    if (!b.metaStrength && !b.metaDuration && !b.metaLuck) {
      metaBuffsEl.style.display = 'none';
      return;
    }
    const pills = [];
    for (const key of ['metaStrength', 'metaDuration', 'metaLuck']) {
      const def = META_DEFS[key];
      const list = (b[key] || []).filter((x) => x.expiresAt > now)
        .sort((a, c) => a.expiresAt - c.expiresAt);
      for (const x of list) {
        const remain = Math.max(0, x.expiresAt - now);
        const pct = Math.max(0, Math.min(1, remain / x.duration));
        pills.push(`
          <span class="meta-pill kind-${def.kind}">
            <span class="meta-bar" style="transform: scaleX(${pct});"></span>
            <span class="meta-fg">
              <i class="ri ${def.icon}"></i>
              <span class="meta-val">${def.fmt(x.value)}</span>
              <span class="meta-time">${fmtDuration(remain)}</span>
            </span>
          </span>
        `);
      }
    }
    metaBuffsEl.style.display = pills.length ? 'flex' : 'none';
    setHtmlIfChanged(metaBuffsEl, pills.join(''));
  }

  const anomalyEl = document.getElementById('anomalyCounter');
  let _anomalyLast = -1;
  function renderAnomaly() {
    if (!anomalyEl) return;
    const n = (state.messages && state.messages.stats && state.messages.stats.anomaly) || 0;
    if (n === _anomalyLast) return;
    _anomalyLast = n;
    // Zero-padded 4 digits: visually quiet, escalates without changing layout.
    anomalyEl.textContent = n > 0 ? String(n).padStart(4, '0') : '';
  }

  return {
    renderHud(t) {
      renderShop();
      renderBuffs(t);
      renderMetaBuffs(t);
      renderAnomaly();
    },
    showToast,
    syncInputsToState() {
      amountInput.value = formatAbbrev(state.amount);
      rateInput.value = formatAbbrev(state.basePerSecond);
    },
    renderShop,
  };
}
