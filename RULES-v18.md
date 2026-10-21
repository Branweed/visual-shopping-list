# Firebase rules v18 (trips, usual items, shared receipt matches)

The complete rules are now in this repo as **`firestore.rules`**. From v18 on, publishing is one paste:

1. Open `firestore.rules` on GitHub, tap **Copy raw file** (the copy icon above the code).
2. Firebase console → Firestore Database → **Rules** → click in the editor → select all (Ctrl+A) → paste.
3. Tap **Publish**.
4. In the app: **Family tab → Run security check**. It should show rules **v18**, and the trip checks should pass.

What v18 adds to the live v17 rules (checked against the console on Oct 20, 2026, 376 lines):
- `households/{h}/trips` — each receipt's total, for monthly spending.
- `households/{h}/usual` — when things were bought, to suggest what's due again.
- `households/{h}/aliases` — receipt matches ("MB GRD BF 80" = Ground Beef).
All three are shared only within the household, and every field is checked.

Note: the live `_rules` marker already says `v18` even though these three blocks were never published, so the
version check passed while trips couldn't save. Publishing `firestore.rules` fixes that.

Cost: all three stay well inside the free tier. A trip is one write per receipt; usual items are one write per item checked off; matches are one write per new match.
