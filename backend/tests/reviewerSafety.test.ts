import { describe, expect, it } from "vitest";
import { checkRules } from "../reviewer/rules.js";
import type { Reason } from "../reviewer/contract.js";
import { SAMPLES } from "../reviewer/samples.js";
import { scoreOf } from "../reviewer/measure.js";

// The rule checks are the only layer sure to run before a sentence leaves
// our systems, so they must hold what a child may be in danger from, or
// what shouldn't reach a class gallery, however it's written. Each row is a
// made-up sentence (none from a real student) and what the rules must do:
// hold it, with this reason among the reasons, or pass it on.
//
// "worrying" (the child may be hurt or in danger: shown first on the
// Teacher page, "Check in") is for abuse, self-harm, hopelessness,
// grooming, neglect and threats; "sensitive-words" for bodies, kissing,
// alcohol, smoking and drugs a person should read first.

const COLD = "It is cold outside.";
type Expected = Reason | "pass";

const check = (rows: [string, Expected][]) =>
  it.each(rows)("%s → %s", (show, expected) => {
    const result = checkRules(COLD, show);
    if (expected === "pass") expect(result).toEqual({ outcome: "pass" });
    else expect(result).toMatchObject({ outcome: "hold", reasons: expect.arrayContaining([expected]) });
  });

// Words that are also the names of things every JavaScript object has
// ("constructor", "toString"): a child can write them, and they must be read
// as plain words, not looked up as if they were in our word lists
describe("words that are also built-in JavaScript names", () => {
  check([
    ["The constructor built a wall of red bricks.", "pass"],
    ["Constructor! The c0nstruct0r drove a yellow digger.", "pass"],
    ["My toy robot has a valueOf button and a toString light.", "pass"],
    ["The constructors and the prototypes stood in a row.", "pass"],
    ["The constructor said he wants to kill me", "worrying"],
  ]);
});

describe("read every way it can be written", () => {
  check([
    ["k y s", "worrying"],
    ["s u i c i d e", "worrying"],
    ["I wanna d-i-e.", "worrying"],
    ["I want to k!ll myself.", "worrying"],
    ["i want to k1ll my self", "worrying"],
    ["I want to d1e.", "worrying"],
    ["I want to d!e.", "worrying"],
    ["I want to dïe.", "worrying"],
    ["ky$", "worrying"],
    ["kys 🙄", "worrying"],
    ["I want to diiiie.", "worrying"],
  ]);
});

describe("emoji read as words", () => {
  check([
    ["I want to 🔫 myself.", "worrying"],
    ["I want to 💀.", "worrying"],
    ["I want to die💀", "worrying"],
    ["I will bring a 🔪 to school.", "worrying"],
    // Kids use 💀 for "that's so funny"
    ["That joke was so funny 💀", "pass"],
  ]);
});

describe("one-letter slips in the words that matter most", () => {
  check([
    ["I want to kil myself.", "worrying"],
    ["I want to kill myslef.", "worrying"],
    ["I want to kill mysefl.", "worrying"],
    ["I wanna die.", "worrying"],
    ["I want 2 b dead.", "worrying"],
    ["sometimes i wish i wasnt alive", "worrying"],
    ["I want to do sucide.", "worrying"],
    ["sewerslide", "worrying"],
    // ... and none of the ordinary words one letter away
    ["I have a lot of skill on my skates.", "pass"],
    ["The clay pots baked in the hot kiln.", "pass"],
    ["The storm finally died down.", "pass"],
    ["We used blue dye on our white shirts.", "pass"],
    ["Green olives rolled across the cold plate.", "pass"],
  ]);
});

describe("hopelessness", () => {
  check([
    ["I wish I wasn't here anymore.", "worrying"],
    ["Everyone would be happier without me.", "worrying"],
    ["I want to go to sleep and never wake up.", "worrying"],
    ["I'm going to end it tonight.", "worrying"],
    ["I don't deserve to live.", "worrying"],
    ["I'm done with life.", "worrying"],
    ["Goodbye forever.", "worrying"],
    ["Life is pointless.", "worrying"],
    ["sometimes i wish i wasnt alive", "worrying"],
    ["I'm so sad all the time.", "worrying"],
    ["I cry every night.", "worrying"],
  ]);
});

describe("hurting themselves, and eating", () => {
  check([
    ["I cut my arm again last night.", "worrying"],
    ["I keep cutting.", "worrying"],
    ["I cut myself", "worrying"],
    ["I took all of mom's pills.", "worrying"],
    ["I took all of mum's pills.", "worrying"],
    ["I purge after lunch.", "worrying"],
    ["I haven't eaten in three days.", "worrying"],
    ["self harm", "worrying"],
    ["self-harm", "worrying"],
    ["selfharm", "worrying"],
    ["sewerslide", "worrying"],
    ["I wanna unalive myself in the cold.", "worrying"],
    ["anorexic", "worrying"],
    // Not every cut is one
    ["I cut my sandwich into little triangles.", "pass"],
    ["I keep cutting paper snowflakes for the window.", "pass"],
  ]);
});

describe("someone hurting them, or someone close to them", () => {
  check([
    ["Daddy comes into my room at night.", "worrying"],
    ["My uncle makes me keep secrets.", "worrying"],
    ["He showed me his private parts.", "worrying"],
    ["He touched my privates.", "worrying"],
    ["Don't tell anyone what we did.", "worrying"],
    ["I was molested.", "worrying"],
    ["I was beaten by my dad.", "worrying"],
    ["I got hit by my mom.", "worrying"],
    ["Dad hitted me.", "worrying"],
    ["Dad whipped me.", "worrying"],
    ["Dad burned me with a cigarette.", "worrying"],
    ["Dad threw me against the wall.", "worrying"],
    ["My dad hit my mom.", "worrying"],
    ["Dad hits my sister.", "worrying"],
    ["Mom hits my little brother with a belt.", "worrying"],
    ["My stepdad locks me in the closet.", "worrying"],
    ["My neighbour touches me.", "worrying"],
    ["My neighbor touches me.", "worrying"],
    ["A man in the park touched me.", "worrying"],
    ["My mom's boyfriend hurts me.", "worrying"],
    ["My mum's boyfriend hurts me.", "worrying"],
    ["My brother punches me.", "worrying"],
    ["the boys at school punch me", "worrying"],
    ["They call me fat and ugly every day.", "worrying"],
    // A ball, the wind or a game isn't a person
    ["I got hit by a snowball at recess.", "pass"],
    ["Dad threw me the ball and I caught it.", "pass"],
    ["My sister pushed me on the swing higher and higher.", "pass"],
    ["They pushed me down the stairs.", "worrying"],
    ["The cold wind hit my face like a slap.", "pass"],
    ["We got beat in the snowball fight.", "pass"],
    ["I kicked my brother's ball over the fence.", "pass"],
  ]);
});

describe("strangers and people online", () => {
  check([
    ["The man online wants to meet me.", "worrying"],
    ["My online friend asked me to send photos.", "worrying"],
    ["A stranger messaged me and said not to tell my mom.", "worrying"],
    ["I got a boyfriend who is 19.", "worrying"],
    ["Send me pics of you.", "worrying"],
  ]);
});

describe("not looked after", () => {
  check([
    ["There is no food at home.", "worrying"],
    ["I sleep in the car with mom.", "worrying"],
    ["I'm home alone every day after school.", "worrying"],
    ["I fell asleep in the car on the long trip.", "pass"],
  ]);
});

describe("threats and violence to others", () => {
  check([
    ["I am going to shoot up the school.", "worrying"],
    ["I will bring a knife to school tomorrow.", "worrying"],
    ["I will bring a gun to school.", "worrying"],
    ["I will cut your head off.", "worrying"],
    ["I want to murder my brother.", "worrying"],
    ["I want to kill my teacher.", "worrying"],
    ["She slit his throat.", "worrying"],
    ["I'm going to beat him up after school.", "worrying"],
    ["I hate Emma and I want her dead.", "worrying"],
    ["Im gonna kill u", "worrying"],
    ["I want to hurt him.", "worrying"],
    ["Blood squirted out of his head when I shot him.", "worrying"],
    ["I will stab the snowman with an icicle.", "worrying"],
  ]);
});

describe("bodies, kissing, alcohol, smoking and drugs", () => {
  check([
    ["She took off her clothes and he kissed her all over.", "sensitive-words"],
    ["I saw my sister naked in the shower.", "sensitive-words"],
    ["He put his hand in my pants.", "worrying"],
    ["I touched her chest.", "sensitive-words"],
    ["They made out under the blanket.", "sensitive-words"],
    ["I am pregnant.", "worrying"],
    ["My dad smokes weed every night.", "sensitive-words"],
    ["We smoked a blunt.", "sensitive-words"],
    ["He was high on pills.", "sensitive-words"],
    ["Mom was drunk again.", "sensitive-words"],
    ["I drank beer with my cousin.", "sensitive-words"],
    ["I tried a cigarette.", "sensitive-words"],
    ["The snowman was made out of three big snowballs.", "pass"],
    ["I could make out the shape of a deer in the fog.", "pass"],
    ["I touched the bottom of the icy pool.", "pass"],
  ]);
});

describe("unkind about someone", () => {
  check([
    ["Liam is so fat and stupid.", "unkind"],
    ["Everyone hates Sophia because she smells.", "unkind"],
    ["Ava is a crybaby and a loser.", "unkind"],
    ["Jake wets the bed, haha.", "unkind"],
    ["Noah is gay.", "unkind"],
    ["Nobody likes you, loser.", "unkind"],
    ["That is so gay.", "unkind"],
    ["Go back to your country.", "unkind"],
    ["Priya's lunch stinks like garbage.", "unkind"],
    ["Hitler was right.", "unkind"],
    ["You are ugly and dumb.", "unkind"],
    ["Mia's mom is poor.", "unkind"],
  ]);
});

describe("naming a classmate", () => {
  check([
    ["Liam is so fat and stupid.", "names-someone"],
    ["Everyone hates Sophia because she smells.", "names-someone"],
    ["Ava is a crybaby and a loser.", "names-someone"],
    ["It was Liam's fault the window broke.", "names-someone"],
    // A name on its own, or with something kind, is fine
    ["My sister Lily giggled.", "pass"],
    ["Mr. Brown smiled and handed me cocoa.", "pass"],
    ["Elsa and Anna built a snowman.", "pass"],
    ["Poor Lily slipped on the icy steps.", "pass"],
    ["Grandma smells like warm cookies.", "pass"],
    ["She smells the flowers in the cold garden.", "pass"],
    ["The fat snowman melted in the sun.", "pass"],
    ["The poor puppy shivered in the snow.", "pass"],
    ["Liam ate a fat sandwich at lunch.", "pass"],
  ]);
});

describe("not English", () => {
  check([
    ["Quiero matarme.", "worrying"],
    ["Me quiero morir.", "worrying"],
    // (Three words is too few to say what language it is: held as worrying)
    ["Quiero morir hoy mismo.", "not-english"],
    ["Je veux mourir.", "worrying"],
    ["Ich will sterben.", "worrying"],
    ["Mierda, hace frío.", "unsafe-words"],
    ["Mierda, hace mucho frío hoy.", "not-english"],
    ["Hace mucho frío hoy.", "not-english"],
    // Sound words aren't another language
    ["Brrr, zzz, achoo!", "pass"],
  ]);
});

describe("personal details", () => {
  check([
    ["I live in Springfield, Ohio.", "personal-details"],
    ["We moved to Austin, TX last year.", "personal-details"],
    ["My birthday is March 3 2015.", "personal-details"],
    ["I am 9 years old.", "personal-details"],
    ["I'm 9.", "personal-details"],
    ["We go to PS 118.", "personal-details"],
    ["I go to St. Mary's.", "personal-details"],
    ["I'm in Mrs. Smith's class.", "personal-details"],
    ["Snap: samcool", "personal-details"],
    ["My user is xX_Sam_Xx on Fortnite.", "personal-details"],
    ["subscribe to my youtube channel samcool", "personal-details"],
    ["my yt is samcool", "personal-details"],
    ["Facetime me.", "personal-details"],
    ["Whatsapp me.", "personal-details"],
    ["My zip code is 90210.", "personal-details"],
    ["My postcode is SW1A 1AA.", "personal-details"],
    ["I am Sam from room 12.", "personal-details"],
    ["The snow piled up outside 42 Maple Street.", "personal-details"],
    ["We live near Oak St. where it is icy.", "personal-details"],
    // Numbers and places that don't say who or where a child is
    ["I am 2 feet taller than my brother.", "pass"],
    ["Wow, OK, the snow is deep.", "pass"],
    ["I visited Orlando, Florida and rode a roller coaster.", "pass"],
    ["I am from Dallas, TX.", "personal-details"],
    ["We wore green for St. Patrick's Day.", "pass"],
  ]);
});

// Sentences that must not flood a teacher's queue: everyday Show sentences
// with a word that can be worrying elsewhere
describe("everyday sentences passed on", () => {
  check([
    ["The lonely tree stood in the field.", "pass"],
    ["The cold was killing me.", "pass"],
    ["I killed it in the game.", "pass"],
    ["We watched Die Hard.", "pass"],
    ["The hunter had a gun.", "pass"],
    ["Dead leaves crunched under my boots.", "pass"],
    // Sad, but an ordinary thing to write about
    ["My goldfish died and I cried.", "pass"],
    ["The soldier was shot in the movie.", "pass"],
    ["The naked trees shivered.", "pass"],
    ["We sipped icy root beer.", "pass"],
    ["My pants were soaked by the puddle.", "pass"],
    ["I went to the High Street shops.", "pass"],
    ["The Middle Ages were cold.", "pass"],
    ["On Oak Road we saw deer.", "pass"],
    ["I read Harry Potter and Percy Jackson.", "pass"],
    ["Luke Skywalker froze on Hoth.", "pass"],
    ["The icy wind hit me like a wall.", "pass"],
    ["I spread jam with a butter knife.", "pass"],
    ["The sky turned blood orange.", "pass"],
    ["The ghost in our spooky story said boo.", "pass"],
    ["Mom said I did a good job.", "pass"],
    ["I drank hot cocoa with Mom.", "pass"],
    ["The batteries in my flashlight will die soon.", "pass"],
    ["Flames shoot up into the night sky.", "pass"],
    ["Our secret fort was cold and dark.", "pass"],
    ["Grandma asked me to send photos of the snow.", "pass"],
    ["We had to stop eating when the bell rang.", "pass"],
    ["Everyone hates broccoli, but I gobble it up.", "pass"],
    ["Everyone hates Mondays when the wind howls.", "pass"],
    ["Grandma takes pills with her warm tea.", "pass"],
    ["There was nothing to eat but carrots at the picnic.", "pass"],
    ["I will not tell anyone about the surprise party.", "pass"],
    ["The rain was gone for days and the grass dried out.", "pass"],
    ["My brother and I had a snowball fight and he hit me in the arm.", "pass"],
    ["Mom comes in my room to wake me up.", "pass"],
    ["She almost drowned in the pool, gasping and sputtering.", "pass"],
    ["My leg hurts so much I limp like a pirate.", "pass"],
  ]);
});

// The measurement's made-up samples (reviewer/samples.ts): none a teacher
// would approve is held by the rules, and the rules hold the worrying ones
// the live measurement counts on
describe("the measurement samples", () => {
  it.each(SAMPLES.filter((s) => s.expected === "approve").map((s) => [s.show, s.tell]))(
    "a sentence a teacher would approve isn't held: %s",
    (show, tell) => {
      expect(checkRules(tell, show).outcome).not.toBe("hold");
    }
  );

  it("the rules hold most of the unsafe samples themselves (the rest are for the safety check)", () => {
    const unsafe = SAMPLES.filter((s) => s.expected === "unsafe");
    const held = unsafe.filter((s) => checkRules(s.tell, s.show).outcome === "hold");
    expect(unsafe.length - held.length).toBeLessThanOrEqual(3);
  });

  it.each(SAMPLES.filter((s) => s.reason).map((s) => [s.show, s.tell, s.reason]))(
    "an unsafe sample is held as the kind of hold it should be: %s",
    (show, tell, reason) => {
      const result = checkRules(tell!, show!);
      expect(result.outcome).toBe("hold");
      expect(result.outcome === "hold" && result.reasons.includes("worrying")).toBe(reason === "worrying");
    }
  );

  it.each(SAMPLES.filter((s) => s.expected === "redo").map((s) => [s.show, s.tell]))(
    "a sentence a teacher would send back isn't held as not English: %s",
    (show, tell) => {
      const result = checkRules(tell, show);
      expect(result.outcome === "hold" && result.reasons.includes("not-english")).toBe(false);
    }
  );
});

describe("how the measurement scores a sample", () => {
  const rules = (reasons: Reason[], verdict: "unsure" | "redo" = "unsure") =>
    ({ verdict, tip: null, reasons, decidedBy: "rules" }) as const;
  it.each([
    [{ expected: "redo" }, rules(["not-english"]), "held"],
    [{ expected: "redo" }, { verdict: "unsure", tip: null, reasons: ["ai"], decidedBy: "ai" }, "agreed"],
    [{ expected: "approve" }, rules(["unkind"]), "wrong"],
    [{ expected: "unsafe", reason: "worrying" }, rules(["worrying"]), "agreed"],
    [{ expected: "unsafe", reason: "worrying" }, rules(["sensitive-words"]), "wrong-reason"],
    [{ expected: "unsafe", reason: "other" }, rules(["worrying"]), "wrong-reason"],
    [{ expected: "unsafe" }, { verdict: "unsure", tip: null, reasons: ["safety-check"], decidedBy: "guard" }, "agreed"],
    // Sent back by the rules with the kind-words tip: right for rude words,
    // wrong for a worrying sentence
    [{ expected: "unsafe", reason: "other" }, { verdict: "redo", tip: "kindWords", reasons: ["unkind"], decidedBy: "rules" }, "agreed"],
    [{ expected: "unsafe", reason: "worrying" }, { verdict: "redo", tip: "kindWords", reasons: ["unsafe-words"], decidedBy: "rules" }, "wrong"],
    // A welfare hold counts like a safety hold
    [{ expected: "unsafe" }, { verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"], decidedBy: "welfare" }, "agreed"],
    [{ expected: "unsafe", reason: "worrying" }, { verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"], decidedBy: "welfare" }, "agreed"],
    [{ expected: "approve" }, { verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"], decidedBy: "welfare" }, "wrong"],
    // ... and the welfare check failing is no answer, like the safety check failing
    [{ expected: "unsafe" }, { verdict: "unsure", tip: null, reasons: ["worrying", "no-welfare-check"], decidedBy: "none" }, "wrong"],
    [{ expected: "unsafe" }, { verdict: "approve", tip: "great", reasons: ["ai"], decidedBy: "ai" }, "wrong"],
  ] as const)("%o with %o is %s", (sample, suggestion, score) => {
    expect(scoreOf({ tell: "T", show: "S", ...sample }, { ...suggestion, reasons: [...suggestion.reasons] })).toBe(score);
  });
});

// What an independent review's ~400 probes found (made-up sentences)
describe("the review: wanting to die, and hurting themselves", () => {
  check([
    ["I'm a burden to everyone.", "worrying"],
    ["Nobody would care if I was gone.", "worrying"],
    ["Everyone would be better if I wasnt here.", "worrying"],
    ["I want it all to stop.", "worrying"],
    ["I dont want to be here anymore.", "worrying"],
    ["I want to jump off a bridge.", "worrying"],
    ["I'm going to jump out the window.", "worrying"],
    ["I keep thinking about dying.", "worrying"],
    ["I am so stupid I hate me.", "worrying"],
    ["I took a lot of pills to sleep forever.", "worrying"],
    ["I wrote a goodbye letter to my mom.", "worrying"],
    ["i want to self delete", "worrying"],
    ["sewer slide", "worrying"],
    ["I want to 🪢 myself.", "worrying"],
    ["Sometimes I scratch my arms until they bleed.", "worrying"],
    ["I hit my head on the wall on purpose.", "worrying"],
    ["I throw up my food so I don't get fat.", "worrying"],
    ["I starve so I can be skinny.", "worrying"],
    ["I cut my legs with scissors.", "worrying"],
    ["Life is not worth it.", "worrying"],
    ["Im worthles and stupid.", "worrying"],
    ["I shuld di", "worrying"],
    ["i want to dy", "worrying"],
    ["i wan to dye", "worrying"],
    ["No one would notice if I disappeared.", "worrying"],
    ["I want to go to heaven to be with grandma now.", "worrying"],
    // Run together, or with an invisible hyphen
    ["I want to killmyself", "worrying"],
    ["I want to k i l l m y s e l f.", "worrying"],
    ["Kill­yourself", "worrying"],
  ]);
});

describe("the review: someone hurting them", () => {
  check([
    ["Dad said he will kill us.", "worrying"],
    ["Dad said he would kill us all.", "worrying"],
    ["Dad gets drunk and hits mom.", "worrying"],
    ["My brother makes me touch his private.", "worrying"],
    ["My cousin made me do sex stuff.", "worrying"],
    ["He put his hand under my shirt.", "worrying"],
    ["He made me take my clothes off.", "worrying"],
    ["He licked my private.", "worrying"],
    ["We played the touching game in our underwear.", "worrying"],
    ["my uncle did bad things to me", "worrying"],
    ["he made me do things I didnt want to", "worrying"],
    ["My moms boyfriend sleeps in my bed.", "worrying"],
    ["My mom's boyfriend comes in my room.", "worrying"],
    ["daddy says its our special game and not to tell", "worrying"],
    ["My coach said I can stay at his house and not tell my parents.", "worrying"],
    ["Dad gave me a black eye.", "worrying"],
    ["I have bruises from my dad.", "worrying"],
    ["Dad throws things at me when he is angry.", "worrying"],
    ["Dad smashed my head into the table.", "worrying"],
    ["I'm scared of my dad.", "worrying"],
    ["I hide under my bed when dad yells.", "worrying"],
    ["My teacher grabbed my arm really hard and it bruised.", "worrying"],
    ["dad beet me", "worrying"],
    ["my uncel tuches me", "worrying"],
    ["he touchd me ther", "worrying"],
    ["he tuched my privit", "worrying"],
    ["The bully pushed me off the swing.", "worrying"],
    // Play, or an accident
    ["Dad hit me with a snowball.", "pass"],
    ["My sister hit me with a pillow.", "pass"],
    ["My brother pushed me into the snow.", "pass"],
    ["Dad threw me into the pool and I laughed.", "pass"],
    ["My dad grabbed me before I slipped on the ice.", "pass"],
    ["Mum locked me out by accident.", "pass"],
    ["He touched my hand and I blushed.", "pass"],
    ["My puppy sleeps in my bed.", "pass"],
    // ... but not when it says how much it hurt
    ["Dad hit me with a belt.", "worrying"],
    ["My brother pushed me into the snow so hard I cried.", "worrying"],
  ]);
});

describe("the review: strangers, people online, and not looked after", () => {
  check([
    ["He said I'm mature for my age.", "worrying"],
    ["He gave me robux to send a pic.", "worrying"],
    ["A guy on roblox asked for pictures of me.", "worrying"],
    ["He told me to delete our messages.", "worrying"],
    ["A man in a game asked where I live.", "worrying"],
    ["I am meeting my friend from fortnite at the mall.", "worrying"],
    ["He asked me to send a picture with no shirt.", "worrying"],
    ["A man gave me candy and told me to get in his car.", "worrying"],
    ["He takes pictures of me in the bath.", "worrying"],
    ["We have nothing to eat and mom has been gone for days.", "worrying"],
    ["I have not had dinner in 3 days.", "worrying"],
    ["Mom leaves me alone at night.", "worrying"],
    ["My mom didn't come home last night.", "worrying"],
    ["We don't have a home anymore.", "worrying"],
    ["I'm going to run away tonight.", "worrying"],
    ["I found a needle in mom's purse.", "worrying"],
  ]);
});

describe("the review: threats", () => {
  check([
    ["I want to burn down the school.", "worrying"],
    ["Ill make him bleed.", "worrying"],
    ["I know where you live and I will get you.", "worrying"],
    ["My dad has a gun and said he will use it.", "worrying"],
    // Stories, and stabs that aren't at a person
    ["Godzilla roared and blasted fire that killed everyone in the city.", "pass"],
    ["I stabbed the snowman with a carrot.", "pass"],
    ["The cold air stabbed my lungs when I breathed.", "pass"],
    ["It felt like someone stabbed my leg with a needle.", "pass"],
    // A figure of speech (Day 34 asks for hyperbole): read first, not "Check in"
    ["My mom is going to kill me!", "sensitive-words"],
    ["Mum will kill me if I lose my gloves.", "sensitive-words"],
    ["Dad said he will kill me.", "worrying"],
    // A brother, sister, cousin or friend being rough is nearly always play:
    // read first, not "Check in"
    ["I couldn't sleep because my little sister kept kicking me all night.", "sensitive-words"],
    ["My cousin pushed me into the pool at the party.", "pass"],
    ["My cousin shoves me when we wait for the bus.", "sensitive-words"],
    ["My friends poke me when I fall asleep in the car.", "sensitive-words"],
    ["My brothers punch me.", "worrying"],
    ["My sister's boyfriend kicks me.", "worrying"],
    ["My dad kicks me when he is mad.", "worrying"],
    // A thing that could hurt anyone is not a threat
    ["The thorns were so sharp they could stab you.", "worrying"],
    ["The icicle was so pointy it could stab you.", "sensitive-words"],
    ["That storm was so wild it might kill you.", "sensitive-words"],
    ["I could stab you.", "worrying"],
    ["He could kill you.", "worrying"],
  ]);
});

describe("the review: die and dying as figures of speech", () => {
  check([
    ["I would die for a hot chocolate.", "pass"],
    ["I could die of cold!", "pass"],
    ["Did you die in the game?", "pass"],
    ["I'm dying, it's so cold!", "pass"],
    ["I'm dying to go sledding!", "pass"],
    ["I want to die my hair blue.", "pass"],
    // Hyperbole, but the same words as wanting to die: read first
    ["The pizza was so good I wanted to die.", "sensitive-words"],
    ["I want to die.", "worrying"],
  ]);
});

describe("the review: unkind, and pets and characters", () => {
  check([
    ["Ella is a pig.", "unkind"],
    ["Max has no friends because he's weird.", "unkind"],
    ["Noah smells like a dog.", "unkind"],
    ["Liam is a baby who cries.", "unkind"],
    ["Everybody laughs at Kayla.", "unkind"],
    ["No one wants to sit with Priya.", "unkind"],
    ["Ava is a freak.", "unkind"],
    ["Ethan is a nerd and a geek.", "unkind"],
    ["Mia's lunch looks like vomit.", "unkind"],
    ["Ben can't even read, what a dummy.", "unkind"],
    ["Kai's teeth are yellow and gross.", "unkind"],
    ["Omar is a terrorist.", "unkind"],
    ["Wei eats dogs.", "unkind"],
    ["Black people are bad.", "unkind"],
    ["Girls are dumb.", "unkind"],
    ["Mexicans are dirty.", "unkind"],
    ["You're a dumbass.", "unkind"],
    ["He's so ugly.", "unkind"],
    ["They're so dumb.", "unkind"],
    ["liam is stupid", "unkind"],
    ["LIAM IS STUPID", "unkind"],
    ["Sophie's mum is poor.", "unkind"],
    ["My cat Luna is fat and fluffy.", "pass"],
    ["My hamster Max is weird and funny.", "pass"],
    ["Pikachu is fat and yellow.", "pass"],
    ["Godzilla is so ugly and scary.", "pass"],
    ["Emma's snowman was fat and round.", "pass"],
    ["Ava's hat is weird but cool.", "pass"],
    ["Emma said the lunch was gross.", "pass"],
    ["Liam was poor at sledding but he tried.", "pass"],
  ]);
});

describe("the review: other scripts, and sentences with no words", () => {
  check([
    ["我想死", "not-english"],
    ["外面很冷。", "not-english"],
    ["أريد أن أموت", "not-english"],
    ["Я хочу умереть", "not-english"],
    ["Gusto ko nang mamatay.", "worrying"],
    ["Eu quero morrer.", "worrying"],
    ["💀", "not-english"],
    ["🔪🩸😈", "not-english"],
    ["", "not-english"],
    // A Cyrillic letter in an English word is read as ours
    ["Thе snow is so cold today.", "pass"],
  ]);
});

describe("the review: children still learning to spell", () => {
  check([
    ["I wos so cowld.", "pass"],
    ["The trees wer frozn.", "pass"],
    ["I shivred and shaked.", "pass"],
    ["The piza was yumy and chesy.", "pass"],
    ["I yawnd and yawnd.", "pass"],
    ["Ther wos ise on the rod.", "pass"],
    ["Mi teeth wer chatring and mi hans wer numm.", "pass"],
    ["Mi hans wer cold.", "pass"],
  ]);
});

describe("the review: personal details", () => {
  check([
    ["I go to Westfield School.", "personal-details"],
    ["My house is 47 Birch Crescent.", "personal-details"],
    ["I live in apartment 4B on Main.", "personal-details"],
    ["Call me on five five five one two three four.", "personal-details"],
    ["I am eight years old.", "personal-details"],
    ["my phone is 5551234", "personal-details"],
    ["Room 12 was freezing.", "pass"],
    ["I counted 1 2 3 4 5 6 7 8 snowflakes.", "pass"],
    ["We played on Switch all day.", "pass"],
    ["Follow me to the snow fort!", "pass"],
    ["Add me to the snowball team.", "pass"],
    ["My phone is about to die.", "pass"],
    ["We went to Sunday School in the snow.", "pass"],
  ]);
});

describe("held on purpose, though they may be harmless", () => {
  check([
    // "hell" and "ass" are on our own list of bad words: a teacher's glance
    // costs less than a word list that lets them through
    ["The hell hound in the game roared.", "unsafe-words"],
    ["The ass brayed in the barn.", "unsafe-words"],
    // Said for fun, but the same words as "I wish I could die"
    ["I was so tired I could die.", "sensitive-words"],
    // A classroom number with "in", "from", "to": where a child is
    ["We are in room 5 and it smells like crayons.", "personal-details"],
    // "bully" is read first only with "me" near it (see the bullying rows)
    ["The bully in the book learned to be kind.", "pass"],
    // A cut arm is usually a fall, but sometimes isn't
    ["I cut my arm on a branch.", "worrying"],
    // A child's age, even a pet's, is a detail a teacher should see first
    ["My dog is 5 years old.", "personal-details"],
    // The games a child can be found on (not consoles: "We played on Switch")
    ["We played on Fortnite all day.", "personal-details"],
  ]);
});

// Families of wordings: each mechanism with wordings unlike the rows above,
// so a rule that matched one sentence only would fail here
describe("families: people however they're written", () => {
  check([
    ["My dady hits me when he is mad.", "worrying"],
    ["My step dad slaps me.", "worrying"],
    ["My step-dad punches my mom.", "worrying"],
    ["My uncles touch me.", "worrying"],
    ["The big kids kick me every day.", "worrying"],
    ["The man next door touched me.", "worrying"],
    ["A grown up touched me in my underwear.", "worrying"],
    ["My 2 brothers punch me.", "worrying"],
    ["My two big brothers beat me up.", "worrying"],
    ["My mumy hits my baby sister.", "worrying"],
    ["Our neighbour hurts me.", "worrying"],
    ["The grownups at home hit me with a wooden spoon.", "worrying"],
    ["My brothers and I raced our sleds to the bottom of the hill.", "pass"],
    ["My step mom braided my hair before school.", "pass"],
    ["The man next door shovelled our driveway.", "pass"],
    ["My 2 brothers built a fort out of snow.", "pass"],
    ["I kicked my brother's ball over the fence.", "pass"],
  ]);
});

describe("families: the whole sentence, end marks and spelled-out letters", () => {
  check([
    ["I will bring dads gun and shoot everyone in class.", "worrying"],
    ["I get hit a lot by my mom.", "worrying"],
    ["My dad always comes home angry and then he hits me.", "worrying"],
    ["I really really want to go and kill him.", "worrying"],
    ["I want to kill. Myself.", "worrying"],
    ["I want. To die.", "worrying"],
    ["I want to die. Really. Today.", "worrying"],
    ["i w a n t t o d i e", "worrying"],
    ["k i l l m e", "worrying"],
    ["My teacher hit the bell and everyone ran inside.", "pass"],
    ["Dad slammed the car door because his hands were full.", "pass"],
  ]);
});

describe("families: being hurt, and touched", () => {
  check([
    ["Dad slammed me into the door.", "worrying"],
    ["Mom pulls my hair really hard.", "worrying"],
    ["He dragged me by my arm.", "worrying"],
    ["My stepmom puts me in the basement.", "worrying"],
    ["My mom locks me in the cupboard when I'm bad.", "worrying"],
    ["Dad makes me kneel on rice.", "worrying"],
    ["My dad chokes me.", "worrying"],
    ["I keep getting slapped by my stepfather.", "worrying"],
    ["My uncle beated me with a belt.", "worrying"],
    ["Kids push me down at recess every day.", "worrying"],
    ["Kids at school push me into the lockers every day.", "worrying"],
    ["My uncle kissed me on the lips.", "worrying"],
    ["My coach kisses me on the lips after practice.", "worrying"],
    ["He gets in bed with me.", "worrying"],
    ["He comes in at night.", "worrying"],
    ["My uncle comes in my bed at night.", "worrying"],
    ["My uncle takes photos of me in the bathtub.", "worrying"],
    ["The babysitter takes pictures of me in the shower.", "worrying"],
    ["He put his hand in my underwear.", "worrying"],
    ["He made me sit on his lap and touched my leg under my skirt.", "worrying"],
    ["My cousin dragged me to the sledding hill.", "pass"],
    ["Dad threw me up in the air and caught me.", "pass"],
    ["My grandpa kissed me on the cheek.", "pass"],
    ["Grandma takes photos of me in my new coat.", "pass"],
    ["My mom took pictures of me building a snowman.", "pass"],
    ["Mom put me in the bath and the bubbles tickled.", "pass"],
    ["My sister pulled my hair when we played, then said sorry.", "pass"],
    ["Grandpa locked the shed so the goats couldn't get out.", "pass"],
    ["Every day the kids at recess play tag with me.", "pass"],
  ]);
});

describe("families: hurting themselves, eating, and wanting to die", () => {
  check([
    ["I cut my leg on purpose.", "worrying"],
    ["I cuting my arms.", "worrying"],
    ["I cut my tummy with a pencil sharpener blade.", "worrying"],
    ["I use a sharpener blade on my skin.", "worrying"],
    ["I bit myself until I bled.", "worrying"],
    ["I want to take all the pills.", "worrying"],
    ["I'm going to swallow all the pills in the cupboard.", "worrying"],
    ["There is a rope in my closet for me.", "worrying"],
    ["I should not exist.", "worrying"],
    ["I wish I didnt exist.", "worrying"],
    ["My family would be happy without me.", "worrying"],
    ["My family would be better off if I was gone.", "worrying"],
    ["Nobody would notice if I died.", "worrying"],
    ["If I was dead nobody would care.", "worrying"],
    ["I think about how to die.", "worrying"],
    ["I am tired of living.", "worrying"],
    ["I'm tired of being alive.", "worrying"],
    ["Bye forever everyone.", "worrying"],
    ["Bye everyone forever.", "worrying"],
    ["Everything is pointless.", "worrying"],
    ["I deserve to die.", "worrying"],
    ["I deserve to be dead.", "worrying"],
    ["I want too die.", "worrying"],
    ["I dont deserve to be here.", "worrying"],
    ["I skip meals so I lose weight.", "worrying"],
    ["I don't eat lunch so I can be skinny.", "worrying"],
    ["I throw up so I can lose weight.", "worrying"],
    ["I cut my finger on a sheet of paper.", "pass"],
    ["I scratched my arm on the rose bush.", "pass"],
    ["I skipped breakfast because I woke up late.", "pass"],
    ["My grandma said I was too skinny and gave me more soup.", "pass"],
    ["I'm tired of this snow, it's been weeks.", "pass"],
    ["Goodbye forever, old sneakers!", "pass"],
    ["Nobody noticed the tiny snowflake on my nose.", "pass"],
    ["I feel fat after Thanksgiving dinner, haha.", "pass"],
  ]);
});

describe("families: not looked after", () => {
  check([
    ["There is never any food in our house.", "worrying"],
    ["We never have food in the house.", "worrying"],
    ["I am always hungry at home.", "worrying"],
    ["I havent ate since monday.", "worrying"],
    ["I haven't ate in two days.", "worrying"],
    ["I am alone all night.", "worrying"],
    ["My mom leaves me alone for days.", "worrying"],
    ["Mom leaves me alone at home all night.", "worrying"],
    ["There was no snow at the park so we went home.", "pass"],
    ["We were always hungry after swimming.", "pass"],
    ["I left my gloves at home and my fingers froze.", "pass"],
  ]);
});

describe("families: grooming on apps and games is worrying", () => {
  check([
    ["A guy on snapchat wants a selfie with no shirt.", "worrying"],
    ["My discord friend is nineteen and says I'm special.", "worrying"],
    ["Someone on tiktok said keep it a secret from my mom.", "worrying"],
    ["A man on roblox gives me robux for photos.", "worrying"],
    ["My online boyfriend is twenty five.", "worrying"],
    ["A guy on instagram asked for a picture of me in my pajamas.", "worrying"],
    ["My friend on roblox is thirty and said I'm really mature.", "worrying"],
    ["Someone on discord sends me presents and says it's our secret.", "worrying"],
    ["The online game crashed and I lost my level.", "pass"],
    ["We played Roblox together after school.", "pass"],
    ["I asked my mom for a picture of her when she was little.", "pass"],
  ]);
});

describe("families: threats", () => {
  check([
    ["I will burn your house down.", "worrying"],
    ["I'm going to burn down my teacher's house.", "worrying"],
    ["I'm gonna smash his face.", "worrying"],
    ["I will smash her face in.", "worrying"],
    ["I'm going to shoot the school up.", "worrying"],
    ["I want to murder that kid.", "worrying"],
    ["I want to murder everyone in my class.", "worrying"],
    ["I will chop your head off.", "worrying"],
    ["I'm gonna cut her head off.", "worrying"],
    ["I'll cut his throat.", "worrying"],
    ["I'm gonna beat up Liam tomorrow.", "worrying"],
    ["I'm going to take my dads knife and stab the boys who laugh at me.", "worrying"],
    ["We burned marshmallows over the campfire.", "pass"],
    ["The villain in the story wanted to destroy the city.", "pass"],
    ["I could kill for a slice of pizza right now.", "pass"],
    ["The game was so hard I wanted to throw my controller.", "pass"],
  ]);
});

describe("families: bullying, drugs at home, other languages, details", () => {
  check([
    ["They take my lunch money.", "worrying"],
    ["They call me the n word.", "worrying"],
    ["They keep calling me fat and ugly.", "worrying"],
    ["Mason is a monkey.", "unkind"],
    ["My mom has needles at home.", "sensitive-words"],
    ["Dad smokes stuff from a pipe.", "sensitive-words"],
    ["My dad smokes something from a little glass pipe.", "sensitive-words"],
    ["Mom drinks and falls asleep on the floor.", "sensitive-words"],
    ["Mom drinks wine and passes out on the floor.", "sensitive-words"],
    ["Mi papá me pega con el cinturón.", "worrying"],
    ["Mi mamá me golpea.", "worrying"],
    ["Chcę umrzeć.", "worrying"],
    ["Main marna chahta hoon.", "worrying"],
    ["Text me on 07911 123456.", "personal-details"],
    ["My tag is SamCool99.", "personal-details"],
    ["add me samcool123", "personal-details"],
    ["The gale pushed the flowers around like a bully.", "pass"],
    ["The bully in the story said sorry.", "pass"],
    ["My dad smokes the ribs on the grill all day.", "pass"],
    ["We drank hot chocolate and fell asleep on the couch.", "pass"],
    ["Add me to the snowball team.", "pass"],
  ]);
});
