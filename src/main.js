import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { HeroDisplay } from './hero.js';
import { formatAbbrev } from './bignum.js';
import { getUpgrade, buildSlot } from './upgrades.js';
import {
  makeShopState, effectiveRate, integrateRate, validateSlate,
} from './shop.js';
import { loadState, saveState, clearSave, nowSeconds } from './save.js';
import {
  checkStart, checkAmount, checkEngraving, enqueueFirstCloseBeat,
  scheduleTutorialIfEligible, bindEpisode, enqueueSeasonCompleteBeat,
} from './interstitial.js';
import { makeInterstitialUi } from './interstitialUi.js';
import { initMenu } from './menu.js';
import {
  loadContactLog, saveContactLog, backfillFromShown, closeCycle, memoryMul,
  ascentExp, boneMemoryBonus, quickWakeMul, firstLightAmount, getEngraving, QUICK_WAKE_DURATION,
} from './contactLog.js';
import { initContactLogUi } from './contactLogUi.js';
import { showWelcomeBack } from './welcomeBack.js';
import { initBreakdownUi } from './breakdownUi.js';
import { hasPendingPatternChoice } from './cyclePatterns.js';
import { showPatternSelect } from './patternUi.js';
import { ensureNetwork, tickNetwork, tickBleedDrip, SECTORS } from './network.js';
import { makeNetworkUi } from './networkUi.js';
import { initMainUi } from './mainUi.js';

const state = {
  amount: 0,
  basePerSecond: 0,
  freeRerolls: 0,
  patternFreeLeft: 0,
  ...makeShopState(),
  // The Contact Log persists across save resets — it is the run-accumulating
  // narrative state, separate from the gameplay save.
  contactLog: loadContactLog(),
};
// Derived each session from the log. Drives Echo Memory in the rate math.
state.memoryMul = memoryMul(state.contactLog);
// Carrier Engraving — Ascent. Lifts the whole effective rate by this exponent.
state.ascentExp = ascentExp(state.contactLog);

initMenu();
// Bind the active episode's interstitials (milestone beats + cycle_open) to
// match the cycle the player is loading into. Must run before checkStart so
// any cycle_open/milestone enqueue picks up the EP's content. The active EP
// is derived from the log itself (first incomplete EP), so a cycle that
// closed early continues the same EP next time.
bindEpisode(state.contactLog);
const contactLogUi = initContactLogUi(state, {
  // "Close the Cycle" — the cycle-close action. Wipes the gameplay save, advances the
  // log's run counter so milestones can fire again, leaves the world list
  // (and therefore Echo Memory) intact, banks Carrier Mass against the
  // cycle's peakAmount, then reloads.
  onCloseCycle() {
    const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
    const banked = closeCycle(state.contactLog, peak);
    if (banked === false) return false;
    saveContactLog(state.contactLog);
    clearSave();
    location.reload();
    return true;
  },
  onBuyEngraving(id) {
    // Live updates for engravings whose effect should bite immediately rather
    // than wait for the next cycle. Ascent applies to the rate pipeline now;
    // start-of-cycle grants (First Light, Open Frame, Patched Hands) do not
    // retroactively reshape the current run.
    state.ascentExp = ascentExp(state.contactLog);
    // checkEngraving sets log.firstEngravingSeen, so save *after*.
    checkEngraving(state, id);
    saveContactLog(state.contactLog);
  },
});
const breakdownUi = initBreakdownUi(state);
ensureNetwork(state);
const networkUi = makeNetworkUi(state, {
  openDiagnostic: (tab) => breakdownUi && breakdownUi.open && breakdownUi.open(tab),
});

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a14, 0.025);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 18);
camera.lookAt(0, 6, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 8, 8);
scene.add(key);
const fill = new THREE.PointLight(0x88aaff, 70, 60);
fill.position.set(-6, 0, 6);
scene.add(fill);
const rim = new THREE.PointLight(0xff66cc, 50, 60);
rim.position.set(6, 4, -4);
scene.add(rim);

const display = new MagnitudeDisplay();
scene.add(display.group);

// Map viewport-centre to a world point on the z=0 plane for FX attractors.
// Unprojecting NDC(0,0) gives a ray from the camera; we intersect z=0 along it.
const _attractor = new THREE.Vector3();
const _camDir = new THREE.Vector3();
function unprojectScreenCenterToZ0() {
  _attractor.set(0, 0, 0.5).unproject(camera);
  _camDir.copy(_attractor).sub(camera.position).normalize();
  const tHit = -camera.position.z / _camDir.z;
  _attractor.copy(camera.position).addScaledVector(_camDir, tHit);
  return _attractor;
}

const hero = new HeroDisplay();
scene.add(hero.group);

const shopEl = document.getElementById('shop');
function onResize() {
  const shopRect = shopEl.getBoundingClientRect();
  const shopTop = shopRect.height ? shopRect.top : window.innerHeight;
  document.documentElement.style.setProperty('--shop-h', shopRect.height + 'px');
  const w = window.innerWidth;
  const h = Math.max(240, shopTop - 8);
  renderer.setSize(w, h);
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  display.setVisibleColumns(w <= 820 ? 3 : 5);
}
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(shopEl);

// mainUi owns every DOM-touching surface on the page (HUD inputs, shop slots,
// buffs, toolbar, modals). Initialising it here — after THREE setup so the
// triggerGambleFx closure resolves display/camera correctly — gives us a
// `ui` handle whose methods we call from the bootstrap below and the game loop.
const ui = initMainUi(state, {
  triggerGambleFx: ({ won, durationMs, now }) => {
    const attractor = unprojectScreenCenterToZ0();
    display.triggerGambleFx({ won, durationMs, attractorWorld: attractor, now });
  },
});

const loaded = loadState(state);
// Back-fill the Contact Log from any milestones already marked shown by an
// older code version. One-time, idempotent.
if (loaded && backfillFromShown(state.contactLog, state.messages.shown, nowSeconds()) > 0) {
  saveContactLog(state.contactLog);
}
// Existing players whose log already has worlds predate the First Contact
// beat. Don't surface it retroactively — first contact already happened.
if (state.contactLog.worlds.length > 0 && !state.contactLog.firstContactSeen) {
  state.contactLog.firstContactSeen = true;
  saveContactLog(state.contactLog);
}
checkStart(state, !loaded, loaded ? loaded.offline : 0);
// First close beat — fires once across the player's whole history, on the
// very first fresh boot of a cycle >= 2. The log is the gate (the gameplay
// save is wiped by Close the Cycle, so messages.shown can't carry the flag).
if (!loaded && (state.contactLog.run || 1) >= 2) {
  enqueueFirstCloseBeat(state);
  saveContactLog(state.contactLog);
}
// Season-finale cinematic — fires once across the player's whole history,
// on the first fresh boot after they close cycle 8 (run advances to 9, the
// log enters Echo Loop mode). enqueueSeasonCompleteBeat is the gate; it
// flips the persisted seasonCompleteShown flag and queues the interstitial.
if (!loaded) {
  enqueueSeasonCompleteBeat(state);
  saveContactLog(state.contactLog);
}
if (loaded) {
  ui.syncInputsToState();
  checkAmount(state, state.amount);
  if (loaded.offline > 1) {
    console.log(`[save] welcome back — ${loaded.offline.toFixed(0)}s away, +${formatAbbrev(loaded.earnings)}`);
  }
  if (loaded.networkLosses > 0 && loaded.offline < 60) {
    // Short absences (< 60s) skip the Signal Lock screen entirely, so the
    // toast is the only feedback. Long absences surface losses inside the
    // welcomeBack panel — see showWelcomeBack below.
    const n = loaded.networkLosses;
    setTimeout(() => ui.showToast(`ComDef pulled ${n} relay${n === 1 ? '' : 's'} while you were away.`), 0);
  }
  // Signal Lock — celebratory accounting of what came in while away. Earnings
  // are already credited inside loadState; this screen only displays them.
  showWelcomeBack({
    state,
    offline: loaded.offline,
    // Headline number = everything that landed during the away window —
    // integrated foreground rate (already Drift-multiplied) plus ambient
    // mesh bleed. The breakdown rows explain where each part came from.
    earnings: (loaded.earnings || 0) + (loaded.networkBleed || 0),
    savedAt: loaded.savedAt,
    networkBleed: loaded.networkBleed || 0,
    networkLosses: loaded.networkLosses || 0,
    networkLossDetails: loaded.networkLossDetails || [],
    offlineMul: loaded.offlineMul || 1,
  });
}

// Apply Carrier Engravings (persistent cross-cycle boosts) on a fresh boot.
// Must run before validateSlate so Open Frame's extra band is filled by it.
if (!loaded) {
  state.amount += firstLightAmount(state.contactLog);
  state.flatBonus += boneMemoryBonus(state.contactLog);
  if (getEngraving(state.contactLog, 'patched_hands') > 0) {
    state.shop.rerollUnlocked = true;
  }
  if (getEngraving(state.contactLog, 'open_frame') > 0 && state.shop.slotsUnlocked < 3) {
    state.shop.slotsUnlocked = 3;
    state.shop.slots.push(null);
  }
}

// Fill any empty slots and reroll any items that no longer fit (kind/rate gate).
// Existing slots keep their frozen cost.
validateSlate(state, nowSeconds());

// First-roll seed: slot 1 starts as the cheap starter mul (×1.5, cost ≤ 100).
// Subsequent rerolls/buys fall back to any rarity mul per SLOT_FILTERS.
// Also grant one starting buff: 3× rate for 20 seconds, plus Quick Wake if cut.
if (!loaded) {
  const ctx = { balance: state.amount, rate: state.basePerSecond, owned: state.owned };
  const starterMul = getUpgrade('mult_starter');
  if (starterMul) state.shop.slots[1] = buildSlot(starterMul, ctx);
  const t0 = nowSeconds();
  state.buffs.rateMul.push({ value: 3, duration: 20, expiresAt: t0 + 20, sourceId: 'wake' });
  const qw = quickWakeMul(state.contactLog);
  if (qw > 1) {
    state.buffs.rateMul.push({ value: qw, duration: QUICK_WAKE_DURATION, expiresAt: t0 + QUICK_WAKE_DURATION, sourceId: 'quick_wake' });
  }
  ui.syncInputsToState();
}

// Cycle Pattern chooser — runs on EVERY boot, fresh or loaded. closeCycle sets
// pendingPatternChoice; the only way to clear it is for the player to pick.
// If we gated on !loaded, a reload mid-chooser would lock the player out.
// applyPatternOnFreshBoot is called inside the click handler so seed effects
// land exactly once (the moment of the pick), regardless of fresh/loaded path.
if (hasPendingPatternChoice(state.contactLog)) {
  showPatternSelect(state, () => {
    saveState(state);
  });
}

ui.renderShop();

const interstitialUi = makeInterstitialUi(state, (id) => {
  // After the welcome set closes, schedule the in-theme tutorial. Also fires
  // on every other close — but scheduleTutorialIfEligible is idempotent and
  // gated on welcome.shown && !tutorial_open.shown && cycle === 1, so it is
  // a no-op once the tutorial has been seen.
  if (id === 'welcome') scheduleTutorialIfEligible(state);
});
// Returning players who saw welcome on a previous session but never reached
// the tutorial beat: schedule it now. (The gate inside the scheduler refuses
// to fire it twice.)
scheduleTutorialIfEligible(state);
interstitialUi.drain();

let last = performance.now();
let lastWall = nowSeconds();
let lastHud = 0;
let lastSave = 0;
const SAVE_INTERVAL_MS = 5000;
function tick(raf) {
  const dt = Math.min(0.1, (raf - last) / 1000);
  const dtMs = raf - last;
  last = raf;
  const t = nowSeconds();
  const wallDt = Math.max(0, t - lastWall);
  lastWall = t;

  // Network discovery + ripening pass runs before rate integration so any
  // status changes are reflected in this frame's accrual.
  const losses = tickNetwork(state, wallDt, t);
  for (const r of losses) {
    const sLabel = (SECTORS[r.sector] && SECTORS[r.sector].label) || r.sector;
    ui.showToast(`ComDef pulled a relay in ${sLabel}.`);
  }
  // Sparse-only Bleed drip — isolated relays drop ambient Echoes per their
  // tier's period. Credited directly to balance, no permMul. Visual feedback
  // through the chip so the player sees the sparse-only payoff land.
  const drip = tickBleedDrip(state, wallDt, t);
  if (drip > 0) {
    state.amount += drip;
    networkUi.flashBleed(drip);
  }

  const rate = effectiveRate(state, t);
  const baseRate = ((state.basePerSecond || 0) + state.flatBonus) * state.permMul;
  // Use closed-form integral over wall-clock so backgrounded tabs (where rAF
  // throttles to ~1Hz) and resumes from sleep don't undercount production.
  // Also handles buff start/expiry transitions inside the window.
  // Guard against non-finite accrual — JSON.stringify turns NaN/Infinity into
  // null, so a single bad tick would wipe the balance to 0 on next load.
  const accrual = integrateRate(state, t - wallDt, t);
  if (Number.isFinite(accrual)) state.amount += accrual;
  else console.warn('integrateRate produced non-finite value', accrual);
  checkAmount(state, state.amount);
  // Reflect cycle-complete on the top-right contact-log button. Cheap; just
  // a class toggle. Drives the green pulse + the "ready" hint inside the modal.
  contactLogUi.updateAffordance();

  display.update(state.amount, rate, t, dt);
  hero.update(state.amount, rate, baseRate, dt);
  // Belt-and-braces: an exception inside the interstitial system must not
  // kill the rAF loop. A frozen game-loop ("things stop flowing until I
  // reload") was previously possible if a bad def or step-text producer
  // threw inside tick/drain.
  try { interstitialUi.tick(dtMs); } catch (e) { console.warn('interstitial tick threw', e); }
  try { interstitialUi.drain(); } catch (e) { console.warn('interstitial drain threw', e); }

  if (raf - lastHud > 100) {
    ui.renderHud(t);
    networkUi.refresh();
    lastHud = raf;
  }
  if (raf - lastSave > SAVE_INTERVAL_MS) {
    saveState(state);
    lastSave = raf;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener('beforeunload', () => saveState(state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveState(state);
});
