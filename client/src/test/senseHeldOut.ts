import type { Labeled } from "./senseSet";
import type { SenseKey } from "../senses";

// The held-out practice set (Stage A of tasks/sense-words-plan.md): 40 more
// made-up Show sentences, labeled the same way as test/senseSet.ts (the
// senses a teacher would see), written before any tuning on them. The
// tagger's question has been tuned against senseSet.ts, so it may have
// learned that set rather than kids' writing: production needs the measure
// to pass on this set too.
//
// Never tune on it. Don't change its sentences or labels to make a score
// pass; if one is truly wrong, fix it and say so in the pull request.
//
// Some are traps: a thing's name alone ("roses", "pizza") shows no sense,
// and the same word can show different senses ("sweet" smell or taste).

const set = (show: string, ...senses: SenseKey[]): Labeled => ({ show, senses });

export const SENSE_HELD_OUT: readonly Labeled[] = [
  // See
  set("The lake was so still it looked like a mirror.", "see"),
  set("Purple and gold streaks painted the evening sky.", "see"),
  set("A tiny spider dangled from a silver thread.", "see"),
  set("The old photo had faded to a pale yellow.", "see"),
  set("Her sneakers flashed with blinking lights.", "see"),
  set("Snow covered the cars like thick white blankets.", "see"),

  // Hear
  set("The kettle whistled until Dad grabbed it.", "hear"),
  set("Our neighbor's dog barked at every car that passed.", "hear"),
  set("The pages rustled as she flipped through the book.", "hear"),
  set("A car horn honked twice outside my window.", "hear"),
  set("The old bus rumbled and coughed up the hill.", "hear"),
  set("Coins jingled in my pocket as I ran.", "hear"),

  // Feel
  set("The sand burned the bottoms of my feet.", "feel"),
  set("My fingers were numb after the snowball fight.", "feel"),
  set("The kitten's fur was as soft as a cloud.", "feel"),
  set("A sharp pebble poked through my sock.", "feel"),
  set("The pool water was freezing when I jumped in.", "feel"),
  set("My backpack straps dug into my shoulders.", "feel"),

  // Smell
  set("The bakery smelled like cinnamon rolls.", "smell"),
  set("A skunk sprayed, and the whole street stank.", "smell"),
  set("Fresh-cut grass gave the air a sweet scent.", "smell"),
  set("The garbage truck left a sour stink behind it.", "smell"),
  set("Her shampoo had a fruity scent like strawberries.", "smell"),

  // Taste
  set("The lemon drop was so sour my lips puckered.", "taste"),
  set("The soup tasted salty and a little bit spicy.", "taste"),
  set("The sweet cookie was full of chocolate chips.", "taste"),
  set("The medicine tasted bitter, so I gulped my water.", "taste"),
  set("The watermelon was sweet and juicy.", "taste"),

  // More than one
  set("Fireworks crackled and lit the sky with sparks.", "hear", "see"),
  set("The hot cocoa warmed my hands and tasted like marshmallows.", "feel", "taste"),
  set("The barn smelled like hay, and the horses snorted.", "smell", "hear"),
  set("The wind howled, and icy snow stung my cheeks.", "hear", "feel"),
  set("The pancakes sizzled and smelled like butter.", "hear", "smell"),
  set("The red balloon popped with a loud bang.", "see", "hear"),

  // Only tells, or only names things: a teacher sees no sense
  set("The game was exciting."),
  set("My sister is really nice."),
  set("The field trip was awesome."),
  set("He was so embarrassed."),
  set("There were roses and tulips in the garden."),
  set("We ate pizza after the game."),
];
