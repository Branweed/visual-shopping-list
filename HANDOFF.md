# HANDOFF: The Pickup Board (visual-shopping-list)

Read this file first in every new chat. Start one by saying **"continue Pickup Board"**.

## Project
- Firebase PWA grocery, pantry and meals app, for Brandon (Google Pixel, Android Chrome). Act as a senior developer and a master cook.
- Repo: Branweed/visual-shopping-list. GitHub Pages deploys from `main`. The code is plain HTML plus ES-module JS with no build step.
- Firebase project `my-test-list01` (Web SDK 12.18.0): Auth (Google + email), Firestore, App Check, Firebase AI Logic → Gemini free tier.
- **Rules live in Firebase, not this repo.** Each rules change gets a `RULES-vN.md` with the exact block to paste. Brandon publishes it, then runs Family tab → Run security check.

## Current state
- **App v59** (`APP_VERSION "2026.10.20-59"`). **Rules v18** (`RULES_VERSION "v18"`, see RULES-v18.md). v59 needed no rules change.
- ⏳ **Waiting on Brandon:** rules v18 is NOT published (live console was v17 on Oct 20). Until it is, trips, usual items and shared receipt matches won't save. Then test v57–v59 on his phone.
- **Next up:** save the complete live rules as `firestore.rules` with v18 merged, so future updates are one select-all paste. Read them in the browser (console → Firestore → Rules; the editor is CodeMirror) or ask Brandon to paste them. Claude never publishes rules itself.
- **Ideas Brandon has seen, not built:** voice add, monthly budget on Spending, "use it up" pantry meals, stock-up alerts, dark mode, friendlier empty states, Play Store listing.
- **v59:**
  - 🧭 Shop mode learns your path per store (`loadPath`/`learnPath`/`pathGroups`, localStorage `path:<store>`, per device, no Firestore). Needs 3+ check-offs in a trip. A bar toggles "my path" / "aisle order".
  - 📸 Trip-done polaroid after "Done shopping" (`openTripDone`): cart estimate, items, minutes, savings from moves (`movedNote`/`movedSavings`, localStorage), what's still left, then Scan receipt / Put away.
  - 📲 Manifest shortcuts (`?go=add|shop|receipt`, `captureGo`/`runGo`, icons `sc-*.png`).
  - Polish: check-off buzz + tilt (`checkedOff`, `.litem.pop`), shop rows hide ✕ and aisle signs, tied "cheapest store" bar hidden, AI reader dots round, pantry buttons no longer wrap, store page header uses icon buttons.
- **v57–58:** trips + 💵 Spending, 🔁 usual items, shared receipt matches, per-lb weight prompts and price-history fix.

## Where things are
- `app.js` (~7,000 lines) holds everything else. Search it by function name instead of reading it whole:
  - Receipts: `parseReceipt`, `receiptDate`, `receiptFlow`, `receiptReview`.
  - Prices: `recordPrices`, `latestByStore` (history plus saved items, last 120 days), `cheaperAt`.
  - Compare and shopping: `listCompare`, `openCompare`, `moveItems`, `openShopMode`.
  - Trips and spending: `loadTrips`, `addTrip`, `listEstimate`, `openSpending`.
  - Usual items: `notePurchases`, `unnotePurchase`, `dueUsual`, `usualBar`, `openUsual`.
  - Receipt matches: `localMatch`, `aliasMap`, `learnAliases`, `pushAliases`, `aliasesFromCloud`.
  - Shop mode and trips: `openShopMode`, `pathGroups`, `openTripDone`, `checkedOff`; shortcuts `runGo`.
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
  - `SHARING.md` covers free limits and the Play Store steps.
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
- Screenshot at 412×915 mobile.

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
