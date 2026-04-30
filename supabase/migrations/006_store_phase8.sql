-- ============================================================
-- Resolution Nation — Phase 8 Star Store
-- Run in Supabase SQL Editor after 005_workouts_phase6.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- POD MEMBERS — allow students to see podmates (gift search)
-- ─────────────────────────────────────────────

CREATE POLICY "pod_members_select_same_pod" ON pod_members
  FOR SELECT USING (
    pod_id IN (
      SELECT pod_id FROM pod_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- PROFILES — allow students to see podmates' profiles (gift search)
-- ─────────────────────────────────────────────

CREATE POLICY "profiles_select_podmates" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT pm2.user_id
      FROM pod_members pm1
      JOIN pod_members pm2 ON pm1.pod_id = pm2.pod_id
      WHERE pm1.user_id = auth.uid()
        AND pm2.user_id != auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- USER INVENTORY — allow sender to insert gift into recipient's inventory
-- ─────────────────────────────────────────────

CREATE POLICY "inventory_gift_insert" ON user_inventory
  FOR INSERT WITH CHECK (
    gifted_from_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM star_store_items
      WHERE id = item_id AND is_giftable = TRUE
    )
  );

-- ─────────────────────────────────────────────
-- SEED STAR STORE ITEMS
-- ─────────────────────────────────────────────

INSERT INTO star_store_items (name, emoji, category, rarity, star_cost, bio, item_type, is_giftable) VALUES
('Red Fox', '🦊', 'animals', 'common', 10, 'Red foxes can hear a mouse under 3 feet of snow and pounce through it perfectly!', 'card', true),
('Octopus', '🐙', 'animals', 'uncommon', 20, 'Octopuses have 3 hearts, blue blood, and can solve puzzles. Each arm has its own mini-brain!', 'card', true),
('Blue Whale', '🐋', 'animals', 'rare', 35, 'The largest animal ever to exist on Earth — their heart is the size of a small car and beats so slow you could count it.', 'card', true),
('Snow Leopard', '🐆', 'animals', 'epic', 50, 'Snow leopards live at 12,000+ feet in the Himalayas and can leap 50 feet in a single bound!', 'card', true),
('Axolotl', '🦎', 'animals', 'legendary', 100, 'The axolotl can regrow its brain, heart, limbs, and even parts of its spine. Scientists study them to understand healing.', 'card', true),
('Ada Lovelace', '💻', 'history', 'uncommon', 20, 'Ada Lovelace wrote the world''s first computer program in 1843 — over 100 years before computers were invented!', 'card', true),
('Harriet Tubman', '🌟', 'history', 'rare', 30, 'Harriet Tubman led 70+ people to freedom on the Underground Railroad and was never caught. She also served as a spy in the Civil War.', 'card', true),
('Cleopatra', '👑', 'history', 'rare', 30, 'Cleopatra spoke 9 languages and became ruler of Egypt at age 18. She was the first in her dynasty to speak Egyptian.', 'card', true),
('Marie Curie', '🔬', 'history', 'epic', 45, 'Marie Curie was the first person — ever — to win Nobel Prizes in two different sciences: Physics and Chemistry.', 'card', true),
('DNA Helix', '🧬', 'science', 'uncommon', 20, 'Your DNA contains 3 billion letters of genetic code. If you uncoiled all the DNA in your body it would stretch to the sun and back 600 times!', 'card', true),
('T-Rex Fossil', '🦴', 'science', 'rare', 35, 'T-Rex had a bite force of 12,800 pounds — strong enough to crush a car. Their arms were tiny but incredibly strong.', 'card', true),
('Black Hole', '🕳️', 'science', 'epic', 50, 'Black holes are so dense that not even light can escape. The nearest one to Earth is 1,600 light-years away.', 'card', true),
('Great Pyramid', '🔺', 'world', 'rare', 30, 'The Great Pyramid was built with 2.3 million stone blocks. Each block weighs as much as a car. It was the tallest structure on Earth for 3,800 years.', 'card', true),
('Northern Lights', '🌌', 'world', 'epic', 45, 'The Northern Lights (Aurora Borealis) are caused by solar particles from the sun crashing into Earth''s atmosphere at 45 million mph.', 'card', true),
('Gold Bar', '🪙', 'goods', 'uncommon', 15, 'One standard gold bar weighs about 27 pounds and is worth over $700,000. All the gold ever mined would fill about 3.5 Olympic swimming pools.', 'card', true),
('Diamond', '💎', 'goods', 'rare', 35, 'Diamonds are made of pure carbon that spent billions of years under extreme heat and pressure 100 miles underground.', 'card', true),
('Galaxy Theme', '🌌', 'skins', 'epic', 60, 'Unlock the deep space profile theme with swirling galaxies and stardust. A cosmic look for cosmic learners.', 'skin', false),
('Golden Crown', '👑', 'skins', 'legendary', 150, 'The legendary royal gold profile skin with gem accents. Reserved for the most dedicated learners in Resolution Nation.', 'skin', false);
