import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Link, Navigate, NavLink, useLocation, useNavigate } from "react-router";
import Logo from "./Logo";
import Home from "../pages/Home";
import PageErrorBoundary from "./PageErrorBoundary";
import PageLoading from "./PageLoading";
import { useSelector } from "react-redux";
import LoadingOverlay from "react-loading-overlay-ts";
import useAuthService from "../service/authService";
import { OpenLoginContext } from "./loginPopup";
import useReviewCount from "./useReviewCount";
import type { RootState } from "../reducers/types";

// Home is the first page most visitors see, so it ships with the main file.
// Every other page has its own file, so the home page doesn't wait for code
// it doesn't use.
const loadAbout = () => import("../pages/About");
const loadLogin = () => import("../pages/Login");
const loadMyPage = () => import("../pages/MyPage");
const loadWrite = () => import("../pages/Write");
const loadAdmin = () => import("../pages/Admin");
const loadCollection = () => import("../pages/Collection");
const loadFrame = () => import("../pages/Frame");
const loadFilms = () => import("../pages/Films");

const About = lazy(loadAbout);
const Login = lazy(loadLogin);
const MyPage = lazy(loadMyPage);
const Write = lazy(loadWrite);
const Admin = lazy(loadAdmin);
const Collection = lazy(loadCollection);
const Frame = lazy(loadFrame);
const Films = lazy(loadFilms);

// Once the first page is showing and the browser has nothing else to do,
// download the other pages' files in the background, so opening them later
// is instant instead of waiting for the download at the moment of the click.
const prefetchPages = () => {
  [loadAbout, loadLogin, loadMyPage, loadWrite, loadAdmin, loadCollection, loadFrame, loadFilms].forEach(
    (load) => load().catch(() => {}) // a failure here is retried on the click
  );
};
// Returns a function that cancels the wait, for when the nav bar goes away first
const whenIdle = (callback: () => void) => {
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 1000); // Safari has no requestIdleCallback
  return () => clearTimeout(id);
};

// Going to /login directly (an old bookmark, or typing the address): open the
// sign-in pop-up over the home page, just like the Sign in button does. Login is
// a pop-up, so showing it on a page of its own left that page empty.
function OpenLogin({ onOpen }: { onOpen: () => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    onOpen();
    navigate("/", { replace: true });
  }, [onOpen, navigate]);
  return null;
}

// The first and last initial for the account button ("MR" for Maya Rivera)
const initials = (first?: string, last?: string) =>
  ((first?.trim()[0] ?? "") + (last?.trim()[0] ?? "")).toUpperCase() || "?";

// What the badge on the Teacher link says to a screen reader, as the link's
// description: "2 to check in, 5 waiting"
const countsSaid = (checkIn: number, waiting: number) =>
  [checkIn > 0 && `${checkIn} to check in`, waiting > 0 && `${waiting} waiting`]
    .filter(Boolean)
    .join(", ");

// The Teacher link, with a badge on its corner when sentences wait: red with
// how many to check in on (Scribbles held them as worrying), or else a quiet
// grey with how many wait. The badge sits beside the link, not inside it,
// so the link's name stays exactly "Teacher" (automated browser tests find
// it by that name); screen readers hear the count as the link's
// description instead ("Teacher, link, 2 to check in, 5 waiting").
function TeacherLink({ checkIn, waiting }: { checkIn: number; waiting: number }) {
  const said = countsSaid(checkIn, waiting);
  return (
    <span className="paper-nav__badged">
      <NavLink to="/admin" aria-describedby={said ? "teacher-count" : undefined}>
        Teacher
      </NavLink>
      {said && (
        // Hidden from screen readers here: they hear it with the link
        <span
          className={checkIn > 0 ? "paper-nav__badge" : "paper-nav__badge paper-nav__badge--quiet"}
          aria-hidden="true"
        >
          {checkIn > 0 ? checkIn : waiting}
          <span id="teacher-count" className="visually-hidden">
            {said}
          </span>
        </span>
      )}
    </span>
  );
}

// The account button (the signed-in person's initials) and its menu: who is
// signed in, About, and Log out.
function AccountMenu({
  firstName,
  lastName,
  onLogOut,
}: {
  firstName?: string;
  lastName?: string;
  onLogOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const name = [firstName, lastName].filter(Boolean).join(" ");

  // While it's open: a press anywhere else closes it, and so does Escape,
  // which also puts the keyboard back on the button
  useEffect(() => {
    if (!open) return;
    const pressedOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", pressedOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", pressedOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      className="paper-account"
      ref={wrapper}
      // Tabbing out of the menu closes it too
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={button}
        className="paper-account__button"
        aria-label={`Account: ${name}`}
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen(!open)}
      >
        {initials(firstName, lastName)}
      </button>
      {open && (
        <div className="paper-account__menu" id="account-menu">
          <p className="paper-account__name">{name}</p>
          <Link
            to="/about"
            onClick={() => {
              // The link is about to go away: keep the keyboard on the button
              button.current?.focus();
              setOpen(false);
            }}
          >
            About
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogOut();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function NavbarComp() {
  // get user from global react redux store
  const user = useSelector((state: RootState) => state.user);
  const location = useLocation();
  const signedIn = Object.keys(user).length !== 0;

  const authService = useAuthService();
  // Teachers only: how many sentences wait for them, for the Teacher link
  const counts = useReviewCount(signedIn && user.isAdmin === true);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loading, setLoading] = useState(false);
  // Log out was pressed, but the server couldn't be told (see authService)
  const [logOutFailed, setLogOutFailed] = useState(false);

  // In the app the navbar never goes away, but in tests each one is removed
  // after its test; a download still waiting then would land in a later test
  useEffect(() => whenIdle(prefetchPages), []);

  // Function to handle showing the login modal (the same function between
  // draws, so OpenLogin's effect runs once)
  const handleShowLoginModal = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  // Function to handle hiding the login modal. useCallback keeps it the same
  // function between draws, so Login doesn't set up Google's button again
  // every time this nav bar redraws.
  const handleHideLoginModal = useCallback(() => {
    setShowLoginModal(false);
  }, []);

  // Sign out whoever is signed in, or open the sign-in pop-up
  const signInorOut = () => authService(user, setLoading, handleShowLoginModal, setLogOutFailed);

  // On a phone the main links are a bar along the bottom of the screen. It
  // steps aside on the Write page, where the keyboard needs the room (the
  // page has its own way back). The class names are written out in full so
  // the build keeps their styles (see vite.config.ts).
  const writing = /^\/write(\/|$)/i.test(location.pathname);
  const linksClass = writing ? "paper-nav__links paper-nav__links--away" : "paper-nav__links";
  const pageClass = writing ? "paper-page paper-page--full" : "paper-page";

  // The top bar (logo, main links, account) and the routes for each page
  return (
    <>
      <LoadingOverlay active={loading} spinner text="Logging out...">
        <header className="paper-nav">
          <Link to="/" className="paper-nav__logo" aria-label="Show ME: home">
            <Logo size={24} />
          </Link>
          {/* NavLink marks the page you're on, which shows in orange */}
          <nav className={linksClass} aria-label="Main">
            {signedIn ? (
              <>
                <NavLink to="/" end>
                  Home
                </NavLink>
                <NavLink to="/MySentences">My sentences</NavLink>
                <NavLink to="/Gallery">Gallery</NavLink>
                {user.isAdmin && (
                  <TeacherLink checkIn={counts?.checkIn ?? 0} waiting={counts?.waiting ?? 0} />
                )}
              </>
            ) : (
              <>
                {/* Only in the phone's bottom bar: on a wide screen the logo
                    is the way home */}
                <NavLink to="/" end className="paper-nav__phone-only">
                  Home
                </NavLink>
                <NavLink to="/Gallery">Gallery</NavLink>
                <NavLink to="/about">About</NavLink>
              </>
            )}
          </nav>
          {signedIn ? (
            <AccountMenu firstName={user.firstName} lastName={user.lastName} onLogOut={signInorOut} />
          ) : (
            <button type="button" className="paper-btn paper-btn--action paper-nav__signin" onClick={signInorOut}>
              Sign in
            </button>
          )}
        </header>
        {logOutFailed && signedIn && (
          <p className="paper-nav__failed" role="alert">
            We couldn&apos;t log you out. Check your internet, then press Log out again.
          </p>
        )}
        <main className={pageClass}>
          <PageErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              {/* Lets pages open the sign-in pop-up (see loginPopup.ts) */}
              <OpenLoginContext.Provider value={handleShowLoginModal}>
                <Routes>
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/Gallery" element={<Collection />} />
                  <Route path="/about" element={<About />} />
                  <Route
                    path="/login"
                    element={<OpenLogin onOpen={handleShowLoginModal} />}
                  />
                  <Route path="/MySentences" element={<MyPage />} />
                  {/* The pages' old addresses (bookmarks, links in old emails) */}
                  <Route path="/Collections" element={<Navigate to="/Gallery" replace />} />
                  <Route path="/MyPage" element={<Navigate to="/MySentences" replace />} />
                  {/* A new sentence, or with an id, an edit of that one */}
                  <Route path="/Write/:id?" element={<Write />} />
                  {/* The frame an approved sentence has in the gallery */}
                  <Route path="/Frame/:id" element={<Frame />} />
                  {/* Every explainer film, for anyone */}
                  <Route path="/Films" element={<Films />} />
                  <Route path="/" element={<Home />} />
                </Routes>
              </OpenLoginContext.Provider>
            </Suspense>
          </PageErrorBoundary>
        </main>
        {/* Conditionally render the LoginModal */}
        {showLoginModal && (
          <PageErrorBoundary>
            <Suspense fallback={null}>
              <Login show={showLoginModal} onHide={handleHideLoginModal} />
            </Suspense>
          </PageErrorBoundary>
        )}
      </LoadingOverlay>
    </>
  );
}

export default React.memo(NavbarComp);
