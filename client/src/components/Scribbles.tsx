// Scribbles, the pencil who coaches students. Drawn in SVG and moved with CSS
// (src/theme/paper.css): he sways, blinks and waves; "happy" adds a spin and
// a hop, "thinking" scratches his head. He can hold something for the job on
// each page. Everything stands still for anyone whose device asks for less
// motion.
export type ScribblesMood = "idle" | "happy" | "thinking";
export type ScribblesProp = "none" | "note" | "check" | "brush" | "tape";

// The left arm, waving or scratching his head
const ARM = {
  idle: "M66 104 Q 44 96 40 78",
  happy: "M66 104 Q 44 80 46 54",
  thinking: "M66 104 Q 48 80 66 58",
} as const;

const MOUTH = {
  idle: "M88 118 Q 100 128 112 118",
  happy: "M88 118 Q 100 130 112 118",
  thinking: "M90 122 Q 100 118 110 122",
} as const;

function Held({ prop }: { prop: ScribblesProp }) {
  switch (prop) {
    case "note":
      return (
        <g data-held="note" transform="rotate(8 168 133)">
          <rect x="146" y="112" width="44" height="42" rx="3" fill="#fff27a" />
          <path
            d="M154 126 h 28 M154 135 h 24 M154 144 h 18"
            stroke="#c9a900"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      );
    case "check":
      return (
        <g data-held="check" transform="rotate(6 169 133)">
          <rect x="146" y="110" width="46" height="46" rx="10" fill="#fff" stroke="#5fbf7d" strokeWidth={4} />
          <path
            d="M157 133 l 9 9 l 16 -18"
            fill="none"
            stroke="#3a9a5c"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case "brush":
      return (
        <g data-held="brush">
          <path d="M154 128 L 192 86" stroke="#a0673f" strokeWidth={7} strokeLinecap="round" />
          <path d="M192 76 Q 204 60 200 52 Q 190 62 188 72 Z" fill="#ff8a3d" />
        </g>
      );
    case "tape":
      return (
        <g data-held="tape">
          <rect
            x="146"
            y="116"
            width="52"
            height="16"
            rx="2"
            fill="#ffd35c"
            opacity={0.75}
            transform="rotate(-12 172 124)"
          />
        </g>
      );
    default:
      return null;
  }
}

function Scribbles({
  mood = "idle",
  prop = "none",
  size = 120,
  decorative = false,
}: {
  mood?: ScribblesMood;
  prop?: ScribblesProp;
  // Width in pixels
  size?: number;
  // Next to text that already says what he's doing, hide him from screen
  // readers
  decorative?: boolean;
}) {
  const label = decorative ? {} : { role: "img", "aria-label": "Scribbles the pencil" };
  return (
    <svg
      className={`scribbles scribbles--${mood}`}
      width={size}
      height={Math.round((size * 216) / 210)}
      viewBox="0 0 210 216"
      aria-hidden={decorative || undefined}
      {...label}
    >
      <path
        className="scribbles__squiggle"
        d="M24 200 C 44 182 64 212 84 194 S 124 182 144 196"
        pathLength={1}
        fill="none"
        stroke="#ff8a3d"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.7}
      />
      <g className="scribbles__body">
        <rect x="66" y="22" width="68" height="34" rx="14" fill="#ff9fb6" />
        <rect x="62" y="50" width="76" height="16" rx="4" fill="#b9c3cf" />
        <rect x="66" y="62" width="68" height="96" fill="#ffd35c" />
        <rect x="66" y="62" width="22" height="96" fill="#ffe27f" />
        <rect x="112" y="62" width="22" height="96" fill="#f4b400" />
        <path d="M66 158 L 134 158 L 100 196 Z" fill="#ffe2b8" />
        <path d="M90 185 L 110 185 L 100 196 Z" fill="#2d2a32" />
        <ellipse className="scribbles__eye" cx="88" cy="98" rx="7" ry="8" fill="#2d2a32" />
        <ellipse className="scribbles__eye" cx="112" cy="98" rx="7" ry="8" fill="#2d2a32" />
        <circle cx="90" cy="95" r="2.2" fill="#fff" />
        <circle cx="114" cy="95" r="2.2" fill="#fff" />
        <path d={MOUTH[mood]} fill="none" stroke="#2d2a32" strokeWidth={4} strokeLinecap="round" />
        <circle cx="76" cy="114" r="5" fill="#ff9fb6" opacity={0.8} />
        <circle cx="124" cy="114" r="5" fill="#ff9fb6" opacity={0.8} />
        <path
          className="scribbles__arm"
          d={ARM[mood]}
          fill="none"
          stroke="#2d2a32"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <path
          d="M134 104 Q 150 110 156 124"
          fill="none"
          stroke="#2d2a32"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Held prop={prop} />
      </g>
    </svg>
  );
}

export default Scribbles;
