/* MajorPilot redesign — Data Science lens.
   "Is the drop real — or did the mix of learners change?"
   Five content steps: claim · trend · split · conclude · summary (core appends reflect + done).
   Every number on screen is computed from MP.data. */
(function () {
  "use strict";
  const MP = window.MP;
  const h = MP.h, esc = h.esc;
  const T = (en, zh) => ({ en, zh });
  const t = (x) => MP.t(x);
  const D = MP.data;
  const ID = "ds";

  /* ================= numbers (all derived from MP.data) ================= */
  const sumOf = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const C = D.cohorts.map((c, i) => Object.assign({}, c, { i, rate: c.completed / c.signups, period: i < 6 ? "earlier" : "recent" }));
  const EARLY = C.slice(0, 6), LATE = C.slice(6);
  const E_SIGN = sumOf(EARLY, "signups"), E_DONE = sumOf(EARLY, "completed");
  const R_SIGN = sumOf(LATE, "signups"), R_DONE = sumOf(LATE, "completed");
  const pE = E_DONE / E_SIGN, pR = R_DONE / R_SIGN;
  const CH = D.channels, rateOf = (g) => g.completed / g.signups;
  const orgE = rateOf(CH.earlier.organic), parE = rateOf(CH.earlier.partner);
  const orgR = rateOf(CH.recent.organic), parR = rateOf(CH.recent.partner);
  const shareE = CH.earlier.partner.signups / (CH.earlier.partner.signups + CH.earlier.organic.signups);
  const shareR = CH.recent.partner.signups / (CH.recent.partner.signups + CH.recent.organic.signups);
  const whatIf = (s) => (1 - s) * orgR + s * parR;           // recent within-channel rates, mix s
  const REW = whatIf(shareE);                                  // = MP.data.reweighted / 100
  const DROP = (pE - pR) * 100, MIXPTS = (REW - pR) * 100, REALPTS = (pE - REW) * 100;
  const wob = (p, n) => 1.96 * Math.sqrt(p * (1 - p) / n);   // expected wobble (95%)
  const pOf = (c) => (c.period === "earlier" ? pE : pR);
  const wobOf = (c) => wob(pOf(c), c.signups);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const WOB_R = avg(LATE.map(wobOf)), WOB_E = avg(EARLY.map(wobOf));
  const LOW = C.reduce((m, c) => (c.rate < m.rate ? c : m), C[0]);   // cohort 11
  const E_BAND_LO = Math.min(...EARLY.map((c) => pE - wobOf(c)));
  const R_BAND_HI = Math.max(...LATE.map((c) => pR + wobOf(c)));
  const R_BAND_HI_C = LATE.reduce((m, c) => (wobOf(c) > wobOf(m) ? c : m), LATE[0]);   // the smallest recent cohort has the widest band

  /* ================= formatting ================= */
  const loc = () => (MP.lang() === "zh" ? "zh-CN" : "en-US");
  const num = (x, a, b) => Number(x).toLocaleString(loc(), { minimumFractionDigits: a, maximumFractionDigits: b == null ? a : b });
  const P = (f, a, b) => num(f * 100, a == null ? 1 : a, b) + "%";            // fraction → "27.0%"
  const P0 = (f) => num(f * 100, 0) + "%";
  const pts = (x, a, b) => (MP.lang() === "zh" ? num(x, a == null ? 1 : a, b) + " 个百分点" : num(x, a == null ? 1 : a, b) + " pts");
  const N = (x) => num(x, 0);
  const r1 = (x) => Math.round(x * 10) / 10;
  const per = (k) => t(D.periods[k]);
  const chName = (k) => t(D.channelNames[k]);

  /* ================= lens state ================= */
  function dat(ls) {
    const d = ls.data;
    if (!Array.isArray(d.claim)) d.claim = [];
    if (d.cohort == null) d.cohort = LOW.n;
    if (d.share == null) d.share = Math.round(shareR * 100);
    if (!d.sum) d.sum = { found: "", sure: "", unknown: "", dont: "" };
    return d;
  }
  const L = () => MP.ls(ID);
  const compact = () => (window.innerWidth || 1200) < 640;

  /* ================= shared bits ================= */
  const zhL = () => MP.lang() === "zh";
  /* the question a work card asks: mono kicker + serif question (+ an aside on the right) */
  const qHead = (q, extra, kicker) => `<div class="ds-qh"><div class="ds-qh-t"><span class="ld-label">${kicker || t(T("Your call", "你的判断"))}</span><h2 class="ds-q">${q}</h2></div>${extra ? `<span class="ds-qh-x">${extra}</span>` : ""}</div>`;
  const cap = (label, pill) => h.figCap(label, pill);
  const fig = (n, en, zh) => t(T(`Fig. ${n} · ${en}`, `图 ${n} · ${zh}`));
  /* the readout arrow (drawn on arrival) */
  const arrowSVG = `<svg class="ds-ar" viewBox="0 0 32 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1,10 H30 M23,3 L30,10 L23,17"/></svg>`;
  const hatchDef = (id, cls) => `<defs><pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" class="${cls || "ds-hbg"}"/><line x1="0" y1="0" x2="0" y2="5" class="ds-hln"/></pattern></defs>`;

  /* ---------- step 1: the headline, and the crowds behind it ---------- */
  function headline() {
    const maxS = Math.max(E_SIGN, R_SIGN);
    const row = (k, done, signed, cls, i) => `<div class="ds-ppl-row ${cls}" style="--i:${i}">
        <span class="ds-ppl-k">${per(k)}<span class="ds-ppl-p">${esc(t(D.periods[k].short))}</span></span>
        <span class="ds-ppl-bar" style="--w:${r1(signed / maxS * 100)}%"><i style="--c:${r1(done / signed * 100)}%"></i></span>
        <span class="ds-ppl-v num"><b>${N(done)}</b><span class="faint"> / ${N(signed)}</span></span></div>`;
    const aria = t(T(`Earlier cohorts: ${N(E_DONE)} of ${N(E_SIGN)} learners completed (${P(pE)}). Recent cohorts: ${N(R_DONE)} of ${N(R_SIGN)} completed (${P(pR)}).`,
      `前期批次：${N(E_SIGN)} 人中 ${N(E_DONE)} 人完成（${P(pE)}）。近期批次：${N(R_SIGN)} 人中 ${N(R_DONE)} 人完成（${P(pR)}）。`));
    return `<div class="ds-hl" data-rd-src="ds-hl">
        <div class="ds-hl-cell"><span class="ld-label">${per("earlier")}</span><span class="v num" data-ld-count data-ld-from="0" data-ld-dur="800">${P(pE)}</span></div>
        <div class="ds-hl-ar">${arrowSVG}</div>
        <div class="ds-hl-cell now"><span class="ld-label">${per("recent")}</span><span class="v num" data-ld-count data-ld-from="${r1(pE * 100)}" data-ld-delay="450" data-ld-dur="900">${P(pR)}</span></div>
        <div class="ds-hl-delta"><span class="num">−${num(DROP, 1)}</span><span>${t(T("pts", "个百分点"))}</span></div>
      </div>
      <div class="ds-ppl" role="img" aria-label="${esc(aria)}">
        ${row("earlier", E_DONE, E_SIGN, "e", 0)}${row("recent", R_DONE, R_SIGN, "r", 1)}
        <p class="ds-ppl-cap"><span class="ds-key"><i class="c"></i>${t(T("completed", "完成"))}</span><span class="ds-key"><i class="s"></i>${t(T("signed up, did not complete", "报名但未完成"))}</span><span class="ds-ppl-note">${t(T("Bars drawn to scale", "条形按人数比例绘制"))}</span></p>
      </div>`;
  }

  /* ---------- step 2: the cohort chart ---------- */
  function trendSVG(d, cp) {
    const W = cp ? 330 : 760, padL = cp ? 34 : 50, padR = cp ? 50 : 124;
    const top = cp ? 50 : 56, mainH = cp ? 196 : 236;
    const step = (W - padL - padR) / 12;
    const X = (i) => r1(padL + (i + 0.5) * step);
    const yMin = 0.14, yMax = 0.32;
    const Y = (v) => r1(top + (1 - (v - yMin) / (yMax - yMin)) * mainH);
    const sTop = top + mainH + (cp ? 58 : 50), sH = cp ? 38 : 46, sMax = 0.6;
    const SY = (s) => r1(sTop + sH - (s / sMax) * sH);
    const H = sTop + sH + (cp ? 30 : 34);
    const sel = C.find((c) => c.n === d.cohort) || LOW;
    const xr = W - padR, ext = step * 0.42, xd = r1(padL + 6 * step);
    let g = hatchDef("ds-hatch-t");

    // selected column
    g += `<rect class="ds-selcol" x="${r1(X(sel.i) - step / 2)}" y="${top - 12}" width="${r1(step)}" height="${r1(H - top - 8)}" rx="2"/>`;
    // grid + y axis
    [0.15, 0.2, 0.25, 0.3].forEach((v) => {
      g += `<line class="ds-gl" x1="${padL}" x2="${xr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ds-ax" x="${padL - 8}" y="${Y(v)}" dy=".34em" text-anchor="end">${num(v * 100, 0)}%</text>`;
    });
    // period divider + labels
    g += `<line class="ds-div" x1="${xd}" x2="${xd}" y1="${top - 38}" y2="${sTop + sH + 4}"/>`;
    const perLab = (k, cx) => `<text class="ds-per" x="${r1(cx)}" y="${top - 24}" text-anchor="middle">${esc(cp ? t(D.periods[k].short) : (t(D.periods[k].short) + " · " + t(D.periods[k])))}</text>`;
    g += perLab("earlier", padL + 3 * step) + perLab("recent", padL + 9 * step);

    // the gap: between the earlier level and the recent average, hatched in orange (same mark as the home figure)
    g += `<rect class="ds-gap" x="${r1(X(6) - ext)}" y="${Y(pE)}" width="${r1(xr - X(6) + ext)}" height="${r1(Y(pR) - Y(pE))}" fill="url(#ds-hatch-t)"/>`;

    // wobble bands (one per period, around that period's average)
    const band = (arr, p) => {
      const up = [[X(arr[0].i) - ext, p + wobOf(arr[0])]].concat(arr.map((c) => [X(c.i), p + wobOf(c)]), [[X(arr[arr.length - 1].i) + ext, p + wobOf(arr[arr.length - 1])]]);
      const lo = up.map(([x, v]) => [x, 2 * p - v]);
      const pt = (a) => a.map(([x, v]) => `${r1(x)},${Y(v)}`).join(" ");
      return `<polygon class="ds-bandfill" points="${pt(up)} ${pt(lo.slice().reverse())}"/><polyline class="ds-bandedge" points="${pt(up)}"/><polyline class="ds-bandedge" points="${pt(lo)}"/>`;
    };
    const eHi = pE + wobOf(EARLY[0]);
    g += `<g class="ds-band">${band(EARLY, pE)}${band(LATE, pR)}
      ${cp ? "" : `<text class="ds-bandlab" x="${r1(X(0) - ext)}" y="${Y(eHi) - 9}">${esc(t(T("Shaded: expected wobble (95%)", "阴影：正常波动范围（95%）")))}</text>`}</g>`;

    // period averages: the earlier level continues (dotted) across the recent cohorts, so the gap reads
    g += `<line class="ds-mean e" x1="${r1(X(0) - ext)}" x2="${r1(X(5) + ext)}" y1="${Y(pE)}" y2="${Y(pE)}"/>
      <line class="ds-mean ghost" x1="${r1(X(6) - ext)}" x2="${xr + 4}" y1="${Y(pE)}" y2="${Y(pE)}"/>
      <line class="ds-mean r" x1="${r1(X(6) - ext)}" x2="${xr + 4}" y1="${Y(pR)}" y2="${Y(pR)}"/>`;
    // right-margin labels + bracket
    const lx = xr + (cp ? 8 : 16);
    if (cp) {
      g += `<text class="ds-ml" x="${lx}" y="${Y(pE)}" dy=".34em">${P(pE)}</text><text class="ds-ml now" x="${lx}" y="${Y(pR)}" dy=".34em">${P(pR)}</text>`;
    } else {
      const bx = xr + 7;
      g += `<path class="ds-brk" d="M${bx - 3} ${Y(pE)} H${bx} V${Y(pR)} H${bx - 3}"/>
        <text class="ds-ml" x="${lx}" y="${Y(pE)}" dy=".34em">${P(pE)}</text><text class="ds-mls" x="${lx}" y="${Y(pE) + 21}">${esc(t(T("earlier avg", "前期平均")))}</text>
        <text class="ds-delta" x="${lx}" y="${r1((Y(pE) + Y(pR)) / 2) + 14}">−${num(DROP, 1)}${zhL() ? "" : " pts"}</text>
        <text class="ds-ml now" x="${lx}" y="${Y(pR)}" dy=".34em">${P(pR)}</text><text class="ds-mls" x="${lx}" y="${Y(pR) + 21}">${esc(t(T("recent avg", "近期平均")))}</text>`;
    }

    // the line + dots
    g += `<path class="ds-line" pathLength="1" d="${C.map((c, k) => (k ? "L" : "M") + X(c.i) + " " + Y(c.rate)).join(" ")}"/>`;
    C.forEach((c) => { const on = c.n === sel.n; g += `${on ? `<circle class="ds-halo" cx="${X(c.i)}" cy="${Y(c.rate)}" r="11"/>` : ""}<circle class="ds-dot ${on ? "sel" : ""} ${c.period}" data-rd-src="ds-c-${c.n}" style="--i:${c.i}" cx="${X(c.i)}" cy="${Y(c.rate)}" r="${on ? 6 : 4.6}"/>`; });
    // selected value pill (below the dot when it is a local low)
    {
      const prev = C[sel.i - 1], next = C[sel.i + 1];
      const nb = avg([prev, next].filter(Boolean).map((c) => c.rate));
      const below = sel.rate < nb;
      const label = P(sel.rate), w = cp ? 56 : 58, hh = cp ? 24 : 24;
      const px = Math.max(padL + 2, Math.min(xr - w - 2, X(sel.i) - w / 2));
      const py = below ? Y(sel.rate) + 14 : Y(sel.rate) - 14 - hh;
      g += `<g class="ds-pill"><rect x="${r1(px)}" y="${r1(py)}" width="${w}" height="${hh}" rx="2"/><text x="${r1(px + w / 2)}" y="${r1(py + hh / 2)}" dy=".36em" text-anchor="middle">${label}</text></g>`;
    }

    // partner-share strip
    g += `<line class="ds-gl base" x1="${padL}" x2="${xr}" y1="${sTop + sH}" y2="${sTop + sH}"/>`;
    const bw = r1(step * (cp ? 0.56 : 0.44));
    C.forEach((c) => {
      const on = c.n === sel.n;
      g += `<rect class="ds-sbar ${on ? "sel" : ""}" style="--i:${c.i}" x="${r1(X(c.i) - bw / 2)}" y="${SY(c.partnerShare)}" width="${bw}" height="${r1(sTop + sH - SY(c.partnerShare))}" rx="1"/>`;
      const show = on || (!cp && (c.i === 0 || c.i === 5 || c.i === 6 || c.i === C.length - 1)) || (cp && c.i === C.length - 1 && sel.i < C.length - 2);
      if (show) g += `<text class="ds-sv ${on ? "sel" : ""}" x="${X(c.i)}" y="${SY(c.partnerShare) - 6}" text-anchor="middle">${P0(c.partnerShare)}</text>`;
    });
    if (cp) g += `<text class="ds-sl" x="${padL - 6}" y="${sTop - 28}">${esc(t(T("Partner share of signups", "合作渠道报名占比")))}</text>`;
    else g += `<text class="ds-sl" x="${lx}" y="${sTop + sH / 2 - 2}">${esc(t(T("partner", "合作渠道")))}</text><text class="ds-mls" x="${lx}" y="${sTop + sH / 2 + 17}">${esc(t(T("share", "报名占比")))}</text>`;
    // cohort numbers
    C.forEach((c) => { g += `<text class="ds-cn ${c.n === sel.n ? "sel" : ""}" x="${X(c.i)}" y="${H - 8}" text-anchor="middle">${c.n}</text>`; });
    if (!cp) g += `<text class="ds-ax" x="${padL - 8}" y="${H - 8}" text-anchor="end">${esc(t(T("Cohort", "批次")))}</text>`;
    // hit targets (mouse convenience; keyboard uses the readout's arrows)
    C.forEach((c) => { g += `<rect class="ds-hit" x="${r1(X(c.i) - step / 2)}" y="${top - 30}" width="${r1(step)}" height="${r1(H - top + 30)}" fill="transparent" data-action="ds-cohort" data-arg="${c.n}" aria-hidden="true"/>`; });

    const aria = t(T(
      `Line chart of 28-day completion for cohorts 1 to 12. Cohorts 1–6 average ${P(pE)}; cohorts 7–12 average ${P(pR)}. The lowest is cohort ${LOW.n} at ${P(LOW.rate)}. Expected wobble is about ±${num(WOB_R * 100, 1)} points for recent cohorts. Partner-offer share of signups rises from ${P0(C[0].partnerShare)} to ${P0(C[11].partnerShare)}.`,
      `第 1–12 批 28 天完成率折线图。第 1–6 批平均 ${P(pE)}，第 7–12 批平均 ${P(pR)}。最低的是第 ${LOW.n} 批，为 ${P(LOW.rate)}。近期批次的正常波动约为 ±${num(WOB_R * 100, 1)} 个百分点。合作渠道报名占比从 ${P0(C[0].partnerShare)} 升至 ${P0(C[11].partnerShare)}。`));
    return `<svg class="ds-svg ${cp ? "cp" : ""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}</svg>`;
  }

  function readout(d) {
    const c = C.find((x) => x.n === d.cohort) || LOW;
    const item = (k, v, cls) => `<div class="${cls || ""}"><dt>${k}</dt><dd class="num">${v}</dd></div>`;
    return `<div class="ds-ro" aria-live="polite">
      <button class="ds-nav" type="button" data-action="ds-cohort" data-arg="prev" data-fk="ds-nav-prev" aria-label="${esc(t(T("Previous cohort", "上一批")))}" ${c.i === 0 ? "disabled" : ""}>‹</button>
      <div class="ds-ro-name"><span class="ds-ro-n">${zhL() ? `第 <span class="num">${c.n}</span> 批` : `Cohort <span class="num">${c.n}</span>`}</span><span class="ld-label">${esc(t(D.periods[c.period].short))}</span></div>
      <dl class="ds-ro-dl">
        ${item(t(T("Signed up", "报名")), N(c.signups))}
        ${item(t(T("Completed", "完成")), N(c.completed))}
        ${item(t(T("Completion", "完成率")), P(c.rate), "hl")}
        ${item(t(T("Wobble", "正常波动")), "±" + num(wobOf(c) * 100, 1))}
        ${item(t(T("Partner", "合作渠道")), P0(c.partnerShare))}
      </dl>
      <button class="ds-nav" type="button" data-action="ds-cohort" data-arg="next" data-fk="ds-nav-next" aria-label="${esc(t(T("Next cohort", "下一批")))}" ${c.i === C.length - 1 ? "disabled" : ""}>›</button>
    </div>`;
  }
  const figInner = (d) => trendSVG(d, compact()) + readout(d);

  /* ---------- step 3: mix bars, dumbbells, what-if bridge ---------- */
  function mixBar(label, share, id) {
    const o = Math.round((1 - share) * 100), p = 100 - o;
    return `<div class="ds-mix-row"><span class="ds-mix-k">${label}</span>
      <div class="ds-mix-bar" ${id ? `id="${id}"` : ""} role="img" aria-label="${esc(`${label}: ${chName("organic")} ${o}%, ${chName("partner")} ${p}%`)}">
        <span class="org" style="width:${o}%"><b>${o}%</b></span><span class="par" style="width:${p}%"><b>${p}%</b></span></div></div>`;
  }
  function dumbbells() {
    const lo = 0.08, hi = 0.36, X = (v) => r1(((v - lo) / (hi - lo)) * 100);
    const row = (name, a, b, cls) => `<div class="ds-db-row ${cls}">
        <div class="ds-db-k">${name}</div>
        <div class="ds-db-track"><span class="seg" style="left:${X(b)}%;width:${r1(X(a) - X(b))}%"></span>
          <span class="dot e" style="left:${X(a)}%"></span><span class="dot r" style="left:${X(b)}%"></span>
          <span class="val e num" style="left:${X(a)}%">${P(a)}</span><span class="val r num" style="left:${X(b)}%">${P(b)}</span></div></div>`;
    const ticks = [0.1, 0.2, 0.3].map((v) => `<span style="left:${X(v)}%">${num(v * 100, 0)}%</span>`).join("");
    const aria = t(T(
      `Completion by channel. Found us directly: ${P(orgE)} earlier, ${P(orgR)} recent. Partner offer: ${P(parE)} earlier, ${P(parR)} recent. All learners: ${P(pE)} earlier, ${P(pR)} recent.`,
      `分渠道完成率。自然来源：前期 ${P(orgE)}，近期 ${P(orgR)}。合作渠道：前期 ${P(parE)}，近期 ${P(parR)}。全部学员：前期 ${P(pE)}，近期 ${P(pR)}。`));
    return `<div class="ds-db" data-rd-src="ds-db" role="img" aria-label="${esc(aria)}">
      <div class="ds-db-leg" aria-hidden="true"><span class="ds-key"><i class="e"></i>${esc(t(D.periods.earlier.short))}</span><span class="ds-key"><i class="r"></i>${esc(t(D.periods.recent.short))}</span></div>
      ${row(chName("organic"), orgE, orgR, "org")}
      ${row(chName("partner"), parE, parR, "par")}
      ${row(t(T("All learners", "全部学员")), pE, pR, "all")}
      <div class="ds-db-row axis" aria-hidden="true"><div></div><div class="ds-db-ticks">${ticks}</div></div></div>`;
  }
  function mixState(sharePct) {
    const s = sharePct / 100, r = whatIf(s);
    const mix = Math.max(0, (r - pR) * 100), rest = (pE - r) * 100;
    // shown to hundredths (trailing zero dropped), the same precision as the reveal and the Brief (3.25 + 3.25);
    // "not explained" is the remainder, so the pair always sums to the headline drop (6.5)
    const mixH = Math.round(mix * 100), restH = Math.max(0, Math.round(DROP * 100) - mixH);
    const atE = Math.abs(s - shareE) < 1e-9, atR = Math.abs(s - shareR) < 1e-9;
    // fixed precision while dragging (no 1↔2-decimal jumps): the actual mix reads 20.5% · 0.0 / 6.5, anywhere else two decimals
    const dig = atR ? 1 : 2;
    const mixTxt = num(mixH / 100, dig), restTxt = num(restH / 100, dig), vTxt = P(r, dig, dig);
    const sub = atR ? t(T(`with the actual recent mix (${P0(shareR)} partner)`, `按近期实际构成（合作渠道 ${P0(shareR)}）`))
      : atE ? t(T(`with the earlier mix (${P0(shareE)} partner)`, `按前期构成（合作渠道 ${P0(shareE)}）`))
      : t(T(`if ${P0(s)} had come through the partner offer`, `假如合作渠道占 ${P0(s)}`));
    return { s, r, mix, rest, sub, atE, atR, mixTxt, restTxt, vTxt };
  }
  /* bridge: a number line from the recent rate to the earlier rate, split at the what-if value */
  const BR_LO = 0.19, BR_HI = 0.28, BX = (v) => r1((v - BR_LO) / (BR_HI - BR_LO) * 100);
  const wiWord = (m) => (m.atR ? t(T("what-if · drag the slider", "假设 · 拖动滑块试试")) : t(T("what-if", "假设")));
  function bridge(m) {
    const ticks = [0.2, 0.22, 0.24, 0.26, 0.28].map((v) => `<b style="left:${BX(v)}%"></b>`).join("");
    return `<div class="ds-br" aria-hidden="true">
        <div class="ds-br-wi" id="ds-br-wi" style="left:${BX(m.r)}%"><span class="num" id="ds-br-wiv">${m.vTxt}</span><span class="ds-br-wl" id="ds-br-wl">${wiWord(m)}</span></div>
        <div class="ds-br-axis">${ticks}
          <span class="mix" id="ds-br-mix" style="left:${BX(pR)}%;width:${r1(BX(m.r) - BX(pR))}%"></span>
          <span class="real" id="ds-br-real" style="left:${BX(m.r)}%;width:${r1(BX(pE) - BX(m.r))}%"></span>
          <i class="mk r" style="left:${BX(pR)}%"></i><i class="mk e" style="left:${BX(pE)}%"></i><i class="mk w" id="ds-br-mk" style="left:${BX(m.r)}%"></i></div>
        <div class="ds-br-ends"><span class="r" style="left:${BX(pR)}%"><b class="num">${P(pR)}</b> ${esc(t(D.periods.recent.short))}</span><span class="e" style="left:${BX(pE)}%"><b class="num">${P(pE)}</b> ${esc(t(D.periods.earlier.short))}</span></div>
      </div>`;
  }
  function whatIfHTML(d) {
    const m = mixState(d.share);
    const lo = Math.round(shareE * 100), hi = Math.round(shareR * 100);
    return `<div class="ds-wi">
      <div class="ds-wi-num">
        <span class="ld-label">${t(T("Recent completion, re-weighted", "近期完成率（重新加权）"))}</span>
        <div class="v num" id="ds-wi-v" data-ld-count data-ld-from="${r1(pR * 100)}" data-ld-delay="350" data-ld-dur="900">${m.vTxt}</div>
        <div class="s" id="ds-wi-s">${m.sub}</div>
      </div>
      <div class="ds-wi-ctl" data-rd-src="ds-mix">
        ${mixBar(t(T("Mix in this what-if", "假设的构成")), m.s, "ds-wi-bar")}
        <label class="ds-wi-lab" for="ds-mix-range">${t(T("Partner-offer share in recent cohorts: ", "近期批次中合作渠道的占比："))}<b id="ds-wi-share" class="num">${P0(m.s)}</b></label>
        <input type="range" class="mp-range no-fill" id="ds-mix-range" dir="rtl" min="${lo}" max="${hi}" step="1" value="${d.share}" data-input="ds-mix" aria-valuetext="${esc(P0(m.s))}">
        <div class="ds-wi-ends">
          <button type="button" data-action="ds-mix" data-arg="${hi}" data-fk="ds-mix-hi" aria-pressed="${m.atR}">${t(T("Actual recent mix", "近期实际构成"))} · <span class="num">${hi}%</span></button>
          <button type="button" data-action="ds-mix" data-arg="${lo}" data-fk="ds-mix-lo" aria-pressed="${m.atE}">${t(T("Earlier mix", "前期构成"))} · <span class="num">${lo}%</span> →</button>
        </div>
      </div>
    </div>
    <div class="ds-dc" data-rd-src="ds-bridge">
      ${cap(t(T(`The ${num(DROP, 1)}-point drop, bridged`, `${num(DROP, 1)} 个百分点的降幅，拆开看`)), false)}
      ${bridge(m)}
      <div class="ds-dc-leg"><span class="mix"><i></i><b class="num" id="ds-dc-mixv">${m.mixTxt}</b> ${t(T("pts explained by the mix", "个百分点来自构成变化"))}</span>
        <span class="real"><i></i><b class="num" id="ds-dc-realv">${m.restTxt}</b> ${t(T("pts not explained by the mix", "个百分点无法用构成解释"))}</span></div>
    </div>`;
  }
  function updateMix(share) {
    const m = mixState(share);
    const set = (id, v, prop) => { const el = document.getElementById(id); if (el) el[prop || "textContent"] = v; };
    set("ds-wi-v", m.vTxt); set("ds-wi-s", m.sub); set("ds-wi-share", P0(m.s));
    set("ds-dc-mixv", m.mixTxt); set("ds-dc-realv", m.restTxt); set("ds-br-wiv", m.vTxt); set("ds-br-wl", wiWord(m));
    const st = (id, l, w) => { const el = document.getElementById(id); if (!el) return; el.style.left = l + "%"; if (w != null) el.style.width = w + "%"; };
    st("ds-br-mix", BX(pR), r1(BX(m.r) - BX(pR))); st("ds-br-real", BX(m.r), r1(BX(pE) - BX(m.r))); st("ds-br-mk", BX(m.r)); st("ds-br-wi", BX(m.r));
    const bar = document.getElementById("ds-wi-bar");
    if (bar) { const o = Math.round((1 - m.s) * 100); bar.children[0].style.width = o + "%"; bar.children[0].firstChild.textContent = o + "%"; bar.children[1].style.width = (100 - o) + "%"; bar.children[1].firstChild.textContent = (100 - o) + "%"; }
    const rg = document.getElementById("ds-mix-range"); if (rg) { if (+rg.value !== share) rg.value = share; MP.rangeFill(rg); rg.setAttribute("aria-valuetext", P0(m.s)); }
    document.querySelectorAll('[data-action="ds-mix"]').forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.arg === share)));
  }

  /* ---------- step 4: tiny evidence glyphs for the ledger (each drawn from the data) ---------- */
  function ledgerGlyph(k) {
    const W = 64, H = 28;
    if (k === "bands") {
      const lo = 0.175, hi = 0.30, y = (v) => r1(2 + (1 - (v - lo) / (hi - lo)) * (H - 4));
      const eT = Math.max(...EARLY.map((c) => pE + wobOf(c))), rB = Math.min(...LATE.map((c) => pR - wobOf(c)));
      return `<svg class="ds-lg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect class="b" x="2" y="${y(eT)}" width="28" height="${r1(y(E_BAND_LO) - y(eT))}"/><rect class="b" x="34" y="${y(R_BAND_HI)}" width="28" height="${r1(y(rB) - y(R_BAND_HI))}"/><line class="m" x1="2" x2="30" y1="${y(pE)}" y2="${y(pE)}"/><line class="m" x1="34" x2="62" y1="${y(pR)}" y2="${y(pR)}"/></svg>`;
    }
    if (k === "half") {
      const w = r1(MIXPTS / DROP * 60);
      return `<svg class="ds-lg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${hatchDef("ds-hatch-lg")}<rect class="mx" x="2" y="9" width="${w}" height="10"/><rect class="rl" x="${2 + w}" y="9" width="${r1(60 - w)}" height="10" fill="url(#ds-hatch-lg)"/></svg>`;
    }
    if (k === "both") {
      const lo = 0.12, hi = 0.32, y = (v) => r1(3 + (1 - (v - lo) / (hi - lo)) * (H - 6));
      return `<svg class="ds-lg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="o" x1="8" x2="56" y1="${y(orgE)}" y2="${y(orgR)}"/><line class="p" x1="8" x2="56" y1="${y(parE)}" y2="${y(parR)}"/>${[[8, orgE, "o"], [56, orgR, "o"], [8, parE, "p"], [56, parR, "p"]].map(([x, v, c]) => `<circle class="${c}" cx="${x}" cy="${y(v)}" r="2.6"/>`).join("")}</svg>`;
    }
    return `<svg class="ds-lg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="q" d="M8,14 H56"/><circle class="qd" cx="32" cy="14" r="8"/><text class="qt" x="32" y="14" dy=".36em" text-anchor="middle">?</text></svg>`;
  }

  /* ---------- write-up helpers ---------- */
  const FIELDS = [
    { k: "found", label: T("What we found", "我们发现了什么"), help: T("The number first, then what's behind it.", "先写数字，再写背后的原因。"), ph: T("Completion fell from … to …. About … of that comes from …", "完成率从……降到……，其中约……来自……") },
    { k: "sure", label: T("How sure we are", "有多大把握"), help: T("What makes it solid, and what it rests on.", "它为什么站得住，又依赖什么前提。"), ph: T("Fairly sure, because …", "比较有把握，因为……") },
    { k: "unknown", label: T("What's still unknown", "还不知道什么"), help: T("The question this data can't answer yet.", "这份数据暂时回答不了的问题。"), ph: T("We don't know yet why …", "我们还不知道为什么……") },
    { k: "dont", label: T("Don't use this to…", "不要用它来……"), help: T("The claim this evidence can't carry.", "这份证据撑不起的结论。"), ph: T("Don't use this to say …", "不要用它来说……") }
  ];
  const filledK = (d, k) => !!(d.sum[k] || "").trim();
  const allFilled = (d) => FIELDS.every((f) => filledK(d, f.k));
  const optNote = (d) => { const n = ["unknown", "dont"].filter((k) => filledK(d, k)).length; return MP.ui("optional") + (n ? ` · ${t(T(`${n} of 2 written`, `已写 ${n}/2`))}` : ""); };
  function starters(d) {
    const zh = MP.lang() === "zh";
    const found = zh
      ? `完成率从 ${P(pE)} 降到 ${P(pR)}。如果近期学员构成和前期一样，近期完成率应为 ${P(REW, 1, 2)}，所以约一半降幅（${num(MIXPTS, 2)} 个百分点）来自合作渠道学员变多；另一半是两个渠道内部都真的下降了。`
      : `Completion fell from ${P(pE)} to ${P(pR)}. With the earlier mix of learners, recent completion would be ${P(REW, 1, 2)}, so about half the drop (${num(MIXPTS, 2)} points) comes from more partner-offer signups; the other half is a real drop inside both channels.`;
    const sure = d.trend === "noise"
      ? (zh ? `比较有把握：第 6 批之后的下降远超正常波动（约 ±${num(WOB_R * 100, 1)} 个百分点），而第 ${LOW.n} 批的低点仍在波动范围内。` : `Fairly sure. The drop after cohort 6 is well outside the expected wobble (about ±${num(WOB_R * 100, 1)} points), while cohort ${LOW.n}'s dip is inside it.`)
      : (zh ? `比较有把握：第 6 批之后的下降远超正常波动（约 ±${num(WOB_R * 100, 1)} 个百分点）。像第 ${LOW.n} 批这样的单次低点在波动范围内，不必单独追查。` : `Fairly sure the drop after cohort 6 is real: it's far bigger than the expected wobble (about ±${num(WOB_R * 100, 1)} points). Single dips like cohort ${LOW.n} sit inside that wobble, so I wouldn't chase them.`);
    const unknown = d.next === "help"
      ? (zh ? "为什么两个渠道内部的完成率都下降了。下一步我会检查卡住的学员有没有及时得到帮助。" : "Why completion fell inside each channel. Next I'd check whether stuck learners got help in time.")
      : d.next === "funnel"
        ? (zh ? "为什么两个渠道内部的完成率都下降了。下一步我会看学习漏斗，找出是哪一步变差了。" : "Why completion fell inside each channel. Next I'd look at the funnel to see which step got worse.")
        : (zh ? "为什么两个渠道内部的完成率都下降了。" : "Why completion fell inside each channel.");
    const dont = zh
      ? `不要用它来说“课程变差了 ${num(DROP, 1)} 个百分点”，也不要只凭完成率评判合作渠道。`
      : `Don't use this to say the course got ${num(DROP, 1)} points worse, or to judge the partner offer on completion alone.`;
    return { found, sure, unknown, dont };
  }
  function practitioner() {
    return {
      found: T(`Completion fell from ${P(pE)} (cohorts 1–6) to ${P(pR)} (cohorts 7–12). About half of the ${num(DROP, 1)}-point drop is mix: partner-offer signups went from ${P0(shareE)} to ${P0(shareR)} of new learners, and they complete less often. The other half is real: completion fell inside both channels (direct ${P0(orgE)} → ${P0(orgR)}, partner ${P0(parE)} → ${P0(parR)}).`,
        `完成率从 ${P(pE)}（第 1–6 批）降到 ${P(pR)}（第 7–12 批）。${num(DROP, 1)} 个百分点的降幅中，约一半来自构成变化：合作渠道学员占新学员的比例从 ${P0(shareE)} 升到 ${P0(shareR)}，而这类学员本来完成得就少。另一半是真实下降：两个渠道内部都降了（自然来源 ${P0(orgE)} → ${P0(orgR)}，合作渠道 ${P0(parE)} → ${P0(parR)}）。`),
      sure: T(`Confident the drop after cohort 6 is real — it's well outside cohort-to-cohort wobble (about ±${num(WOB_R * 100, 1)} points). Cohort ${LOW.n}'s dip is not a new signal. The half-and-half split assumes channel labels are recorded correctly.`,
        `可以确定第 6 批之后的下降是真的：它远超批次之间的正常波动（约 ±${num(WOB_R * 100, 1)} 个百分点）。第 ${LOW.n} 批的低点不算新信号。“一半对一半”的拆分前提是渠道标记准确。`),
      unknown: T("Why completion fell inside each channel. This data shows where and how much — not why.", "两个渠道内部的完成率为什么都下降了。这份数据能说明在哪里、有多少，但说明不了为什么。"),
      dont: T(`Don't use it to claim the course got ${num(DROP, 1)} points worse, or to judge the partner program on completion alone — partner learners may join for different reasons.`,
        `不要用它来断言课程变差了 ${num(DROP, 1)} 个百分点，也不要只凭完成率评判合作项目——合作渠道的学员可能本来就是出于不同目的来的。`)
    };
  }
  /* the artifact's figure: the 12 cohorts, both period averages and the hatched gap (same marks as the step 2 chart) */
  function miniFig() {
    const W = 260, H = 76, pad = 6, yMin = 0.18, yMax = 0.285;
    const X = (i) => r1(pad + i * ((W - 2 * pad) / 11)), Y = (v) => r1(pad + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * pad));
    const xd = r1((X(5) + X(6)) / 2);
    return `<svg class="ds-mini" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(T(`Completion by cohort: about ${P(pE)} for cohorts 1–6, about ${P(pR)} for 7–12.`, `各批次完成率：第 1–6 批约 ${P(pE)}，第 7–12 批约 ${P(pR)}。`)))}">
      ${hatchDef("ds-hatch-m")}
      <rect class="gap" x="${xd}" y="${Y(pE)}" width="${r1(W - pad - xd)}" height="${r1(Y(pR) - Y(pE))}" fill="url(#ds-hatch-m)"/>
      <line class="dv" x1="${xd}" x2="${xd}" y1="2" y2="${H - 2}"/>
      <line class="m" x1="${X(0)}" x2="${xd}" y1="${Y(pE)}" y2="${Y(pE)}"/><line class="m" x1="${xd}" x2="${W - pad}" y1="${Y(pR)}" y2="${Y(pR)}"/>
      <path class="ln" pathLength="1" d="${C.map((c, k) => (k ? "L" : "M") + X(c.i) + " " + Y(c.rate)).join(" ")}"/>${C.map((c) => `<circle class="${c.period}" cx="${X(c.i)}" cy="${Y(c.rate)}" r="2.6"/>`).join("")}</svg>`;
  }

  /* ================= option copy ================= */
  const CLAIM = [
    ["mix", T("Different kinds of learners signed up", "报名的学员类型变了")],
    ["noise", T("Small groups bounce around by chance", "小样本本来就会随机起伏")],
    ["def", T("The definition of “completed” changed", "“完成”的定义变了")],
    ["none", T("Nothing — the drop is clear", "没什么问题，下降很明显")]
  ];
  const TREND = [
    ["chase", T("Yes — it's the lowest point, so find out what went wrong", "值得，这是最低点，要查清楚出了什么问题")],
    ["noise", T("Probably not — it's inside the expected wobble", "大概不必，它还在正常波动范围内")],
    ["unsure", T("Can't tell from this chart", "光看这张图判断不了")]
  ];
  const SPLIT = [
    ["all", T("Almost all of it", "几乎全部")],
    ["half", T("About half", "大约一半")],
    ["none", T("Almost none of it", "几乎没有")]
  ];
  const CONCLUDE = [
    ["a", T(`The course got worse — completion fell ${num(DROP, 1)} points.`, `课程变差了：完成率下降了 ${num(DROP, 1)} 个百分点。`)],
    ["b", T("Part of the drop is the new mix of learners, part is a real drop in both groups — and we can't yet say why.", "一部分下降来自学员构成的变化，一部分是两类学员的完成率都真的降了——原因暂时还说不清。")],
    ["c", T("Nothing really changed — it's just a different mix of learners.", "其实什么都没变，只是学员构成不同了。")]
  ];
  const NEXT = [
    ["funnel", T("Where in the course the drop happens", "下降发生在课程的哪一步"), T("Walk the learner funnel step by step — the BA lens", "逐步查看学习漏斗——BA 视角做的就是这件事"), "ba"],
    ["help", T("Whether stuck learners got help in time", "卡住的学员有没有及时得到帮助"), T("Check the help-request router — the AI lens", "检查求助分流器——AI 视角做的就是这件事"), "ai"]
  ];
  let shownNext = null;
  const labelOf = (list, k) => { const x = list.find((o) => o[0] === k); return x ? t(x[1]) : ""; };

  /* ================= steps ================= */
  const steps = [
    /* ---------- 1. claim ---------- */
    {
      id: "claim",
      title: T("Is the headline telling the whole story?", "这个标题数字\u200b说清全部了吗？"),
      short: T("Question the claim", "审视结论"),
      lead: T(`The team dashboard says completion fell from ${(pE * 100).toFixed(1)}% to ${(pR * 100).toFixed(1)}%. Before anyone explains it, a data scientist asks what could make the number itself misleading.`,
        `团队看板显示，完成率从 ${(pE * 100).toFixed(1)}% 降到了 ${(pR * 100).toFixed(1)}%。在有人急着解释原因之前，数据科学家会先问：这个数字本身会不会误导人？`),
      render(ls) {
        const d = dat(ls);
        return `<div class="work ds-claim">
          ${cap(fig(1, "On the team dashboard", "团队看板上的数字"))}
          ${headline()}
          <p class="ds-def"><span class="ld-label">${t(T("Definition", "口径"))}</span><span>${t(T("“Completed” means finishing the course within 28 days of signing up.", "“完成”指报名后 28 天内学完课程。"))}</span></p>
        </div>
        <div class="work">
          ${qHead(t(T("What could make this number misleading?", "什么会让这个数字产生误导？")), t(T("Pick one or two", "选一到两项")))}
          <div class="options">${CLAIM.map(([k, lab]) => h.option(t(lab), "", "ds-claim", k, d.claim.includes(k), { multi: true })).join("")}</div>
        </div>`;
      },
      ready: (ls) => dat(ls).claim.length > 0,
      reveal(ls) {
        const d = dat(ls), none = d.claim.includes("none");
        return {
          your: none
            ? T("You read the headline at face value. That's the natural first read — the next two steps check whether it holds up.", "你直接接受了这个标题数字。这是很自然的第一反应——接下来两步会检验它站不站得住。")
            : T(`You flagged: ${d.claim.map((k) => labelOf(CLAIM, k)).join(" · ")}.`, `你标记了：${d.claim.map((k) => labelOf(CLAIM, k)).join("、")}。`),
          points: [
            T("All three are worth a minute before anyone explains the drop. The definition one is quick here: it's still 28 days, so you can rule it out.", "在解释下降之前，这三项都值得花一分钟查一下。定义这一项很快就能排除：口径仍然是 28 天。"),
            T(`[[mix|Mix]]: recent cohorts include far more partner-offer learners (${P0(shareE)} → ${P0(shareR)} of signups). Step 3 measures how much that matters.`, `[[mix|构成变化]]：近期批次中合作渠道学员多了很多（占报名的 ${P0(shareE)} → ${P0(shareR)}）。第 3 步会算出它影响有多大。`),
            T(`[[noise|Noise]]: each cohort is only ${N(Math.min(...C.map((c) => c.signups)))}–${N(Math.max(...C.map((c) => c.signups)))} people, so some bounce is expected. Step 2 shows how much.`, `[[noise|随机波动]]：每批只有 ${N(Math.min(...C.map((c) => c.signups)))}–${N(Math.max(...C.map((c) => c.signups)))} 人，本来就会有起伏。第 2 步会告诉你起伏有多大。`)
          ]
        };
      },
      hints: [
        T("Think about what has to stay the same for two percentages to be fairly compared.", "想一想：两个百分比要能公平比较，哪些东西必须保持不变？"),
        T("A percentage depends on three things: who is in the group, how big the group is, and how the thing being counted is defined.", "一个百分比取决于三件事：组里是谁、组有多大、被计数的东西怎么定义。"),
        T("Example: a gym's “still coming after a month” rate drops right after a January promo. The gym didn't get worse — the promo brought in a different crowd.", "例子：健身房一月搞促销后，“一个月后还在来”的比例下降了。不是健身房变差了，而是促销招来了另一类人。")
      ],
      shows: T("Intro statistics and research-methods courses start here: questioning how a metric is defined and who is counted before analyzing it.", "统计入门和研究方法课往往从这里开始：分析之前，先追问指标怎么定义、统计的是哪些人。")
    },

    /* ---------- 2. trend ---------- */
    {
      id: "trend",
      title: T("Random wobble, or a real change?", "是随机起伏，还是真的变了？"),
      short: T("Read the trend", "看趋势"),
      lead: T("Each dot is one [[cohort]]: learners who signed up in the same period. Turn on the expected wobble to see how much a group this size bounces by chance alone.", "每个点代表一个[[cohort]]：同一时期报名的学员。打开“正常波动”，看看这么大的一组人，单凭偶然会起伏多少。"),
      render(ls) {
        const d = dat(ls);
        const sw = `<button type="button" class="ds-switch" data-rd-src="ds-band" role="switch" aria-checked="${!!d.band}" data-action="ds-band" data-fk="ds-band"><span class="tr" aria-hidden="true"></span>${t(T("Show expected wobble", "显示正常波动"))}</button>`;
        const how = h.fold("ds-band-how", t(T("How the wobble band is computed", "波动范围是怎么算的")),
          `<p class="small">${t(T(
            `If nothing changed, a cohort of <i>n</i> learners with a typical rate <i>p</i> still lands within about <span class="mono">1.96 × √(p(1−p)/n)</span> of <i>p</i>, 95% of the time. For the recent cohorts, p = ${P(pR)} and n ≈ ${N(LATE[LATE.length - 1].signups)}, so that's about ±${num(wobOf(LATE[LATE.length - 1]) * 100, 1)} points. Each period's band is centered on its own average.`,
            `即使什么都没变，一个 <i>n</i> 人、平均完成率为 <i>p</i> 的批次，95% 的情况下也会落在 <i>p</i> 上下约 <span class="mono">1.96 × √(p(1−p)/n)</span> 的范围内。近期批次 p = ${P(pR)}、n ≈ ${N(LATE[LATE.length - 1].signups)}，算下来约 ±${num(wobOf(LATE[LATE.length - 1]) * 100, 1)} 个百分点。每个时期的波动带都以该时期自己的平均值为中心。`))}</p>`);
        return `<div class="work ds-trend">
          ${cap(fig(2, "28-day completion by signup cohort", "各批次 28 天完成率"))}
          <div class="ds-fig-bar"><p class="ds-fig-hint">${t(T("Tap a cohort to read it.", "点选任一批次查看详情。"))}</p>${sw}</div>
          <div class="ds-fig ${d.band ? "show-band" : ""}" id="ds-trend-fig">${figInner(d)}</div>
          <div class="ds-how">${how}</div>
        </div>
        <div class="work">
          ${qHead(t(T(`Cohort ${LOW.n} dipped to <span class="num">${P(LOW.rate)}</span>, the lowest of all. Is that worth chasing?`, `第 <span class="num">${LOW.n}</span> 批跌到 <span class="num">${P(LOW.rate)}</span>，是所有批次中最低的。\u200b值得追查吗？`)))}
          <div class="options">${TREND.map(([k, lab]) => h.option(t(lab), "", "ds-trend", k, d.trend === k)).join("")}</div>
        </div>`;
      },
      ready: (ls) => !!dat(ls).trend,
      reveal(ls) {
        const d = dat(ls), c7 = C[6], c6 = C[5];
        const your = {
          chase: T("You'd chase the low point. That instinct is common — the chart says it's probably a dip you'd see by chance.", "你想追查这个最低点。这种直觉很常见——但图表显示，这多半只是偶然会出现的低点。"),
          noise: T("You read the dip as wobble. That's how practitioners see it too.", "你把这个低点看作随机波动。从业者也会这样判断。"),
          unsure: T("Fair caution. The wobble band is exactly the tool that turns “can't tell” into a calm answer.", "谨慎是对的。波动带正是把“判断不了”变成有据可依的答案的工具。")
        }[d.trend];
        return {
          your,
          points: [
            T(`Cohort ${LOW.n} sits inside the recent cohorts' wobble band (${P(pR)} ± ${num(wobOf(LOW) * 100, 1)} pts at its size). One low cohort is what [[noise]] looks like.`, `第 ${LOW.n} 批落在近期批次的波动带内（按它的人数，${P(pR)} ± ${num(wobOf(LOW) * 100, 1)} 个百分点）。单个低点，正是[[noise]]的样子。`),
            T(`The step between cohort 6 and cohort 7 is different: the lowest edge of the earlier band (${P(E_BAND_LO)}) sits above the highest edge of the recent band (${P(R_BAND_HI)}, at cohort ${R_BAND_HI_C.n}, the smallest recent group). That shift is worth explaining.`, `第 6 批到第 7 批的落差就不一样了：前期波动带的最低处（${P(E_BAND_LO)}）仍高于近期波动带的最高处（${P(R_BAND_HI)}，出现在人数最少的第 ${R_BAND_HI_C.n} 批）。这个变化才值得解释。`),
            T(`Notice what else moved at cohort 7: the partner-offer share jumped from ${P0(c6.partnerShare)} to ${P0(c7.partnerShare)}. That's the lead for the next step.`, `注意第 7 批还有什么变了：合作渠道占比从 ${P0(c6.partnerShare)} 跳到 ${P0(c7.partnerShare)}。这就是下一步的线索。`)
          ]
        };
      },
      hints: [
        T("Turn on “Show expected wobble.” Is cohort 11 outside the shaded band?", "打开“显示正常波动”。第 11 批落在阴影带外面了吗？"),
        T("Compare two kinds of change: one cohort dipping inside its band, and the whole series stepping down from one band to another.", "比较两种变化：一个批次在波动带内下探，和整条线从一个波动带整体下移到另一个。"),
        T("Example: flip a fair coin 1,000 times and you'll often see 48% or 52% heads. Only something like 60% would make you suspect the coin.", "例子：把一枚均匀的硬币抛 1,000 次，正面出现 48% 或 52% 都很常见。只有到 60% 这种程度，你才会怀疑硬币有问题。")
      ],
      shows: T("Statistical inference courses: sampling variation, confidence intervals, and control charts for telling a signal from noise.", "统计推断类课程：抽样波动、置信区间，以及用控制图区分信号与噪声。")
    },

    /* ---------- 3. split ---------- */
    {
      id: "split",
      title: T("Is it the learners, or the course?", "是学员变了，还是课程变了？"),
      short: T("Split by channel", "按渠道拆分"),
      lead: T("Recent cohorts brought in many more learners through a partner offer. Split completion by channel, then ask: what if the mix hadn't changed?", "近期批次通过合作渠道来的学员多了很多。按渠道拆开看完成率，再问一句：如果学员构成没变，会怎样？"),
      render(ls) {
        const d = dat(ls);
        return `<div class="work ds-split">
          ${cap(fig(3, "Who signed up, and who completed", "谁来报名，谁完成了"))}
          <div class="ds-split-grid">
            <div class="ds-split-col">
              <h3 class="ds-sub">${t(T("Who signed up", "谁来报名"))}</h3>
              <div class="ds-mix">${mixBar(t(D.periods.earlier.short), shareE)}${mixBar(t(D.periods.recent.short), shareR)}
                <div class="ds-mix-leg"><span class="ds-key"><i class="org"></i>${chName("organic")}</span><span class="ds-key"><i class="par"></i>${chName("partner")}</span></div></div>
              <p class="ds-note">${t(T(`The partner-offer share of new learners doubled, from ${P0(shareE)} to ${P0(shareR)}. Partner learners complete less often in both periods.`, `合作渠道学员在新学员中的占比翻了一倍，从 ${P0(shareE)} 升到 ${P0(shareR)}。无论前期还是近期，合作渠道学员的完成率都更低。`))}</p>
            </div>
            <div class="ds-split-col">
              <h3 class="ds-sub">${t(T("Completion inside each group", "各组内部的完成率"))}</h3>
              ${dumbbells()}
            </div>
          </div>
        </div>
        <div class="work ds-whatif">
          ${cap(fig(4, "Re-weighting to the earlier mix", "按前期构成重新加权"), t(T("Drag the slider", "拖动滑块")))}
          ${whatIfHTML(d)}
        </div>
        <div class="work">
          ${qHead(t(T(`So how much of the ${num(DROP, 1)}-point drop comes from the change in who signed up?`, `那么，<span class="num">${num(DROP, 1)}</span> 个百分点的降幅里，\u200b有多少来自报名人群的变化？`)))}
          <div class="options ds-opts-row">${SPLIT.map(([k, lab]) => h.option(t(lab), "", "ds-split", k, d.split === k)).join("")}</div>
        </div>`;
      },
      ready: (ls) => !!dat(ls).split,
      reveal(ls) {
        const d = dat(ls), trap = d.claim.includes("none");
        const your = trap
          ? T("In step 1 the headline looked clear. Half of it turned out to be a change in who signed up — one of the most common traps in reading a metric.", "第 1 步时，这个标题数字看起来一目了然。结果其中一半来自报名人群的变化——这是解读指标时最常见的误区之一。")
          : { all: T("You expected the mix to explain nearly everything. The what-if says it explains about half.", "你以为构成变化几乎能解释全部。假设计算显示，它只解释了大约一半。"),
            half: T("You read the split the way practitioners do.", "你的拆分判断和从业者一致。"),
            none: T("You expected the mix to matter little. The what-if says it explains about half.", "你以为构成变化影响不大。假设计算显示，它解释了大约一半。") }[d.split];
        return {
          trap,
          your,
          points: [
            T(`With the earlier mix, recent completion would be ${P(REW, 1, 2)}, not ${P(pR)}. So ${num(MIXPTS, 2)} of the ${num(DROP, 1)} points come from [[mix]] — about half.`, `如果构成和前期一样，近期完成率会是 ${P(REW, 1, 2)}，而不是 ${P(pR)}。所以 ${num(DROP, 1)} 个百分点里有 ${num(MIXPTS, 2)} 个来自[[mix]]——大约一半。`),
            T(`The other half is real: completion fell inside both groups (direct ${P0(orgE)} → ${P0(orgR)}, partner ${P0(parE)} → ${P0(parR)}).`, `另一半是真实下降：两个组内部都降了（自然来源 ${P0(orgE)} → ${P0(orgR)}，合作渠道 ${P0(parE)} → ${P0(parR)}）。`),
            T(`Reporting all ${num(DROP, 1)} points as “the course got worse” would double the real effect. Calling it “just mix” would hide a real drop.`, `把 ${num(DROP, 1)} 个百分点全说成“课程变差了”，会把真实影响夸大一倍；说成“只是构成变了”，又会掩盖真实的下降。`)
          ]
        };
      },
      hints: [
        T("Look at each channel on its own first. Did completion fall inside each group?", "先单独看每个渠道。各组内部的完成率下降了吗？"),
        T(`Drag the slider all the way to the earlier mix. The gap between ${P(pR)} and the new number is the part caused by the mix.`, `把滑块一直拖到前期构成。${P(pR)} 和新数字之间的差，就是构成变化造成的部分。`),
        T(`Worked example: with the earlier mix, recent completion = ${P0(1 - shareE)} × ${P0(orgR)} + ${P0(shareE)} × ${P0(parR)} = ${P(REW, 1, 2)}. So ${num(MIXPTS, 2)} points come from the mix, and ${P(pE)} − ${P(REW, 1, 2)} = ${num(REALPTS, 2)} points are a real drop.`,
          `算一遍：按前期构成，近期完成率 = ${P0(1 - shareE)} × ${P0(orgR)} + ${P0(shareE)} × ${P0(parR)} = ${P(REW, 1, 2)}。所以有 ${num(MIXPTS, 2)} 个百分点来自构成变化，${P(pE)} − ${P(REW, 1, 2)} = ${num(REALPTS, 2)} 个百分点是真实下降。`)
      ],
      shows: T("Causal inference and applied statistics: stratifying, re-weighting (standardization), and Simpson's paradox.", "因果推断与应用统计：分层分析、重新加权（标准化），以及辛普森悖论。")
    },

    /* ---------- 4. conclude ---------- */
    {
      id: "conclude",
      title: T("How strong a claim can we make?", "我们能下多强的结论？"),
      short: T("Draw a conclusion", "下结论"),
      lead: T("A good conclusion says exactly as much as the evidence supports — no more, no less.", "好的结论只说证据撑得起的话，不多也不少。"),
      render(ls) {
        const d = dat(ls);
        let ln = 0;
        const row = (k, txt, open) => `<li class="${open ? "open" : ""}" data-rd-src="ds-lg-${k}" style="--n:${ln++}"><span class="ds-ck" aria-hidden="true">${open ? "?" : "✓"}</span><span class="ds-lt">${txt}</span>${ledgerGlyph(k)}</li>`;
        const connNew = !!d.next && shownNext !== d.next; shownNext = d.next || null;   // rise in only when the pick changes
        const connect = d.next ? `<div class="ds-connect${connNew ? " is-new" : ""}">
            <h3 class="ds-sub">${t(T("Both checks are real next steps — and both lenses work on this same problem", "两个方向都是实在的下一步——\u200b而且这两个视角研究的正是同一个问题"))}</h3>
            <div class="ds-connect-grid">${NEXT.map(([k, , , lens]) => `<button type="button" class="ds-lens-card lens-${lens} ${d.next === k ? "picked" : ""}" data-action="go" data-arg="#/lens/${lens}" data-fk="ds-lc-${lens}">
              <span class="ld-gbox ld-grid">${MP.draw.glyph(lens)}</span>
              <span class="ds-lc-h">${h.lensTag(lens)}${d.next === k ? `<span class="ds-pick">${t(T("Your pick", "你的选择"))}</span>` : ""}</span>
              <span class="ds-lc-q lens-q">${t(MP.lensInfo[lens].question)}</span>
              <span class="ds-lc-go">${t(T(`Open the ${MP.lensInfo[lens].short} lens`, `打开 ${MP.lensInfo[lens].short} 视角`))} <span aria-hidden="true">→</span></span></button>`).join("")}</div></div>` : "";
        return `<div class="work ds-conc">
          ${cap(t(T("The evidence so far", "目前的证据")), t(T("Steps 1–3", "第 1–3 步")))}
          <ol class="ds-ledger">
            ${row("bands", t(T(`The drop after cohort 6 is bigger than chance: the two periods' wobble bands don't overlap.`, `第 6 批之后的下降超出了偶然范围：两个时期的波动带不重叠。`)))}
            ${row("half", t(T(`About half of the ${num(DROP, 1)} points (<span class="nowrap">${pts(MIXPTS, 2)}</span>) comes from more partner-offer learners.`, `${num(DROP, 1)} 个百分点中约一半（<span class="nowrap">${pts(MIXPTS, 2)}</span>）来自合作渠道学员变多。`)))}
            ${row("both", t(T(`Completion fell inside both channels: <span class="nowrap">${P0(orgE)} → ${P0(orgR)}</span> and <span class="nowrap">${P0(parE)} → ${P0(parR)}</span>.`, `两个渠道内部的完成率都降了：<span class="nowrap">${P0(orgE)} → ${P0(orgR)}</span>，<span class="nowrap">${P0(parE)} → ${P0(parR)}</span>。`)))}
            ${row("why", t(T("Why it fell inside each channel — this data doesn't say.", "为什么各渠道内部都降了——这份数据说明不了。")), true)}
          </ol>
          <div class="ds-qwrap">${qHead(t(T("Which statement would you put your name to?", "你愿意在哪句结论上签名？")))}
            <div class="options">${CONCLUDE.map(([k, lab]) => h.option(`<span class="ds-letter">(${k})</span>${t(lab)}`, "", "ds-conclude", k, d.conclude === k, { cls: "ds-stmt" })).join("")}</div></div>
        </div>
        <div class="work">
          ${qHead(t(T("What would you check next?", "下一步你会查什么？")))}
          <div class="options ds-opts-2">${NEXT.map(([k, lab, sub]) => h.option(t(lab), t(sub), "ds-next", k, d.next === k)).join("")}</div>
          ${connect}
        </div>`;
      },
      ready: (ls) => { const d = dat(ls); return !!(d.conclude && d.next); },
      reveal(ls) {
        const d = dat(ls);
        const your = {
          a: T("You'd sign (a). It's the claim most dashboards invite — but it blames the course for the part that's just a different crowd.", "你选了 (a)。这是看板最容易引出的结论——但它把“人群不同”造成的那部分也算到了课程头上。"),
          b: T("You'd sign (b): it claims exactly what the evidence shows, and names what it can't.", "你选了 (b)：它只说证据能说明的，也点明了说明不了的。"),
          c: T("You'd sign (c). The mix matters, but it only explains about half — completion also fell inside both groups.", "你选了 (c)。构成变化确实重要，但只解释了大约一半——两组内部的完成率也都降了。")
        }[d.conclude];
        return {
          your,
          points: [
            T("Practitioners would sign (b). It separates what the data shows (how much, and where) from what it doesn't (why).", "从业者会选 (b)。它把数据能说明的（降了多少、降在哪里）和说明不了的（为什么）分开了。"),
            T("(a) overclaims: it explains the whole drop with one cause. (c) underclaims: it ignores a real drop inside both groups.", "(a) 说多了：用一个原因解释了全部降幅。(c) 说少了：忽视了两组内部的真实下降。"),
            T("Your next check follows the evidence. Because the drop is real inside both channels, the cause sits somewhere in the learner journey — the BA lens finds where; the AI lens tests one reason why.", "你的下一步顺着证据走。既然两个渠道内部都真的降了，原因就藏在学习过程的某个环节里——BA 视角找出在哪一步，AI 视角检验其中一个可能的原因。")
          ]
        };
      },
      hints: [
        T("For each statement, ask: does the evidence support every part of it?", "逐句问自己：证据能支撑这句话的每一部分吗？"),
        T("Statement (a) explains the whole drop with one cause. Statement (c) says nothing changed. What did step 3 show about each?", "(a) 用一个原因解释全部降幅，(c) 说什么都没变。第 3 步的结果对这两句各说明了什么？"),
        T("Example of a careful conclusion: “Recent cohorts complete less often — partly because more partner learners joined, partly because completion fell for everyone. We don't know why yet.”", "一个谨慎结论的例子：“近期批次完成得更少了——一部分因为合作渠道学员变多，一部分因为所有人的完成率都降了。原因还不清楚。”")
      ],
      shows: T("Research design and causal inference: matching the strength of a claim to the evidence, and keeping “what changed” separate from “why.”", "研究设计与因果推断：让结论的强度与证据相匹配，把“变了什么”和“为什么变”分开。")
    },

    /* ---------- 5. summary ---------- */
    {
      id: "summary",
      title: T("Write the evidence summary", "写一份证据小结"),
      short: T("Evidence summary", "证据小结"),
      lead: T("Four short boxes a product lead can read in a minute. The first two are enough — or let the starters draft them from your choices, then make them yours.", "四个短框，让产品负责人一分钟读完。填前两个就够了——也可以先用句子开头根据你的选择起草，再改成自己的话。"),
      render(ls) {
        const d = dat(ls);
        const rb = RD ? RD.built(ls) : null, lr = RD && RD.on(ls) ? " lr-on" : "";
        const box = (f) => { const inner = boxIn(f); return RD ? RD.row(ls, f.k, inner, rb) : inner; };
        const boxIn = (f) => `<div class="ds-mf"><label for="ds-f-${f.k}"><span class="ds-mn num" aria-hidden="true">${String(FIELDS.indexOf(f) + 1).padStart(2, "0")}</span><span class="ds-mk">${t(f.label)}</span><span class="ds-mh">${t(f.help)}</span></label>
          <textarea class="textarea" id="ds-f-${f.k}" rows="3" data-input="ds-field" data-arg="${f.k}" data-fk="ds-f-${f.k}" placeholder="${esc(t(f.ph))}">${esc(d.sum[f.k] || "")}</textarea></div>`;
        const ex = practitioner();
        const exHTML = `<div class="ds-ex-doc"><p class="ds-pro-note">${t(T("One way a data scientist might write it. Not the answer — notice what each box leads with, and how plainly the limits are stated.", "一位数据科学家可能的写法。这不是标准答案——留意每一栏先写了什么，以及边界说得有多直白。"))}</p>
          <dl>${FIELDS.map((f) => `<dt>${t(f.label)}</dt><dd>${esc(t(ex[f.k]))}</dd>`).join("")}</dl></div>`;
        const more = h.fold("ds-more", `<span class="ds-fold-l">${t(T("Add what's still unknown, and the limits", "补充仍未知的部分和使用边界"))}</span><span class="ds-fold-note" id="ds-opt-note">${optNote(d)}</span>`, `<div class="ds-mfs lr-rows${lr}">${box(FIELDS[2])}${box(FIELDS[3])}</div>`);
        const example = h.fold("ds-example", `<span class="ds-fold-l">${t(T("Compare with a practitioner's version", "对照一位从业者的写法"))}</span><span class="ds-fold-note">${t(T("teaching example", "教学示例"))}</span>`, exHTML, { boxed: true });
        return `<div class="work ds-write">
          <div class="ds-write-top">
            <div class="ds-doc-head"><span class="ld-label">${t(T("Evidence summary · for the product lead", "证据小结 · 写给产品负责人"))}</span><h2 class="ds-doc-title">${t(T("LumenLearn · 28-day completion", "LumenLearn · 28 天完成率"))}</h2>
              <div class="ds-doc-meta"><span>${t(T("Cohorts 1–12", "第 1–12 批"))}</span><span class="ds-doc-ro num">${P(pE)}${arrowSVG}<em>${P(pR)}</em></span></div></div>
            <div class="ds-write-acts">${allFilled(d) ? `<span class="ds-allset">${t(T("All four parts drafted", "四部分都写好了"))}</span>`
              : h.secondary(`<span class="ds-pen" aria-hidden="true">✎</span>${t(T("Use sentence starters", "使用句子开头"))}`, "ds-starters", "", { sm: true })}${RD ? RD.button(ls) : ""}</div>
          </div>
          <div class="ds-mfs lr-rows${lr}" id="ds-sum-boxes">${box(FIELDS[0])}${box(FIELDS[1])}</div>
          <div class="ds-write-more">${more}</div>
        </div>${example}`;
      },
      ready: (ls) => { const s = dat(ls).sum; return (s.found || "").trim().length >= 10 && (s.sure || "").trim().length >= 6; },
      reveal() {
        return {
          points: [
            T("Lead with the number and its size, then how sure you are — in that order. Busy readers stop after two lines.", "先写数字和幅度，再写有多大把握——顺序很重要。忙碌的读者往往只看前两行。"),
            T("“How sure” is about the evidence, not your mood: name what makes it solid (bigger than the wobble) and what it rests on (channel labels being right).", "“有多大把握”说的是证据，不是心情：写出它为什么站得住（超出正常波动），以及依赖什么前提（渠道标记准确）。"),
            T("The “Don't use this to…” line protects the work: it stops a careful finding from being stretched into a claim it can't carry.", "“不要用它来……”这一句是在保护你的工作：防止一个严谨的发现被引申成它撑不起的结论。")
          ]
        };
      },
      hints: [
        T("Start with the number, then say how much of it is mix and how much is real.", "先写数字，再写其中多少来自构成变化、多少是真实下降。"),
        T("For “How sure,” point to evidence: the drop is bigger than the expected wobble, and the split is about half and half.", "写“有多大把握”时，要指向证据：降幅超出正常波动，拆分结果大约一半对一半。"),
        T(`Example: “Completion fell ${num(DROP, 1)} points. About half is a change in who signed up; half is a real drop in both channels. We're fairly sure, because the drop is well beyond normal wobble.”`, `例子：“完成率降了 ${num(DROP, 1)} 个百分点。约一半来自报名人群的变化，另一半是两个渠道内部的真实下降。我们比较有把握，因为降幅远超正常波动。”`)
      ],
      shows: T("Capstone projects and data-communication courses: writing findings for non-technical readers, with uncertainty stated plainly.", "毕业项目和数据沟通类课程：为非技术读者写结论，并把不确定性说清楚。")
    }
  ];
  const S = Object.fromEntries(steps.map((s) => [s.id, s]));

  /* ================= AI layer ================= */
  /* AI-2 "Ask about this step" (step.ask) and AI-1 "second read" rules for the evidence summary. Composed from the
     student's own picks/text and the numbers above; before a step is ready, chips explain and point, never reveal. */
  const AIK = MP.ai, X = AIK && AIK.text;
  const r2 = (x) => Math.round(x * 100) / 100;
  const done = (id) => !!(MP.progress && MP.progress(id).complete);
  const lowF = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const WOB_LAST = wobOf(LATE[LATE.length - 1]);
  const KN = (() => {
    const k = [27, 20.5, r1(pE * 100), r1(pR * 100), r1(DROP), r2(MIXPTS), r1(MIXPTS), r2(REALPTS), r1(REALPTS), r2(REW * 100), r1(REW * 100), D.reweighted,
      r1(orgE * 100), r1(orgR * 100), r1(parE * 100), r1(parR * 100), Math.round(shareE * 100), Math.round(shareR * 100), r1(WOB_R * 100), r1(WOB_E * 100), r1(WOB_LAST * 100),
      r1(E_BAND_LO * 100), r1(R_BAND_HI * 100), E_SIGN, R_SIGN, E_DONE, R_DONE, 95, 1.96, 28, 100, 50, 80];
    C.forEach((c) => k.push(r1(c.rate * 100), c.signups, c.completed, Math.round(c.partnerShare * 100), r1(wobOf(c) * 100)));
    for (let s = Math.round(shareE * 100); s <= Math.round(shareR * 100); s++) k.push(r2(whatIf(s / 100) * 100));
    return k;
  })();
  const LX = {
    mix: { en: ["partner", "partners", "partner-offer", "mix", "channel", "channels", "who signed up", "composition", "kinds of learners", "different learners", "re-weighted", "reweighted"], zh: ["合作", "渠道", "构成", "人群", "报名的人", "加权"] },
    noise: { en: ["wobble", "noise", "random", "chance", "by chance", "band", "fluctuation", "variation"], zh: ["波动", "偶然", "随机", "起伏", "噪声"] },
    blame: { en: ["course got worse", "the course is worse", "worse course", "course quality", "the course failed"], zh: ["课程变差", "课程质量", "课程变糟", "课程不行"] },
    trait: { en: ["worse students", "bad students", "lazy", "less motivated", "don't care", "weaker students", "lower quality learners"], zh: ["学生更差", "不认真", "素质", "懒", "差生", "不努力"] },
    limit: { en: ["why", "don't know", "do not know", "unknown", "can't tell", "cannot tell", "not yet", "doesn't show", "doesn't say"], zh: ["为什么", "不知道", "还不清楚", "说不清", "说明不了", "还不知道"] },
    nouns: { en: ["completion", "drop", "partner", "mix", "cohort", "channel", "course"], zh: ["完成率", "下降", "合作", "构成", "批次", "渠道", "课程"] }
  };
  const optLabels = () => { const o = []; [CLAIM, TREND, SPLIT, CONCLUDE].forEach((l) => l.forEach((x) => { o.push(x[1].en, x[1].zh); })); NEXT.forEach((x) => { o.push(x[1].en, x[1].zh); }); return o; };
  const pr = (a, b) => `${P(a)} → ${P(b)}`;
  const RULES = [
    { id: "ds.namesMix", kind: "keep",
      test(F, c, H) {
        // a channel word inside a sentence that overclaims or gives one cause all of the drop isn't a strength to praise
        const bad = (h) => { const se = F.found.sents.find((x) => h.s >= x.s && h.s < x.e); return se && H.find("found", AIK.lex.causal, AIK.lex.overclaim, LX.blame).some((x) => x.s >= se.s && x.s < se.e); };
        const h = H.find("found", LX.mix).find((x) => !bad(x)); if (!h) return null;
        const t = F.found.text, m = t.slice(h.e).match(/^[\s-]+[A-Za-z]+|^[\u4e00-\u9fff]{1,2}/); return { box: "found", s: h.s, e: h.e + (m ? m[0].length : 0) };
      },
      say(F, c) { return { g: [
        T(["You name the channel, which is exactly where ", c.d.split ? "your split in step 3 pointed." : "the step 3 split points."], ["你点出了渠道，这正是", c.d.split ? "你第 3 步拆分时指向的地方。" : "第 3 步拆分所指向的地方。"]),
        c.d.split === "half" ? T(["Who signed up is half the story, and you put it in the first box. Keep it there."], ["谁来报名是一半的答案，你把它放进了第一栏。留着。"]) : null,
        T(["A reader learns from this box that the learners changed, not just the number. That's the finding most dashboards miss."], ["读者从这一栏就能知道：变的不只是数字，还有学员本身。这正是多数看板会漏掉的发现。"])],
        why: T(["Without the mix, a lead would read the whole drop as the course getting worse."], ["不写构成变化，负责人会把整个降幅都读成课程变差了。"]),
        cites: [{ lens: "ds", step: "split" }] }; } },
    { id: "ds.numberFirst", kind: "keep",
      test(F, c, H) { const s0 = F.found.sents[0]; if (!s0) return null; const n = H.known("found").find((x) => x.s < s0.e); return n ? H.sent("found") : null; },
      say() { return { g: [
        T(["The number comes first and it checks out. A product lead knows the size of the problem from line one."], ["数字放在最前面，而且对得上。产品负责人第一句就知道问题有多大。"]),
        T(["Number first, story second: that's the order busy readers need. Keep it."], ["先数字，后解释，正是忙碌的读者需要的顺序。保留。"]),
        T(["This opening gives a figure anyone can check on the dashboard."], ["这个开头给了一个谁都能在看板上核对的数字。"])],
        why: T(["Readers who stop after one line still leave with the size of the change."], ["只读一行就停下的读者，也能带走变化的幅度。"]),
        cites: [{ lens: "ds", step: "claim" }] }; } },
    { id: "ds.noiseNamed", kind: "keep",
      test(F, c, H) { const h = H.find("sure", LX.noise)[0]; return h ? H.at("sure", h) : null; },
      say() { return { g: [
        T(["You say what makes it solid: the drop is bigger than the normal wobble. That's how sure should be argued."], ["你写出了它为什么站得住：降幅超出了正常波动。“有多大把握”就该这样写。"]),
        T(["Sureness backed by the wobble band, not by feeling. Keep it."], ["用波动带来支撑把握，而不是凭感觉。保留。"]),
        T(["This line lets a reader check your confidence instead of taking it on trust."], ["这一句让读者可以核对你的把握，而不必只是相信你。"])],
        why: T(["Naming the check you ran turns how sure you are into something a reader can verify."], ["写明你做过的检验，“有多大把握”就变成了读者可以核实的东西。"]),
        cites: [{ lens: "ds", step: "trend" }] }; } },
    { id: "ds.limitNamed", kind: "keep",
      test(F, c, H) { for (const k of ["unknown", "dont"]) { if (F[k].empty) continue; const h = H.find(k, LX.limit)[0]; if (h) return H.at(k, h); } return null; },
      say() { return { g: [
        T(["You keep what the data can't say apart from what it can. That's what makes the rest believable."], ["你把数据说明不了的部分，和能说明的部分分开了。这让其余的内容更可信。"]),
        T(["Stating the limit plainly protects the finding. Keep it."], ["把边界直白地写出来，是在保护你的发现。保留。"])],
        cites: [{ lens: "ds", step: "conclude", src: null }] }; } },

    { id: "ds.numberUnknown", kind: "try", pri: 1,
      test(F, c, H) { for (const k of ["found", "sure"]) { const n = H.unknown(k)[0]; if (n) return Object.assign(H.at(k, n), { x: { raw: n.raw } }); } return null; },
      say(F, c, a) { const raw = esc(a.x.raw); return { g: [
        T(["I can't find ", { b: raw }, " in your steps. The headline is ", { nw: pr(pE, pR) }, ", and the what-if with the earlier mix is ", { b: P(REW, 2, 2) }, ". Is this from somewhere else?"], ["你前面几步里我没找到 ", { b: raw }, "。标题数字是 ", { nw: pr(pE, pR) }, "，按前期构成重新加权是 ", { b: P(REW, 2, 2) }, "。这个数是从别处来的吗？"]),
        T(["Where does ", { b: raw }, " come from? The figures on your screens were ", { nw: pr(pE, pR) }, " overall and ", { b: num(MIXPTS, 2) }, " points from the mix."], [{ b: raw }, " 是哪里来的？你前面看到的是整体 ", { nw: pr(pE, pR) }, "，以及来自构成变化的 ", { b: num(MIXPTS, 2) }, " 个百分点。"])],
        d: [T(["Check ", { b: raw }, ": it isn't in steps 1 to 4. The headline is ", { nw: pr(pE, pR) }, "."], ["核对一下 ", { b: raw }, "：第 1 到第 4 步里都没有这个数。标题数字是 ", { nw: pr(pE, pR) }, "。"])],
        why: T(["One number a reader can't trace makes them doubt the ones they can."], ["一个读者追溯不到的数字，会让他连能追溯的那些也一起怀疑。"]),
        cites: [{ lens: "ds", step: "split" }] }; } },
    { id: "ds.causal", kind: "ask", pri: 2,
      test(F, c, H) { const h = H.find("found", AIK.lex.causal, AIK.lex.overclaim)[0]; return h ? H.at("found", h) : null; },
      say(F, c) { const m = num(MIXPTS, 2), dr = num(DROP, 1), own = c.d.split === "half", ran = !!c.d.split; return { g: [
        T([own ? "Your own split in step 3 found" : ran ? "The split in step 3 found" : "The split in step 3 shows", " about half of the ", { b: dr }, "-point drop is mix (", { b: m }, " points), and half is a real drop inside both channels. Does this word give one cause all of it?"], [own ? "你在第 3 步自己算出" : ran ? "第 3 步的拆分显示" : "第 3 步的拆分会显示", "：", { b: dr }, " 个百分点里约一半来自构成变化（", { b: m }, " 个），另一半是两个渠道内部的真实下降。这个词是不是把全部原因都归给了一方？"]),
        c.d.conclude === "b" ? T(["This reads as one cause for the whole drop. In step 4 you signed a statement that splits it in two. Which one should the reader take away?"], ["这句话读起来像是一个原因解释了全部降幅。可你在第 4 步签下的结论，把它分成了两半。读者应该记住哪一个？"])
          : T(["This reads as proof of one cause for the whole drop. The data can show how much is mix (about ", { b: m }, " of ", { b: dr }, " points); it can't prove what caused the rest."], ["这句话读起来像是证明了一个原因解释全部降幅。数据能说明多少来自构成变化（", { b: dr }, " 个百分点里约 ", { b: m }, " 个），却证明不了其余部分是什么造成的。"]),
        T(["A product lead will repeat this sentence. If it says caused, they'll say the partner offer did it, all ", { b: dr }, " points."], ["产品负责人会转述这句话。如果写的是“导致”，他们就会说：是合作渠道造成了全部 ", { b: dr }, " 个百分点。"])],
        d: [T(["Say part, not all: about ", { b: m }, " of ", { b: dr }, " points is mix; the rest is a real drop in both channels."], ["写成一部分，而不是全部：", { b: dr }, " 个百分点里约 ", { b: m }, " 个来自构成，其余是两个渠道内部的真实下降。"])],
        why: T(["Causal words travel. Once a lead repeats it, the half that isn't mix disappears from the story."], ["因果的说法会被传开。负责人一转述，不是构成造成的那一半，就从故事里消失了。"]),
        cites: [{ lens: "ds", step: "split" }, { lens: "ds", step: "conclude" }] }; },
      bit: T("Found no longer gives one cause all of the drop", "“发现”不再把降幅全归给一个原因") },
    { id: "ds.contradiction", kind: "ask", pri: 2,
      test(F, c, H) { if (c.d.conclude !== "b") return null; const h = H.find("found", LX.blame)[0]; return h ? H.at("found", h) : null; },
      say() { return { g: [
        T(["In step 4 you signed (b): part mix, part a real drop, and why still unknown. This sentence sounds closer to (a). Which do you want the reader to take away?"], ["你在第 4 步签的是 (b)：一部分是构成变化，一部分是真实下降，原因还不知道。这句话听起来更接近 (a)。你希望读者记住哪一个？"]),
        T(["Your step 4 statement and this sentence disagree. One says the course got worse; the other says we can't yet say why."], ["你第 4 步的结论和这句话对不上：一个说课程变差了，一个说原因还说不清。"])],
        d: [T(["Match this to the statement you signed in step 4: part mix, part real, cause unknown."], ["让这句和你第 4 步签下的结论一致：一部分构成，一部分真实下降，原因未知。"])],
        cites: [{ lens: "ds", step: "conclude", src: null }] }; },
      bit: T("Found now matches the statement you signed", "“发现”和你签下的结论一致了") },
    { id: "ds.trait", kind: "ask", pri: 3,
      test(F, c, H) { for (const k of ["found", "sure"]) { const h = H.find(k, LX.trait)[0]; if (h) return H.at(k, h); } return null; },
      say() { return { g: [
        T(["The data shows partner learners complete less often; it doesn't say why, or anything about them as people. Could this go under Don't use this to… as the claim to avoid?"], ["数据只显示合作渠道的学员完成得更少，没说为什么，更没说他们是什么样的人。这句话能不能挪到“不要用它来……”，作为要避免的说法？"]),
        T(["This is a claim about people that the numbers can't carry. Partner learners may join for different reasons. Is it a finding, or a misuse to warn against?"], ["这是一个关于人的判断，数字撑不起来。合作渠道的学员可能本来就是出于不同目的来的。它是发现，还是该提醒别人避免的误用？"])],
        d: [T(["Move this to Don't use this to…: it's a claim about people the data can't support."], ["把这句挪到“不要用它来……”：这是数据撑不起的、关于人的判断。"])],
        why: T(["Completion rates describe outcomes, not motivation. A reader who repeats this would be blaming a group the data never measured."], ["完成率描述的是结果，不是动机。转述这句话的人，等于在责怪一群数据从没测量过的人。"]),
        cites: [{ lens: "ds", step: "split", src: null }] }; } },
    { id: "ds.mixMissing", kind: "try", pri: 4,
      test(F, c, H) { if (!c.d.split || F.found.empty || H.has("found", LX.mix)) return null; return H.sent("found"); },
      say(F, c) { const m = num(MIXPTS, 2), dr = num(DROP, 1), lab = labelOf(SPLIT, c.d.split); return { g: [
        T(["Your step 3 what-if says about half of the drop (", { b: m }, " of ", { b: dr }, " points) is a change in who signed up. Found doesn't mention it yet."], ["你第 3 步的假设计算显示，约一半降幅（", { b: dr }, " 个百分点里的 ", { b: m }, " 个）来自报名人群的变化。“我们发现了什么”里还没提到这一点。"]),
        T(["Who signed up changed: partner-offer signups went from ", { b: P0(shareE) }, " to ", { b: P0(shareR) }, ". That's half the story, and it isn't in this box yet."], ["报名的人变了：合作渠道占比从 ", { nw: `${P0(shareE)} → ${P0(shareR)}` }, "。这是一半的答案，这一栏还没写。"]),
        T(["In step 3 you answered ", { b: lowF(SPLIT.find((x) => x[0] === c.d.split)[1].en) }, ". Whatever the share, the mix belongs in what you found."], ["你在第 3 步的回答是", { b: lab }, "。不论占多少，构成变化都应该写进“我们发现了什么”。"])],
        d: [T(["Add the mix: about ", { b: m }, " of ", { b: dr }, " points."], ["补上构成变化：", { b: dr }, " 个百分点里约 ", { b: m }, " 个。"])],
        why: T(["Without it, a lead reads the whole drop as the course getting worse."], ["不写它，负责人会把整个降幅都读成课程变差。"]),
        cites: [{ lens: "ds", step: "split" }] }; } },
    { id: "ds.numberMissing", kind: "try", pri: 4,
      test(F, c, H) { if (F.found.empty || H.nums("found").length) return null; return H.sent("found"); },
      say() { return { g: [
        T(["How much did it fall? The headline is ", { nw: pr(pE, pR) }, ". Leading with it tells a reader the size before the story."], ["降了多少？标题数字是 ", { nw: pr(pE, pR) }, "。先写它，读者在听故事之前就知道了幅度。"]),
        T(["There's no number in Found yet. ", { nw: pr(pE, pR) }, " is the one a product lead already knows from the dashboard."], ["“我们发现了什么”里还没有数字。", { nw: pr(pE, pR) }, " 是产品负责人在看板上已经见过的那个。"])],
        d: [T(["Start with ", { nw: pr(pE, pR) }, "."], ["用 ", { nw: pr(pE, pR) }, " 开头。"])],
        why: T(["A finding without its size is hard to weigh against everything else on a lead's desk."], ["没有幅度的发现，很难和负责人桌上的其他事情比轻重。"]),
        cites: [{ lens: "ds", step: "claim", src: null }] }; } },
    { id: "ds.sureBare", kind: "try", pri: 5,
      test(F, c, H) { if (F.sure.empty || H.has("sure", LX.noise) || H.nums("sure").length || H.has("sure", AIK.lex.overclaim)) return null; return H.sent("sure"); },
      say(F, c) { const w = num(WOB_R * 100, 1); return { g: [
        T(["Sure based on what? ", c.d.band ? "Your" : "The", " wobble band in step 2 answers it: the drop after cohort 6 is far bigger than the normal ±", { b: w }, " points."], ["凭什么有把握？第 2 步的波动带就是答案：第 6 批之后的下降，远大于正常的 ±", { b: w }, " 个百分点。"]),
        T(["A reader can't check a feeling. Name the check: the two periods' wobble bands don't overlap."], ["读者没法核对一种感觉。写出你做过的检验：两个时期的波动带不重叠。"])],
        d: [T(["Name the evidence: the drop is well outside the ±", { b: w }, "-point wobble."], ["写出证据：降幅远超 ±", { b: w }, " 个百分点的正常波动。"])],
        why: T(["How sure should point at evidence, so a reader can disagree with the evidence rather than with you."], ["“有多大把握”应该指向证据，这样读者质疑的是证据，而不是你。"]),
        cites: [{ lens: "ds", step: "trend" }] }; } },
    { id: "ds.overSure", kind: "try", pri: 2,
      test(F, c, H) { for (const k of ["sure", "found"]) { const h = H.find(k, AIK.lex.overclaim)[0]; if (h) return H.at(k, h); } return null; },
      say() { const w = num(WOB_R * 100, 1); return { g: [
        T(["This is more certainty than one dataset can give. Say what makes it solid instead: the drop is well outside the expected wobble (about ±", { b: w }, " points)."], ["一份数据给不了这么满的把握。不如写出它为什么站得住：降幅远超正常波动（约 ±", { b: w }, " 个百分点）。"]),
        T(["Very sure is fine if you show why. The wobble band from step 2 is the why."], ["很有把握没问题，前提是写出依据。第 2 步的波动带就是依据。"])],
        d: [T(["Swap the certainty for the evidence: well outside the ±", { b: w }, "-point wobble."], ["把“肯定”换成证据：远超 ±", { b: w }, " 个百分点的正常波动。"])],
        why: T(["Absolute words invite a reader to find the one exception. Evidence holds up better."], ["绝对化的词会让读者去找那一个例外。证据更经得起推敲。"]),
        cites: [{ lens: "ds", step: "trend" }] }; },
      bit: T("How sure now points at evidence", "把握改成了用证据说话") },
    { id: "ds.jargon", kind: "try", pri: 3,
      test(F, c, H) { for (const k of ["sure", "found"]) { const h = H.find(k, AIK.lex.jargon)[0]; if (h) return H.at(k, h); } return null; },
      say() { return { g: [
        T(["A product lead may hear this word as important. Say what you checked: the drop after cohort 6 is well outside the normal cohort-to-cohort wobble."], ["负责人可能把这个词听成“很重要”。直接写你核对了什么：第 6 批之后的下降，远超批次之间的正常波动。"]),
        T(["This term means something precise to you and something vaguer to a non-technical reader. Plain words say it better here."], ["这个术语对你来说很精确，对非技术读者却很模糊。这里用平常话说更清楚。"])],
        d: [T(["Replace the term with what you checked: bigger than the normal wobble."], ["把术语换成你核对过的事：超出了正常波动。"])],
        why: T(["Readers act on what they think a word means, not on what it means in a statistics course."], ["读者是按自己理解的意思行动的，而不是按统计课里的定义。"]),
        cites: [{ lens: "ds", step: "trend" }] }; } },
    { id: "ds.dontEmpty", kind: "try", pri: 8,
      test(F, c) { return F.dont.empty && c.d.conclude ? { box: "dont" } : null; },
      say(F, c) { const a = labelOf(CONCLUDE, "a"), aE = CONCLUDE[0][1].en; return { g: c.d.conclude === "a" ? [
        T(["This box is optional. One candidate: in step 4 you leaned toward (a), ", { b: lowF(aE.replace(/\.$/, "")) }, "; your step 3 split says about half of that is mix. That's the misuse worth naming here."], ["这一栏可以不写。一个候选：你第 4 步选的是 (a)，", { b: a.replace(/。$/, "") }, "；而你第 3 步的拆分说，其中约一半来自构成变化。这正是值得在这里写明的误用。"])] : [
        T(["Step 4 hands you a line for this box: the statement you didn't sign, (a), ", { b: lowF(aE.replace(/\.$/, "")) }, ". It's the misuse a dashboard invites."], ["第 4 步其实给了你这一栏的内容：你没有签的那句 (a)，", { b: a.replace(/。$/, "") }, "。这正是看板最容易引出的误用。"]),
        T(["Optional, but you already know the claim this evidence can't carry: (a) from step 4."], ["可以不写，不过你其实已经知道这份证据撑不起哪句话：第 4 步的 (a)。"])],
        cites: [{ lens: "ds", step: "conclude" }] }; } },
    { id: "ds.unknownEmpty", kind: "try", pri: 8,
      test(F, c) { return F.unknown.empty && c.d.next ? { box: "unknown" } : null; },
      say(F, c) { const n = NEXT.find((x) => x[0] === c.d.next); return { g: [
        T(["Your step 4 pick already names the open question: ", { b: lowF(n[1].en) }, ". That's a ready-made line for what's still unknown."], ["你第 4 步的选择已经点出了还没解开的问题：", { b: n[1].zh }, "。这可以直接写进“还不知道什么”。"])],
        cites: [{ lens: "ds", step: "conclude" }] }; } }
  ];
  const RD = MP.lensRead ? MP.lensRead({
    lens: "ds", doc: T("evidence summary", "证据小结"),
    boxes: FIELDS.map((f) => ({ k: f.k, label: f.label, fold: f.k === "unknown" || f.k === "dont" ? "ds-more" : null,
      thin: f.k === "found" ? T("what the data showed, and how big it is", "数据显示了什么、幅度有多大") : f.k === "sure" ? T("how sure you are, and what that rests on", "你有多大把握、依据是什么") : null })),
    req: ["found", "sure"], scan: "ds-sum-boxes",
    text: (ls, k) => (dat(ls).sum[k] || ""), taId: (k) => "ds-f-" + k, store: (ls) => dat(ls),
    nouns: LX.nouns, known: () => KN, sources: optLabels,
    topic: { en: ["learner", "learners", "drop", "completion", "rate", "cohort", "cohorts", "mix", "partner", "channel", "wobble", "noise", "data", "evidence", "real"], zh: ["学员", "下降", "完成", "批次", "构成", "合作", "渠道", "波动", "数据", "证据"] },
    ctx(ls) { return { d: dat(ls), baDone: done("ba"), aiDone: done("ai") }; },
    trace(ls, c) {
      const o = [];
      if (c.d.trend) o.push({ label: T("your step 2 call", "你第 2 步的判断") });
      if (c.d.split) o.push({ label: T("your step 3 split", "你第 3 步的拆分") });
      if (c.d.conclude) o.push({ label: T("the statement you signed", "你签下的结论") });
      return o;
    },
    intro: [
      T("I read it as a product lead would, checking each claim against what you found in steps 2 to 4.", "我按产品负责人的方式读，把每个说法和你第 2 到第 4 步的发现对了一遍。"),
      T("Read for a busy product lead: is the size first, is the sureness earned, and does every claim match your own steps?", "按忙碌的产品负责人来读：幅度是不是放在最前，把握有没有依据，每个说法和你前面几步对不对得上。")
    ],
    rules: RULES
  }) : null;

  /* ---------- AI-2: Ask about this step ---------- */
  const listT = (keys, list) => T(keys.map((k) => lowF(labelOf2(list, k, "en"))).join(" and "), keys.map((k) => labelOf2(list, k, "zh")).join("、"));
  function labelOf2(list, k, l) { const x = list.find((o) => o[0] === k); return x ? x[1][l] : ""; }
  S.claim.ask = {
    seen(ls) {
      const d = dat(ls);
      if (!d.claim.length) return T(["you haven't flagged anything yet. The question is about the number itself, before anyone explains it."], ["你还没标记任何一项。这一步问的是数字本身，在任何人解释它之前。"]);
      if (d.claim.includes("none")) return T(["you said nothing makes it misleading: the drop looks clear. The next two steps test that."], ["你认为没什么会误导：下降看起来很明显。接下来两步会检验这一点。"]);
      const l = listT(d.claim, CLAIM);
      return T(["you flagged ", { b: l.en }, "."], ["你标记了：", { b: l.zh }, "。"]);
    },
    chips(ls, ready) { return [{ id: "fair", q: T("What has to stay the same for a fair comparison?", "要公平比较，哪些东西必须不变？"), a() { return { variants: [
      T(["Three things: who is in the group, how big the group is, and how the thing being counted is defined. Here the definition stayed at 28 days; the other two are worth a look."], ["三件事：组里是谁、组有多大、被计数的东西怎么定义。这里的定义一直是 28 天；另外两件值得看一看。"]),
      T(["Ask whether the earlier and recent numbers count the same kind of people, in groups big enough not to bounce, using the same rule for completed."], ["问问：前后两期的数字，统计的是不是同一类人？每组够不够大、不至于乱跳？“完成”的标准是不是一样？"])],
      cites: [{ lens: "ds", step: "claim", src: "ds-hl", label: T("Fig. 1 · the headline", "图 1 · 标题数字") }] }; } }]; }
  };
  S.trend.ask = {
    seen(ls) {
      const d = dat(ls), c = C.find((x) => x.n === d.cohort) || LOW, w = num(wobOf(c) * 100, 1);
      const pick = d.trend ? [T([" You said: ", { b: lowF(labelOf2(TREND, d.trend, "en")) }, "."], ["你的判断是：", { b: labelOf2(TREND, d.trend, "zh") }, "。"])] : [];
      const base = d.band
        ? T(["the wobble band is on and you're looking at cohort ", { b: c.n }, " (", { b: P(c.rate) }, "), where chance alone allows about ±", { b: w }, " points."], ["“正常波动”已经打开，你正在看第 ", { b: c.n }, " 批（", { b: P(c.rate) }, "）；按它的人数，单凭偶然就可能上下浮动约 ", { b: w }, " 个百分点。"])
        : T(["you're looking at cohort ", { b: c.n }, " (", { b: P(c.rate) }, ") without the expected-wobble band. Turning it on shows how far a single cohort can drift by chance."], ["你正在看第 ", { b: c.n }, " 批（", { b: P(c.rate) }, "），还没打开“正常波动”带。打开它，就能看到单个批次靠运气能偏多远。"]);
      return { en: [base.en].concat(pick.map((p) => p.en)), zh: [base.zh].concat(pick.map((p) => p.zh)) };
    },
    term() { return T(`Here, each dot is one weekly cohort of ${N(Math.min(...C.map((c) => c.signups)))}–${N(Math.max(...C.map((c) => c.signups)))} learners.`, `在这一步里，每个点是一周的报名批次，每批 ${N(Math.min(...C.map((c) => c.signups)))}–${N(Math.max(...C.map((c) => c.signups)))} 人。`); },
    chips(ls, ready) {
      const d = dat(ls), out = [];
      if (ready) out.push({ id: "step", q: T("Why is the step after cohort 6 different?", "为什么第 6 批之后的落差不一样？"), a() { return { variants: [
        T(["One cohort dipping inside its band is what chance looks like. After cohort 6 the whole series moves: the lowest edge of the earlier band (", { b: P(E_BAND_LO) }, ") sits above the highest edge of the recent one (", { b: P(R_BAND_HI) }, "). And at cohort 7 the partner share jumps ", { nw: `${P0(C[5].partnerShare)} → ${P0(C[6].partnerShare)}` }, "."], ["单个批次在波动带内下探，是偶然的样子。第 6 批之后，整条线都移了：前期波动带的最低处（", { b: P(E_BAND_LO) }, "）仍高于近期波动带的最高处（", { b: P(R_BAND_HI) }, "）。而且到第 7 批，合作渠道占比从 ", { nw: `${P0(C[5].partnerShare)} → ${P0(C[6].partnerShare)}` }, "。"]),
        T(["Six cohorts in a row sit lower, and the two bands don't even touch. A shift that size and that steady isn't chance. Something changed at cohort 7, and the partner share is the first suspect."], ["连续六批都更低，两个波动带甚至不挨着。这么大、这么稳定的变化不是偶然。第 7 批发生了什么，而合作渠道占比是头号嫌疑。"])],
        cites: [{ lens: "ds", step: "trend", src: "ds-c-6", label: T("Cohort 6", "第 6 批") }, { lens: "ds", step: "trend", src: "ds-c-7", label: T("Cohort 7", "第 7 批") }] }; } });
      out.push({ id: "wobble", q: T("How big is the normal wobble here?", "这里的正常波动有多大？"), a() { const w = num(WOB_LAST * 100, 1); return { variants: [
        T(["For a recent cohort of about ", { b: N(LATE[LATE.length - 1].signups) }, " learners at ", { b: P(pR) }, ", chance alone moves completion about ±", { b: w }, " points, 95% of the time. Smaller groups bounce more."], ["一个约 ", { b: N(LATE[LATE.length - 1].signups) }, " 人、完成率 ", { b: P(pR) }, " 的近期批次，单凭偶然，95% 的情况下会上下浮动约 ", { b: w }, " 个百分点。人越少，起伏越大。"]),
        T(["About ±", { b: w }, " points for a recent cohort. The shaded band draws it around each period's average, so you can see which dots are inside it."], ["近期批次大约 ±", { b: w }, " 个百分点。阴影带把它画在每个时期的平均值周围，哪些点在带内一眼就能看到。"])],
        cites: [{ lens: "ds", step: "trend", src: "ds-band", label: T("Show expected wobble", "显示正常波动") }] }; } });
      return out;
    }
  };
  S.split.ask = {
    seen(ls) {
      const d = dat(ls), m = mixState(d.share);
      const base = m.atR ? T(["the what-if slider is still at the actual recent mix (", { b: P0(shareR) }, " partner), so recent completion reads ", { b: P(pR) }, "."], ["假设滑块还停在近期实际构成（合作渠道 ", { b: P0(shareR) }, "），所以近期完成率显示 ", { b: P(pR) }, "。"])
        : m.atE ? T(["you've moved the slider back to the earlier mix (", { b: P0(shareE) }, " partner): recent completion reads ", { b: P(REW, 2, 2) }, "."], ["你把滑块拖回了前期构成（合作渠道 ", { b: P0(shareE) }, "）：近期完成率显示 ", { b: P(REW, 2, 2) }, "。"])
        : T(["the slider sits at ", { b: P0(m.s) }, " partner, so recent completion reads ", { b: m.vTxt }, "."], ["滑块停在合作渠道 ", { b: P0(m.s) }, "，近期完成率显示 ", { b: m.vTxt }, "。"]);
      if (!d.split) return base;
      return { en: [base.en, " You answered ", { b: lowF(labelOf2(SPLIT, d.split, "en")) }, "."], zh: [base.zh, "你的回答是：", { b: labelOf2(SPLIT, d.split, "zh") }, "。"] };
    },
    chips(ls, ready) {
      const out = [];
      if (ready) out.push({ id: "real", q: T("Is the other half just bad luck?", "另一半会不会只是运气不好？"), a() { return { variants: [
        T(["Unlikely. It shows up inside both channels at once (direct ", { nw: `${P0(orgE)} → ${P0(orgR)}` }, ", partner ", { nw: `${P0(parE)} → ${P0(parR)}` }, "), across six cohorts, and step 2's bands don't overlap. Luck rarely lines up like that."], ["不太可能。它同时出现在两个渠道里（自然来源 ", { nw: `${P0(orgE)} → ${P0(orgR)}` }, "，合作渠道 ", { nw: `${P0(parE)} → ${P0(parR)}` }, "），持续了六批，而且第 2 步的两个波动带不重叠。运气很少这么整齐。"]),
        T(["Each channel fell on its own, so the mix can't explain it, and six cohorts in a row make chance a poor bet. That leaves a real change in the learner journey, which this data can locate but not explain."], ["每个渠道都各自下降了，构成变化解释不了；连续六批都这样，偶然也说不通。剩下的就是学习过程中的真实变化，这份数据能定位它，却解释不了它。"])],
        cites: [{ lens: "ds", step: "split", src: "ds-db", label: T("Completion by channel", "分渠道完成率") }, { lens: "ds", step: "trend" }] }; } });
      out.push({ id: "slider", q: T("What does the slider actually change?", "这个滑块到底改了什么？"), a() { return { variants: [
        T(["It keeps each channel's recent completion rate fixed (", { b: P0(orgR) }, " and ", { b: P0(parR) }, ") and only changes how many learners come from each. Whatever moves is the part explained by the mix."], ["它保持每个渠道的近期完成率不变（", { b: P0(orgR) }, " 和 ", { b: P0(parR) }, "），只改变两个渠道各来了多少人。数字变动的那部分，就是构成变化能解释的部分。"]),
        T(["Only who signed up. Nobody's behaviour changes in the what-if, so any gap it closes was never about the course."], ["只改报名的人群。假设里没有人的行为变了，所以它能补回来的差距，本来就和课程无关。"])],
        cites: [{ lens: "ds", step: "split", src: "ds-mix", label: T("Fig. 4 · the slider", "图 4 · 滑块") }] }; } });
      return out;
    }
  };
  S.conclude.ask = {
    seen(ls) {
      const d = dat(ls);
      if (!d.conclude && !d.next) return T(["you haven't picked a statement or a next check yet. The ledger above holds everything steps 1 to 3 found."], ["你还没选结论，也没选下一步。上面的清单列出了第 1 到第 3 步的全部发现。"]);
      const a = d.conclude ? T(["you'd sign (", d.conclude, ")"], ["你会签 (", d.conclude, ")"]) : T(["you haven't signed a statement yet"], ["你还没签结论"]);
      const n = d.next ? T([" and check ", { b: lowF(labelOf2(NEXT, d.next, "en")) }, " next."], ["，下一步会查", { b: labelOf2(NEXT, d.next, "zh") }, "。"]) : T([", with no next check yet."], ["，还没选下一步。"]);
      return { en: [a.en, n.en], zh: [a.zh, n.zh] };
    },
    chips(ls, ready) {
      const out = [];
      if (ready) out.push({ id: "why", q: T("What would it take to say why?", "要说清“为什么”，还需要什么？"), a() { return { variants: [
        T(["A different kind of evidence. This data says how much and where; to say why, you'd look inside the learner journey: which step got worse (the BA funnel) and whether stuck learners got help (the AI router)."], ["需要另一种证据。这份数据能说明降了多少、降在哪里；要说清为什么，得看学习过程内部：哪一步变差了（BA 的漏斗），卡住的学员有没有得到帮助（AI 的分流器）。"]),
        T(["Something that changed at cohort 7 and touches both channels. The other two lenses each test one candidate on this same data."], ["需要找到一件在第 7 批发生、并且同时影响两个渠道的事。另外两个视角，各自在同一份数据上检验了一个候选原因。"])],
        cites: [{ lens: "ba", step: "funnel", go: true }, { lens: "ai", step: "errors", go: true }] }; } });
      out.push({ id: "over", q: T("How do I tell if a claim overreaches?", "怎么判断一个结论说多了？"), a() { return { variants: [
        T(["Read it one clause at a time and point to the evidence for each. If a clause has nothing to point to in the ledger, the claim says more than you found."], ["逐个分句读，每一句都指出它的证据。如果某一句在上面的清单里找不到依据，这个结论就说得比你的发现多。"]),
        T(["Watch for one cause explaining everything, or for nothing changed. Both are tidy, and both usually skip part of the evidence."], ["留意两种说法：一个原因解释一切，或者什么都没变。两种都很整齐，也都常常跳过了一部分证据。"])],
        cites: [{ lens: "ds", step: "conclude", src: "ds-lg-why", label: T("The open question", "未解的问题") }] }; } });
      return out;
    }
  };
  S.summary.ask = {
    seen(ls) {
      const d = dat(ls), a = (d.sum.found || "").trim(), b = (d.sum.sure || "").trim();
      if (!a && !b) return T(["both boxes are still empty. The starters can draft them from your picks, and you make them yours."], ["两个框都还空着。可以先用句子开头根据你的选择起草，再改成自己的话。"]);
      const zh = X && X.lang(a + b) === "zh", cnt = (s) => (zh ? X.chars(s) : X.words(s)), u = zh ? T("characters", "字") : T("words", "词");
      return T(["What we found has ", { b: cnt(a) }, " ", u.en, " and How sure has ", { b: cnt(b) }, ". ", d.read ? "You've had a second read; the notes sit beside each box." : "A second read is there when you want one."], ["“我们发现了什么”有 ", { b: cnt(a) }, " ", u.zh, "，“有多大把握”有 ", { b: cnt(b) }, " ", u.zh, "。", d.read ? "你已经请人读过一遍，批注就在每一栏旁边。" : "想要的话，可以请它帮你读一遍。"]);
    },
    chips() { return [{ id: "plain", q: T("How do I say how sure without jargon?", "不用术语，怎么写“有多大把握”？"), a() { return { variants: [
      T(["Name the check you ran and what it showed: the drop after cohort 6 is far bigger than the normal week-to-week wobble. Then name what it rests on: channel labels being recorded correctly."], ["写出你做的检验和结果：第 6 批之后的下降，远大于每周批次之间的正常波动。再写它依赖的前提：渠道标记是准确的。"]),
      T(["Use the reader's words: bigger than the usual ups and downs. Save words like significant for readers who'll ask how you tested it."], ["用读者的话说：比平时的起伏大得多。“显著”这类词，留给会追问你怎么检验的读者。"])] }; } }]; }
  };

  /* ================= actions ================= */
  MP.on("ds-claim", (el, k) => {
    const d = dat(L()); let a = d.claim.slice();
    if (k === "none") a = a.includes("none") ? [] : ["none"];
    else { a = a.filter((x) => x !== "none"); if (a.includes(k)) a = a.filter((x) => x !== k); else { a.push(k); if (a.length > 2) a.shift(); } }
    d.claim = a; MP.commit();
  });
  MP.on("ds-band", (el) => {
    const d = dat(L()); d.band = !d.band; MP.save();
    const fig = document.getElementById("ds-trend-fig"); if (fig) fig.classList.toggle("show-band", d.band);
    el.setAttribute("aria-checked", String(d.band));
  });
  MP.on("ds-cohort", (el, arg) => {
    const d = dat(L()), cur = C.findIndex((c) => c.n === d.cohort);
    let i = arg === "prev" ? cur - 1 : arg === "next" ? cur + 1 : C.findIndex((c) => c.n === +arg);
    i = Math.max(0, Math.min(C.length - 1, i)); d.cohort = C[i].n; MP.save();
    const fig = document.getElementById("ds-trend-fig"); if (!fig) return;
    fig.classList.add("still");   // swapping the chart in place must not replay its arrival intro
    fig.innerHTML = figInner(d);
    if (arg === "prev" || arg === "next") { const b = fig.querySelector(`[data-fk="ds-nav-${arg}"]`); if (b && !b.disabled) b.focus(); else { const o = fig.querySelector(".ds-nav:not([disabled])"); if (o) o.focus(); } }
  });
  MP.on("ds-trend", (el, k) => { dat(L()).trend = k; MP.commit(); });
  MP.on("ds-mix", (el, v) => { const d = dat(L()); d.share = +v; d.mixTried = d.mixTried || +v === Math.round(shareE * 100); MP.save(); updateMix(d.share); });
  MP.onInput("ds-mix", (el) => { const d = dat(L()); d.share = +el.value; if (d.share === Math.round(shareE * 100)) d.mixTried = true; MP.save(); updateMix(d.share); });
  MP.on("ds-split", (el, k) => { dat(L()).split = k; MP.commit(); });
  MP.on("ds-conclude", (el, k) => { dat(L()).conclude = k; MP.commit(); });
  MP.on("ds-next", (el, k) => { dat(L()).next = k; MP.commit(); });
  MP.onInput("ds-field", (el) => {
    const ls = L(), d = dat(ls), key = () => S.summary.ready(ls) + ":" + allFilled(d), before = key();
    d.sum[el.dataset.arg] = el.value; MP.save();
    const note = document.getElementById("ds-opt-note"); if (note) note.textContent = optNote(d);
    if (key() !== before) {
      const id = el.id, a = el.selectionStart, b = el.selectionEnd;
      MP.commit();
      const n = document.getElementById(id); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(a, b); } catch (e) { /* ignore */ } }
    }
  });
  MP.on("ds-starters", () => {
    const d = dat(L()), st = starters(d); let filled = 0;
    FIELDS.forEach((f) => { if (!(d.sum[f.k] || "").trim()) { d.sum[f.k] = st[f.k]; filled++; } });
    if (!filled) { MP.toast(t(T("Every box already has your words — nothing to fill.", "每个框都已经有你写的内容了，无需填充。"))); return; }
    if (filled && (d.sum.unknown || d.sum.dont)) MP.state.ui.folds["ds-more"] = true;
    MP.commit();
    MP.toast(t(T("Filled the empty boxes. Edit them so they sound like you.", "已填入空着的框。改一改，让它们更像你自己的话。")));
  });

  /* ================= summary for dashboard / brief / compare ================= */
  function summary(ls) {
    const d = dat(ls), s = d.sum, zh = MP.lang() === "zh";
    const concl = d.conclude ? labelOf(CONCLUDE, d.conclude) : "";
    // "What you did" names only the steps the student actually did (a skipped split is never "re-weighted")
    const dn = (id) => !!(ls.steps[id] && ls.steps[id].done);
    const cl = { en: [], zh: [] };
    cl.en.push(`tested whether LumenLearn's ${num(DROP, 1)}-point completion drop was real`); cl.zh.push(`检验了 LumenLearn 完成率 ${num(DROP, 1)} 个百分点的下降是否真实`);
    if (dn("trend")) { cl.en.push("separated chance wobble from a real shift"); cl.zh.push("区分了随机波动和真实变化"); }
    if (dn("split")) {
      if (d.split === "half" || d.conclude === "b") { cl.en.push("found that about half came from a change in who signed up"); cl.zh.push("发现约一半来自报名人群的变化"); }
      else { cl.en.push("re-weighted the recent cohorts to the earlier mix"); cl.zh.push("把近期批次按前期构成重新加权"); }
    }
    const wrote = filledK(d, "found") || filledK(d, "sure");
    if (wrote) { const lim = filledK(d, "unknown") || filledK(d, "dont"); cl.en.push(lim ? "wrote an evidence summary that says what the data can't show" : "wrote an evidence summary"); cl.zh.push(lim ? "写了一份写明数据局限的证据小结" : "写了一份证据小结"); }
    const joinEn = (a) => (a.length > 1 ? a.slice(0, -1).join(", ") + (a.length > 2 ? "," : "") + " and " + a[a.length - 1] : a[0]);
    const joinZh = (a) => (a.length > 1 ? a.slice(0, -1).join("，") + "，并" + a[a.length - 1] : a[0]);
    const did = T(`You ${joinEn(cl.en)}.`, `你${joinZh(cl.zh)}。`);
    const row = (f, i) => { const v = (s[f.k] || "").trim(); return `<div><dt><span class="ds-mn num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>${t(f.label)}</dt><dd>${v ? esc(v) : `<span class="faint">${t(T("Not written yet", "尚未填写"))}</span>`}</dd></div>`; };
    const html = `<div class="ds-doc">
      <div class="ds-doc-band">
        <div class="ds-doc-main">
          <div class="ds-doc-kpi"><span class="ld-label">${t(T("28-day completion", "28 天完成率"))}</span><span class="ds-doc-ro big num">${P(pE)}${arrowSVG}<em>${P(pR)}</em></span></div>
          <div class="ds-doc-split" role="img" aria-label="${esc(t(T(`Of the ${num(DROP, 1)}-point drop, ${num(MIXPTS, 2)} points come from the change in mix and ${num(REALPTS, 2)} points are a real drop.`, `${num(DROP, 1)} 个百分点的降幅中，${num(MIXPTS, 2)} 个来自构成变化，${num(REALPTS, 2)} 个是真实下降。`)))}">
            <div class="ds-doc-bar"><span class="mx" style="width:${r1(MIXPTS / DROP * 100)}%"></span><span class="rl" style="width:${r1(REALPTS / DROP * 100)}%"></span></div>
            <div class="ds-doc-leg"><span class="mx"><b class="num">${num(MIXPTS, 2)}</b> ${t(T("pts from the mix", "个百分点来自构成"))}</span><span class="rl"><b class="num">${num(REALPTS, 2)}</b> ${t(T("pts real drop", "个百分点真实下降"))}</span></div>
          </div>
        </div>
        <figure class="ds-doc-fig">${miniFig()}<figcaption class="ld-label">${t(T("Cohorts 1–12", "第 1–12 批"))}</figcaption></figure>
      </div>
      <dl>${FIELDS.map(row).join("")}</dl></div>`;
    const facts = [
      dn("trend") && { kind: "did", text: d.trend === "noise"
        ? t(T(`Showed the drop after cohort 6 is bigger than the expected wobble (about ±${num(WOB_R * 100, 1)} pts), while cohort ${LOW.n}'s dip is not.`, `说明了第 6 批之后的下降超出正常波动（约 ±${num(WOB_R * 100, 1)} 个百分点），而第 ${LOW.n} 批的低点没有。`))
        : t(T(`Compared cohort ${LOW.n}'s dip with the expected wobble band (about ±${num(WOB_R * 100, 1)} pts) and found the real shift is after cohort 6.`, `把第 ${LOW.n} 批的低点和正常波动带（约 ±${num(WOB_R * 100, 1)} 个百分点）做了比较，发现真正的变化发生在第 6 批之后。`)) },
      dn("split") && { kind: "did", text: t(T(`Re-weighted recent cohorts to the earlier mix: ${P(pR)} → ${P(REW, 1, 2)}, so about half the drop is mix and half is real.`, `把近期批次按前期构成重新加权：${P(pR)} → ${P(REW, 1, 2)}，即约一半来自构成变化，一半是真实下降。`)) }
    ].filter(Boolean);
    if (concl) facts.push({ kind: "said", text: t(T(`Concluded: “${esc(concl)}”`, `结论：“${esc(concl)}”`)) });
    const rf = RD && RD.fact(ls);
    if (rf && facts.length < 3) facts.push(rf);
    facts.push({ kind: "limit", text: t(T("This data shows how much and where — not why completion fell inside each channel.", "这份数据能说明降了多少、降在哪里，但说明不了各渠道内部为什么下降。")) });
    void zh;
    const rtr = RD && RD.trace(ls);
    return {
      did,
      move: T("Separated a change in who signed up from a real drop", "把人群构成变化和真实下降区分开"),
      artifact: Object.assign({ title: T("Evidence summary", "证据小结"), html }, rtr ? { trace: rtr } : {}),
      facts
    };
  }

  function sample(ls) {
    const zh = MP.lang() === "zh";
    const now = Date.now(), start = now - 2 * 86400000 - 3 * 3600000;
    ls.data = {
      claim: ["mix", "noise"], band: true, cohort: LOW.n, trend: "noise",
      share: Math.round(shareE * 100), mixTried: true, split: "half", conclude: "b", next: "funnel",
      sum: zh ? {
        found: `完成率从 ${P(pE)} 降到 ${P(pR)}。约一半降幅（${num(MIXPTS, 2)} 个百分点）是因为合作渠道来的学员多了很多；另一半是两个渠道内部都真的降了。`,
        sure: `比较有把握。第 6 批之后的下降远超批次之间的正常波动；第 ${LOW.n} 批那样的单次低点则不算。`,
        unknown: "两个渠道内部为什么都降了。下一步我会看漏斗，找出是哪一步变差了。",
        dont: `不要用它来说课程变差了 ${num(DROP, 1)} 个百分点。`
      } : {
        found: `Completion fell from ${P(pE)} to ${P(pR)}. About half of the drop (${num(MIXPTS, 2)} pts) is because far more partner-offer learners joined; the other half is a real drop in both channels.`,
        sure: `Fairly sure. The drop after cohort 6 is well outside normal cohort-to-cohort wobble; single dips like cohort ${LOW.n} aren't.`,
        unknown: "Why completion fell inside each channel. I'd check the funnel next to see which step got worse.",
        dont: `Don't use this to say the course got ${num(DROP, 1)} points worse.`
      }
    };
    const mk = (o) => Object.assign({ done: true, skipped: false, energy: "", hard: false, hints: 0 }, o);
    ls.steps = {
      claim: mk({ energy: "neutral" }),
      trend: mk({ energy: "enjoyed" }),
      split: mk({ energy: "neutral", hard: true, hints: 1 }),
      conclude: mk({ energy: "enjoyed" }),
      summary: mk({ energy: "neutral" }),
      reflect: mk({})
    };
    ls.refl = { pick: "split", note: zh ? "看到构成变化解释了一半降幅的那一刻，我一下子明白了。" : "Seeing the mix explain half the drop was the moment it clicked." };
    ls.visited = steps.map((s) => s.id).concat("reflect");
    ls.cur = "reflect";
    ls.startedAt = start;
    ls.completedAt = start + 17 * 60000;
  }

  /* ================= CSV ================= */
  function csv() {
    const head = "cohort,period,signups,completed,completion_rate,partner_share,expected_wobble_pts_95";
    const rows = C.map((c) => [c.n, c.period, c.signups, c.completed, (c.rate * 100).toFixed(2), (c.partnerShare * 100).toFixed(0), (wobOf(c) * 100).toFixed(2)].join(","));
    return [head].concat(rows).join("\n") + "\n";
  }

  /* ================= mount: re-render when the chart crosses the compact breakpoint ================= */
  let lastCompact = null, bound = false;
  function mount(root, ls) {
    lastCompact = compact();
    if (RD && root && ls && ls.cur === "summary") RD.mount(root, ls);
    if (bound) return; bound = true;
    let tm;
    window.addEventListener("resize", () => {
      clearTimeout(tm);
      tm = setTimeout(() => { const r = MP.route(); if (r.name === "lens" && r.a === ID && compact() !== lastCompact) MP.render(); }, 120);
    });
  }

  MP.lenses.ds = {
    id: ID,
    steps,
    download: { file: "lumenlearn-cohorts.csv", href: () => "data:text/csv;charset=utf-8," + encodeURIComponent(csv()) },
    mount,
    summary,
    sample
  };
})();
