-- ============================================================
-- Resolution Nation — Phase 9 Analytics
-- Run in Supabase SQL Editor after 006_store_phase8.sql
-- No schema changes needed for Phase 9.
-- ============================================================

-- Teachers need to read star_transactions for their students
-- to show "Total Stars Earned" on the analytics dashboard.
CREATE POLICY "star_transactions_teacher_read" ON star_transactions
  FOR SELECT USING (
    user_id IN (
      SELECT pm.user_id
      FROM pod_members pm
      JOIN pods p ON pm.pod_id = p.id
      WHERE p.created_by = auth.uid()
        AND pm.role != 'admin'
    )
  );
