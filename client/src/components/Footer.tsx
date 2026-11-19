import React from "react";
import { useNavigate } from "react-router";
import PaperHills from "./PaperHills";

// React footer component: the paper hills along the bottom of every page on a wide screen
// (phones have the main links there instead: see NavbarComp),
// with the copyright on a small white label (src/theme/paper.css)
export default function Footer() {
  const navigate = useNavigate();
  return (
    <footer className="site-footer paper-footer">
      <PaperHills className="paper-footer__hills" />
      <div className="paper-footer__text">
        &copy; {new Date().getFullYear()} Copyright:{" "}
        <a href="#" onClick={() => navigate("/")}>
          Show ME
        </a>
      </div>
    </footer>
  );
}
