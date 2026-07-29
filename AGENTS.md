# Briq Foundation WhatsApp CRM — Agent Guide

## Scope and authority

This file applies to the entire repository. Follow more specific `AGENTS.md`
files if any are added below this directory in the future.

Treat current source code, migrations, and explicit user instructions as the
authority. `briq-crm-test-report.txt` is historical test evidence; route names
or behavior in that report may be older than the current implementation.

## Project identity

- This is a production-oriented, single-business CRM for Briq Foundation.
- It is not a multi-tenant SaaS product. Do not introduce tenant abstractions,
  tenant IDs, organization switching, or per-customer configuration unless the
  user explicitly changes the product scope.
- AI Digital Tamizha acts as the technology provider/data processor.
- The system combines WhatsApp conversations, AI/human reply control, lead
  tracking, appointments, reminders, analytics, and agent configuration.
- The live application is hosted at `https://whatsapp-crm-rosy.vercel.app`.
  The authenticated WhatsApp connection screen is `/main/settings`.

## Technology

- Next.js 14 App Router, React 18, TypeScript, and Tailwind CSS.
- Supabase/PostgreSQL for application data.
- WhatsApp Cloud API and WhatsApp Embedded Signup.
- OpenRouter for AI responses.
- 3Sigma webhook integration.
- A custom `server.ts` starts the application and scheduled jobs.

Do not enable Next.js `output: "standalone"`. The custom server and cron
bootstrap require a normal Next.js build, as documented in `next.config.mjs`.

## Current route model

- `/home` is the password-protected landing/login entry.
- `/main/chat`, `/main/calendar`, `/main/crons`, `/main/agent`, and
  `/main/settings` are the current CRM screens.
- `/dashboard/*`, `/cron/*`, and `/analytics` provide administrative views.
- Protected API routes require the application session.
- WhatsApp and 3Sigma webhook routes must remain public so their providers can
  deliver events.

The test report references `/whatsapp/*`; those paths describe an earlier UI
layout. Verify current routes from `app/` and `middleware.ts` before testing.

## WhatsApp architecture — critical invariants

The WhatsApp goal is coexistence, not number migration:

- Briq's existing number must continue working in the WhatsApp Business App.
- The same number must also work through Cloud API.
- Business App and Cloud API activity must be synchronized through Meta's
  coexistence webhooks.

Preserve these rules:

1. Embedded Signup must launch with:
   - `featureType: "whatsapp_business_app_onboarding"`
   - `sessionInfoVersion: "3"`
   - `response_type: "code"`
   - `override_default_response_type: true`
2. Accept only `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` as the successful
   coexistence completion event. `FINISH` belongs to the normal Cloud API flow.
3. Exchange the authorization code server-side using `client_id`,
   `client_secret`, and `code`. Do not add an OAuth `redirect_uri` unless Meta's
   Embedded Signup documentation explicitly changes.
4. Never trust WABA or phone-number ownership only because the browser supplied
   an ID. Use the exchanged token to query Meta.
5. Mark the connection successful only after Meta confirms:
   - `is_on_biz_app === true`
   - `platform_type === "CLOUD_API"`
6. Do not call `POST /{phone_number_id}/register` for coexistence. The number
   remains registered to the WhatsApp Business App.
7. Subscribe the app to the authorized WABA and request the one-time contact
   and history synchronization within Meta's permitted onboarding window.
8. Keep the single connection in `whatsapp_config` row `id = 1`. This fixed row
   is intentional for the single-business design.
9. Handle Meta `ERROR` and `CANCEL` events, clear temporary authorization data,
   and allow a safe retry.

Primary Embedded Signup files:

- `components/dashboard/tabs/SettingsTab.tsx`
- `app/api/meta/embedded-signup/route.ts`
- `app/api/meta/connection/route.ts`
- `lib/crypto.ts`
- `lib/whatsapp.ts`
- `supabase/migrations/0007_whatsapp_config.sql`

When reviewing or changing Embedded Signup, compare against Meta's current
official implementation, Tech Provider onboarding, and WhatsApp Business App
coexistence documentation. Do not substitute third-party tutorials.

## Secrets and environment

- Never print, log, commit, or expose access tokens, authorization codes,
  `META_APP_SECRET`, Supabase service keys, dashboard passwords, webhook
  secrets, or `TOKEN_ENCRYPTION_KEY`.
- Do not open or read `.env.local` unless the user explicitly authorizes it.
  Ask the user to confirm whether a value is set without requesting its value.
- `NEXT_PUBLIC_*` variables are browser-visible by design; secrets must never
  use that prefix.
- Production environment changes require updating the hosting environment and
  redeploying. A local `.env.local` does not update the Vercel deployment.
- Embedded Signup requires a valid 32-byte `TOKEN_ENCRYPTION_KEY` and migration
  `0007_whatsapp_config.sql` before a live onboarding attempt.
- Do not weaken WhatsApp webhook `X-Hub-Signature-256` verification.

## Database changes

- Treat Supabase migrations as append-only after deployment.
- Create a new numbered migration for schema changes; do not rewrite historical
  migrations unless the user confirms they have never been deployed.
- Preserve RLS and service-role-only access for sensitive tables.
- Never store Meta access tokens in plaintext.
- Integration tests must not point at production data.

## Working rules

- Keep changes narrowly scoped to the user's request.
- Preserve existing user changes and unrelated dirty worktree files.
- Diagnose before fixing when the user asks only for an explanation or review.
- For WhatsApp onboarding changes, explain each behavioral change and obtain
  approval when the user requests a one-by-one workflow.
- Do not trigger real WhatsApp messages, template sends, reminders, external
  webhooks, paid API calls, or live onboarding without explicit user approval.
- Prefer read-only browser checks. Use test recipients and test credentials
  when a send-path test is explicitly authorized.
- Keep server-only code out of client components.
- Validate untrusted webhook, request-body, and Meta event data.
- Avoid logging raw provider payloads when they can contain personal data.

## Verification commands

Choose checks proportional to the change:

```text
npm run typecheck
npm run check
npm run test:integration
node scripts/test-analytics-pure.mjs
```

- Run `npm run typecheck` for focused TypeScript changes.
- Run `npm run check` for a full typecheck and production build when practical.
- Run integration tests only with an isolated test environment.
- Browser tests require authentication. Never place the dashboard password in
  source files, reports, screenshots, or command output.
- For Embedded Signup, compilation is not sufficient: perform a controlled
  Meta popup test after confirming production variables, Meta allowed domains,
  Facebook Login for Business configuration, webhook subscriptions, and the
  Supabase migration.

## Historical test baseline

`briq-crm-test-report.txt` records:

- A complete authenticated browser run with login plus 15 routes passing.
- No paid WhatsApp sends during the read-only suite.
- Successful rendering of chats, calendar, crons, agent settings, lead views,
  cron logs, analytics, and theme persistence.
- A corrected analytics pie-label accessibility artifact, followed by a
  passing build, 40/40 pure analytics checks, and browser verification.
- A harmless favicon 404 noted at that time.

Use this baseline for regression awareness, not as proof that the current
deployment or current Meta configuration is healthy.

## Definition of done

A change is complete when:

- The requested behavior is implemented without expanding product scope.
- Relevant security and single-business invariants remain intact.
- Appropriate checks pass, or any unrun check is explicitly reported.
- Database or environment prerequisites are clearly stated.
- No real external communication was triggered without approval.
- The handoff names changed files, behavior, verification, and remaining risk.
