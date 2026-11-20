// Sound words (onomatopoeia) and exclamations children write in Show
// sentences: "Crunch crunch went the snow.", "Whoosh!", "Brrr", "Kaboom".
// Showing is exactly what we ask for, so these are never a spelling mistake
// (spelling.ts) and saying one twice is never a repeated-word mistake
// (mechanics.ts: "crunch crunch", "boom boom").
//
// All lower case, with no letter written more than twice: a child's
// stretched spelling ("Brrrrr", "Zzzzz", "Shhhh") is read with its long
// letters cut down to two or to one ("brr", "zz", "shh") before it's looked
// up here. Many are dictionary words too ("crunch", "drip"); they're listed
// so the repeated-word check knows they're sounds. Extend freely: a word
// here can only stop a sentence being sent back, never let one past the
// safety checks (rules.ts doesn't read this list).
export const SOUND_WORDS = new Set([
  // Breath, mouths and bodies
  "achoo", "ahem", "ahh", "aah", "argh", "aw", "aww", "brr", "burp", "eek", "eep", "eww", "ew",
  "gasp", "gulp", "ha", "haha", "hah", "hee", "hehe", "hic", "hiccup", "hm", "hmm", "huff", "hush",
  "mm", "munch", "nom", "oof", "ooh", "oops", "ouch", "ow", "phew", "pff", "psst", "puff",
  "shh", "shush", "sigh", "slurp", "sniff", "snore", "sob", "tsk", "ugh", "uh", "um", "whew",
  "whoa", "wow", "yay", "yawn", "yikes", "yippee", "yuck", "yum", "zz",
  // Bangs, crashes and hits
  "bam", "bang", "bash", "biff", "bonk", "boom", "bop", "clang", "clank", "clatter", "clonk",
  "crack", "crash", "creak", "kaboom", "kapow", "kerplunk", "knock", "pow", "smack",
  "smash", "splat", "thud", "thump", "thunk", "thwack", "wallop", "wham", "whack", "whomp",
  // Water, snow and weather
  "crunch", "drip", "drop", "gurgle", "patter", "pitter", "plink", "plip", "plonk", "plop",
  "splash", "splish", "splosh", "sploosh", "squelch", "squish", "swish", "whoosh", "swoosh",
  "rumble", "crackle", "sizzle", "hiss", "fizz", "pop",
  // Things that move, ring and whirr
  "beep", "boing", "buzz", "chug", "click", "clack", "clickety", "clink", "ding", "dong",
  "honk", "ping", "ring", "tap", "tick", "tock", "toot", "vroom", "whee", "whir", "whirr",
  "whizz", "whiz", "zap", "zing", "zip", "zoom", "zig", "zag", "flip", "flop",
  // Animals
  "baa", "bark", "cluck", "cockadoodledoo", "growl", "grr", "hoot", "meow", "miaow",
  "moo", "neigh", "oink", "purr", "quack", "ribbit", "roar", "squawk", "squeak", "tweet", "woof",
]);
