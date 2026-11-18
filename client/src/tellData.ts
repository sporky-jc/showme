// The Welcome screen's examples: fixed, they don't change. Each Show
// sentence describes what its photo shows; change them together.
// picture: the photo; phonePicture: its middle, for phones held upright (see
// phonePhotoMedia in config.ts). Replacing a photo? Replace both.

// One example on the Welcome screen (see pages/Welcome.tsx)
export interface Slide {
  key: number;
  tell: string;
  show: string;
  // A few words for the example's button, and what the photo shows
  short: string;
  alt: string;
  picture: string;
  phonePicture: string;
}

const tell: Slide[] = [
  {
    key: 1,
    tell: "It is cold outside.",
    show: "Every tree wore a thick white coat, and my boots left a lonely trail across the frozen hill.",
    short: "Cold",
    alt: "A lone hiker crossing a snowy hill of frosted trees",
    picture: "/images/winter.jpg",
    phonePicture: "/images/winter-phone.jpg",
  },
  {
    key: 2,
    tell: "It is hot outside.",
    show: "Golden sand stretched to the sky with nowhere to hide, and every step burned through my shoes.",
    short: "Hot",
    alt: "Sand dunes under a cloudless blue sky",
    picture: "/images/summer.jpg",
    phonePicture: "/images/summer-phone.jpg",
  },
  {
    key: 3,
    tell: "His room is messy.",
    show: "His blanket had tumbled halfway to the floor, and the pillows looked like they had lost a pillow fight.",
    short: "Messy room",
    alt: "An unmade bed with a crumpled blanket sliding off",
    picture: "/images/messy.jpg",
    phonePicture: "/images/messy-phone.jpg",
  },
  {
    key: 4,
    tell: "Her room is clean.",
    show: "Every pillow stood in a neat row, and her blanket lay so smooth that not one wrinkle dared to show.",
    short: "Clean room",
    alt: "A neatly made bed with its pillows in a row",
    picture: "/images/clean.jpg",
    phonePicture: "/images/clean-phone.jpg",
  },
];

export default tell;
