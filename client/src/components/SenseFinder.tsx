import React from "react";
import { SENSE_KEYS, SENSE_NAMES } from "../senses";
import type { SenseKey } from "../senses";
import { DOT } from "./galleryWords";

// The sense finder over the gallery's wall: See, Hear, Feel, Smell and Taste.
// Pressing one shows only the sentences that use that sense (their words in
// that sense's color show why); pressing it again shows them all. One sense
// at a time. The line under the buttons says how many there are, and when
// none uses that sense yet, a Show all button brings them all back.
function SenseFinder({
  sense,
  found,
  onPick,
}: {
  // The sense pressed, if any
  sense: SenseKey | null;
  // How many sentences use it
  found: number;
  onPick: (sense: SenseKey | null) => void;
}) {
  const verb = sense ? SENSE_NAMES[sense].toLowerCase() : "";
  const said =
    sense === null
      ? "Tap a sense to find sentences that use it."
      : found === 0
        ? `No sentences you can ${verb} yet.`
        : `${found} ${found === 1 ? "sentence" : "sentences"} you can ${verb}.`;

  return (
    <div className="paper-finder">
      <div className="paper-finder__senses" role="group" aria-label="Find a sense">
        {SENSE_KEYS.map((key) => (
          <button
            type="button"
            key={key}
            className="paper-finder__sense"
            aria-pressed={sense === key}
            onClick={() => onPick(sense === key ? null : key)}
          >
            <span className={DOT[key]} aria-hidden />
            {SENSE_NAMES[key]}
          </button>
        ))}
      </div>
      <p className="paper-finder__said" role="status">
        {said}
      </p>
      {sense !== null && found === 0 && (
        <button type="button" className="paper-finder__all" onClick={() => onPick(null)}>
          Show all
        </button>
      )}
    </div>
  );
}

export default SenseFinder;
