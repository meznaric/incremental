import { breakdownRate } from './breakdown.js';
import { effectiveRate } from './shop.js';
import { formatAbbrev } from './bignum.js';
import { nowSeconds } from './save.js';

// Signal Diagnostic — five tabs:
//   Pulse     — live rate factorisation (the original content)
//   Windows   — four buff kinds with stacking rules + provenance
//   Hail      — gamble loop in plain language
//   Persist   — Echo Memory + Carrier Mass + what survives close
//   Glossary  — lore label → mechanic bridge for every shop kind
// Voice: Sera (procedural, second person). She narrates the rig.
export function initBreakdownUi(state) {
  const btn = document.getElementById('diagnosticBtn');
  const modal = document.getElementById('diagnosticModal');
  if (!btn || !modal) return null;
  const tabEls = Array.from(modal.querySelectorAll('.diag-tab'));
  const panelEls = Array.from(modal.querySelectorAll('.diag-panel'));
  const panel = (name) => panelEls.find((p) => p.dataset.panel === name);
  let activeTab = 'pulse';
  let timer = null;

  function fmtFactor(row) {
    if (row.kind === 'base') return `+${formatAbbrev(row.factor)} /s`;
    if (row.kind === 'mul') return `×${row.factor < 100 ? row.factor.toFixed(2) : formatAbbrev(row.factor)}`;
    if (row.kind === 'exp') return `^${row.factor.toFixed(2)}`;
    if (row.kind === 'total') return `${formatAbbrev(row.factor)} /s`;
    return '';
  }

  function renderPulse() {
    const p = panel('pulse');
    if (!p) return;
    const now = nowSeconds();
    const rows = breakdownRate(state, now);
    const live = effectiveRate(state, now);
    const factorRows = rows.map((r) => `
      <li class="diag-row diag-${r.kind}">
        <div class="diag-row-main">
          <div class="diag-row-label">${r.label}</div>
          <div class="diag-row-factor">${fmtFactor(r)}</div>
        </div>
        ${r.note ? `<div class="diag-row-note">${r.note}</div>` : ''}
      </li>
    `).join('');
    p.innerHTML = `
      <p class="diag-intro">You're looking at the carrier diagnostic. Each row is a term in the equation that produces your current pulse. Read top to bottom.</p>
      <ul class="diag-list">${factorRows}</ul>
      <p class="diag-foot">Pulse re-reads once a second. Close the panel to free the channel.</p>
    `;
    if (Math.abs(live - rows[rows.length - 1].factor) / Math.max(live, 1) > 0.001) {
      console.warn('[diagnostic] breakdown drifted from effectiveRate', { live, rows });
    }
  }

  function renderWindows() {
    const p = panel('windows');
    if (!p) return;
    p.innerHTML = `
      <p class="diag-intro">Four timed effects ride your carrier. They spawn when you buy a Window upgrade in the shop. Some also drop from Hail wins.</p>
      <div class="faq-block kind-rate">
        <div class="faq-head"><i class="ri ri-flashlight-fill"></i>Carrier</div>
        <div class="faq-body">
          <p>Multiplies Echoes/s by the shown value.</p>
          <p><strong>Stacking:</strong> multiplicative. Two ×3 Carriers give ×9.</p>
          <p><strong>Two flavours share this slot.</strong> Burst: seconds to minutes, ×2 to ×100. Long: hours to weeks, ×1.05 to ×1.4. They coexist — pair a long Carrier with a burst Carrier for a clean spike.</p>
        </div>
      </div>
      <div class="faq-block kind-luck">
        <div class="faq-head"><i class="ri ri-sparkling-2-fill"></i>Carry</div>
        <div class="faq-body">
          <p>Adds % to Hail win-chance.</p>
          <p><strong>Stacking:</strong> additive. A 1% Hail under a +10% Carry window rolls at 11%.</p>
          <p><strong>Use it for:</strong> firing low-chance, high-return Hails. Buy the Carry first, then the Hail.</p>
        </div>
      </div>
      <div class="faq-block kind-cushion">
        <div class="faq-head"><i class="ri ri-shield-fill"></i>Buffer</div>
        <div class="faq-body">
          <p>Returns % of a failed Hail wager.</p>
          <p><strong>Stacking:</strong> additive, capped at 100% (full refund on miss).</p>
          <p><strong>Use it for:</strong> turning a bankrupting Hail into an affordable one. Stack Buffers before the largest wagers.</p>
        </div>
      </div>
      <div class="faq-block kind-compound">
        <div class="faq-head"><i class="ri ri-stack-fill"></i>Resonance</div>
        <div class="faq-body">
          <p>A multiplier that climbs from ×1 every second it holds.</p>
          <p><strong>Stacking:</strong> the shown number is its current state — it overlays your Carrier multiplier.</p>
          <p><strong>Let it run.</strong> The late seconds are where the curve gets vertical. Don't crowd it with short Carrier windows — those stack against it.</p>
        </div>
      </div>
      <p class="faq-foot">Meta Frames (Prime / Tight Lattice / Wide Band / Cold Lens / Echo Prime / Long Frame / Oracle Lens) are a different layer — they prime the <em>next</em> window you spawn while they hold. Chain them: Long Frame → Echo Prime → buy your big Carrier.</p>
    `;
  }

  function renderHail() {
    const p = panel('hail');
    if (!p) return;
    p.innerHTML = `
      <p class="diag-intro">A Hail is a wager. You spend Echoes for a roll. It is the only way to land a sudden balance jump that compounds the rest of your cycle.</p>
      <div class="faq-block kind-hail">
        <div class="faq-head"><i class="ri ri-broadcast-line"></i>The loop</div>
        <div class="faq-body">
          <p><strong>Wager.</strong> On purchase you pay the listed % of your current balance.</p>
          <p><strong>Roll.</strong> A random check against the Carry chance shown on the card.</p>
          <p><strong>Win →</strong> balance gains <em>Return × wager</em> back. (Return is the multiplier shown — 14× means the wager comes back as 14× wager.)</p>
          <p><strong>Miss →</strong> the wager is lost. Active Buffer windows refund a slice (see below).</p>
          <p><strong>Cooldown.</strong> Each Hail has a cooldown after a roll. The card greys out until it clears.</p>
        </div>
      </div>
      <div class="faq-block kind-luck">
        <div class="faq-head"><i class="ri ri-sparkling-2-fill"></i>Boosting win odds</div>
        <div class="faq-body">
          <p>Carry windows <strong>add</strong> to the win-chance. A 0.6% Hail with a +10% Carry rolls at 10.6%, not 10.6× the odds.</p>
        </div>
      </div>
      <div class="faq-block kind-cushion">
        <div class="faq-head"><i class="ri ri-shield-fill"></i>Cushioning the miss</div>
        <div class="faq-body">
          <p>Buffer windows return a % of a failed wager. Stack Buffers additively up to 100% (full refund). A 30% Buffer turns a busted Hail from "wager X, miss" into "wager X, miss, get 0.3 X back."</p>
        </div>
      </div>
      <p class="faq-foot">Optimal Hail window: high Carry + active Buffer + a fresh reroll. First reroll of a session is free.</p>
    `;
  }

  function renderPersist() {
    const p = panel('persist');
    if (!p) return;
    p.innerHTML = `
      <p class="diag-intro">Two currencies survive a cycle close. Everything in the shop does not.</p>
      <div class="faq-block kind-memory">
        <div class="faq-head"><i class="ri ri-database-2-line"></i>Echo Memory</div>
        <div class="faq-body">
          <p><strong>Earn:</strong> one shard per name on the Contact Log. Across all eight episodes, that's 80+ shards if you log every contact.</p>
          <p><strong>What it does:</strong> each shard adds +10% to base Echoes/s. Applied <strong>before</strong> every other multiplier.</p>
          <p><strong>Never lost.</strong> The names stay on the log forever. This number only ever climbs.</p>
        </div>
      </div>
      <div class="faq-block kind-mass">
        <div class="faq-head"><i class="ri ri-scales-3-line"></i>Carrier Mass</div>
        <div class="faq-body">
          <p><strong>Earn:</strong> banked at cycle close from this cycle's <em>peak</em> Echo balance. Every 10× past 1k = +1 kg. 100k peak → 3 kg. 1B → 7 kg. 1T → 10 kg.</p>
          <p><strong>Spend:</strong> Carrier Engravings — permanent cuts to the rig — in the Contact Log <strong>Rig tab</strong>.</p>
          <p><strong>Tip:</strong> peak is what counts, not your closing balance. Spike the rate before you close.</p>
        </div>
      </div>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-refresh-line"></i>What a cycle close does</div>
        <div class="faq-body">
          <p><strong>Survives:</strong> Echo Memory shards, Carrier Mass, Engravings, the Contact Log itself.</p>
          <p><strong>Resets:</strong> Echo balance, Echoes/s, owned Relays / Decodes / Seed Relays, shop slate, active Windows.</p>
        </div>
      </div>
      <p class="faq-foot">Cycle Patterns (free rerolls, surge buff, etc.) are picked once per cycle and hold until you close it. Engravings are bought with Mass and cut once.</p>
    `;
  }

  function renderGlossary() {
    const p = panel('glossary');
    if (!p) return;
    p.innerHTML = `
      <p class="diag-intro">The shop labels are in-world. Here is what each one actually does in mechanics terms.</p>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-radar-line"></i>Relay <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(permanent · additive)</span></div>
        <div class="faq-body">Buys a permanent +X Echoes/s for this cycle. Stacks additively. Lost on cycle close.</div>
      </div>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-radar-line"></i>Decode <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(permanent · multiplier)</span></div>
        <div class="faq-body">Buys a permanent rate multiplier for this cycle. Stacks multiplicatively. Lost on cycle close — Engravings are the cross-cycle multiplier layer.</div>
      </div>
      <div class="faq-block kind-rate">
        <div class="faq-head"><i class="ri ri-flashlight-fill"></i>Window <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(timed buff)</span></div>
        <div class="faq-body">A timed effect. Four kinds: Carrier (×rate), Carry (Hail luck), Buffer (Hail cushion), Resonance (compounding). See the Windows tab.</div>
      </div>
      <div class="faq-block kind-hail">
        <div class="faq-head"><i class="ri ri-broadcast-line"></i>Hail <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(gamble)</span></div>
        <div class="faq-body">A wager. Spend Echoes for a roll. Win → multi-X payout. Miss → wager lost, Buffer refunds slice. See the Hail tab.</div>
      </div>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-exchange-funds-fill"></i>Seed Relay <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(convert)</span></div>
        <div class="faq-body">Burns the listed % of balance and folds it into base Echoes/s for the rest of this cycle. A long-game investment when the rate is high.</div>
      </div>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-gift-fill"></i>Bleed <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(gift)</span></div>
        <div class="faq-body">A one-shot Echo payout, free. Adds the listed Echoes to your balance.</div>
      </div>
      <div class="faq-block kind-mass">
        <div class="faq-head"><i class="ri ri-scales-3-line"></i>Engraving</div>
        <div class="faq-body">A permanent cut to the rig, bought with Carrier Mass. Survives every cycle close. Open the Contact Log → Rig tab.</div>
      </div>
    `;
  }

  const renderers = {
    pulse: renderPulse,
    windows: renderWindows,
    hail: renderHail,
    persist: renderPersist,
    glossary: renderGlossary,
  };

  function setActiveTab(name) {
    activeTab = name;
    for (const t of tabEls) {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const p of panelEls) {
      p.classList.toggle('is-active', p.dataset.panel === name);
    }
    const r = renderers[name];
    if (r) r();
  }

  function renderAll() {
    // Static panels render once on open; Pulse re-renders on its own timer.
    renderPulse();
    renderWindows();
    renderHail();
    renderPersist();
    renderGlossary();
  }

  const open = () => {
    setActiveTab('pulse');
    renderAll();
    modal.classList.add('open');
    if (timer == null) timer = setInterval(() => {
      if (activeTab === 'pulse') renderPulse();
    }, 1000);
  };
  const close = () => {
    modal.classList.remove('open');
    if (timer != null) { clearInterval(timer); timer = null; }
  };

  btn.addEventListener('click', open);

  // Pointer-based delegation for tabs + close. iOS Chrome drops the synthetic
  // click on tabs sometimes; pointerup resolves on its own target. Click stays
  // for keyboard/mouse, deduped via a timestamp.
  function handleModalAction(e) {
    if (e.target === modal || e.target.closest('.bm-close')) { close(); return; }
    const tab = e.target.closest('.diag-tab');
    if (tab && tab.dataset.tab) setActiveTab(tab.dataset.tab);
  }
  let tap = null;
  modal.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  modal.addEventListener('pointermove', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.moved = true;
  });
  modal.addEventListener('pointercancel', (e) => {
    if (tap && e.pointerId === tap.id) tap = null;
  });
  modal.addEventListener('pointerup', (e) => {
    if (!tap || e.pointerId !== tap.id) return;
    const s = tap; tap = null;
    if (s.moved) return;
    modal._tapAt = performance.now();
    handleModalAction(e);
  });
  modal.addEventListener('click', (e) => {
    if (modal._tapAt && performance.now() - modal._tapAt < 700) return;
    handleModalAction(e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close, render: renderAll };
}
