// The Welcome screen's examples: fixed, they don't change.
// picture: the photo; phonePicture: its middle, for phones held upright (see
// phonePhotoMedia in config.ts). Replacing a photo? Replace both.

// One example on the Welcome screen (see pages/Welcome.tsx)
export interface Slide {
  key: number;
  title: string;
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
    title: "Day 1",
    tell: "It is cold outside.",
    show: "My breath puffed out like a little cloud, and the crunchy grass snapped under my boots.",
    short: "Cold",
    alt: "Someone walking through snowy trees",
    picture: "/images/winter.jpg",
    phonePicture: "/images/winter-phone.jpg",
  },
  {
    key: 2,
    title: "Day 2",
    tell: "It is hot outside.",
    show: "The sun pressed on my shoulders like a heavy blanket, and my ice cream dripped faster than I could lick it.",
    short: "Hot",
    alt: "A hot sunny day",
    picture: "/images/summer.jpg",
    phonePicture: "/images/summer-phone.jpg",
  },
  {
    key: 3,
    title: "Day 3",
    tell: "His room is messy.",
    show: "Socks hid under pizza boxes, and the floor crunched with every step.",
    short: "Messy room",
    alt: "A very messy room",
    picture: "/images/messy.jpg",
    phonePicture: "/images/messy-phone.jpg",
  },
  {
    key: 4,
    title: "Day 4",
    tell: "Her room is clean.",
    show: "The floor shone so brightly that I could see my own face smiling back at me.",
    short: "Clean room",
    alt: "A very clean room",
    picture: "/images/clean.jpg",
    phonePicture: "/images/clean-phone.jpg",
  },
];

export default tell;
