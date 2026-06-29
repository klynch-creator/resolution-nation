-- ============================================================
-- Resolution Nation — Store Expansion + Mythic tier (June 2026)
--
-- Two problems this fixes:
--   1. The Star Store was thin (only ~18 seeded items, max 200 stars) so
--      students ran out of things to buy and had no long-term goals.
--   2. There was no aspirational top end. We add a new 'mythic' rarity for
--      grails costing 1,000–5,000 stars, plus new categories for variety.
--
-- spend_stars() (migration 002/016) computes balance from the ledger with no
-- upper bound, so high-cost items "just work" — no economy changes needed.
--
-- Safe to re-run: the seed is guarded by a 'Wish Star' sentinel.
-- ============================================================

-- ── 1. Expand rarity + category constraints ──────────────────────────────────

ALTER TABLE star_store_items DROP CONSTRAINT IF EXISTS star_store_items_rarity_check;
ALTER TABLE star_store_items ADD CONSTRAINT star_store_items_rarity_check
  CHECK (rarity IN ('common','uncommon','rare','epic','legendary','mythic'));

ALTER TABLE star_store_items DROP CONSTRAINT IF EXISTS star_store_items_category_check;
ALTER TABLE star_store_items ADD CONSTRAINT star_store_items_category_check
  CHECK (category IN (
    'animals','history','science','world','goods','skins',
    'space','mythical','tech','sports','nature'
  ));

-- ── 2. Seed the expanded catalog ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM star_store_items WHERE name = 'Wish Star') THEN
    INSERT INTO star_store_items (name, emoji, category, rarity, star_cost, bio, item_type, is_giftable) VALUES
    -- ANIMALS
    ('Honeybee', '🐝', 'animals', 'common', 12, 'A honeybee visits about 1,500 flowers a day, and the whole hive flies the equivalent of three trips around Earth to make a single jar of honey.', 'card', true),
    ('Chameleon', '🦎', 'animals', 'common', 15, 'Chameleons move each eye independently and can look in two directions at once. Their tongue can be twice the length of their body!', 'card', true),
    ('Seahorse', '🐠', 'animals', 'common', 18, 'In seahorses, it is the dad who gets pregnant and gives birth — sometimes to over 1,000 babies at once.', 'card', true),
    ('Red Panda', '🐾', 'animals', 'uncommon', 35, 'Red pandas use their bushy tails as blankets in the cold and were discovered about 50 years before the giant panda.', 'card', true),
    ('Emperor Penguin', '🐧', 'animals', 'uncommon', 40, 'Emperor penguins huddle together through -40°F storms and dive deeper than any other bird — over 1,800 feet down.', 'card', true),
    ('Mantis Shrimp', '🦐', 'animals', 'rare', 90, 'The mantis shrimp punches at the speed of a bullet and sees 12+ color channels — humans only see three.', 'card', true),
    ('Komodo Dragon', '🐲', 'animals', 'rare', 110, 'Komodo dragons are the largest lizards alive, can eat 80% of their body weight in one meal, and smell prey from miles away.', 'card', true),
    ('Bald Eagle', '🦅', 'animals', 'epic', 200, 'A bald eagle''s eyesight is four to eight times sharper than a human''s — it can spot a rabbit from two miles up.', 'card', true),
    ('Giant Squid', '🦑', 'animals', 'epic', 260, 'The giant squid has the largest eyes of any animal — the size of dinner plates — to catch faint light in the deep ocean.', 'card', true),
    ('Siberian Tiger', '🐅', 'animals', 'legendary', 550, 'The Siberian tiger is the biggest cat on Earth, up to 700 pounds, and can leap more than 18 feet in a single bound.', 'card', true),

    -- NATURE
    ('Sunflower', '🌻', 'nature', 'common', 12, 'Young sunflowers turn to follow the sun across the sky each day — a movement scientists call heliotropism.', 'card', true),
    ('Mushroom', '🍄', 'nature', 'common', 16, 'The largest living thing on Earth is a fungus in Oregon, spreading across 2,385 acres mostly underground.', 'card', true),
    ('Coral Reef', '🪸', 'nature', 'uncommon', 45, 'Coral reefs cover less than 1% of the ocean floor but are home to about 25% of all marine life.', 'card', true),
    ('Redwood Tree', '🌲', 'nature', 'rare', 120, 'Coast redwoods are the tallest trees alive — over 380 feet — and some have lived more than 2,000 years.', 'card', true),
    ('Volcano', '🌋', 'nature', 'epic', 220, 'There are around 1,500 active volcanoes on land — and many more hidden beneath the oceans.', 'card', true),
    ('Tornado', '🌪️', 'nature', 'epic', 240, 'A tornado''s winds can top 300 mph — faster than a Formula 1 car at full speed.', 'card', true),
    ('Glacier', '🧊', 'nature', 'legendary', 500, 'Glaciers hold about 69% of the world''s fresh water, frozen and stored for thousands of years.', 'card', true),

    -- SPACE
    ('Moon', '🌙', 'space', 'common', 20, 'The Moon is slowly drifting away from Earth — about 1.5 inches farther every single year.', 'card', true),
    ('Red Planet', '🔴', 'space', 'uncommon', 50, 'A day on Mars is almost the same length as Earth''s (24h 37m), but a Martian year lasts 687 days.', 'card', true),
    ('Comet', '☄️', 'space', 'rare', 95, 'Comets are giant dirty snowballs of ice and dust; when they near the sun, their glowing tails can stretch millions of miles.', 'card', true),
    ('Saturn', '🪐', 'space', 'rare', 130, 'Saturn is so light it would float in a giant bathtub of water, and its rings are made of billions of chunks of ice.', 'card', true),
    ('Rocket', '🚀', 'space', 'epic', 230, 'To escape Earth''s gravity a rocket must reach 25,000 mph — fast enough to cross the United States in about six minutes.', 'card', true),
    ('Astronaut', '🧑‍🚀', 'space', 'epic', 300, 'Astronauts grow up to two inches taller in space, because their spines stretch out without gravity pulling on them.', 'card', true),
    ('Galaxy', '🌌', 'space', 'legendary', 600, 'Our Milky Way holds 100–400 billion stars, and astronomers estimate there are about 2 trillion galaxies in the universe.', 'card', true),
    ('Supernova', '💥', 'space', 'legendary', 850, 'A single supernova can briefly outshine an entire galaxy of billions of stars before fading away.', 'card', true),

    -- HISTORY
    ('Leonardo da Vinci', '🎨', 'history', 'uncommon', 50, 'Da Vinci wrote his notebooks in mirror writing and sketched flying machines 400 years before the first real airplane.', 'card', true),
    ('Rosa Parks', '🚌', 'history', 'rare', 120, 'Rosa Parks''s refusal to give up her bus seat in 1955 sparked a 381-day boycott that helped end segregated buses.', 'card', true),
    ('Albert Einstein', '🧠', 'history', 'rare', 140, 'At age 26, Einstein published four papers in a single year that reshaped physics — including the famous E = mc².', 'card', true),
    ('Genghis Khan', '🐎', 'history', 'epic', 250, 'Genghis Khan built the largest connected land empire in history, stretching across most of Asia.', 'card', true),
    ('King Tutankhamun', '⚱️', 'history', 'epic', 280, 'King Tut became pharaoh around age nine. His nearly untouched tomb, found in 1922, held over 5,000 treasures.', 'card', true),
    ('Wright Flyer', '✈️', 'history', 'legendary', 520, 'The Wright brothers'' first flight in 1903 lasted just 12 seconds and traveled 120 feet — shorter than a jumbo jet''s wingspan.', 'card', true),

    -- SCIENCE
    ('Magnet', '🧲', 'science', 'uncommon', 38, 'Earth itself is a giant magnet — its magnetic field shields us from dangerous solar radiation every day.', 'card', true),
    ('Atom', '⚛️', 'science', 'uncommon', 42, 'Atoms are 99.9999999% empty space. If one were a stadium, the nucleus would be a tiny pea at the very center.', 'card', true),
    ('Telescope', '🔭', 'science', 'uncommon', 55, 'The James Webb Space Telescope can see light that left distant galaxies over 13 billion years ago — near the dawn of time.', 'card', true),
    ('Lightning', '⚡', 'science', 'rare', 100, 'A lightning bolt heats the air around it to about 50,000°F — five times hotter than the surface of the Sun.', 'card', true),
    ('Robot', '🤖', 'science', 'rare', 115, 'The word robot comes from a 1920 Czech play and originally meant "forced labor."', 'card', true),
    ('Rainbow', '🌈', 'science', 'common', 18, 'A rainbow is actually a full circle of light — from the ground we usually only see the top half.', 'card', true),
    ('Chemistry Set', '🧪', 'science', 'epic', 210, 'Just about 118 elements make up everything in the universe — from distant stars to your lunch.', 'card', true),

    -- TECH
    ('Lightbulb', '💡', 'tech', 'common', 22, 'Edison tried thousands of materials before finding a filament that worked. He called the failures "ways that won''t work."', 'card', true),
    ('Smartphone', '📱', 'tech', 'uncommon', 48, 'Today''s smartphone is millions of times more powerful than all the computers that guided Apollo 11 to the Moon.', 'card', true),
    ('Game Controller', '🎮', 'tech', 'rare', 100, 'The first video game, "Tennis for Two" (1958), ran on a machine originally built to calculate missile paths.', 'card', true),
    ('Satellite', '🛰️', 'tech', 'rare', 125, 'More than 8,000 satellites orbit Earth, powering GPS, weather forecasts, and the internet.', 'card', true),
    ('Supercomputer', '🖥️', 'tech', 'epic', 240, 'A modern computer chip can hold tens of billions of transistors, each one smaller than a virus.', 'card', true),

    -- WORLD
    ('Eiffel Tower', '🗼', 'world', 'rare', 110, 'The Eiffel Tower grows about six inches taller in summer, because its iron expands in the heat.', 'card', true),
    ('Great Wall', '🧱', 'world', 'rare', 130, 'The Great Wall of China stretches over 13,000 miles — though, despite the myth, you can''t see it from space with the naked eye.', 'card', true),
    ('Statue of Liberty', '🗽', 'world', 'epic', 200, 'A gift from France in 1886, Lady Liberty''s copper skin slowly turned green from over a century of weather.', 'card', true),
    ('Mount Everest', '🏔️', 'world', 'epic', 290, 'Everest grows about a quarter-inch taller each year as tectonic plates keep pushing it upward.', 'card', true),
    ('Colosseum', '🏛️', 'world', 'legendary', 480, 'The Roman Colosseum could hold 50,000 fans and was sometimes flooded to stage mock sea battles.', 'card', true),

    -- SPORTS
    ('Soccer Ball', '⚽', 'sports', 'common', 15, 'Soccer is the world''s most popular sport, played by over 250 million people in more than 200 countries.', 'card', true),
    ('Basketball', '🏀', 'sports', 'common', 18, 'When basketball was invented in 1891, players shot into real peach baskets — someone had to fetch the ball after every score.', 'card', true),
    ('Skateboard', '🛹', 'sports', 'uncommon', 40, 'Skateboarding began as "sidewalk surfing" — a way for surfers to practice when the ocean waves went flat.', 'card', true),
    ('Trophy', '🏆', 'sports', 'uncommon', 45, 'Olympic "gold" medals are mostly silver — they contain only about six grams of real gold.', 'card', true),
    ('Marathon Medal', '🥇', 'sports', 'rare', 90, 'A marathon is 26.2 miles, based on the legend of a Greek messenger who ran from Marathon to Athens with news of victory.', 'card', true),

    -- GOODS
    ('Treasure Chest', '💰', 'goods', 'uncommon', 60, 'Pirate "pieces of eight" were silver coins so valuable that people literally cut them into pieces to make change.', 'card', true),
    ('Crystal Ball', '🔮', 'goods', 'rare', 140, 'A crystal ball is just polished glass — but real quartz crystals are used inside watches to keep near-perfect time.', 'card', true),

    -- SKINS (profile themes — not giftable)
    ('Ocean Theme', '🌊', 'skins', 'epic', 300, 'Profile skin: deep-sea blues with drifting bubbles and gentle currents. For explorers of the deep.', 'skin', false),
    ('Volcano Theme', '🌋', 'skins', 'epic', 320, 'Profile skin: glowing lava flows and rising ember sparks. Bring the heat to your profile.', 'skin', false),
    ('Aurora Theme', '🌠', 'skins', 'legendary', 700, 'Profile skin: shifting northern-lights gradients that ripple across your whole profile.', 'skin', false),
    ('Neon City Theme', '🌃', 'skins', 'legendary', 750, 'Profile skin: a glowing neon skyline for night-owl learners who shine after dark.', 'skin', false),

    -- MYTHIC GRAILS (1,000+ stars — the long-term goals; not giftable, for prestige)
    ('Phoenix', '🔥', 'mythical', 'mythic', 1000, 'In legend, the phoenix bursts into flame and is reborn from its own ashes — a timeless symbol of never giving up.', 'card', false),
    ('Unicorn', '🦄', 'mythical', 'mythic', 1100, 'The unicorn has stood for the rare and the impossible for over 2,000 years. Scotland even made it their national animal.', 'card', false),
    ('Dragon', '🐉', 'mythical', 'mythic', 1250, 'Dragon stories appear on nearly every continent — from China to Europe — long before people could share tales across oceans.', 'card', false),
    ('Mermaid', '🧜', 'mythical', 'mythic', 1400, 'Mermaid myths span the globe. Many "mermaid" sightings by old sailors were probably manatees seen from far away.', 'card', false),
    ('Genie Lamp', '🪔', 'mythical', 'mythic', 1600, 'In the tales of the 1,001 Nights, a genie granted three wishes from a humble brass lamp.', 'card', false),
    ('Crystal Castle', '🏰', 'mythical', 'mythic', 2000, 'A towering castle carved entirely from glowing crystal — one of the rarest grails in Resolution Nation.', 'card', false),
    ('Galaxy Crown', '👑', 'skins', 'mythic', 2500, 'The ultimate profile skin: a crown forged from a living, swirling galaxy. Worn only by legends.', 'skin', false),
    ('Diamond Dragon', '💠', 'mythical', 'mythic', 3500, 'A dragon cut from a single flawless diamond — the ultimate collector''s grail for the most determined learners.', 'card', false),
    ('Wish Star', '✨', 'mythical', 'mythic', 5000, 'The brightest grail of all. Only the most dedicated learners in Resolution Nation will ever hold the Wish Star.', 'card', false);
  END IF;
END $$;
