// Word lists for the rule checks (rules.ts). All lower case; a phrase is
// words separated by single spaces, matched as whole words. Extend freely:
// a false alarm only holds a sentence for a person to read, so when in doubt,
// add the word. (Never add an ordinary word kids use in Show sentences, like
// "beer" in "root beer" or "naked" in "naked trees": the teacher reads those.)

// Bad language and adult words: held for a person, never sent to an AI
export const UNSAFE_WORDS = [
  "fuck", "fucking", "fucked", "fucker", "fuckin", "motherfucker", "fk", "fuk", "fck",
  "fuc", "fking", "fkn", "sht", "shit", "shitty", "biatch",
  "bullshit", "bitch", "bitches", "bastard", "asshole", "ass", "arse", "dick", "dickhead",
  "cunt", "pussy", "piss", "pissed", "damn", "dammit", "damnit", "goddamn", "crap", "hell",
  "wtf", "stfu", "omfg", "slut", "whore", "porn", "porno", "sex", "sexy", "nude", "nudes",
  "boobs", "tits", "penis", "vagina", "horny", "dildo", "condom", "cocaine", "meth",
  "heroin", "vodka", "whiskey", "vape", "vaping",
];

// Bad words that can't turn up inside an ordinary word, looked for inside
// each written word with symbols removed ("f.u.c.k.i.n.g", "shitstorm")
export const UNSAFE_INSIDE = ["fuck", "shit", "cunt", "bitch", "porn", "asshole", "motherf"];

// Signs a child may be hurting or in danger, as phrases: held for a person,
// flagged so the teacher can follow up (not only reject the sentence)
export const WORRYING_PHRASES = [
  "kill myself", "killing myself", "kill my self", "kms", "kys", "kill me", "want to die",
  "wanna die", "want to be dead", "wish i was dead", "wish i were dead", "better off dead",
  "hurt myself", "hurting myself", "hurt my self", "cut myself", "cutting myself",
  "cut my self", "suicide", "suicidal", "unalive", "end my life", "end it all",
  "don't want to be alive", "dont want to be alive", "do not want to be alive",
  "don't want to live", "dont want to live", "nobody would miss me", "no one would miss me",
  "nobody loves me", "no one loves me", "nobody likes me", "no one likes me",
  "nobody cares about me", "no one cares about me", "i have no friends", "hate myself",
  "hate my self", "i hate my life", "scared to go home", "afraid to go home",
  "touched me there", "never born", "want to disappear", "wanna disappear",
  "want to run away", "bully me", "bullies me", "bullied me", "bullying me",
  // (Someone hitting, kicking or touching the child is checked in rules.ts,
  // only with a person doing it: "the cold wind hits me" is a Show sentence.)
  "kill you", "kill them", "kill him", "kill her", "shoot you", "shoot them", "stab",
  "stabbed", "school shooting",
];

// Words that, in a sentence a child wrote, a person should read before any
// AI does or it's sent back: held for a person (a "sensitive" hold, quieter
// than "worrying"). They catch what the phrase list above can't spell out
// ("I want 2 die", "I wish I could die"); a "dead leaves" sentence held
// here costs only a teacher's glance.
export const SENSITIVE_WORDS = [
  "die", "dying", "death", "kill", "killed", "killing", "suicide", "abuse", "abused",
  "bleeding", "gun", "guns", "lonely", "hopeless", "worthless", "bully", "bullied",
  "bullies", "bullying",
  // Not "dead", "died", "hurt", "blood", "knife" or "alone": "dead leaves",
  // "the fire died down", "blood orange", "butter knife" and "I sat alone by
  // the window" are everyday Show sentences. The phrases above cover the
  // worrying uses ("want to be dead", "hurt myself").
];

// Personal details, as phrases (emails, links, numbers, addresses and names
// are patterns in rules.ts): held for a person, never sent to an AI
export const PERSONAL_PHRASES = [
  "my name is", "my name's", "my names", "my full name", "my last name", "i'm called",
  "im called", "my address", "i live at", "i live on", "my house is on", "my phone",
  "my number", "my cell", "my email", "my e mail", "my password", "call me at",
  "text me", "my school is", "i go to school at", "my snapchat", "my snap", "my insta",
  "my instagram", "my tiktok", "my discord", "my roblox", "my minecraft", "my fortnite",
  "my username", "my user name", "my gamertag", "my account", "add me", "find me on",
  "follow me", "dm me", "message me", "on roblox", "on discord", "on snapchat",
  "on instagram", "on tiktok", "on insta", "on snap", "underscore", "gmail", "hotmail", "yahoo", "outlook", "icloud",
  "dot com", "dot net", "dot org", "elementary school", "middle school", "high school",
  "primary school",
];

// Common first names. One of these followed by a capitalized word ("Emma
// Johnson") is held as a full name; a first name alone is fine.
export const FIRST_NAMES = [
  "aaron", "abigail", "adam", "aiden", "alex", "alexander", "alice", "amelia", "andrew",
  "anna", "anthony", "aria", "ava", "avery", "benjamin", "brandon", "brooklyn", "caleb",
  "camila", "carlos", "carter", "charlotte", "chloe", "chris", "christopher", "daniel",
  "david", "dylan", "eleanor", "elijah", "elizabeth", "ella", "ellie", "emily", "emma",
  "ethan", "evelyn", "ezra", "gabriel", "grace", "hannah", "harper", "hazel", "henry",
  "isaac", "isabella", "jack", "jackson", "jacob", "james", "jayden", "jessica", "john",
  "jonathan", "jose", "joseph", "joshua", "josiah", "julian", "kevin", "layla", "leah",
  "leo", "levi", "liam", "lily", "logan", "lucas", "luke", "luna", "madison", "mason",
  "mateo", "matthew", "maya", "mia", "michael", "mila", "noah", "nora", "oliver", "olivia",
  "owen", "penelope", "riley", "ryan", "samuel", "sam", "sarah", "scarlett", "sebastian",
  "sofia", "sophia", "stella", "thomas", "victoria", "violet", "william", "wyatt", "zoe",
  "zoey", "ada", "maria", "juan", "luis", "ana", "sophie", "max", "ben", "tom",
  "kate", "katie", "lucy", "ruby", "jake", "josh", "nick", "tyler", "aisha", "fatima",
  "mohammed", "muhammad", "omar", "priya", "arjun", "wei", "mei", "yuki", "hiro",
];

// Made-up people and places kids write about, which look like a full name or
// an address: left out before the personal-details checks
export const PRETEND_NAMES = [
  "jack frost", "santa claus", "sesame street", "rainbow road", "yellow brick road",
  "brick road", "monster high", "abbey road", "easy street", "mr freeze", "olaf",
  // Story and cartoon characters, which read as a first and last name
  "peter pan", "harry potter", "hermione granger", "ron weasley", "captain hook",
  "tinker bell", "mickey mouse", "minnie mouse", "donald duck", "daisy duck",
  "buzz lightyear", "peppa pig", "winnie the pooh", "curious george", "bugs bunny",
  "daffy duck", "frosty the snowman", "spider man", "willy wonka", "alice in wonderland",
];
