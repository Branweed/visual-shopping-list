# Firebase rules update: v15 → v16 (label nutrition sync)

The full rules live in Firebase (Firestore Database → Rules), not in this repo. v16 makes two changes to v15.

**1. Version marker.** Find this line and change `v15` to `v16`:

```
      allow get: if signedIn() && v == 'v16';
```

**2. New block.** Paste this inside `match /users/{uid} { ... }`, right after the `match /prices/{id} { ... }` block:

```
      // Nutrition read from your label photos, so every phone you sign in on has it. Private to you.
      match /nutrition/{id} {
        allow read, delete: if signedIn() && uid == me();
        allow create, update: if verified() && uid == me() &&
          id.matches('^[ui][A-Za-z0-9_-]{1,60}$') &&
          request.resource.data.keys().hasOnly(['v', 't']) &&
          request.resource.data.v is string && request.resource.data.v.size() <= 4000 &&
          request.resource.data.t is number;
      }
```

Then tap **Publish**, and run **Family tab → Run security check**.
