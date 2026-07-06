# GitHub repo hardening (RN-5) — ~5 minutes of clicking

Repo: `klynch-creator/resolution-nation`. All of this is in **Settings** on the repo page (github.com → repo → Settings). Free-plan note: branch protection on private repos requires GitHub Pro or making do with rulesets — **Rulesets work on the free plan** and are the modern replacement, so use those.

## 1. Branch protection (Settings → Rules → Rulesets → New ruleset)

- Name: `protect-main`, Enforcement: **Active**
- Target branches: **Include default branch** (main)
- Enable:
  - ✅ Restrict deletions
  - ✅ Block force pushes
  - ✅ Require a pull request before merging — with you as the only committer this mostly protects against accidents; if it slows you down too much, keep just the two above.

## 2. Secret scanning (Settings → Advanced Security)

- ✅ **Secret Protection** → Enable (free for public repos; available on private repos too as of 2025 pricing changes — if it asks for payment, at minimum enable **Push protection** if offered)
- ✅ **Push protection** → Enable (blocks commits containing keys — this is the one that saves you)

## 3. Dependabot (Settings → Advanced Security / Code security)

- ✅ Dependabot **alerts** → Enable
- ✅ Dependabot **security updates** → Enable (auto-PRs for vulnerable deps)
- Optional: Dependabot **version updates** — skip for now; security updates are the important half.

## 4. Account hygiene (github.com → your avatar → Settings)

- ✅ Password + **2FA** (Security → Two-factor authentication) — use an authenticator app, save recovery codes somewhere offline
- ✅ Check **Applications → Authorized OAuth Apps** — remove anything you don't recognize

## 5. Known burned secret

The sample CRON_SECRET committed in docs/ + git history is treated as burned (tracker RN-103) — generate a fresh one when you deploy to Vercel; never reuse the committed value.

## Skipped deliberately

- GitHub **org** (tracker says "GitHub org"): a personal repo is fine at this stage; create an org when there's a second person. Moving the repo later is one click and redirects are automatic.
- CODEOWNERS / required reviews: pointless solo.

When done, mark RN-5 Done in the tracker.
