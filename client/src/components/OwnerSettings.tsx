import { useEffect, useState } from "react";
import * as api from "../api";
import type { OwnerSettings as Settings } from "../api/types";

// Only what the contract says (backend/contract/api.ts): anything else hides
// the panel
const isSettings = (data: unknown): data is Settings => {
  const tagger = (data as Partial<Settings> | null)?.senseTagger;
  return (
    typeof tagger === "object" &&
    tagger !== null &&
    typeof tagger.on === "boolean" &&
    typeof tagger.ready === "boolean" &&
    typeof tagger.today === "number" &&
    typeof tagger.perDay === "number"
  );
};

// The Owner settings, at the bottom of the Teacher page, for the site's owner
// only: the server answers nobody else (backend/middlewares/owner.ts), so for
// every other teacher nothing shows. The AI highlights switch turns the sense
// tagger on or off (backend/tagger/, Stage A of tasks/sense-words-plan.md): two
// free AIs read each approved sentence, and the Gallery lights up the sense
// words they agree on. It takes effect at the next run, within 10 minutes.
function OwnerSettings({ onSaid }: { onSaid: (said: string) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

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

  const change = async (on: boolean) => {
    setSaving(true);
    setFailed(false);
    try {
      const { data } = await api.setSenseTagger(on);
      if (!isSettings(data)) throw new Error("Unexpected answer");
      setSettings(data);
      onSaid(data.senseTagger.on ? "AI highlights are on." : "AI highlights are off.");
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  return (
    <section className="paper-review__switch paper-review__owner" aria-labelledby="owner-settings">
      <h2 id="owner-settings" className="paper-review__owner-title">
        Owner settings
      </h2>
      <p className="paper-review__switch-state">
        <strong>AI highlights: {tagger.on ? "on" : "off"}.</strong>{" "}
        {tagger.on
          ? "Two AIs read each sentence you approve, and the Gallery lights up the sense words they agree on."
          : "Only the word list lights up sense words in the Gallery."}
      </p>
      <p className="paper-review__owner-count">
        Read today: {tagger.today} of {tagger.perDay} sentences.
      </p>
      {!tagger.ready && (
        <p className="paper-review__owner-count">It needs the Cloudflare keys before it can run.</p>
      )}
      {failed && (
        <p className="paper-review__failed" role="alert">
          That didn&apos;t change. Check your internet connection, then press the button again.
        </p>
      )}
      <button
        type="button"
        className={tagger.on ? "paper-btn" : "paper-btn paper-btn--action"}
        disabled={saving}
        onClick={() => change(!tagger.on)}
      >
        {saving ? "Saving…" : tagger.on ? "Turn AI highlights off" : "Turn AI highlights on"}
      </button>
    </section>
  );
}

export default OwnerSettings;
