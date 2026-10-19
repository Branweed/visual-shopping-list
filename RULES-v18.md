# Firebase rules update: v17 → v18 (trips, usual items, shared receipt matches)

The full rules live in Firebase (Firestore Database → Rules), not in this repo. v18 adds three household collections to v17.
Until you publish it, the app still works; trips, usual items and shared receipt matches just won't save.

**1. Version marker.** Find the `_rules` line and make it say `v18`:

```
      allow get: if signedIn() && v == 'v18';
```

**2. New blocks.** Paste these near the bottom, just above the last two closing `}` braces
(next to the `households/{h}/nutrition` block from v17, each on its own, not inside any other `match`):

```
    // 💵 Trips: each receipt's total, for monthly spending. Shared by the household.
    match /households/{h}/trips/{id} {
      allow read, delete: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid));
      allow create, update: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid)) &&
        request.resource.data.keys().hasOnly(['store', 'total', 'd', 'n', 'est', 'list', 'src', 'by', 't']) &&
        request.resource.data.store is string && request.resource.data.store.size() > 0 && request.resource.data.store.size() <= 80 &&
        request.resource.data.total is number && request.resource.data.total > 0 && request.resource.data.total < 100000 &&
        request.resource.data.d is number && request.resource.data.n is number &&
        (request.resource.data.est == null || request.resource.data.est is number) &&
        request.resource.data.list is string && request.resource.data.list.size() <= 60 &&
        request.resource.data.src in ['receipt', 'typed'] &&
        request.resource.data.t is number && request.resource.data.by == request.auth.uid;
    }

    // 🔁 Usual items: when things were bought, to suggest what's due again. Shared by the household.
    match /households/{h}/usual/{id} {
      allow read, delete: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid));
      allow create, update: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid)) &&
        id.matches('^[a-z0-9-]{1,80}$') &&
        request.resource.data.keys().hasOnly(['n', 's', 'i', 'ds', 't', 'by']) &&
        request.resource.data.n is string && request.resource.data.n.size() <= 120 &&
        request.resource.data.s is string && request.resource.data.s.size() <= 80 &&
        request.resource.data.i is string && request.resource.data.i.size() <= 64 &&
        request.resource.data.ds is list && request.resource.data.ds.size() <= 12 &&
        request.resource.data.t is number && request.resource.data.by == request.auth.uid;
    }

    // 🧾 Receipt matches ("MB GRD BF 80" = Ground Beef), shared so everyone's receipts match.
    match /households/{h}/aliases/{id} {
      allow read, delete: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid));
      allow create, update: if signedIn() &&
        exists(/databases/$(database)/documents/households/$(h)/members/$(request.auth.uid)) &&
        id.matches('^[a-z0-9_-]{1,80}$') &&
        request.resource.data.keys().hasOnly(['k', 'i', 'by', 't']) &&
        request.resource.data.k is string && request.resource.data.k.size() <= 120 &&
        request.resource.data.i is string && request.resource.data.i.size() <= 64 &&
        request.resource.data.t is number && request.resource.data.by == request.auth.uid;
    }
```

Then tap **Publish**, and run **Family tab → Run security check**. It should show rules **v18**, and both trip checks should pass.

Cost: all three stay well inside the free tier. A trip is one write per receipt; usual items are one write per item checked off; matches are one write per new match.
