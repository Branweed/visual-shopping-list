import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, getDocFromServer, getDocsFromServer,
  onSnapshot, writeBatch, query, where, limit, Timestamp, deleteField, terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

/* =====================================================================
   Firebase setup
   These keys are meant to be public; the security rules protect the data.
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAY0nDkSRxxBBbw6yFmQqN738DNHvv9lN0",
  authDomain: "my-test-list01.firebaseapp.com",
  projectId: "my-test-list01",
  storageBucket: "my-test-list01.firebasestorage.app",
  messagingSenderId: "924548717595",
  appId: "1:924548717595:web:ca5bcb76c28fd485ab2cbe",
  measurementId: "G-Z3SSWLB711"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
try { auth.useDeviceLanguage(); } catch (e) {}
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = getFirestore(app);
}

/* ===================================================================== */
const PLACEHOLDER = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&q=80";
const LEGACY_STORES = ["Aldi", "BJ's", "Market Basket", "Wal-Mart"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const INVITE_DAYS = 7;

const S = {
  user: null, userDoc: null, hid: null, household: null, members: [],
  inventory: [], storeDocs: [], lists: [], listItems: [], events: [],
  listId: null, tab: "list", store: null, invQuery: "", hideChecked: false,
  calMonth: new Date(), calDay: dateKey(new Date()),
  ready: { inv: false, items: false }, busyLeaving: false
};
const uid = () => (S.user ? S.user.uid : null);

/* ---------- local settings (per person, never shared) ---------- */
const lsKey = k => `vsl:${uid() || "anon"}:${k}`;
const lsGet = k => { try { return localStorage.getItem(lsKey(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(lsKey(k), v); } catch (e) {} };
const JOIN_KEY = "vsl:pendingJoin";
function getPendingJoin() {
  try {
    const v = JSON.parse(localStorage.getItem(JOIN_KEY) || "null");
    if (v && v.code && Date.now() - v.at < 3 * 864e5) return v.code;
  } catch (e) {}
  return null;
}
function setPendingJoin(code) { try { localStorage.setItem(JOIN_KEY, JSON.stringify({ code, at: Date.now() })); } catch (e) {} }
function clearPendingJoin() { try { localStorage.removeItem(JOIN_KEY); } catch (e) {} }

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in (props || {})) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "value") e.value = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
const norm = s => String(s || "").trim().toLowerCase();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "store";
function priceNum(p) { const n = parseFloat(p); return isFinite(n) ? n : null; }
const money = n => "$" + (Number(n) || 0).toFixed(2);
const qtyOf = i => Math.max(1, Math.min(999, Math.round(Number(i.qty) || 1)));
const lineTotal = i => (priceNum(i.price) || 0) * qtyOf(i);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const aisleLabel = a => !a ? "" : (/^\d+$/.test(String(a).trim()) ? "Aisle " + String(a).trim() : String(a));
const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
function cleanPrice(p) {
  const s = String(p == null ? "" : p).trim().replace(/^\$/, "");
  if (!s) return "";
  const n = parseFloat(s);
  if (!isFinite(n) || n < 0 || n >= 1e6) return "";
  return n.toFixed(2);
}
function cleanImage(img) {
  if (typeof img !== "string" || !img) return "";
  if (img.length > 300000) return "";
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) return img;
  if (/^https:\/\/[^ "<>]+$/.test(img)) return img;
  return "";
}
function randCode(n) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, x => A[x % A.length]).join("");
}
function parseCode(s) {
  s = String(s || "").trim();
  const m = s.match(/join=([A-Za-z0-9]+)/);
  return (m ? m[1] : s).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}
const myName = () => clip((S.user && (S.user.displayName || (S.user.email || "").split("@")[0])) || "Me", 80);

function aisleKey(a) {
  if (!a) return [2, 0, ""];
  const m = String(a).match(/(\d+)/);
  return m ? [0, parseInt(m[1], 10), String(a).toLowerCase()] : [1, 0, String(a).toLowerCase()];
}
function byAisle(a, b) {
  const x = aisleKey(a.aisle), y = aisleKey(b.aisle);
  return x[0]-y[0] || x[1]-y[1] || x[2].localeCompare(y[2]) || norm(a.name).localeCompare(norm(b.name));
}
function thumbEl(src, cls) {
  if (!src) return h("div", { class: cls + " ph", text: "🛒" });
  const img = h("img", { class: cls, src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("div", { class: cls + " ph", text: "🛒" })), { once: true });
  return img;
}
function toast(msg, action) {
  const t = $("#toast");
  t.textContent = "";
  t.append(h("span", { text: msg }));
  if (action) t.append(h("button", { text: action.label, onclick: () => { t.classList.remove("show"); action.fn(); } }));
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), action ? 5000 : 2400);
}
function fail(e) {
  console.error(e);
  if (e && e.code === "permission-denied") toast("You don't have permission to do that.");
  else toast("Couldn't save that. Check your connection and try again.");
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad({ code: "timeout" }), ms))]);

/* ---------- paths: everything lives inside the current household ---------- */
const hcol = (...p) => collection(db, "households", S.hid, ...p);
const hdoc = (...p) => doc(db, "households", S.hid, ...p);
// The item and store catalog is shared by everyone; lists, events and members belong to a household.
const scol = n => collection(db, "shared_" + n);
const sdoc = (n, id) => doc(db, "shared_" + n, id);
async function checkAdmin() {
  try { return (await getDocFromServer(doc(db, "admins", uid()))).exists(); } catch (e) { return false; }
}
const itemsCol = listId => hcol("lists", listId, "items");
const itemDoc = (listId, id) => hdoc("lists", listId, "items", id);

/* =====================================================================
   Sheets (pop-up panels)
   ===================================================================== */
function openSheet(title) {
  const body = h("div", { class: "sbody" });
  const api = {
    body, closed: false, onclose: null,
    close() {
      if (api.closed) return;
      api.closed = true; scrim.remove();
      if (!document.querySelector(".scrim")) document.body.classList.remove("lock");
      if (api.onclose) api.onclose();
    }
  };
  const scrim = h("div", { class: "scrim" },
    h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "shead" }, h("b", { text: title }), h("button", { class: "sclose", "aria-label": "Close", text: "✕", onclick: () => api.close() })),
      body));
  scrim.addEventListener("click", e => { if (e.target === scrim) api.close(); });
  document.body.append(scrim);
  document.body.classList.add("lock");
  return api;
}
function choose(title, msg, options) {
  return new Promise(res => {
    let done = false;
    const s = openSheet(title);
    const fin = v => { if (done) return; done = true; res(v); s.close(); };
    s.onclose = () => { if (!done) { done = true; res(null); } };
    s.body.append(h("p", { class: "msg", text: msg }),
      h("div", { class: "actions", style: "flex-wrap:wrap" },
        options.map(o => h("button", { class: "btn " + (o.cls || ""), text: o.label, onclick: () => fin(o.value) }))));
  });
}
const confirmSheet = (title, msg, label, danger) =>
  choose(title, msg, [{ label: "Cancel", value: null }, { label, value: true, cls: danger ? "dangerfill" : "primary" }]).then(v => v === true);

function promptSheet(title, label, initial, okLabel, opts = {}) {
  return new Promise(res => {
    let done = false;
    const s = openSheet(title);
    const inp = h("input", { value: initial || "", placeholder: opts.placeholder || label, "aria-label": label,
      type: opts.type || "text", maxlength: String(opts.max || 80), autocapitalize: opts.type === "password" ? "off" : "words",
      autocomplete: opts.type === "password" ? "current-password" : "off", enterkeyhint: "done" });
    const fin = v => { if (done) return; done = true; res(v); s.close(); };
    s.onclose = () => { if (!done) { done = true; res(null); } };
    const ok = () => { const v = opts.type === "password" ? inp.value : inp.value.trim(); if (v) fin(v); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); ok(); } });
    s.body.append(opts.msg ? h("p", { class: "msg", text: opts.msg }) : null,
      h("label", { class: "fl" }, h("span", { text: label }), inp),
      h("div", { class: "actions" },
        h("button", { class: "btn", text: "Cancel", onclick: () => fin(null) }),
        h("button", { class: "btn " + (opts.danger ? "dangerfill" : "primary"), text: okLabel || "Save", onclick: ok })));
    setTimeout(() => inp.focus(), 60);
  });
}
function progressSheet(title) {
  const s = openSheet(title);
  const line = h("p", { class: "msg" }, h("span", { class: "spin" }), h("span", { text: "Working…" }));
  s.body.append(line);
  return { set: t => { line.lastChild.textContent = t; }, close: () => s.close() };
}

/* =====================================================================
   SIGN-IN SCREENS
   ===================================================================== */
function showGate(...nodes) {
  document.body.classList.add("gated");
  const box = h("div", { class: "gbox" },
    h("div", { class: "brand" }, h("img", { src: "icon-192.png", alt: "" }), h("b", { text: "Visual Shopping List" })),
    ...nodes);
  const g = $("#gate");
  g.textContent = "";
  g.append(box);
  window.scrollTo(0, 0);
}
function hideGate() { document.body.classList.remove("gated"); $("#gate").textContent = ""; }
function gateLoading(text) { showGate(h("p", { class: "gsub" }, h("span", { class: "spin" }), text || "Loading…")); }

function authMsg(e) {
  const c = (e && e.code) || "";
  const map = {
    "auth/invalid-credential": "That email and password don't match.",
    "auth/wrong-password": "That email and password don't match.",
    "auth/user-not-found": "That email and password don't match.",
    "auth/invalid-email": "That doesn't look like an email address.",
    "auth/email-already-in-use": "There's already an account with that email. Try signing in instead.",
    "auth/weak-password": "Use a stronger password: at least 8 characters.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/network-request-failed": "No connection. Check your internet and try again.",
    "auth/unauthorized-domain": "This website isn't approved for sign-in yet. Add it under Authentication → Settings → Authorized domains in Firebase.",
    "auth/operation-not-allowed": "This sign-in method isn't turned on yet in Firebase (Authentication → Sign-in method).",
    "auth/user-disabled": "This account has been disabled.",
    "auth/requires-recent-login": "Please sign in again to confirm it's you.",
    "auth/popup-closed-by-user": "Sign-in window was closed."
  };
  return map[c] || "Something went wrong. Please try again.";
}

function showSignIn(mode = "signin", msg) {
  const err = h("div", { class: "err hidden" });
  const okBox = h("div", { class: "ok hidden" });
  const showErr = t => { err.textContent = t; err.classList.remove("hidden"); okBox.classList.add("hidden"); };
  const showOk = t => { okBox.textContent = t; okBox.classList.remove("hidden"); err.classList.add("hidden"); };
  const name = h("input", { placeholder: "Your name", "aria-label": "Your name", autocomplete: "name", maxlength: "80", autocapitalize: "words" });
  const email = h("input", { type: "email", placeholder: "Email", "aria-label": "Email", autocomplete: "email", maxlength: "254", autocapitalize: "off" });
  const pw = h("input", { type: "password", placeholder: mode === "signup" ? "Password (8+ characters)" : "Password", "aria-label": "Password",
    autocomplete: mode === "signup" ? "new-password" : "current-password", maxlength: "128" });
  let busy = false;

  async function google() {
    if (busy) return; busy = true;
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await signInWithPopup(auth, p); }
    catch (e) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
        try { await signInWithRedirect(auth, p); } catch (e2) { showErr(authMsg(e2)); }
      } else if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(e.code)) showErr(authMsg(e));
    } finally { busy = false; }
  }
  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    const em = email.value.trim(), p = pw.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return showErr("Enter a valid email address.");
    if (mode === "signup" && p.length < 8) return showErr("Use at least 8 characters for your password.");
    if (!p) return showErr("Enter your password.");
    busy = true;
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, em, p);
        const n = clip(name.value, 80);
        if (n) { try { await updateProfile(cred.user, { displayName: n }); } catch (e) {} }
        await sendVerify(cred.user);
      } else {
        await signInWithEmailAndPassword(auth, em, p);
      }
    } catch (e) { showErr(authMsg(e)); }
    finally { busy = false; }
  }
  async function forgot() {
    const em = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return showErr("Type your email above first, then tap “Forgot password”.");
    try { await sendPasswordResetEmail(auth, em); } catch (e) { if (e.code === "auth/too-many-requests" || e.code === "auth/network-request-failed") return showErr(authMsg(e)); }
    showOk("If there's an account for that email, a reset link is on its way. Check your spam folder too.");
  }

  const pendingJoin = getPendingJoin();
  showGate(
    h("h2", { text: mode === "signup" ? "Create your account" : "Sign in" }),
    h("p", { class: "gsub", text: pendingJoin ? "Sign in to accept your invite." : "Shared stores and items, plus private lists for your household." }),
    msg ? h("div", { class: "ok", text: msg }) : null,
    err, okBox,
    h("button", { class: "btn gbtn", type: "button", onclick: google },
      googleLogo(), "Continue with Google"),
    h("div", { class: "or", text: "or use email" }),
    h("form", { onsubmit: submit, autocomplete: "on" },
      mode === "signup" ? h("label", { class: "fl" }, name) : null,
      h("label", { class: "fl" }, email),
      h("label", { class: "fl" }, pw),
      h("button", { class: "btn primary block", type: "submit", text: mode === "signup" ? "Create account" : "Sign in" })),
    h("div", { class: "linkrow" },
      h("button", { class: "link", type: "button", text: mode === "signup" ? "I already have an account" : "Create an account",
        onclick: () => showSignIn(mode === "signup" ? "signin" : "signup") }),
      mode === "signin" ? h("button", { class: "link", type: "button", text: "Forgot password?", onclick: forgot }) : null),
    h("p", { class: "note", text: "Lists and calendars are private to your household. Items and stores are shared by everyone using the app." }));
}
function googleLogo() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 48"); svg.setAttribute("aria-hidden", "true");
  [["#EA4335","M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"],
   ["#4285F4","M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"],
   ["#FBBC05","M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"],
   ["#34A853","M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"]]
    .forEach(([c, d]) => { const p = document.createElementNS(ns, "path"); p.setAttribute("fill", c); p.setAttribute("d", d); svg.append(p); });
  return svg;
}

async function sendVerify(user) {
  const url = location.origin + location.pathname;
  try { await sendEmailVerification(user, { url }); }
  catch (e) {
    if (e.code === "auth/unauthorized-continue-uri" || e.code === "auth/invalid-continue-uri") await sendEmailVerification(user);
    else throw e;
  }
}

function showVerify() {
  const u = auth.currentUser;
  const err = h("div", { class: "err hidden" }), okBox = h("div", { class: "ok hidden" });
  const say = (box, t) => { [err, okBox].forEach(b => b.classList.add("hidden")); box.textContent = t; box.classList.remove("hidden"); };
  let lastSend = 0;
  showGate(
    h("h2", { text: "Check your email" }),
    h("p", { class: "gsub", text: `We sent a link to ${u.email}. Open it to confirm your email, then come back and tap the button below.` }),
    err, okBox,
    h("button", { class: "btn primary block", text: "I've confirmed my email", onclick: async () => {
      try {
        await u.reload();
        if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); route(); }
        else say(err, "Not confirmed yet. Open the link in the email (check spam), then try again.");
      } catch (e) { say(err, authMsg(e)); }
    } }),
    h("div", { class: "linkrow" },
      h("button", { class: "link", text: "Send the email again", onclick: async () => {
        if (Date.now() - lastSend < 60000) return say(err, "Please wait a minute before sending another.");
        lastSend = Date.now();
        try { await sendVerify(u); say(okBox, "Sent. Check your inbox and spam folder."); } catch (e) { say(err, authMsg(e)); }
      } }),
      h("button", { class: "link", text: "Use a different account", onclick: doSignOut })),
    h("p", { class: "note", text: "We confirm emails so nobody can sign up with an address that isn't theirs." }));
}

/* =====================================================================
   ACCOUNT RECORD & ROUTING
   ===================================================================== */
const isVerified = u => !!u && (u.emailVerified || (u.providerData || []).some(p => p.providerId === "google.com"));

async function ensureUserDoc() {
  const ref = doc(db, "users", uid());
  const snap = await getDoc(ref);
  if (snap.exists()) { S.userDoc = snap.data(); S.userDoc.households = S.userDoc.households || {}; return; }
  S.userDoc = { households: {}, activeHousehold: null, createdAt: Date.now() };
  await setDoc(ref, S.userDoc);
}
async function setActive(hid) {
  S.userDoc.activeHousehold = hid;
  try { await updateDoc(doc(db, "users", uid()), { activeHousehold: hid, updatedAt: Date.now() }); } catch (e) { console.warn(e); }
}
async function forgetHousehold(hid) {
  if (S.userDoc) {
    delete S.userDoc.households[hid];
    if (S.userDoc.activeHousehold === hid) S.userDoc.activeHousehold = null;
  }
  try {
    await updateDoc(doc(db, "users", uid()), {
      [`households.${hid}`]: deleteField(),
      activeHousehold: S.userDoc ? S.userDoc.activeHousehold : null,
      updatedAt: Date.now()
    });
  } catch (e) { console.warn(e); }
}

let routing = false;
async function route() {
  if (routing) return;
  routing = true;
  try {
    const u = auth.currentUser;
    S.user = u;
    if (!u) return showSignIn("signin");
    if (!isVerified(u)) return showVerify();
    gateLoading("Signing you in…");
    try { await ensureUserDoc(); }
    catch (e) {
      console.error(e);
      return showGate(h("h2", { text: "Couldn't load your account" }),
        h("p", { class: "gsub", text: e.code === "unavailable" ? "You seem to be offline. Connect to the internet and try again." : "Please try again in a moment." }),
        h("button", { class: "btn primary block", text: "Try again", onclick: () => route() }),
        h("div", { class: "linkrow" }, h("button", { class: "link", text: "Sign out", onclick: doSignOut })));
    }
    const pending = getPendingJoin();
    if (pending) return showJoin(pending);
    const hids = Object.keys(S.userDoc.households || {});
    const hid = S.userDoc.activeHousehold && hids.includes(S.userDoc.activeHousehold) ? S.userDoc.activeHousehold : hids[0];
    if (hid) return enterHousehold(hid);
    return showSetup();
  } finally { routing = false; }
}

/* ---------- first-time setup: create or join ---------- */
async function legacyAvailable() {
  try {
    if (!await checkAdmin()) return false;   // only the admin brings the old catalog over
    const s = await withTimeout(getDocsFromServer(query(collection(db, "inventory"), limit(1))), 8000);
    return !s.empty;
  } catch (e) { return false; }
}

function showSetup() {
  const first = myName().split(" ")[0];
  const hhName = h("input", { value: `${first}'s Household`, maxlength: "60", "aria-label": "Household name", autocapitalize: "words" });
  const code = h("input", { placeholder: "Paste invite link or code", "aria-label": "Invite link or code", maxlength: "300", autocapitalize: "off" });
  const err = h("div", { class: "err hidden" });
  const importBox = h("div");
  let importOld = false;
  legacyAvailable().then(ok => {
    if (!ok) return;
    importOld = true;
    importBox.append(h("label", { class: "check" },
      h("input", { type: "checkbox", checked: true, onchange: e => { importOld = e.target.checked; } }),
      "Bring over items and lists from the old version of the app"));
  });
  let busy = false;
  showGate(
    h("h2", { text: `Welcome, ${first}` }),
    h("p", { class: "gsub", text: "A household is your private space. Everyone you invite to it shares the same stores, items and lists." }),
    err,
    h("label", { class: "fl" }, h("span", { text: "Name your household" }), hhName),
    importBox,
    h("button", { class: "btn primary block", text: "Create household", onclick: async () => {
      if (busy) return;
      const n = clip(hhName.value, 60);
      if (!n) { err.textContent = "Give your household a name."; err.classList.remove("hidden"); return; }
      busy = true;
      try { await createHousehold(n, importOld); }
      catch (e) { console.error(e); err.textContent = e.code === "permission-denied" ? "Firebase refused that. Check the setup steps." : "Couldn't create it. Check your connection and try again."; err.classList.remove("hidden"); }
      finally { busy = false; }
    } }),
    h("div", { class: "or", text: "or join someone else's" }),
    h("label", { class: "fl" }, code),
    h("button", { class: "btn block", text: "Join with invite", onclick: () => {
      const c = parseCode(code.value);
      if (c.length < 16) { err.textContent = "That invite code doesn't look right. Paste the whole link."; err.classList.remove("hidden"); return; }
      showJoin(c);
    } }),
    h("div", { class: "linkrow" }, h("button", { class: "link", text: "Sign out", onclick: doSignOut })));
}

async function createHousehold(name, doImport) {
  const ref = doc(collection(db, "households"));
  const hid = ref.id;
  const b = writeBatch(db);
  b.set(ref, { name, ownerUid: uid(), createdAt: Date.now() });
  b.set(doc(db, "households", hid, "members", uid()), memberData("owner"));
  b.set(doc(db, "users", uid()), { households: { [hid]: name }, activeHousehold: hid, updatedAt: Date.now() }, { merge: true });
  await b.commit();
  S.userDoc.households[hid] = name;
  S.userDoc.activeHousehold = hid;
  if (doImport) {
    const p = progressSheet("Bringing over your items");
    try { await importLegacy(hid, t => p.set(t)); toast("Your old items are here"); }
    catch (e) { console.error(e); toast("Some old items couldn't be copied. You can try again from the Family tab."); }
    finally { p.close(); }
  }
  await enterHousehold(hid);
}
function memberData(role, invite) {
  const d = { role, name: myName(), joinedAt: Date.now() };
  if (S.user.email) d.email = S.user.email;
  if (invite) d.invite = invite;
  return d;
}

/* ---------- joining with an invite ---------- */
async function showJoin(code) {
  gateLoading("Checking your invite…");
  let inv = null;
  try {
    const s = await withTimeout(getDocFromServer(doc(db, "invites", code)), 10000);
    if (s.exists()) inv = s.data();
  } catch (e) { console.warn(e); }
  const bad = !inv || !inv.expiresAt || inv.expiresAt.toMillis() < Date.now();
  if (bad) {
    clearPendingJoin();
    return showGate(h("h2", { text: "This invite didn't work" }),
      h("p", { class: "gsub", text: "The link may have expired or been reset. Ask the household owner for a new one." }),
      h("button", { class: "btn primary block", text: "Continue", onclick: () => route() }));
  }
  if (S.userDoc.households[inv.householdId]) {
    clearPendingJoin();
    await setActive(inv.householdId);
    return enterHousehold(inv.householdId);
  }
  const err = h("div", { class: "err hidden" });
  let busy = false;
  showGate(
    h("h2", { text: `Join “${inv.householdName}”?` }),
    h("p", { class: "gsub", text: "You'll share stores, items and lists with everyone in this household. They'll see your name and email." }),
    err,
    h("button", { class: "btn primary block", text: "Join household", onclick: async () => {
      if (busy) return; busy = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, "households", inv.householdId, "members", uid()), memberData("member", code));
        b.set(doc(db, "users", uid()), { households: { [inv.householdId]: inv.householdName }, activeHousehold: inv.householdId, updatedAt: Date.now() }, { merge: true });
        await b.commit();
        clearPendingJoin();
        S.userDoc.households[inv.householdId] = inv.householdName;
        S.userDoc.activeHousehold = inv.householdId;
        await enterHousehold(inv.householdId);
        toast(`Welcome to ${inv.householdName}`);
      } catch (e) {
        console.error(e);
        err.textContent = e.code === "permission-denied" ? "That invite isn't valid anymore. Ask for a new link." : "Couldn't join. Check your connection and try again.";
        err.classList.remove("hidden");
      } finally { busy = false; }
    } }),
    h("div", { class: "linkrow" }, h("button", { class: "link", text: "Not now", onclick: () => { clearPendingJoin(); route(); } })));
}

/* =====================================================================
   ENTER A HOUSEHOLD: live data
   ===================================================================== */
let subs = [], unsubList = null;
function teardown() {
  subs.forEach(u => { try { u(); } catch (e) {} });
  subs = [];
  if (unsubList) { try { unsubList(); } catch (e) {} unsubList = null; }
  document.querySelectorAll(".scrim").forEach(e => e.remove());
  document.body.classList.remove("lock");
}
function onDataError(e) {
  console.error(e);
  if (S.busyLeaving) return;
  if (e && e.code === "permission-denied") return lostAccess();
  const b = $("#dberr");
  b.textContent = "Can't reach the database right now. Showing what's saved on this phone.";
  b.classList.remove("hidden");
}
let lostOnce = false;
async function lostAccess() {
  if (lostOnce) return;
  lostOnce = true;
  const name = (S.household && S.household.name) || "that household";
  teardown();
  await forgetHousehold(S.hid);
  S.hid = null; S.household = null;
  toast(`You no longer have access to ${name}.`);
  lostOnce = false;
  route();
}

async function enterHousehold(hid) {
  teardown();
  Object.assign(S, { hid, household: null, members: [], inventory: [], storeDocs: [], lists: [], listItems: [], events: [],
    listId: null, store: null, invQuery: "", ready: { inv: false, items: false } });
  S.admin = await checkAdmin();
  try {
    const snap = await getDoc(doc(db, "households", hid));
    if (!snap.exists()) throw { code: "not-found" };
    S.household = { ...snap.data(), id: hid };
  } catch (e) {
    if (e && (e.code === "permission-denied" || e.code === "not-found")) {
      await forgetHousehold(hid);
      return route();
    }
    S.household = { id: hid, name: S.userDoc.households[hid] || "Household", ownerUid: null };
  }
  if (S.userDoc.activeHousehold !== hid) setActive(hid);
  if (S.userDoc.households[hid] !== S.household.name && S.household.name) {
    S.userDoc.households[hid] = S.household.name;
    updateDoc(doc(db, "users", uid()), { [`households.${hid}`]: S.household.name }).catch(() => {});
  }
  S.listId = lsGet(`${hid}:listId`);
  S.tab = ["list","stores","create","family"].includes(lsGet("tab")) ? lsGet("tab") : "list";
  S.hideChecked = lsGet("hideChecked") === "1";
  $("#invSearch").value = "";
  hideGate();
  subscribeAll();
  setTab(S.tab);
  renderChips(); renderList(); renderStores(); renderCreateForm(); renderCalendar(); renderFamily();
}

function subscribeAll() {
  subs.push(onSnapshot(doc(db, "households", S.hid), snap => {
    if (!snap.exists()) { if (!S.busyLeaving) lostAccess(); return; }
    S.household = { ...snap.data(), id: S.hid };
    renderHeader(); renderFamily();
  }, onDataError));

  subs.push(onSnapshot(hcol("members"), snap => {
    S.members = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (!snap.metadata.fromCache && !S.members.some(m => m.id === uid()) && !S.busyLeaving) return lostAccess();
    renderFamily();
  }, onDataError));

  subs.push(onSnapshot(scol("inventory"), snap => {
    S.inventory = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    S.ready.inv = true;
    $("#dberr").classList.add("hidden");
    if (S.store && !storeNames().includes(S.store)) S.store = null;
    updateNames(); renderStores(); renderHeader(); refreshForms();
  }, onDataError));

  subs.push(onSnapshot(scol("stores"), snap => {
    S.storeDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    renderStores(); refreshForms();
  }, onDataError));

  subs.push(onSnapshot(hcol("lists"), snap => {
    S.lists = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!S.lists.length) {
      if (!snap.metadata.fromCache) setDoc(hdoc("lists", "main"), { name: "Shopping List", createdAt: Date.now(), createdBy: uid() }).catch(() => {});
      S.lists = [{ id: "main", name: "Shopping List" }];
    }
    if (!S.listId || !S.lists.some(l => l.id === S.listId)) switchList(S.lists[0].id);
    else if (!unsubList) switchList(S.listId);
    renderChips(); renderHeader();
  }, onDataError));

  subs.push(onSnapshot(hcol("events"), snap => {
    S.events = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    renderCalendar();
  }, onDataError));
}

function switchList(id) {
  S.listId = id; lsSet(`${S.hid}:listId`, id);
  S.ready.items = false; S.listItems = [];
  if (unsubList) unsubList();
  renderChips(); renderList(); renderHeader();
  unsubList = onSnapshot(itemsCol(id), snap => {
    S.listItems = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    S.ready.items = true;
    renderList(); renderStores();
  }, onDataError);
}

/* ---------- copy the old open data into the new private household ---------- */
async function importLegacy(hid, report) {
  const base = ["households", hid];
  const ops = [];
  const me = uid();
  report("Reading your old items…");
  const inv = await getDocsFromServer(collection(db, "inventory"));
  const storeSet = new Set(LEGACY_STORES);
  inv.forEach(d => {
    const v = d.data();
    const name = clip(v.name, 120); if (!name) return;
    const store = clip(v.store, 80) || "Other";
    storeSet.add(store);
    ops.push(b => b.set(doc(db, "shared_inventory", d.id), {
      name, store, aisle: clip(v.aisle, 40), price: cleanPrice(v.price), image: cleanImage(v.image),
      createdAt: typeof v.createdAt === "number" ? v.createdAt : Date.now(), createdBy: me
    }));
  });
  try { (await getDocsFromServer(collection(db, "stores"))).forEach(d => { const n = clip(d.data().name, 80); if (n) storeSet.add(n); }); } catch (e) {}
  [...storeSet].forEach(n => ops.push(b => b.set(doc(db, "shared_stores", slug(n)), { name: n, createdAt: Date.now(), createdBy: me })));

  report("Reading your old lists…");
  let lists = [];
  try { lists = (await getDocsFromServer(collection(db, "listsMeta"))).docs; } catch (e) {}
  let li = 0;
  for (const l of lists) {
    const lid = l.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || ("list" + (++li));
    ops.push(b => b.set(doc(db, ...base, "lists", lid), { name: clip(l.data().name, 60) || "List", createdAt: Date.now() + (li++), createdBy: me }));
    try {
      (await getDocsFromServer(collection(db, l.id))).forEach(d => {
        const v = d.data();
        const name = clip(v.name, 120); if (!name) return;
        ops.push(b => b.set(doc(db, ...base, "lists", lid, "items", d.id), {
          name, store: clip(v.store, 80) || "Other", aisle: clip(v.aisle, 40), price: cleanPrice(v.price),
          image: cleanImage(v.image), addedAt: typeof v.addedAt === "number" ? v.addedAt : Date.now(),
          inCart: v.inCart === true, qty: qtyOf(v), inventoryId: typeof v.inventoryId === "string" ? v.inventoryId.slice(0, 64) : null, addedBy: me
        }));
      });
    } catch (e) {}
  }
  try {
    (await getDocsFromServer(collection(db, "calendarEvents"))).forEach(d => {
      const v = d.data();
      const title = clip(v.title, 140);
      if (title && /^\d{4}-\d{2}-\d{2}$/.test(v.date || "")) ops.push(b => b.set(doc(db, ...base, "events", d.id), { title, date: v.date, createdAt: Date.now(), createdBy: me }));
    });
  } catch (e) {}
  await commitOps(ops, n => report(`Copying… ${n} of ${ops.length}`));
}

async function commitOps(ops, onProgress) {
  const SIZE = 200;
  for (let i = 0; i < ops.length; i += SIZE) {
    const b = writeBatch(db);
    ops.slice(i, i + SIZE).forEach(fn => fn(b));
    await b.commit();
    if (onProgress) onProgress(Math.min(ops.length, i + SIZE));
  }
}

/* =====================================================================
   SIGN OUT, LEAVE, DELETE
   ===================================================================== */
async function wipeLocal() {
  try { await terminate(db); } catch (e) {}
  try { await clearIndexedDbPersistence(db); } catch (e) {}
  try { Object.keys(localStorage).filter(k => k.startsWith("vsl:") && k !== JOIN_KEY).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}
async function doSignOut() {
  S.busyLeaving = true;
  teardown();
  gateLoading("Signing out…");
  try { await signOut(auth); } catch (e) {}
  await wipeLocal();   // nothing from this account stays on the phone
  location.reload();
}

async function leaveHousehold() {
  const name = S.household.name;
  if (!await confirmSheet("Leave household?", `You'll lose access to “${name}”. You can only rejoin with a new invite.`, "Leave", true)) return;
  S.busyLeaving = true;
  try {
    teardown();
    await deleteDoc(hdoc("members", uid()));
    await forgetHousehold(S.hid);
    toast(`You left ${name}`);
  } catch (e) { fail(e); }
  S.busyLeaving = false;
  route();
}

async function deleteHouseholdData(hid, report) {
  const base = ["households", hid];
  const ops = [];
  report && report("Gathering everything…");
  for (const c of ["events"]) (await getDocsFromServer(collection(db, ...base, c))).forEach(d => ops.push(b => b.delete(d.ref)));
  for (const l of (await getDocsFromServer(collection(db, ...base, "lists"))).docs) {
    (await getDocsFromServer(collection(db, ...base, "lists", l.id, "items"))).forEach(d => ops.push(b => b.delete(d.ref)));
    ops.push(b => b.delete(l.ref));
  }
  (await getDocsFromServer(query(collection(db, "invites"), where("createdBy", "==", uid()), where("householdId", "==", hid))))
    .forEach(d => ops.push(b => b.delete(d.ref)));
  (await getDocsFromServer(collection(db, ...base, "members"))).forEach(d => { if (d.id !== uid()) ops.push(b => b.delete(d.ref)); });
  await commitOps(ops, n => report && report(`Deleting… ${n} of ${ops.length}`));
  const b = writeBatch(db);
  b.delete(doc(db, ...base));
  b.delete(doc(db, ...base, "members", uid()));
  await b.commit();
}

async function deleteHouseholdFlow() {
  const name = S.household.name;
  const typed = await promptSheet("Delete household?", "Type DELETE to confirm", "", "Delete forever",
    { danger: true, max: 10, msg: `This permanently deletes “${name}”: every store, item, photo, list and plan, for everyone in it. It can't be undone.` });
  if (!typed) return;
  if (typed.trim().toUpperCase() !== "DELETE") { toast("Not deleted. You need to type DELETE."); return; }
  S.busyLeaving = true;
  teardown();
  const p = progressSheet("Deleting household");
  try {
    const hid = S.hid;
    await deleteHouseholdData(hid, t => p.set(t));
    await forgetHousehold(hid);
    toast(`${name} was deleted`);
  } catch (e) { fail(e); }
  finally { p.close(); S.busyLeaving = false; }
  route();
}

async function reauth() {
  const u = auth.currentUser;
  if ((u.providerData || []).some(p => p.providerId === "google.com")) {
    await reauthenticateWithPopup(u, new GoogleAuthProvider());
  } else {
    const pw = await promptSheet("Confirm it's you", "Your password", "", "Continue", { type: "password", max: 128 });
    if (!pw) throw { code: "cancelled" };
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw));
  }
}

async function deleteAccountFlow() {
  if (!await confirmSheet("Delete your account?",
    "This removes you from every household and deletes your account. Households you own and share with others must be handed off first: remove the other members or delete the household. This can't be undone.",
    "Continue", true)) return;
  try { await reauth(); }
  catch (e) { if (e.code !== "cancelled" && e.code !== "auth/popup-closed-by-user") toast(authMsg(e)); return; }

  const hids = Object.keys(S.userDoc.households || {});
  const owned = [];
  for (const hid of hids) {
    try {
      const hs = await getDocFromServer(doc(db, "households", hid));
      if (hs.exists() && hs.data().ownerUid === uid()) {
        const mem = await getDocsFromServer(collection(db, "households", hid, "members"));
        if (mem.size > 1) {
          await choose("Can't delete yet", `You own “${hs.data().name}” and other people are in it. Remove them (Family tab) or delete that household first.`, [{ label: "OK", value: true, cls: "primary" }]);
          return;
        }
        owned.push(hid);
      }
    } catch (e) { /* no access anymore: nothing to clean up */ }
  }
  S.busyLeaving = true;
  teardown();
  const p = progressSheet("Deleting your account");
  try {
    for (const hid of hids) {
      if (owned.includes(hid)) await deleteHouseholdData(hid, t => p.set(t));
      else { try { await deleteDoc(doc(db, "households", hid, "members", uid())); } catch (e) {} }
    }
    p.set("Removing your account…");
    await deleteDoc(doc(db, "users", uid()));
    await deleteUser(auth.currentUser);
    await wipeLocal();
    p.close();
    location.reload();
  } catch (e) {
    p.close(); S.busyLeaving = false;
    console.error(e);
    toast(e.code === "auth/requires-recent-login" ? "Please sign in again, then retry." : "Couldn't finish deleting. Try again.");
    route();
  }
}

/* =====================================================================
   FAMILY TAB
   ===================================================================== */
const isOwner = () => !!S.household && S.household.ownerUid === uid();
const card = (...kids) => h("div", { class: "card" }, ...kids);

function renderFamily() {
  const host = $("#familyBody");
  if (!host || !S.household) return;
  host.textContent = "";
  const owner = isOwner();
  host.append(card(h("div", { class: "fhead" },
    h("div", {}, h("div", { class: "fname", text: S.household.name || "Household" }),
      h("div", { class: "lmeta", text: owner ? "You own this household" : "You're a member" })),
    owner ? h("button", { class: "btn small", text: "Rename", onclick: renameHousehold }) : null)));

  const mem = [...S.members].sort((a, b) => (b.role === "owner") - (a.role === "owner") || String(a.name || "").localeCompare(String(b.name || "")));
  host.append(card(h("h2", { text: `Members (${mem.length})` }),
    mem.map(m => h("div", { class: "mrow" },
      h("div", { class: "av", text: (m.name || m.email || "?").trim().charAt(0).toUpperCase() || "?" }),
      h("div", { class: "mtext" }, h("div", { class: "lname", text: (m.name || "Member") + (m.id === uid() ? " (you)" : "") }),
        h("div", { class: "lmeta", text: m.email || "" })),
      m.role === "owner" ? h("span", { class: "badge", text: "Owner" })
        : (owner && m.id !== uid() ? h("button", { class: "btn small danger", text: "Remove", onclick: () => removeMember(m) }) : null))),
    owner
      ? h("div", { class: "actions", style: "margin-top:12px" },
          h("button", { class: "btn primary", text: "＋ Invite someone", onclick: createInvite }),
          h("button", { class: "btn", text: "Reset links", onclick: () => revokeInvites(true) }))
      : h("p", { class: "note", text: "Only the owner can invite or remove people." })));

  const hh = Object.entries(S.userDoc.households || {});
  host.append(card(h("h2", { text: "Your households" }),
    hh.map(([id, name]) => h("button", { class: "srow" + (id === S.hid ? " cur" : ""), onclick: () => { if (id !== S.hid) switchHousehold(id); } },
      h("div", {}, h("div", { class: "sn", text: id === S.hid ? S.household.name : name }),
        h("div", { class: "sc", text: id === S.hid ? "Open now" : "Tap to switch" })),
      h("span", { class: "chev", text: id === S.hid ? "✓" : "›" }))),
    h("div", { class: "actions", style: "margin-top:10px" },
      h("button", { class: "btn", text: "＋ New household", onclick: newHouseholdSheet }),
      h("button", { class: "btn", text: "Join with code", onclick: joinCodeSheet }))));

  host.append(card(h("h2", { text: "Account & privacy" }),
    h("div", { class: "lmeta", text: `Signed in as ${S.user.email || myName()}${S.admin ? " · Admin" : ""}` }),
    h("div", { class: "menu", style: "margin-top:12px" },
      h("button", { class: "btn", text: "🛡️  Run security check", onclick: runSecurityCheck }),
      h("button", { class: "btn", text: "🆔  Copy my account ID", onclick: () => { try { navigator.clipboard.writeText(uid()); toast("Account ID copied"); } catch (e) { toast(uid()); } } }),
      h("button", { class: "btn", text: "↩️  Sign out", onclick: doSignOut }),
      owner ? h("button", { class: "btn danger", text: "🗑  Delete this household", onclick: deleteHouseholdFlow })
            : h("button", { class: "btn danger", text: "🚪  Leave this household", onclick: leaveHousehold }),
      h("button", { class: "btn danger", text: "⚠️  Delete my account", onclick: deleteAccountFlow })),
    h("p", { class: "note", text: "Items and stores are shared with everyone who uses the app. Lists and calendar stay private to your household. Signing out clears this account's data from this device." })));
}

async function renameHousehold() {
  const name = await promptSheet("Rename household", "Household name", S.household.name, "Save", { max: 60 });
  if (!name) return;
  try {
    await updateDoc(doc(db, "households", S.hid), { name, updatedAt: Date.now() });
    S.userDoc.households[S.hid] = name;
    updateDoc(doc(db, "users", uid()), { [`households.${S.hid}`]: name }).catch(() => {});
  } catch (e) { fail(e); }
}

async function createInvite() {
  const code = randCode(22);
  const p = progressSheet("Making an invite link");
  try {
    await withTimeout(setDoc(doc(db, "invites", code), {
      householdId: S.hid, householdName: clip(S.household.name, 60), createdBy: uid(), createdAt: Date.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 864e5), role: "member"
    }), 15000);
  } catch (e) { p.close(); return e.code === "timeout" ? toast("You need to be online to make an invite.") : fail(e); }
  p.close();
  const link = `${location.origin}${location.pathname}#join=${code}`;
  const s = openSheet("Invite someone");
  s.body.append(
    h("p", { class: "msg", text: `Send this link to someone you trust. Anyone with it can join “${S.household.name}” for the next ${INVITE_DAYS} days.` }),
    h("div", { class: "code", text: link }),
    h("div", { class: "actions" },
      navigator.share ? h("button", { class: "btn primary", text: "📤 Share link", onclick: async () => {
        try { await navigator.share({ title: `Join ${S.household.name}`, text: `Join my household on Visual Shopping List:`, url: link }); } catch (e) {}
      } }) : null,
      h("button", { class: "btn", text: "Copy", onclick: async () => {
        try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch (e) { toast("Couldn't copy. Press and hold the link to copy it."); }
      } })),
    h("p", { class: "note", text: "Sent it to the wrong person? Tap “Reset links” on the Family tab to cancel every link you've made." }));
}

async function revokeInvites(announce) {
  try {
    const snap = await getDocsFromServer(query(collection(db, "invites"), where("createdBy", "==", uid()), where("householdId", "==", S.hid)));
    await commitOps(snap.docs.map(d => b => b.delete(d.ref)));
    if (announce) toast(snap.size ? `Cancelled ${snap.size} invite link${snap.size === 1 ? "" : "s"}` : "No open invite links");
  } catch (e) { if (announce) fail(e); }
}

async function removeMember(m) {
  if (!await confirmSheet("Remove member?", `${m.name || "This person"} will lose access to “${S.household.name}” right away. Open invite links will also be reset so they can't rejoin.`, "Remove", true)) return;
  try {
    await deleteDoc(hdoc("members", m.id));
    await revokeInvites(false);
    toast(`${m.name || "Member"} removed`);
  } catch (e) { fail(e); }
}

async function switchHousehold(id) {
  await setActive(id);
  gateLoading("Switching…");
  enterHousehold(id);
}
async function newHouseholdSheet() {
  const name = await promptSheet("New household", "Household name", "", "Create", { max: 60 });
  if (!name) return;
  try { gateLoading("Creating…"); await createHousehold(name, false); } catch (e) { fail(e); route(); }
}
async function joinCodeSheet() {
  const v = await promptSheet("Join a household", "Invite link or code", "", "Continue", { max: 300 });
  if (!v) return;
  const c = parseCode(v);
  if (c.length < 16) return toast("That code doesn't look right. Paste the whole link.");
  teardown();
  showJoin(c);
}

/* ---------- security self-test against the real, published rules ---------- */
async function runSecurityCheck() {
  const s = openSheet("Security check");
  const list = h("div");
  s.body.append(h("p", { class: "msg", text: "This tries things a stranger or a bad actor would try, and checks that Firebase blocks each one." }), list);
  const rid = () => doc(collection(db, "x")).id;
  const tests = [
    { t: "Your own household works", expect: "ok", run: () => getDocFromServer(doc(db, "households", S.hid)) },
    { t: "Old public data is locked", expect: "deny", run: () => getDocsFromServer(query(collection(db, "inventory"), limit(1))),
      tip: "Publish the security rules (setup step 5)." },
    { t: "Other households are private", expect: "deny", run: () => getDocFromServer(doc(db, "households", rid())) },
    { t: "Can't sneak into another household", expect: "deny", run: () => setDoc(doc(db, "households", rid(), "members", uid()), { role: "owner", name: "x", joinedAt: Date.now() }) },
    { t: "Other people's accounts are private", expect: "deny", run: () => getDocFromServer(doc(db, "users", rid())) },
    { t: "Junk data is rejected", expect: "deny", run: () => setDoc(sdoc("inventory", "security-check-test"), { name: "x", store: "y", createdBy: uid(), sneaky: true }) },
    ...(S.admin ? [] : [{ t: "Regular members can't delete items", expect: "deny", run: () => deleteDoc(sdoc("inventory", "security-check-test")) }]),
    { t: "Only owners can make invites", expect: "deny", run: () => setDoc(doc(db, "invites", randCode(22)), {
        householdId: rid(), householdName: "x", createdBy: uid(), createdAt: Date.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 864e5), role: "member" }) }
  ];
  let allGood = true;
  for (const test of tests) {
    const row = h("div", { class: "check-row" }, h("i", {}, h("span", { class: "spin" })), h("div", {}, test.t));
    list.append(row);
    let outcome;
    try { await withTimeout(test.run(), 12000); outcome = "ok"; }
    catch (e) { outcome = e.code === "permission-denied" ? "deny" : (e.code === "timeout" || e.code === "unavailable" ? "offline" : "deny-other:" + e.code); }
    let icon, note = "";
    if (outcome === "offline") { icon = "⚪"; note = "Couldn't reach Firebase. Are you online?"; allGood = false; }
    else if (outcome === test.expect || (test.expect === "deny" && outcome.startsWith("deny"))) icon = "✅";
    else { icon = "❌"; allGood = false; note = test.tip || "This should be blocked. Re-publish the security rules."; }
    row.firstChild.textContent = icon;
    if (note) row.lastChild.append(h("small", { text: note }));
  }
  list.append(h("p", { class: allGood ? "ok" : "err", style: "margin-top:12px", text: allGood ? "All locks are working." : "Something isn't locked down. See the notes above." }));
}

/* =====================================================================
   HEADER & TABS
   ===================================================================== */
function setTab(t) {
  S.tab = t; lsSet("tab", t);
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + t));
  document.querySelectorAll(".tabs button").forEach(b => {
    if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  renderHeader();
  window.scrollTo(0, 0);
}
const currentList = () => S.lists.find(l => l.id === S.listId);
const listName = () => (currentList() && currentList().name) || "Shopping List";
function renderHeader() {
  const title = $("#title"), act = $("#hdrActions");
  act.textContent = "";
  if (S.tab === "list") {
    title.textContent = listName();
    act.append(h("button", { class: "hbtn", text: "📤 Share", onclick: shareList }),
               h("button", { class: "hbtn", "aria-label": "List options", text: "⋯", onclick: listMenu }));
  } else if (S.tab === "stores") {
    title.textContent = S.store ? S.store : "Add Items";
    if (S.store) act.append(h("button", { class: "hbtn", "aria-label": "Store options", text: "⋯", onclick: () => storeMenu(S.store) }));
  } else if (S.tab === "create") {
    title.textContent = "Create & Plan";
  } else {
    title.textContent = (S.household && S.household.name) || "Family";
  }
}

/* =====================================================================
   LIST TAB
   ===================================================================== */
function storeNames() {
  const set = new Set();
  S.storeDocs.forEach(s => s.name && set.add(s.name));
  S.inventory.forEach(i => i.store && set.add(i.store));
  return [...set].sort((a, b) => a.localeCompare(b));
}
const itemsIn = store => S.inventory.filter(i => i.store === store);
const findOnList = item => S.listItems.find(li => (li.inventoryId && li.inventoryId === item.id) || (norm(li.name) === norm(item.name) && li.store === item.store));

function addToList(item) {
  const existing = findOnList(item);
  if (existing) {
    const q = Math.min(999, qtyOf(existing) + 1);
    updateDoc(itemDoc(S.listId, existing.id), { qty: q, inCart: false }).catch(fail);
    toast(`${item.name} ×${q} on ${listName()}`);
  } else {
    addDoc(itemsCol(S.listId), {
      name: clip(item.name, 120), aisle: clip(item.aisle, 40), price: cleanPrice(item.price), image: cleanImage(item.image),
      store: clip(item.store, 80) || "Other", addedAt: Date.now(), inCart: false, qty: 1,
      inventoryId: item.id || null, addedBy: uid()
    }).catch(fail);
    toast(`Added ${item.name} to ${listName()}`);
  }
}

function renderChips() {
  const host = $("#listChips");
  host.textContent = "";
  S.lists.forEach(l => host.append(h("button", { class: "chip" + (l.id === S.listId ? " on" : ""), text: l.name || "Untitled",
    onclick: () => { if (l.id !== S.listId) switchList(l.id); } })));
  host.append(h("button", { class: "chip add", text: "＋ New list", onclick: newList }));
}

function renderList() {
  const host = $("#listBody");
  host.textContent = "";
  if (!S.ready.items) { host.append(h("div", { class: "empty", text: "Loading…" })); return; }
  const items = S.listItems;
  if (!items.length) {
    host.append(h("div", { class: "empty" }, h("b", { text: "Your list is empty" }),
      "Type an item above, or open Add Items and tap things you need.",
      h("br"), h("button", { class: "btn primary", text: "🛒 Browse store items", onclick: () => setTab("stores") })));
    return;
  }
  const checked = items.filter(i => i.inCart);
  host.append(h("div", { class: "totals" },
    h("div", { class: "t" }, h("div", { class: "lbl", text: "Total" }), h("b", { text: money(sum(items, lineTotal)) })),
    h("div", {}, h("div", { class: "lbl", text: "In cart" }), h("b", { text: money(sum(checked, lineTotal)) })),
    h("div", {}, h("div", { class: "lbl", text: "Done" }), h("b", { text: `${checked.length}/${items.length}` }))));
  if (checked.length) host.append(h("div", { class: "links" },
    h("button", { class: "link", text: S.hideChecked ? `Show checked (${checked.length})` : "Hide checked",
      onclick: () => { S.hideChecked = !S.hideChecked; lsSet("hideChecked", S.hideChecked ? "1" : "0"); renderList(); } }),
    h("button", { class: "link", text: "Clear checked", onclick: clearChecked })));

  const groups = new Map();
  items.forEach(i => { const k = i.store || "Other"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const keys = [...groups.keys()].sort((a, b) => (a === "Other") - (b === "Other") || a.localeCompare(b));
  for (const k of keys) {
    const all = groups.get(k);
    let rows = all.slice().sort((a, b) => (a.inCart ? 1 : 0) - (b.inCart ? 1 : 0) || byAisle(a, b));
    if (S.hideChecked) rows = rows.filter(i => !i.inCart);
    if (!rows.length) continue;
    host.append(h("section", { class: "group" },
      h("div", { class: "ghead" }, h("h2", { text: k }), h("span", { text: money(sum(all, lineTotal)) })),
      h("div", { class: "gcard" }, rows.map(listRow))));
  }
}

function listRow(it) {
  const p = priceNum(it.price);
  const metaText = [aisleLabel(it.aisle), qtyOf(it) > 1 ? "×" + qtyOf(it) : ""].filter(Boolean).join(" · ");
  const meta = h("div", { class: "lmeta" }, metaText,
    p != null ? h("span", { class: "price", text: (metaText ? "  " : "") + money(p * qtyOf(it)) }) : null);
  return h("div", { class: "litem" + (it.inCart ? " done" : "") },
    h("button", { class: "cb" + (it.inCart ? " on" : ""), "aria-label": (it.inCart ? "Uncheck " : "Check ") + it.name,
      onclick: () => updateDoc(itemDoc(S.listId, it.id), { inCart: !it.inCart }).catch(fail) },
      h("i", { text: it.inCart ? "✓" : "" })),
    h("button", { class: "lbody", onclick: () => openListItem(it) },
      thumbEl(it.image, "thumb"),
      h("div", { class: "ltext" }, h("div", { class: "lname", text: it.name || "Untitled" }), meta)),
    h("button", { class: "x", "aria-label": "Remove " + it.name, text: "✕", onclick: () => removeListItem(it) }));
}

function removeListItem(it) {
  const { id, ...data } = it;
  const listId = S.listId;
  deleteDoc(itemDoc(listId, id)).catch(fail);
  toast(`Removed ${it.name}`, { label: "Undo", fn: () => setDoc(itemDoc(listId, id), { ...data, addedBy: uid() }).catch(fail) });
}

function openListItem(it) {
  const s = openSheet(it.name || "Item");
  const inv = S.inventory.find(i => i.id === it.inventoryId) || S.inventory.find(i => norm(i.name) === norm(it.name) && i.store === it.store);
  let q = qtyOf(it);
  const qEl = h("b", { text: String(q) });
  const setQ = n => { q = Math.max(1, Math.min(999, n)); qEl.textContent = q; updateDoc(itemDoc(S.listId, it.id), { qty: q }).catch(fail); };
  const p = priceNum(it.price);
  const by = S.members.find(m => m.id === it.addedBy);
  s.body.append(
    h("div", { class: "detail" }, thumbEl(it.image, ""),
      h("div", {}, h("div", { class: "lname", text: it.name }),
        h("div", { class: "lmeta", text: [it.store, aisleLabel(it.aisle), p != null ? money(p) + " each" : "No price yet"].filter(Boolean).join(" · ") }),
        by ? h("div", { class: "lmeta", text: `Added by ${by.id === uid() ? "you" : by.name}` }) : null)),
    h("div", { class: "qty" },
      h("button", { "aria-label": "Less", text: "−", onclick: () => setQ(q - 1) }), qEl,
      h("button", { "aria-label": "More", text: "+", onclick: () => setQ(q + 1) })),
    h("div", { class: "menu" },
      inv ? h("button", { class: "btn", text: "✏️  Edit item (price, aisle, photo)", onclick: () => { s.close(); openEdit(inv); } }) : null,
      h("button", { class: "btn danger", text: "🗑  Remove from list", onclick: () => { s.close(); removeListItem(it); } }),
      h("button", { class: "btn primary", style: "text-align:center", text: "Done", onclick: () => s.close() })));
}

async function clearChecked() {
  const done = S.listItems.filter(i => i.inCart);
  if (!done.length) return;
  const listId = S.listId;
  const copies = done.map(({ id, ...data }) => ({ id, data }));
  try { await commitOps(copies.map(c => b => b.delete(itemDoc(listId, c.id)))); } catch (e) { return fail(e); }
  toast(`Cleared ${done.length} item${done.length === 1 ? "" : "s"}`, { label: "Undo",
    fn: () => commitOps(copies.map(c => b => b.set(itemDoc(listId, c.id), { ...c.data, addedBy: uid() }))).catch(fail) });
}

async function shareList() {
  const items = S.listItems;
  let text = `🛒 ${listName()}\nTotal: ${money(sum(items, lineTotal))}\n\n`;
  const groups = new Map();
  items.forEach(i => { const k = i.store || "Other"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  for (const [store, arr] of groups) {
    text += `📍 ${store} (${money(sum(arr, lineTotal))}):\n`;
    arr.slice().sort(byAisle).forEach(i => {
      const p = priceNum(i.price);
      text += `  ${i.inCart ? "✅" : "◻️"} ${i.name}${qtyOf(i) > 1 ? " ×" + qtyOf(i) : ""}${i.aisle ? ` (${aisleLabel(i.aisle)})` : ""}${p != null ? " - " + money(p * qtyOf(i)) : ""}\n`;
    });
    text += "\n";
  }
  text = text.trim();
  if (navigator.share) { try { await navigator.share({ title: listName(), text }); } catch (e) {} return; }
  try { await navigator.clipboard.writeText(text); toast("List copied, paste it into a text"); } catch (e) { toast("Couldn't share from this browser"); }
}

function listMenu() {
  const s = openSheet(listName());
  const row = (label, fn, cls) => h("button", { class: "btn " + (cls || ""), text: label, onclick: () => { s.close(); fn(); } });
  s.body.append(h("div", { class: "menu" },
    row("📤  Share list", shareList),
    row("✏️  Rename list", renameList),
    row("🧹  Clear checked items", clearChecked),
    row("＋  New list", newList),
    row("🗑  Delete this list", deleteList, "danger")));
}
async function newList() {
  const name = await promptSheet("New list", "List name", "", "Create", { max: 60 });
  if (!name) return;
  const ref = doc(hcol("lists"));
  setDoc(ref, { name, createdAt: Date.now(), createdBy: uid() }).catch(fail);
  switchList(ref.id);
}
async function renameList() {
  const name = await promptSheet("Rename list", "List name", listName(), "Save", { max: 60 });
  if (name) updateDoc(hdoc("lists", S.listId), { name }).catch(fail);
}
async function deleteList() {
  if (S.lists.length <= 1) { toast("You need at least one list"); return; }
  if (!await confirmSheet("Delete list?", `This deletes “${listName()}” and everything on it, for everyone in your household.`, "Delete", true)) return;
  const id = S.listId;
  try {
    const snap = await getDocs(itemsCol(id));
    await commitOps(snap.docs.map(d => b => b.delete(d.ref)));
    await deleteDoc(hdoc("lists", id));
  } catch (e) { return fail(e); }
  const next = S.lists.find(l => l.id !== id);
  if (next) switchList(next.id);
}

$("#quickForm").addEventListener("submit", e => {
  e.preventDefault();
  const inp = $("#quickInput");
  const name = clip(inp.value, 120);
  if (!name || !S.hid) return;
  const matches = S.inventory.filter(i => norm(i.name) === norm(name));
  const pick = matches.find(i => i.store === S.store) || matches[0];
  if (pick) addToList(pick);
  else {
    addDoc(itemsCol(S.listId), { name, aisle: "", price: "", image: "", store: clip(S.store, 80) || "Other",
      addedAt: Date.now(), inCart: false, qty: 1, inventoryId: null, addedBy: uid() }).catch(fail);
    toast(`Added ${name}`);
  }
  inp.value = "";
});

/* =====================================================================
   ADD ITEMS (stores) TAB
   ===================================================================== */
function renderStores() {
  const host = $("#storesBody");
  host.textContent = "";
  $("#invSearch").placeholder = S.store ? `🔍 Search ${S.store}…` : "🔍 Search all items…";
  if (!S.ready.inv) { host.append(h("div", { class: "empty", text: "Loading…" })); return; }
  const q = norm(S.invQuery);
  const matchQ = i => !q || norm(i.name).includes(q) || norm(i.aisle).includes(q);

  if (!S.store) {
    if (q) {
      const hits = S.inventory.filter(matchQ).sort((a, b) => String(a.store || "").localeCompare(String(b.store || "")) || byAisle(a, b));
      if (!hits.length) {
        host.append(h("div", { class: "empty" }, h("b", { text: "No matches" }), "Try another word, or save it as a new item.",
          h("br"), h("button", { class: "btn primary", text: "＋ Add new item", onclick: () => openNewItem("", S.invQuery) })));
        return;
      }
      host.append(h("div", { class: "grid" }, hits.map(i => itemCard(i, true))));
      return;
    }
    const names = storeNames();
    if (!names.length) {
      host.append(h("div", { class: "empty" }, h("b", { text: "Add your first store" }),
        "Then save the things you buy there, with a photo, aisle and price.", h("br"),
        h("button", { class: "btn primary", text: "➕ Add a store", onclick: addStore })));
      return;
    }
    host.append(h("div", { class: "gcard" },
      names.map(n => {
        const c = itemsIn(n).length;
        return h("button", { class: "srow", onclick: () => openStore(n) },
          h("div", {}, h("div", { class: "sn", text: n }), h("div", { class: "sc", text: `${c} item${c === 1 ? "" : "s"}` })),
          h("span", { class: "chev", text: "›" }));
      }),
      h("button", { class: "srow add", onclick: addStore }, "➕  Add new store")));
    return;
  }

  const items = itemsIn(S.store).filter(matchQ).sort(byAisle);
  host.append(h("div", { class: "sbar" },
    h("button", { class: "btn", text: "‹ All stores", onclick: () => openStore(null) }),
    h("div", { class: "grow" }),
    h("button", { class: "btn primary", text: "＋ New item", onclick: () => openNewItem(S.store) })));
  if (!items.length) {
    host.append(h("div", { class: "empty" }, h("b", { text: q ? "No matches" : `No items saved for ${S.store} yet` }),
      "Add one with a photo, aisle and price.", h("br"),
      h("button", { class: "btn primary", text: "＋ Add item", onclick: () => openNewItem(S.store, q ? S.invQuery : "") })));
    return;
  }
  host.append(h("div", { class: "grid" }, items.map(i => itemCard(i, false))));
}

function itemCard(item, showStore) {
  const on = findOnList(item);
  const p = priceNum(item.price);
  const metaText = [showStore ? item.store : "", aisleLabel(item.aisle)].filter(Boolean).join(" · ");
  return h("div", { class: "icard" + (on ? " on" : "") },
    h("button", { class: "iadd", "aria-label": "Add " + item.name + " to list", onclick: () => addToList(item) },
      thumbEl(item.image, ""),
      h("div", { class: "iname", text: item.name }),
      h("div", { class: "imeta" }, metaText,
        p != null ? h("span", { class: "price", text: (metaText ? "  " : "") + money(p) }) : null)),
    on ? h("span", { class: "onbadge", text: qtyOf(on) > 1 ? `✓ ×${qtyOf(on)}` : "✓ On list" }) : null,
    h("button", { class: "iedit", "aria-label": "Edit " + item.name, text: "✏️", onclick: () => openEdit(item) }));
}

function openStore(name) {
  S.store = name; S.invQuery = ""; $("#invSearch").value = "";
  if (name) lsSet("lastStore", name);
  renderHeader(); renderStores(); window.scrollTo(0, 0);
}
$("#invSearch").addEventListener("input", e => { S.invQuery = e.target.value; renderStores(); });

function ensureStoreDoc(name) {
  if (!name || S.storeDocs.some(s => s.name === name)) return;
  setDoc(sdoc("stores", slug(name)), { name, createdAt: Date.now(), createdBy: uid() }).catch(() => {});
}
async function addStore() {
  const name = await promptSheet("New store", "Store name", "", "Add store", { max: 80 });
  if (!name) return null;
  const existing = storeNames().find(n => norm(n) === norm(name));
  const finalName = existing || name;
  ensureStoreDoc(finalName);
  if (S.tab === "stores") openStore(finalName);
  return finalName;
}

function storeMenu(name) {
  const s = openSheet(name);
  const row = (label, fn, cls) => h("button", { class: "btn " + (cls || ""), text: label, onclick: () => { s.close(); fn(); } });
  s.body.append(h("div", { class: "menu" },
    row("＋  Add item to " + name, () => openNewItem(name)),
    S.admin ? row("✏️  Rename store", () => renameStore(name)) : null,
    S.admin ? row("🗑  Delete store", () => deleteStore(name), "danger") : null));
}
async function renameStore(oldName) {
  const name = await promptSheet("Rename store", "Store name", oldName, "Save", { max: 80 });
  if (!name || name === oldName) return;
  try {
    const ops = itemsIn(oldName).map(i => b => b.update(sdoc("inventory", i.id), { store: name, updatedAt: Date.now(), updatedBy: uid() }));
    S.storeDocs.filter(s => s.name === oldName).forEach(s => ops.push(b => b.delete(sdoc("stores", s.id))));
    ops.push(b => b.set(sdoc("stores", slug(name)), { name, createdAt: Date.now(), createdBy: uid() }));
    await commitOps(ops);
    for (const l of S.lists) {
      const snap = await getDocs(itemsCol(l.id));
      const lops = [];
      snap.forEach(ds => { if (ds.data().store === oldName) lops.push(b => b.update(ds.ref, { store: name })); });
      if (lops.length) await commitOps(lops);
    }
  } catch (e) { return fail(e); }
  if (S.store === oldName) openStore(name);
  toast("Store renamed");
}
async function deleteStore(name) {
  const items = itemsIn(name);
  if (!await confirmSheet("Delete store?", `This deletes “${name}” and its ${items.length} saved item${items.length === 1 ? "" : "s"} for everyone. Items already on lists stay there.`, "Delete", true)) return;
  try {
    const ops = items.map(i => b => b.delete(sdoc("inventory", i.id)));
    S.storeDocs.filter(s => s.name === name).forEach(s => ops.push(b => b.delete(sdoc("stores", s.id))));
    await commitOps(ops);
  } catch (e) { return fail(e); }
  if (S.store === name) openStore(null);
  toast("Store deleted");
}

// When a saved item changes, update its copies on every list so prices and aisles stay correct.
async function syncListsFromItem(oldItem, data) {
  for (const l of S.lists) {
    try {
      const snap = await getDocs(itemsCol(l.id));
      const ops = [];
      snap.forEach(ds => {
        const v = ds.data();
        const match = (v.inventoryId && v.inventoryId === oldItem.id) || (norm(v.name) === norm(oldItem.name) && v.store === oldItem.store);
        if (match) ops.push(b => b.update(ds.ref, { name: data.name, aisle: data.aisle, price: data.price, image: data.image, store: data.store, inventoryId: oldItem.id }));
      });
      if (ops.length) await commitOps(ops);
    } catch (e) { console.warn("list sync", l.id, e); }
  }
}

/* =====================================================================
   ITEM FORM (create + edit)
   ===================================================================== */
function pickImage(useCamera) {
  return new Promise(res => {
    const i = h("input", { type: "file", accept: "image/*", style: "display:none" });
    if (useCamera) i.setAttribute("capture", "environment");
    const done = f => { i.remove(); res(f); };
    i.addEventListener("change", () => done(i.files && i.files[0] || null));
    i.addEventListener("cancel", () => done(null));
    document.body.append(i);
    i.click();
  });
}
async function compressImage(file) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new Error("not an image");
  if (file.size > 40e6) throw new Error("too big");
  let src, w, ht, free = () => {};
  try {
    const b = await createImageBitmap(file, { imageOrientation: "from-image" });
    src = b; w = b.width; ht = b.height; free = () => b.close && b.close();
  } catch (e) {
    const url = URL.createObjectURL(file);
    src = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; });
    w = src.naturalWidth; ht = src.naturalHeight; free = () => URL.revokeObjectURL(url);
  }
  let out = "";
  for (const [edge, q] of [[480, 0.75], [400, 0.65], [320, 0.6]]) {
    const s = Math.min(1, edge / Math.max(w, ht));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(ht * s));
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);   // re-drawing also strips photo location data
    c.width = c.height = 0;
    if (out.length < 120000) break;
  }
  free();
  return cleanImage(out);
}

let formSeq = 0;
const liveForms = new Set();
const refreshForms = () => [...liveForms].forEach(f => f.refresh());

function itemForm(host, { item, store, name, onDone }) {
  const editing = !!item;
  const d = {
    name: item ? item.name || "" : (name || ""),
    store: item ? item.store || "" : (store || lsGet("lastStore") || ""),
    aisle: item ? item.aisle || "" : "",
    price: item ? (priceNum(item.price) != null ? String(item.price) : "") : "",
    image: item && item.image && item.image !== PLACEHOLDER ? item.image : ""
  };
  let alsoAdd = false, busy = false;
  const dl = h("datalist", { id: "aisles-" + (++formSeq) });
  const storeSel = h("select", { "aria-label": "Store", onchange: async e => {
    if (e.target.value === "__new") {
      const n = await addStore();
      if (n) d.store = n;
    } else d.store = e.target.value;
    refresh();
  } });
  function refresh() {
    const names = storeNames();
    if (d.store && !names.includes(d.store)) names.push(d.store);
    storeSel.textContent = "";
    storeSel.append(h("option", { value: "", text: "Choose a store…", disabled: true, selected: !d.store }),
      ...names.map(n => h("option", { value: n, text: n, selected: n === d.store })),
      h("option", { value: "__new", text: "➕ Add new store…" }));
    storeSel.value = d.store || "";
    const aisles = [...new Set(itemsIn(d.store).map(i => i.aisle).filter(Boolean))].sort((a, b) => byAisle({ aisle: a }, { aisle: b }));
    dl.textContent = ""; aisles.forEach(a => dl.append(h("option", { value: a })));
  }
  const live = { refresh: () => { if (!host.isConnected || !host.contains(storeSel)) liveForms.delete(live); else refresh(); } };
  liveForms.add(live);

  function draw() {
    host.textContent = "";
    refresh();
    host.append(dl,
      h("div", { class: "photo" },
        d.image ? h("img", { class: "pv", src: d.image, alt: "Item photo" }) : h("div", { class: "pv", text: "📷" }),
        h("div", { class: "pb" },
          h("button", { class: "btn violet", type: "button", text: "📸 Take photo", onclick: () => getPhoto(true) }),
          h("button", { class: "btn", type: "button", text: "🖼️ Choose photo", onclick: () => getPhoto(false) }),
          d.image ? h("button", { class: "btn danger", type: "button", text: "Remove photo", onclick: () => { d.image = ""; draw(); } }) : null)),
      h("label", { class: "fl" }, h("span", { text: "Item name" }),
        h("input", { value: d.name, maxlength: "120", placeholder: "e.g. Eggs (dozen)", autocapitalize: "sentences", oninput: e => { d.name = e.target.value; } })),
      h("label", { class: "fl" }, h("span", { text: "Store" }), storeSel),
      h("div", { class: "two" },
        h("label", { class: "fl" }, h("span", { text: "Aisle" }),
          h("input", { list: dl.id, value: d.aisle, maxlength: "40", placeholder: "e.g. 4 or Dairy", oninput: e => { d.aisle = e.target.value; } })),
        h("label", { class: "fl" }, h("span", { text: "Price" }),
          h("div", { class: "money" }, h("input", { type: "text", inputmode: "decimal", maxlength: "10", value: d.price, placeholder: "0.00", oninput: e => { d.price = e.target.value; } })))),
      !editing ? h("label", { class: "check" },
        h("input", { type: "checkbox", checked: alsoAdd, onchange: e => { alsoAdd = e.target.checked; } }),
        `Also add to “${listName()}”`) : null,
      h("div", { class: "actions" },
        editing && S.admin ? h("button", { class: "btn danger", type: "button", text: "Delete", onclick: del }) : null,
        h("button", { class: "btn green", type: "button", text: editing ? "Save changes" : "Save item", onclick: save })));
  }

  async function getPhoto(camera) {
    const f = await pickImage(camera);
    if (!f) return;
    try { d.image = await compressImage(f); if (!d.image) throw 0; } catch (e) { toast("Couldn't use that photo"); }
    draw();
  }

  async function save() {
    if (busy) return;
    const name = clip(d.name, 120), store = clip(d.store, 80), aisle = clip(d.aisle, 40);
    if (!name) { toast("Add an item name"); return; }
    if (!store) { toast("Choose a store"); return; }
    const rawPrice = d.price.trim().replace(/^\$/, "");
    const price = cleanPrice(rawPrice);
    if (rawPrice && !price) { toast("Price should be a number like 2.99"); return; }
    const image = cleanImage(d.image);
    busy = true;
    try {
      ensureStoreDoc(store);
      lsSet("lastStore", store);
      if (editing) {
        const data = { name, store, aisle, price, image, updatedAt: Date.now(), updatedBy: uid() };
        updateDoc(sdoc("inventory", item.id), data).catch(fail);
        syncListsFromItem(item, data);
        toast("Saved");
      } else {
        const dup = S.inventory.find(i => i.store === store && norm(i.name) === norm(name));
        let target = null;
        if (dup) {
          const c = await choose("Already saved", `“${dup.name}” is already in ${store}. Update it with these details instead?`,
            [{ label: "Cancel", value: null }, { label: "Add as new", value: "new" }, { label: "Update it", value: "update", cls: "primary" }]);
          if (!c) return;
          if (c === "update") {
            const merged = { name, store, aisle, price, image: image || cleanImage(dup.image), updatedAt: Date.now(), updatedBy: uid() };
            updateDoc(sdoc("inventory", dup.id), merged).catch(fail);
            syncListsFromItem(dup, merged);
            target = { ...dup, ...merged };
          }
        }
        if (!target) {
          const ref = doc(scol("inventory"));
          const data = { name, store, aisle, price, image, createdAt: Date.now(), createdBy: uid() };
          setDoc(ref, data).catch(fail);
          target = { ...data, id: ref.id };
        }
        if (alsoAdd) addToList(target); else toast(`Saved to ${store}`);
      }
      onDone && onDone();
    } finally { busy = false; }
  }

  async function del() {
    if (!await confirmSheet("Delete item?", `Remove “${item.name}” from ${item.store} for everyone? Copies already on lists stay.`, "Delete", true)) return;
    deleteDoc(sdoc("inventory", item.id)).catch(fail);
    toast("Item deleted");
    onDone && onDone();
  }

  draw();
}

function openEdit(item) {
  const s = openSheet("Edit item");
  itemForm(s.body, { item, onDone: () => s.close() });
}
function openNewItem(store, name) {
  const s = openSheet(store ? `New item · ${store}` : "New item");
  itemForm(s.body, { store, name, onDone: () => s.close() });
}
function renderCreateForm() {
  itemForm($("#createForm"), { store: S.store, onDone: renderCreateForm });
}

/* =====================================================================
   CALENDAR
   ===================================================================== */
function renderCalendar() {
  const host = $("#calendar");
  host.textContent = "";
  const y = S.calMonth.getFullYear(), m = S.calMonth.getMonth();
  const shift = n => { S.calMonth = new Date(y, m + n, 1); renderCalendar(); };
  host.append(h("div", { class: "calh" },
    h("button", { class: "calnav", "aria-label": "Previous month", text: "‹", onclick: () => shift(-1) }),
    h("b", { text: `${MONTHS[m]} ${y}` }),
    h("button", { class: "calnav", "aria-label": "Next month", text: "›", onclick: () => shift(1) })));
  const grid = h("div", { class: "cal" });
  ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(n => grid.append(h("div", { class: "dn", text: n })));
  const first = new Date(y, m, 1).getDay(), total = new Date(y, m + 1, 0).getDate(), today = dateKey(new Date());
  for (let i = 0; i < first; i++) grid.append(h("div"));
  for (let day = 1; day <= total; day++) {
    const key = dateKey(new Date(y, m, day));
    const cls = ["day", key === today ? "today" : "", key === S.calDay ? "sel" : "", S.events.some(e => e.date === key) ? "dot" : ""].join(" ");
    grid.append(h("button", { class: cls, text: String(day), onclick: () => { S.calDay = key; renderCalendar(); } }));
  }
  host.append(grid);
  const [sy, sm, sd] = S.calDay.split("-").map(Number);
  const label = new Date(sy, sm - 1, sd).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const evs = S.events.filter(e => e.date === S.calDay);
  host.append(h("div", { class: "evs" },
    h("h3", { text: label }),
    evs.length ? evs.map(ev => h("div", { class: "ev" }, h("span", { text: ev.title }),
      h("button", { class: "x", "aria-label": "Delete " + ev.title, text: "✕", onclick: () => {
        const { id, ...data } = ev;
        deleteDoc(hdoc("events", id)).catch(fail);
        toast("Event deleted", { label: "Undo", fn: () => setDoc(hdoc("events", id), { ...data, createdBy: uid() }).catch(fail) });
      } }))) : h("div", { class: "lmeta", text: "Nothing planned." }),
    h("button", { class: "btn block", style: "margin-top:10px", text: "＋ Add to this day", onclick: async () => {
      const title = await promptSheet("Add to " + label, "What's planned?", "", "Add", { max: 140 });
      if (title) addDoc(hcol("events"), { title, date: S.calDay, createdAt: Date.now(), createdBy: uid() }).catch(fail);
    } })));
}

function updateNames() {
  const dl = $("#invNames");
  dl.textContent = "";
  [...new Set(S.inventory.map(i => i.name).filter(Boolean))].sort().forEach(n => dl.append(h("option", { value: n })));
}

/* =====================================================================
   START
   ===================================================================== */
(function captureInvite() {
  const m = location.hash.match(/join=([A-Za-z0-9]{16,40})/);
  if (m) {
    setPendingJoin(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
  }
})();
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
const syncOnline = () => $("#offline").classList.toggle("hidden", navigator.onLine);
window.addEventListener("online", syncOnline); window.addEventListener("offline", syncOnline); syncOnline();

getRedirectResult(auth).catch(e => { if (e && e.code && e.code !== "auth/no-auth-event") console.warn(e); });
onAuthStateChanged(auth, user => {
  if (S.busyLeaving) return;
  if (S.user && user && S.user.uid === user.uid && S.hid) return;   // token refresh, nothing to do
  teardown();
  S.user = user; S.userDoc = null; S.hid = null; S.household = null;
  route();
});
