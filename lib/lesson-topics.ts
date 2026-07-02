// Curated lesson-topic catalog for the Lesson Library.
//
// Instead of asking young students to type what they want to learn, each
// subject has a page of tappable topic categories, grouped into three bands
// (Elementary / Middle School / High School). Every student can see and try
// every band — the adaptive engine still pitches DIFFICULTY to the student's
// measured level, so a curious 3rd grader tapping "Physics" gets a gentle,
// accessible introduction rather than an AP problem set.
//
// Each category carries a set of "angles": specific sub-topics the generate
// route rotates through (excluding ones the student has already seen) so the
// same category produces a genuinely fresh lesson every time. This is also the
// fix for the "yet another monarch butterfly passage" problem.
//
// CONTENT RULE: everything in this file must be appropriate for elementary
// students. No sexual content or human/animal reproduction, no graphic
// violence, nothing scary or adult. War/history topics stay at the level of
// leaders, causes, daily life, and outcomes.

export type Band = "elementary" | "middle" | "high";

export interface TopicCategory {
  /** Shown on the tile and sent to the AI as the requested topic. */
  name: string;
  emoji: string;
  /** One kid-friendly line under the tile name. */
  description: string;
  /** Specific angles the AI rotates through for freshness. */
  angles: string[];
}

export interface SubjectMeta {
  /** Canonical subject name — must match lessons.subject / student_skill_tiers.subject. */
  name: string;
  slug: string;
  gradient: string;
  tagline: string;
}

export const SUBJECT_META: SubjectMeta[] = [
  {
    name: "Reading",
    slug: "reading",
    gradient: "linear-gradient(135deg, #028090, #02C39A)",
    tagline: "Pick what your story or article is about!",
  },
  {
    name: "Math",
    slug: "math",
    gradient: "linear-gradient(135deg, #7C3AED, #9F67FA)",
    tagline: "Pick a math skill to practice!",
  },
  {
    name: "Science",
    slug: "science",
    gradient: "linear-gradient(135deg, #0891B2, #06B6D4)",
    tagline: "Pick something amazing to explore!",
  },
  {
    name: "Spelling",
    slug: "spelling",
    gradient: "linear-gradient(135deg, #059669, #34D399)",
    tagline: "Pick a spelling pattern to master!",
  },
  {
    name: "History",
    slug: "history",
    gradient: "linear-gradient(135deg, #B45309, #D97706)",
    tagline: "Pick a time or place to travel to!",
  },
  {
    name: "Art",
    slug: "art",
    gradient: "linear-gradient(135deg, #DB2777, #F472B6)",
    tagline: "Pick something creative to learn about!",
  },
  {
    name: "Music",
    slug: "music",
    gradient: "linear-gradient(135deg, #4F46E5, #818CF8)",
    tagline: "Pick a sound to explore!",
  },
];

export function subjectBySlug(slug: string): SubjectMeta | undefined {
  return SUBJECT_META.find((s) => s.slug === slug.toLowerCase());
}

export const BAND_INFO: Record<Band, { label: string; blurb: string }> = {
  elementary: { label: "Explorer Topics", blurb: "Great for everyone — start here!" },
  middle: { label: "Adventurer Topics", blurb: "A step up — for when you want more." },
  high: { label: "Trailblazer Topics", blurb: "Big ideas for big thinkers." },
};

export const BAND_ORDER: Band[] = ["elementary", "middle", "high"];

/** Which band a student's grade-equivalent level lands in (for default expansion). */
export function bandForLevel(level: number): Band {
  if (level <= 5) return "elementary";
  if (level <= 8) return "middle";
  return "high";
}

/** Rough starting grade for a band — used to soften advanced topics for younger students. */
export const BAND_MIN_LEVEL: Record<Band, number> = {
  elementary: 0,
  middle: 6,
  high: 9,
};

export const TOPIC_CATALOG: Record<string, Record<Band, TopicCategory[]>> = {
  Math: {
    elementary: [
      {
        name: "Counting & Numbers",
        emoji: "🔢",
        description: "Count, compare, and know your numbers",
        angles: [
          "counting objects and skip counting",
          "comparing numbers (greater than, less than)",
          "place value: ones, tens, and hundreds",
          "even and odd numbers",
          "rounding numbers",
          "number patterns",
        ],
      },
      {
        name: "Addition",
        emoji: "➕",
        description: "Putting numbers together",
        angles: [
          "adding within 20",
          "two-digit addition",
          "adding with regrouping (carrying)",
          "three or more numbers at once",
          "addition word problems about animals",
          "addition word problems about sports and games",
          "missing-number addition puzzles",
        ],
      },
      {
        name: "Subtraction",
        emoji: "➖",
        description: "Taking numbers away",
        angles: [
          "subtracting within 20",
          "two-digit subtraction",
          "subtracting with regrouping (borrowing)",
          "fact families: how addition and subtraction connect",
          "subtraction word problems about food and treats",
          "finding the difference between two amounts",
        ],
      },
      {
        name: "Multiplication",
        emoji: "✖️",
        description: "Fast adding with groups",
        angles: [
          "multiplication as equal groups",
          "times tables 2s, 5s, and 10s",
          "times tables 3s, 4s, and 6s",
          "times tables 7s, 8s, and 9s",
          "multiplying two-digit numbers",
          "arrays and area models",
          "multiplication word problems",
        ],
      },
      {
        name: "Division",
        emoji: "➗",
        description: "Sharing into equal groups",
        angles: [
          "division as fair sharing",
          "division facts from times tables",
          "division with remainders",
          "long division basics",
          "division word problems about sharing snacks",
          "how multiplication and division are opposites",
        ],
      },
      {
        name: "Fractions",
        emoji: "🍕",
        description: "Parts of a whole, like pizza slices",
        angles: [
          "what a fraction means (halves, thirds, fourths)",
          "fractions on a number line",
          "equivalent fractions",
          "comparing fractions",
          "adding and subtracting fractions with the same denominator",
          "mixed numbers",
          "fractions in recipes and cooking",
        ],
      },
      {
        name: "Shapes & Geometry",
        emoji: "🔷",
        description: "Circles, triangles, and 3D shapes",
        angles: [
          "naming 2D shapes and their sides and corners",
          "3D shapes: cubes, spheres, cones, and cylinders",
          "symmetry",
          "perimeter",
          "area of rectangles",
          "angles: right, acute, and obtuse",
        ],
      },
      {
        name: "Time & Money",
        emoji: "⏰",
        description: "Clocks, coins, and dollars",
        angles: [
          "telling time to the hour and half hour",
          "telling time to five minutes",
          "elapsed time (how long did it take?)",
          "counting coins",
          "making change with dollars and cents",
          "word problems about saving and spending",
        ],
      },
      {
        name: "Measurement & Data",
        emoji: "📏",
        description: "Measuring things and reading graphs",
        angles: [
          "measuring length in inches and centimeters",
          "weight and capacity",
          "reading bar graphs and pictographs",
          "line plots",
          "comparing and ordering measurements",
          "estimating measurements",
        ],
      },
    ],
    middle: [
      {
        name: "Decimals & Percents",
        emoji: "💯",
        description: "Numbers between the whole numbers",
        angles: [
          "place value with decimals",
          "adding and subtracting decimals",
          "multiplying and dividing decimals",
          "converting between fractions, decimals, and percents",
          "finding a percent of a number",
          "discounts, tips, and sales tax",
        ],
      },
      {
        name: "Ratios & Proportions",
        emoji: "⚖️",
        description: "Comparing amounts fairly",
        angles: [
          "writing and simplifying ratios",
          "unit rates (like miles per hour)",
          "solving proportions",
          "scale drawings and maps",
          "recipes and mixing problems",
          "best-buy comparisons",
        ],
      },
      {
        name: "Negative Numbers",
        emoji: "🌡️",
        description: "Numbers below zero",
        angles: [
          "negative numbers on a number line",
          "adding and subtracting integers",
          "multiplying and dividing integers",
          "temperature and elevation problems",
          "absolute value",
          "ordering positive and negative numbers",
        ],
      },
      {
        name: "Pre-Algebra",
        emoji: "🧩",
        description: "Letters that stand for numbers",
        angles: [
          "evaluating expressions with variables",
          "one-step equations",
          "two-step equations",
          "order of operations",
          "writing expressions from word problems",
          "inequalities",
        ],
      },
      {
        name: "Geometry & Angles",
        emoji: "📐",
        description: "Angles, area, and volume",
        angles: [
          "angle relationships (complementary, supplementary, vertical)",
          "area of triangles and parallelograms",
          "circles: circumference and area",
          "volume of prisms and cylinders",
          "the coordinate plane",
          "the Pythagorean theorem",
        ],
      },
      {
        name: "Probability & Statistics",
        emoji: "🎲",
        description: "Chance, averages, and data",
        angles: [
          "probability of simple events",
          "experimental vs theoretical probability",
          "mean, median, mode, and range",
          "reading and making box plots and histograms",
          "sampling and surveys",
          "compound events (two coin flips, two dice)",
        ],
      },
    ],
    high: [
      {
        name: "Algebra",
        emoji: "🅰️",
        description: "Solving for the unknown",
        angles: [
          "solving multi-step linear equations",
          "systems of equations",
          "factoring quadratics",
          "the quadratic formula",
          "exponent rules",
          "polynomials",
          "word problems modeled with equations",
        ],
      },
      {
        name: "Functions & Graphs",
        emoji: "📈",
        description: "How one thing changes another",
        angles: [
          "slope and linear functions",
          "graphing lines from equations",
          "function notation and evaluating functions",
          "quadratic graphs (parabolas)",
          "exponential growth and decay",
          "interpreting real-world graphs",
        ],
      },
      {
        name: "Advanced Geometry",
        emoji: "🔺",
        description: "Proofs, triangles, and circles",
        angles: [
          "triangle congruence and similarity",
          "special right triangles",
          "circle theorems: arcs and chords",
          "surface area and volume of complex solids",
          "transformations: rotations, reflections, dilations",
          "coordinate geometry proofs",
        ],
      },
      {
        name: "Trigonometry",
        emoji: "🌊",
        description: "Triangles meet circles",
        angles: [
          "sine, cosine, and tangent basics",
          "solving right triangles",
          "the unit circle",
          "law of sines and law of cosines",
          "trig in real life: heights and distances",
          "graphs of sine and cosine",
        ],
      },
      {
        name: "Statistics",
        emoji: "📊",
        description: "Making sense of data like a scientist",
        angles: [
          "standard deviation and spread",
          "the normal distribution",
          "correlation vs causation",
          "scatter plots and lines of best fit",
          "designing a fair experiment",
          "misleading graphs and how to spot them",
        ],
      },
      {
        name: "Calculus Ideas",
        emoji: "♾️",
        description: "The math of change",
        angles: [
          "what a limit is",
          "the idea of a derivative (instant speed)",
          "the idea of an integral (adding up tiny pieces)",
          "slopes of curves",
          "rates of change in the real world",
          "infinity and infinite sums",
        ],
      },
    ],
  },

  Science: {
    elementary: [
      {
        name: "Animals & Habitats",
        emoji: "🦁",
        description: "Creatures and where they live",
        angles: [
          "desert animals and how they survive",
          "rainforest animals",
          "arctic and antarctic animals",
          "nocturnal animals",
          "animal camouflage and defenses",
          "food chains: who eats what",
          "animal migration journeys",
          "baby animals and how parents care for them",
        ],
      },
      {
        name: "Ocean Life",
        emoji: "🐠",
        description: "Under the sea",
        angles: [
          "coral reefs",
          "sharks",
          "whales and dolphins",
          "the deep sea and its strange creatures",
          "octopuses and squid",
          "tide pools",
          "sea turtles",
        ],
      },
      {
        name: "Dinosaurs & Fossils",
        emoji: "🦕",
        description: "Giants from long ago",
        angles: [
          "meat-eaters vs plant-eaters",
          "how fossils form",
          "the biggest and smallest dinosaurs",
          "what happened to the dinosaurs",
          "paleontologists and how they dig up bones",
          "flying and swimming reptiles of the dinosaur age",
        ],
      },
      {
        name: "Outer Space",
        emoji: "🚀",
        description: "Planets, stars, and astronauts",
        angles: [
          "the planets of our solar system",
          "the Sun",
          "the Moon and its phases",
          "astronauts and life in space",
          "stars and constellations",
          "comets, asteroids, and meteors",
          "the International Space Station",
          "rockets and how they work",
        ],
      },
      {
        name: "Weather & Seasons",
        emoji: "⛈️",
        description: "Sun, storms, and snow",
        angles: [
          "the water cycle",
          "clouds and what they tell us",
          "thunderstorms and lightning",
          "tornadoes and hurricanes (and staying safe)",
          "why we have seasons",
          "snow and ice",
          "how meteorologists predict weather",
        ],
      },
      {
        name: "Plants",
        emoji: "🌱",
        description: "How things grow",
        angles: [
          "what plants need to grow",
          "parts of a plant and their jobs",
          "how seeds travel",
          "photosynthesis: how plants make food",
          "trees and forests",
          "strange plants (like the Venus flytrap)",
        ],
      },
      {
        name: "The Human Body",
        emoji: "🦴",
        description: "Bones, muscles, and senses",
        angles: [
          "bones and the skeleton",
          "muscles and how we move",
          "the heart and blood",
          "the brain and nerves",
          "the five senses",
          "how we digest food",
          "keeping healthy: sleep, food, and exercise",
        ],
      },
      {
        name: "Rocks & Volcanoes",
        emoji: "🌋",
        description: "Earth's fiery insides",
        angles: [
          "the three types of rocks",
          "how volcanoes erupt",
          "earthquakes",
          "caves and crystals",
          "the layers of the Earth",
          "mountains and how they form",
        ],
      },
      {
        name: "Bugs & Insects",
        emoji: "🐝",
        description: "Tiny creatures, big jobs",
        angles: [
          "bees and why they matter",
          "ants and their colonies",
          "spiders (not insects!)",
          "how caterpillars change (metamorphosis)",
          "fireflies and how they glow",
          "beetles: the biggest animal group on Earth",
        ],
      },
    ],
    middle: [
      {
        name: "Cells & Microbes",
        emoji: "🔬",
        description: "Life too small to see",
        angles: [
          "parts of a cell and their jobs",
          "plant cells vs animal cells",
          "bacteria: helpful and harmful",
          "viruses and how vaccines work",
          "the microscope and its discoveries",
          "single-celled organisms",
        ],
      },
      {
        name: "Ecosystems",
        emoji: "🌍",
        description: "How living things connect",
        angles: [
          "energy flow and food webs",
          "biomes of the world",
          "predator-prey relationships",
          "invasive species",
          "decomposers and recycling in nature",
          "symbiosis: partnerships in nature",
        ],
      },
      {
        name: "Chemistry Basics",
        emoji: "⚗️",
        description: "Atoms, elements, and reactions",
        angles: [
          "atoms and molecules",
          "the periodic table",
          "solids, liquids, and gases",
          "physical vs chemical changes",
          "mixtures and solutions",
          "acids and bases",
        ],
      },
      {
        name: "Forces & Motion",
        emoji: "🎢",
        description: "Pushes, pulls, and gravity",
        angles: [
          "gravity",
          "friction",
          "Newton's laws of motion",
          "speed, velocity, and acceleration",
          "simple machines",
          "the physics of roller coasters",
        ],
      },
      {
        name: "Energy & Electricity",
        emoji: "⚡",
        description: "What makes everything go",
        angles: [
          "forms of energy and energy transfer",
          "circuits: series and parallel",
          "magnets and electromagnetism",
          "renewable energy: solar, wind, and water",
          "how batteries work",
          "light and sound waves",
        ],
      },
      {
        name: "Earth & Climate",
        emoji: "🌡️",
        description: "Our changing planet",
        angles: [
          "plate tectonics",
          "the rock cycle",
          "weather vs climate",
          "the greenhouse effect",
          "oceans and currents",
          "natural resources and conservation",
        ],
      },
    ],
    high: [
      {
        name: "Physics",
        emoji: "🍎",
        description: "The rules of the universe",
        angles: [
          "momentum and collisions",
          "work, energy, and power",
          "waves and the electromagnetic spectrum",
          "electricity and magnetism",
          "the physics of flight",
          "relativity: time and space (an introduction)",
          "quantum ideas: the very small (an introduction)",
        ],
      },
      {
        name: "Chemistry",
        emoji: "🧪",
        description: "Matter and its transformations",
        angles: [
          "chemical bonding: ionic and covalent",
          "balancing chemical equations",
          "the mole and stoichiometry basics",
          "reaction rates and catalysts",
          "organic chemistry: carbon's chemistry",
          "chemistry of everyday life (soap, rust, baking)",
        ],
      },
      {
        name: "Biology & Genetics",
        emoji: "🧬",
        description: "The code of life",
        angles: [
          "DNA and how genes work",
          "heredity and Punnett squares",
          "evolution and natural selection",
          "the immune system",
          "biotechnology and genetic engineering basics",
          "the nervous system in depth",
        ],
      },
      {
        name: "Astronomy & the Universe",
        emoji: "🌌",
        description: "Beyond the solar system",
        angles: [
          "the life cycle of stars",
          "black holes",
          "galaxies and the Milky Way",
          "the Big Bang and the expanding universe",
          "exoplanets and the search for life",
          "telescopes and how we see deep space",
        ],
      },
      {
        name: "Environmental Science",
        emoji: "♻️",
        description: "Protecting our planet",
        angles: [
          "climate change: causes and evidence",
          "biodiversity and extinction",
          "water resources and pollution",
          "sustainable energy solutions",
          "human population and resources",
          "conservation success stories",
        ],
      },
    ],
  },

  Reading: {
    elementary: [
      {
        name: "Animal Stories",
        emoji: "🐾",
        description: "Stories starring animals",
        angles: [
          "a story about a clever fox",
          "a story about a lost puppy finding home",
          "a story about penguins",
          "a story about a wise old elephant",
          "a story about a brave little mouse",
          "a story about horses on a ranch",
          "a story about a talking parrot",
        ],
      },
      {
        name: "Fairy Tales & Fables",
        emoji: "🏰",
        description: "Magic, lessons, and happily-ever-afters",
        angles: [
          "an original fable with a lesson about honesty",
          "an original fairy tale about a kind dragon",
          "an original fable about teamwork",
          "an original fairy tale about a clever princess",
          "a trickster tale",
          "an original fable about patience",
        ],
      },
      {
        name: "Adventure",
        emoji: "🗺️",
        description: "Journeys, treasure, and daring escapes",
        angles: [
          "a treasure hunt story",
          "a jungle expedition story",
          "a story about getting lost and finding the way home",
          "a mountain climbing adventure",
          "a story about exploring a mysterious island",
          "a river rafting adventure",
        ],
      },
      {
        name: "Sports & Games",
        emoji: "⚽",
        description: "Stories from the field and court",
        angles: [
          "a story about a big soccer game",
          "a passage about how basketball was invented",
          "a story about learning to swim",
          "a passage about the Olympics",
          "a story about a chess tournament",
          "a story about being a good teammate after a loss",
        ],
      },
      {
        name: "Amazing People",
        emoji: "🌟",
        description: "True stories of real heroes",
        angles: [
          "a young inventor who solved a real problem",
          "a famous scientist's childhood",
          "an explorer's great journey",
          "an athlete who never gave up",
          "an artist who saw the world differently",
          "a kid who started a movement to help others",
        ],
      },
      {
        name: "How Things Work",
        emoji: "⚙️",
        description: "Nonfiction about everyday wonders",
        angles: [
          "how a lighthouse works",
          "how bread is made from wheat to bakery",
          "how firefighters fight fires",
          "how mail travels around the world",
          "how bridges hold so much weight",
          "how ice cream is made",
          "how elevators work",
        ],
      },
      {
        name: "Funny Stories",
        emoji: "😄",
        description: "Silly tales to make you laugh",
        angles: [
          "a story about a backwards day",
          "a story about a pet that thinks it's a person",
          "a story about the world's worst sandwich",
          "a story about a robot that takes everything literally",
          "a story about a school for superheroes who aren't very good yet",
          "a mixed-up recipe disaster story",
        ],
      },
    ],
    middle: [
      {
        name: "Mysteries",
        emoji: "🔍",
        description: "Clues, suspects, and surprises",
        angles: [
          "a missing-object mystery at school",
          "a detective story with red herrings",
          "a mystery set in an old library",
          "a coded-message mystery",
          "a mystery about strange footprints",
          "a whodunit at a summer camp",
        ],
      },
      {
        name: "Myths & Legends",
        emoji: "⚡",
        description: "Gods, heroes, and monsters",
        angles: [
          "a Greek myth retold",
          "a Norse myth retold",
          "an original hero's-journey legend",
          "myths that explain nature (why the seasons change)",
          "legendary creatures from around the world",
          "a passage comparing myths from two cultures",
        ],
      },
      {
        name: "Science & Discovery",
        emoji: "🔭",
        description: "Nonfiction from the frontiers of knowledge",
        angles: [
          "an article about a deep-sea discovery",
          "an article about how memories form",
          "an article about a Mars rover mission",
          "an article about animal intelligence experiments",
          "an article about extreme weather science",
          "an article about a medical breakthrough",
        ],
      },
      {
        name: "Stories from History",
        emoji: "📜",
        description: "The past brought to life",
        angles: [
          "a story set on the Oregon Trail",
          "a story set in ancient Rome",
          "a story about a young apprentice in colonial times",
          "a story set during the gold rush",
          "a passage about a real historical rescue",
          "a story about immigrating to a new country long ago",
        ],
      },
      {
        name: "Survival Stories",
        emoji: "🏕️",
        description: "Grit against the wild",
        angles: [
          "surviving a blizzard",
          "lost in the wilderness",
          "a desert survival story",
          "a true-style account of a shipwreck rescue",
          "surviving on a raft at sea",
          "a story about wilderness skills saving the day",
        ],
      },
      {
        name: "Persuasion & Opinion",
        emoji: "💬",
        description: "Arguments and how they work",
        angles: [
          "an editorial about school lunches",
          "a persuasive piece about longer recess",
          "two opposing letters about a new skate park",
          "an opinion piece about screen time",
          "a persuasive speech about protecting a local park",
          "an advertisement analyzed for persuasion tricks",
        ],
      },
    ],
    high: [
      {
        name: "Short Fiction",
        emoji: "📖",
        description: "Literary stories with layers",
        angles: [
          "a story with an unreliable narrator",
          "a story told through letters",
          "a story with a twist ending to analyze",
          "a story exploring a moral dilemma",
          "a story rich in symbolism",
          "a story with parallel plotlines",
        ],
      },
      {
        name: "Science & Tech Articles",
        emoji: "🤖",
        description: "Complex nonfiction, real issues",
        angles: [
          "an article about artificial intelligence in daily life",
          "an article about gene editing debates",
          "an article about space colonization challenges",
          "an article about renewable energy trade-offs",
          "an article about how algorithms shape what we see",
          "an article about brain-computer interfaces",
        ],
      },
      {
        name: "Speeches & Rhetoric",
        emoji: "🎤",
        description: "Words that moved the world",
        angles: [
          "an original commencement-style speech to analyze",
          "a passage analyzing rhetorical devices (ethos, pathos, logos)",
          "two speeches on the same issue compared",
          "a historical-style persuasive address",
          "an original debate case to evaluate",
          "a speech with logical fallacies to identify",
        ],
      },
      {
        name: "Poetry",
        emoji: "🪶",
        description: "Meaning packed into few words",
        angles: [
          "an original nature poem with figurative language",
          "a sonnet to analyze",
          "free verse vs structured form",
          "an original narrative poem",
          "imagery and mood in a short poem",
          "extended metaphor in an original poem",
        ],
      },
      {
        name: "Primary Sources",
        emoji: "🗞️",
        description: "Documents, diaries, and firsthand accounts",
        angles: [
          "a diary-style account from a historical era",
          "a newspaper-style report from a famous event",
          "two firsthand accounts of the same event compared",
          "an explorer's log to analyze for bias",
          "a historical letter and its context",
          "an interview transcript to evaluate",
        ],
      },
    ],
  },

  Spelling: {
    elementary: [
      {
        name: "Short & Long Vowels",
        emoji: "🅾️",
        description: "cat vs cake",
        angles: [
          "short vowel words (CVC)",
          "silent e words (make, ride, hope)",
          "vowel teams: ai, ay, ea, ee",
          "vowel teams: oa, ow, ue, ui",
          "long vs short vowel pairs (hop/hope)",
        ],
      },
      {
        name: "Tricky Blends",
        emoji: "🌀",
        description: "sh, ch, th, and friends",
        angles: [
          "words with sh, ch, and th",
          "beginning blends: bl, cl, fr, st",
          "ending blends: -nd, -nt, -mp, -st",
          "three-letter blends: str, spl, scr",
          "silent letters: kn, wr, mb",
        ],
      },
      {
        name: "Plurals & Endings",
        emoji: "🐑",
        description: "one dog, two dogs… one sheep, two sheep?",
        angles: [
          "adding -s and -es",
          "irregular plurals (children, mice, feet)",
          "adding -ing and -ed (with doubling)",
          "changing y to i",
          "words ending in -f and -fe (leaf/leaves)",
        ],
      },
      {
        name: "Sight Words",
        emoji: "👀",
        description: "Words you just have to know",
        angles: [
          "common sight words that break the rules",
          "words with ough and augh",
          "there / their / they're",
          "to / too / two and other homophones",
          "days, months, and calendar words",
        ],
      },
      {
        name: "Compound Words",
        emoji: "🧱",
        description: "Two words stuck together",
        angles: [
          "everyday compound words",
          "compound words about nature",
          "contractions (don't, we'll, it's)",
          "compound words vs two-word phrases",
          "building new compound words",
        ],
      },
    ],
    middle: [
      {
        name: "Prefixes & Suffixes",
        emoji: "🧬",
        description: "Word parts that change meaning",
        angles: [
          "prefixes un-, re-, dis-, pre-",
          "suffixes -ful, -less, -ness, -ment",
          "suffixes -tion, -sion, -cian",
          "prefixes mis-, non-, over-, under-",
          "spelling changes when adding suffixes",
        ],
      },
      {
        name: "Greek & Latin Roots",
        emoji: "🏛️",
        description: "Ancient word building blocks",
        angles: [
          "roots tele, phon, graph",
          "roots aqua, terra, aster",
          "roots bio, geo, photo",
          "roots port, dict, struct",
          "number roots: uni, bi, tri, cent",
        ],
      },
      {
        name: "Commonly Confused",
        emoji: "🤔",
        description: "affect or effect?",
        angles: [
          "affect/effect and accept/except",
          "its/it's and whose/who's",
          "lose/loose and choose/chose",
          "than/then and weather/whether",
          "principal/principle and stationary/stationery",
        ],
      },
      {
        name: "Double Trouble",
        emoji: "✌️",
        description: "Words with sneaky double letters",
        angles: [
          "double consonants in the middle (soccer, hammer)",
          "when to double before -ing and -ed",
          "words with -cc-, -ss-, -ll-",
          "one L or two? (until, fulfill, welcome)",
          "commonly misspelled double-letter words",
        ],
      },
    ],
    high: [
      {
        name: "Academic Vocabulary",
        emoji: "🎓",
        description: "Words for essays and exams",
        angles: [
          "words like analyze, synthesize, hypothesis",
          "transition words spelled right",
          "commonly misspelled essay words",
          "words from science and math class",
          "words with unusual origins",
        ],
      },
      {
        name: "Hard Words",
        emoji: "🏆",
        description: "Spelling-bee level challenges",
        angles: [
          "frequently misspelled words (definitely, separate, necessary)",
          "words borrowed from French",
          "words borrowed from other languages",
          "long words worth knowing",
          "words where pronunciation misleads spelling",
        ],
      },
    ],
  },

  History: {
    elementary: [
      {
        name: "Ancient Egypt",
        emoji: "🐫",
        description: "Pyramids, pharaohs, and mummies",
        angles: [
          "how the pyramids were built",
          "pharaohs and famous rulers",
          "daily life along the Nile",
          "hieroglyphics: picture writing",
          "mummies and Egyptian beliefs",
          "the discovery of King Tut's tomb",
        ],
      },
      {
        name: "Knights & Castles",
        emoji: "🏰",
        description: "Life in the Middle Ages",
        angles: [
          "how castles were built and defended",
          "becoming a knight: page, squire, knight",
          "daily life in a medieval village",
          "kings, queens, and royal courts",
          "medieval feasts and festivals",
          "armor and tournaments",
        ],
      },
      {
        name: "Explorers",
        emoji: "⛵",
        description: "Brave journeys into the unknown",
        angles: [
          "voyages across the oceans",
          "explorers of the polar regions",
          "mapping the world",
          "life aboard an old sailing ship",
          "explorers of rivers and jungles",
          "navigating by the stars",
        ],
      },
      {
        name: "Native Americans",
        emoji: "🪶",
        description: "The first peoples of the Americas",
        angles: [
          "nations of the Great Plains",
          "peoples of the Eastern Woodlands",
          "the Pueblo and the Southwest",
          "traditions, stories, and art",
          "how different nations used the land",
          "Native American inventions and contributions",
        ],
      },
      {
        name: "Pioneers & the Old West",
        emoji: "🤠",
        description: "Wagon trains and frontier life",
        angles: [
          "traveling the Oregon Trail",
          "life in a frontier town",
          "the Pony Express",
          "the gold rush",
          "one-room schoolhouses",
          "cowboys and cattle drives",
        ],
      },
      {
        name: "Famous Americans",
        emoji: "🇺🇸",
        description: "People who shaped a nation",
        angles: [
          "inventors who changed daily life",
          "presidents and what they did",
          "leaders who fought for fairness",
          "pioneers of flight and space",
          "great American artists and writers",
          "young people who made history",
        ],
      },
      {
        name: "Ancient Wonders",
        emoji: "🗿",
        description: "Amazing places from long ago",
        angles: [
          "the Great Wall of China",
          "the mystery of Stonehenge",
          "the statues of Easter Island",
          "the lost city of Pompeii",
          "Machu Picchu in the clouds",
          "the seven wonders of the ancient world",
        ],
      },
    ],
    middle: [
      {
        name: "Ancient Greece & Rome",
        emoji: "🏛️",
        description: "Democracy, gladiators, and empires",
        angles: [
          "the birth of democracy in Athens",
          "Sparta vs Athens",
          "the Roman Republic and how it worked",
          "daily life in ancient Rome",
          "Roman engineering: roads and aqueducts",
          "the rise and fall of the Roman Empire",
          "the original Olympic games",
        ],
      },
      {
        name: "The American Revolution",
        emoji: "🗽",
        description: "How a nation began",
        angles: [
          "causes: taxes and tea",
          "the Declaration of Independence",
          "key figures of the Revolution",
          "spies and secret messages of the war",
          "the Constitution and Bill of Rights",
          "everyday people during the Revolution",
        ],
      },
      {
        name: "World Cultures",
        emoji: "🌏",
        description: "Civilizations around the globe",
        angles: [
          "ancient China and its dynasties",
          "feudal Japan and the samurai",
          "the Maya and their calendar",
          "the Aztec and Inca empires",
          "kingdoms of ancient Africa (Mali, Ghana, Kush)",
          "the Silk Road and world trade",
        ],
      },
      {
        name: "The Renaissance",
        emoji: "🎨",
        description: "A rebirth of art and ideas",
        angles: [
          "Leonardo da Vinci: artist and inventor",
          "the printing press and how it changed everything",
          "great Renaissance artists",
          "the Scientific Revolution begins",
          "life in Renaissance Florence",
          "new ideas that challenged old ones",
        ],
      },
      {
        name: "The Civil War Era",
        emoji: "🕊️",
        description: "A nation divided and reunited",
        angles: [
          "causes of the Civil War",
          "the Underground Railroad",
          "Abraham Lincoln's leadership",
          "life on the home front",
          "emancipation and what it meant",
          "Reconstruction: rebuilding after the war",
        ],
      },
      {
        name: "Inventions & Industry",
        emoji: "🏭",
        description: "Machines that changed the world",
        angles: [
          "the steam engine and railroads",
          "electricity comes to cities",
          "the telephone and telegraph",
          "the assembly line and automobiles",
          "child labor and the fight for fair work laws",
          "how factories changed family life",
        ],
      },
    ],
    high: [
      {
        name: "The World Wars",
        emoji: "🌐",
        description: "The conflicts that shaped the modern world",
        angles: [
          "causes of World War I",
          "the home front during World War II",
          "codebreakers and technology of the wars",
          "leaders and turning points of World War II",
          "how the wars redrew the map of the world",
          "rebuilding after the wars: the UN and recovery",
        ],
      },
      {
        name: "Civil Rights Movement",
        emoji: "✊",
        description: "The struggle for equality",
        angles: [
          "the Montgomery bus boycott",
          "Brown v. Board and school integration",
          "the March on Washington",
          "young people in the movement",
          "the Voting Rights Act",
          "leaders and strategies of nonviolent protest",
        ],
      },
      {
        name: "Government & the Constitution",
        emoji: "⚖️",
        description: "How power works in a democracy",
        angles: [
          "the three branches and checks and balances",
          "how a bill becomes a law",
          "landmark Supreme Court cases",
          "federal vs state power",
          "amendments and how the Constitution changes",
          "elections and the electoral college",
        ],
      },
      {
        name: "The Cold War",
        emoji: "🧊",
        description: "A rivalry that never became a battle",
        angles: [
          "the space race",
          "the Berlin Wall",
          "the Cuban Missile Crisis",
          "spies and secrets",
          "life behind the Iron Curtain",
          "how the Cold War ended",
        ],
      },
      {
        name: "Modern World History",
        emoji: "📰",
        description: "How we got to now",
        angles: [
          "the fall of colonial empires",
          "the digital revolution",
          "globalization: the world gets smaller",
          "the European Union and modern alliances",
          "great migrations of the 20th century",
          "how historians judge recent events",
        ],
      },
    ],
  },

  Art: {
    elementary: [
      {
        name: "Colors & Mixing",
        emoji: "🎨",
        description: "The magic of the color wheel",
        angles: [
          "primary and secondary colors",
          "warm colors vs cool colors",
          "how artists mix new colors",
          "colors and feelings",
          "complementary colors",
          "shades, tints, and tones",
        ],
      },
      {
        name: "Famous Paintings",
        emoji: "🖼️",
        description: "Pictures the whole world knows",
        angles: [
          "the Mona Lisa and its mysteries",
          "Van Gogh's Starry Night",
          "Monet's water lilies",
          "cave paintings: the first art",
          "famous portraits and their stories",
          "paintings of the sea and ships",
        ],
      },
      {
        name: "Drawing & Design",
        emoji: "✏️",
        description: "Lines, shapes, and patterns",
        angles: [
          "lines: the building blocks of drawing",
          "shapes and forms",
          "patterns in art and nature",
          "texture: how art can look touchable",
          "perspective: making flat things look deep",
          "how illustrators make picture books",
        ],
      },
      {
        name: "Sculpture & Statues",
        emoji: "🗽",
        description: "Art you can walk around",
        angles: [
          "famous statues of the world",
          "how sculptors carve stone",
          "clay and pottery through history",
          "mobiles and art that moves",
          "giant outdoor sculptures",
          "sand, ice, and other surprising sculpture materials",
        ],
      },
      {
        name: "Art Around the World",
        emoji: "🌍",
        description: "Beautiful things from every culture",
        angles: [
          "Japanese origami and ink painting",
          "African masks and patterns",
          "Mexican folk art and murals",
          "Aboriginal dot painting",
          "Chinese calligraphy and dragons in art",
          "quilts and weaving traditions",
        ],
      },
    ],
    middle: [
      {
        name: "Art Movements",
        emoji: "🖌️",
        description: "When artists changed the rules",
        angles: [
          "Impressionism: painting light",
          "Cubism: seeing all sides at once",
          "Surrealism: painting dreams",
          "Pop Art: art from everyday things",
          "Realism vs abstraction",
          "Renaissance art and perspective",
        ],
      },
      {
        name: "Architecture",
        emoji: "🏛️",
        description: "The art of buildings",
        angles: [
          "ancient architecture: pyramids to Parthenon",
          "Gothic cathedrals and how they stand",
          "skyscrapers: the race to the sky",
          "famous architects and their signatures",
          "bridges as art and engineering",
          "green buildings of the future",
        ],
      },
      {
        name: "Photography & Film",
        emoji: "📷",
        description: "Art through a lens",
        angles: [
          "how cameras capture images",
          "famous photographs that changed minds",
          "the birth of movies",
          "animation: from flipbooks to computers",
          "composition: what makes a great photo",
          "documentary photography",
        ],
      },
      {
        name: "Design & Illustration",
        emoji: "💡",
        description: "Art with a job to do",
        angles: [
          "logo design and what makes logos memorable",
          "comic books and graphic novels as art",
          "typography: the art of letters",
          "video game art and design",
          "posters that made history",
          "product design: beauty meets function",
        ],
      },
    ],
    high: [
      {
        name: "Modern & Contemporary",
        emoji: "🧊",
        description: "Art of our time",
        angles: [
          "abstract expressionism",
          "street art and its debates",
          "installation and performance art",
          "digital art and NFTs",
          "minimalism",
          "what makes something 'art'? famous controversies",
        ],
      },
      {
        name: "Art History Deep Dives",
        emoji: "📚",
        description: "Analyzing masterpieces",
        angles: [
          "symbolism hidden in famous paintings",
          "how patrons shaped art history",
          "women artists history overlooked",
          "art restoration and forgery detection",
          "comparing two artists' takes on the same subject",
          "how museums decide what to show",
        ],
      },
      {
        name: "Visual Analysis",
        emoji: "🔬",
        description: "Reading art like a critic",
        angles: [
          "composition and the rule of thirds",
          "color theory in famous works",
          "light and shadow (chiaroscuro)",
          "movement and rhythm in visual art",
          "critiquing a work: formal analysis",
          "how advertising borrows from fine art",
        ],
      },
    ],
  },

  Music: {
    elementary: [
      {
        name: "Instruments",
        emoji: "🎺",
        description: "Everything that makes a sound",
        angles: [
          "the instrument families of the orchestra",
          "how string instruments work",
          "drums and percussion around the world",
          "brass and woodwinds",
          "the piano and keyboard instruments",
          "unusual instruments from around the world",
        ],
      },
      {
        name: "Rhythm & Beat",
        emoji: "🥁",
        description: "The heartbeat of music",
        angles: [
          "steady beat vs rhythm",
          "note lengths: whole, half, quarter notes",
          "clapping patterns and body percussion",
          "tempo: fast and slow",
          "rhythms from different cultures",
          "how drummers keep a band together",
        ],
      },
      {
        name: "Famous Composers",
        emoji: "🎼",
        description: "The people behind great music",
        angles: [
          "Beethoven and his symphonies",
          "Mozart: the child genius",
          "Bach and his musical family",
          "composers of movie music",
          "Tchaikovsky and The Nutcracker",
          "women composers to know",
        ],
      },
      {
        name: "Songs Around the World",
        emoji: "🌍",
        description: "How the world sings",
        angles: [
          "folk songs and why people sing them",
          "lullabies from different countries",
          "African drumming and call-and-response",
          "mariachi and Latin American music",
          "songs people sing while working",
          "national anthems and their stories",
        ],
      },
      {
        name: "How Sound Works",
        emoji: "🔊",
        description: "The science of what you hear",
        angles: [
          "vibrations: where sound comes from",
          "high and low: what pitch is",
          "loud and soft: volume and dynamics",
          "echoes and how sound travels",
          "how our ears hear",
          "why instruments sound different from each other",
        ],
      },
    ],
    middle: [
      {
        name: "Reading Music",
        emoji: "🎵",
        description: "The written language of sound",
        angles: [
          "the staff, clefs, and note names",
          "time signatures",
          "sharps, flats, and key signatures",
          "dynamics and expression markings",
          "reading a simple melody",
          "how conductors read a full score",
        ],
      },
      {
        name: "Bands & Orchestras",
        emoji: "🎻",
        description: "Music made together",
        angles: [
          "how an orchestra is organized",
          "the conductor's job",
          "jazz bands and how they differ",
          "marching bands",
          "chamber music: small groups",
          "how musicians practice and rehearse",
        ],
      },
      {
        name: "Music History",
        emoji: "🏺",
        description: "From ancient chants to radio",
        angles: [
          "music of the Middle Ages and Renaissance",
          "the Classical era: Mozart's world",
          "the Romantic era: big feelings, big orchestras",
          "the birth of recorded music",
          "how radio changed music",
          "instruments through the ages",
        ],
      },
      {
        name: "Modern Genres",
        emoji: "🎸",
        description: "Rock, pop, hip-hop, and more",
        angles: [
          "the birth of rock and roll",
          "the roots of hip-hop",
          "pop music and how hits are made",
          "country music's story",
          "electronic music and synthesizers",
          "how genres borrow from each other",
        ],
      },
    ],
    high: [
      {
        name: "Music Theory",
        emoji: "🧠",
        description: "Why music works",
        angles: [
          "scales and modes",
          "intervals and how they create feeling",
          "chords and chord progressions",
          "harmony and voice leading basics",
          "song structure: verse, chorus, bridge",
          "why some notes sound good together (the math of music)",
        ],
      },
      {
        name: "Jazz & Blues",
        emoji: "🎷",
        description: "America's original art form",
        angles: [
          "the birth of the blues",
          "New Orleans and early jazz",
          "swing and the big band era",
          "improvisation: composing in the moment",
          "bebop and modern jazz",
          "how jazz influenced all modern music",
        ],
      },
      {
        name: "Music & Technology",
        emoji: "🎚️",
        description: "From studios to streaming",
        angles: [
          "how recording studios work",
          "sampling and digital production",
          "auto-tune and vocal effects debates",
          "how streaming changed the music business",
          "film scoring techniques",
          "AI and the future of music-making",
        ],
      },
    ],
  },
};

/** Look up a category by subject + category name (case-insensitive). */
export function findCategory(subject: string, categoryName: string): { category: TopicCategory; band: Band } | null {
  const bands = TOPIC_CATALOG[subject];
  if (!bands) return null;
  const want = categoryName.trim().toLowerCase();
  for (const band of BAND_ORDER) {
    const hit = bands[band].find((c) => c.name.toLowerCase() === want);
    if (hit) return { category: hit, band };
  }
  return null;
}

/**
 * General passage-theme pool for "surprise me" reading lessons (no topic
 * chosen). The generate route samples from this, excluding recently used
 * themes, so passages stop clustering on model favorites (monarch butterflies…).
 */
export const SURPRISE_THEME_POOL: string[] = [
  "a volcano expedition",
  "the world's fastest trains",
  "how honey is made",
  "a lighthouse keeper's day",
  "the deepest cave on Earth",
  "how movies use special effects",
  "a day at an animal rescue center",
  "the history of pizza",
  "how skyscrapers sway in the wind",
  "sled dogs of the Arctic",
  "the secret life of city raccoons",
  "how astronauts train underwater",
  "the invention of the bicycle",
  "a robot that explores the ocean floor",
  "the great library of Alexandria",
  "how weather satellites work",
  "a young chef's first competition",
  "the pony express riders",
  "glow-in-the-dark animals",
  "how earthquakes are measured",
  "the world's strangest sports",
  "a treehouse builder's biggest project",
  "how chocolate travels from tree to bar",
  "the first hot air balloon flight",
  "desert survival tricks of animals",
  "a submarine voyage",
  "the history of ice cream",
  "how bridges are tested for safety",
  "carrier pigeons and secret messages",
  "the tallest trees on Earth",
];
