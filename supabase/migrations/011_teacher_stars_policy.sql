-- Allow teachers to read star transactions for students in their class pods
CREATE POLICY "stars_select_teacher"
  ON star_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pod_members pm
      JOIN pods p ON p.id = pm.pod_id
      WHERE pm.user_id = star_transactions.user_id
        AND p.created_by = auth.uid()
        AND p.type = 'class'
    )
  );
