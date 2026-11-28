import { useId, useState } from "react";
import type { ScribblesSuggestion } from "../api/types";
import { modelName } from "./modelName";

type Step = NonNullable<ScribblesSuggestion["trail"]>[number];

const CHECK = { words: "Word check", safety: "Safety check", helper: "Helper", "big-helper": "Big helper" } as const;
const QUESTION = { rules: "", safety: "", welfare: "Is the child OK?", danger: "Is the child in danger?", realRisk: "Is it real?", checklist: "Writing check" } as const;
const SAID = {
  "nothing-found": "found nothing",
  held: "held it",
  "sent-back": "sent it back",
  safe: "safe",
  unsafe: "not safe",
  worried: "worried",
  "not-worried": "not worried",
  real: "really at risk",
  "not-real": "play or a story",
  "all-good": "all good",
  "found-problems": "found",
} as const;
const FOUND: Record<string, string> = {
  gallery: "not OK for the gallery",
  topic: "off topic",
  technique: "technique missing",
  shows: "doesn't show",
  grammar: "grammar",
};

const stepText = (step: Step) => {
  const who = step.model ? `${CHECK[step.check]} ${modelName(step.model)}` : CHECK[step.check];
  const found = step.found?.length ? `: ${step.found.map((f) => FOUND[f] ?? f.replace(/-/g, " ")).join(", ")}` : "";
  const question = QUESTION[step.question] ? `${QUESTION[step.question]} ` : "";
  const hidden = step.hidden ? `, read with ${step.hidden} contact detail${step.hidden === 1 ? "" : "s"} hidden` : "";
  return { who, said: `${question}${SAID[step.said]}${found}${hidden}` };
};

// How Scribbles decided: one line per check, folded behind a button
// (a part under each Teacher page card, suggestionParts.tsx)
function Trail({ suggestion }: { suggestion: ScribblesSuggestion }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const steps = suggestion.trail ?? [];
  return (
    <div className="paper-scribbles-trail">
      <button type="button" className="paper-scribbles-trail__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        How Scribbles decided
      </button>
      {open && (
        <ol id={id} className="paper-scribbles-trail__steps">
          {steps.map((step) => {
            const { who, said } = stepText(step);
            return (
              <li key={`${step.check} ${step.question} ${step.model ?? ""}`} className={step.why ? "paper-scribbles-trail__step paper-scribbles-trail__step--why" : "paper-scribbles-trail__step"}>
                <span>
                  <strong>{who}</strong>: {said}.
                  {step.why && <strong className="paper-scribbles-trail__mark"> This is why it&apos;s here.</strong>}
                </span>
                {step.model && (
                  <code className="paper-scribbles-trail__model">
                    {step.model}
                    {step.version ? ` · ${step.version}` : ""}
                  </code>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default Trail;
