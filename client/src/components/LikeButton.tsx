import { useState } from "react";
import type { SentenceLikes } from "../api/types";

const countText = (likes: number) => (likes === 1 ? "1 like" : `${likes} likes`);

// A heart, filled or just its outline. Scenery: the button around it, or the
// count beside it, says what it means.
const Heart = ({ filled }: { filled: boolean }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 20.5 4.2 12.9a4.9 4.9 0 0 1 0-7 5 5 0 0 1 7 0l.8.8.8-.8a5 5 0 0 1 7 0 4.9 4.9 0 0 1 0 7Z" />
  </svg>
);

// A sentence's heart and like count, on its gallery card (signed-in users
// only). Filled once the user likes it; pressing it again takes the like
// back. On the user's own sentence it only shows the count: students can't
// like their own.
function LikeButton({
  likes,
  onToggle,
}: {
  likes: SentenceLikes;
  onToggle: () => void;
}) {
  // The heart pops when the student presses it (paper.css), not when the
  // page first shows hearts they liked before
  const [pressed, setPressed] = useState(false);

  if (likes.mine) {
    return (
      <span className="paper-like paper-like--mine" title="Likes on your sentence">
        <Heart filled />
        <span className="paper-like__count">{countText(likes.likes)}</span>
      </span>
    );
  }

  return (
    <span className="paper-like">
      <button
        type="button"
        className={
          pressed && likes.likedByMe
            ? "paper-like__heart paper-like__heart--pop"
            : "paper-like__heart"
        }
        aria-label="Like"
        aria-pressed={likes.likedByMe}
        onClick={() => {
          setPressed(true);
          onToggle();
        }}
      >
        <Heart filled={likes.likedByMe} />
      </button>
      <span className="paper-like__count">{countText(likes.likes)}</span>
    </span>
  );
}

export default LikeButton;
