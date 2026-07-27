# Commit + push these changes (run on your Mac)

I could not commit from my sandbox. The folder is mounted in a way that lets
processes *create* files under `.git` but not *unlink* them, so `git` cannot
clear its own lock files. Nothing is broken — `HEAD` is untouched at `d35a855`,
your working tree is intact, and every change is saved to disk.

Two bits of cleanup first, both caused by my failed attempts:

```bash
cd ~/Documents/"Resolution Nation"

# 1. Remove the stuck index lock (no git process is actually running)
rm -f .git/index.lock

# 2. Remove 6 stray temp objects git couldn't clean up (harmless, but tidy)
find .git/objects -name 'tmp_obj_*' -delete
```

Then verify nothing sensitive is about to be committed:

```bash
git add -A
git diff --cached --name-only | grep -iE '\.pdf|\.env|backup-code' || echo "clean"
```

That should print `clean`. If it prints a filename, stop and tell me.

Then commit and push:

```bash
git commit -F docs/COMMIT_MSG.txt
git push origin main
```

## After pushing

The database migrations are **already live** in Supabase. The code changes are
not live until Vercel builds this commit. The two are compatible in both
directions — the currently deployed code does not break against the new
grants — so there's no rush window to worry about.

One behaviour change to be aware of once deployed: `/api/cron/hard-delete-accounts`
no longer accepts `?token=<secret>`. Vercel Cron already uses the
`Authorization: Bearer` header so it's unaffected, but if you have any external
scheduler pointed at that URL with a query-string token, it will start
returning 403. See item A3 in `security-followups-kaelan.md`.
