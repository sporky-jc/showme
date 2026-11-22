import type { CSSProperties } from "react";
import type { SenseKey } from "../senses";

// A comic sound-effect sticker for a sense word the student used ("THUMPED!"),
// in that sense's color, slapped on at a tilt. Decorative: the page says in
// words which senses the sentence uses. Styled in src/theme/paper.css.
function SenseSticker({ word, sense, tilt = -6 }: { word: string; sense: SenseKey; tilt?: number }) {
  const style = {
    "--sticker-color": `var(--paper-sense-${sense})`,
    "--sticker-tilt": `${tilt}deg`,
  } as CSSProperties;
  return (
    <span className="paper-sticker" style={style} aria-hidden>
      <span className="paper-sticker__word">{word.toUpperCase()}!</span>
    </span>
  );
}

export default SenseSticker;
