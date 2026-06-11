#!/usr/bin/env bash
# Resolution Nation — one-shot commit & push helper.
#
# Run this from the project root after reviewing the changes:
#   bash scripts/setup-vercel.sh
#
# What it does:
#   1. Shows you the diff first.
#   2. Stages every change.
#   3. Commits with a structured message.
#   4. Pushes to origin/main.
#
# After it pushes, follow docs/vercel-setup.md to import the
# repo into Vercel and set the CRON_SECRET environment variable.

set -euo pipefail

cd "$(dirname "$0")/.."

echo ""
echo "─────────────────────────────────────────────────────────"
echo "  Step 1 — diff preview"
echo "─────────────────────────────────────────────────────────"
git --no-pager diff --stat
git --no-pager status --short

echo ""
read -rp "Stage and commit all of these changes? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted. Nothing changed."
  exit 1
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo "  Step 2 — staging"
echo "─────────────────────────────────────────────────────────"
git add -A

echo ""
echo "─────────────────────────────────────────────────────────"
echo "  Step 3 — committing"
echo "─────────────────────────────────────────────────────────"
git commit -m "feat: Phase 0/1 security hardening + legal drafts + tracker

Migration 002: drop exploitable star_transactions RLS, add invite-code
parent linking, audit_log, account deletion queue, immutable role trigger.
Migration 003: lock prevent_role_change search_path, revoke EXECUTE from
anon on every new SECURITY DEFINER function.

UI:
- app/dashboard/student/invite-parent — student mints parent invite code
- app/parent/link — rewritten to redeem code instead of enumerating users
- app/dashboard/settings/delete-account — in-app account deletion (Apple/Google req)

API:
- /api/parent/link/code — POST mints code
- /api/parent/link — POST redeems code
- /api/account/delete — POST/DELETE/GET deletion lifecycle
- /api/cron/hard-delete-accounts — Vercel cron worker, gated by CRON_SECRET

Infrastructure:
- lib/rate-limit.ts — in-memory token bucket; wired to 3 public routes
- vercel.json — nightly cron at 03:17 UTC

Legal drafts (attorney review required) in legal/:
- privacy-policy, terms-of-service, childrens-privacy-notice
- ny-parent-bill-of-rights, subprocessors, dpa-checklist

Docs:
- docs/star-store-positioning — earned-not-purchased policy locked
- docs/attorney-outreach + docs/attorney-emails — outreach package
- docs/cron-secret-setup, docs/vercel-setup, docs/supabase-leaked-password-toggle

Tracker:
- Resolution_Nation_Production_Roadmap.docx
- Resolution_Nation_Roadmap_Tracker.xlsx
- CHANGES.md
"

echo ""
echo "─────────────────────────────────────────────────────────"
echo "  Step 4 — pushing to origin/main"
echo "─────────────────────────────────────────────────────────"
current_branch=$(git rev-parse --abbrev-ref HEAD)
git push origin "$current_branch"

echo ""
echo "✓ Done. Next:"
echo "  Open docs/vercel-setup.md for the Vercel import + env var steps."
