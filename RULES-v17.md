# Firebase rules update: v15 → v17 (household label nutrition)

The full rules live in Firebase (Firestore Database → Rules), not in this repo. v17 makes two changes to v15.
(v16 was never needed. If you already pasted the v16 `match /nutrition/{id}` block under users, it's harmless, so leave it or delete it.)

**1. Version marker.** Find the `_rules` line and make it say `v17`:

```
      allow get: if signedIn() && v == 'v17';
```

**2. New block.** Paste this near the bottom, just above the last two closing `}` braces
(it sits on its own, not inside any other `match`):

```
    // Nutrition read from label photos, shared by everyone in the household.
    match /households/{h}/nutrition/{id} {
      allow read, delete: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid));
      allow create, update: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid)) &&
        id.matches('^[ui][A-Za-z0-9_-]{1,60}$') &&
        request.resource.data.keys().hasOnly(['v', 't', 'by']) &&
        request.resource.data.v is string && request.resource.data.v.size() <= 4000 &&
        request.resource.data.t is number && request.resource.data.by == request.auth.uid;
    }
```

Then tap **Publish**, and run **Family tab → Run security check**. It should show rules **v17**.
