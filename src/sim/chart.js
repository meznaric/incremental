// Per-cycle overlay chart. One line per cycle, x-axis = seconds since the
// cycle started, so every cycle's climb is comparable on the same axes.
// Cycles can be toggled on/off via the chips above each chart.

const PAD = { top: 14, right: 14, bottom: 26, left: 70 };

// Distinct palette — high-contrast on the dark background, sequential enough
// that adjacent cycles read as adjacent without blurring together.
export const CYCLE_PALETTE = [
  '#5fc0e8', '#3ec98a', '#f5d34a', '#ff8a3a',
  '#ff5a6e', '#9d6ee0', '#88d0ff', '#7aef9d',
  '#ffd87a', '#ffac6a',
];

export function cycleColor(idx) {
  return CYCLE_PALETTE[idx % CYCLE_PALETTE.length];
}

function niceLog10Ticks(min, max) {
  const ticks = [];
  const lo = Math.floor(Math.log10(Math.max(min, 1e-9)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1)));
  for (let e = lo; e <= hi; e++) ticks.push(Math.pow(10, e));
  return ticks;
}

function niceLinearTicks(min, max, count = 5) {
  if (min === max) max = min + 1;
  const range = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const err = (range / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const niceStep = mult * step;
  const ticks = [];
  for (let v = Math.ceil(min / niceStep) * niceStep; v <= max; v += niceStep) {
    ticks.push(v);
  }
  return ticks;
}

function fmtSeconds(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(s)}s`;
}

function fmtNumber(n) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a < 1000) return n.toFixed(2);
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let i = 0;
  let v = n;
  while (Math.abs(v) >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return v.toFixed(2) + units[i];
}

// Split a sample stream into per-cycle arrays. Each sample's t becomes
// "seconds since this cycle started". Honours sample.cycle as the canonical
// cycle index — the runner samples post-reset, so the first sample of cycle
// N+1 lands at t = cycleStartT for that cycle and gets relative t ≈ 0.
function partitionByCycle(samples, cycles) {
  const byCycle = new Map();
  for (const c of cycles) byCycle.set(c.index, { cycle: c, points: [] });
  for (const s of samples) {
    const bucket = byCycle.get(s.cycle);
    if (!bucket) continue;
    bucket.points.push({ t: s.t - bucket.cycle.startT, raw: s });
  }
  return [...byCycle.values()].sort((a, b) => a.cycle.index - b.cycle.index);
}

export function createChart(canvas, opts) {
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  let samples = [];
  let cycles = [];
  let visible = null; // Set<cycleIndex> | null (null = all)
  let valueFn = opts.value || ((s) => s.amount);
  let label = opts.label || 'value';
  let yLog = !!opts.yLog;
  let hoverX = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function partitioned() {
    return partitionByCycle(samples, cycles).filter(
      (g) => visible == null || visible.has(g.cycle.index)
    );
  }

  function pickRange(groups) {
    let x0 = 0, x1 = 1;
    let y0 = Infinity, y1 = -Infinity;
    for (const g of groups) {
      for (const p of g.points) {
        if (p.t > x1) x1 = p.t;
        const v = valueFn(p.raw);
        if (!Number.isFinite(v)) continue;
        if (yLog && !(v > 0)) continue;
        if (v < y0) y0 = v;
        if (v > y1) y1 = v;
      }
    }
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) { y0 = 0; y1 = 1; }
    if (y0 === y1) y1 = y0 + 1;
    if (x1 <= x0) x1 = x0 + 1;
    if (yLog) {
      y0 = Math.pow(10, Math.floor(Math.log10(Math.max(y0, 1e-9))));
      y1 = Math.pow(10, Math.ceil(Math.log10(Math.max(y1, 1))));
    } else {
      const pad = (y1 - y0) * 0.05;
      y0 -= pad; y1 += pad;
    }
    return { x0, x1, y0, y1 };
  }

  function xToPx(x, w, x0, x1) { return PAD.left + ((x - x0) / (x1 - x0)) * (w - PAD.left - PAD.right); }
  function yToPx(y, h, y0, y1) {
    const top = PAD.top, bot = h - PAD.bottom;
    if (yLog) {
      const ly0 = Math.log10(y0), ly1 = Math.log10(y1);
      const v = Math.log10(Math.max(y, y0));
      return bot - ((v - ly0) / (ly1 - ly0)) * (bot - top);
    }
    return bot - ((y - y0) / (y1 - y0)) * (bot - top);
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const groups = partitioned();
    if (!groups.length || groups.every((g) => g.points.length === 0)) {
      ctx.fillStyle = '#666'; ctx.font = '13px system-ui';
      ctx.fillText('No data — run the simulation or toggle cycles back on.', PAD.left + 8, h / 2);
      return;
    }
    const { x0, x1, y0, y1 } = pickRange(groups);

    // Y grid + labels.
    ctx.strokeStyle = '#22232a'; ctx.lineWidth = 1;
    ctx.fillStyle = '#8d909a'; ctx.font = '11px system-ui';
    const yTicks = yLog ? niceLog10Ticks(y0, y1) : niceLinearTicks(y0, y1, 5);
    for (const yt of yTicks) {
      const py = yToPx(yt, h, y0, y1);
      ctx.beginPath();
      ctx.moveTo(PAD.left, py);
      ctx.lineTo(w - PAD.right, py);
      ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtNumber(yt), PAD.left - 6, py);
    }

    // X grid: hour boundaries (most cycles are < a few days).
    const days = x1 / 86400;
    const step = days < 0.5 ? 3600 : days < 2 ? 6 * 3600 : days < 7 ? 86400 : 2 * 86400;
    for (let xv = 0; xv <= x1; xv += step) {
      const px = xToPx(xv, w, x0, x1);
      if (px < PAD.left || px > w - PAD.right) continue;
      ctx.strokeStyle = '#2a2c34';
      ctx.beginPath();
      ctx.moveTo(px, PAD.top); ctx.lineTo(px, h - PAD.bottom); ctx.stroke();
      ctx.fillStyle = '#8d909a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(fmtSeconds(xv), px, h - PAD.bottom + 4);
    }

    // One line per cycle.
    for (const g of groups) {
      const color = cycleColor(g.cycle.index);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (const p of g.points) {
        const v = valueFn(p.raw);
        if (!Number.isFinite(v) || (yLog && v <= 0)) { started = false; continue; }
        const px = xToPx(p.t, w, x0, x1);
        const py = yToPx(v, h, y0, y1);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Endpoint marker — small dot at the right edge of each cycle line.
      const last = g.points[g.points.length - 1];
      if (last) {
        const v = valueFn(last.raw);
        if (Number.isFinite(v) && (!yLog || v > 0)) {
          const px = xToPx(last.t, w, x0, x1);
          const py = yToPx(v, h, y0, y1);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, g.cycle.inProgress ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (g.cycle.inProgress) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
      }
    }

    // Hover crosshair + tooltip — one row per visible cycle at the hovered t.
    if (hoverX != null) {
      const px = hoverX;
      const tHovered = x0 + ((px - PAD.left) / (w - PAD.left - PAD.right)) * (x1 - x0);
      if (tHovered >= 0 && tHovered <= x1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(px, PAD.top); ctx.lineTo(px, h - PAD.bottom); ctx.stroke();

        const rows = [`t = ${fmtSeconds(tHovered)} (in-cycle)`];
        const rowColors = ['#fff'];
        for (const g of groups) {
          // Nearest sample for this cycle.
          const pts = g.points;
          if (!pts.length) continue;
          let lo = 0, hi = pts.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (pts[mid].t < tHovered) lo = mid + 1; else hi = mid;
          }
          const p = pts[lo];
          if (p.t > tHovered + (x1 - x0) * 0.05) continue; // cycle ended already
          const v = valueFn(p.raw);
          rows.push(`Cycle ${g.cycle.index + 1}: ${fmtNumber(v)}`);
          rowColors.push(cycleColor(g.cycle.index));
        }

        const tw = 220;
        let tx = px + 12;
        if (tx + tw > w - PAD.right) tx = px - tw - 12;
        const ty = PAD.top + 4;
        const th = 16 * rows.length + 8;
        ctx.fillStyle = 'rgba(20,22,30,0.94)';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeRect(tx, ty, tw, th);
        ctx.font = '12px system-ui';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (let i = 0; i < rows.length; i++) {
          ctx.fillStyle = rowColors[i];
          ctx.fillText(rows[i], tx + 8, ty + 6 + i * 16);
        }
      }
    }

    // Y-axis label (metric).
    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#8d909a';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label + (yLog ? '  (log)' : ''), 0, 0);
    ctx.restore();
  }

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    hoverX = e.clientX - r.left;
    draw();
  });
  canvas.addEventListener('mouseleave', () => { hoverX = null; draw(); });

  window.addEventListener('resize', resize);
  setTimeout(resize, 0);

  return {
    setData(next) {
      if (next.samples) samples = next.samples;
      if (next.cycles) cycles = next.cycles;
      if (next.visible !== undefined) visible = next.visible;
      draw();
    },
    setVisible(v) { visible = v; draw(); },
    setLogY(v) { yLog = !!v; draw(); },
    redraw: draw,
  };
}

export { fmtSeconds, fmtNumber };
