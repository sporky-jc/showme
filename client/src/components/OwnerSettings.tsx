import { useEffect, useState } from "react";
import * as api from "../api";
import type { OwnerSettings as Settings, OwnerSettingsBody } from "../api/types";
import { useFeature } from "../features";

type Flag = keyof OwnerSettingsBody;

// Only what the contract says (backend/contract/api.ts): anything else hides
// the panel. The highlights switch may be missing while an older server is
// still deployed; then only AI reading shows.
const isSettings = (data: unknown): data is Settings => {
  const tagger = (data as Partial<Settings> | null)?.senseTagger;
  const highlights = (data as Partial<Settings> | null)?.showAiHighlights;
  return (
    typeof tagger === "object" &&
    tagger !== null &&
    typeof tagger.on === "boolean" &&
    typeof tagger.ready === "boolean" &&
    typeof tagger.today === "number" &&
    typeof tagger.perDay === "number" &&
    (highlights === undefined || (typeof highlights === "object" && highlights !== null && typeof highlights.on === "boolean"))
  );
};

// What the screen reader hears after a change
const SAID: Record<Flag, (on: boolean) => string> = {
  senseTagger: (on) => (on ? "AI reading is on. Kids don't see its highlights yet." : "AI reading is off."),
  showAiHighlights: (on) =>
    on ? "Kids now see the AI highlights in the Gallery." : "Kids see only the word list's highlights.",
};

// The Owner settings, at the bottom of the Teacher page, for the site's owner
// only: the server answers nobody else (backend/middlewares/owner.ts), so for
// every other teacher nothing shows. Two feature flags
// (backend/models/ownerSettings.ts), for the sense tagger (backend/tagger/,
// Stage A of tasks/sense-words-plan.md):
// - AI reading: two free AIs read each approved sentence and save the sense
//   words they agree on, from the next run (within 10 minutes). Kids see
//   nothing of it.
// - AI highlights for kids: the Gallery lights up those words too, from the
//   next page load.
// So the AI can be measured in the background, then shown, or hidden again.
function OwnerSettings({ onSaid }: { onSaid: (said: string) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<Flag | null>(null);
  const [failed, setFailed] = useState<Flag | null>(null);
  // Sense highlights can be off for the whole site (see features.ts), as
  // they are on production. Then kids see none, whatever this switch says.
  const lit = useFeature("senseHighlights");

  useEffect(() => {
    let current = true;
    api
      .fetchOwnerSettings()
      .then(({ data }) => {
        if (current && isSettings(data)) setSettings(data);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  if (!settings) return null;
  const tagger = settings.senseTagger;
  const highlights = settings.showAiHighlights as Settings["showAiHighlights"] | undefined;

  const change = async (flag: Flag, on: boolean) => {
    setSaving(flag);
    setFailed(null);
    try {
      const { data } = await api.changeOwnerSettings({ [flag]: on });
      if (!isSettings(data)) throw new Error("Unexpected answer");
      setSettings(data);
      onSaid(SAID[flag](flag === "senseTagger" ? data.senseTagger.on : (data.showAiHighlights?.on ?? on)));
    } catch {
      setFailed(flag);
    }
    setSaving(null);
  };

  const failedNote = (flag: Flag) =>
    failed === flag && (
      <p className="paper-review__failed" role="alert">
        That didn&apos;t change. Check your internet connection, then press the button again.
      </p>
    );

  return (
    <section className="paper-review__switch paper-review__owner" aria-labelledby="owner-settings">
      <h2 id="owner-settings" className="paper-review__owner-title">
        Owner settings
      </h2>

      <div className="paper-review__owner-flag" role="group" aria-label="AI reading">
        <p className="paper-review__switch-state">
          <strong>AI reading: {tagger.on ? "on" : "off"}.</strong>{" "}
          {tagger.on
            ? "Two AIs read each sentence you approve and save the sense words they agree on."
            : "The AIs don't read new sentences."}
        </p>
        <p className="paper-review__owner-count">
          Read today: {tagger.today} of {tagger.perDay} sentences.
        </p>
        {!tagger.ready && <p className="paper-review__owner-count">It needs the Cloudflare keys before it can run.</p>}
        {failedNote("senseTagger")}
        <button
          type="button"
          className={tagger.on ? "paper-btn" : "paper-btn paper-btn--action"}
          disabled={saving !== null}
          onClick={() => change("senseTagger", !tagger.on)}
        >
          {saving === "senseTagger" ? "Saving…" : tagger.on ? "Turn AI reading off" : "Turn AI reading on"}
        </button>
      </div>

      {highlights && !lit && (
        <div className="paper-review__owner-flag" role="group" aria-label="AI highlights for kids">
          <p className="paper-review__switch-state">
            <strong>AI highlights for kids: off on this site.</strong> Sense highlights are switched off here, so
            kids see plain sentences. What the AIs found stays hidden.
          </p>
        </div>
      )}

      {highlights && lit && (
        <div className="paper-review__owner-flag" role="group" aria-label="AI highlights for kids">
          <p className="paper-review__switch-state">
            <strong>AI highlights for kids: {highlights.on ? "on" : "off"}.</strong>{" "}
            {highlights.on
              ? "The Gallery lights up the sense words both AIs agreed on."
              : "Kids see only the word list's highlights. What the AIs found stays hidden."}
          </p>
          {failedNote("showAiHighlights")}
          <button
            type="button"
            className={highlights.on ? "paper-btn" : "paper-btn paper-btn--action"}
            disabled={saving !== null}
            onClick={() => change("showAiHighlights", !highlights.on)}
          >
            {saving === "showAiHighlights"
              ? "Saving…"
              : highlights.on
                ? "Hide AI highlights from kids"
                : "Show AI highlights to kids"}
          </button>
        </div>
      )}
    </section>
  );
}

export default OwnerSettings;
