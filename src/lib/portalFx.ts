// src/lib/portalFx.ts
/* ─────────────────────────────────────────────────────────────────────
   Shared motion + interaction layer for the Leave Portal and the
   Permission Portal (Apply + History, employee + owner views).

   Pure CSS, injected once. It only ADDS classes / overrides hover & entry
   behaviour - no business logic lives here.

   Classes used by the pages:
     .pfx-card      leave / permission tile: rises, glows, accent bar, shine
     .pfx-section   big Apply / History card: springy entrance
     .pfx-form      the apply form: fields cascade in, focus highlight
     .pfx-submit    primary button: gradient sweep + press
     .pfx-float     header icon / empty-state icon: gentle floating
     .pfx-icon      small icon inside a card: wiggles on tile hover
     .pfx-quota     quota / balance banner: slide-in + animated bar
     .pfx-modal     dialog: springy pop-in
     .pfx-scroll    scroll area padding so a lifted tile is never clipped
   Tabs: .leave-tab-btn / .permission-tab-btn and any [role="tab"].
   Everything is switched off for users who prefer reduced motion.
   ───────────────────────────────────────────────────────────────────── */

export const PORTAL_FX_CSS = `
  @keyframes pfxCardIn {
    0%   { opacity: 0; transform: translateY(18px) scale(.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes pfxSectionIn {
    0%   { opacity: 0; transform: translateY(22px) scale(.985); filter: blur(4px); }
    100% { opacity: 1; transform: none; filter: blur(0); }
  }
  @keyframes pfxFieldIn {
    0%   { opacity: 0; transform: translateX(-14px); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes pfxFloat {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50%      { transform: translateY(-4px) rotate(-3deg); }
  }
  @keyframes pfxWiggle {
    0%, 100% { transform: rotate(0) scale(1); }
    25%      { transform: rotate(-14deg) scale(1.2); }
    55%      { transform: rotate(10deg) scale(1.2); }
    80%      { transform: rotate(-4deg) scale(1.1); }
  }
  @keyframes pfxPop {
    0%   { transform: scale(.7); }
    60%  { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  @keyframes pfxShine {
    0%   { transform: translateX(-130%) skewX(-18deg); }
    100% { transform: translateX(280%) skewX(-18deg); }
  }
  @keyframes pfxModalIn {
    0%   { opacity: 0; transform: translateY(24px) scale(.92); }
    60%  { opacity: 1; transform: translateY(-3px) scale(1.012); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes pfxBarFill {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  @keyframes pfxBanner {
    0%   { opacity: 0; transform: translateY(-10px) scale(.98); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes pfxGlow {
    0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / .0); }
    50%      { box-shadow: 0 0 0 5px hsl(var(--primary) / .18); }
  }

  /* ── Tiles (leave + permission cards) ───────────────────── */
  .leave-card.pfx-card {
    --pfx-accent: #6366f1;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    animation: pfxCardIn .5s cubic-bezier(.16,1,.3,1) both;
    transition:
      transform .32s cubic-bezier(.34,1.56,.64,1),
      box-shadow .3s ease,
      border-color .3s ease,
      background-color .3s ease;
    will-change: transform;
  }
  .leave-card.pfx-card[data-status="approved"]            { --pfx-accent: #10b981; }
  .leave-card.pfx-card[data-status="pending"]             { --pfx-accent: #f59e0b; }
  .leave-card.pfx-card[data-status="reapproval_pending"]  { --pfx-accent: #f59e0b; }
  .leave-card.pfx-card[data-status="rejected"]            { --pfx-accent: #ef4444; }
  .leave-card.pfx-card[data-status="cancelled"],
  .leave-card.pfx-card[data-status="canceled"]            { --pfx-accent: #94a3b8; }

  /* coloured accent bar on the left edge: peeks at rest, fills on hover */
  .leave-card.pfx-card::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 4px;
    background: linear-gradient(180deg, var(--pfx-accent), color-mix(in srgb, var(--pfx-accent) 45%, transparent));
    transform: scaleY(.45);
    transform-origin: center;
    opacity: .8;
    transition: transform .35s cubic-bezier(.34,1.56,.64,1), opacity .25s ease, width .25s ease;
    z-index: 1;
  }
  /* soft tint that fades in behind the content */
  .leave-card.pfx-card::after {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--pfx-accent) 14%, transparent), transparent 60%);
    opacity: 0;
    transition: opacity .3s ease;
    pointer-events: none;
    z-index: -1;
  }
  .leave-card.pfx-card:hover,
  .leave-card.pfx-card:focus-within {
    transform: translateY(-5px) scale(1.018);
    border-color: color-mix(in srgb, var(--pfx-accent) 55%, transparent);
    box-shadow:
      0 18px 34px -14px color-mix(in srgb, var(--pfx-accent) 45%, transparent),
      0 8px 14px -8px rgba(0,0,0,.14);
    z-index: 5;
  }
  .leave-card.pfx-card:hover::before,
  .leave-card.pfx-card:focus-within::before { transform: scaleY(1); width: 5px; opacity: 1; }
  .leave-card.pfx-card:hover::after,
  .leave-card.pfx-card:focus-within::after  { opacity: 1; }
  .leave-card.pfx-card:active { transform: translateY(-2px) scale(1.006); transition-duration: .12s; }

  /* shine sweep across the tile on hover */
  .leave-card.pfx-card .pfx-shine {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    width: 38%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
    transform: translateX(-130%) skewX(-18deg);
    pointer-events: none;
    z-index: 2;
  }
  .leave-card.pfx-card:hover .pfx-shine { animation: pfxShine .9s ease-out; }

  /* little icons wiggle, badges pop, when the tile is hovered */
  .leave-card.pfx-card:hover .pfx-icon { animation: pfxWiggle .7s ease-in-out; color: var(--pfx-accent); }
  .leave-card.pfx-card:hover .pfx-badge-pop { animation: pfxPop .45s cubic-bezier(.34,1.56,.64,1); }

  /* cascade the tiles in one after another (works in any list) */
  .leave-card.pfx-card:nth-child(1)  { animation-delay: .00s; }
  .leave-card.pfx-card:nth-child(2)  { animation-delay: .05s; }
  .leave-card.pfx-card:nth-child(3)  { animation-delay: .10s; }
  .leave-card.pfx-card:nth-child(4)  { animation-delay: .15s; }
  .leave-card.pfx-card:nth-child(5)  { animation-delay: .20s; }
  .leave-card.pfx-card:nth-child(6)  { animation-delay: .25s; }
  .leave-card.pfx-card:nth-child(7)  { animation-delay: .30s; }
  .leave-card.pfx-card:nth-child(8)  { animation-delay: .35s; }
  .leave-card.pfx-card:nth-child(n+9){ animation-delay: .40s; }

  /* room for the lifted tile so the scroll area never clips it */
  .pfx-scroll { padding: 10px 8px 14px 8px; margin: -6px -4px; }

  /* ── Big Apply / History cards ──────────────────────────── */
  .pfx-root .pfx-section { animation: pfxSectionIn .55s cubic-bezier(.16,1,.3,1) both; }

  .pfx-float { animation: pfxFloat 3.4s ease-in-out infinite; box-shadow: 0 6px 16px -6px rgba(99,102,241,.55); }

  /* ── Apply form: cascade + focus feedback ───────────────── */
  .pfx-form > * { animation: pfxFieldIn .5s cubic-bezier(.16,1,.3,1) both; }
  .pfx-form > *:nth-child(1) { animation-delay: .05s; }
  .pfx-form > *:nth-child(2) { animation-delay: .10s; }
  .pfx-form > *:nth-child(3) { animation-delay: .15s; }
  .pfx-form > *:nth-child(4) { animation-delay: .20s; }
  .pfx-form > *:nth-child(5) { animation-delay: .25s; }
  .pfx-form > *:nth-child(6) { animation-delay: .30s; }
  .pfx-form > *:nth-child(7) { animation-delay: .35s; }
  .pfx-form > *:nth-child(n+8) { animation-delay: .40s; }
  .pfx-form > div { transition: transform .25s ease; }
  .pfx-form > div:focus-within { transform: translateX(3px); }
  .pfx-form > div:focus-within label { color: hsl(var(--primary)); transition: color .2s ease; }
  .pfx-form input:focus-visible,
  .pfx-form textarea:focus-visible,
  .pfx-form button[role="combobox"]:focus-visible { animation: pfxGlow 1.8s ease-in-out infinite; }
  .pfx-form input, .pfx-form textarea, .pfx-form button[role="combobox"] {
    transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
  }
  .pfx-form input:hover:not(:disabled), .pfx-form textarea:hover:not(:disabled),
  .pfx-form button[role="combobox"]:hover:not(:disabled) { border-color: hsl(var(--primary) / .55); }

  /* ── Primary button: gradient sweep ─────────────────────── */
  .pfx-submit { position: relative; overflow: hidden; isolation: isolate; }
  .pfx-submit::after {
    content: "";
    position: absolute; inset: 0;
    background: linear-gradient(110deg, transparent 20%, rgba(255,255,255,.35) 50%, transparent 80%);
    transform: translateX(-120%);
    z-index: -1;
  }
  .pfx-submit:hover:not(:disabled)::after { transform: translateX(120%); transition: transform .7s ease; }
  .pfx-submit:hover:not(:disabled) { box-shadow: 0 10px 22px -10px hsl(var(--primary) / .8); }

  /* ── Tabs (Apply / History, filters, owner tabs) — scoped to the portals ── */
  .pfx-root .leave-tab-btn, .pfx-root .permission-tab-btn, .pfx-root [role="tab"] {
    position: relative;
    transition: transform .2s cubic-bezier(.34,1.56,.64,1), background-color .25s ease, color .25s ease, box-shadow .25s ease !important;
  }
  .pfx-root .leave-tab-btn:hover, .pfx-root .permission-tab-btn:hover, .pfx-root [role="tab"]:hover { transform: translateY(-2px); }
  .pfx-root .leave-tab-btn:active, .pfx-root .permission-tab-btn:active, .pfx-root [role="tab"]:active { transform: translateY(0) scale(.95); }
  .pfx-root .leave-tab-btn:hover svg, .pfx-root .permission-tab-btn:hover svg { animation: pfxWiggle .6s ease-in-out; }
  .pfx-root .leave-tab-btn.active, .pfx-root .permission-tab-btn.active {
    box-shadow: 0 8px 18px -8px hsl(var(--primary) / .75);
  }
  .pfx-root .leave-tab-btn.active svg, .pfx-root .permission-tab-btn.active svg { animation: pfxPop .45s cubic-bezier(.34,1.56,.64,1); }
  .pfx-root [role="tab"][aria-selected="true"] { animation: pfxPop .35s cubic-bezier(.34,1.56,.64,1); }

  /* ── Quota / balance banner ─────────────────────────────── */
  .pfx-root .pfx-quota { animation: pfxBanner .5s cubic-bezier(.16,1,.3,1) both; transition: transform .3s ease, box-shadow .3s ease; }
  .pfx-quota:hover { transform: translateY(-2px); box-shadow: 0 12px 22px -14px rgba(0,0,0,.25); }
  .pfx-quota .h-full.rounded-full { transform-origin: left center; animation: pfxBarFill 1s cubic-bezier(.16,1,.3,1) .2s both; }

  /* ── Dialog ─────────────────────────────────────────────── */
  .pfx-modal { animation: pfxModalIn .45s cubic-bezier(.16,1,.3,1) both; }

  /* ── Group headers & empty states ───────────────────────── */
  .pfx-group-title { animation: pfxFieldIn .45s cubic-bezier(.16,1,.3,1) both; }

  /* ═════════ Apply tiles: banner, steps, choices, meters ═════════ */
  @keyframes pfxBlob   { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(14px,-10px) scale(1.15); } 66% { transform: translate(-10px,8px) scale(.92); } }
  @keyframes pfxGrad   { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  @keyframes pfxRise   { 0% { opacity: 0; transform: translateY(16px) scale(.97); } 100% { opacity: 1; transform: none; } }
  @keyframes pfxChipIn { 0% { opacity: 0; transform: scale(.6) translateY(6px); } 70% { transform: scale(1.08); } 100% { opacity: 1; transform: none; } }
  @keyframes pfxTick   { 0% { transform: scale(0) rotate(-40deg); } 70% { transform: scale(1.3) rotate(8deg); } 100% { transform: scale(1) rotate(0); } }
  @keyframes pfxPulse  { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pfx-tone, #6366f1) 45%, transparent); } 100% { box-shadow: 0 0 0 12px transparent; } }
  @keyframes pfxFly    { 0% { transform: translate(0,0); } 45% { transform: translate(7px,-7px) scale(.9); opacity: 0; } 55% { transform: translate(-7px,7px) scale(.9); opacity: 0; } 100% { transform: translate(0,0); opacity: 1; } }
  @keyframes pfxShake  { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
  @keyframes pfxPopIn  { 0% { opacity: 0; transform: translateY(-8px) scale(.94); } 100% { opacity: 1; transform: none; } }
  @keyframes pfxBorder { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }

  /* the tile itself: animated gradient border */
  .pfx-root .pfx-apply {
    position: relative;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    overflow: visible !important;
    border-radius: 1rem !important;
    isolation: isolate;
  }
  .pfx-apply::before {
    content: "";
    position: absolute; inset: -1.5px;
    border-radius: calc(1rem + 1.5px);
    background: linear-gradient(120deg, var(--pfx-from), var(--pfx-to), #f472b6, var(--pfx-from));
    background-size: 300% 100%;
    animation: pfxBorder 6s linear infinite;
    opacity: .55;
    z-index: -2;
    transition: opacity .3s ease;
  }
  .pfx-apply:hover::before, .pfx-apply:focus-within::before { opacity: 1; }
  .pfx-apply-body {
    background: hsl(var(--card));
    border-radius: 1rem;
    overflow: hidden;
    box-shadow: 0 18px 40px -22px rgba(0,0,0,.35);
  }
  .pfx-apply-form { padding: 1rem; }
  @media (min-width: 640px) { .pfx-apply-form { padding: 1.25rem 1.5rem 1.5rem; } }

  /* banner */
  .pfx-banner {
    position: relative; overflow: hidden; color: #fff;
    padding: 1rem 1rem .9rem;
    background: linear-gradient(120deg, var(--pfx-from), var(--pfx-to), var(--pfx-from));
    background-size: 220% 100%;
    animation: pfxGrad 9s ease-in-out infinite;
  }
  @media (min-width: 640px) { .pfx-banner { padding: 1.15rem 1.5rem 1rem; } }
  .pfx-blob { position: absolute; border-radius: 9999px; filter: blur(2px); background: rgba(255,255,255,.16); animation: pfxBlob 9s ease-in-out infinite; pointer-events: none; }
  .pfx-blob-a { width: 120px; height: 120px; right: -30px; top: -50px; }
  .pfx-blob-b { width: 70px; height: 70px; right: 28%; bottom: -34px; animation-delay: -3s; background: rgba(255,255,255,.12); }
  .pfx-blob-c { width: 46px; height: 46px; left: 38%; top: -18px; animation-delay: -6s; background: rgba(255,255,255,.10); }
  .pfx-banner-row { position: relative; display: flex; align-items: center; gap: .75rem; }
  .pfx-banner-icon {
    display: grid; place-items: center; width: 2.6rem; height: 2.6rem; border-radius: .85rem;
    background: rgba(255,255,255,.2); backdrop-filter: blur(6px);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.35);
    animation: pfxFloat 3.4s ease-in-out infinite;
  }
  .pfx-banner-title { font-size: 1.05rem; font-weight: 700; line-height: 1.2; letter-spacing: -.01em; }
  .pfx-banner-sub { font-size: .75rem; opacity: .88; margin-top: .15rem; }
  .pfx-ring { position: relative; width: 2.8rem; height: 2.8rem; flex-shrink: 0; }
  .pfx-ring-text { position: absolute; inset: 0; display: grid; place-items: center; font-size: .68rem; font-weight: 700; }
  .pfx-banner-chips { position: relative; display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .75rem; min-height: 1.6rem; }
  .pfx-banner-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.22); }
  .pfx-banner-bar span { display: block; height: 100%; background: #fff; border-radius: 0 3px 3px 0; transition: width .6s cubic-bezier(.16,1,.3,1); box-shadow: 0 0 10px rgba(255,255,255,.9); }

  /* live chips */
  .pfx-chip {
    display: inline-flex; align-items: center; gap: .3rem;
    padding: .2rem .6rem; border-radius: 9999px; font-size: .72rem; font-weight: 600;
    background: rgba(255,255,255,.2); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.3);
    animation: pfxChipIn .5s cubic-bezier(.34,1.56,.64,1) both;
  }
  .pfx-chip[data-tone="good"] { background: rgba(16,185,129,.9); }
  .pfx-chip[data-tone="warn"] { background: rgba(245,158,11,.95); }
  .pfx-chip[data-tone="bad"]  { background: rgba(239,68,68,.95); animation: pfxChipIn .5s cubic-bezier(.34,1.56,.64,1) both, pfxShake .5s .5s; }

  /* steps */
  .pfx-steps { display: flex; flex-direction: column; gap: 1rem; }
  .pfx-step { display: flex; gap: .75rem; align-items: flex-start; animation: pfxRise .55s cubic-bezier(.16,1,.3,1) both; transition: transform .25s ease; }
  .pfx-steps > .pfx-step:nth-child(1) { animation-delay: .05s; }
  .pfx-steps > .pfx-step:nth-child(2) { animation-delay: .12s; }
  .pfx-steps > .pfx-step:nth-child(3) { animation-delay: .19s; }
  .pfx-steps > .pfx-step:nth-child(4) { animation-delay: .26s; }
  .pfx-steps > .pfx-step:nth-child(5) { animation-delay: .33s; }
  .pfx-step:focus-within { transform: translateX(4px); }
  .pfx-step-badge {
    flex-shrink: 0; display: grid; place-items: center; width: 1.65rem; height: 1.65rem; margin-top: .05rem;
    border-radius: 9999px; font-size: .72rem; font-weight: 700;
    background: hsl(var(--muted)); color: hsl(var(--muted-foreground));
    transition: background .3s ease, color .3s ease, transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease;
  }
  .pfx-step:focus-within .pfx-step-badge { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); transform: scale(1.15); animation: pfxPulse 1.4s ease-out infinite; --pfx-tone: hsl(var(--primary)); }
  .pfx-step[data-done="true"] .pfx-step-badge { background: #10b981; color: #fff; animation: pfxTick .45s cubic-bezier(.34,1.56,.64,1); }
  .pfx-step-title { font-size: .8rem; font-weight: 600; margin-bottom: .4rem; color: hsl(var(--foreground)); transition: color .25s ease; }
  .pfx-step:focus-within .pfx-step-title { color: hsl(var(--primary)); }

  /* choice cards */
  .pfx-choices { display: grid; gap: .5rem; grid-template-columns: repeat(2, minmax(0,1fr)); }
  @media (min-width: 640px) {
    .pfx-choices[data-cols="3"] { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .pfx-choices[data-cols="5"] { grid-template-columns: repeat(5, minmax(0,1fr)); }
  }
  .pfx-choices[data-cols="3"] { grid-template-columns: repeat(1, minmax(0,1fr)); }
  @media (min-width: 480px) { .pfx-choices[data-cols="3"] { grid-template-columns: repeat(3, minmax(0,1fr)); } }
  .pfx-choice {
    position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: .2rem;
    text-align: left; padding: .65rem .7rem; border-radius: .8rem; cursor: pointer;
    border: 1.5px solid hsl(var(--border)); background: hsl(var(--card));
    transition: transform .28s cubic-bezier(.34,1.56,.64,1), box-shadow .28s ease, border-color .25s ease, background .25s ease;
  }
  .pfx-choice:hover { transform: translateY(-4px) scale(1.03); border-color: color-mix(in srgb, var(--pfx-tone) 60%, transparent); box-shadow: 0 14px 24px -14px color-mix(in srgb, var(--pfx-tone) 70%, transparent); }
  .pfx-choice:active { transform: scale(.96); }
  .pfx-choice:focus-visible { outline: 2px solid var(--pfx-tone); outline-offset: 2px; }
  .pfx-choice-icon {
    display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: .6rem;
    color: var(--pfx-tone); background: color-mix(in srgb, var(--pfx-tone) 13%, transparent);
    transition: transform .3s cubic-bezier(.34,1.56,.64,1), background .25s ease, color .25s ease;
  }
  .pfx-choice:hover .pfx-choice-icon { animation: pfxWiggle .6s ease-in-out; }
  .pfx-choice-label { font-size: .8rem; font-weight: 650; line-height: 1.15; color: hsl(var(--foreground)); }
  .pfx-choice-hint { font-size: .68rem; line-height: 1.25; color: hsl(var(--muted-foreground)); }
  .pfx-choice-tick {
    position: absolute; top: .45rem; right: .45rem; display: grid; place-items: center;
    width: 1.1rem; height: 1.1rem; border-radius: 9999px; color: #fff; background: var(--pfx-tone);
    transform: scale(0); opacity: 0;
  }
  .pfx-choice[data-on="true"] {
    border-color: var(--pfx-tone);
    background: linear-gradient(160deg, color-mix(in srgb, var(--pfx-tone) 14%, hsl(var(--card))), hsl(var(--card)));
    box-shadow: 0 12px 22px -14px color-mix(in srgb, var(--pfx-tone) 80%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--pfx-tone) 35%, transparent);
    animation: pfxPulse .7s ease-out;
  }
  .pfx-choice[data-on="true"] .pfx-choice-icon { background: var(--pfx-tone); color: #fff; transform: scale(1.1); }
  .pfx-choice[data-on="true"] .pfx-choice-tick { animation: pfxTick .45s cubic-bezier(.34,1.56,.64,1) forwards; opacity: 1; }

  /* segmented switch with sliding thumb */
  .pfx-seg {
    position: relative; display: grid; grid-template-columns: repeat(var(--pfx-n), 1fr);
    padding: .25rem; border-radius: .85rem; background: hsl(var(--muted) / .6); border: 1px solid hsl(var(--border));
  }
  .pfx-seg-thumb {
    position: absolute; top: .25rem; bottom: .25rem; left: .25rem;
    width: calc((100% - .5rem) / var(--pfx-n));
    transform: translateX(calc(var(--pfx-i) * 100%));
    border-radius: .65rem; background: hsl(var(--primary));
    box-shadow: 0 8px 16px -8px hsl(var(--primary) / .8);
    transition: transform .4s cubic-bezier(.34,1.4,.64,1);
  }
  .pfx-seg-btn {
    position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: .35rem;
    padding: .45rem .5rem; font-size: .78rem; font-weight: 600; border-radius: .65rem; cursor: pointer;
    color: hsl(var(--muted-foreground)); transition: color .25s ease, transform .2s ease;
  }
  .pfx-seg-btn:hover { color: hsl(var(--foreground)); }
  .pfx-seg-btn:active { transform: scale(.94); }
  .pfx-seg-btn[data-on="true"] { color: hsl(var(--primary-foreground)); }
  .pfx-seg-btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }

  /* character meter */
  .pfx-meter { display: flex; align-items: center; gap: .6rem; }
  .pfx-meter-track { flex: 1; height: 5px; border-radius: 9999px; background: hsl(var(--muted)); overflow: hidden; }
  .pfx-meter-track span { display: block; height: 100%; border-radius: inherit; background: hsl(var(--muted-foreground) / .5); transition: width .3s ease, background .3s ease; }
  .pfx-meter[data-state="short"] .pfx-meter-track span { background: #f59e0b; }
  .pfx-meter[data-state="ok"]    .pfx-meter-track span { background: #10b981; }
  .pfx-meter[data-state="near"]  .pfx-meter-track span { background: #ef4444; }
  .pfx-meter-text { font-size: .7rem; color: hsl(var(--muted-foreground)); white-space: nowrap; }
  .pfx-meter[data-state="short"] .pfx-meter-text { color: #d97706; }
  .pfx-meter[data-state="ok"]    .pfx-meter-text { color: #059669; }

  /* day timeline (permission) */
  .pfx-timeline { position: relative; height: 2.1rem; border-radius: .7rem; background: hsl(var(--muted) / .7); overflow: hidden; border: 1px solid hsl(var(--border)); }
  .pfx-timeline-ticks { position: absolute; inset: 0; display: flex; justify-content: space-between; padding: 0 .35rem; align-items: flex-end; font-size: .58rem; color: hsl(var(--muted-foreground)); pointer-events: none; }
  .pfx-timeline-fill {
    position: absolute; top: 3px; bottom: 11px; border-radius: .5rem;
    background: linear-gradient(90deg, #8b5cf6, #d946ef); box-shadow: 0 6px 14px -6px rgba(139,92,246,.9);
    transition: left .45s cubic-bezier(.34,1.3,.64,1), width .45s cubic-bezier(.34,1.3,.64,1), background .3s ease;
    animation: pfxChipIn .5s both;
  }
  .pfx-timeline-fill[data-bad="true"] { background: linear-gradient(90deg, #ef4444, #f97316); box-shadow: 0 6px 14px -6px rgba(239,68,68,.9); }

  .pfx-pop-in { animation: pfxPopIn .4s cubic-bezier(.34,1.56,.64,1) both; }

  /* action row */
  .pfx-actions { display: flex; gap: .6rem; padding-top: .25rem; animation: pfxRise .55s .4s cubic-bezier(.16,1,.3,1) both; }
  .pfx-actions .pfx-go {
    position: relative; overflow: hidden; flex: 1; height: 2.6rem; font-weight: 650; gap: .5rem;
    background-image: linear-gradient(110deg, var(--pfx-from), var(--pfx-to), var(--pfx-from)); background-size: 220% 100%;
    color: #fff; border: 0; box-shadow: 0 14px 24px -14px var(--pfx-to);
    transition: transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s ease, background-position .6s ease;
  }
  @media (min-width: 640px) { .pfx-actions .pfx-go { flex: none; min-width: 11rem; } }
  .pfx-actions .pfx-go:hover:not(:disabled) { transform: translateY(-2px) scale(1.03); background-position: 100% 0; box-shadow: 0 18px 28px -14px var(--pfx-to); }
  .pfx-actions .pfx-go:hover:not(:disabled) .pfx-go-icon { animation: pfxFly .7s ease-in-out; }
  .pfx-actions .pfx-go:active:not(:disabled) { transform: scale(.96); }
  .pfx-actions .pfx-go:disabled { opacity: .75; }
  .pfx-actions .pfx-reset { height: 2.6rem; transition: transform .2s ease; }
  .pfx-actions .pfx-reset:hover:not(:disabled) .pfx-reset-icon { transform: rotate(-200deg); }
  .pfx-reset-icon { transition: transform .5s cubic-bezier(.34,1.56,.64,1); }

  @media (prefers-reduced-motion: reduce) {
    .leave-card.pfx-card, .leave-card.pfx-card::before, .leave-card.pfx-card::after,
    .pfx-section, .pfx-float, .pfx-form > *, .pfx-quota, .pfx-modal, .pfx-group-title,
    .pfx-banner, .pfx-blob, .pfx-banner-icon, .pfx-apply::before, .pfx-step, .pfx-chip, .pfx-actions, .pfx-choice, .pfx-timeline-fill,
    .pfx-quota .h-full.rounded-full, .pfx-root .leave-tab-btn, .pfx-root .permission-tab-btn, .pfx-root [role="tab"] {
      animation: none !important;
      transition: none !important;
    }
    .leave-card.pfx-card:hover { transform: none !important; }
  }
`;

/** Injects (or refreshes) the shared stylesheet. Safe to call from several modules. */
export const injectPortalFx = () => {
  if (typeof document === "undefined") return;
  const id = "portal-fx-styles";
  const existing = document.getElementById(id);
  if (existing) {
    existing.textContent = PORTAL_FX_CSS;
    return;
  }
  const s = document.createElement("style");
  s.id = id;
  s.textContent = PORTAL_FX_CSS;
  document.head.appendChild(s);
};

injectPortalFx();