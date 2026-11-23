import type { SenseKey } from "../senses";

// A made-up test set for the sense words (S2 of tasks/sense-words-plan.md):
// Show sentences like the ones kids in grades 4 to 7 write, each with the
// senses a teacher would see in it. None is a real student's sentence. Some
// use the kinds of words production showed the list missing (stench,
// rotting, wailed, frigid, scorching, cozy, vibrant), and some only tell, so
// they should light up nothing.
//
// Label what a teacher would see, not what the list finds today: the score
// in senseScore.test.ts is how close the list gets.

// `senses` are the ones a teacher would see ("must"); `may` are judgment
// calls, added from test/senseMay.ts, that count neither way
export type Labeled = { show: string; senses: readonly SenseKey[]; may?: readonly SenseKey[] };

const set = (show: string, ...senses: SenseKey[]): Labeled => ({ show, senses });

export const SENSE_SET: readonly Labeled[] = [
  // See
  set("The sky turned orange and pink as the sun slid behind the hills.", "see"),
  set("Her braces sparkled when she smiled for the camera.", "see"),
  set("A gray cloud swallowed the moon, and the yard went dark.", "see"),
  set("Fireflies blinked like tiny lanterns over the grass.", "see"),
  set("The ocean was a sheet of glittering blue glass.", "see"),
  set("My little brother stared at the cake with huge eyes.", "see"),
  set("Golden leaves drifted down and covered the sidewalk.", "see"),
  set("The vibrant mural had purple dragons and green castles.", "see"),
  set("Shadows stretched across the gym floor as the lights flickered.", "see"),
  set("His face went pale, and his hands hid behind his back.", "see"),
  set("The fog was so thick I could only see the glow of one streetlight.", "see"),
  set("Bright red ribbons fluttered on every booth at the fair.", "see"),

  // Hear
  set("The crowd roared when the ball sailed over the fence.", "hear"),
  set("Thunder boomed, and the windows rattled in their frames.", "hear"),
  set("My baby sister wailed until Mom picked her up.", "hear"),
  set("Dad was snoring so loudly the dog left the room.", "hear"),
  set("The floorboards creaked under my feet at midnight.", "hear"),
  set("Everyone was whispering, and then the teacher cleared her throat.", "hear"),
  set("The fire alarm screeched, and we covered our ears.", "hear"),
  set("Rain drummed on the tin roof all night long.", "hear"),
  set("The kettle hissed and whistled on the stove.", "hear"),
  set("Our cat purred like a tiny motor on my lap.", "hear"),
  set("Kids were yelling and laughing all over the playground.", "hear"),
  set("The bus brakes squealed, and the doors banged open.", "hear"),
  set("Nobody made a sound when the principal walked in.", "hear"),
  set("Crash! The tower of blocks hit the floor.", "hear"),

  // Feel
  set("The frigid wind bit my cheeks on the walk to school.", "feel"),
  set("The scorching sand burned the bottoms of my feet.", "feel"),
  set("I was trembling so much my pencil wobbled.", "feel"),
  set("The puppy's fur was soft as a cloud.", "feel"),
  set("Sweat dripped down my back during the mile run.", "feel"),
  set("My blanket was warm and cozy on the cold couch.", "feel"),
  set("The slimy worm wiggled across my palm.", "feel"),
  set("Goosebumps popped up all over my arms.", "feel"),
  set("My sunburn stung every time my shirt touched it.", "feel"),
  set("The ice was so slippery I landed on my knees.", "feel"),
  set("My backpack felt like it was full of bricks.", "feel"),
  set("Grandpa's hand was rough and dry when he held mine.", "feel"),
  set("The hot cocoa warmed my frozen fingers.", "feel"),

  // Smell
  set("The stench of rotting garbage filled the alley.", "smell"),
  set("Fresh bread smelled so good I followed it to the kitchen.", "smell"),
  set("Smoke from the campfire stuck to my hoodie for days.", "smell"),
  set("His gym bag stank like old cheese.", "smell"),
  set("The roses had a sweet perfume that filled the porch.", "smell"),
  set("I got a whiff of popcorn the second the theater door opened.", "smell"),
  set("Wet dog and muddy shoes made the car smell awful.", "smell"),
  set("The musty basement made me sneeze.", "smell"),

  // Taste
  set("The lemonade was so sour my whole face scrunched up.", "taste"),
  set("The chips were salty and crunchy.", "taste"),
  set("I took one bite of the spicy salsa and gulped my water.", "taste"),
  set("The juicy peach dripped sweet juice down my chin.", "taste"),
  set("The medicine tasted like bitter chalk.", "taste"),
  set("We slurped noodles until our bowls were empty.", "taste"),
  set("The cotton candy melted on my tongue like sugar snow.", "taste"),
  set("The pizza was cheesy and greasy and perfect.", "taste"),

  // More than one sense
  set("Bacon sizzled in the pan and smelled amazing.", "hear", "smell"),
  set("The milk tasted sour, and the carrots smelled like an old gym bag.", "taste", "smell"),
  set("The fireworks boomed, and bright colors exploded across the sky.", "hear", "see"),
  set("Icy rain stung my face as thunder rumbled overhead.", "feel", "hear"),
  set("Purple flowers lined the path, and the air smelled sweet.", "see", "smell"),
  set("The soup was lava, and my tongue sizzled like bacon.", "feel", "hear"),
  set("Frost crunched under my boots, and my ears were freezing.", "hear", "feel"),
  set("Every step felt like a sharp pin, and I bit my lip so I wouldn't cry.", "feel"),
  set("The sidewalk shimmered, and my ice cream melted before I could take a bite.", "see", "taste"),
  set("Garlic filled the kitchen, and the buttery noodles tasted salty and warm.", "smell", "taste", "feel"),
  set("The marching band blasted trumpets while confetti rained down.", "hear", "see"),
  set("My dog licked my face with his warm, slobbery tongue.", "feel"),
  set("The campfire crackled, and smoke made my eyes water.", "hear", "smell", "feel"),
  set("Waves crashed on the rocks, and salty spray hit my lips.", "hear", "taste", "feel"),
  set("The cafeteria was loud and smelled like burnt toast.", "hear", "smell"),
  set("The leather seat was hot and sticky against my legs.", "feel"),
  set("A rainbow arched over the wet field after the storm.", "see", "feel"),
  set("The baby giggled and grabbed my nose with her sticky fingers.", "hear", "feel"),
  set("Popcorn popped in the microwave, and the buttery smell drifted down the hall.", "hear", "smell"),
  set("My friend whispered a secret, and her breath smelled like mint.", "hear", "smell"),

  // Only tells: a teacher sees no sense
  set("The party was fun."),
  set("She was very happy."),
  set("It was a great day at the beach."),
  set("His room is messy."),
  set("The house is very small."),
  set("My dog is scared of storms."),
  set("We were tired after the game."),
  set("He was mad at his brother."),
  set("The test was really hard."),
  set("I was nervous before the show."),
  set("The movie was boring."),
  set("He is late, and his train just left."),
  set("Our teacher was proud of us."),
  set("The puppy was cute and tiny."),
  set("I was feeling sad about the lost game."),
  set("The singer was famous all over the world."),
  set("She was the best player on the team."),
  set("I like my new shoes a lot."),
  set("Grandma is the nicest person I know."),
  set("Math is my favorite subject."),
  set("The trip was too long."),
  set("My cousin is really smart."),
];
