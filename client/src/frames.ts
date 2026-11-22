import type { CSSProperties } from "react";
import type { Frame } from "./api/types";

// The frames a student can pick for their approved sentence's picture in the
// gallery (PUT /MyPage/:id/look). The ids come from the backend's contract
// (FRAMES in backend/contract/api.ts): naming one it doesn't have, or leaving
// one out, fails the type check. Every card has a frame; one whose author
// hasn't picked shows DEFAULT_FRAME, as the backend's DEFAULT_FRAME says.
export const FRAME_NAMES = {
  violet: "Grape",
  coral: "Watermelon",
  teal: "Ocean",
  sun: "Sunshine",
} as const satisfies Record<Frame, string>;

export const FRAME_IDS = Object.keys(FRAME_NAMES) as Frame[];

export const DEFAULT_FRAME: Frame = "violet";

// The frame's colors, from the tokens in theme/paper.css, for
// .paper-gallery__frame and the frame picker's swatches
export const frameStyle = (frame: Frame = DEFAULT_FRAME) =>
  ({
    "--frame-color": `var(--paper-frame-${frame})`,
    "--frame-shadow": `var(--paper-frame-${frame}-shadow)`,
  }) as CSSProperties;
