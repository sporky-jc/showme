import mongoose from "mongoose";
import { TECHNIQUES } from "../contract/api.js";

// User profile Schema
const profileSchema = new mongoose.Schema({
  // The student's Google account id ("sub"). Profiles are found by it and
  // login tokens carry it, so a profile can't be saved without one.
  id: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
  },
  grade: {
    type: String,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  dateJoined: {
    type: Date,
    default: Date.now,
  },
  ownSentences: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sentence",
    },
  ],
  isAdmin: {
    type: Boolean,
    default: false,
  },
  // The refreshers the student has seen, so each opens by itself only once
  // (PUT /Login/refreshers/:technique). Kept here, not in the browser:
  // students share school devices.
  seenRefreshers: [{ type: String, enum: TECHNIQUES }],
  // Written into every login token. Logging out adds 1, so every token
  // issued before that (including stolen copies) stops matching.
  tokenVersion: {
    type: Number,
    default: 0,
  },
});

const Profile = mongoose.model("Profile", profileSchema);

// A profile's fields, as TypeScript reads them from the schema above
export type ProfileFields = mongoose.InferSchemaType<typeof profileSchema>;

export default Profile;
