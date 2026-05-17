import { breakdownRate } from './breakdown.js';
import { effectiveRate } from './shop.js';
import { formatAbbrev } from './bignum.js';
import { nowSeconds } from './save.js';
import { installTap } from './tap.js';
import {
  SECTORS, TIER_INFO, COVERAGE_BONUS_PER_SECTOR,
  CLUSTER_YIELD_PER_NEIGHBOR, CLUSTER_DISCOVERY_PER_NEIGHBOR,
  ISOLATED_DISCOVERY_FACTOR, BLEED_YIELD_SECONDS,
  networkContribution, coverageMultiplier, relayYield,
  adjacentOnlineCount, bleedValue,
} from './network.js';
import { PIN_TIER_COSTS, MAX_PIN_SLOTS, REROLL_PCT_PER_SLOT, REROLL_FLOOR_SECONDS } from './shop.js';

// Signal Diagnostic — seven tabs:
//   Pulse     — live rate factorisation (the original content)
//   Console   — Re-roll and Lock Bands — how the bands behave
//   Windows   — four buff kinds with stacking rules + provenance
//   Hail      — gamble loop in plain language
//   Network   — Seed Relay placement system: sectors, clustering, discovery, drip
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

  function renderMeshBlock(now) {
    const net = state.network;
    if (!net || !net.relays || !net.relays.length) return '';
    const online = net.relays.filter((r) => now >= r.ripensAt);
    if (!online.length) return '';
    const cov = coverageMultiplier(net, now);
    const meshTotal = networkContribution(state, now);
    const coveredSectors = new Set();
    for (const r of online) coveredSectors.add(r.sector);
    let bleedPerMin = 0;
    let isolatedCount = 0;
    const relayRows = online
      .slice()
      .sort((a, b) => relayYield(net, b, now) - relayYield(net, a, now))
      .map((r) => {
        const sec = SECTORS[r.sector] || SECTORS.frontier;
        const adj = adjacentOnlineCount(net, r, now);
        const yieldVal = relayYield(net, r, now);
        let clusterCell;
        if (adj === 0) {
          isolatedCount++;
          const tier = TIER_INFO[r.tier] || TIER_INFO.common;
          if (tier.bleedPeriodSec > 0) bleedPerMin += bleedValue(r) * (60 / tier.bleedPeriodSec);
          clusterCell = `<span style="color:#c084fc">isolated</span>`;
        } else {
          clusterCell = `+${(adj * CLUSTER_YIELD_PER_NEIGHBOR * 100).toFixed(0)}%`;
        }
        return `
          <tr>
            <td><span class="net-legend-sw" style="background:${sec.color}"></span>${sec.label}</td>
            <td class="rarity rarity-${r.tier}" style="text-transform:capitalize;">${r.tier}</td>
            <td>+${formatAbbrev(r.baseYield || 0)}</td>
            <td>×${sec.yieldMul}</td>
            <td>${clusterCell}</td>
            <td><strong>+${formatAbbrev(yieldVal)}</strong></td>
          </tr>
        `;
      }).join('');
    const bleedLine = isolatedCount > 0
      ? `<p style="margin-top:8px;"><strong>Echo Bleed.</strong> ${isolatedCount} isolated relay${isolatedCount === 1 ? '' : 's'} drip${isolatedCount === 1 ? 's' : ''} about <strong>+${formatAbbrev(bleedPerMin)} /min</strong> on average — straight to your balance, uncoupled from the multiplier stack above.</p>`
      : `<p style="margin-top:8px;color:#6a6a90;">No isolated relays — no Echo Bleed drip right now. Plant one in Silent Worlds or Pre-Union Dark to open it.</p>`;
    return `
      <div class="faq-block" style="margin-top:14px;">
        <div class="faq-head"><i class="ri ri-base-station-line"></i>Seed mesh — live contribution</div>
        <div class="faq-body">
          <p>Each online relay below is folded into the Base listening yield above; coverage rides as a global multiplier across the lot, then everything downstream stacks on top.</p>
          <table class="diag-table">
            <thead><tr><th>Sector</th><th>Tier</th><th>Base</th><th>×Sec</th><th>±Cluster</th><th>Pre-cov /s</th></tr></thead>
            <tbody>${relayRows}</tbody>
          </table>
          <p style="margin-top:8px;"><strong>Coverage ×${cov.toFixed(2)}</strong> from ${coveredSectors.size} / ${Object.keys(SECTORS).length} sector${coveredSectors.size === 1 ? '' : 's'} → mesh total <strong>+${formatAbbrev(meshTotal)} /s</strong>.</p>
          ${bleedLine}
        </div>
      </div>
    `;
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
      ${renderMeshBlock(now)}
      <p class="diag-foot">Pulse re-reads once a second. Close the panel to free the channel.</p>
    `;
    if (Math.abs(live - rows[rows.length - 1].factor) / Math.max(live, 1) > 0.001) {
      console.warn('[diagnostic] breakdown drifted from effectiveRate', { live, rows });
    }
  }

  function renderConsole() {
    const p = panel('console');
    if (!p) return;
    const fmtCost = (n) => new Intl.NumberFormat('en-US').format(n);
    const pinRows = PIN_TIER_COSTS.map((c, i) => `
      <tr>
        <td>Lock Bands ${['I','II','III','IV','V'][i]}</td>
        <td>${i + 1} lock${i === 0 ? '' : 's'}</td>
        <td><i class="ri ri-broadcast-fill cc-icon"></i>${fmtCost(c)}</td>
      </tr>
    `).join('');
    const pctLabel = `${(REROLL_PCT_PER_SLOT * 100).toFixed(1)}%`;
    p.innerHTML = `
      <p class="diag-intro">The Console is the bank of bands in front of you. Every band carries one offer — a Relay, a Decode, a Window, a Hail, a Seed Relay. You buy the offer or you sweep the bank for new ones.</p>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-refresh-line"></i>Re-roll — sweeping the array</div>
        <div class="faq-body">
          <p>A re-roll throws out every band's current offer and rolls fresh ones in their place. Use it when nothing on the Console is worth your Echoes, or when you are waiting for a specific kind of offer to land.</p>
          <p><strong>Cost.</strong> ${pctLabel} of your balance per swept band, or a ${REROLL_FLOOR_SECONDS}-second floor of your current pulse per swept band — whichever is higher. The floor keeps the price honest when the balance is light.</p>
          <p><strong>Free sweeps.</strong> If your carrier is sitting on a long wait, the rig grants free re-rolls. They sit on the file. Spend them before paying — they apply first.</p>
          <p><strong>First sweep of a session.</strong> Free. You always get one on the house when you sit down.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-pushpin-2-fill"></i>Lock Bands — holding offers steady</div>
        <div class="faq-body">
          <p>Locking a band exempts it from the next re-roll. The offer stays. A re-roll with three bands locked only sweeps the unlocked ones, and only charges for those.</p>
          <p><strong>Two ways the cost drops.</strong> Each locked band reduces the number of swept bands. Fewer swept bands means a lower percentage charge <em>and</em> a lower floor. Lock everything you do not want to lose; sweep what is left.</p>
          <p><strong>Five tiers.</strong> Each Lock Bands tier you buy raises your lock cap by one. The first lets you hold a single band; the fifth lets you hold all five. The tiers unlock in order.</p>
          <table class="diag-table" style="margin-top:8px;">
            <thead><tr><th>Tier</th><th>Lock cap</th><th>Cost</th></tr></thead>
            <tbody>${pinRows}</tbody>
          </table>
          <p style="margin-top:8px;"><strong>If you lock past the cap.</strong> The oldest lock drops off and the new one takes its slot. The tap always lands; you do not need to find and unlock an old band first.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-lightbulb-flash-line"></i>How they pair</div>
        <div class="faq-body">
          <p>Re-roll is how you reach the offer you want. Lock Bands is how you keep it once you find it. The clean loop: re-roll until a band lands the offer you have been waiting for, lock that band, sweep the rest at a fraction of the cost. Repeat until the Console reads exactly the way you want it to.</p>
          <p>Buying a locked band re-rolls that slot under the lock — the slot stays locked, the offer is replaced. You do not need to re-lock after a purchase.</p>
          <p><strong>Limit.</strong> Up to ${MAX_PIN_SLOTS} bands can be locked at once. The Console never holds more than that.</p>
        </div>
      </div>

      <p class="faq-foot">The Console resets at every cycle close. Re-roll charges, lock choices, free sweeps — all wiped. Lock Bands <em>tiers</em> are part of this cycle's spend, not cross-cycle: a fresh cycle starts at zero locks.</p>
    `;
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
      <p class="faq-foot">Optimal Hail window: high Carry + active Buffer + a fresh re-roll. First re-roll of a session is free.</p>
    `;
  }

  function renderNetwork() {
    const p = panel('network');
    if (!p) return;
    const fmtMin = (s) => s < 60 ? `${Math.ceil(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
    const fmtPct = (x) => `${(x * 100).toFixed(0)}%`;
    const fmtPct1 = (x) => `${(x * 100).toFixed(1)}%`;
    const fmtLifespan = (perMin) => {
      // Mean lifespan in seconds = 1 / (perMin / 60). Half-life = ln2 × mean.
      if (!(perMin > 0)) return '—';
      const halfLifeSec = Math.log(2) * 60 / perMin;
      if (halfLifeSec < 3600) return `${Math.round(halfLifeSec / 60)} min`;
      const h = halfLifeSec / 3600;
      if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
      return `${(h / 24).toFixed(1)} days`;
    };
    const sectorRows = Object.entries(SECTORS).map(([key, s]) => `
      <tr class="diag-sec-row">
        <td><span class="net-legend-sw" style="background:${s.color}"></span><strong>${s.label}</strong></td>
        <td>×${s.yieldMul}</td>
        <td>×${s.discoveryMul}</td>
        <td>×${s.ripenMul}</td>
      </tr>
    `).join('');
    const tierRows = Object.entries(TIER_INFO).map(([key, t]) => `
      <tr>
        <td class="rarity rarity-${key}" style="text-transform: capitalize;">${key}</td>
        <td>${fmtMin(t.ripenSec)}</td>
        <td>${fmtPct1(t.discoveryPerMin * 60)} / h</td>
        <td>${fmtLifespan(t.discoveryPerMin)}</td>
        <td>every ${fmtMin(t.bleedPeriodSec)}</td>
      </tr>
    `).join('');
    const clusterPct = (n) => `+${(CLUSTER_YIELD_PER_NEIGHBOR * n * 100).toFixed(0)}% yield, +${(CLUSTER_DISCOVERY_PER_NEIGHBOR * n * 100).toFixed(0)}% risk`;
    const coveragePct = (n) => `×${(1 + COVERAGE_BONUS_PER_SECTOR * n).toFixed(2)}`;
    p.innerHTML = `
      <p class="diag-intro">Seed Relays don't slot into the rig — they get <em>buried</em>. Each yellow shop slot you buy queues a placement token. Drop it on a hex in the Network screen and the relay starts to ripen. Once it's live, it carries Echoes back to you until ComDef tracks the antenna down.</p>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-base-station-line"></i>Why bother</div>
        <div class="faq-body">
          <p>An ordinary <em>Relay</em> upgrade gives you flat +Echoes/s as soon as you buy it. A <em>Seed Relay</em> is the buried, deniable version — it takes time to come online and can be lost, but the sector you choose can <em>multiply</em> its yield well past the listed base.</p>
          <p><strong>The map opens once your carrier crosses 1 000 /s.</strong> Below that, the Listening Service would notice and the seed wouldn't survive the first hour. Above it, you have enough cover noise to plant.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-time-line"></i>Ripening</div>
        <div class="faq-body">
          <p>Every placed relay shows a ring filling in. While the ring is filling the antenna is tuning — it carries nothing and ComDef can't find it. When the ring closes the relay goes live.</p>
          <p>Ripen time depends on tier <strong>and sector</strong>. Union Core ripens in half the time; Pre-Union Dark takes 2.5× longer.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-map-2-line"></i>Sectors — where you plant matters</div>
        <div class="faq-body">
          <p>The hex grid is six slices of Union (and not-Union) space. Each sector applies a multiplier to <em>every</em> relay you put in it:</p>
          <table class="diag-table">
            <thead><tr><th>Sector</th><th>Yield</th><th>Discovery risk</th><th>Ripen time</th></tr></thead>
            <tbody>${sectorRows}</tbody>
          </table>
          <p style="margin-top:8px;">Read it like a casino floor: <strong>Listener Watch</strong> pays double, but ComDef is watching the same equipment and a relay there lives a fraction as long. <strong>Silent Worlds</strong> pays less, but you can practically forget about it.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-share-circle-line"></i>Clustering — dense vs sparse</div>
        <div class="faq-body">
          <p>An <strong>online neighbour</strong> is any relay one hex away that has already ripened. Adjacency cuts both ways:</p>
          <ul class="diag-bullets">
            <li><strong>Dense:</strong> 1 neighbour → ${clusterPct(1)}. 2 neighbours → ${clusterPct(2)}. The mesh leaks into itself; ComDef triangulates faster.</li>
            <li><strong>Sparse:</strong> a relay with <em>zero</em> online neighbours hits a hard discovery shield — ${fmtPct(ISOLATED_DISCOVERY_FACTOR)} of the base rate. It also starts dripping (next block).</li>
          </ul>
          <p>Ripening relays don't count as neighbours yet — geometry only matters once both ends are live.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-drop-line"></i>Mesh Bleed — sparse-only drip</div>
        <div class="faq-body">
          <p>An isolated online relay periodically drops an Echo Bleed straight into your balance. Each drop is worth ${BLEED_YIELD_SECONDS}s of that relay's base × sector yield — uncoupled from your multiplier stack, so it lands as raw Echoes.</p>
          <p>Drip period scales with tier: <strong>common</strong> bleeds slowly, <strong>mythic</strong> very often. Place a single mythic in Silent Worlds and forget about it — over a long away window it pays.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-broadcast-line"></i>Coverage — the global multiplier</div>
        <div class="faq-body">
          <p>For every distinct sector that has ≥1 online relay, the mesh's combined yield is multiplied by +${(COVERAGE_BONUS_PER_SECTOR * 100).toFixed(0)}%. Stack the bonus by spreading: 1 sector → ${coveragePct(1)}. 3 sectors → ${coveragePct(3)}. All six → ${coveragePct(6)}.</p>
          <p>This is the reason to plant in Listener Watch even though you know you'll lose it — one short-lived relay there opens a global +6% across every relay you own.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-shield-cross-line"></i>Discovery</div>
        <div class="faq-body">
          <p>Every minute, the rig rolls for each online relay. The probability of loss per minute is:</p>
          <p class="diag-formula">base rate × sector.discoveryMul × density × tier damping</p>
          <ul class="diag-bullets">
            <li><strong>base rate</strong>: see the tier table below.</li>
            <li><strong>density</strong>: 1 + 0.5 per online neighbour. Sparse relays get ×${ISOLATED_DISCOVERY_FACTOR} instead.</li>
            <li><strong>tier damping</strong>: legendary halves the rate, mythic cuts it to a fifth (already baked into the per-tier numbers below).</li>
          </ul>
          <p>If a relay is lost, it disappears. A toast tells you which sector it was in. Up to ⌊online/4⌋ losses per single tick, so a bad RNG burst can't wipe the whole mesh at once.</p>
        </div>
      </div>

      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-database-line"></i>Tier table</div>
        <div class="faq-body">
          <table class="diag-table">
            <thead><tr><th>Tier</th><th>Ripen (base)</th><th>Discovery / hr</th><th>Half-life</th><th>Bleed period</th></tr></thead>
            <tbody>${tierRows}</tbody>
          </table>
          <p style="margin-top:8px;"><strong>Half-life</strong> is "at this point, there's a 50/50 chance the relay's been found." Sector and clustering multiply the rate — a common in Listener Watch with two neighbours has roughly a half-hour half-life. A mythic isolated in Silent Worlds runs for weeks.</p>
        </div>
      </div>

      <p class="faq-foot">Closing a cycle wipes the mesh — relays don't survive. Carrier Mass earned from the cycle's peak does, so plant aggressively before you close.</p>
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
      <p class="faq-foot">Cycle Patterns (free re-rolls, surge buff, etc.) are picked once per cycle and hold until you close it. Engravings are bought with Mass and cut once.</p>
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
        <div class="faq-head"><i class="ri ri-exchange-funds-fill"></i>Seed Relay <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(convert · placement)</span></div>
        <div class="faq-body">Burns the listed % of balance to queue a placement token. Drop it on a hex in the Network screen; it ripens, then carries Echoes until ComDef finds it. Unlocks at 1 000 /s. See the <strong>Network</strong> tab for the full system.</div>
      </div>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-gift-fill"></i>Bleed <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(gift)</span></div>
        <div class="faq-body">A one-shot Echo payout, free. Adds the listed Echoes to your balance.</div>
      </div>
      <div class="faq-block">
        <div class="faq-head"><i class="ri ri-moon-line"></i>Drift <span style="color:#7a7a9a;font-weight:400;margin-left:6px;">(offline multiplier)</span></div>
        <div class="faq-body">A permanent multiplier that only fires while you are away. Lifts the foreground integral on welcomeBack; never touches live Echoes/s. Stacks multiplicatively with itself — buy more, the away window pays harder. Lost on cycle close, same as other permanents.</div>
      </div>
      <div class="faq-block kind-mass">
        <div class="faq-head"><i class="ri ri-scales-3-line"></i>Engraving</div>
        <div class="faq-body">A permanent cut to the rig, bought with Carrier Mass. Survives every cycle close. Open the Contact Log → Rig tab.</div>
      </div>
    `;
  }

  const renderers = {
    pulse: renderPulse,
    console: renderConsole,
    windows: renderWindows,
    hail: renderHail,
    network: renderNetwork,
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
    renderConsole();
    renderWindows();
    renderHail();
    renderNetwork();
    renderPersist();
    renderGlossary();
  }

  const open = (initialTab) => {
    const tab = (initialTab && renderers[initialTab]) ? initialTab : 'pulse';
    setActiveTab(tab);
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

  installTap(btn, open);
  installTap(modal, (_e, target) => {
    if (target === modal || target.closest('.bm-close')) { close(); return; }
    const tab = target.closest('.diag-tab');
    if (tab && tab.dataset.tab) setActiveTab(tab.dataset.tab);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close, render: renderAll };
}
