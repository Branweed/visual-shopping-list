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

## 3. Before selling it
- **Check each free service's terms:** OCR.space's free key and the free Gemini tier are meant for personal and light use. Check their terms for commercial use, or plan to move to their paid plans when you're ready to charge.
- **Give each buyer their own setup:** if you sell copies to other people, each buyer should get their own Firebase project. That keeps everyone's data and limits separate.
- **Add terms of service:** you'll want a simple terms-of-service page next to the privacy policy.
