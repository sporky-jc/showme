import React from "react";
import { useOpenLogin } from "./loginPopup";

// For a student's page opened with nobody signed in (an old bookmark, or the
// login ran out): say so, with a way to sign in, instead of an empty page.
// Signing in then stays on the page.
function SignInPrompt({ children }: { children: React.ReactNode }) {
  const openLogin = useOpenLogin();
  return (
    <div className="page-message">
      <p>{children}</p>
      <button type="button" className="paper-btn paper-btn--action" onClick={openLogin}>
        Sign in
      </button>
    </div>
  );
}

export default SignInPrompt;
