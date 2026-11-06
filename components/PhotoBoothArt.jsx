// A drawing of the brushed-steel photo booth, made with SVG so it stays sharp
// at any size. It's based on the reference photos: two steel panels, a cream
// curtain over the opening, a tiger-pattern interior and a coin box on the left.
//
// The drawing is 100 units wide and 112 tall (see viewBox). Every shape below
// is placed using those units, so you can read the numbers like a grid.
//
// HOW THE METAL EFFECT WORKS
// Metal looks like metal mostly because of contrast and reflections, so each
// steel panel is built from stacked layers:
//   1. Base: grey with strong light/dark bands across it
//   2. Environment: the panel mirrors the world. Sky above a "horizon" line,
//      dark grass below it, with a fairly sharp change between the two
//   3. Brushed hairlines: very fine vertical scratches
//   4. Worn smudges, like the real booth
//   5. Highlights: a soft bright stripe and thin bright edges where the low
//      sun (on the left) catches the steel
//
// `idPrefix` keeps the gradient IDs unique if the booth is drawn more than once.

// The steel panels, as [x, width]. Used to draw every layer on each panel.
const LEFT_PANEL = { x: 0, width: 44 };
const RIGHT_PANEL = { x: 80, width: 20 };
const PANEL_TOP = 2.5;
const PANEL_HEIGHT = 105.5;

export default function PhotoBoothArt({ idPrefix = "booth", className }) {
  const id = (name) => `${idPrefix}-${name}`;
  const url = (name) => `url(#${id(name)})`;

  // Draws one layer across both steel panels.
  const onPanels = (props) =>
    [LEFT_PANEL, RIGHT_PANEL].map((panel) => (
      <rect key={panel.x} x={panel.x} y={PANEL_TOP} width={panel.width} height={PANEL_HEIGHT} {...props} />
    ));

  return (
    <svg className={className} viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {/* 1. Base steel: strong light and dark bands, like a curved reflection */}
        <linearGradient id={id("steelLeft")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6f7377" />
          <stop offset="0.08" stopColor="#c9ccce" />
          <stop offset="0.2" stopColor="#f2f3f2" />
          <stop offset="0.3" stopColor="#b5b9bb" />
          <stop offset="0.48" stopColor="#7d8285" />
          <stop offset="0.66" stopColor="#a9adb0" />
          <stop offset="0.8" stopColor="#d4d7d8" />
          <stop offset="0.92" stopColor="#8f9497" />
          <stop offset="1" stopColor="#5f6366" />
        </linearGradient>
        <linearGradient id={id("steelRight")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#9da2a5" />
          <stop offset="0.25" stopColor="#c3c6c8" />
          <stop offset="0.55" stopColor="#6c7174" />
          <stop offset="1" stopColor="#4a4e51" />
        </linearGradient>

        {/* 2. Environment reflection: sky on top, a sharp-ish horizon, then
               the dark green of the hills below */}
        <linearGradient id={id("environment")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c7cfe0" stopOpacity="0.4" />
          <stop offset="0.36" stopColor="#d9dde8" stopOpacity="0.18" />
          <stop offset="0.46" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.58" stopColor="#34451f" stopOpacity="0.24" />
          <stop offset="0.8" stopColor="#3f5622" stopOpacity="0.22" />
          <stop offset="1" stopColor="#24321a" stopOpacity="0.42" />
        </linearGradient>

        {/* Warm sunlight hitting the left side */}
        <linearGradient id={id("sunWarmth")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffc777" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#ffc777" stopOpacity="0.04" />
          <stop offset="1" stopColor="#ffc777" stopOpacity="0" />
        </linearGradient>

        {/* 3. Brushed hairlines: noise squashed so it only changes left-to-right,
               which turns it into thin vertical lines, light and dark */}
        <filter id={id("hairlines")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55 0.008" numOctaves="2" seed="2" />
          <feColorMatrix values="3 0 0 0 -1  3 0 0 0 -1  3 0 0 0 -1  0 0 0 0 1" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>

        {/* 4. Worn smudges (dark) and long streaks (light) */}
        <filter id={id("smudgeDark")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.006" numOctaves="3" seed="4" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.62" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={id("streakLight")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.12 0.004" numOctaves="2" seed="9" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.8 0 0 0 -0.75" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>

        {/* 5. Soft glow used for the bright highlight stripes */}
        <filter id={id("glow")} x="-50%" y="-5%" width="200%" height="110%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>

        {/* Keeps the highlights inside the steel panels */}
        <clipPath id={id("panels")}>
          {onPanels({})}
          <rect x="44" y={PANEL_TOP} width="36" height="2.8" />
        </clipPath>

        {/* Tiger-print wallpaper inside the booth */}
        <pattern id={id("tiger")} width="9" height="7" patternUnits="userSpaceOnUse">
          <rect width="9" height="7" fill="#a88d66" />
          <path d="M0 1.2 q2.2 1 4.5 0.2 t4.5 0.4" stroke="#2a2019" strokeWidth="0.8" fill="none" />
          <path d="M1 4.3 q2 -0.9 3.6 0.1" stroke="#2a2019" strokeWidth="0.7" fill="none" />
          <path d="M5.4 5.4 q1.5 0.8 3.6 -0.2" stroke="#2a2019" strokeWidth="0.6" fill="none" />
        </pattern>
        <linearGradient id={id("interiorShade")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0.15" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </linearGradient>

        {/* Curtain folds: a light/dark band that repeats across the curtain */}
        <linearGradient
          id={id("curtain")}
          x1="56"
          x2="59.5"
          y1="0"
          y2="0"
          gradientUnits="userSpaceOnUse"
          spreadMethod="repeat"
        >
          <stop offset="0" stopColor="#efe7cf" />
          <stop offset="0.45" stopColor="#fbf7ea" />
          <stop offset="0.8" stopColor="#d9cfb2" />
          <stop offset="1" stopColor="#efe7cf" />
        </linearGradient>

        {/* Top cap: bright on top where it faces the sky */}
        <linearGradient id={id("cap")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#e4e1d9" />
          <stop offset="1" stopColor="#a9a69f" />
        </linearGradient>
      </defs>

      {/* ---- Interior (seen through the opening) ---- */}
      <rect x="44" y="5" width="36" height="102" fill={url("tiger")} />
      <rect x="44" y="5" width="36" height="102" fill={url("interiorShade")} />
      <rect x="44" y="99" width="36" height="8" fill="#3b2a1d" />

      {/* ---- Curtain ---- */}
      <path d="M55 6 H80 V105.5 q-3 1 -6 0 t-6 0 t-6 0 t-7 0 Z" fill={url("curtain")} />
      <rect x="55" y="5" width="25" height="2.4" fill="#ddd3b5" />
      <rect x="55" y="5" width="25" height="0.6" fill="#000" opacity="0.25" />

      {/* ---- Steel panels ---- */}
      {/* 1. Base */}
      <rect x={LEFT_PANEL.x} y={PANEL_TOP} width={LEFT_PANEL.width} height={PANEL_HEIGHT} fill={url("steelLeft")} />
      <rect x={RIGHT_PANEL.x} y={PANEL_TOP} width={RIGHT_PANEL.width} height={PANEL_HEIGHT} fill={url("steelRight")} />
      <rect x="44" y={PANEL_TOP} width="36" height="2.8" fill="#9ea2a4" />

      {/* 2. Environment reflection + warm sun */}
      {onPanels({ fill: url("environment") })}
      {onPanels({ fill: url("sunWarmth") })}

      {/* 3. Brushed hairlines, blended so they brighten and darken the steel */}
      <g opacity="0.18" style={{ mixBlendMode: "overlay" }}>{onPanels({ fill: "#fff", filter: url("hairlines") })}</g>

      {/* 4. Wear */}
      <g opacity="0.25">{onPanels({ fill: "#000", filter: url("smudgeDark") })}</g>
      <g opacity="0.3">{onPanels({ fill: "#fff", filter: url("streakLight") })}</g>

      {/* 5. Highlights: soft wide glow + sharp thin "glint" on each panel */}
      <g clipPath={url("panels")}>
        <rect x="6.5" y="2" width="5" height="108" fill="#ffffff" opacity="0.5" filter={url("glow")} />
        <rect x="8.6" y="2" width="0.8" height="108" fill="#ffffff" opacity="0.65" />
        <rect x="33" y="2" width="3" height="108" fill="#ffffff" opacity="0.28" filter={url("glow")} />
        <rect x="83" y="2" width="3" height="108" fill="#ffffff" opacity="0.3" filter={url("glow")} />
      </g>

      {/* Edges: bright where they face the sun (left), dark where they turn away */}
      <rect x="0" y={PANEL_TOP} width="0.7" height={PANEL_HEIGHT} fill="#fff4dc" opacity="0.9" />
      <rect x="80" y={PANEL_TOP} width="0.6" height={PANEL_HEIGHT} fill="#fff4dc" opacity="0.7" />
      <rect x="99.3" y={PANEL_TOP} width="0.7" height={PANEL_HEIGHT} fill="#2c2f31" opacity="0.7" />
      <rect x="43.3" y="5.3" width="0.9" height="102.7" fill="#2c2f31" opacity="0.75" />

      {/* ---- Coin box on the left panel ---- */}
      <rect x="21" y="53" width="6.4" height="13" rx="0.4" fill="#d6d9da" stroke="#5f6366" strokeWidth="0.35" />
      <rect x="21.2" y="53.2" width="6" height="0.5" fill="#ffffff" opacity="0.8" />
      <rect x="22.2" y="55" width="4" height="2.2" fill="#2e3031" />
      <rect x="22.4" y="58.6" width="3.6" height="3.4" fill="#eceeee" stroke="#7d8183" strokeWidth="0.25" />
      <rect x="23.5" y="63.2" width="1.4" height="1.6" fill="#444" />
      {/* Its shadow on the panel (light comes from the left) */}
      <rect x="27.4" y="53.6" width="0.7" height="12.6" fill="#000" opacity="0.25" />

      {/* ---- Top cap and base ---- */}
      <rect x="-0.6" y="0" width="101.2" height="2.6" fill={url("cap")} />
      <rect x="-0.6" y="2.3" width="101.2" height="0.5" fill="#000" opacity="0.25" />
      <rect x="0" y="108" width="100" height="4" fill="#1a1b1a" />
    </svg>
  );
}
