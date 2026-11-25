import type { CSSProperties } from "react";
import { Link } from "react-router";

// The celebration when a student first sees their sentence approved (see
// useNewApprovals.ts): a short line saying so, and a stamp pressed onto the
// sentence's note with paper bits popping out of it. Plays once, for about a
// second; under prefers-reduced-motion the stamp and the line just show
// (paper.css).

// Where each paper bit flies, and its color (the sense colors, coral and
// violet)
const BITS = [
  ["-46px", "-28px", "-120deg", "--paper-sense-see"],
  ["-38px", "-44px", "140deg", "--paper-sense-hear"],
  ["-20px", "-56px", "-120deg", "--paper-sense-feel"],
  ["0px", "-60px", "140deg", "--paper-sense-smell"],
  ["20px", "-56px", "-120deg", "--paper-sense-taste"],
  ["38px", "-44px", "140deg", "--paper-action"],
  ["46px", "-28px", "-120deg", "--paper-brand"],
  ["50px", "-8px", "140deg", "--paper-sense-see"],
  ["-50px", "-8px", "-120deg", "--paper-sense-hear"],
  ["30px", "8px", "140deg", "--paper-sense-feel"],
  ["-30px", "8px", "-120deg", "--paper-sense-smell"],
  ["10px", "-34px", "140deg", "--paper-action"],
] as const;

// Goes inside the note (which gets "paper-note--fresh"). Hidden from screen
// readers: the note's own label already says it's in the gallery.
export function JoinedStamp() {
  return (
    <span className="paper-joined-stamp" aria-hidden="true">
      {BITS.map(([dx, dy, turn, color]) => (
        <span
          // Each bit flies somewhere different
          key={`${dx} ${dy}`}
          className="paper-joined-stamp__bit"
          style={{ "--dx": dx, "--dy": dy, "--turn": turn, background: `var(${color})` } as CSSProperties}
        />
      ))}
      <span className="paper-joined-stamp__mark">
        In the
        <br />
        gallery!
      </span>
    </span>
  );
}

// Above the student's sentences, while any is new to the gallery
export function JoinedLine({ count }: { count: number }) {
  return (
    <p className="paper-joined-line">
      <strong>
        {count === 1
          ? "Yay! Your sentence is in the gallery!"
          : `Yay! ${count} of your sentences are in the gallery!`}
      </strong>
      <Link to="/Gallery">{count === 1 ? "See it in the gallery" : "See them in the gallery"}</Link>
    </p>
  );
}
