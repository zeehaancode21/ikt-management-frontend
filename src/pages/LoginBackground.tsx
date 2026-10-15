import { useEffect, useRef } from "react";

/**
 * Engineering-structures animated background for the Login page.
 *
 * Scene (all SVG + CSS, no canvas / no dots):
 *  - Blueprint grid that slowly pans, with a scanning sweep line
 *  - Warren-truss bridge that draws itself in, with a stress wave running
 *    along its joints, dashed force-flow on the members and a truck crossing
 *  - Tower crane with a trolley, hoisting cable and swinging steel beam
 *  - Steel-frame building that is erected floor by floor (and loops)
 *  - Meshing gears, dimension lines and structural formulas
 *  - Mouse-parallax between 3 depth layers (CSS transitions)
 *  - Respects prefers-reduced-motion
 */

/* ---------- geometry helpers ---------- */

function gearPoints(r: number, teeth: number, depth: number) {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const seq: Array<[number, number]> = [
      [a - step * 0.3, r],
      [a - step * 0.16, r + depth],
      [a + step * 0.16, r + depth],
      [a + step * 0.3, r],
    ];
    seq.forEach(([ang, rad]) =>
      pts.push(`${(Math.cos(ang) * rad).toFixed(1)},${(Math.sin(ang) * rad).toFixed(1)}`)
    );
  }
  return pts.join(" ");
}

function Gear({
  x, y, r, teeth, dur, reverse = false,
}: { x: number; y: number; r: number; teeth: number; dur: number; reverse?: boolean }) {
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return `M0 0 L${(Math.cos(a) * r * 0.78).toFixed(1)} ${(Math.sin(a) * r * 0.78).toFixed(1)}`;
  }).join(" ");
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        className={`eng-spin ${reverse ? "rev" : ""}`}
        style={{ animationDuration: `${dur}s` }}
      >
        <polygon points={gearPoints(r, teeth, r * 0.15)} className="eng-line" />
        <circle r={r * 0.82} className="eng-line thin" />
        <circle r={r * 0.3} className="eng-line" />
        <circle r={r * 0.1} className="eng-fill" />
        <path d={spokes} className="eng-line thin" />
      </g>
    </g>
  );
}

/* ---------- static scene data ---------- */

const PANELS = 16;
const diagonals = Array.from(
  { length: PANELS },
  (_, i) => `M${i * 100} 700 L${i * 100 + 50} 600 L${(i + 1) * 100} 700`
);
const verticals = Array.from({ length: PANELS }, (_, i) => `M${i * 100 + 50} 600 V700`);
const deckTies = Array.from({ length: PANELS + 1 }, (_, i) => `M${i * 100} 700 V712`).join(" ");
const bottomNodes = Array.from({ length: PANELS + 1 }, (_, i) => i * 100);

function pierHatch(cx: number) {
  const out: string[] = [];
  for (let y = 740; y <= 880; y += 28) {
    const inset = ((y - 712) * 14) / 188;
    out.push(`M${cx - 50 + inset} ${y} H${cx + 50 - inset}`);
  }
  out.push(`M${cx} 712 V900`);
  return out.join(" ");
}
const pierShape = (cx: number) => `M${cx - 50} 712 L${cx - 36} 900 H${cx + 36} L${cx + 50} 712`;
const PIERS = [420, 1180];

const wavePath = "M-200 850 q25 -8 50 0" + " t50 0".repeat(41);
const wavePath2 = "M-200 872 q25 -6 50 0" + " t50 0".repeat(41);

// Crane
function craneMast() {
  const pts: string[] = [];
  let left = true;
  for (let y = 712; y >= 200; y -= 32) {
    pts.push(`${left ? 202 : 238} ${y}`);
    left = !left;
  }
  return "M" + pts.join(" L");
}
const craneRungs = Array.from({ length: 17 }, (_, i) => `M202 ${712 - i * 32} H238`).join(" ");
function craneJibLattice() {
  const pts: string[] = [];
  let top = false;
  for (let x = 220; x <= 470; x += 25) {
    pts.push(`${x} ${top ? 188 : 212}`);
    top = !top;
  }
  return "M" + pts.join(" L");
}

// Building
const BX = [1210, 1300, 1390, 1480];
const FLOOR_H = 70;
const FLOORS = 5;
const BASE_Y = 600;
const floors = Array.from({ length: FLOORS }, (_, k) => {
  const yb = BASE_Y - k * FLOOR_H;
  const yt = yb - FLOOR_H;
  const bay = k % 3;
  const frame =
    BX.map((x) => `M${x} ${yb} V${yt}`).join(" ") +
    ` M${BX[bay]} ${yb} L${BX[bay + 1]} ${yt} M${BX[bay + 1]} ${yb} L${BX[bay]} ${yt}`;
  return { frame, slab: `M${BX[0] - 8} ${yt} H${BX[3] + 8}` };
});

const FORMULAS = [
  { x: 40, y: 70, t: "δmax = 5wL⁴ / 384EI", d: 0 },
  { x: 470, y: 120, t: "ΣF = 0   ΣM = 0", d: 2.5 },
  { x: 860, y: 70, t: "σ = My / I", d: 5 },
  { x: 1090, y: 60, t: "E = 200 GPa", d: 7.5 },
];

/* ---------- component ---------- */

export default function EngineeringBackground({ ready }: { ready: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Mouse parallax: only sets two CSS variables; the layers animate via CSS transitions.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      el.style.setProperty("--mx", ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
      el.style.setProperty("--my", ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div ref={rootRef} className={`eng-bg ${ready ? "ready" : ""}`} aria-hidden="true">
      <style>{CSS}</style>

      {/* ============ FAR layer: gears + formulas ============ */}
      <svg className="eng-layer far" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <Gear x={1330} y={170} r={62} teeth={16} dur={48} />
        <Gear x={1422} y={117} r={39} teeth={10} dur={30} reverse />
        <Gear x={30} y={480} r={120} teeth={24} dur={90} reverse />
        {FORMULAS.map((f) => (
          <text key={f.t} x={f.x} y={f.y} className="eng-formula" style={{ animationDelay: `${f.d}s` }}>
            {f.t}
          </text>
        ))}
      </svg>

      {/* ============ MID layer: crane + building ============ */}
      <svg className="eng-layer mid" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        {/* ---- Tower crane ---- */}
        <g>
          <path d="M202 200 V712 M238 200 V712" className="eng-line eng-draw" pathLength={1} style={{ animationDelay: "0.3s" }} />
          <path d={craneMast()} className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: "0.8s" }} />
          <path d={craneRungs} className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: "1s" }} />
          {/* tower head + jib */}
          <path d="M202 200 L220 140 L238 200 Z" className="eng-line eng-draw" pathLength={1} style={{ animationDelay: "1.6s" }} />
          <path d="M90 212 H470 M110 188 H470 M470 188 V212 M90 188 V212" className="eng-line eng-draw" pathLength={1} style={{ animationDelay: "1.9s" }} />
          <path d={craneJibLattice()} className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: "2.2s" }} />
          <path d="M220 140 L440 188 M220 140 L110 188" className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: "2.4s" }} />
          <rect x="96" y="212" width="46" height="26" className="eng-line eng-fade" style={{ animationDelay: "2.6s" }} />
          <path d="M96 225 H142" className="eng-line thin eng-fade" style={{ animationDelay: "2.6s" }} />

          {/* trolley + hoist */}
          <g transform="translate(280 212)">
            <g className="eng-trolley">
              <rect x="-9" y="0" width="18" height="8" className="eng-line amber" />
              <g className="eng-swing">
                <path d="M0 8 V150" className="eng-line amber thin eng-cable" />
                <g className="eng-hoist">
                  <path d="M0 150 v6 a5 5 0 1 1 -5 5" className="eng-line amber" />
                  <path d="M-30 168 H30 M-30 176 H30 M-30 168 V176 M30 168 V176 M0 168 V176" className="eng-line amber thin" />
                  <path d="M-16 161 L-30 168 M16 161 L30 168" className="eng-line amber thin" />
                </g>
              </g>
            </g>
          </g>

          {/* radius dimension */}
          <g className="eng-dim">
            <path d="M220 218 V258 M470 218 V258 M220 250 H470 M220 250 l8 -4 M220 250 l8 4 M470 250 l-8 -4 M470 250 l-8 4" className="eng-line thin" />
            <text x="345" y="244" textAnchor="middle" className="eng-label">R = 18.0 m</text>
          </g>
        </g>

        {/* ---- Steel-frame building (erected floor by floor) ---- */}
        <g>
          {floors.map((f, k) => (
            <g key={k}>
              <path d={f.frame} className="eng-line thin eng-build" pathLength={1} style={{ animationDelay: `${k * 1.1}s` }} />
              <path d={f.slab} className="eng-line eng-build" pathLength={1} style={{ animationDelay: `${k * 1.1 + 0.5}s` }} />
            </g>
          ))}
          <path d="M1345 250 V198 M1345 198 l-8 14 M1345 198 l8 14" className="eng-line thin eng-build" pathLength={1} style={{ animationDelay: `${FLOORS * 1.1}s` }} />
          <g className="eng-dim">
            <path d="M1548 600 V250 M1538 600 H1558 M1538 250 H1558 M1548 250 l-4 8 M1548 250 l4 8 M1548 600 l-4 -8 M1548 600 l4 -8" className="eng-line thin" />
            <text transform="translate(1536 440) rotate(-90)" textAnchor="middle" className="eng-label">H = 24.5 m</text>
          </g>
        </g>
      </svg>

      {/* ============ NEAR layer: truss bridge + water ============ */}
      <svg className="eng-layer near" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        {/* piers */}
        {PIERS.map((cx, i) => (
          <g key={cx}>
            <path d={pierShape(cx)} className="eng-pierfill" />
            <path d={pierShape(cx)} className="eng-line eng-draw" pathLength={1} style={{ animationDelay: `${0.4 + i * 0.4}s` }} />
            <path d={pierHatch(cx)} className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: `${1 + i * 0.4}s` }} />
          </g>
        ))}

        {/* truss background (hides the crane/building base behind the bridge) */}
        <rect x="-10" y="600" width="1620" height="112" className="eng-trussbg" />

        {/* chords */}
        <path d="M0 700 H1600" className="eng-line heavy eng-draw" pathLength={1} style={{ animationDelay: "0.2s", animationDuration: "3.2s" }} />
        <path d="M50 600 H1550" className="eng-line heavy eng-draw" pathLength={1} style={{ animationDelay: "0.5s", animationDuration: "3.2s" }} />
        {/* members */}
        {diagonals.map((d, i) => (
          <path key={i} d={d} className="eng-line eng-draw" pathLength={1} style={{ animationDelay: `${0.9 + i * 0.12}s` }} />
        ))}
        {verticals.map((d, i) => (
          <path key={i} d={d} className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: `${1.2 + i * 0.12}s` }} />
        ))}
        {/* deck */}
        <path d="M0 712 H1600" className="eng-line heavy eng-draw" pathLength={1} style={{ animationDelay: "0.6s", animationDuration: "3.2s" }} />
        <path d={deckTies} className="eng-line thin eng-draw" pathLength={1} style={{ animationDelay: "2s" }} />

        {/* force-flow overlay (dashes run along the members) */}
        <path d={diagonals.join(" ")} className="eng-flow" />
        <path d="M50 600 H1550" className="eng-flow top" />

        {/* joints with a stress wave travelling left → right */}
        {bottomNodes.map((x, i) => (
          <circle key={x} cx={x} cy={700} r={4.5} className="eng-node" style={{ animationDelay: `${i * 0.14}s` }} />
        ))}

        {/* truck crossing the bridge */}
        <g className="eng-drive">
          <g transform="translate(0 712)">
            <rect x="0" y="-30" width="44" height="22" className="eng-line amber" />
            <path d="M44 -22 H58 L64 -14 V-8 H44 Z" className="eng-line amber" />
            <circle cx="10" cy="-6" r="6" className="eng-wheel" />
            <circle cx="34" cy="-6" r="6" className="eng-wheel" />
            <circle cx="56" cy="-6" r="6" className="eng-wheel" />
          </g>
        </g>

        {/* span dimension */}
        <g className="eng-dim">
          <path d="M420 560 H1180 M420 552 V610 M1180 552 V610 M420 560 l9 -4 M420 560 l9 4 M1180 560 l-9 -4 M1180 560 l-9 4" className="eng-line thin" />
          <text x="520" y="550" className="eng-label">SPAN L = 76.0 m</text>
        </g>

        {/* water */}
        <g className="eng-waterwrap">
          <path d={wavePath} className="eng-wave a" />
          <path d={wavePath2} className="eng-wave b" />
        </g>
      </svg>

      <div className="eng-sweep" />
      <div className="eng-vignette" />
      <div className="eng-titleblock">
        <span>DWG NO. IKT-STR-001</span>
        <span>SCALE 1 : 100</span>
        <span>REV. C — STRUCTURAL</span>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */

const CSS = `
.eng-bg {
  --mx: 0; --my: 0;
  position: absolute; inset: 0; z-index: 0; overflow: hidden;
  background:
    radial-gradient(ellipse 70% 60% at 50% 45%, rgba(26,74,138,0.28), transparent 70%),
    linear-gradient(180deg, #061833 0%, #050d1a 100%);
}

/* blueprint grid (minor 24px / major 120px), slowly panning */
.eng-bg::before {
  content: ''; position: absolute; inset: -120px;
  background-image:
    linear-gradient(rgba(99,179,237,0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,179,237,0.15) 1px, transparent 1px),
    linear-gradient(rgba(99,179,237,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,179,237,0.06) 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
  animation: engGridPan 36s linear infinite;
}
@keyframes engGridPan { to { transform: translate(120px, 120px); } }

/* parallax layers */
.eng-layer {
  position: absolute; inset: -3%; width: 106%; height: 106%;
  opacity: 0;
  transition: opacity 1.4s ease, transform 0.7s cubic-bezier(.22,1,.36,1);
  will-change: transform;
}
.eng-bg.ready .eng-layer { opacity: 1; }
.eng-layer.far  { transform: translate3d(calc(var(--mx) * -7px),  calc(var(--my) * -5px),  0); }
.eng-layer.mid  { transform: translate3d(calc(var(--mx) * -15px), calc(var(--my) * -10px), 0); transition-delay: 0.15s, 0s; }
.eng-layer.near { transform: translate3d(calc(var(--mx) * -26px), calc(var(--my) * -16px), 0); transition-delay: 0.3s, 0s; }

/* line styles */
.eng-line { fill: none; stroke: rgba(99,179,237,0.55); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.eng-line.thin  { stroke-width: 1; stroke: rgba(99,179,237,0.38); }
.eng-line.heavy { stroke-width: 3; stroke: rgba(130,200,250,0.8); }
.eng-line.amber { stroke: rgba(246,173,85,0.85); }
.eng-fill { fill: rgba(99,179,237,0.5); }
.eng-pierfill { fill: rgba(8,24,50,0.85); }
.eng-trussbg  { fill: rgba(5,13,26,0.88); }
.eng-wheel { fill: #050d1a; stroke: rgba(246,173,85,0.85); stroke-width: 1.4; }

/* draw-in / erect / fade-in */
.eng-draw  { stroke-dasharray: 1; stroke-dashoffset: 1; animation: engDraw 2.2s cubic-bezier(.65,0,.35,1) forwards; }
@keyframes engDraw { to { stroke-dashoffset: 0; } }
.eng-build { stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; animation: engBuild 16s ease-in-out infinite; }
@keyframes engBuild {
  0%   { stroke-dashoffset: 1;  opacity: 0; }
  4%   { opacity: 1; }
  30%  { stroke-dashoffset: 0; }
  86%  { stroke-dashoffset: 0;  opacity: 1; }
  100% { stroke-dashoffset: -1; opacity: 0; }
}
.eng-fade { opacity: 0; animation: engFadeIn 1.2s ease forwards; }
@keyframes engFadeIn { to { opacity: 1; } }

/* force-flow dashes on members */
.eng-flow { fill: none; stroke: rgba(160,220,255,0.75); stroke-width: 1.2; stroke-dasharray: 3 14; stroke-linecap: round; opacity: 0; animation: engFadeIn 1s ease 3.4s forwards, engFlow 2.4s linear 3.4s infinite; }
.eng-flow.top { stroke: rgba(246,173,85,0.7); animation: engFadeIn 1s ease 3.4s forwards, engFlow 3s linear 3.4s infinite reverse; }
@keyframes engFlow { to { stroke-dashoffset: -34; } }

/* joint stress wave */
.eng-node { fill: #050d1a; stroke: rgba(99,179,237,0.9); stroke-width: 1.5; opacity: 0; animation: engNode 3.2s ease-in-out 3s infinite; }
@keyframes engNode {
  0%, 100% { opacity: 0.25; stroke: rgba(99,179,237,0.7); }
  50%      { opacity: 1;    stroke: rgba(246,173,85,1); }
}

/* gears */
.eng-spin { animation: engSpin 40s linear infinite; }
.eng-spin.rev { animation-direction: reverse; }
@keyframes engSpin { to { transform: rotate(360deg); } }

/* truck */
.eng-drive { animation: engDrive 18s linear 3.5s infinite; transform: translateX(-160px); }
@keyframes engDrive { from { transform: translateX(-160px); } to { transform: translateX(1760px); } }

/* crane hoist */
.eng-trolley { animation: engTrolley 10s ease-in-out infinite alternate; }
@keyframes engTrolley { from { transform: translateX(0); } to { transform: translateX(150px); } }
.eng-swing { animation: engSwing 3.2s ease-in-out infinite alternate; }
@keyframes engSwing { from { transform: rotate(-3.5deg); } to { transform: rotate(3.5deg); } }
.eng-hoist { animation: engHoist 8s ease-in-out infinite alternate; }
@keyframes engHoist { from { transform: translateY(0); } to { transform: translateY(-64px); } }
.eng-cable { transform-origin: 0 8px; animation: engCable 8s ease-in-out infinite alternate; }
@keyframes engCable { from { transform: scaleY(1); } to { transform: scaleY(0.55); } }

/* water */
.eng-wave { fill: none; stroke-width: 1.4; }
.eng-wave.a { stroke: rgba(99,179,237,0.45); animation: engWave 6s linear infinite; }
.eng-wave.b { stroke: rgba(99,179,237,0.25); animation: engWave 9s linear infinite reverse; }
@keyframes engWave { to { transform: translateX(-100px); } }

/* labels */
.eng-label   { font-family: 'DM Mono', monospace; font-size: 13px; fill: rgba(160,215,255,0.75); letter-spacing: 0.06em; }
.eng-dim     { opacity: 0; animation: engDim 7s ease-in-out 3.5s infinite; }
@keyframes engDim { 0%, 100% { opacity: 0.15; } 25%, 70% { opacity: 0.85; } }
.eng-formula { font-family: 'DM Mono', monospace; font-size: 15px; fill: rgba(130,200,250,0.7); opacity: 0; animation: engFormula 10s ease-in-out infinite; }
@keyframes engFormula {
  0%   { opacity: 0;    transform: translateY(8px); }
  15%, 60% { opacity: 0.55; transform: translateY(0); }
  80%, 100% { opacity: 0; transform: translateY(-6px); }
}

/* scan line */
.eng-sweep {
  position: absolute; left: 0; right: 0; height: 160px; top: -160px; pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(99,179,237,0.07) 60%, rgba(99,179,237,0.18) 100%);
  border-bottom: 1px solid rgba(99,179,237,0.25);
  animation: engSweep 9s linear infinite;
}
@keyframes engSweep { to { transform: translateY(calc(100vh + 160px)); } }

.eng-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(2,8,20,0.7) 100%);
}

/* drawing title block */
.eng-titleblock {
  position: absolute; right: 18px; bottom: 16px; pointer-events: none;
  display: flex; flex-direction: column; gap: 3px;
  padding: 8px 12px; border: 1px solid rgba(99,179,237,0.25);
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
  color: rgba(160,215,255,0.5); background: rgba(5,13,26,0.55);
  opacity: 0; transition: opacity 1.2s ease 1.2s;
}
.eng-bg.ready .eng-titleblock { opacity: 1; }

@media (max-width: 640px) {
  .eng-titleblock { display: none; }
  .eng-formula { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .eng-bg *, .eng-bg::before { animation: none !important; }
  .eng-draw, .eng-build { stroke-dasharray: none; stroke-dashoffset: 0; opacity: 1; }
  .eng-fade, .eng-dim, .eng-node, .eng-flow { opacity: 1; }
  .eng-formula { opacity: 0.5; }
  .eng-sweep { display: none; }
  .eng-drive { transform: translateX(120px); }
  .eng-layer { transition: opacity 0.3s ease; transform: none !important; }
}
`;