import { breakdownRate } from './breakdown.js';
import { effectiveRate } from './shop.js';
import { formatAbbrev } from './bignum.js';
import { nowSeconds } from './save.js';

// Signal Diagnostic — a live read of the rate factorisation. Opens from the
// HUD button (#diagnosticBtn) and re-renders once per second while open so the
// player can watch buff timers and compounding builds shift the numbers.
// Voice: Sera (procedural, second person). The header copy is hers.
export function initBreakdownUi(state) {
  const btn = document.getElementById('diagnosticBtn');
  const modal = document.getElementById('diagnosticModal');
  if (!btn || !modal) return null;
  const body = modal.querySelector('.diag-body');
  let timer = null;

  function fmtFactor(row) {
    if (row.kind === 'base') return `+${formatAbbrev(row.factor)} /s`;
    if (row.kind === 'mul') return `×${row.factor < 100 ? row.factor.toFixed(2) : formatAbbrev(row.factor)}`;
    if (row.kind === 'exp') return `^${row.factor.toFixed(2)}`;
    if (row.kind === 'total') return `${formatAbbrev(row.factor)} /s`;
    return '';
  }

  function render() {
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
    body.innerHTML = `
      <p class="diag-intro">You're looking at the carrier diagnostic. Each row is a term in the equation that produces your current pulse. Read top to bottom.</p>
      <ul class="diag-list">${factorRows}</ul>
      <p class="diag-foot">Pulse re-reads once a second. Close the panel to free the channel.</p>
    `;
    // Sanity: total row factor should track effectiveRate within rounding.
    // (Not surfaced — just a guard rail while iterating.)
    if (Math.abs(live - rows[rows.length - 1].factor) / Math.max(live, 1) > 0.001) {
      // Diverged — log once. Could happen if a new rate factor lands in shop.js
      // without being added to breakdown.js.
      console.warn('[diagnostic] breakdown drifted from effectiveRate', { live, rows });
    }
  }

  const open = () => {
    render();
    modal.classList.add('open');
    if (timer == null) timer = setInterval(render, 1000);
  };
  const close = () => {
    modal.classList.remove('open');
    if (timer != null) { clearInterval(timer); timer = null; }
  };

  btn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('.bm-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close, render };
}
