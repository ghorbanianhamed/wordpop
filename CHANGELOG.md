# Changelog

## [Unreleased]
### Added
- **Rename categories and change their colour** on the Categories page (✎); a name you already use gets a clear message instead of an error
- **Ready for Google Play** (Trusted Web Activity): `/.well-known/assetlinks.json` from `ANDROID_PACKAGE_NAME` / `ANDROID_SHA256_CERT_FINGERPRINTS`, an account-deletion page, the Play version detected from `?source=play` or the Android referrer (WordPop Plus isn't sold there; subscribers keep it), a step-by-step guide with store texts and Data safety answers, a feature graphic and six 1080×1920 screenshots in `docs/google-play/`
- **WordPop Plus**: the natural voices become a subscription – CA$0.99/month or CA$9.99/year – after a 7-day free trial that starts with the first listen (no card needed). Payment through Stripe Checkout, "Manage subscription" through the Stripe Customer Portal, status kept in sync by a signed webhook. Samples in Settings stay free, admins always have Plus, deleting an account cancels its subscription, and without Stripe settings the voices stay free. New Terms page; Privacy page mentions Stripe and Azure
- **Share to WordPop**: the installed app appears in the Share menu (Android, Chrome/Edge on computers) – shared text opens in "Add" ready to save, with links and quote marks removed, even if you have to sign in first. iPhone: Settings → Add from other apps explains a one-time Shortcut. Long-pressing the app icon offers "Add a word"
- **CSV import & export** (Settings → Import & export): export all entries or one category; import a spreadsheet with text, meaning, example and categories – header names like "word" or "translation" are understood, commas/semicolons/tabs and older Excel encodings work, duplicates are skipped, missing categories are created, and problem lines are listed. A sample file can be downloaded
- "No category" switch on the Categories page: entries without a category can now be switched off too, so turning on a single category sends only that category's entries (before, uncategorized entries were always sent)
- Only the entry text is required when adding a word, phrase or quote; "Meaning or note" and "Example" are optional (English entries are still filled from the dictionary when possible)
- Phone keyboards start the "Add a word, phrase or quote" box with a capital letter
- **Listen** on every entry: dictionary recordings when available, otherwise the phone's own voice in the entry's language (Chinese, Hindi, Japanese, ... from the script; French, Spanish, German, ... from the category name)
- 🔊 next to every example (in the list and in the quiz) reads the example aloud
- Pronunciation line for single English words (offline IPA from the CMU Pronouncing Dictionary when the dictionary has none) and pinyin for short Chinese words; phrases and sentences show no line, and older entries are updated automatically
- Opening an entry in the list shows it as an amber flashcard: the entry on the front, a fold line, then the meaning

- Canadian English voice: English entries and examples are read by a Canadian voice when the device has one (natural-sounding voices first, then American); a new **Voice** setting lets each device pick any English voice, and dictionary recordings prefer the North American one
- **Select and delete several entries at once** on the Words page: Select → tick entries (or "Select all", which follows the current search and category) → Delete
- **Natural voices**: four human-sounding English voices made on the server with Azure AI Speech – Clara (Canadian woman, default), Liam (Canadian man), Ava (American woman) and Andrew (American man). Pick one in Settings → Voice (▶ plays a sample); it reads entries and examples on every device. Each recording is made once and stored, so repeat listens are instant and free. The phone's own voice remains available and is the automatic fallback

### Fixed
- Adding an entry: a **Cancel** button empties the form; the **Example** box takes several examples, one per line (Enter starts a new line instead of saving), and each shows on its own line
- Editing an entry: categories you tap in the flashcard now look selected (dark brown with a ✓) – before, the choice was saved but the chips didn't change, so it looked like they couldn't be selected; the Save button is now easy to see on the amber card
- In-app payment form showed "Something went wrong": it now uses Stripe's current names (`embedded_page` sessions, `createEmbeddedCheckoutPage`, versioned Stripe.js) with the older ones as a fallback, and the box offers a link to Stripe's own payment page if the form still has a problem
- WordPop Plus checkout: if the saved Stripe customer no longer exists (e.g. after changing the Stripe key, or moving from test to live), a new one is created automatically instead of failing
- Selecting entries: tapping the checkbox itself now ticks it (before, only tapping the entry's text worked)
- App updates now show on the first open after a deploy: the new version installs fresh files (not copies from the browser cache), the app reloads itself once the update is ready (never while you are typing), and it checks for updates whenever it is brought back to the screen

### Changed
- The sign-in screen opens on **Sign in** for people who have signed in on that device before (and on **Create account** for everyone else); deleting the account resets this
- The WordPop Plus payment form opens in a box inside the app (Stripe embedded checkout) instead of a separate full page, and closes with "WordPop Plus is active" when payment is done (needs `STRIPE_PUBLISHABLE_KEY`; without it the full Stripe page is used)
- WordPop Plus can be bought straight away from Settings → Voice, without starting the free trial first
- App icon background is now a lighter, warmer amber (#FFC929)
- "Spanish Basics" is no longer offered as a ready-made category (10 remain); accounts that already added it keep their category and entries
- Starter lists are now empty, ready-made categories: adding one creates the category only, with no pre-filled entries, so everyone starts with their own words. Entries already imported by existing accounts are not touched

## [2.1.0] – 2026-11-14
### Added
- Any language and any short text: entries up to 500 characters (sentences, quotes, poems, formulas) with line breaks and right-to-left support; existing PostgreSQL databases are widened automatically
- Reminders rotate through all due entries
- New starter lists: Motivation, Math Formulas, Poems (public domain), French, Spanish, Chinese and Hindi basics
- Amber theme and flashcards app icon
- Wiktionary fallback for dictionary look-ups (phrases and idioms)
- Starter lists: Vocabulary, Phrasal Verbs, Idioms and a new Casual list; lists are matched by a fixed key, so renaming one never creates duplicate categories
- "Forgot password?" – emailed one-time reset link (1 hour), stored as a SHA-256 hash, rate-limited to 3 per hour
- Resetting the password signs out every other device (session version in the token)
- Helpful hint when signing up with an email that already has an account
- Existing databases get new columns automatically on start-up

## [2.0.0] – 2026-11-14
### Added
- Multi-user accounts with secure sessions
- Words with automatic meaning, example and pronunciation
- Categories (many-to-many) with per-category notification switches
- Per-user notification schedule: frequency, hours, days, daily limit, pause, time zone
- Web push notifications and a 15-minute scheduler (GitHub Actions)
- Spaced-repetition quiz and optional quiz-style notifications
- Progress page, starter word lists, iPhone install guide
- Admin statistics with retention
- Tests, linting and CI; Docker and docker compose

## [1.0.0]
- Personal command-line version: SQLite database and ntfy notifications
