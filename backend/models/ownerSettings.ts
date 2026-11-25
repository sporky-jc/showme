import mongoose from "mongoose";

// The site owner's settings (Owner settings on the Teacher page, only the
// owner sees them: middlewares/owner.ts). One document, read where each
// setting is used, so a change takes effect with no deploy. Stage A6 of
// tasks/sense-words-plan.md. Two feature flags, both off until the owner
// turns them on:
//
// - senseTagger: whether the sense tagger (tagger/queue.ts) runs, at each
//   10-minute scheduled run. It also needs the Cloudflare keys, set by the
//   deploy; without them it stays off whatever this says. It only saves
//   tags: nobody sees them while showAiHighlights is off.
// - showAiHighlights: whether the Gallery sends kids the saved tags (GET
//   /Collections, controllers/routes.ts), from the next page load. Off, kids
//   see the word list's highlights only, as before the tagger.
//
// So the tagger can be measured on real sentences in the background, and
// released, or taken back, with one switch.
//
// No document yet, or one that can't be read, means everything off.
const SETTINGS_ID = "owner";

const ownerSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: SETTINGS_ID },
  senseTagger: { type: Boolean, default: false, required: true },
  showAiHighlights: { type: Boolean, default: false },
  // When each was last turned on or off, for the panel
  senseTaggerChangedAt: { type: Date },
  showAiHighlightsChangedAt: { type: Date },
});

const OwnerSettings = mongoose.model("OwnerSettings", ownerSettingsSchema);

export const OWNER_FLAGS = ["senseTagger", "showAiHighlights"] as const;
export type OwnerFlag = (typeof OWNER_FLAGS)[number];

export type StoredOwnerSettings = Record<OwnerFlag, boolean> & Partial<Record<`${OwnerFlag}ChangedAt`, Date>>;

type StoredDocument = Partial<Record<OwnerFlag, unknown> & Record<`${OwnerFlag}ChangedAt`, Date>>;

export const readOwnerSettings = async (): Promise<StoredOwnerSettings> => {
  const stored = await OwnerSettings.findById(SETTINGS_ID).lean<StoredDocument>();
  const settings = {} as StoredOwnerSettings;
  for (const flag of OWNER_FLAGS) {
    // Only a stored true is on
    settings[flag] = stored?.[flag] === true;
    const changedAt = stored?.[`${flag}ChangedAt`];
    if (changedAt) settings[`${flag}ChangedAt`] = changedAt;
  }
  return settings;
};

// Turns the given flags on or off, noting when, and leaves the others as
// they are
export const saveOwnerSettings = async (changes: Partial<Record<OwnerFlag, boolean>>) => {
  const now = new Date();
  const set: Record<string, boolean | Date> = {};
  for (const flag of OWNER_FLAGS) {
    const on = changes[flag];
    if (typeof on !== "boolean") continue;
    set[flag] = on;
    set[`${flag}ChangedAt`] = now;
  }
  if (Object.keys(set).length > 0) await OwnerSettings.updateOne({ _id: SETTINGS_ID }, { $set: set }, { upsert: true });
  return readOwnerSettings();
};

// Whether kids see the AI highlights. Off when the settings can't be read:
// a database hiccup hides the AI highlights rather than the Gallery.
export const aiHighlightsShown = async () => {
  try {
    return (await readOwnerSettings()).showAiHighlights;
  } catch {
    return false;
  }
};

// The weekly measure's switch ("Measure the sense tagger", Stage A7 of
// tasks/sense-words-plan.md, scripts/switch-off-ai-highlights.ts): turns AI
// highlights for kids off when the measure fails, and nothing else. It
// can't turn anything on; turning them back on is always the owner's press.
// Says whether they were on, for the run's summary.
export const switchOffAiHighlights = async (): Promise<{ wasOn: boolean }> => {
  const { modifiedCount } = await OwnerSettings.updateOne(
    { _id: SETTINGS_ID, showAiHighlights: true },
    { $set: { showAiHighlights: false, showAiHighlightsChangedAt: new Date() } }
  );
  return { wasOn: modifiedCount === 1 };
};
