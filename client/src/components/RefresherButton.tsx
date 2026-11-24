import React, { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import Refresher from "./Refresher";
import { markRefresherSeen } from "../actions/user";
import type { Technique } from "../api/types";
import type { AppDispatch } from "../reducers/types";
import { FILMS } from "../films";
import { REFRESHERS } from "../refreshers";

// "What's a simile?": opens the refresher for what the Tell asks for (see
// Refresher.tsx). With `firstTime`, it opens by itself, once, the first time
// the student meets that technique, and the student's profile remembers it
// (markRefresherSeen) so it won't again, on any device. After that, it only
// opens from the button. Closing it puts the keyboard back on the button.
function RefresherButton({ technique, firstTime }: { technique: Technique; firstTime: boolean }) {
  const dispatch = useDispatch<AppDispatch>();
  const words = REFRESHERS[technique];
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  // The first time: open by itself, and remember it's been seen. (It may
  // become the first time a moment after the page opens: the student's
  // profile arrives from the server.)
  useEffect(() => {
    if (!firstTime || opened.current) return;
    opened.current = true;
    setOpen(true);
    dispatch(markRefresherSeen(technique));
  }, [firstTime, technique, dispatch]);

  const close = () => {
    setOpen(false);
    // Once the pop-up is gone
    setTimeout(() => button.current?.focus());
  };

  return (
    <>
      <button
        type="button"
        ref={button}
        className="paper-write__what"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="paper-write__what-mark" aria-hidden>
          ?
        </span>
        {words.ask}
      </button>
      {open && <Refresher words={words} film={FILMS[technique]} onClose={close} />}
    </>
  );
}

export default RefresherButton;
