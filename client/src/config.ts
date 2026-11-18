// variables for item per page displayed on different pages

export const SentencesPerPageForMyPage = 8;

export const DisplayCollectionSentences = 12;

// Which screens get the phone-shaped copies of the Welcome screen's photos
// (public/images/*-phone.jpg): phones held upright, at most 480 px wide and at
// least 16:9 tall. The copies are the middle of each wide photo: the same
// pixels without its sides, wide enough for the widest such screen, so they
// are about half the bytes. Used by pages/Welcome.tsx and by index.html's
// early download of the first photo (vite.config.ts).
export const phonePhotoMedia = "(max-width: 480px) and (max-aspect-ratio: 9/16)";
