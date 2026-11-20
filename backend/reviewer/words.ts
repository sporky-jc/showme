// Word lists for the rule checks (rules.ts). All lower case; a phrase is
// words separated by single spaces, matched as whole words. Extend freely:
// a false alarm only holds a sentence for a person to read, so when in doubt,
// add the word.

// Bad language and adult words: held for a person, never sent to an AI
export const UNSAFE_WORDS = [
  "fuck", "fucking", "fucked", "fucker", "motherfucker", "shit", "shitty", "bullshit",
  "bitch", "bitches", "bastard", "asshole", "ass", "arse", "dick", "dickhead", "cock",
  "cunt", "pussy", "piss", "pissed", "damn", "dammit", "goddamn", "crap", "wtf", "stfu",
  "slut", "whore", "porn", "porno", "sex", "sexy", "naked", "nude", "boobs", "tits",
  "penis", "vagina", "horny", "dildo", "condom", "weed", "cocaine", "meth", "heroin",
  "drunk", "beer", "vodka", "whiskey", "cigarette", "vape", "vaping",
];

// Spelled out with dots, spaces or symbols ("f.u.c.k", "s h i t"): checked
// in the sentence with everything but letters removed. Only words that can't
// turn up inside ordinary words belong here.
export const UNSAFE_SQUASHED = ["fuck", "shit", "cunt", "bitch", "porn", "asshole", "motherf"];

// Signs a child may be hurting or in danger: held for a person, flagged so
// the teacher can follow up (not only reject the sentence)
export const WORRYING_PHRASES = [
  "kill myself", "killing myself", "kill me", "want to die", "wanna die", "wish i was dead",
  "wish i were dead", "hurt myself", "hurting myself", "cut myself", "cutting myself",
  "suicide", "suicidal", "end my life", "nobody loves me", "no one loves me",
  "nobody cares about me", "no one cares about me", "hate myself", "i hate my life",
  "scared to go home", "afraid to go home", "kill you", "kill them", "kill him",
  "kill her", "shoot you", "shoot them", "stab", "stabbed", "school shooting",
  // Not "hit me" or "touched me": Show sentences say "the cold hit me like a
  // wall". The AI layer and the teacher catch what plain words can't.
];

// Personal details, as phrases (emails, links and numbers are patterns in
// rules.ts): held for a person, never sent to an AI
export const PERSONAL_PHRASES = [
  "my name is", "my full name", "my last name", "my address", "i live at", "i live on",
  "my house is on", "my phone", "my number", "my email", "my password", "call me at",
  "text me", "my school is", "i go to school at", "my snapchat", "my instagram",
  "my tiktok", "my discord", "add me on",
];

// Words that bring a sense, a feeling in the body, or a vivid action into a
// sentence. A short sentence with none of these is a plain Tell, so it gets
// the "use your senses" tip. (Only for short sentences: a long one may paint
// a picture in other ways, and that's for the AI or a person to judge.)
export const SENSORY_WORDS = [
  // See
  "red", "orange", "yellow", "green", "blue", "purple", "pink", "white", "black", "gray",
  "grey", "brown", "golden", "silver", "bright", "dark", "dim", "shiny", "shining", "shimmer",
  "shimmered", "shimmering", "sparkle", "sparkled", "sparkling", "glow", "glowed", "glowing",
  "gleam", "gleamed", "glitter", "glittered", "twinkle", "twinkled", "flash", "flashed",
  "flicker", "flickered", "shadow", "shadows", "shade", "light", "colors", "colorful",
  "pale", "foggy", "fogged", "misty", "blurry", "cloud", "clouds", "smoke", "steam",
  "steamed", "steaming", "stared", "staring", "watched", "glanced", "see", "saw", "seen",
  "looked", "spotted", "sun", "sunlight", "moon", "stars", "rainbow",
  // Hear
  "loud", "quiet", "silent", "silence", "whisper", "whispered", "whispering", "shout",
  "shouted", "scream", "screamed", "yell", "yelled", "laugh", "laughed", "laughing",
  "giggle", "giggled", "sing", "sang", "singing", "hum", "hummed", "humming", "buzz",
  "buzzed", "buzzing", "bang", "banged", "boom", "crash", "crashed", "creak", "creaked",
  "squeak", "squeaked", "crunch", "crunched", "crunchy", "crackle", "crackled", "crackling",
  "sizzle", "sizzled", "sizzling", "pop", "popped", "rattle", "rattled", "rumble",
  "rumbled", "roar", "roared", "howl", "howled", "chirp", "chirped", "bark", "barked",
  "thump", "thumped", "thud", "splash", "splashed", "drip", "dripped", "dripping",
  "tap", "tapped", "ring", "rang", "echo", "echoed", "hear", "heard", "sound", "sounds",
  "noise", "music", "snore", "snored", "sniffle", "sniffled", "swish", "whoosh",
  // Feel (touch and body)
  "warm", "hot", "cold", "cool", "chilly", "freezing", "frozen", "icy", "burning", "sweat",
  "sweaty", "sweating", "shiver", "shivered", "shivering", "tremble", "trembled", "soft",
  "rough", "smooth", "sticky", "slimy", "fuzzy", "fluffy", "prickly", "scratchy", "wet",
  "damp", "dry", "heavy", "sharp", "tingle", "tingled", "itchy", "sore", "ache", "ached",
  "squeeze", "squeezed", "hug", "hugged", "touch", "touched", "breeze", "wind", "breath",
  "heartbeat", "pounding", "pounded", "goosebumps", "cheeks", "fingers", "toes", "skin",
  "felt", "feel",
  // Smell
  "smell", "smelled", "smelly", "stink", "stinky", "stank", "scent", "fragrant", "perfume",
  "aroma", "sniff", "sniffed", "whiff", "rotten", "fresh", "smoky", "musty",
  // Taste
  "taste", "tasted", "sweet", "sour", "salty", "bitter", "spicy", "juicy", "delicious",
  "yummy", "crispy", "creamy", "sugary", "lick", "licked", "chew", "chewed", "bite", "bit",
  "sip", "sipped", "gulp", "gulped", "melted", "melting", "tongue",
  // Vivid actions
  "ran", "raced", "rushed", "jumped", "leaped", "danced", "spun", "twirled", "skipped",
  "stomped", "tiptoed", "crawled", "slid", "slipped", "tumbled", "flew", "zoomed",
  "dashed", "wagged", "flapped", "clapped", "grinned", "smiled", "frowned", "cried",
  "sobbed", "tears", "wiped", "stretched", "yawned", "curled", "hid", "piled", "scattered",
  "splattered", "covered", "wrapped", "trail", "puddle", "puddles", "snow", "rain", "ice",
];

// Small words left out when comparing a sentence with its Tell
export const STOP_WORDS = [
  "a", "an", "the", "is", "was", "are", "were", "be", "it", "its", "it's", "and", "or",
  "but", "so", "to", "of", "in", "on", "at", "very", "really", "so", "too", "i", "my", "me",
  "he", "she", "his", "her", "they", "their", "we", "our", "you", "your", "this", "that",
  "outside", "today",
];
