import type { Technique } from "./api/types";

// The refresher pop-ups: a minute's reminder of what a technique is, opened
// from a Tell that asks for it (see components/Refresher.tsx). These are the
// approved words from the design canvas's "Refresher content" sheet. Every
// refresher is this data and nothing else, so adding a technique means adding
// words here, not code.
//
// Steps: meet it (meaning, a Tell turned into a Show, a clue), spot it (tap
// the part that uses it), finish it (pick the best ending), a quick check,
// then done.

export interface Practice {
  q: string;
  // The choices: for "spot it", the sentence in pieces
  choices: readonly string[];
  // The right choice's place in `choices`
  answer: number;
  // What Scribbles says when it's picked, and the clue for a wrong pick
  yes: string;
  hint: string;
}

export interface Refresher {
  name: string;
  // "What's a simile?": the button that opens it, and its first heading
  ask: string;
  meaning: string;
  clue: string;
  // The example: a Tell, and a Show with the technique's words marked
  tell: string;
  before: string;
  phrase: string;
  after: string;
  spot: Practice;
  // "Finish it" shows `start` and a blank before its choices
  finish: Practice & { start: string };
  check: Practice;
}

export const REFRESHERS: Record<Technique, Refresher> = {
  senses: {
    name: "Senses",
    ask: "What’s a sense?",
    meaning:
      "Your five senses are how you notice things: see, hear, feel, smell and taste. Showing means telling what your senses notice.",
    clue: "Ask: what would I see, hear, feel, smell or taste?",
    tell: "It was raining.",
    before: "",
    phrase: "Rain drummed on the roof",
    after: " and the air smelled like wet dirt.",
    spot: {
      q: "Tap the part you could hear.",
      choices: ["The door", "creaked open", "and cold air", "rushed in."],
      answer: 1,
      yes: "Yes! You could hear the door creak.",
      hint: "Which part makes a sound?",
    },
    finish: {
      q: "Pick the ending that shows a smell.",
      start: "The kitchen smelled",
      choices: ["like warm cookies.", "really good.", "nice."],
      answer: 0,
      yes: "Yes! Now we can almost smell it.",
      hint: "Which one could your nose notice?",
    },
    check: {
      q: "Which one shows instead of tells?",
      choices: ["I was cold.", "My fingers turned pink and stung."],
      answer: 1,
      yes: "Yes! Pink, stinging fingers show the cold.",
      hint: "Look for what you could see or feel.",
    },
  },
  simile: {
    name: "Simile",
    ask: "What’s a simile?",
    meaning: "A simile compares two things using like or as.",
    clue: "Look for like or as.",
    tell: "The snow was soft.",
    before: "The snow was ",
    phrase: "as soft as a pillow",
    after: ".",
    spot: {
      q: "Tap the simile.",
      choices: [
        "His tail thumped the floor",
        "like a drum",
        "when I got home.",
      ],
      answer: 1,
      yes: "Yes! It compares his tail to a drum.",
      hint: "Look for like or as.",
    },
    finish: {
      q: "Finish the simile.",
      start: "The room was as quiet as",
      choices: ["a sleeping cat.", "very quiet.", "a room."],
      answer: 0,
      yes: "Yes! A sleeping cat makes no sound.",
      hint: "Pick the one that compares the room to something else.",
    },
    check: {
      q: "Which one is a simile?",
      choices: ["The sun was very hot.", "The sun felt like an oven."],
      answer: 1,
      yes: "Yes! It compares the sun to an oven, using like.",
      hint: "Look for like or as.",
    },
  },
  metaphor: {
    name: "Metaphor",
    ask: "What’s a metaphor?",
    meaning: "A metaphor says one thing is another thing, without like or as.",
    clue: "Look for one thing called something it isn’t.",
    tell: "His room was messy.",
    before: "His room ",
    phrase: "was a junkyard",
    after: ".",
    spot: {
      q: "Tap the metaphor.",
      choices: ["After the race,", "my legs were jelly", "so I sat down."],
      answer: 1,
      yes: "Yes! Legs aren’t really jelly. It shows they felt weak.",
      hint: "Find the part that calls something what it isn’t.",
    },
    finish: {
      q: "Finish the metaphor.",
      start: "The full moon was",
      choices: ["a big silver coin.", "very round.", "up high."],
      answer: 0,
      yes: "Yes! It calls the moon a coin.",
      hint: "Pick the one that calls the moon something else.",
    },
    check: {
      q: "Which one is a metaphor?",
      choices: ["The baby was a little monkey.", "The baby was like a monkey."],
      answer: 0,
      yes: "Yes! No like or as, so it’s a metaphor. The other one is a simile.",
      hint: "A metaphor doesn’t use like or as.",
    },
  },
  personification: {
    name: "Personification",
    ask: "What’s personification?",
    meaning:
      "Personification gives a thing feelings or actions that only people have.",
    clue: "Look for a thing doing something people do.",
    tell: "It was windy.",
    before: "The wind ",
    phrase: "grabbed my hat and ran off with it",
    after: ".",
    spot: {
      q: "Tap the personification.",
      choices: ["The old stairs", "groaned", "under my feet."],
      answer: 1,
      yes: "Yes! Stairs can’t really groan like a tired person.",
      hint: "Which part is something a person would do?",
    },
    finish: {
      q: "Finish it.",
      start: "The alarm clock",
      choices: ["yelled at me to get up.", "was loud.", "was on my desk."],
      answer: 0,
      yes: "Yes! Clocks can’t yell, but people can.",
      hint: "Pick the one where the clock acts like a person.",
    },
    check: {
      q: "Which one is personification?",
      choices: ["The flowers danced in the wind.", "The flowers were pink."],
      answer: 0,
      yes: "Yes! Flowers can’t really dance.",
      hint: "Look for a thing doing what people do.",
    },
  },
  onomatopoeia: {
    name: "Onomatopoeia",
    ask: "What’s onomatopoeia?",
    meaning:
      "Onomatopoeia (say it: on-uh-mat-uh-PEE-uh) is a word that sounds like the noise it names.",
    clue: "Look for a sound word, like boom or splash.",
    tell: "The fireworks went off.",
    before: "",
    phrase: "Boom!",
    after: " The fireworks lit up the sky.",
    spot: {
      q: "Tap the sound word.",
      choices: ["The door", "slammed", "shut."],
      answer: 1,
      yes: "Yes! Slam sounds like a door shutting hard.",
      hint: "Say each part out loud. Which one is a sound?",
    },
    finish: {
      q: "Finish it with a sound.",
      start: "The balloon went",
      choices: ["POP!", "away.", "up high."],
      answer: 0,
      yes: "Yes! Pop sounds like a balloon bursting.",
      hint: "Pick the one that sounds like the noise.",
    },
    check: {
      q: "Which one uses a sound word?",
      choices: ["Rain went drip, drip, drip.", "Rain fell all day."],
      answer: 0,
      yes: "Yes! Drip sounds like the rain.",
      hint: "Look for a word that makes the noise.",
    },
  },
  hyperbole: {
    name: "Hyperbole",
    ask: "What’s hyperbole?",
    meaning:
      "Hyperbole (say it: hy-PER-buh-lee) stretches the truth a lot to show how big a feeling is.",
    clue: "Look for something that can’t really be true.",
    tell: "I was hungry.",
    before: "I was so hungry ",
    phrase: "I could eat a horse",
    after: "!",
    spot: {
      q: "Tap the hyperbole.",
      choices: ["This backpack", "weighs a ton", "today."],
      answer: 1,
      yes: "Yes! It doesn’t really weigh a ton. It just feels that heavy.",
      hint: "Which part can’t really be true?",
    },
    finish: {
      q: "Finish it with a big stretch.",
      start: "I waited in line",
      choices: ["for a million years.", "for a long time.", "with my mom."],
      answer: 0,
      yes: "Yes! No one waits a million years. It shows how long it felt.",
      hint: "Pick the one that stretches the truth.",
    },
    check: {
      q: "Which one is hyperbole?",
      choices: ["My bag is heavy.", "My bag weighs more than a car."],
      answer: 1,
      yes: "Yes! A bag can’t weigh more than a car.",
      hint: "Look for the one that can’t be true.",
    },
  },
  alliteration: {
    name: "Alliteration",
    ask: "What’s alliteration?",
    meaning:
      "Alliteration is when words close together start with the same sound.",
    clue: "Look for the same first sound again and again.",
    tell: "The snake was moving.",
    before: "The ",
    phrase: "sneaky snake slid slowly",
    after: " by.",
    spot: {
      q: "Tap the alliteration.",
      choices: ["We saw", "big brown bears", "in the woods."],
      answer: 1,
      yes: "Yes! Big, brown and bears all start with b.",
      hint: "Find the words that start with the same sound.",
    },
    finish: {
      q: "Pick the one with the same first sound.",
      start: "In the pond, I saw",
      choices: ["five fat frogs.", "five green frogs.", "some frogs."],
      answer: 0,
      yes: "Yes! Five, fat and frogs all start with f.",
      hint: "Say them out loud. Which one repeats a sound?",
    },
    check: {
      q: "Which one uses alliteration?",
      choices: ["Tiny turtles take time.", "Small turtles are slow."],
      answer: 0,
      yes: "Yes! Tiny, turtles, take and time all start with t.",
      hint: "Listen for the same first sound.",
    },
  },
  allusion: {
    name: "Allusion",
    ask: "What’s an allusion?",
    meaning:
      "An allusion (say it: uh-LOO-zhun) points to a story, movie or hero your reader already knows, so they get the picture fast.",
    clue: "Look for a name from a story everyone knows.",
    tell: "My little brother never tells the truth.",
    before: "My little brother ",
    phrase: "is a real Pinocchio",
    after: ".",
    spot: {
      q: "Tap the allusion.",
      choices: [
        "On Saturdays,",
        "my sister turns into Sleeping Beauty",
        "until noon.",
      ],
      answer: 1,
      yes: "Yes! Sleeping Beauty slept for a very long time.",
      hint: "Look for a name from a story you know.",
    },
    finish: {
      q: "Finish the allusion.",
      start: "My dad lifted the couch. He is a real",
      choices: ["Hercules.", "strong man.", "dad."],
      answer: 0,
      yes: "Yes! Hercules is a hero known for being very strong.",
      hint: "Pick a name everyone knows for being strong.",
    },
    check: {
      q: "Which one is an allusion?",
      choices: [
        "My brother gets very angry.",
        "My brother turns into the Hulk when he’s mad.",
      ],
      answer: 1,
      yes: "Yes! It points to the Hulk, who gets big and green when he’s angry.",
      hint: "Look for a name from a story or movie.",
    },
  },
};
