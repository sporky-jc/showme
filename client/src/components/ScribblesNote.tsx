import type { ScribblesSuggestion } from "../api/types";
import { SUGGESTION_PARTS } from "./suggestionParts";

// Scribbles' note on a card of the Teacher page: what he suggests for the
// sentence, in parts (suggestionParts.tsx), each shown only when it has
// something to say. The teacher still decides.
function ScribblesNote({ suggestion, firstName }: { suggestion: ScribblesSuggestion; firstName: string }) {
  return (
    <div className="paper-scribbles-parts">
      {SUGGESTION_PARTS.filter((part) => part.show(suggestion)).map(({ id, Part }) => (
        <Part key={id} suggestion={suggestion} firstName={firstName} />
      ))}
    </div>
  );
}

export default ScribblesNote;
