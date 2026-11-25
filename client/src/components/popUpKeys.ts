import type React from "react";

// The keyboard inside a pop-up (the refresher, the Welcome film): Esc shuts
// it; Tab and Shift+Tab go round its buttons instead of leaving it.
export function popUpKeys(
  event: React.KeyboardEvent,
  dialog: HTMLElement | null,
  heading: HTMLElement | null,
  onClose: () => void
) {
  if (event.key === "Escape") {
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const stops = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled)")];
  if (stops.length === 0) return;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const at = document.activeElement;
  if (event.shiftKey && (at === first || at === heading)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && at === last) {
    event.preventDefault();
    first.focus();
  }
}
