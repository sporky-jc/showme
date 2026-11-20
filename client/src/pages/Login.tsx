import React, { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { fetchUser } from "../actions/user";
import { useLocation, useNavigate } from "react-router";
import Scribbles from "../components/Scribbles";
import { loginUser } from "../api";
import type { AppDispatch } from "../reducers/types";

function Login({ show, onHide }: { show: boolean; onHide?: () => void }) {
  // dispatch for react redux
  const dispatch = useDispatch<AppDispatch>();

  // navigate from react router
  const navigate = useNavigate();
  // Signing in from a student page's own "Sign in" (My sentences, Write)
  // stays there; from anywhere else it opens Today, the student's home
  const onMyPage = /^\/(mysentences|mypage|write)(\/|$)/i.test(useLocation().pathname);

  // Whether a sign-in is being finished (Google has answered, our backend hasn't)
  const [loading, setLoading] = useState(false);

  // Set up Google's sign-in button. The function Google calls after a sign-in
  // lives inside this effect, so Google always gets a version that uses the
  // current onHide/navigate (not ones remembered from the first draw).
  useEffect(() => {
    async function handleCallbackResponse(
      response: google.accounts.id.CredentialResponse
    ) {
      setLoading(true);

      try {
        // Send Google's ID token to our backend. If it's valid, the backend's
        // reply sets the httpOnly login cookie; the browser stores it for us.
        await loginUser(response.credential);
        // Fetching the user also proves the cookie works end to end.
        await dispatch(fetchUser());
        onHide?.();
        setLoading(false);
        if (!onMyPage) navigate("/");
      } catch (error) {
        console.error("Authentication error", error);
        setLoading(false);
      }
    }

    // setup for Google identity service, once the pop-up has drawn its box
    const timer = setTimeout(() => {
      google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleCallbackResponse,
      });
      // The box is there: the pop-up draws it straight away
      google.accounts.id.renderButton(document.getElementById("signInDiv")!, {
        type: "standard", // Google's default, which its types ask to spell out
        theme: "outline",
        size: "large",
      });
      google.accounts.id.prompt();
    }, 300);

    // If the popup closes first, cancel: there'd be no box to draw into
    return () => clearTimeout(timer);
  }, [dispatch, navigate, onHide, onMyPage]);

  // The pop-up is the browser's own modal dialog: it keeps the keyboard
  // inside, closes on Escape (its "cancel" event), and hides the page from
  // screen readers while it's open. (Test browsers may lack showModal: then
  // it just opens.)
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const box = dialog.current;
    if (!box || !show) return;
    // What had the keyboard (e.g. the Sign in button), to give it back on
    // closing: the pop-up closes by leaving the page, which the browser
    // doesn't count as closing a dialog, so it wouldn't do this itself
    const opener = document.activeElement as HTMLElement | null;
    if (typeof box.showModal === "function") box.showModal();
    else box.setAttribute("open", "");
    // The keyboard starts on the greeting (read out first), not with a ring
    // on the close button, which the dialog would pick
    box.querySelector<HTMLElement>("#signin-title")?.focus();
    return () => {
      if (typeof box.close === "function") box.close();
      else box.removeAttribute("open");
      if (opener?.isConnected) opener.focus();
    };
  }, [show]);

  // Where the last press began: a press that starts inside the card and is
  // let go outside it (e.g. selecting its text) still "clicks" the dialog
  // itself, and mustn't close it
  const pressStart = useRef<EventTarget | null>(null);

  if (!show) return null;

  // A wide-screen card with Scribbles waving on top; on a phone, a sheet
  // that slides up from the bottom (see .paper-signin in paper.css)
  return (
    <dialog
      ref={dialog}
      className="paper-signin"
      aria-labelledby="signin-title"
      onCancel={(event) => {
        event.preventDefault(); // close through onHide, like the buttons
        onHide?.();
      }}
      // A press on the dimmed page around the card (the dialog itself, not
      // anything inside it), from start to finish, closes it too
      onPointerDown={(event) => {
        pressStart.current = event.target;
      }}
      onClick={(event) => {
        const outside = event.target === event.currentTarget;
        // No pointer press (a keyboard "click") counts by where it landed
        const startedOutside = pressStart.current === null || pressStart.current === event.currentTarget;
        pressStart.current = null;
        if (outside && startedOutside) onHide?.();
      }}
    >
      <div className="paper-signin__card">
        <div className="paper-signin__scribbles">
          <Scribbles mood="happy" size={110} decorative />
        </div>
        <button type="button" className="paper-signin__close" aria-label="Close" onClick={onHide}>
          <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 18 18">
            <path d="M4 4 L14 14 M14 4 L4 14" />
          </svg>
        </button>
        <h2 id="signin-title" tabIndex={-1}>
          Hi! Ready to write?
        </h2>
        <p>Sign in to save your Show sentences and get them into the gallery.</p>
        {/* Google draws its own button in here (it can't be restyled).
            Hidden, not removed, while signing in: Google draws it once, so
            it must still be there if the sign-in fails */}
        <div id="signInDiv" className="paper-signin__google" hidden={loading}></div>
        {loading && (
          <p className="paper-signin__busy" role="status">
            Signing you in…
          </p>
        )}
        <button type="button" className="paper-signin__later" onClick={onHide}>
          Not now
        </button>
      </div>
    </dialog>
  );
}

export default Login;
