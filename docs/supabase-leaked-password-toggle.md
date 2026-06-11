# Enabling Supabase Leaked Password Protection

The Supabase security advisor flagged that "Leaked Password Protection" is disabled. This setting checks new and changed passwords against the [HaveIBeenPwned Pwned Passwords API](https://haveibeenpwned.com/Passwords) and rejects ones known to have been leaked in past breaches. It's a free uplift in security for any user signing up with email + password.

## Where it lives

The setting is under Email provider config, not in a top-level "security" section. That's why it's hard to find.

**Direct link** (replace nothing — this is your actual project):

https://supabase.com/dashboard/project/grlmcnoojbedxjoschsk/auth/providers

## Step by step

1. Open the link above. You'll land on the Authentication → Providers page for your project.
2. Find the **Email** provider row in the list. Click it to expand the settings.
3. Scroll down inside the Email panel until you see **Password requirements** or **Password security**.
4. Look for **"Prevent use of leaked passwords"** (sometimes labelled "Leaked password protection" — wording has shifted across Supabase releases).
5. Toggle it **on**.
6. Click **Save** at the bottom of the panel.

That's it. The next time a user signs up or changes their password, Supabase Auth will reject any password that has appeared in a known data breach.

## If you can't find the toggle

A few possibilities:

### 1. You're on the wrong page

It is *not* under:
- Authentication → Policies
- Authentication → URL Configuration
- Settings → Authentication
- Project Settings → API

It is under: **Authentication → Providers → Email** (the Email row, expanded).

### 2. Your project is on the Free plan

Supabase's docs say: *"Leaked password protection is available on the Pro Plan and above."*

If your project is on the Free plan, the toggle may be:
- Visible but disabled with a "Pro plan required" badge, or
- Hidden entirely depending on the dashboard version.

Check your plan at https://supabase.com/dashboard/org/loglluhqwqgpxhqkefjv/billing.

**If you're on Free and don't want to upgrade yet:** that's defensible for the pilot phase. Add it to the [Roadmap Tracker](../Resolution_Nation_Roadmap_Tracker.xlsx) as a Phase 4 task tied to "before first paid contract." Pro is $25/month and you'll need it anyway for daily backups, point-in-time recovery, and increased storage. Worth biting the bullet during Phase 1.

### 3. Dashboard UI has moved (it does sometimes)

If the option isn't where this doc says, the canonical reference is the Supabase docs: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. They keep that page current.

## While you're in there — bonus hardening

Same Email provider page also lets you set:

- **Minimum password length** — set to **12** if it's currently 6 or 8. Industry standard has moved up.
- **Required characters** — pick the strongest option (digits + lowercase + uppercase + symbols).

These are independent of plan tier. Set them now.

## Once enabled, what users will see

If a user tries to set a leaked password:

- New signup: rejected with a "weak password" error. They pick a different one.
- Existing user changing password: rejected with `WeakPasswordError`. Existing leaked passwords already in your database are *not* invalidated — they keep working until the user changes them.

This is non-disruptive for current users and a quiet improvement going forward.
