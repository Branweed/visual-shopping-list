# HANDOFF: The Pickup Board (visual-shopping-list)

Read this file first in every new chat. Start one by saying **"continue Pickup Board"**.

## Project
- Firebase PWA grocery, pantry and meals app, for Brandon (Google Pixel, Android Chrome). Act as a senior developer and a master cook.
- Repo: Branweed/visual-shopping-list. GitHub Pages deploys from `main`. The code is plain HTML plus ES-module JS with no build step.
- Firebase project `my-test-list01` (Web SDK 12.18.0): Auth (Google + email), Firestore, App Check, Firebase AI Logic → Gemini free tier.
- **Rules:** the full rules are in `firestore.rules` (exact copy of what should be live). To change rules: edit `firestore.rules`, bump the `_rules` marker and `RULES_VERSION`, add a line to the security check, write a short `RULES-vN.md`. Brandon copies the whole file into Firebase → Rules, publishes, then runs Family tab → Run security check. Claude never publishes.

## Current state
- **App v60** (`APP_VERSION "2026.10.20-60"`). **Rules v18** (`RULES_VERSION "v18"`, see RULES-v18.md). v59 and v60 needed no rules change.
- ⏳ **Waiting on Brandon:** publish `firestore.rules` (select-all paste, see RULES-v18.md). Live rules on Oct 20 had the v18 marker but were missing the trips/usual/aliases blocks, so trips, usual items and shared receipt matches won't save until then. Then test v57–v60 on his phone and report anything broken. (v57–v59 passed a Claude smoke test in the harness on Oct 20.)
- **Next up:** fix whatever Brandon finds testing. Then pick from the ideas below.
- **Ideas Brandon has seen, not built:** monthly budget on Spending (needs a rules change, do after v18 is live), stock-up alerts (better once there's more price history). (No Play Store: Brandon isn't pursuing it, don't suggest it.)
- **v60:**
  - 🎤 Voice add (`voiceAdd`, `voiceLines`, `voiceWords`): mic button in the quick-add bar. Chrome speech, restarts after each pause (no continuous mode, it repeats words on Android). Splits on pauses/"and"/commas and on known names (catalog, pantry, list, usual, recipe ingredients); "two pounds of chicken" → qty 2. Goes to the normal `reviewScan` screen via `quickPaste(text, "voice")`. privacy.html mentions it.
  - 🥫 Use it up (`useItUp`, `useItUpCard`, `openUseItUp`): built-in + saved meals ranked by pantry coverage, +boost for use-soon food; needs ≥2 pantry matches and ≤5 to buy. Card on Meals (top) and Pantry.
  - 🌙 Dark mode: every stylesheet color is a variable (`--cHEXbg/fg/bd`) with a dark value; dark block under `prefers-color-scheme` and `[data-theme=dark]`. Family tab → 🌙 Appearance (Match phone / Light / Dark), saved in localStorage `vsl:theme`, applied early by fit.js. New CSS should use `var(--card)`, `var(--primary-ink)` for green text, etc., not raw hex.
  - Friendlier empty states (`emptyArt`) on list, stores, pantry, Spending, Usual items, calendar.
- **v57–59:** trips + 💵 Spending, 🔁 usual items, shared receipt matches, shop-mode path learning, trip-done polaroid, manifest shortcuts.

## Where things are
- `app.js` (~7,000 lines) holds everything else. Search it by function name instead of reading it whole:
  - Receipts: `parseReceipt`, `receiptDate`, `receiptFlow`, `receiptReview`.
  - Prices: `recordPrices`, `latestByStore` (history plus saved items, last 120 days), `cheaperAt`.
  - Compare and shopping: `listCompare`, `openCompare`, `moveItems`, `openShopMode`.
  - Trips and spending: `loadTrips`, `addTrip`, `listEstimate`, `openSpending`.
  - Usual items: `notePurchases`, `unnotePurchase`, `dueUsual`, `usualBar`, `openUsual`.
  - Receipt matches: `localMatch`, `aliasMap`, `learnAliases`, `pushAliases`, `aliasesFromCloud`.
  - Shop mode and trips: `openShopMode`, `pathGroups`, `openTripDone`, `checkedOff`; shortcuts `runGo`.
  - Voice add `voiceAdd`; Use it up `useItUp`; theme `setTheme`/`themeNow`.
  - Other: label nutrition sync is `nutPush`/`nutFromCloud` (`households/{hid}/nutrition`, rules v17), Firebase listeners are in `subscribeAll`, and `runSecurityCheck` runs the rules check.
- Recipes:
  - `QUICK_MEALS` in app.js plus `meals-more.js`.
  - `seasonal.js` has seasonal meals and season tags. Fall, Winter and Spring sets are done; Summer uses tags only.
  - `meal-versions.js` has protein, method and spice versions.
  - `nutrition.js` has nutrition estimates.
  - `diets.js` has gluten-free and dairy-free swaps.
- Plan the week has goals (saved per device), ✨ Fill the week, and daily totals.
- Other files:
  - `fit.js` scales the page back to phone size when Chrome's "Desktop site" mode is on.
  - `SHARING.md` covers sharing with family and free limits.
  - `privacy.html` is the privacy policy.

## Hard rules
1. **Zero cost.** Never suggest adding billing to Firebase, because that makes Gemini paid. Free tiers only. A feature pausing at a free limit is fine.
2. **Privacy.**
   - Lists, pantry, calendar, label nutrition, trips, usual items and receipt matches are shared only within a household.
   - Price history, recipes and personal item edits are private per user.
   - Nothing is shared between households.
3. **Only the admin changes the shared catalog** (`inventory`, `stores`). Everyone else saves to `users/{uid}/myItems`, with an option to send a request to the admin.
4. **Every rules field is validated.** A new field or collection means a new `RULES-vN.md`, bumping `RULES_VERSION`, and adding a line to the security check.
5. **Every change bumps the version:** `APP_VERSION`, the `?v=N` on every import in app.js, and both `?v=N` in index.html.

## Testing
The CDN is blocked in the cloud box. Test with Playwright against an in-memory Firebase stand-in:
- Route `https://www.gstatic.com/firebasejs/**` to small fake `firebase-app/auth/firestore` modules with seeded household data.
- Serve the repo with `python3 -m http.server`.
- Screenshot at 412×915 mobile, in light and dark (`color_scheme="dark"`).
- Fake `SpeechRecognition` and `webkitSpeechRecognition` to test voice add (Chromium has the real unprefixed one).

Do this before pushing anything with UI changes.

## Working style
- Batch the work, keep replies short, and keep usage low.
- Use plain-language explanations.
- After each push, tell Brandon what changed, whether rules need publishing, and the version number he should see.

## For Claude: when to hand off
Brandon wants long chats split up to save usage. Every chat on this project should follow these steps.
1. Start by reading this file instead of the whole repo. Open only the parts of app.js that the task needs.
2. After every push, update this file (version, what changed, what's waiting on Brandon) in the same commit or right after it.
3. Suggest a fresh chat, in one line at the end of a reply, when any of these happen:
   - there have been about 8–10 back-and-forth requests in this chat, or
   - large parts of app.js have been read, or 3 or more big files have been read in full, or
   - a long-conversation reminder shows up, or
   - a batch of work is pushed and the next step is Brandon testing on his phone, or
   - the topic moves to a different project.

   The line to use: "Good point to start a new chat: say 'continue Pickup Board' there. HANDOFF.md is up to date."
4. When Brandon says "wrap up," update this file (including this section if the rules changed), push it, and confirm in one line.
5. Keep this file short. Replace old status instead of adding history; git log has the history.
