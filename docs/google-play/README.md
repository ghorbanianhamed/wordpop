# Publishing WordPop on Google Play

WordPop goes on Google Play as a **Trusted Web Activity (TWA)**: a small Android app that opens
`https://wordpopapp.onrender.com` full-screen. It uses the same server, database and accounts as the
website, so existing users simply sign in and find all their entries.

Everything in this folder is ready to upload:

| File | Use in Play Console |
|---|---|
| `app-icon-512.png` | App icon (512 × 512) |
| `feature-graphic.png` | Feature graphic (1024 × 500) |
| `1-your-entries.png` … `6-natural-voices.png` | Phone screenshots (1080 × 1920) |

Regenerate the graphics with `python scripts/make_play_assets.py`.

> **Payments.** Google Play requires Google's own billing for digital subscriptions sold inside Play apps.
> The Play version therefore **doesn't sell WordPop Plus**: it detects that it was opened from the Play app
> (`?source=play`, or Android's `android-app://` referrer) and hides the price buttons and "Manage
> subscription". People who subscribed on the website still have Plus in the Play app. Selling Plus in the
> Play app later means adding Google Play Billing (e.g. with RevenueCat).

---

## 1. Create a Google Play developer account (once, US$25)

1. Go to <https://play.google.com/console> and sign in with the Google account you want to use.
2. Choose **Yourself** (personal account), pay the US$25 fee, and complete **identity verification**
   (government ID; it can take a few days).
3. Install the **Google Play Console** app on an Android phone when asked, to verify the device.

> **New personal accounts must run a closed test with at least 12 testers for 14 days in a row** before
> the app can be published to everyone (step 7).

## 2. Build the Android app with PWABuilder

1. Open <https://www.pwabuilder.com>, enter `https://wordpopapp.onrender.com` and click **Start**.
2. Click **Package for stores** → **Android** → **Generate package** → **Options**, and set:

   | Option | Value |
   |---|---|
   | Package ID | `com.onrender.wordpopapp.twa` (**permanent** – it can never change) |
   | App name / Launcher name | `WordPop` |
   | App version / Version code | `1.0.0` / `1` (raise both for every update) |
   | Host | `wordpopapp.onrender.com` |
   | Start URL | `/?source=play#/words` |
   | Theme colour / Background colour | `#FFC929` |
   | Status bar / Navigation bar colour | `#FFC929` |
   | Display mode | Standalone |
   | Notification delegation | **On** (reminders appear as WordPop notifications) |
   | Location delegation / Google Play billing | Off |
   | Signing key | **Create new** – fill in your name and a strong password |

3. Click **Download**. The zip contains:
   - `app-release-bundle.aab` – the file you upload to Google Play
   - `signing.keystore` and `signing-key-info.txt` – **keep both safe and private** (e.g. in a password
     manager or an encrypted USB stick). Every future update must be signed with this key.
   - `assetlinks.json` – contains the upload key's SHA-256 fingerprint (used in step 4)

   Never put the keystore or its password in Git.

## 3. Create the app in Play Console

1. **Create app** → App name `WordPop` · Default language **English (United States)** · **App** · **Free** →
   accept the declarations → **Create app**.
2. Leave **Play App Signing** on (the default). Google keeps the final signing key; your keystore is the
   *upload* key.

## 4. Link the app and the website (no browser bar)

1. In Play Console: **Test and release → Setup → App integrity → App signing**. Copy the
   **SHA-256 certificate fingerprint** of the **App signing key certificate**.
2. Also copy the fingerprint from PWABuilder's `assetlinks.json` (the upload key).
3. In Render → **wordpopapp → Environment**, add:

   | Key | Value |
   |---|---|
   | `ANDROID_PACKAGE_NAME` | `com.onrender.wordpopapp.twa` |
   | `ANDROID_SHA256_CERT_FINGERPRINTS` | `<app signing fingerprint>,<upload fingerprint>` (comma-separated) |

4. **Save, rebuild, and deploy**, then open
   <https://wordpopapp.onrender.com/.well-known/assetlinks.json> – it should list the package name and both
   fingerprints. Without this, the app still works but shows a browser address bar at the top.

## 5. Store listing (Grow → Store presence → Main store listing)

**App name** (max 30): `WordPop – Remember anything`

**Short description** (max 80):
```
Save words, phrases, quotes and formulas – reminders until you remember them.
```

**Full description** (max 4000):
```
WordPop helps you remember anything you want to keep – words in any language, phrases, sentences, quotes, poems, motivational lines and math formulas.

Save an entry, choose when you'd like reminders, and WordPop pops it onto your phone at the times you pick. Each notification shows only the entry, so you try to recall the meaning first – then tap to check. A spaced-repetition quiz brings back what you forget and spaces out what you know.

WHAT YOU CAN REMEMBER
• Words and phrases in any language – English, French, Chinese, Hindi, Spanish, Japanese, Arabic…
• Idioms and work vocabulary – your team's jargon, phrases for meetings
• Quotes, poems and motivational lines
• Math and science formulas, definitions and exam facts

FEATURES
• Reminders on your schedule – how often, which hours and days, a daily limit, and a pause button
• Reminders per category – switch each category on or off
• Spaced-repetition quiz and a progress page with your streak and accuracy
• Listen to every entry and example, with pronunciation for single words
• Natural, human-sounding voices with a Canadian or American accent – try them free for 7 days
• Automatic meanings and examples for English words
• Flashcard view, categories, search, and select & delete many
• Share to WordPop – select text in any app, tap Share → WordPop and save it
• Import and export your entries as a spreadsheet (CSV)
• Works on your phone and on the web with the same account

PRIVACY
No ads and no selling of your data. Delete your account and everything in it at any time from Settings.
```

**Graphics:** upload `app-icon-512.png`, `feature-graphic.png` and the six phone screenshots from this folder.

**Category:** Education · **Tags:** Language learning, Education · **Contact email:** your support address ·
**Website:** `https://wordpopapp.onrender.com`

## 6. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://wordpopapp.onrender.com/privacy.html` |
| App access | **All or some functionality is restricted** → add instructions and a **reviewer account** (create one in WordPop, e.g. a separate email, add a few entries; give its email and password here) |
| Ads | **No**, the app contains no ads |
| Content rating | Fill in the questionnaire: category **Reference, News or Educational**; answer **No** to violence, sexual content, gambling, etc.; users can't talk to each other; no location sharing; no purchases in the app |
| Target audience | **13 and over** (avoid "under 13", which brings the Families policy) |
| News app / Government app | No / No |
| Financial features / Health | None / None |
| Account deletion | Yes, accounts can be created → deletion URL: `https://wordpopapp.onrender.com/delete-account.html` |
| Data safety | See below |

### Data safety answers

- **Does your app collect or share user data?** Yes, it collects data. It does **not share** data
  (service providers such as hosting, email, Azure and Stripe don't count as sharing).
- **Is all data encrypted in transit?** Yes (HTTPS).
- **Can users request deletion?** Yes – in the app, and the deletion page above.

| Data type | Collected | Optional? | Purposes |
|---|---|---|---|
| Personal info → **Email address** | Yes | Required | Account management, App functionality |
| App activity → **Other user-generated content** (entries, categories) | Yes | Required | App functionality |
| App activity → **App interactions** (quiz answers, last active) | Yes | Required | App functionality, Analytics |
| Device or other IDs → **push notification address** | Yes | Optional | App functionality |
| Financial info → **Purchase history** (WordPop Plus status for web subscribers) | Yes | Optional | App functionality |

Not collected: location, contacts, photos, audio, files, health, messages, payment card details (handled
by Stripe on the website, never in the app).

## 7. Closed test (required for new personal accounts)

1. **Test and release → Testing → Closed testing → Create track** (e.g. "Testers").
2. **Create new release** → upload `app-release-bundle.aab` → release name `1.0.0` → notes
   ("First test version") → **Save → Review release → Start rollout**.
3. **Testers** tab → create an email list with **at least 12 testers** (friends, coworkers, classmates –
   their Google account emails) → copy the **opt-in link** and send it to them.
4. Each tester opens the link, taps **Become a tester**, installs WordPop from Google Play and uses it a
   few times. Keep at least 12 testers opted in for **14 days in a row**.
5. Collect feedback; for fixes, change the website (no new upload needed) – the Play app always shows
   the live site.

## 8. Go live

1. After 14 days, Play Console shows **Apply for production** (Dashboard). Answer the questions about your
   test (who tested, what you learned, what changed).
2. When approved: **Production → Create new release** → add the same `.aab` (or a newer one with a
   higher version code) → **Start rollout to production**. Google's review usually takes a few days.
3. Add the Google Play badge and link to the website and README.

## Updating the app later

- **Most changes need no new upload** – the Play app shows the live website, so merging to `main`
  updates it for everyone.
- Only changes to the app shell (name, icon, colours, start URL, package settings) need a new `.aab`:
  rebuild in PWABuilder with the **same package ID and the same signing key**, raise the version code,
  and upload a new release.
