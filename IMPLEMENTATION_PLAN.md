# FlickMV — Implementation Plan (Gap → MVP → v1)

Status snapshot of the codebase vs. PRD as of 2026-05-18. Each task lists the files to touch, the exact change, and a verification step. Order is dependency-aware: anything in **Sprint 1** must land before launch; **Sprint 2** unlocks revenue; **Sprint 3** is post-launch polish; **Sprint 4** is the long-running DevOps track that should start in parallel with Sprint 1.

Legend: `[B]` = launch blocker, `[R]` = revenue, `[P]` = polish, `[O]` = ops.

---

## Sprint 1 — Launch Blockers (target: 1 week)

### 1.1 [B] Enable Supabase realtime for collaborative tables

**Problem:** [src/hooks/useWatchlistDetail.ts](src/hooks/useWatchlistDetail.ts) subscribes to `postgres_changes` on `watchlist_items`, but the publication isn't enabled — collaborators don't see each other's edits.

**Steps:**
1. Create `supabase/migrations/002_enable_realtime.sql`:
   ```sql
   alter publication supabase_realtime add table public.watchlist_items;
   alter publication supabase_realtime add table public.watchlist_collaborators;
   alter publication supabase_realtime add table public.notifications;
   alter publication supabase_realtime add table public.activity_feed;
   ```
2. Run `supabase migration up` locally; verify in Studio → Database → Publications.
3. When linking a hosted project later, the same migration runs on `supabase db push`.

**Verify:** On two devices/simulators, sign in as two different users, add one as a collaborator to a watchlist, add a movie on device A — it appears on device B within 1s without a refresh.

---

### 1.2 [B] Server-side push notification dispatch

**Problem:** [src/lib/notifications.ts](src/lib/notifications.ts) registers Expo push tokens; the `notifications` table stores rows; but **nothing pushes to the device**. Friend requests, collaboration invites, etc. only show up when the app polls.

**Steps:**
1. Add a `push_tokens` table — store Expo tokens per user:
   ```sql
   -- supabase/migrations/003_push_tokens.sql
   create table public.push_tokens (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references public.users(id) on delete cascade,
     token text not null unique,
     platform text not null check (platform in ('ios','android')),
     created_at timestamptz default now()
   );
   create index push_tokens_user on push_tokens(user_id);
   alter table push_tokens enable row level security;
   create policy "own tokens" on push_tokens for all using (auth.uid() = user_id);
   ```
2. Update [src/lib/notifications.ts](src/lib/notifications.ts) `registerPushToken` to upsert into `push_tokens` (currently it stores nowhere durable — fix that too).
3. Create Edge Function `supabase/functions/send-push/index.ts`:
   - Trigger: `pg_net` HTTP POST from a DB trigger on `notifications` insert, OR a queued worker.
   - Body: fetch `push_tokens` for `notifications.user_id`, POST to `https://exp.host/--/api/v2/push/send` with `{ to: [tokens], title, body, data }`.
4. Add DB trigger:
   ```sql
   -- supabase/migrations/004_notification_push_trigger.sql
   create or replace function public.dispatch_push_on_notification()
   returns trigger language plpgsql security definer as $$
   begin
     perform net.http_post(
       url := current_setting('app.settings.push_function_url'),
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
       body := to_jsonb(new)
     );
     return new;
   end; $$;
   create trigger on_notification_push
     after insert on public.notifications
     for each row execute function public.dispatch_push_on_notification();
   ```
5. Set the two settings via `supabase secrets set` or `ALTER DATABASE ... SET app.settings.* = ...`.

**Verify:** Insert a notifications row manually in Studio; the device receives a push within 5s.

---

### 1.3 [B] Sentry crash + error monitoring

**Steps:**
1. `npx @sentry/wizard@latest -i reactNative` from the project root. Wizard edits `app.json`, adds `@sentry/react-native`, configures source-map upload for EAS builds.
2. Wrap [app/_layout.tsx](app/_layout.tsx) root with `Sentry.wrap()` per the wizard's output.
3. Add an Error Boundary fallback at the root.
4. Set `SENTRY_AUTH_TOKEN` in EAS secrets later (Sprint 4).

**Verify:** Trigger `throw new Error('sentry-test')` in a button handler in dev; confirm it appears on sentry.io within a minute.

---

### 1.4 [B] ESLint + Prettier baseline

**Steps:**
1. `npx expo install eslint-config-expo prettier eslint-plugin-prettier`
2. Add `.eslintrc.cjs`:
   ```js
   module.exports = {
     extends: ['expo', 'prettier'],
     plugins: ['prettier'],
     rules: { 'prettier/prettier': 'warn' },
   };
   ```
3. Add `.prettierrc`: `{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100 }`
4. Add scripts to [package.json](package.json): `"lint": "eslint ."`, `"format": "prettier --write ."`
5. Run `npm run lint -- --fix` once to clean up the existing tree.

**Verify:** `npm run lint` exits 0.

---

### 1.5 [B] Convert worktree-only fixes into a migration

**Problem:** The OTP-auth fix in [supabase/functions/otp-auth/index.ts](supabase/functions/otp-auth/index.ts) attaches synthetic emails to phone users. The `handle_new_user` trigger in [supabase/migrations/001_flickmv_schema.sql](supabase/migrations/001_flickmv_schema.sql) doesn't capture email — fine for now, but **the trigger should ignore synthetic emails** for the `public.users` table if/when an email column is added there.

**Steps:**
1. Audit `handle_new_user` trigger to ensure it stays compatible.
2. Document the synthetic email format (`phone+{e164}@phone.flix.local`) at the top of [supabase/functions/otp-auth/index.ts](supabase/functions/otp-auth/index.ts) so future maintainers understand.

**Verify:** New user signup flows through phone → verify → profile-setup without errors.

---

## Sprint 2 — Revenue (target: 1–2 weeks)

### 2.1 [R] Integrate RevenueCat for IAP

RevenueCat handles Apple IAP + Google Billing + receipt validation + entitlement sync to your backend. Lowest-effort path for cross-platform.

**Steps:**
1. `npx expo install react-native-purchases react-native-purchases-ui`
2. Add to `app.json` plugins:
   ```json
   { "plugins": [["react-native-purchases", { "ios": { "useFrameworks": "static" } }]] }
   ```
3. Create products in App Store Connect + Google Play Console (`flickmv_premium_monthly`, `flickmv_premium_plus_monthly`, yearly variants).
4. Register the same product IDs in the RevenueCat dashboard; create entitlements `premium`, `premium_plus`.
5. Create `src/lib/purchases.ts`:
   ```ts
   import Purchases from 'react-native-purchases';
   export const initPurchases = (userId: string) => {
     Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_KEY!, appUserID: userId });
   };
   export const getOfferings = () => Purchases.getOfferings();
   export const purchasePackage = (pkg) => Purchases.purchasePackage(pkg);
   export const getCustomerInfo = () => Purchases.getCustomerInfo();
   ```
6. Call `initPurchases(session.user.id)` from [app/_layout.tsx](app/_layout.tsx) after session resolves.
7. Replace [src/components/ui/PaywallSheet.tsx](src/components/ui/PaywallSheet.tsx) with a real product picker that calls `purchasePackage`.
8. Configure RevenueCat → Supabase webhook (RC → Integrations → Webhooks) hitting a new Edge Function `supabase/functions/rc-webhook/index.ts` that:
   - Verifies the `Authorization` header against a shared secret.
   - Updates `public.users.subscription_tier` and inserts a row into `public.subscriptions`.

**Verify:** Sandbox-buy a subscription on TestFlight; `subscription_tier` in `users` flips to `premium`; paywall stops appearing; cancellation in App Store → tier drops to `free` within 30s.

---

### 2.2 [R] Tier gating audit

**Steps:**
1. Audit every read of `subscription_tier` (`grep -r "subscription_tier" src/`). [src/hooks/useSubscription.ts](src/hooks/useSubscription.ts) is the canonical hook.
2. Confirm gates fire for: max watchlists (free: 3), max collaborators per list (free: 2), XP multiplier (premium: 1.5x).
3. Add a tiny "Manage subscription" button in [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx) → opens RevenueCat's `managementURL` from `getCustomerInfo()`.

**Verify:** Free user creating a 4th watchlist hits the paywall; after upgrade, the create button works without re-launching the app.

---

## Sprint 3 — Feature Polish (target: 1 week)

### 3.1 [P] Expand search to users + watchlists

**Problem:** [src/hooks/useSearch.ts](src/hooks/useSearch.ts) only calls TMDB.

**Steps:**
1. Add a search-mode tab UI to the search screen (Media / Users / Watchlists).
2. Add hooks:
   - `useUserSearch(q)`: `supabase.from('users').select('id, username, display_name, avatar_url').ilike('username', '%' || q || '%').limit(20)`
   - `useWatchlistSearch(q)`: `supabase.from('watchlists').select('id, title, owner_id, item_count').eq('visibility', 'public').ilike('title', '%' || q || '%').limit(20)`
3. Wire into the existing search UI with three result sections.

**Verify:** Typing a known username surfaces the user; typing a public watchlist title surfaces it.

---

### 3.2 [P] Add "Continue Watching" + "Popular Watchlists" home sections

**Steps:**
1. "Continue Watching": query `watchlist_items` where `added_by = auth.uid()` and `watched = false`, ordered by `created_at desc`, limit 10. Render as a new [src/components/home/ContinueWatchingSection.tsx](src/components/home/ContinueWatchingSection.tsx).
2. "Popular Watchlists": new RPC `get_popular_watchlists` returning public watchlists ordered by `item_count + collaborator_count`, limit 10. Render via existing [PopularWatchlistsSection](src/components/home/PopularWatchlistsSection.tsx).
3. Mount both inside [app/(tabs)/index.tsx](app/(tabs)/index.tsx).

**Verify:** Items appear on home; tapping deep-links to the title / watchlist detail.

---

### 3.3 [P] Badges + ranking tiers

**Problem:** `leaderboard_entries.badges_earned` and `users.level` exist but are never written.

**Steps:**
1. Define badge catalog in `src/constants/badges.ts`: `{ id, name, icon, criteria }`. Examples: `first_watchlist`, `social_butterfly` (10 friends), `binge_master` (100 watched), `top_10_weekly`.
2. Create DB function `award_badge(p_user uuid, p_badge text)` that appends to `users.badges_earned` if not already there, inserts a notification.
3. Trigger badge awards in `award_xp` paths and in nightly leaderboard ranking job (Sprint 4.3).
4. Add a "Badges" section to [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx) and [app/user/[id].tsx](app/user/[id].tsx) rendering the user's earned badges.
5. Compute `level` from `xp_total` via a Postgres generated column or trigger: `level = floor(sqrt(xp_total / 100)) + 1`.

**Verify:** Creating the first watchlist → badge shows in profile + a notification fires.

---

### 3.4 [P] Share link generation

**Problem:** Watchlists are spec'd as shareable; no UI exists.

**Steps:**
1. Add a deep-link config in [app.json](app.json): `"scheme": "flickmv"` and `"associatedDomains": ["applinks:flickmv.app"]`.
2. Add a "Share" button on [app/watchlist/[id].tsx](app/watchlist/[id].tsx) using `expo-sharing`:
   ```ts
   import * as Sharing from 'expo-sharing';
   Sharing.shareAsync(`https://flickmv.app/watchlist/${id}`);
   ```
3. Handle inbound deep links in [app/watchlist/[id].tsx](app/watchlist/[id].tsx) — already works via expo-router file-based routing.

**Verify:** Share button opens system sheet; pasting the URL in Safari and tapping opens the app on the right screen.

---

## Sprint 4 — DevOps + Quality (parallel, ongoing)

### 4.1 [O] EAS Build + Submit

**Steps:**
1. `npx eas init` → creates [eas.json](eas.json), generates a project ID.
2. Configure three profiles: `development` (dev client), `preview` (internal testers), `production` (App Store / Play Store).
3. `eas build --profile preview --platform all` once to validate.
4. Add secrets: `eas secret:create --name REVENUECAT_KEY --value ...` for every `EXPO_PUBLIC_*` and server-only key.

**Verify:** A `preview` build installs on a real device via the EAS link.

---

### 4.2 [O] GitHub Actions CI

**Steps:**
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     lint-and-typecheck:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: npm }
         - run: npm ci
         - run: npm run lint
         - run: npx tsc --noEmit
   ```
2. Add `eas-build.yml` workflow that runs on push to `main` and calls `eas build --non-interactive --profile preview`.

**Verify:** Open a PR with a deliberate `any` — CI fails on typecheck.

---

### 4.3 [O] Scheduled leaderboard rollover

**Steps:**
1. Create Edge Function `supabase/functions/rollover-leaderboard/index.ts`:
   - Compute weekly_xp, monthly_xp per user from `activity_feed` xp deltas in the past 7 / 30 days.
   - Upsert into `leaderboard_entries`.
   - Award `top_10_weekly` badge to the top 10.
2. Schedule via Supabase cron extension:
   ```sql
   select cron.schedule('rollover-leaderboard-daily', '0 3 * * *',
     $$ select net.http_post('https://.../functions/v1/rollover-leaderboard', '{}', 'application/json') $$);
   ```

**Verify:** Manually invoke the function; `leaderboard_entries` recomputes; top 10 receives the badge.

---

### 4.4 [O] Tests

Aim for confidence on critical paths, not coverage targets.

**Unit (Jest):**
- `src/stores/authStore.ts` — session setting, profile fetch error paths.
- `src/hooks/useSubscription.ts` — tier gates.
- Phone E.164 normalization in [supabase/functions/otp-auth/index.ts](supabase/functions/otp-auth/index.ts).

**Setup:** `npm i -D jest jest-expo @testing-library/react-native @testing-library/jest-native`. Add `"test": "jest"` and a `jest.config.js` using `jest-expo` preset.

**E2E (Maestro):**
- Flow 1: phone → OTP → profile-setup → tabs.
- Flow 2: create watchlist → add title → reorder.
- Flow 3: send friend request → accept on second account → activity feed shows event.

Maestro YAML lives in `.maestro/`. Run with `maestro test .maestro/auth-flow.yaml`.

**Verify:** All three Maestro flows green on a clean install.

---

### 4.5 [O] Analytics (PostHog)

**Steps:**
1. `npm i posthog-react-native`
2. Init in [app/_layout.tsx](app/_layout.tsx) with `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`.
3. Identify user with `posthog.identify(session.user.id, { tier: profile.subscription_tier })` on auth.
4. Track key events: `signup_completed`, `watchlist_created`, `title_added`, `friend_request_sent`, `paywall_viewed`, `subscription_purchased`.

**Verify:** Events arrive in the PostHog dashboard.

---

## Cross-cutting cleanup (do alongside whichever sprint)

- **AsyncStorage migration audit** — confirm [src/lib/supabase.ts](src/lib/supabase.ts) uses `expo-secure-store` (verified during audit; flag if anything regresses).
- **Image caching** — replace `<Image source={{uri}}/>` with `expo-image` everywhere posters render ([src/components/media/PosterCard.tsx](src/components/media/PosterCard.tsx) etc.). 2× scroll perf in lists.
- **DB indexes** — once production data exists, run `pg_stat_statements` and add missing indexes (likely on `activity_feed (actor_id, created_at)` and `notifications (user_id, is_read, created_at)`; second one already exists).
- **Per-route lazy loading** — large screens like [app/(tabs)/leaderboard.tsx](app/(tabs)/leaderboard.tsx) can defer chart libs with `React.lazy` + `<Suspense>`.

---

## Recommended ordering for a 4-week MVP push

| Week | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|---|---|---|---|---|
| 1 | 1.1, 1.3, 1.4, 1.5 |  |  | 4.2 (CI scaffold), 4.5 (PostHog) |
| 2 | 1.2 (push dispatch) | 2.1 (RevenueCat integration) |  | 4.1 (EAS Build) |
| 3 |  | 2.2 (gating audit) | 3.1, 3.2 | 4.4 (Maestro flows) |
| 4 |  |  | 3.3, 3.4 | 4.3 (cron job), polish |

End of week 4: app passes Maestro flows, accepts real payments in TestFlight, has Sentry + PostHog feeding data, and CI gates every PR. That's the MVP shipping bar.

---

## Out of scope (post-MVP backlog)

- Watch parties (PRD § excluded)
- AI recommendations (PRD § excluded)
- Voice/video chat (PRD § excluded)
- Streaming integrations (PRD § excluded)
- Stripe (web) — only relevant if a web companion ships
- Localization beyond English (Hindi section is content-only, not i18n)
- A/B testing infrastructure (PostHog feature flags cover this minimally)
