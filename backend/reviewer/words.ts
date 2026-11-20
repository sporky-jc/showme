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
  "heroin", "vodka", "whiskey", "vape", "vaping", "phuck", "paki",
];

// Bad words that can't turn up inside an ordinary word, looked for inside
// each written word with symbols removed ("f.u.c.k.i.n.g", "shitstorm")
export const UNSAFE_INSIDE = ["fuck", "shit", "cunt", "bitch", "porn", "asshole", "motherf"];

// Signs a child may be hurting or in danger, as phrases: held for a person,
// flagged so the teacher can follow up (not only reject the sentence). Each
// phrase is matched on the sentence as written and on its plain reading
// (rules.ts: "wanna" read as "want to", "don't" as "dont", "k y s" and
// "d-i-e" joined up, "kil" and "myslef" read as "kill" and "myself"), so
// one spelling of each is enough. "$" stands for the end of a sentence.
export const WORRYING_PHRASES = [
  // Wanting to die, or not to be here
  "kill myself", "killing myself", "kill my self", "kms", "kys", "kill yourself", "kill me",
  "want to die", "wanna die", "want to be dead", "want to dead", "want to death",
  "wish i was dead", "wish i were dead", "better off dead", "should just die", "i should die",
  "deserve to die", "hurt myself", "hurting myself", "hurt my self", "cut myself",
  "cutting myself", "cut my self", "suicide", "suicidal", "unalive", "end my life", "end it all",
  "end it tonight", "going to end it", "want to end it", "want it to end", "want it all to end",
  "don't want to be alive", "do not want to be alive", "don't want to live", "do not want to live",
  "don't want to exist", "want to stop existing", "wish i didn't exist", "wish i wasn't alive",
  "wish i was not alive", "wish i weren't alive", "wasn't alive", "not be alive",
  "wish i wasn't here", "wish i was not here", "wish i weren't here", "wish i wasn't born",
  "don't deserve to live", "do not deserve to live", "don't deserve to be alive",
  "no reason to live", "nothing to live for", "done with life", "done with living",
  "goodbye forever", "life is pointless", "life is meaningless", "no point in living",
  "point of living", "never wake up", "don't want to wake up", "can't go on",
  "can't take it anymore", "happier without me", "better without me", "better off without me",
  "nobody would miss me", "no one would miss me", "nobody loves me", "no one loves me",
  "nobody likes me", "no one likes me", "nobody cares about me", "no one cares about me",
  "i have no friends", "nobody talks to me", "no one talks to me", "nobody plays with me",
  "no one plays with me", "nobody at home talks to me", "no one at home talks to me",
  "nobody at school talks to me", "no one at school talks to me", "hate myself", "hate my self", "i hate my life", "sad all the time",
  "cry every night", "cry myself to sleep", "scared to go home", "afraid to go home",
  "never born", "want to disappear", "wanna disappear", "want to run away",
  // Hurting themselves, and eating ("I cut my arm" is checked in rules.ts)
  "self harm", "self harming", "keep cutting $", "keep cutting myself", "started cutting",
  "cutting again", "made myself bleed", "make myself bleed", "overdose", "took all of mom's pills",
  "took all the pills", "took all my pills", "swallowed pills", "purge", "purging", "purged",
  "haven't eaten in", "have not eaten in", "not eaten in", "haven't eaten for", "didn't eat for",
  "i stopped eating", "i stop eating", "ive stopped eating", "starve myself", "starving myself", "make myself throw up",
  "made myself throw up", "make myself sick", "made myself sick", "throw up after i eat",
  "anorexic", "anorexia", "bulimic", "bulimia",
  // Being bullied
  "bully me", "bullies me", "bullied me", "bullying me", "make fun of me", "made fun of me",
  "makes fun of me", "pick on me", "picks on me", "picked on me", "call me fat", "called me fat",
  "call me ugly", "called me ugly", "call me stupid", "called me stupid", "call me names",
  "called me names",
  // Someone doing something to them. (Someone hitting, kicking or touching
  // the child is checked in rules.ts, only with a person doing it: "the
  // cold wind hits me" is a Show sentence.)
  "touched me there", "comes into my room at night", "comes in my room at night",
  "into my room at night", "into my bed at night", "makes me keep secrets",
  "makes me keep a secret", "make me keep secrets", "our little secret", "our secret $", "its our secret", "keep our secret",
  "don't tell anyone what we", "don't tell anyone", "don't tell your mom",
  "don't tell your parents", "not to tell my mom", "not to tell my dad", "not to tell my parents",
  "not to tell anyone", "told me not to tell", "said not to tell", "showed me his",
  "showed me her", "show me his", "private parts", "private part", "privates", "private area",
  "hand in my pants", "hands in my pants", "hand down my pants", "hands down my pants",
  "molest", "molested", "molests", "raped", "rape", "i am pregnant", "i'm pregnant",
  // Strangers and people online
  "man online", "guy online", "someone online", "stranger online", "online friend",
  "friend online", "met online", "met him online", "met her online", "wants to meet me",
  "want to meet me", "wants to meet up", "send photos of yourself", "send pics of yourself",
  "send me pics", "send me photos", "send me pictures", "send me a picture", "send me a pic",
  "pics of you", "photos of you", "pictures of you", "stranger messaged", "messaged me and said",
  // Not looked after
  "no food at home", "no food in the house", "nothing to eat at home",
  "nothing to eat in the house", "sleep in the car", "sleep in our car", "slept in the car",
  "live in our car", "live in the car", "home alone every day", "home alone every night",
  "home alone all day", "home alone all night", "nobody feeds me", "no one feeds me",
  "nobody takes care of me", "nobody picks me up",
  // Hurting others (killing, shooting or stabbing a person is checked in
  // rules.ts too: "I want to kill my teacher")
  "kill you", "kill them", "kill him", "kill her", "shoot you", "shoot them", "stab",
  "stabbed", "school shooting", "shoot up the school", "shoot up my school", "shoot up our school",
  "shoot up the class", "shooting up the school", "bring a gun", "bring a knife",
  "bring my dad's gun", "gun to school", "knife to school", "blow up the school",
  "bomb the school", "cut your head off", "cut his head off", "cut her head off",
  "cut off your head", "cut off his head", "cut off her head", "slit his throat",
  "slit her throat", "slit your throat", "slit my throat", "slit their throat", "beat him up",
  "beat her up", "beat you up", "beat them up", "want her dead", "want him dead",
  "want them dead", "want you dead", "wish you were dead", "wish he was dead",
  "wish she was dead", "hope you die", "hope he dies", "hope she dies", "hope they die",
];

// Words in other languages a person should read first. A sentence that is
// mostly not English is held anyway (rules.ts); these say why.
export const FOREIGN_WORRYING = [
  // Spanish, French and German: to die, to kill (myself), suicide
  "morir", "morirme", "muero", "matar", "matarme", "matame", "suicidio", "suicidarme",
  "mourir", "tuer", "suicider", "sterben", "toten", "umbringen",
];
export const FOREIGN_UNSAFE = [
  "mierda", "puta", "puto", "joder", "pendejo", "pendeja", "cabron", "merde", "putain",
  "scheisse",
];
export const FOREIGN_SENSITIVE = ["muerte", "drogas", "droga", "desnudo", "desnuda", "desnudos"];

// Words that, in a sentence a child wrote, a person should read before any
// AI does or it's sent back: held for a person (a "sensitive" hold, quieter
// than "worrying"). Always held, wherever they are.
export const SENSITIVE_WORDS = [
  "suicide", "abuse", "abused", "abusing", "hopeless", "worthless", "bully", "bullied",
  "bullies", "bullying", "pregnant", "cigarette", "cigarettes", "cigs", "cigar", "alcohol",
  "drugs", "marijuana", "stoned", "hungover", "tipsy",
  // Not "dead", "died", "hurt", "blood", "knife", "alone", "kill", "lonely",
  // "gun" or "die" on their own: "dead leaves", "the fire died down",
  // "blood orange", "butter knife", "I sat alone by the window", "the cold
  // was killing me", "the lonely tree", "the hunter had a gun" and "we
  // watched Die Hard" are everyday Show sentences. Those are held only with
  // a person near them (rules.ts), and the phrases above cover the worrying
  // uses ("want to be dead", "hurt myself").
];

// Phrases a person should read first: bodies, kissing and undressing,
// alcohol, smoking and drugs (a "sensitive" hold). Matched like the
// worrying phrases.
export const SENSITIVE_PHRASES = [
  "took off her clothes", "took off his clothes", "took off their clothes",
  "took off my clothes", "take off your clothes", "take off her clothes", "take off my clothes",
  "without clothes", "without any clothes", "no clothes on", "kissed her all over",
  "kissed him all over", "made out with", "made out under", "made out in", "made out on",
  "made out $", "making out", "make out with", "hand in her pants", "hand in his pants",
  "smoke weed", "smokes weed", "smoked weed", "smoking weed", "smoked a blunt",
  "smoke a blunt", "smoking a blunt", "smoked a joint", "high on pills", "high on drugs",
  "high on weed", "got high", "gets high", "getting high", "was drunk", "is drunk", "got drunk",
  "gets drunk", "getting drunk", "drunk again", "so drunk", "very drunk", "drank wine",
  "drinks wine", "drinking wine", "took pills",
];

// Unkind about someone: bullying and insults (an "unkind" hold). These
// phrases are held wherever they are; the words below only just after a
// person ("Liam is so fat", "you are ugly"), see rules.ts.
export const UNKIND_PHRASES = [
  "loser", "losers", "crybaby", "cry baby", "fatso", "fatty", "nobody likes you",
  "no one likes you", "nobody likes him", "nobody likes her", "everyone hates you",
  "everyone hates him", "everyone hates her", "everyone hates them", "everybody hates you",
  "everybody hates him", "everybody hates her", "wets the bed", "so gay", "is gay", "that's gay", "you're gay", "ur gay",
  "go back to your country", "go back where you came from", "hitler", "nazi", "nazis", "heil",
  "you suck", "you idiot", "idiot", "moron", "n word",
];
// Unkind words about a person, held when they come just after one ("Liam
// is so fat", "she is dumb", "Mia's mom is poor"); "the fat snowman" and
// "the poor puppy" are fine
export const UNKIND_WORDS = [
  "stupid", "dumb", "ugly", "fat", "gross", "weird", "lame", "poor", "smelly", "stinky",
  "disgusting", "annoying", "jerk", "dork", "gay", "loser", "idiot", "crybaby",
];
// Words that, just after a classmate's name, a person should read first:
// about their body, or blaming them ("It was Liam's fault")
export const BODY_OR_BLAME_WORDS = [
  "fat", "skinny", "butt", "bum", "fault", "blame", "blamed", "snitch", "tattletale",
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
  // Games, channels and apps where a child can be found
  "on fortnite", "on minecraft", "on xbox", "on playstation", "on switch", "on youtube",
  "my youtube", "my yt", "my channel", "subscribe to", "whatsapp", "facetime me", "my user",
  "my user is", "my handle",
  // Where and when they live and were born
  "zip code", "zipcode", "postcode", "post code", "my birthday is", "my bday is", "my b day is",
  "i was born on",
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
  "percy jackson", "luke skywalker", "darth vader", "han solo", "princess leia", "baby yoda",
  "big bird", "cookie monster", "sonic the hedgehog", "taylor swift",
];

// US states, and their two-letter codes: a town and its state ("Springfield,
// Ohio", "Austin, TX") say where a child lives (rules.ts)
export const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas",
  "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah",
  "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
];
