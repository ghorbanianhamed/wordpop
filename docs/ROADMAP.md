# Roadmap

Each item below is also a GitHub issue (run `scripts/create_github_issues.sh` once to create them).

## v2.0 – Multi-user PWA ✅
- User accounts (email + password)
- Categories, with a word in several categories
- Notifications per category on/off
- Notification schedule: frequency, active hours, days, daily limit, pause
- Per-user time zones
- Spaced repetition quiz
- Progress page
- Starter word lists
- iPhone "Add to Home Screen" guide
- Admin statistics (retention)

## v2.1 – Launch to testers
- Deploy to a public HTTPS address and add the live demo link to the README
- Invite 10–30 testers, collect feedback with a "Send feedback" link
- Measure day-1 / day-7 / day-28 retention on the admin page

## v2.2 – Listening, sharing and WordPop Plus ✅
- Listen to every entry and example (phone voices); pronunciation for single words (IPA, pinyin)
- Natural voices with Azure AI Speech – Clara, Liam (Canadian), Ava, Andrew (American)
- WordPop Plus: Stripe subscriptions (CA$0.99/month, CA$9.99/year), 7-day free trial,
  in-app payment (embedded Checkout), Customer Portal, signed webhooks
- Import / export entries as CSV
- Share to WordPop (Web Share Target) and an iPhone Shortcut
- Select & delete many entries; flashcard view; "No category" reminder switch
- Ready-made categories start empty; updates show on the first open

## v2.3 – Growth
- Invite 20–50 testers and track retention on the admin page
- Google Play listing (Trusted Web Activity)
- AI auto-fill (meaning, example, translation) for any language – a WordPop Plus feature
- "Say it" pronunciation practice
- Sign in with Google or a magic-link email
- Alembic database migrations

## v3 – App stores
- iPhone app on the same REST API and database (existing accounts, data and subscriptions carry over)
- Apple Push Notification service; token sign-in for the native app
- In-app purchases through Apple / Google (e.g. RevenueCat) next to Stripe on the web
