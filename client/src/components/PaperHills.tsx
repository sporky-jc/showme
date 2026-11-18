// Three layers of paper hills, stretched to the width of whatever holds them
// (the footer). Scenery only, so screen readers skip it.
function PaperHills({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 110"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <path d="M0 50 C 240 5, 460 90, 720 45 S 1060 20, 1200 50 V110 H0 Z" fill="#9fdcae" />
      <path d="M0 80 C 300 50, 620 105, 900 75 S 1120 70, 1200 78 V110 H0 Z" fill="#5fbf7d" />
      <path d="M0 98 C 300 85, 620 112, 900 96 S 1120 94, 1200 97 V110 H0 Z" fill="#3a9a5c" />
    </svg>
  );
}

export default PaperHills;
