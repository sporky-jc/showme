import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
// Only these icons: "@mui/icons-material" on its own means thousands of icon
// files for the bundler to read (see FadeMenu.tsx)
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import type { SentenceLikes } from "../api/types";

const countText = (likes: number) => (likes === 1 ? "1 like" : `${likes} likes`);

// The heart and the count side by side
const row = { display: "inline-flex", alignItems: "center", gap: 4 };

// A sentence's heart and like count, on its Collections card (signed-in users
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
  const count = (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {countText(likes.likes)}
    </Typography>
  );

  if (likes.mine) {
    return (
      <span style={row} title="Likes on your sentence">
        <FavoriteIcon fontSize="small" sx={{ color: "text.disabled" }} aria-hidden />
        {count}
      </span>
    );
  }

  return (
    <span style={row}>
      <IconButton
        size="small"
        aria-label="Like"
        aria-pressed={likes.likedByMe}
        onClick={onToggle}
        sx={{ color: likes.likedByMe ? "#e0245e" : "text.secondary" }}
      >
        {likes.likedByMe ? (
          <FavoriteIcon fontSize="small" />
        ) : (
          <FavoriteBorderIcon fontSize="small" />
        )}
      </IconButton>
      {count}
    </span>
  );
}

export default LikeButton;
