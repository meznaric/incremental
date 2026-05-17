import * as THREE from 'three';
import { MagnitudeDisplay } from './display.js';
import { HeroDisplay } from './hero.js';
import { formatAbbrev } from './bignum.js';
import { getUpgrade, buildSlot } from './upgrades.js';
import {
  makeShopState, effectiveRate, unbufedEffectiveRate, integrateRate, validateSlate,
} from './shop.js';
import { loadState, saveState, clearSave, nowSeconds } from './save.js';
import {
  checkStart, checkAmount, checkEngraving, enqueueFirstCloseBeat,
  scheduleTutorialIfEligible, bindEpisode, enqueueSeasonCompleteBeat,
  enqueue as enqueueInterstitial,
} from './interstitial.js';
import { makeInterstitialUi } from './interstitialUi.js';
import { runIntroSequence } from './introUi.js';
import { initMenu } from './menu.js';
import {
  loadContactLog, saveContactLog, backfillFromShown, closeCycle, memoryMul,
  ascentExp, boneMemoryBonus, quickWakeMul, firstLightAmount, getEngraving, QUICK_WAKE_DURATION,
} from './contactLog.js';
import { initContactLogUi } from './contactLogUi.js';
import { recordCycleClose } from './gameLog.js';
import { initGameLogUi } from './gameLogUi.js';
import { showWelcomeBack } from './welcomeBack.js';
import { initBreakdownUi } from './breakdownUi.js';
import { hasPendingPatternChoice } from './cyclePatterns.js';
import { showPatternSelect } from './patternUi.js';
import { ensureNetwork, tickNetwork, tickBleedDrip, SECTORS } from './network.js';
import { makeNetworkUi } from './networkUi.js';
import { initMainUi } from './mainUi.js';
import { initDebugUi } from './debugUi.js';
import {
  loadAchievements, saveAchievements, evaluateAchievements, markStat,
} from './achievements.js';
import { initAchievementsUi } from './achievementsUi.js';

const state = {
  amount: 0,
  basePerSecond: 0,
  freeRerolls: 0,
  patternFreeLeft: 0,
  // Wall-clock seconds at which this run began. Persisted in the save so a
  // mid-cycle refresh keeps the timer honest. loadState overrides on resume;
  // fresh boots fall back to this value.
  cycleStartedAt: nowSeconds(),
  ...makeShopState(),
  // The Contact Log persists across save resets — it is the run-accumulating
  // narrative state, separate from the gameplay save.
  contactLog: loadContactLog(),
  // Achievements — under its own localStorage key so unlocks survive every
  // cycle close and every gameplay-save wipe. See achievements.js header.
  achievements: loadAchievements(),
};
// Derived each session from the log. Drives Echo Memory in the rate math.
state.memoryMul = memoryMul(state.contactLog);
// Carrier Engraving — Ascent. Lifts the whole effective rate by this exponent.
state.ascentExp = ascentExp(state.contactLog);

initMenu();
initGameLogUi();
// Bind the active episode's interstitials (milestone beats + cycle_open) to
// match the cycle the player is loading into. Must run before checkStart so
// any cycle_open/milestone enqueue picks up the EP's content. The active EP
// is derived from the log itself (first incomplete EP), so a cycle that
// closed early continues the same EP next time.
bindEpisode(state.contactLog);
// "Close the Cycle" — wipes the gameplay save, advances the log's run counter
// so milestones can fire again, leaves the world list (and therefore Echo
// Memory) intact, banks Carrier Mass against the cycle's peakAmount, then
// reloads. Shared between the Contact Log button and the Debug menu shortcut.
function closeCycleNow() {
  const peak = (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0;
  const endedAt = nowSeconds();
  const startedAt = Number.isFinite(state.cycleStartedAt) ? state.cycleStartedAt : endedAt;
  const cycle = (state.contactLog.run || 1);
  const contacts = state.contactLog.worlds.filter((w) => (w.run || 1) === cycle).length;
  const memoryShards = state.contactLog.worlds.length;
  const banked = closeCycle(state.contactLog, peak);
  if (banked === false) return false;
  // Capture the run's footprint *after* closeCycle so massBanked reflects
  // what was just credited. Cycle counter is the run we just finished, not
  // the new one closeCycle advanced to.
  recordCycleClose({
    endedAt, cycle, runDurationS: Math.max(0, endedAt - startedAt),
    endAmount: state.amount || 0, peakAmount: peak,
    contacts, massBanked: banked || 0, memoryShards,
  });
  saveContactLog(state.contactLog);
  clearSave();
  location.reload();
  return true;
}

const contactLogUi = initContactLogUi(state, {
  onCloseCycle: closeCycleNow,
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
const achievementsUi = initAchievementsUi(state);
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

// Map an NDC point (x,y in [-1,1]) onto a world point on the z=0 plane.
// Used both for the gamble swarm attractor (NDC 0,0 = screen centre) and the
// boost ripple source (NDC 0,1 = top-middle of the visible canvas).
const _attractor = new THREE.Vector3();
const _camDir = new THREE.Vector3();
function unprojectNdcToZ0(ndcX, ndcY) {
  _attractor.set(ndcX, ndcY, 0.5).unproject(camera);
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
    const attractor = unprojectNdcToZ0(0, 0);
    display.triggerGambleFx({ won, durationMs, attractorWorld: attractor, now });
  },
});

const debugUi = initDebugUi(state, {
  onCloseCycle: closeCycleNow,
  showToast: (msg) => ui.showToast(msg),
  refreshShop: () => ui.renderShop(),
  refreshNetwork: () => networkUi.refresh(),
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
// Back-compat: any player who has played before counts as having seen the
// intro. Mid-cycle save, any logged worlds, any cycle past 1, or the legacy
// `welcome` interstitial flag — all are proof they don't need the new opener.
// Stamps introSeen so a future save-wipe doesn't replay the dramatic chain.
if (!state.contactLog.introSeen) {
  const hadOldWelcome = !!(loaded && state.messages && state.messages.shown && state.messages.shown.welcome);
  const hasProgress = (state.contactLog.worlds || []).length > 0 || (state.contactLog.run || 1) > 1;
  if (hadOldWelcome || hasProgress) {
    state.contactLog.introSeen = true;
    saveContactLog(state.contactLog);
  }
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
  debugUi.sync();
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
    networkRerollsGained: loaded.networkRerollsGained || 0,
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
  debugUi.sync();
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

// Bootstrap pass — catch any achievements that should already be unlocked
// based on persisted log + save state (re-runs are cheap; idempotent). On the
// very first install these are no-ops; for returning players they backfill.
{
  const newly = evaluateAchievements(state.achievements, {
    state, buffCount: 0,
    peakAmount: (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount || 0,
  });
  if (newly.length > 0) {
    // First boot after a feature ship may unlock several at once. Treat them
    // as seen — the player did the work before achievements existed; the
    // pulse would be misleading.
    for (const id of newly) state.achievements.seen[id] = true;
    saveAchievements(state.achievements);
  }
  achievementsUi.updateAffordance();
}

const interstitialUi = makeInterstitialUi(state, (id) => {
  // Mark the new intro chain as seen the moment the last beat closes. Gated
  // on the contact log so a future cycle close (which wipes messages.shown)
  // does not replay the dramatic opener.
  if (id === 'intro_console' && !state.contactLog.introSeen) {
    state.contactLog.introSeen = true;
    saveContactLog(state.contactLog);
  }
  // Legacy welcome path stays bound — old saves with welcome in their queue
  // still chain into the tutorial beat. New saves never enqueue welcome so
  // this is a no-op for them.
  if (id === 'welcome') scheduleTutorialIfEligible(state);
});
// Returning players who saw the legacy welcome on a previous session but
// never reached the legacy tutorial beat: schedule it now. Idempotent.
scheduleTutorialIfEligible(state);

// First-boot intro overlay → interstitial chain. Plays only when there's no
// save AND the contact log has never recorded a completed intro. The chain
// is enqueued from the overlay's onDone so the dramatic gate/locale screens
// land *before* the first card opens; without the gating the interstitial
// modal would flash up under the overlay and steal the moment.
if (!loaded && !state.contactLog.introSeen) {
  runIntroSequence(() => {
    enqueueInterstitial(state, 'intro_name');
    enqueueInterstitial(state, 'intro_kalen');
    enqueueInterstitial(state, 'intro_premise');
    enqueueInterstitial(state, 'intro_console');
    interstitialUi.drain();
  });
} else {
  interstitialUi.drain();
}

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
  // Patient Coils side-effect state.freeRerolls inside tickBleedDrip — diff
  // before/after to surface the grant as a separate toast.
  const rerollsBeforeDrip = state.freeRerolls || 0;
  const drip = tickBleedDrip(state, wallDt, t);
  if (drip > 0) {
    state.amount += drip;
    networkUi.flashBleed(drip);
    // First isolated-relay drip is an Achievement trigger. The flag persists
    // across cycles in the achievements stats bag, so a later cycle can't
    // re-earn it but a new player will earn it the moment the first drip lands.
    if (markStat(state.achievements, 'bleedDripsSeen')) saveAchievements(state.achievements);
  }
  const rerollsGained = (state.freeRerolls || 0) - rerollsBeforeDrip;
  if (rerollsGained > 0) {
    ui.showToast(rerollsGained === 1
      ? 'A sweep token was riding the bleed.'
      : `${rerollsGained} sweep tokens were riding the bleed.`);
  }

  const rate = effectiveRate(state, t);
  // baseRate is what the rate would be with no rateMul/compound buffs active,
  // post-dampening. Hero uses rate > baseRate to drive the "buffed" tint —
  // comparing against pre-dampening base broke that past 1e12.
  const baseRate = unbufedEffectiveRate(state, t);
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

  let buffCount = 0;
  const bs = state.buffs;
  if (bs) {
    for (const k of ['rateMul', 'gambleLuck', 'gambleCushion', 'compound']) {
      const xs = bs[k];
      if (!xs) continue;
      for (const x of xs) if (x.expiresAt > t) buffCount++;
    }
  }
  // Ripple emanates from the top-middle of the canvas (NDC 0,1) so the
  // wavefront sweeps downward across the falling columns.
  const rippleCenter = unprojectNdcToZ0(0, 1);
  display.update(state.amount, rate, t, dt, buffCount, rippleCenter);
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
    // Mythic detection — any slot currently advertising a mythic-rarity band
    // counts. Cheap: ≤10 slots, plain field read. Bleed and engraving flips
    // happen at the event source, but mythic surfaces from rolls too (not just
    // buys), so it's polled here.
    let mythicDirty = false;
    const slots = state.shop && state.shop.slots;
    if (slots) {
      for (const s of slots) {
        if (s && s.rarity === 'mythic') {
          if (markStat(state.achievements, 'mythicSeen')) mythicDirty = true;
          break;
        }
      }
    }
    // Pattern-ever-chosen flag — promote contactLog.pattern (set/cleared per
    // cycle) into a sticky log flag so the achievement triggers exactly once
    // per player history and survives the next cycle's pattern wipe.
    if (state.contactLog && typeof state.contactLog.pattern === 'string'
        && state.contactLog.pattern.length > 0
        && !state.contactLog.patternEverChosen) {
      state.contactLog.patternEverChosen = true;
      saveContactLog(state.contactLog);
    }
    // Evaluate every HUD tick. evaluateAchievements is O(N defs) and only
    // checks delta — already-unlocked ids are skipped. New unlocks → toast.
    const newly = evaluateAchievements(state.achievements, {
      state, buffCount, peakAmount: (state.messages && state.messages.stats && state.messages.stats.peakAmount) || state.amount,
    });
    if (newly.length > 0 || mythicDirty) saveAchievements(state.achievements);
    if (newly.length) {
      achievementsUi.showUnlocks(newly);
      achievementsUi.refresh();
      achievementsUi.updateAffordance();
    }
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

// Tab-background → return is also a Signal Lock moment. Backgrounded tabs
// keep ticking (rAF throttled to ~1Hz), so state.amount accrues piecemeal
// during the away window — diffing snapshot at hide vs current on return
// gives the right earnings number. MIN_OFFLINE_S inside showWelcomeBack
// still gates short flicks. Drift mul is intentionally not applied here:
// Drift is offline-only by design (see save.js / drift kind).
let _hiddenAt = 0;
let _hiddenAmount = 0;
let _hiddenLossCount = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveState(state);
    _hiddenAt = nowSeconds();
    _hiddenAmount = state.amount;
    _hiddenLossCount = (state.network && state.network.lostCount) || 0;
    return;
  }
  if (document.visibilityState === 'visible' && _hiddenAt > 0) {
    const savedAt = _hiddenAt;
    const amountBefore = _hiddenAmount;
    const lossBefore = _hiddenLossCount;
    _hiddenAt = 0;
    const offline = nowSeconds() - savedAt;
    // Defer one rAF so any pending wall-clock accrual lands before we diff.
    // Browsers that pause rAF entirely on hidden roll the whole window into
    // the first foreground tick — read amount after that lands.
    requestAnimationFrame(() => {
      const earnings = Math.max(0, state.amount - amountBefore);
      const lossNow = (state.network && state.network.lostCount) || 0;
      const networkLosses = Math.max(0, lossNow - lossBefore);
      if (networkLosses > 0 && offline < 60) {
        ui.showToast(`ComDef pulled ${networkLosses} relay${networkLosses === 1 ? '' : 's'} while you were away.`);
      }
      showWelcomeBack({
        state, offline, earnings, savedAt,
        networkBleed: 0,
        networkLosses,
        offlineMul: 1,
      });
    });
  }
});
