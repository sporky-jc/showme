import React from "react";
import { Link } from "react-router";
import FilmPlayer from "../components/FilmPlayer";
import { FILMS, WELCOME_FILM } from "../films";
import { REFRESHERS } from "../refreshers";
import type { Technique } from "../api/types";

// The Films page: every explainer film in one place, to watch again. Open to
// everyone, signed in or not. The Welcome film comes first. Each card is the film's name, what it's about
// (the refresher's own words) and the player. Nothing downloads until a
// film's play button is pressed, and the pictures here are the small copies.
// The films are listed in the order of films.ts.
function Films() {
  const films = (Object.keys(FILMS) as Technique[]).map((technique) => ({
    technique,
    film: FILMS[technique]!,
    words: REFRESHERS[technique],
  }));

  return (
    <div className="paper-films">
      <div className="paper-films__top">
        <h1>Films</h1>
        <p className="paper-films__lead">
          Short films about ways to show, not tell. Each one is about half a minute.
        </p>
      </div>
      <ul className="paper-films__list">
        <li className="paper-card paper-films__card">
          <h2>{WELCOME_FILM.title}</h2>
          <p className="paper-films__about">Don’t just tell it. Show it! See what that means.</p>
          <FilmPlayer
            film={{ ...WELCOME_FILM, poster: WELCOME_FILM.smallPoster }}
            about={WELCOME_FILM.title}
          />
        </li>
        {films.map(({ technique, film, words }) => (
          <li key={technique} className="paper-card paper-films__card">
            <h2>{words.name}</h2>
            <p className="paper-films__about">{words.meaning}</p>
            <FilmPlayer film={{ ...film, poster: film.smallPoster }} about={words.name} />
          </li>
        ))}
      </ul>
      <p className="paper-films__back">
        <Link to="/" className="paper-btn">
          Back to home
        </Link>
      </p>
    </div>
  );
}

export default Films;
