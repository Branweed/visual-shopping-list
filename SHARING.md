# Sharing the app with family, and later the public

## 1. Family and friends (ready now, free)
- **Invite people:** Family tab → **＋ Invite someone** → Share link. The link works for 7 days. **Reset links** cancels every link you've made.
- **What they see:** everyone shares the main item catalog, and only you (the admin) can change it. Each household's list, pantry and meal calendar are private to that household. Each person's price history, recipes and item edits are private to them.
- **Install on a phone:** open the site in Chrome → ⋮ menu → **Add to Home screen** (on iPhone: Safari → Share → Add to Home Screen).
- **Privacy policy:** `privacy.html` is linked from the sign-in screen and the Family tab. Before you share widely, check the contact email at the bottom of `privacy.html`. It's your admin email right now, so change it if you'd rather use a different address.
- **Their own data:** anyone can tap **Download my data** or **Delete my account** on the Family tab. Deleting removes their recipes, item edits, aisle maps, price history and any pending requests.

## 2. Staying free as more people join
Your Firebase project has no billing account, so nobody can charge you. Hitting a free daily limit just pauses that feature until the next day. **Keep billing off.** Adding a card is the step that makes Gemini paid.

Rough free limits per day:

| What | Free limit | What happens at the limit |
|---|---|---|
| Firestore reads | 50,000/day | The app shows what's saved on the phone until the next day |
| Firestore writes | 20,000/day | Saving pauses until the next day |
| Gemini (AI) | daily request limit | The app already falls back to the free text reader, and shows "resting until …" |
| OCR.space free reader | monthly cap | The app falls back to the AI |

A family of 5–10 people uses a small fraction of this.

## 3. Google Play Store (later, when you want it)
The app can go on the Play Store without rewriting it. PWABuilder wraps the website as an Android app (a "Trusted Web Activity").

**What it costs:** Google charges a **one-time $25** Play Console registration fee. This is the one unavoidable charge, and it's paid to Google, not Firebase. Your Firebase project stays free.

**Steps:**
1. **Developer account:** go to play.google.com/console and register as a developer (identity verification plus the $25 fee).
2. **Build the package:** go to **pwabuilder.com**, enter your site's address, choose **Package for stores → Android**, and download the zip. It has the `.aab` app file and a signing key. **Back up the key.** You can't update the app without it.
3. **Prove you own the site:**
   - The zip also has an `assetlinks.json` file. Put it on your GitHub Pages site at `https://branweed.github.io/.well-known/assetlinks.json`. It has to be in the root `branweed.github.io` repository, in a folder named `.well-known`.
   - Also add an empty file named `.nojekyll` to that repository's root. Without it, GitHub hides folders that start with a dot.
4. **Closed testing first:** new personal developer accounts must run a closed test with at least **12 testers for 14 days in a row** before going public. Your family can be the testers.
5. **Store listing:** use `icon-512.png`, take phone screenshots of the List, Pantry and Meals tabs, and paste your privacy policy link (`https://branweed.github.io/<your app folder>/privacy.html`).
6. **Data safety form:** answer from the privacy policy:
   - **Data collected:** name, email, user content (lists, photos you take, recipes). Photos are sent to OCR.space and Google to read text.
   - **Not collected:** location, contacts, payment info, advertising ID.
   - **Shared:** no selling. Data is processed by Google Firebase, OCR.space and Google Gemini to provide features.
   - **Encrypted in transit:** yes. **Users can delete their data:** yes (in-app).

## 4. Before selling it
- **Check each free service's terms:** OCR.space's free key and the free Gemini tier are meant for personal and light use. Check their terms for commercial use, or plan to move to their paid plans when you're ready to charge.
- **Give each buyer their own setup:** if you sell copies to other people, each buyer should get their own Firebase project. That keeps everyone's data and limits separate.
- **Add terms of service:** you'll want a simple terms-of-service page next to the privacy policy.
