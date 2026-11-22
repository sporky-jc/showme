import mongoose from "mongoose";

// The site owner's settings (Owner settings on the Teacher page, only the
// owner sees them: middlewares/owner.ts). One document, read at the start
// of every scheduled run, so a change takes effect within 10 minutes with
// no deploy. Stage A6 of tasks/sense-words-plan.md.
//
// - senseTagger: whether the sense tagger (tagger/queue.ts) runs. Off until
//   the owner turns it on. It also needs the Cloudflare keys, set by the
//   deploy; without them it stays off whatever this says.
//
// No document yet means everything off.
const SETTINGS_ID = "owner";

const ownerSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: SETTINGS_ID },
  senseTagger: { type: Boolean, default: false, required: true },
  // When the sense tagger was last turned on or off, for the panel
  senseTaggerChangedAt: { type: Date },
});

const OwnerSettings = mongoose.model("OwnerSettings", ownerSettingsSchema);

export type StoredOwnerSettings = { senseTagger: boolean; senseTaggerChangedAt?: Date };

export const readOwnerSettings = async (): Promise<StoredOwnerSettings> => {
  const stored = await OwnerSettings.findById(SETTINGS_ID).lean<{ senseTagger?: boolean; senseTaggerChangedAt?: Date }>();
  return {
    senseTagger: stored?.senseTagger === true,
    ...(stored?.senseTaggerChangedAt ? { senseTaggerChangedAt: stored.senseTaggerChangedAt } : {}),
  };
};

export const setSenseTagger = async (on: boolean) => {
  await OwnerSettings.updateOne(
    { _id: SETTINGS_ID },
    { $set: { senseTagger: on, senseTaggerChangedAt: new Date() } },
    { upsert: true }
  );
  return readOwnerSettings();
};
