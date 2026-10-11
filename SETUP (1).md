# Secure setup: do these in order

Order matters. Your old items are copied into the new app the first time you create your household. That copy only works while the old open database still exists. Lock the database last.

## 1. Turn on sign-in (Firebase console, project my-test-list01)
1. Build → Authentication → Get started → Sign-in method.
2. Enable **Google** and **Email/Password**.
3. Authentication → Settings → **Authorized domains** → Add `YOUR-USERNAME.github.io`.

## 2. Put the new files on GitHub
Replace the old index.html and add: `app.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`. Keep them all in the same folder. (`firestore.rules` and this guide don't need to go on the site.) Wait about a minute for GitHub Pages to refresh.

## 3. Make yourself the admin
Admins are the only people who can delete items or stores, and the only ones offered the old-data copy. Admins can only be added by hand, so nobody can make themselves one.
1. Open the site on your phone and sign in. Stop at the "Welcome" screen.
2. Firebase console → Authentication → Users → copy your **User UID**.
3. Firestore Database → Start collection → ID `admins` → Document ID = your UID → add one field (for example `note` = `owner`) → Save.
4. Refresh the site. (To add another admin later, repeat with their UID.)

## 3b. Create your household
Leave "Bring over items and lists from the old version" ticked and tap **Create household**. Your stores and items become the shared catalog everyone sees. Check they're all there.

## 4. Lock the database (only after step 3b)
Firebase console → Firestore Database → Rules → paste everything from `firestore.rules` → **Publish**.

## 5. Prove it works
In the app: Family tab → **Run security check**. Every line should be a green check. Any red X means the rules aren't published right; paste them again.

## 6. Invite family
Family tab → **Invite someone** → send the link. Everyone who signs in sees the same stores and items and can add and edit them. Only you can delete them. Each family's list and calendar stay private to their household. It works for 7 days and you can cancel all links with **Reset links**.

## Soon after (recommended)
- Firebase console → Build → App Check → register the web app with reCAPTCHA Enterprise (stops other apps using your project).
- Google Cloud → Billing → Budgets & alerts → set a small budget alert so a surprise can never cost you.
- Before selling to the public: privacy policy, terms, and a per-user limit on photo scanning.
