import React from "react";
import { useSelector } from "react-redux";
import { Link, useNavigate } from "react-router";
import Scribbles from "../components/Scribbles";
import { useOpenLogin } from "../components/loginPopup";
import { phonePhotoMedia } from "../config";
import type { RootState } from "../reducers/types";
import examples from "../tellData";

// The senses Scribbles has tips for on the Write page
const SENSES = ["See", "Hear", "Feel", "Smell", "Taste"];

// The same example the Welcome screen starts with
const example = examples[0];

// About page: what Show ME is, how it works, and who checks the sentences
const About = () => {
  const navigate = useNavigate();
  const openLogin = useOpenLogin();
  const user = useSelector((state: RootState) => state.user);

  // Join Us: a signed-in student goes straight to their sentences; anyone else
  // gets the sign-in pop-up first (signing in then opens Today, their home)
  const join = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); // stay in the app: no reload, no "#" in the address
    if (Object.keys(user).length !== 0) navigate("/MySentences");
    else openLogin();
  };

  return (
    <div className="paper-about">
      <section className="paper-about__hero">
        <div className="paper-about__pitch">
          <span className="paper-about__badge">About Show ME</span>
          <h1 className="paper-about__title">Write sentences that paint pictures.</h1>
          <p className="paper-about__lead">
            Has anyone ever called your writing boring? Show ME helps you fix
            that. Instead of telling the reader how something is, you show it,
            with what you see, hear, feel, smell and taste.
          </p>
          <div className="paper-about__actions">
            <a
              href="/MySentences"
              onClick={join}
              className="paper-btn paper-btn--action paper-about__join"
            >
              Join Us!
            </a>
            <Link to="/Gallery" className="paper-btn paper-about__more">
              See the gallery
            </Link>
          </div>
        </div>

        <div className="paper-stack paper-about__example">
          <div className="paper-stack__card paper-about__example-card">
            <picture>
              <source media={phonePhotoMedia} srcSet={example.phonePicture} />
              <img className="paper-about__photo" src={example.picture} alt={example.alt} />
            </picture>
            <div className="paper-about__pair">
              <span className="paper-status paper-status--retry">Tell</span>
              <p className="paper-about__tell">{example.tell}</p>
              <span className="paper-status paper-status--done">Show</span>
              <p className="paper-about__show">{example.show}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="paper-about__how" aria-labelledby="about-how">
        <div className="paper-about__how-top">
          <h2 id="about-how" className="paper-about__heading">
            How it works
          </h2>
          <div className="paper-about__scribbles">
            <Scribbles mood="happy" prop="note" size={88} decorative />
            <p className="paper-bubble">Stuck? Tap a sense and I'll give you a tip!</p>
          </div>
        </div>
        <ol className="paper-about__steps">
          <li className="paper-about__step paper-about__step--turn">
            <span className="paper-about__number" aria-hidden>
              1
            </span>
            <h3>Get your next Tell</h3>
            <p>Each Tell is a plain sentence that only tells, like “It is hot outside.”</p>
          </li>
          <li className="paper-about__step paper-about__step--action">
            <span className="paper-about__number" aria-hidden>
              2
            </span>
            <h3>Show it your way</h3>
            <p>Write your own version. Need an idea? Scribbles has a tip for every sense.</p>
            <ul className="paper-about__senses" aria-label="The five senses">
              {SENSES.map((sense) => (
                <li key={sense}>{sense}</li>
              ))}
            </ul>
          </li>
          <li className="paper-about__step paper-about__step--done">
            <span className="paper-about__number" aria-hidden>
              3
            </span>
            <h3>Join the gallery</h3>
            <p>
              Scribbles reads it. Once it's approved, it goes up in the Show ME
              gallery for everyone to enjoy.
            </p>
          </li>
        </ol>
      </section>

      <section className="paper-card paper-about__reviewer" aria-labelledby="about-reviewer">
        <div className="paper-about__reviewer-text">
          <span className="paper-about__badge paper-about__badge--ink">Who checks my sentence?</span>
          <h2 id="about-reviewer" className="paper-about__heading">
            Scribbles reads every one.
          </h2>
          <ul className="paper-about__points">
            <li>Every sentence is read before it goes up in the gallery.</li>
            <li>A great one goes straight in. One that needs a little more comes back with Try again, so you can make it even better.</li>
            <li>Change a sentence that's already up, and Scribbles reads it again first.</li>
          </ul>
          {/* True today; change it when the AI teacher takes over as Scribbles */}
          <p className="paper-about__honest">
            Right now, a Show ME teacher reads every sentence as Scribbles.
          </p>
        </div>
        {/* A picture of Scribbles' review desk, not the real thing */}
        <div className="paper-about__review" aria-hidden>
          <p className="paper-about__review-label">Scribbles&apos; desk</p>
          <p className="paper-about__review-sentence">
            Steam curled from my cocoa while the window fogged with my breath.
          </p>
          <div className="paper-about__review-buttons">
            <span className="paper-about__approve">Approve</span>
            <span className="paper-about__redo">Try again</span>
          </div>
        </div>
      </section>

      <section className="paper-about__closing" aria-labelledby="about-ready">
        <h2 id="about-ready" className="paper-about__heading">
          Ready to paint with words?
        </h2>
        <a
          href="/MySentences"
          onClick={join}
          className="paper-btn paper-btn--action paper-about__join"
        >
          Start writing
        </a>
      </section>

      {/* Phones have no footer (the main links sit there), so it's here */}
      <p className="paper-about__copyright">&copy; {new Date().getFullYear()} Show ME</p>
    </div>
  );
};

export default About;
