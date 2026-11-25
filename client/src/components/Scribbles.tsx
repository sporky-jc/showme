// Scribbles, the pencil who coaches students. Drawn in SVG and moved with CSS
// (src/theme/paper.css). He is always moving, with one big, simple motion per
// mood: "idle" bobs and blinks, "happy" hops and waves both arms, "thinking"
// sways with thought dots over his head, and "worried" (raised brows, a
// wobbly mouth and a drop of sweat) wobbles, for a sentence that may mean a
// student needs help. He can hold something for the job on each page.
// Everything stands still for anyone whose device asks for less motion.
// He can also react once to something the student just did (see
// ScribblesReaction), then go back to his mood.
import { useState } from "react";

export type ScribblesMood = "idle" | "happy" | "thinking" | "worried";
export type ScribblesProp = "none" | "note" | "check" | "brush" | "tape";
// "catch": the note he holds flies into his hand, and he nods (a sentence
// was just sent). "cheer": one big jump, with sparks by his head (a sentence
// was just approved). Each plays once, for about a second.
export type ScribblesReaction = "catch" | "cheer";

const INK = "#20304a";

// His left arm: down, cheering, scratching his head, or hugging himself
const LEFT_ARM = {
  idle: "M64 108 Q 42 116 38 136",
  happy: "M64 104 Q 40 90 36 64",
  thinking: "M64 104 Q 46 84 64 60",
  worried: "M64 108 Q 50 120 58 134",
} as const;

// His right hand is where he holds things (see Held), so it stays put
// unless his hand is free and he is cheering
const RIGHT_ARM = "M136 108 Q 152 112 156 124";
const RIGHT_ARM_CHEER = "M136 104 Q 160 90 164 64";

// Written out in full: the production build keeps only the CSS class names
// that appear literally in the code (vite.config.ts), so a name pieced
// together like `scribbles--${mood}` would lose its animation there
const MOOD_CLASS = {
  idle: "scribbles scribbles--idle",
  happy: "scribbles scribbles--happy",
  thinking: "scribbles scribbles--thinking",
  worried: "scribbles scribbles--worried",
} as const;

// Added for one play, in full for the same reason
const REACTION_CLASS = {
  catch: " scribbles--catch",
  cheer: " scribbles--cheer",
} as const;

// The last animation of each reaction: when it ends, the reaction is over
const REACTION_END = ["scribbles-gotit", "scribbles-cheer"];

const MOUTH = {
  idle: { d: "M88 122 Q 100 134 112 122", fill: "none" },
  happy: { d: "M86 118 Q 100 142 114 118 Z", fill: "#ff6b5b" },
  thinking: { d: "M95 126 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", fill: INK },
  worried: { d: "M88 128 Q 94 122 100 128 T 112 128", fill: "none" },
} as const;

// Which way he looks: thinking glances up and to the side
const LOOK = { idle: 0, happy: 0, thinking: 3, worried: -1 } as const;

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
          <rect x="146" y="110" width="46" height="46" rx="10" fill="#fff" stroke="#6fe0b0" strokeWidth={4} />
          <path
            d="M157 133 l 9 9 l 16 -18"
            fill="none"
            stroke="#17694a"
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
          <path d="M192 76 Q 204 60 200 52 Q 190 62 188 72 Z" fill="#7a5cff" />
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
            fill="#ffc93c"
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
  reaction,
}: {
  mood?: ScribblesMood;
  prop?: ScribblesProp;
  // Width in pixels
  size?: number;
  // Next to text that already says what he's doing, hide him from screen
  // readers
  decorative?: boolean;
  // Plays once when he first appears. To play it again, draw a new
  // Scribbles (a new `key`).
  reaction?: ScribblesReaction;
}) {
  const [playing, setPlaying] = useState(reaction);
  const label = decorative ? {} : { role: "img", "aria-label": "Scribbles the pencil" };
  const look = LOOK[mood];
  const cheering = mood === "happy" && prop === "none";
  return (
    <svg
      className={MOOD_CLASS[mood] + (playing ? REACTION_CLASS[playing] : "")}
      onAnimationEnd={(event) => {
        if (REACTION_END.includes(event.animationName)) setPlaying(undefined);
      }}
      width={size}
      height={Math.round((size * 216) / 210)}
      viewBox="0 0 210 216"
      aria-hidden={decorative || undefined}
      {...label}
    >
      <ellipse className="scribbles__shadow" cx="100" cy="208" rx="40" ry="6" fill={INK} opacity={0.12} />
      <path
        className="scribbles__squiggle"
        d="M24 200 C 44 182 64 212 84 194 S 124 182 144 196"
        pathLength={1}
        fill="none"
        stroke="#ff6b5b"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.7}
      />
      {mood === "thinking" && (
        <g className="scribbles__dots" data-thinking>
          <circle cx="146" cy="30" r="6" fill="#7a5cff" />
          <circle cx="162" cy="16" r="7" fill="#7a5cff" />
          <circle cx="180" cy="4" r="8" fill="#7a5cff" />
        </g>
      )}
      {playing === "cheer" && (
        <g data-sparks>
          <path className="scribbles__spark" d="M40 30 l5 12 l12 5 l-12 5 l-5 12 l-5 -12 l-12 -5 l12 -5 z" fill="#ffc93c" />
          <path className="scribbles__spark" d="M160 14 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4 l9 -4 z" fill="#7fd3ff" />
          <path className="scribbles__spark" d="M178 70 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="#ff9fb0" />
        </g>
      )}
      <g className="scribbles__body">
        <path
          className="scribbles__arm"
          d={LEFT_ARM[mood]}
          fill="none"
          stroke={INK}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <path
          className={cheering ? "scribbles__arm scribbles__arm--right" : undefined}
          d={cheering ? RIGHT_ARM_CHEER : RIGHT_ARM}
          fill="none"
          stroke={INK}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <rect x="64" y="20" width="72" height="36" rx="15" fill="#ff9fb0" />
        <rect x="62" y="50" width="76" height="16" rx="3" fill="#b8c6d6" />
        <path d="M62 56 H 138 M62 61 H 138" stroke="#94a6ba" strokeWidth={2} />
        <rect x="64" y="66" width="72" height="92" fill="#ffc93c" />
        <rect x="88" y="66" width="24" height="92" fill="#ffb21a" />
        <path d="M64 158 L 136 158 L 100 200 Z" fill="#f6d6ae" />
        <path d="M90 188 L 110 188 L 100 200 Z" fill={INK} />
        {mood === "worried" && (
          <g data-worried>
            {/* Brows raised in the middle, and a drop of sweat */}
            <path d="M76 80 Q 84 80 94 74" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
            <path d="M124 80 Q 116 80 106 74" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
            <path d="M130 66 Q 135 75 130 79 Q 125 75 130 66 Z" fill="#8fd3ff" stroke="#4aa3d8" strokeWidth={1.5} />
          </g>
        )}
        <g className="scribbles__eye">
          <ellipse cx="86" cy="100" rx="10" ry="12" fill="#fff" />
          <ellipse cx="114" cy="100" rx="10" ry="12" fill="#fff" />
          <circle cx={86 + look} cy={102 - Math.abs(look)} r="6" fill={INK} />
          <circle cx={114 + look} cy={102 - Math.abs(look)} r="6" fill={INK} />
          <circle cx={88 + look} cy={98 - Math.abs(look)} r="2" fill="#fff" />
          <circle cx={116 + look} cy={98 - Math.abs(look)} r="2" fill="#fff" />
        </g>
        <path
          d={MOUTH[mood].d}
          fill={MOUTH[mood].fill}
          stroke={INK}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="74" cy="120" r="6" fill="#ff9fb0" opacity={0.8} />
        <circle cx="126" cy="120" r="6" fill="#ff9fb0" opacity={0.8} />
        {/* Its own group, so a reaction can move it without undoing the
            tilt each prop is drawn with */}
        <g className="scribbles__held">
          <Held prop={prop} />
        </g>
      </g>
    </svg>
  );
}

export default Scribbles;
