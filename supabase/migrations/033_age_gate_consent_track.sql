-- 033: Age gate + consent tracking (RN-24/RN-25).
--
-- Data-minimization: we never store DOB. The signup client computes age
-- locally and sends only a boolean; under-13 self-signups are blocked
-- client-side AND have no path here (they cannot create an auth user
-- through the UI; roster-created accounts come from the teacher flow).
--
--   is_under_13   TRUE/FALSE when known (self-signup asserts 13+ => FALSE;
--                 teacher-rostered students may be TRUE), NULL when unknown.
--   consent_track 'self_over_13'  — self-signup asserting 13 or older
--                 'school'        — account created by a teacher (school
--                                   provides COPPA consent for educational use)
--                 'parent'        — reserved for a future direct-to-family flow
--                 NULL            — legacy accounts predating this migration

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_under_13 BOOLEAN;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_track TEXT
  CHECK (consent_track IN ('self_over_13', 'school', 'parent'));

-- Extend the signup trigger to persist the new metadata keys.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, grade, is_under_13, consent_track)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    NULLIF(NEW.raw_user_meta_data->>'grade', ''),
    CASE NEW.raw_user_meta_data->>'is_under_13'
      WHEN 'true' THEN TRUE
      WHEN 'false' THEN FALSE
      ELSE NULL
    END,
    CASE
      WHEN NEW.raw_user_meta_data->>'consent_track' IN ('self_over_13', 'school', 'parent')
        THEN NEW.raw_user_meta_data->>'consent_track'
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
