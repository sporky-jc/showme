// The Show ME logo, drawn in HTML and SVG (no image file): "Show" on white
// paper, "ME" on a violet tag, and a little pencil that has just drawn the
// squiggle underneath (it draws itself once when the page loads). Its pieces
// scale with `size`, the height of the letters in pixels. Styled in
// src/theme/paper.css.
function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="paper-logo" role="img" aria-label="Show ME" style={{ fontSize: size }}>
      <span className="paper-logo__show" aria-hidden>
        Show
      </span>
      <span className="paper-logo__me" aria-hidden>
        ME
      </span>
      <svg
        className="paper-logo__line"
        viewBox="0 0 200 20"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M4 12 C 20 2 34 18 50 10 S 82 2 98 10 S 130 18 146 10 S 178 2 196 8"
          pathLength={1}
          fill="none"
          stroke="#ff6b5b"
          strokeWidth={5}
          strokeLinecap="round"
        />
      </svg>
      <svg className="paper-logo__pencil" viewBox="0 0 40 120" aria-hidden>
        <rect x="8" y="0" width="24" height="16" rx="7" fill="#ff9fb0" />
        <rect x="6" y="14" width="28" height="8" rx="2" fill="#b8c6d6" />
        <rect x="8" y="22" width="24" height="64" fill="#ffc93c" />
        <rect x="8" y="22" width="8" height="64" fill="#ffd970" />
        <rect x="24" y="22" width="8" height="64" fill="#ffb21a" />
        <path d="M8 86 L 32 86 L 20 112 Z" fill="#f6d6ae" />
        <path d="M15 101 L 25 101 L 20 112 Z" fill="#20304a" />
      </svg>
    </span>
  );
}

export default Logo;
