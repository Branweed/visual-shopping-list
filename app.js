import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { MORE_MEALS } from "./meals-more.js?v=51";
import { MEAL_VERSIONS } from "./meal-versions.js?v=51";
import { nutrition, HEALTH, foodOf } from "./nutrition.js?v=51";
import { DIETS, DIET_KEYS, dietStatus, applyDiet } from "./diets.js?v=51";
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
  ready: { inv: false, items: false }, busyLeaving: false,
  aisleShared: new Map(), aisleMine: new Map()
};
const uid = () => (S.user ? S.user.uid : null);
const MAX_PEOPLE = 50;   // most people a recipe can be sized for

/* ---------- local settings (per person, never shared) ---------- */
const lsKey = k => `vsl:${uid() || "anon"}:${k}`;
const lsGet = k => { try { return localStorage.getItem(lsKey(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(lsKey(k), v); } catch (e) {} };
const JOIN_KEY = "vsl:pendingJoin";
function pendingJoinInfo() {
  try {
    const v = JSON.parse(localStorage.getItem(JOIN_KEY) || "null");
    if (v && v.code && Date.now() - v.at < 3 * 864e5) return v;
  } catch (e) {}
  return null;
}
function getPendingJoin() { const v = pendingJoinInfo(); return v ? v.code : null; }
function setPendingJoin(code, from, hh) { try { localStorage.setItem(JOIN_KEY, JSON.stringify({ code, from: from || "", hh: hh || "", at: Date.now() })); } catch (e) {} }
// Facebook Messenger, Instagram, Snapchat… open links in their own built-in browser, where Google refuses to sign anyone in.
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|Snapchat|musical_ly|TikTok|; wv\)/i.test(navigator.userAgent || "");
const IS_ANDROID = /Android/i.test(navigator.userAgent || "");
// The same page, opened in Chrome on Android (keeps the invite in the address).
function chromeIntentUrl() {
  const u = new URL(location.href);
  const v = pendingJoinInfo();
  if (v) { u.searchParams.set("join", v.code); if (v.from) u.searchParams.set("from", v.from); if (v.hh) u.searchParams.set("hh", v.hh); }
  u.hash = "";
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}
function inviteUrlNow() {
  const u = new URL(location.href), v = pendingJoinInfo();
  if (v) { u.searchParams.set("join", v.code); if (v.from) u.searchParams.set("from", v.from); if (v.hh) u.searchParams.set("hh", v.hh); }
  u.hash = "";
  return u.href;
}
function clearPendingJoin() { try { localStorage.removeItem(JOIN_KEY); } catch (e) {} }

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
// Like el.append, but skips empty values instead of printing "null".
const put = (el, ...kids) => el.append(...kids.flat().filter(k => k != null && k !== false));
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
// Items sold by weight carry per: "lb". On a list they also carry lbs (how much you expect to buy).
const isPerLb = i => !!i && i.per === "lb";
function lbsOf(li) {
  if (li.lbs > 0) return li.lbs;
  const m = String(li.note || "").match(/(\d+(?:\s+\d\/\d)?|\d+\/\d|\d*\.\d+)\s*(lb|lbs|oz)\b/i);   // "2 1/2 lb · Chili"
  if (m) { const n = String(m[1]).trim().split(/\s+/).reduce((a, p) => a + (p.includes("/") ? +p.split("/")[0] / +p.split("/")[1] : +p), 0); return /oz/i.test(m[2]) ? n / 16 : n; }
  return 1;
}
const fmtLbs = n => (Math.round(n * 100) / 100).toString();
const priceText = i => { const p = priceNum(i.price); return p == null ? "" : money(p) + (isPerLb(i) ? "/lb" : ""); };
const lineTotal = i => (priceNum(i.price) || 0) * (isPerLb(i) ? lbsOf(i) : qtyOf(i));
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
// An aisle sign: big number for numbered aisles, a small label for named spots ("Produce", "Deli").
function aisleSign(a) {
  const t = String(a == null ? "" : a).trim();
  if (!t) return null;
  const m = t.match(/^(?:aisle\s*)?(\d{1,3}[a-z]?)$/i);
  return m ? h("span", { class: "aisle", title: "Aisle " + m[1] }, h("small", { text: "aisle" }), h("b", { text: m[1].toUpperCase() }))
           : h("span", { class: "aisle named", text: t });
}
// Each store gets its own colour and initials, so stores are easy to tell apart.
const STORE_COLORS = ["#17614a", "#b4472c", "#2f5d9a", "#8a5a12", "#6b3f8f", "#2c7a7b", "#9b2f55", "#4f6b1f"];
function storeTag(name) {
  const n = String(name || "?");
  let hsh = 0; for (const c of n) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const words = n.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[1][0] : n.replace(/[^A-Za-z0-9]/g, "").slice(0, 2)).toUpperCase();
  return h("span", { class: "stag", style: `background:${STORE_COLORS[hsh % STORE_COLORS.length]}`, "aria-hidden": "true", text: ini });
}
function byName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base", numeric: true });
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
  if (e && e.code === "permission-denied" && S.rulesOk === false) toast("Firebase is still using old security rules. Publish the newest firestore.rules (see Family tab).");
  else if (e && e.code === "permission-denied") toast("You don't have permission to do that.");
  else toast("Couldn't save that. Check your connection and try again.");
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad({ code: "timeout" }), ms))]);

/* ---------- paths: everything lives inside the current household ---------- */
const hcol = (...p) => collection(db, "households", S.hid, ...p);
const hdoc = (...p) => doc(db, "households", S.hid, ...p);
// The item and store catalog is the original "inventory" and "stores" collections, shared by everyone.
// Lists, events and members belong to a household.
const APP_VERSION = "2026.10.18-51";
const RULES_VERSION = "v15";   // must match the _rules/{v} line in firestore.rules
// Asks Firebase whether the newest rules are published: true, false, or null when offline.
async function checkRules() {
  try { await getDocFromServer(doc(db, "_rules", RULES_VERSION)); return true; }
  catch (e) { return e && e.code === "permission-denied" ? false : null; }
}
const scol = n => collection(db, n);
const sdoc = (n, id) => doc(db, n, id);
// Everyone except the admin edits a private copy: users/{me}/myItems. The main list only changes when the admin says so.
const mineCol = () => collection(db, "users", uid(), "myItems");
const mineDoc = id => doc(db, "users", uid(), "myItems", id);
const ITEM_FIELDS = ["name", "store", "aisle", "price", "image", "upc", "per"];
function rebuildInventory() {
  if (S.admin) S.inventory = S.catalog.slice();
  else {
    const mine = new Map(S.mine.map(m => [m.id, m]));
    const out = S.catalog.map(c => {
      const m = mine.get(c.id);
      if (!m || m.own) return c;
      const o = { ...c, _personal: true };
      ITEM_FIELDS.forEach(k => { if (k in m) o[k] = m[k]; });
      return o;
    });
    S.mine.filter(m => m.own).forEach(m => out.push({ ...m, _personal: true, _own: true }));
    S.inventory = out;
  }
  S.ready.inv = true;
  if (S.store && !storeNames().includes(S.store)) S.store = null;
  updateNames(); renderStores(); renderHeader(); refreshForms();
  if (S.ready.items) renderList();
  if (S.tab === "family") renderFamily();
}
// How a list item looks to *this* person: if they keep a private version of the product, show that.
function listView(li) {
  if (S.admin || !li.inventoryId) return li;
  const m = (S.mine || []).find(x => x.id === li.inventoryId && !x.own);
  if (!m) return li;
  const v = { ...li, _orig: li };
  ITEM_FIELDS.forEach(k => { if (k in m) v[k] = m[k]; });
  return v;
}
function setFamilyDot() {
  const b = document.querySelector('.tabs button[data-tab="family"]');
  if (b) b.classList.toggle("dot", S.admin && S.requests.length > 0);
}
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
  api.setTitle = t => { const b = scrim.querySelector(".shead b"); if (b) b.textContent = t; };
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
    put(s.body, opts.msg ? h("p", { class: "msg", text: opts.msg }) : null,
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
    "auth/popup-closed-by-user": "Sign-in window was closed.",
    "auth/cancelled-popup-request": "Sign-in window was closed.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    "auth/configuration-not-found": "Sign-in hasn't been set up yet. In Firebase, open Authentication and tap Get started, then turn on Google and Email/Password.",
    "auth/admin-restricted-operation": "Sign-up is turned off in Firebase for this project.",
    "auth/invalid-api-key": "The app's Firebase key isn't accepted. Check the key and its restrictions in Google Cloud.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The app's Firebase key isn't accepted. Check the key and its restrictions in Google Cloud.",
    "auth/requests-from-referer-are-blocked": "This website is blocked by the Firebase key's restrictions. Add it under the key's allowed websites in Google Cloud.",
    "auth/web-storage-unsupported": "This browser is blocking storage. Turn off private mode or allow cookies for this site."
  };
  if (!map[c]) console.warn("Sign-in error", e);
  return map[c] || `Something went wrong${c ? " (" + c.replace(/^auth\//, "") + ")" : ""}. Please try again.`;
}

function showSignIn(mode = "signin", msg) {
  const inv = pendingJoinInfo();
  // Invited: the form starts on "create account" (they're new), unless they chose otherwise.
  if (inv && mode === "signin" && !msg && !showSignIn.toggled) mode = "signup";
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

  // Invited: one big Google button, with email tucked away underneath.
  const emailOpen = !inv || showSignIn.emailOpen;
  const inAppBox = IN_APP ? h("div", { class: "inapp" },
    h("b", { text: "Open this in your phone's browser first" }),
    h("p", { text: IS_ANDROID ? "You opened this inside Messenger (or another app). Google doesn't allow signing in there. Tap below to open it in Chrome."
      : "You opened this inside Messenger (or another app). Google doesn't allow signing in there. Tap the ••• or share button and choose “Open in Safari” (or “Open in browser”)." }),
    h("div", { class: "actions" },
      IS_ANDROID ? h("a", { class: "btn primary", href: chromeIntentUrl(), text: "Open in Chrome" }) : null,
      h("button", { class: "btn", type: "button", text: "Copy link", onclick: async () => {
        try { await navigator.clipboard.writeText(inviteUrlNow()); toast("Link copied. Paste it into Chrome or Safari."); } catch (e) { toast("Press and hold the address to copy it."); }
      } }))) : null;
  showGate(
    inAppBox,
    h("h2", { text: inv ? (inv.from ? `${inv.from} invited you` : "You're invited") : mode === "signup" ? "Create your account" : "Sign in" }),
    h("p", { class: "gsub", text: inv ? `Join ${inv.hh ? `“${inv.hh}”` : "their household"} to share shopping lists and meals. It takes a few seconds.`
      : "Shared stores and items, plus private lists for your household." }),
    msg ? h("div", { class: "ok", text: msg }) : null,
    err, okBox,
    h("button", { class: "btn gbtn", type: "button", onclick: google },
      googleLogo(), "Continue with Google"),
    !emailOpen ? h("button", { class: "link block", type: "button", style: "margin-top:14px", text: "No Google account? Use email instead",
      onclick: () => { showSignIn.emailOpen = true; showSignIn(mode); } }) : null,
    emailOpen ? h("div", { class: "or", text: "or use email" }) : null,
    !emailOpen ? null : h("form", { onsubmit: submit, autocomplete: "on" },
      mode === "signup" ? h("label", { class: "fl" }, name) : null,
      h("label", { class: "fl" }, email),
      h("label", { class: "fl" }, pw),
      h("button", { class: "btn primary block", type: "submit", text: mode === "signup" ? "Create account" : "Sign in" })),
    !emailOpen ? null : h("div", { class: "linkrow" },
      h("button", { class: "link", type: "button", text: mode === "signup" ? "I already have an account" : "Create an account",
        onclick: () => { showSignIn.toggled = true; showSignIn(mode === "signup" ? "signin" : "signup"); } }),
      mode === "signin" ? h("button", { class: "link", type: "button", text: "Forgot password?", onclick: forgot }) : null),
    h("p", { class: "note" }, "Lists and calendars are private to your household. Items and stores are shared by everyone using the app. ",
      h("a", { href: "privacy.html", target: "_blank", rel: "noopener", text: "Privacy policy" })));
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
  const v = pendingJoinInfo();
  const url = location.origin + location.pathname + (v ? "?" + new URLSearchParams({ join: v.code, from: v.from || "", hh: v.hh || "" }) : "");
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
  // Keep checking, so they don't have to come back and tap anything.
  clearInterval(showVerify.timer);
  showVerify.timer = setInterval(async () => {
    if (!auth.currentUser || document.hidden) return;
    try { await auth.currentUser.reload(); if (auth.currentUser.emailVerified) { clearInterval(showVerify.timer); await auth.currentUser.getIdToken(true); route(); } } catch (e) {}
  }, 4000);
  showGate(
    h("h2", { text: "Check your email" }),
    h("p", { class: "gsub", text: `We sent a link to ${u.email}. Tap it, and this screen will continue on its own (check spam if you don't see it).` }),
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
    // Brand-new account: give them their own household right away. They can still join someone's from the Family tab.
    try { gateLoading("Setting up your lists…"); return await createHousehold(`${myName().split(" ")[0] || "My"}'s Household`, false); }
    catch (e) { console.error(e); return showSetup(); }
  } finally { routing = false; }
}

/* ---------- first-time setup: create or join ---------- */
async function legacyAvailable() {
  return false;   // the catalog is used in place now, nothing to copy
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
  // They tapped the invite link and signed in: that's a yes. Join straight away; show the screen only if it fails.
  const joinNow = async () => {
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
      return true;
    } catch (e) {
      console.error(e);
      err.textContent = e.code === "permission-denied" ? "That invite isn't valid anymore. Ask for a new link." : "Couldn't join. Check your connection and try again.";
      err.classList.remove("hidden");
      return false;
    } finally { busy = false; }
  };
  gateLoading(`Joining “${inv.householdName}”…`);
  if (await joinNow()) return;
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
function onCatalogError(e) {
  console.error(e);
  const b = $("#dberr");
  b.textContent = e && e.code === "permission-denied"
    ? "Can't load the items: the database refused. Publish the newest security rules in Firebase, then reopen the app."
    : "Can't reach the database right now. Showing what's saved on this phone.";
  b.classList.remove("hidden");
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
  Object.assign(S, { hid, household: null, members: [], inventory: [], catalog: [], mine: [], requests: [], recipes: [], pantry: [], prices: new Map(), tempStores: new Set(), storeDocs: [], lists: [], listItems: [], events: [],
    listId: null, store: null, invQuery: "", ready: { inv: false, items: false, pantry: false } });
  S.admin = await checkAdmin();
  loadCookPrefs();
  checkRules().then(ok => { S.rulesOk = ok; if (S.tab === "family") renderFamily(); });
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
  S.tab = ["list","stores","pantry","create","family"].includes(lsGet("tab")) ? lsGet("tab") : "list";
  S.hideChecked = lsGet("hideChecked") === "1";
  $("#invSearch").value = "";
  hideGate();
  subscribeAll();
  setTab(S.tab);
  renderChips(); renderList(); renderStores(); renderCreateForm(); renderCalendar(); renderFamily(); renderPantry();
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
    S.catalog = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    $("#dberr").classList.add("hidden");
    rebuildInventory();
    if (S.sharedText) {   // a list was shared into the app: open it once the items are here
      const t = S.sharedText; S.sharedText = null;
      setTimeout(() => looksLikeList(t) ? quickPaste(t, "shared") : pasteList(t, "Here's what you shared. Fix it up if needed, then tap “Add items”."), 500);
    }
  }, onCatalogError));

  subs.push(onSnapshot(collection(db, "users", uid(), "recipes"), snap => {
    S.recipes = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    if (S.tab === "create") renderCook();
  }, e => { console.warn("saved recipes", e); S.recipes = []; }));

  if (!S.admin) {
    subs.push(onSnapshot(mineCol(), snap => {
      S.mine = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      rebuildInventory();
    }, e => console.warn("my items", e)));
  } else {
    subs.push(onSnapshot(collection(db, "requests"), snap => {
      S.requests = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setFamilyDot();
      if (S.tab === "family") renderFamily();
    }, e => console.warn("requests", e)));
  }

  const mapsFrom = snap => new Map(snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(m => m.store).map(m => [m.store, m]));
  subs.push(onSnapshot(aisleMapCol(), snap => { S.aisleShared = mapsFrom(snap); refreshForms(); }, e => console.warn("aisle maps", e)));
  if (!S.admin) subs.push(onSnapshot(myAisleCol(), snap => { S.aisleMine = mapsFrom(snap); refreshForms(); }, e => console.warn("my aisle maps", e)));

  subs.push(onSnapshot(scol("stores"), snap => {
    S.storeDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    renderStores(); refreshForms();
  }, onCatalogError));

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

  subs.push(onSnapshot(pantryCol(), snap => {
    S.pantry = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    S.ready.pantry = true;
    if (S.tab === "pantry") renderPantry();
    if (S.tab === "create" && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#cookBody"))) renderCook();
  }, e => { console.warn("pantry", e); S.ready.pantry = true; renderPantry(); }));

  subs.push(onSnapshot(priceCol(), snap => {
    S.prices = new Map(snap.docs.map(d => [d.id, { ...d.data(), id: d.id }]));
    if (S.ready.items && S.tab === "list") renderList();
  }, e => { console.warn("price history", e); }));

  subs.push(onSnapshot(hcol("events"), snap => {
    S.events = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    renderCalendar();
    if (S.tab === "create" && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#cookBody"))) renderCook();
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
    noteBought(S.listItems);
    if (S.tab === "create" && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#cookBody"))) renderCook();
    renderList(); renderStores();
    if (S.tab === "pantry") renderPantry();
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

async function importOldFlow() {
  if (!await confirmSheet("Bring over old items?", "This copies the items, stores, lists and events from the original version of the app into the shared catalog and this household. Running it twice is safe.", "Bring them over")) return;
  const p = progressSheet("Bringing over your items");
  try { await importLegacy(S.hid, t => p.set(t)); toast("Your old items are here"); }
  catch (e) { console.error(e); toast(e && e.code === "permission-denied" ? "The old data isn't readable. Make sure the newest security rules are published." : "Couldn't copy everything. Try again."); }
  finally { p.close(); }
}

async function deleteHouseholdData(hid, report) {
  const base = ["households", hid];
  const ops = [];
  report && report("Gathering everything…");
  for (const c of ["events", "pantry"]) (await getDocsFromServer(collection(db, ...base, c))).forEach(d => ops.push(b => b.delete(d.ref)));
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
    for (const c of ["myItems", "recipes", "prices", "aisleMaps"]) {
      try { const snap = await getDocsFromServer(collection(db, "users", uid(), c)); await commitOps(snap.docs.map(d => b => b.delete(d.ref))); } catch (e) { console.warn(c, e); }
    }
    try { const rq = await getDocsFromServer(query(collection(db, "requests"), where("by", "==", uid()))); await commitOps(rq.docs.map(d => b => b.delete(d.ref))); } catch (e) { console.warn("requests", e); }
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

  host.append(aiStatusCard());
  if (S.admin) host.append(requestsCard());
  if (S.admin) host.append(backupCard());

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
          h("button", { class: "btn primary", text: "＋ Invite to this household", onclick: createInvite }),
          h("button", { class: "btn", text: "Reset links", onclick: () => revokeInvites(true) }))
      : h("p", { class: "note", text: "Only the owner can invite or remove people." }),
    h("p", { class: "note", text: "Invited people share your lists, pantry and meal plan." })));

  // A friend who should have their own lists: send them the app itself, not an invite.
  host.append(card(h("h2", { text: "Share the app" }),
    h("p", { class: "lmeta", text: "Send a friend the app so they get their own account and their own private lists. They won't see your lists, pantry or meals." }),
    h("div", { class: "actions", style: "margin-top:10px" },
      h("button", { class: "btn primary", text: "📤 Share the app", onclick: shareApp }))));

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
    h("div", { class: "lmeta", text: `App version ${APP_VERSION} · ${S.inventory.length} items` }),
    S.rulesOk === false ? h("p", { class: "err", text: "⚠️ The security rules in Firebase are an older version. In Firebase → Firestore Database → Rules, paste the newest firestore.rules and tap Publish. Until then some actions (like deleting) will be refused." })
      : S.rulesOk === true ? h("div", { class: "lmeta", text: "Security rules: up to date ✓" }) : null,
    h("div", { class: "menu", style: "margin-top:12px" },
      h("button", { class: "btn", text: "🛡️  Run security check", onclick: runSecurityCheck }),
      h("button", { class: "btn", text: "⬇️  Download my data", onclick: exportMyData }),
      h("button", { class: "btn", text: "📄  Privacy policy", onclick: () => window.open("privacy.html", "_blank", "noopener") }),
      h("button", { class: "btn", text: "🆔  Copy my account ID", onclick: () => { try { navigator.clipboard.writeText(uid()); toast("Account ID copied"); } catch (e) { toast(uid()); } } }),
      h("button", { class: "btn", text: "↩️  Sign out", onclick: doSignOut }),
      owner ? h("button", { class: "btn danger", text: "🗑  Delete this household", onclick: deleteHouseholdFlow })
            : h("button", { class: "btn danger", text: "🚪  Leave this household", onclick: leaveHousehold }),
      h("button", { class: "btn danger", text: "⚠️  Delete my account", onclick: deleteAccountFlow })),
    h("p", { class: "note", text: "Items and stores are shared with everyone who uses the app. Lists, pantry and calendar stay private to your household. Your price history, recipes and item edits are only yours. Signing out clears this account's data from this device." })));
}

/* ---------- admin: download a backup of the main list ---------- */
function backupCard() {
  const n = S.catalog.length;
  return card(h("div", { class: "backup" },
    h("h2", { text: "Backup" }),
    h("p", { class: "lmeta", text: `Save a copy of the main list (${n} item${n === 1 ? "" : "s"} and ${storeNames().length} stores) to your phone or computer.` }),
    h("div", { class: "actions" },
      h("button", { class: "btn", text: "Spreadsheet", onclick: () => downloadBackup("csv") }),
      h("button", { class: "btn primary", text: "Full backup", onclick: () => downloadBackup("json") })),
    h("p", { class: "note", text: "The spreadsheet opens in Excel or Google Sheets. The full backup keeps the photos too; keep it somewhere safe so the list can be restored." })));
}
function saveFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
async function downloadBackup(kind) {
  const p = progressSheet("Preparing your backup");
  try {
    p.set("Getting the latest copy…");
    const [inv, st] = await Promise.all([getDocsFromServer(scol("inventory")), getDocsFromServer(scol("stores"))]);
    const items = inv.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.store || "").localeCompare(String(b.store || "")) || byName(a, b));
    const stores = st.docs.map(d => ({ id: d.id, ...d.data() }));
    const day = dateKey(new Date());
    if (kind === "csv") {
      const esc = v => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const rows = [["Store", "Item", "Aisle", "Price", "Has photo"]]
        .concat(items.map(i => [i.store, i.name, i.aisle, i.price, i.image ? "yes" : "no"]));
      saveFile(`shopping-list-${day}.csv`, "\ufeff" + rows.map(r => r.map(esc).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    } else {
      saveFile(`shopping-list-backup-${day}.json`, JSON.stringify({ app: "Visual Shopping List", version: APP_VERSION, exportedAt: new Date().toISOString(), items, stores }, null, 1), "application/json");
    }
    toast(`Backup saved (${items.length} items)`);
  } catch (e) { fail(e); }
  finally { p.close(); }
}

/* ---------- admin: change requests from everyone else ---------- */
function requestsCard() {
  const reqs = S.requests || [];
  const c = card(h("h2", { text: reqs.length ? `Change requests (${reqs.length})` : "Change requests" }));
  if (!reqs.length) { c.append(h("p", { class: "lmeta", text: "Nothing waiting. When someone asks to change or add an item, it shows up here." })); return c; }
  reqs.forEach(r => {
    const cur = r.itemId ? S.catalog.find(i => i.id === r.itemId) : null;
    const rows = [];
    if (r.kind === "change" && cur) {
      [["name", "Name"], ["store", "Store"], ["aisle", "Aisle"], ["price", "Price"]].forEach(([k, label]) => {
        const a = String(cur[k] || ""), b = String(r[k] || "");
        if (a !== b) rows.push(h("div", { class: "rq-diff" }, h("b", { text: label + ": " }), h("s", { text: a || "—" }), " → ", h("span", { text: b || "—" })));
      });
      if (r.image) rows.push(h("div", { class: "rq-diff" }, h("b", { text: "New photo:" })));
      if (!rows.length) rows.push(h("div", { class: "lmeta", text: "No differences from the main list." }));
    } else if (r.kind === "aisles") {
      const al = Array.isArray(r.aisles) ? r.aisles : [];
      rows.push(h("div", { class: "rq-diff", text: `${al.length} aisle${al.length === 1 ? "" : "s"} for ${r.store}` }));
      al.slice(0, 8).forEach(a => rows.push(h("div", { class: "lmeta", text: `${aisleLabel(a.aisle) || a.aisle}: ${(a.cats || []).join(" · ")}` })));
      if (al.length > 8) rows.push(h("div", { class: "lmeta", text: `…and ${al.length - 8} more` }));
    } else if (r.kind === "change") {
      rows.push(h("div", { class: "lmeta", text: "This item was deleted from the main list." }));
    } else {
      rows.push(h("div", { class: "rq-diff", text: [r.store, aisleLabel(r.aisle), r.price ? "$" + r.price : ""].filter(Boolean).join(" · ") }));
    }
    c.append(h("div", { class: "rq" },
      h("div", { class: "rq-top" },
        r.image ? h("img", { class: "rq-img", src: r.image, alt: "" }) : null,
        h("div", {},
          h("div", { class: "rq-title", text: r.kind === "aisles" ? `Aisle map: ${r.store}` : (r.kind === "add" ? "Add: " : "Change: ") + (cur ? cur.name : r.name) }),
          h("div", { class: "lmeta", text: `From ${r.byName || r.byEmail || "someone"}` }))),
      rows,
      r.note ? h("div", { class: "rq-note", text: "“" + r.note + "”" }) : null,
      h("div", { class: "actions" },
        h("button", { class: "btn", text: "Decline", onclick: () => declineRequest(r) }),
        (r.kind === "change" && !cur) ? null : h("button", { class: "btn green", text: "Approve", onclick: () => approveRequest(r, cur) }))));
  });
  return c;
}
async function approveRequest(r, cur) {
  try {
    if (r.kind === "aisles") {
      const have = (S.aisleShared.get(r.store) || {}).aisles || [];
      await saveAisles(r.store, [...have, ...(Array.isArray(r.aisles) ? r.aisles : [])]);
    } else if (r.kind === "change" && cur) {
      const data = { name: r.name, store: r.store, aisle: r.aisle || "", price: r.price || "", updatedAt: Date.now(), updatedBy: uid() };
      if (r.image) data.image = r.image;
      if (r.upc) data.upc = r.upc;
      if (r.per !== undefined) data.per = r.per;
      await updateDoc(sdoc("inventory", cur.id), data);
      ensureStoreDoc(r.store);
      syncListsFromItem(cur, data);
    } else {
      const nd = { name: r.name, store: r.store, aisle: r.aisle || "", price: r.price || "", image: r.image || "", createdAt: Date.now(), createdBy: uid() };
      if (r.upc) nd.upc = r.upc;
      if (r.per) nd.per = r.per;
      await setDoc(doc(scol("inventory")), nd);
      ensureStoreDoc(r.store);
    }
    await deleteDoc(doc(db, "requests", r.id));
    toast("Approved. The main list is updated.");
  } catch (e) { fail(e); }
}
async function declineRequest(r) {
  try { await deleteDoc(doc(db, "requests", r.id)); toast("Request declined"); } catch (e) { fail(e); }
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

async function shareApp() {
  const link = location.origin + location.pathname;
  const text = "Try this shopping list app. Sign in with Google and you get your own lists:";
  if (navigator.share) { try { await navigator.share({ title: "Visual Shopping List", text, url: link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(`${text} ${link}`); toast("Link copied. Paste it in a message."); }
  catch (e) { await choose("Share the app", link, [{ label: "OK", value: 1 }]); }
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
  const lq = new URLSearchParams({ join: code, from: clip(myName().split(" ")[0], 40), hh: clip(S.household.name, 60) });
  const link = `${location.origin}${location.pathname}?${lq}`;
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
    { t: "Security rules are the newest version", expect: "ok", run: () => getDocFromServer(doc(db, "_rules", RULES_VERSION)),
      tip: "Paste the newest firestore.rules into Firebase → Firestore Database → Rules and tap Publish." },
    { t: "Your items load", expect: "ok", run: () => getDocsFromServer(query(scol("inventory"), limit(1))),
      tip: "Publish the newest security rules (they let signed-in people read items)." },
    { t: "Other households are private", expect: "deny", run: () => getDocFromServer(doc(db, "households", rid())) },
    { t: "Can't sneak into another household", expect: "deny", run: () => setDoc(doc(db, "households", rid(), "members", uid()), { role: "owner", name: "x", joinedAt: Date.now() }) },
    { t: "Other people's accounts are private", expect: "deny", run: () => getDocFromServer(doc(db, "users", rid())) },
    { t: "Junk data is rejected", expect: "deny", cleanup: () => deleteDoc(sdoc("inventory", "security-check-test")), run: () => setDoc(sdoc("inventory", "security-check-test"), { name: "x", store: "y", createdBy: uid(), sneaky: true }) },
    ...(S.admin || !S.catalog.length ? [] : [{ t: "Only the admin can change the main list", expect: "deny", run: () => updateDoc(sdoc("inventory", S.catalog[0].id), { updatedAt: Date.now() }) }]),
    { t: "Other people's private edits are private", expect: "deny", run: () => getDocFromServer(doc(db, "users", rid(), "myItems", "x")) },
    { t: "Other people's price history is private", expect: "deny", run: () => getDocFromServer(doc(db, "users", rid(), "prices", "milk")) },
    { t: "Other households' pantries are private", expect: "deny", run: () => getDocsFromServer(query(collection(db, "households", rid(), "pantry"), limit(1))) },
    { t: "Your pantry works", expect: "ok", run: () => getDocsFromServer(query(pantryCol(), limit(1))),
      tip: "Publish the newest security rules (they add the pantry)." },
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
    // If a write that should have been blocked went through, clean it up so no test junk is left behind.
    if (outcome === "ok" && test.expect === "deny" && test.cleanup) { try { await test.cleanup(); } catch (e) {} }
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
  document.querySelectorAll(".tabs button[data-tab]").forEach(b => {
    if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  renderHeader();
  if (t === "family") renderFamily();
  if (t === "create") renderCook();   // refreshes the AI status line too
  if (t === "pantry") renderPantry();
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
    title.textContent = S.store ? S.store : "Stores";
    act.append(h("button", { class: "hbtn", text: "📈 Prices", onclick: () => openPrices() }));
    if (S.store) act.append(h("button", { class: "hbtn", "aria-label": "Store options", text: "⋯", onclick: () => storeMenu(S.store) }));
  } else if (S.tab === "pantry") {
    title.textContent = "Pantry";
    act.append(h("button", { class: "hbtn", text: "＋ Add", onclick: () => openPantryItem(null) }));
  } else if (S.tab === "create") {
    title.textContent = "Meals";
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
  (S.tempStores || []).forEach(n => set.add(n));
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
      inventoryId: item.id || null, addedBy: uid(), ...(isPerLb(item) ? { per: "lb" } : {})
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
  const items = S.listItems.map(listView);
  if (!items.length) {
    host.append(h("div", { class: "empty" }, h("b", { text: "Your list is empty" }),
      "Type an item above, pick from your stores, or scan a handwritten list.",
      h("div", { class: "actions emptyscan" },
        h("button", { class: "btn", text: "Browse stores", onclick: () => setTab("stores") }),
        h("button", { class: "btn violet", text: "Scan a list", onclick: scanList }))));
    return;
  }
  const checked = items.filter(i => i.inCart);
  host.append(h("div", { class: "totals" },
    h("div", { class: "t" }, h("div", { class: "lbl", text: "Total" }), h("b", { text: money(sum(items, lineTotal)) })),
    h("div", {}, h("div", { class: "lbl", text: "In cart" }), h("b", { text: money(sum(checked, lineTotal)) })),
    h("div", {}, h("div", { class: "lbl", text: "Done" }), h("b", { text: `${checked.length}/${items.length}` }))),
    h("p", { class: "totnote", text: "Estimate before tax and bottle deposits." + (items.some(isPerLb) ? " ≈ items are sold by weight." : "") }));
  if (checked.length) host.append(h("div", { class: "links" },
    h("button", { class: "link", text: S.hideChecked ? `Show checked (${checked.length})` : "Hide checked",
      onclick: () => { S.hideChecked = !S.hideChecked; lsSet("hideChecked", S.hideChecked ? "1" : "0"); renderList(); } }),
    h("button", { class: "link", text: "🧺 Put away", onclick: putAway }),
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
  const metaText = qtyOf(it) > 1 && !isPerLb(it) ? "×" + qtyOf(it) : "";
  const meta = isPerLb(it)
    ? h("div", { class: "lmeta" }, p != null ? h("span", { class: "price", text: (it.inCart ? "" : "≈ ") + money(lineTotal(it)) }) : null,
        `${p != null ? " · " : ""}${fmtLbs(lbsOf(it))} lb${p != null ? ` × ${priceText(it)}` : ""}`)
    : h("div", { class: "lmeta" }, metaText,
        p != null ? h("span", { class: "price", text: (metaText ? "  " : "") + money(lineTotal(it)) }) : null);
  const cheap = it.inCart ? null : cheaperAt(it);
  const home = it.inCart ? null : pantryMatch(it.name);
  return h("div", { class: "litem" + (it.inCart ? " done" : "") },
    h("button", { class: "cb" + (it.inCart ? " on" : ""), "aria-label": (it.inCart ? "Uncheck " : "Check ") + it.name,
      onclick: async () => {
        if (!it.inCart && isPerLb(it)) {   // sold by weight: ask what the scale said so the total is exact
          const w = await askWeight(it);
          if (w === undefined) return;
          const u = { inCart: true };
          if (w) u.lbs = w;
          return updateDoc(itemDoc(S.listId, it.id), u).catch(fail);
        }
        updateDoc(itemDoc(S.listId, it.id), { inCart: !it.inCart }).catch(fail);
      } },
      h("i", { text: it.inCart ? "✓" : "" })),
    h("button", { class: "lbody", onclick: () => openListItem(it) },
      thumbEl(it.image, "thumb"),
      h("div", { class: "ltext" }, h("div", { class: "lname", text: it.name || "Untitled" }), it.note ? h("div", { class: "lnote", text: it.note }) : null, meta,
        cheap ? h("div", { class: "hint cheap", text: `💡 ${money(cheap.p)}${isPerLb(it) ? "/lb" : ""} at ${cheap.s}` }) : null,
        home && home.level === "plenty" ? h("div", { class: "hint home", text: `🏠 Pantry says you have some (${placeOf(home.where)[2].toLowerCase()})` }) : null),
      aisleSign(it.aisle)),
    h("button", { class: "x", "aria-label": "Remove " + it.name, text: "✕", onclick: () => removeListItem(it) }));
}


// "1.37", "1 1/2", "22 oz", "1 lb 6 oz" → pounds
function parseWeight(t) {
  const s = String(t || "").toLowerCase().replace(",", ".").trim();
  if (!s) return 0;
  const lb = s.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?|#)?(?!\s*oz)/), oz = s.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)/);
  const num = x => String(x).trim().split(/\s+/).reduce((a, p) => a + (p.includes("/") ? +p.split("/")[0] / +p.split("/")[1] : +p), 0);
  let w = 0;
  if (oz && !/lb|pound|#/.test(s)) return num(oz[1]) / 16;
  if (lb) w += num(lb[1]);
  if (oz) w += num(oz[1]) / 16;
  return w;
}
// Checking off something sold by the pound: what did the scale or label say? Resolves with pounds, 0 to skip, undefined to cancel.
function askWeight(it) {
  return new Promise(res => {
    let done = false;
    const s = openSheet(`Weigh: ${it.name}`);
    const fin = v => { if (done) return; done = true; res(v); s.close(); };
    s.onclose = () => { if (!done) { done = true; res(undefined); } };
    const p = priceNum(it.price);
    const est = lbsOf(it);
    const inp = h("input", { type: "text", inputmode: "decimal", value: fmtLbs(est), "aria-label": "Weight in pounds", placeholder: "e.g. 1.37 or 22 oz", enterkeyhint: "done" });
    const out = h("div", { class: "wcost" });
    const show = () => {
      const w = parseWeight(inp.value);
      out.textContent = !(w > 0) ? "Type the weight from the scale or the label." : p != null ? `${fmtLbs(w)} lb × ${priceText(it)} = ${money(w * p)}` : `${fmtLbs(w)} lb`;
    };
    inp.addEventListener("input", show);
    const ok = () => { const w = parseWeight(inp.value); if (!(w > 0) || w > 100) { toast("Type a weight like 1.37"); inp.focus(); return; } fin(Math.round(w * 100) / 100); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); ok(); } });
    put(s.body,
      h("p", { class: "msg", text: "Sold by the pound. What did the scale or the price sticker say?" }),
      h("label", { class: "fl" }, h("span", { text: "Weight (lb)" }), inp),
      out,
      h("div", { class: "qchips" }, [0.5, 1, 1.5, 2, 3].map(v => h("button", { type: "button", class: "xchip", text: `${v} lb`, onclick: () => { inp.value = String(v); show(); } }))),
      h("div", { class: "actions", style: "margin-top:12px" },
        h("button", { class: "btn", type: "button", text: "Skip", onclick: () => fin(0) }),
        h("button", { class: "btn green", type: "button", text: "✓ Check it off", onclick: ok })));
    show();
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  });
}

function removeListItem(it) {
  const { id, _orig, ...data } = it._orig || it;
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
  let w = lbsOf(it);
  const wEl = h("b", { text: fmtLbs(w) + " lb" }), costEl = h("div", { class: "lmeta", text: p != null ? `≈ ${money(p * w)}` : "" });
  const setW = n => { w = Math.max(0.25, Math.min(100, Math.round(n * 4) / 4)); wEl.textContent = fmtLbs(w) + " lb"; costEl.textContent = p != null ? `≈ ${money(p * w)}` : ""; updateDoc(itemDoc(S.listId, it.id), { lbs: w }).catch(fail); };
  s.body.append(
    h("div", { class: "detail" }, thumbEl(it.image, ""),
      h("div", {}, h("div", { class: "lname", text: it.name }),
        h("div", { class: "lmeta", text: [it.store, aisleLabel(it.aisle), p != null ? (isPerLb(it) ? priceText(it) : money(p) + " each") : "No price yet"].filter(Boolean).join(" · ") }),
        it.note ? h("div", { class: "lnote", text: it.note }) : null,
        by ? h("div", { class: "lmeta", text: `Added by ${by.id === uid() ? "you" : by.name}` }) : null)),
    isPerLb(it) ? h("div", {}, h("p", { class: "lmeta", text: "Sold by weight. About how much will you get?" }),
      h("div", { class: "qty" },
        h("button", { "aria-label": "Less", text: "−", onclick: () => setW(w - 0.25) }), wEl,
        h("button", { "aria-label": "More", text: "+", onclick: () => setW(w + 0.25) })), costEl)
    : h("div", { class: "qty" },
      h("button", { "aria-label": "Less", text: "−", onclick: () => setQ(q - 1) }), qEl,
      h("button", { "aria-label": "More", text: "+", onclick: () => setQ(q + 1) })),
    h("div", { class: "menu" },
      inv ? h("button", { class: "btn", text: "✏️  Edit item (price, aisle, photo)", onclick: () => { s.close(); openEdit(inv); } }) : null,
      pricePts(it.name).length || latestByStore(it.name, isPerLb(it) ? "lb" : "").size > 1 ? h("button", { class: "btn", text: "📈  Price history", onclick: () => openPriceItem(it.name) }) : null,
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
  const items = S.listItems.map(listView);
  let text = `🛒 ${listName()}\nTotal: ${money(sum(items, lineTotal))}\n\n`;
  const groups = new Map();
  items.forEach(i => { const k = i.store || "Other"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  for (const [store, arr] of groups) {
    text += `📍 ${store} (${money(sum(arr, lineTotal))}):\n`;
    arr.slice().sort(byAisle).forEach(i => {
      const p = priceNum(i.price);
      text += `  ${i.inCart ? "✅" : "◻️"} ${i.name}${isPerLb(i) ? ` ~${fmtLbs(lbsOf(i))} lb` : qtyOf(i) > 1 ? " ×" + qtyOf(i) : ""}${i.aisle ? ` (${aisleLabel(i.aisle)})` : ""}${p != null ? " - " + (isPerLb(i) ? "~" : "") + money(lineTotal(i)) : ""}\n`;
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

$("#scanFab").addEventListener("click", scanList);
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
      const hits = S.inventory.filter(matchQ).sort((a, b) => String(a.store || "").localeCompare(String(b.store || "")) || byName(a, b));
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
    const todo = myNeedsDetails().length;
    if (todo) host.append(h("button", { class: "needbar", type: "button", onclick: fillInDetails },
      h("span", { class: "nb-dot", text: String(todo) }),
      h("div", {}, h("b", { text: `${todo} item${todo === 1 ? "" : "s"} need${todo === 1 ? "s" : ""} details` }),
        h("div", { text: "Add the aisle, price and photo, one at a time" })),
      h("span", { class: "chev", text: "›" })));
    host.append(h("div", { class: "gcard" },
      names.map(n => {
        const c = itemsIn(n).length;
        return h("button", { class: "srow", onclick: () => openStore(n) },
          storeTag(n),
          h("div", { style: "flex:1;text-align:left" }, h("div", { class: "sn", text: n }), h("div", { class: "sc", text: `${c} item${c === 1 ? "" : "s"}` })),
          h("span", { class: "chev", text: "›" }));
      }),
      h("button", { class: "srow add", onclick: addStore }, "➕  Add new store")));
    return;
  }

  const sortMode = lsGet("itemSort") === "aisle" ? "aisle" : "az";
  const items = itemsIn(S.store).filter(matchQ).sort(sortMode === "aisle" ? byAisle : byName);
  host.append(h("div", { class: "sbar" },
    h("button", { class: "btn", text: "‹ All stores", onclick: () => openStore(null) }),
    h("div", { class: "grow" }),
    h("button", { class: "btn", text: "🪧 Aisles", onclick: () => openAisleMap(S.store) }),
    h("button", { class: "btn primary", text: "＋ New item", onclick: () => openNewItem(S.store) })));
  const seg = (mode, label) => h("button", { class: "segb" + (sortMode === mode ? " on" : ""), type: "button", "aria-pressed": String(sortMode === mode),
    text: label, onclick: () => { lsSet("itemSort", mode); renderStores(); } });
  if (items.length > 1) host.append(h("div", { class: "seg", role: "group", "aria-label": "Sort items" }, seg("az", "A–Z"), seg("aisle", "By aisle")));
  if (!items.length) {
    host.append(h("div", { class: "empty" }, h("b", { text: q ? "No matches" : `No items saved for ${S.store} yet` }),
      "Add one with a photo, aisle and price.", h("br"),
      h("button", { class: "btn primary", text: "＋ Add item", onclick: () => openNewItem(S.store, q ? S.invQuery : "") })));
    return;
  }
  if (sortMode === "aisle") {
    const groups = new Map();
    items.forEach(i => { const k = aisleLabel(i.aisle) || "No aisle"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
    groups.forEach((arr, k) => host.append(
      h("div", { class: "ahead" }, h("b", { text: k }), h("span", { text: `${arr.length}` })),
      h("div", { class: "grid" }, arr.sort(byName).map(i => itemCard(i, false)))));
    return;
  }
  host.append(h("div", { class: "grid" }, items.map(i => itemCard(i, false))));
}

function itemCard(item, showStore) {
  const on = findOnList(item);
  const p = priceNum(item.price);
  const metaText = showStore ? item.store : "";
  return h("div", { class: "icard" + (on ? " on" : "") },
    h("button", { class: "iadd", "aria-label": "Add " + item.name + " to list", onclick: () => addToList(item) },
      h("span", { class: "imgbox" }, thumbEl(item.image, ""), aisleSign(item.aisle)),
      h("div", { class: "iname", text: item.name }),
      h("div", { class: "imeta" }, metaText,
        p != null ? h("span", { class: "price", text: (metaText ? "  " : "") + priceText(item) }) : null,
        item.upc ? h("span", { class: "upcmark", title: "Barcode saved", text: " 🏷️" }) : null),
      item._personal ? h("div", { class: "mytag", text: item._own ? "Only you" : "Your version" }) : null,
      needsDetails(item) ? h("div", { class: "needtag", text: "Needs details" }) : null),
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
  if (!S.admin) return;   // only the admin adds stores to the main list
  if (!name || S.storeDocs.some(s => s.name === name)) return;
  setDoc(sdoc("stores", slug(name)), { name, createdAt: Date.now(), createdBy: uid() }).catch(() => {});
}
async function addStore() {
  const name = await promptSheet("New store", "Store name", "", "Add store", { max: 80 });
  if (!name) return null;
  const existing = storeNames().find(n => norm(n) === norm(name));
  const finalName = existing || name;
  ensureStoreDoc(finalName);
  if (!S.admin) S.tempStores.add(finalName);   // shows up for you; becomes permanent once you save an item there
  if (S.tab === "stores") openStore(finalName);
  return finalName;
}

function storeMenu(name) {
  const s = openSheet(name);
  const row = (label, fn, cls) => h("button", { class: "btn " + (cls || ""), text: label, onclick: () => { s.close(); fn(); } });
  s.body.append(h("div", { class: "menu" },
    row("＋  Add item to " + name, () => openNewItem(name)),
    row("🪧  Map the aisles", () => openAisleMap(name)),
    row("⚖️  Sold by the pound", () => perLbHelper(name)),
    S.admin ? row("✏️  Rename store", () => renameStore(name)) : null,
    S.admin ? row("🗑  Delete store", () => deleteStore(name), "danger") : null));
}
async function renameStore(oldName) {
  const name = await promptSheet("Rename store", "Store name", oldName, "Save", { max: 80 });
  if (!name || name === oldName) return;
  try {
    const ops = itemsIn(oldName).map(i => b => b.update(sdoc("inventory", i.id), { store: name, updatedAt: Date.now(), updatedBy: uid() }));
    S.storeDocs.filter(s => s.name === oldName).forEach(s => ops.push(b => b.delete(sdoc("stores", s.id))));
    if (!S.storeDocs.some(s => s.name === name)) ops.push(b => b.set(sdoc("stores", slug(name)), { name, createdAt: Date.now(), createdBy: uid() }));
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
        if (!match) return;
        const u = { name: data.name, aisle: data.aisle, price: data.price, store: data.store, inventoryId: oldItem.id };
        if (data.per !== undefined) u.per = data.per;
        if (data.image !== undefined) u.image = data.image;
        ops.push(b => b.update(ds.ref, u));
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
async function compressImage(file, opts = {}) {
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
  const ladder = opts.ladder || [[1280, 0.85], [1024, 0.82], [900, 0.78], [720, 0.75], [560, 0.72], [400, 0.65]];
  const limit = opts.limit || 280000;
  for (const [edge, q] of ladder) {
    const s = Math.min(1, edge / Math.max(w, ht));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(ht * s));
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    if (opts.enhance) { try { g.filter = "grayscale(1) contrast(1.35) brightness(1.08)"; } catch (e) {} }   // ink stands out, file gets smaller
    g.drawImage(src, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);   // re-drawing also strips photo location data
    c.width = c.height = 0;
    if (out.length < limit) break;
  }
  free();
  return opts.raw ? out : cleanImage(out);
}

let formSeq = 0;
const liveForms = new Set();
const refreshForms = () => [...liveForms].forEach(f => f.refresh());

function itemForm(host, { item, store, name, prefill, onDone }) {
  const editing = !!item;
  const d = {
    name: item ? item.name || "" : (name || ""),
    store: item ? item.store || "" : (store || lsGet("lastStore") || ""),
    aisle: item ? item.aisle || "" : "",
    price: item ? (priceNum(item.price) != null ? String(item.price) : "") : "",
    image: item && item.image && item.image !== PLACEHOLDER ? item.image : (prefill && prefill.image) || "",
    upc: item ? item.upc || "" : (prefill && prefill.upc) || "",
    per: item ? (isPerLb(item) ? "lb" : "") : (prefill && prefill.per) || ""
  };
  const sugBox = h("div", { class: "sug" });
  function updSug() {
    sugBox.textContent = "";
    if (clip(d.aisle, 40) || !d.store || !clip(d.name, 120)) return;
    const sg = suggestAisle(d.name, d.store);
    if (!sg) return;
    sugBox.append(h("button", { type: "button", class: "sugbtn", onclick: () => { d.aisle = sg.aisle; draw(); } },
      "💡 ", h("b", { text: aisleLabel(sg.aisle) || sg.aisle }), sg.why ? ` · ${sg.why}` : "", h("span", { class: "suguse", text: "Use" })));
  }
  async function scanCode() {
    const code = await scanBarcode();
    if (!code) return;
    d.upc = normUpc(code);
    fetchNutrition(d.upc).then(() => draw());   // nutrition facts, allergens and labels, in the background
    if (!clip(d.name, 120) || !d.image) {
      const p = progressSheet("Looking it up"); p.set("Checking the free product database…");
      const info = await lookupBarcode(code);
      if (info && !clip(d.name, 120)) d.name = info.name;
      if (info && info.image && !d.image) { p.set("Getting the photo…"); d.image = await photoFromUrl(info.image); }
      p.close();
      toast(info ? "Filled in from the barcode" : "Barcode saved. It isn't in the product database, so add the name yourself.");
    } else toast("Barcode saved");
    draw();
  }
  async function tagPrice() {
    const v = await readPriceTag();
    if (v) { d.price = v.price; d.src = "tag"; if (v.per) d.per = "lb"; toast(`Price $${v.price}${v.per ? "/lb" : ""} from the tag`); draw(); }
  }
  let alsoAdd = false, busy = false, askAdmin = false, askNote = "";
  const personalMode = !S.admin;
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
    const aisles = [...new Set([...itemsIn(d.store).map(i => i.aisle), ...aislesOf(d.store).map(a => a.aisle)].filter(Boolean))].sort((a, b) => byAisle({ aisle: a }, { aisle: b }));
    dl.textContent = ""; aisles.forEach(a => dl.append(h("option", { value: a })));
    updSug();
  }
  const live = { refresh: () => { if (!host.isConnected || !host.contains(storeSel)) liveForms.delete(live); else refresh(); } };
  liveForms.add(live);

  function draw() {
    host.textContent = "";
    refresh();
    host.append(...[dl,
      personalMode ? h("div", { class: "pnote", text: editing
        ? (item._own ? "This item is only on your phone's list of items. Only you can see it." : "Changes you make here are saved just for you. Everyone else keeps seeing the main version.")
        : "New items you save are just for you. You can ask the admin to add them for everyone." }) : null,
      prefill && prefill.note ? h("div", { class: "pnote", text: prefill.note }) : null,
      h("div", { class: "photo" },
        d.image ? h("img", { class: "pv", src: d.image, alt: "Item photo" }) : h("div", { class: "pv", text: "📷" }),
        h("div", { class: "pb" },
          h("button", { class: "btn violet", type: "button", text: "📸 Take photo", onclick: () => getPhoto(true) }),
          h("button", { class: "btn", type: "button", text: "🖼️ Choose photo", onclick: () => getPhoto(false) }),
          d.image ? h("button", { class: "btn danger", type: "button", text: "Remove photo", onclick: () => { d.image = ""; draw(); } }) : null)),
      h("label", { class: "fl" }, h("span", { text: "Item name" }),
        h("input", { value: d.name, maxlength: "120", placeholder: "e.g. Eggs (dozen)", autocapitalize: "sentences", oninput: e => { d.name = e.target.value; updSug(); } })),
      h("label", { class: "fl" }, h("span", { text: "Store" }), storeSel),
      h("div", { class: "two" },
        h("label", { class: "fl" }, h("span", { text: "Aisle" }),
          h("input", { list: dl.id, value: d.aisle, maxlength: "40", placeholder: "e.g. 4 or Dairy", oninput: e => { d.aisle = e.target.value; updSug(); } })),
        h("label", { class: "fl" }, h("span", { text: d.per ? "Price per lb" : "Price" }),
          h("div", { class: "money" + (d.per ? " perlb" : "") }, h("input", { type: "text", inputmode: "decimal", maxlength: "10", value: d.price, placeholder: "0.00", oninput: e => { d.price = e.target.value; d.src = "edit"; } })))),
      editing && pricePts(d.name || item.name).length ? h("button", { class: "link phlink", type: "button", text: `📈 Price history (${pricePts(d.name || item.name).length})`, onclick: () => openPriceItem(d.name || item.name) }) : null,
      h("div", { class: "seg perseg", role: "group", "aria-label": "How it's priced" },
        h("button", { type: "button", class: "segb" + (d.per ? "" : " on"), "aria-pressed": String(!d.per), text: "Each / package", onclick: () => { d.per = ""; draw(); } }),
        h("button", { type: "button", class: "segb" + (d.per ? " on" : ""), "aria-pressed": String(!!d.per), text: "⚖️ Per lb", onclick: () => { d.per = "lb"; draw(); } })),
      sugBox,
      d.upc ? h("div", { class: "upcline" }, h("span", { text: `🏷️ Barcode ${d.upc} is saved. Scan it anytime (Scan → Barcode) to find this item.` }),
        h("button", { class: "link", type: "button", text: "Remove", onclick: () => { d.upc = ""; draw(); } })) : null,
      (() => { const v = d.upc ? nutCached(normUpc(d.upc)) : item ? nutCached("id:" + item.id) : null, t = nutSummary(v);
        return d.upc || item ? h("div", { class: "upcline" }, h("span", { text: t ? `🥫 ${t}` : d.upc && v && v.found === false ? "🥫 Not in the product database yet." : d.upc && !v ? "🥫 Looking up nutrition…" : "🥫 No nutrition facts yet." }),
          h("button", { class: "link", type: "button", text: t ? "Retake label" : "📷 Read label", onclick: async () => { if (await readNutritionLabel({ ...(item || {}), upc: d.upc })) draw(); } })) : null; })(),
      h("div", { class: "actions tools2" },
        h("button", { class: "btn", type: "button", text: d.upc ? "🏷️ Barcode ✓" : "🏷️ Scan barcode", onclick: scanCode }),
        h("button", { class: "btn", type: "button", text: "💲 Read price tag", onclick: tagPrice })),
      !editing ? h("label", { class: "check" },
        h("input", { type: "checkbox", checked: alsoAdd, onchange: e => { alsoAdd = e.target.checked; } }),
        `Also add to “${listName()}”`) : null,
      personalMode ? h("label", { class: "check" },
        h("input", { type: "checkbox", checked: askAdmin, onchange: e => { askAdmin = e.target.checked; draw(); } }),
        editing && !item._own ? "Ask the admin to change the main list too" : "Ask the admin to add this for everyone") : null,
      personalMode && askAdmin ? h("label", { class: "fl" }, h("span", { text: "Note for the admin (optional)" }),
        h("input", { value: askNote, maxlength: "300", placeholder: "e.g. Price went up last week", oninput: e => { askNote = e.target.value; } })) : null,
      h("div", { class: "actions" },
        editing && S.admin ? h("button", { class: "btn danger", type: "button", text: "Delete", onclick: del }) : null,
        editing && personalMode && item._own ? h("button", { class: "btn danger", type: "button", text: "Delete", onclick: delMine }) : null,
        editing && personalMode && item._personal && !item._own ? h("button", { class: "btn", type: "button", text: "Undo my changes", onclick: resetMine }) : null,
        h("button", { class: "btn green", type: "button", text: personalMode ? "Save for me" : (editing ? "Save changes" : "Save item"), onclick: save }))
    ].filter(Boolean));
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
    const upc = /^\d{8,14}$/.test(d.upc || "") ? d.upc : "";
    const per = d.per === "lb" ? "lb" : "";
    const origImage = item && item.image && item.image !== PLACEHOLDER ? item.image : "";
    const imageChanged = d.image !== origImage;
    busy = true;
    if (price && (!editing || price !== cleanPrice(item.price) || per !== (isPerLb(item) ? "lb" : "") || store !== item.store))
      recordPrices([{ name, store, price, per, src: d.src || "edit", was: editing && store === item.store && per === (isPerLb(item) ? "lb" : "") ? item.price : "", wasAt: item && (item.updatedAt || item.createdAt) }])
        .then(j => { if (j.length) setTimeout(() => jumpsToast("", j), 2600); });
    try {
      ensureStoreDoc(store);
      lsSet("lastStore", store);
      if (personalMode) { await savePersonal({ name, store, aisle, price, image, imageChanged, upc, per }); onDone && onDone(); return; }
      if (editing) {
        const data = { name, store, aisle, price, updatedAt: Date.now(), updatedBy: uid() };
        if (upc !== (item.upc || "")) data.upc = upc;
        if (per !== (isPerLb(item) ? "lb" : "")) data.per = per;
        if (imageChanged) data.image = image;   // leave the original photo untouched otherwise
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
            if (upc) merged.upc = upc;
            if (per) merged.per = per;
            updateDoc(sdoc("inventory", dup.id), merged).catch(fail);
            syncListsFromItem(dup, merged);
            target = { ...dup, ...merged };
          }
        }
        if (!target) {
          const ref = doc(scol("inventory"));
          const data = { name, store, aisle, price, image, createdAt: Date.now(), createdBy: uid() };
          if (upc) data.upc = upc;
          if (per) data.per = per;
          setDoc(ref, data).catch(fail);
          target = { ...data, id: ref.id };
        }
        if (alsoAdd) addToList(target); else toast(`Saved to ${store}` + (upc && !(editing && item.upc === upc) ? " · barcode remembered" : ""));
      }
      onDone && onDone();
    } finally { busy = false; }
  }

  async function savePersonal(v) {
    let target = editing ? item : S.inventory.find(i => i.store === v.store && norm(i.name) === norm(v.name));
    if (!editing && target) {
      const c = await choose("Already saved", `“${target.name}” is already in ${v.store}. Save these details as your version of it?`,
        [{ label: "Cancel", value: null }, { label: "Add as new", value: "new" }, { label: "Use my details", value: "update", cls: "primary" }]);
      if (!c) return;
      if (c === "new") target = null;
    }
    const data = { name: v.name, store: v.store, aisle: v.aisle, price: v.price, updatedAt: Date.now() };
    if (v.upc) data.upc = v.upc;
    data.per = v.per || "";
    let id, isOwn;
    if (target) {
      id = target.id; isOwn = !!target._own;
      if (!editing || v.imageChanged) data.image = v.image || (editing ? "" : cleanImage(target.image));
      if (isOwn) data.own = true;
    } else {
      id = "my_" + randCode(16); isOwn = true;
      Object.assign(data, { image: v.image, own: true });
    }
    try { await setDoc(mineDoc(id), data, { merge: true }); }
    catch (e) { return fail(e); }
    // Private edits are never written to shared lists; each person's list just *shows* their own version (see listView).
    let msg = "Saved for you";
    if (askAdmin) {
      const req = { kind: isOwn ? "add" : "change", itemId: isOwn ? null : id, name: v.name, store: v.store, aisle: v.aisle, price: v.price,
        image: (isOwn || v.imageChanged) ? v.image : "", note: clip(askNote, 300), by: uid(), byName: clip(myName(), 80), createdAt: Date.now() };
      if (v.upc) req.upc = v.upc;
      if (v.per) req.per = v.per;
      if (S.user.email) req.byEmail = S.user.email;
      try { await addDoc(collection(db, "requests"), req); msg = "Saved for you · request sent to the admin"; }
      catch (e) { console.error(e); msg = "Saved for you, but the request couldn't be sent"; }
    }
    if (!editing && alsoAdd) addToList({ ...data, id, image: data.image || (target && target.image) || "" });
    toast(msg);
  }
  async function resetMine() {
    if (!await confirmSheet("Undo your changes?", `Go back to the main version of “${item.name}”?`, "Undo changes")) return;
    deleteDoc(mineDoc(item.id)).catch(fail);
    toast("Back to the main version");
    onDone && onDone();
  }
  async function delMine() {
    if (!await confirmSheet("Delete item?", `Remove “${item.name}” from your items?`, "Delete", true)) return;
    deleteDoc(mineDoc(item.id)).catch(fail);
    toast("Item deleted");
    onDone && onDone();
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
function openNewItem(store, name, prefill) {
  const s = openSheet(store ? `New item · ${store}` : "New item");
  itemForm(s.body, { store, name, prefill, onDone: () => s.close() });
}
function renderCreateForm() {
  renderCook();
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
    evs.length ? evs.map(ev => h("div", { class: "ev" }, isMealEvent(ev) && mealByName(ev.title.slice(MEAL_MARK.length))
        ? h("button", { class: "evmeal", type: "button", text: ev.title, onclick: () => openMeal(mealByName(ev.title.slice(MEAL_MARK.length))) })
        : h("span", { text: ev.title }),
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
  [...new Set(S.inventory.map(i => i.name).filter(Boolean))].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base", numeric: true })).forEach(n => dl.append(h("option", { value: n })));
}

/* =====================================================================
   SCAN A HANDWRITTEN LIST
   Photo → Gemini (through Firebase AI Logic, protected by App Check) reads it
   and matches each line to the catalog → you review → matched items go on
   the list, unknown ones become "needs details" placeholders.
   ===================================================================== */
// Each model has its own free daily allowance, so if one is busy or used up we try the next.
// Every Gemini model Firebase AI Logic offers on the free plan. Each has its own daily allowance.
// Reading handwriting: sharpest first, with a fast "lite" reader second so it can race a slow answer.
const AI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];
// Recipes start with the lite readers (bigger free allowances), saving the sharpest for handwriting.
const RECIPE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];
// Your Fraud Defense (reCAPTCHA Enterprise) website key. It's meant to be public.
const RECAPTCHA_SITE_KEY = "6Le8mOktAAAAAGIq1pH3VrsDCfvhMqKgisoxkdCO";
const SDK = "https://www.gstatic.com/firebasejs/12.18.0/";
let aiBase = null;
const aiModels = {};

async function getReader(name) {
  if (aiModels[name]) return aiModels[name];
  if (!RECAPTCHA_SITE_KEY) throw { code: "vsl/not-set-up" };
  if (!aiBase) {
    const [ac, aim] = await Promise.all([import(SDK + "firebase-app-check.js"), import(SDK + "firebase-ai.js")]);
    try {
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
    } catch (e) { if (!/already/i.test(String(e && e.message))) throw e; }
    aiBase = { aim, ai: aim.getAI(app, { backend: new aim.GoogleAIBackend() }) };
  }
  // A shopping list doesn't need deep thought: keep "thinking" low so answers come back fast.
  const lite = /lite/.test(name);
  const TL = aiBase.aim.ThinkingLevel || {};
  const gen = { responseMimeType: "application/json" };
  if (!noThinkCfg[name]) gen.thinkingConfig = { thinkingLevel: lite ? (TL.MINIMAL || "MINIMAL") : (TL.LOW || "LOW") };
  aiModels[name] = aiBase.aim.getGenerativeModel(aiBase.ai, { model: name, generationConfig: gen });
  return aiModels[name];
}
const noThinkCfg = {};

// Remember readers whose free allowance is used up, so we don't keep asking them.
// Daily limits reset at midnight Pacific time; per-minute limits after about a minute.
const ptDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
function spentModels() {
  try { const v = JSON.parse(localStorage.getItem("vsl:aiSpent") || "{}"); return v.day === ptDay() ? v : { day: ptDay(), daily: [], minute: {} }; }
  catch (e) { return { day: ptDay(), daily: [], minute: {} }; }
}
function markSpent(name, e) {
  const v = spentModels();
  if (/per ?day|perday|daily/i.test(errText(e))) { if (!v.daily.includes(name)) v.daily.push(name); }
  else v.minute[name] = Date.now() + 65000;
  try { localStorage.setItem("vsl:aiSpent", JSON.stringify(v)); } catch (x) {}
}
const isSpent = name => { const v = spentModels(); return v.daily.includes(name) || (v.minute[name] || 0) > Date.now(); };

/* ---------- AI status: which free readers are ready, and when used-up ones come back ---------- */
const ALL_MODELS = [...new Set([...AI_MODELS, ...RECIPE_MODELS])];
const READER_NAMES = { "gemini-3.8-flash": "Gemini 3.8 Flash", "gemini-3.7-flash": "Gemini 3.7 Flash", "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.5-flash": "Gemini 3.5 Flash", "gemini-3-flash-preview": "Gemini 3 Flash (preview)", "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite", "gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite" };
// Google's free daily limits reset at midnight Pacific time.
function msUntilReset() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
    .formatToParts(new Date()).filter(x => x.type !== "literal").map(x => [x.type, +x.value]));
  return Math.max(60000, (86400 - ((p.hour % 24) * 3600 + p.minute * 60 + p.second)) * 1000);
}
const fmtWait = ms => { const m = Math.ceil(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const resetClock = () => new Date(Date.now() + msUntilReset()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function aiStatus() {
  const v = spentModels(), now = Date.now();
  const list = ALL_MODELS.map(m => v.daily.includes(m) ? { m, state: "day" } : (v.minute[m] || 0) > now ? { m, state: "minute", back: v.minute[m] - now } : { m, state: "ok" });
  return { list, ready: list.filter(x => x.state === "ok").length, total: list.length, reset: msUntilReset() };
}
// One line for menus: "AI: 7 of 7 readers ready" / "AI: 5 of 7 ready · next reset in 3 h 12 min (3:00 AM)"
function aiStatusLine() {
  const st = aiStatus();
  if (st.ready === st.total) return `AI: all ${st.total} free readers ready.`;
  if (!st.ready) {
    const soon = st.list.filter(x => x.state === "minute").sort((a, b) => a.back - b.back)[0];
    return soon ? `AI: all readers busy. One is back in about ${Math.ceil(soon.back / 1000)} s.` : `AI: today's free allowance is used up. Resets in ${fmtWait(st.reset)} (${resetClock()}).`;
  }
  return `AI: ${st.ready} of ${st.total} readers ready · used-up ones reset in ${fmtWait(st.reset)} (${resetClock()}).`;
}
function aiStatusCard() {
  const st = aiStatus();
  return card(h("h2", { text: "AI readers" }),
    h("p", { class: "lmeta", text: `${st.ready} of ${st.total} free readers ready on this phone. Daily allowances reset in ${fmtWait(st.reset)}, at ${resetClock()}.` }),
    h("div", { class: "aist" }, st.list.map(x => h("div", { class: "airow" },
      h("span", { class: "aidot " + x.state }),
      h("span", { class: "ainame", text: READER_NAMES[x.m] || x.m }),
      h("span", { class: "aistate", text: x.state === "ok" ? "Ready" : x.state === "minute" ? `Busy · back in ${Math.max(1, Math.ceil(x.back / 1000))} s` : `Used up · ${fmtWait(st.reset)}` })))),
    h("p", { class: "note", text: "Google doesn't share how many free uses are left, so this shows readers that have told this phone they're used up. Everyone using the app shares the same allowance." }));
}
const errText = e => String([e && e.code, e && e.status, e && e.message].filter(Boolean).join(" ")).toLowerCase();
const isQuota = e => /429|quota|resource[-_ ]exhausted|rate.?limit|too many requests/.test(errText(e));
const isBusy = e => /\b5\d\d\b|unavailable|overloaded|internal|deadline|timeout|try again later/.test(errText(e));
const isNoModel = e => /\b404\b|not[-_ ]found|not supported|unsupported model|is not available/.test(errText(e)) && /model/.test(errText(e));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Recipes start with the "lite" models: they're plenty for recipes and have bigger free allowances,
// which saves the sharper models' allowance for reading handwriting.
const readListPhoto = (parts, onStatus) => aiJSON(parts, onStatus, AI_MODELS);
// Asks the AI for JSON, trying each model in turn. Returns the parsed JSON.
// Track how each reader has been doing on this phone, to try the healthy ones first.
function aiStats() { try { return JSON.parse(localStorage.getItem("vsl:aiStats") || "{}"); } catch (e) { return {}; } }
function noteAI(name, ok, ms) {
  const st = aiStats(), x = st[name] || { fails: 0, ms: 0 };
  if (ok) { x.fails = 0; x.ms = x.ms ? Math.round(x.ms * 0.6 + ms * 0.4) : ms; x.at = Date.now(); }
  else { x.fails = Math.min(5, (x.fails || 0) + 1); x.failAt = Date.now(); }
  st[name] = x;
  try { localStorage.setItem("vsl:aiStats", JSON.stringify(st)); } catch (e) {}
}
function orderModels(models) {
  const st = aiStats(), now = Date.now();
  // readers that failed in the last 30 minutes go to the back; otherwise keep the chosen order
  const penalty = m => { const x = st[m]; return x && x.fails && now - (x.failAt || 0) < 30 * 60000 ? 100 + x.fails : 0; };
  return models.map((m, i) => [m, i + penalty(m)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
const isFatal = e => { const c = errText(e); return c.includes("vsl/not-set-up") || c.includes("app-check") || c.includes("appcheck") || c.includes("api-not-enabled"); };

// One reader, with its own small retry rules. Throws if it can't produce an answer.
async function runReader(name, parts) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const model = await getReader(name);
      const res = await withTimeout(model.generateContent(parts), 25000);
      return parseAIJson(res.response.text());
    } catch (e) {
      const code = errText(e);
      if (isFatal(e) || isQuota(e) || isNoModel(e) || code.includes("timeout")) throw e;
      if (!noThinkCfg[name] && /thinking/.test(code) && /400|invalid/.test(code)) { noThinkCfg[name] = true; delete aiModels[name]; attempt--; continue; }
      if (attempt === 0 && (isBusy(e) || e instanceof SyntaxError || code.includes("no json"))) { await sleep(isBusy(e) ? 1200 : 0); continue; }
      throw e;
    }
  }
  throw new Error("no answer");
}

// Asks the readers for JSON. Starts with the best one; if it hasn't answered after a few seconds,
// a second reader starts alongside it and the first good answer wins. Failed readers hand over at once.
function aiJSON(parts, onStatus, models, opts = {}) {
  const hedgeMs = opts.hedgeMs || 8000;
  const queue = orderModels(models.filter(m => !isSpent(m)));
  if (!queue.length) return Promise.reject({ code: "vsl/quota", message: "all readers used up today" });
  return new Promise((resolve, reject) => {
    let active = 0, done = false, lastErr = null, sawQuota = false, started = 0, hedge = null;
    const finish = err => { if (done) return; done = true; clearTimeout(hedge); reject(err); };
    const launch = () => {
      if (done) return;
      const name = queue.shift();
      if (!name) { if (!active) finish(sawQuota ? { code: "vsl/quota", cause: lastErr, message: lastErr && lastErr.message } : (lastErr || new Error("unknown"))); return; }
      active++;
      if (started++) onStatus(active > 1 ? "Asking a second reader to speed things up…" : "Trying another reader…");
      const t0 = Date.now();
      runReader(name, parts).then(json => {
        if (done) return;
        done = true; clearTimeout(hedge); noteAI(name, true, Date.now() - t0); resolve(json);
      }).catch(e => {
        active--;
        if (done) return;
        lastErr = e;
        console.warn("AI with", name, "failed:", e);
        if (isFatal(e)) return finish(e);
        if (isQuota(e)) { sawQuota = true; markSpent(name, e); } else noteAI(name, false);
        if (active < 2) launch();          // hand over straight away
      });
      clearTimeout(hedge);
      hedge = setTimeout(() => { if (!done && active < 2 && queue.length) launch(); }, hedgeMs);
    };
    launch();
  });
}

function scanErrorText(e) {
  const m = errText(e);
  if (m.includes("vsl/not-set-up")) return S.admin
    ? "List scanning isn't switched on yet. Finish the AI setup steps (AI Logic + App Check with a Fraud Defense key), then add the key to the app."
    : "List scanning isn't switched on yet. Ask the admin to finish setting it up.";
  if (m.includes("vsl/quota")) return `Today's free AI allowance is used up. It resets in ${fmtWait(msUntilReset())}, at ${resetClock()}. Until then, the free reader (Take photo) and “Paste from Lens” still work.`;
  if (m.includes("app-check") || m.includes("appcheck") || m.includes("recaptcha")) return "The app couldn't prove it's really this website (App Check). Check the App Check setup in Firebase.";
  if (m.includes("api-not-enabled") || m.includes("has not been used") || m.includes("disabled")) return "AI Logic isn't turned on in Firebase yet (AI Services → AI Logic → Get started).";
  if (isQuota(e)) return "Too many scans right now. Wait a minute and try again.";
  if (isNoModel(e)) return "The AI reader the app uses has been retired by Google. Let your developer know.";
  if (isBusy(e)) return "Google's AI is busy right now. Try again in a few minutes.";
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("offline")) return "No connection. Check your internet and try again.";
  if (e instanceof SyntaxError || m.includes("no json")) return "The AI answered in a way the app didn't understand. Please try again.";
  return "Something went wrong while reading the list. Please try again.";
}

function storeAbbrevs() {
  return storeNames().map(n => {
    const words = n.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    return words.length > 1 ? `${words.map(w => w[0].toUpperCase()).join("")} = ${n}` : "";
  }).filter(Boolean).join(", ");
}
let scanCatalog = [];
function readerPrompt(store, pasted) {
  scanCatalog = S.inventory.slice(0, 2000);   // numbered 1..n to keep the message short
  const cat = scanCatalog.map((i, k) => `${k + 1}|${clip(i.name, 60)}`).join("\n");
  const abbr = storeAbbrevs();
  return [
    pasted ? "You are reading a grocery shopping list that was copied as text from a photo of a handwritten note (so lines may be split, merged or misspelled). Here it is:\n---\n" + pasted + "\n---"
           : "You are reading a photo of a HANDWRITTEN grocery shopping list, usually on a sticky note.",
    "",
    "HOW TO READ IT",
    "- Read ONLY the handwriting on the note. Ignore printed text on products, cans or packaging in the background, and ignore the note's printed lines.",
    "- The note may have TWO OR MORE COLUMNS. Items side by side on the same line are separate items. Read the left column top to bottom, then the right column.",
    "- An item can WRAP onto the next line, often indented or squeezed into the space beside it (e.g. \"caramel cookies (front\" then \"counter)\"; or \"x2\" on one line and \"lunch box snacks\" under it). Join wrapped pieces into one item.",
    "- SKIP anything crossed out or scribbled over. If one word inside an item is crossed out and replaced, use the replacement (e.g. \"sweet & salty [crossed-out word] cashew bars\" -> \"Sweet & Salty Cashew Bars\").",
    "- Expand shorthand: \"TP\" = toilet paper, \"OJ\" = orange juice, \"xtra\" = extra, \"flvr\" = flavor, \"chedd\" = cheddar, \"gal\" = gallon, \"lb\" = pound." + (abbr ? ` Store shorthand: ${abbr}.` : ""),
    "- Do NOT change foods you don't recognize into something else. Regional and Portuguese foods are common here (e.g. cacoila, chourico, linguica, Portuguese marinade): keep their spelling, only fixing obvious slips (\"choricou\" -> \"Chourico\").",
    "",
    "FOR EACH ITEM RETURN",
    '- "text": the item as the writer meant it, spelled correctly, in Title Case. Keep sizes, flavors and brands that are written (e.g. "Milk (1/2 Gallon)", "Market Basket OJ 50 Calories (Blue)").',
    '- "written": exactly what is written, letter for letter (including wrapped pieces).',
    '- "qty": a COUNT if one is written ("2x cream cheese", "x2", "3 cans soup") — otherwise 1. A size like "1/2 gal" is NOT a quantity.',
    '- "where": a location hint written next to the item, like "front counter" or "deli" (without the brackets), otherwise null.',
    '- "matchId": the NUMBER of the matching item in the CATALOG below when it is clearly the same product. Brand or size differences are fine unless the list specifies them, and a general word can match a specific product (e.g. "toilet paper" or "TP" -> a toilet paper product in the catalog). If unsure or nothing fits, null. Never invent a number.',
    '- "confidence": "high", "medium" or "low" — how sure you are you read the handwriting correctly.',
    "",
    'If the note names a store (e.g. a heading "Aldi"), return it as "store", otherwise null.',
    "",
    "",
    'Return only JSON: {"store": string|null, "items": [{"text": string, "written": string, "qty": number, "where": string|null, "matchId": number|null, "confidence": string}]}',
    "",
    "CATALOG (id|name):",
    cat || "(empty)"
  ].join("\n");
}

function parseAIJson(t) {
  t = String(t || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no json");
  return JSON.parse(t.slice(a, b + 1));
}

// Local safety net: exact name match (preferring the chosen store), then a close "contains" match.
// Words you've taught the app ("TP" → Angel Soft). Saved on this phone, per person.
function aliasMap() { try { return JSON.parse(lsGet("aliases") || "{}"); } catch (e) { return {}; } }
function learnAliases(pairs) {
  const m = aliasMap();
  pairs.forEach(([text, item]) => { const k = norm(text); if (k && item && item.id && k !== norm(item.name)) m[k] = item.id; });
  const keys = Object.keys(m); if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete m[k]);
  lsSet("aliases", JSON.stringify(m));
}
const STOP = new Set(["the", "a", "an", "of", "and", "with", "for", "in", "oz", "lb", "lbs", "pack", "pk", "bag", "box", "can", "cans", "jar", "bottle", "large", "small", "big", "little"]);
const words = t => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).map(w => w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""));
// Finds the best catalog item for a line, on the phone (no AI): your taught words, then exact name,
// then "contains", then the most shared words (e.g. "strawberry milkshake corn flakes" → "Frosted Flakes (Strawberry Milkshake)").
function localMatch(text, store) {
  const n = norm(text);
  if (!n) return null;
  const pool = S.inventory;
  const learned = aliasMap()[n];
  if (learned) { const hit = pool.find(i => i.id === learned); if (hit) return hit; }
  const exact = pool.filter(i => norm(i.name) === n);
  if (exact.length) return exact.find(i => i.store === store) || exact[0];
  if (n.length >= 4) {
    const near = pool.filter(i => { const m = norm(i.name); return m.length >= 4 && (m.includes(n) || n.includes(m)); });
    if (near.length) return near.find(i => i.store === store) || near[0];
  }
  const q = words(text);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const i of pool) {
    const w = new Set(words(i.name));
    if (!w.size) continue;
    const shared = q.filter(x => w.has(x)).length;
    if (!shared) continue;
    const score = shared / Math.max(q.length, Math.min(w.size, q.length + 1)) + (i.store === store ? 0.01 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 0.6 ? best : null;
}
// If the matched product also exists at the chosen store, use that store's version.
function preferStore(item, store) {
  if (!item || !store || item.store === store) return item;
  return S.inventory.find(i => i.store === store && norm(i.name) === norm(item.name)) || item;
}

/* ---------- paste a list (text from Google Lens, a note or a message) ---------- */
const SHORTHAND = { tp: "Toilet Paper", oj: "Orange Juice", pb: "Peanut Butter", pt: "Paper Towels", evoo: "Olive Oil" };
// Turns pasted text into list lines on the phone itself: instant, free, no AI.
function parsePasted(text) {
  let lines = String(text || "").replace(/\r/g, "").split("\n");
  if (lines.filter(l => l.trim()).length === 1 && /,/.test(lines[0])) lines = lines[0].split(",");
  const out = [];
  for (let raw of lines) {
    let t = raw.replace(/^[\s\-–—•*·◦▪☐☑✓✔○●□■>\[\]]+/, "").replace(/^\d+[.)]\s+/, "").replace(/[\s,;.:]+$/, "").trim();
    if (!t || t.length > 80) continue;
    let qty = 1, m;
    if ((m = t.match(/^(.+?)\s*\((\d{1,2})\)$/))) { qty = +m[2]; t = m[1]; }
    if ((m = t.match(/^(\d{1,2})\s*x\s*(.+)$/i))) { qty = +m[1]; t = m[2]; }
    else if ((m = t.match(/^(.+?)\s*x\s*(\d{1,2})$/i))) { qty = +m[2]; t = m[1]; }
    else if ((m = t.match(/^(\d{1,2})\s+([a-z].*)$/i))) { qty = +m[1]; t = m[2]; }
    t = t.trim();
    const sh = SHORTHAND[norm(t)];
    if (sh) t = sh;
    if ((t.match(/[a-z]/gi) || []).length < 2) continue;   // stray marks the reader picked up
    out.push({ text: t.charAt(0).toUpperCase() + t.slice(1), written: raw.trim(), qty: Math.max(1, Math.min(99, qty)), matchId: null, confidence: "high" });
  }
  return out;
}
/* ---------- Google Lens: copy the list's text, paste it here, matched on the phone in a blink ---------- */
const LENS_STEPS = [
  ["Open Google Lens", "Tap the Lens icon (the colorful camera) in the Google search bar on your home screen, or in the Google app."],
  ["Point it at your list", "Hold the phone straight above the whole note and tap the shutter button."],
  ["Select all the text", "Tap “Select text” (or “Text”), then “Select all”."],
  ["Tap Copy", "The words are now on your phone's clipboard."],
  ["Come back and tap “Paste from Lens”", "Open this app, tap the yellow Scan note, then “📋 Paste from Lens”. Your list is matched on your phone in under a second."]
];
const lensSteps = () => h("ol", { class: "lens-steps" },
  LENS_STEPS.map(([t, d], i) => h("li", {}, h("span", { class: "ls-n", text: String(i + 1) }), h("div", {}, h("b", { text: t }), h("div", { class: "lmeta", text: d })))));
function lensGuide() {
  lsSet("lensGuideSeen", "1");
  const s = openSheet("Copy a list with Google Lens");
  put(s.body,
    h("p", { class: "msg", text: "Free, works for everyone and never runs out, even when the AI is used up. Best for neat handwriting. For very messy notes a photo scan reads better." }),
    lensSteps(),
    h("p", { class: "note", text: "Already took a photo? Open it in Google Photos, tap Lens at the bottom and start at step 3. If this app is installed on your home screen, you can also tap Share instead of Copy and choose “Shopping”." }),
    h("div", { class: "actions", style: "margin-top:10px" },
      h("button", { class: "btn", type: "button", text: "Close", onclick: () => s.close() }),
      h("button", { class: "btn primary", type: "button", text: "📋 I copied it, paste now", onclick: () => { s.close(); pasteFromLens(true); } })));
}
const pasteSig = t => { let x = 5381; for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0; return t.length + ":" + x; };
// Is this clipboard text a shopping list (and not a link or a stray word)?
function looksLikeList(t) {
  t = String(t || "").trim();
  if (!t || t.length > 4000 || /^https?:\/\/\S+$/i.test(t)) return false;
  const f = parsePasted(t);
  return f.length >= 2 || f.some(x => localMatch(x.text, lsGet("lastStore") || ""));
}
// Paste button: read what was copied and go straight to the check screen.
async function pasteFromLens(fromGuide) {
  let text = "";
  try { if (navigator.clipboard && navigator.clipboard.readText) text = String(await navigator.clipboard.readText() || "").trim(); } catch (e) { text = ""; }
  const repeat = text && pasteSig(text) === lsGet("lastPaste");
  if (text && !repeat && looksLikeList(text)) return quickPaste(text);
  if (!text && !fromGuide && !lsGet("lensGuideSeen")) return lensGuide();
  pasteList(repeat ? text : "", repeat ? "That's the same list you added last time. Copy a new one with Lens, or change it below."
    : text ? "What you copied doesn't look like a list. Copy the list's text with Lens, then tap “Paste from clipboard”."
    : "Nothing copied yet. Follow the steps, then tap “Paste from clipboard”. If Chrome asks, allow it to see what you copied.");
}
function quickPaste(text, how) {
  const t0 = performance.now();
  const { found, store } = itemsFromText(text);
  if (!found.length) return pasteList(text, "Couldn't find any items in that text.");
  reviewScan(found, store, null, (performance.now() - t0) / 1000, { pasted: text, how });
}
async function tidyWithAI(text) {
  const p = progressSheet("Tidying your list");
  try {
    p.set("Fixing spelling and matching your items…");
    const t0 = Date.now();
    const res = await readListPhoto([readerPrompt(lsGet("lastStore") || "", clip(text, 4000))], t => p.set(t));
    p.close();
    const items = Array.isArray(res.items) ? res.items : [];
    if (!items.length) throw new Error("no json");
    reviewScan(items, res.store, null, (Date.now() - t0) / 1000, { pasted: text, tidied: true });
  } catch (e) {
    p.close();
    console.error("paste AI", e);
    const c = await choose("Couldn't tidy the list", `${scanErrorText(e)}\n\nYou can still add it without AI.`, [{ label: "Add without AI", value: 1, cls: "primary" }, { label: "Cancel", value: null }]);
    if (c) quickPaste(text);
  }
}
function pasteList(prefill, notice) {
  const s = openSheet("Paste a list");
  const ta = h("textarea", { class: "pastebox", rows: "8", placeholder: "One item per line, e.g.\nmilk\n2x cream cheese\nbananas", "aria-label": "Your list" });
  ta.value = prefill || "";
  const err = h("div", { class: "err" + (notice ? "" : " hidden"), text: notice || "" });
  const go = useAI => {
    const text = ta.value.trim();
    if (!text) { err.textContent = "Paste or type your list first."; err.classList.remove("hidden"); return; }
    if (!useAI && !parsePasted(text).length) { err.textContent = "Couldn't find any items in that text."; err.classList.remove("hidden"); return; }
    s.close();
    useAI ? tidyWithAI(text) : quickPaste(text);
  };
  put(s.body,
    h("details", { class: "lens-help", open: !prefill && !lsGet("lensGuideSeen") ? "" : null },
      h("summary", { text: "How to copy a list with Google Lens" }), lensSteps()),
    navigator.clipboard && navigator.clipboard.readText ? h("button", { class: "btn block", type: "button", text: "📋 Paste from clipboard", onclick: async () => {
      try { const t = await navigator.clipboard.readText(); if (t) { ta.value = (ta.value ? ta.value + "\n" : "") + t; err.classList.add("hidden"); } else toast("Nothing copied yet"); }
      catch (e) { ta.focus(); toast("Long-press the box and choose Paste"); }
    } }) : null,
    err, ta,
    h("div", { class: "actions", style: "margin-top:10px" },
      h("button", { class: "btn", type: "button", text: "✨ Tidy with AI", onclick: () => go(true) }),
      h("button", { class: "btn green", type: "button", text: "Add items", onclick: () => go(false) })),
    h("p", { class: "note", text: "“Add items” matches your list instantly on your phone (free). “Tidy with AI” also understands shorthand and messy lines." }));
  lsSet("lensGuideSeen", "1");
  if (prefill) setTimeout(() => ta.focus(), 50);
}

/* ---------- Free text reader (OCR.space): photo → words in a couple of seconds, no AI ---------- */
// Free key, no card on file, so it can never cost anything. If its free allowance runs out, the AI reads instead.
const OCR_KEY = "K87993617688957";
const OCR_URL = "https://api.ocr.space/parse/image";
const ocrResting = eng => +(lsGet("ocrRest" + eng) || 0) > Date.now();
const restOcr = (eng, ms) => lsSet("ocrRest" + eng, String(Date.now() + ms));
function ocrErr(kind, msg) { const e = new Error("ocr/" + kind + (msg ? ": " + clip(String(msg), 200) : "")); e.kind = kind; return e; }
async function ocrRead(dataUrl, engine, opts = {}) {
  const fd = new FormData();   // plain form post: no extra headers, so the browser sends it straight away
  fd.append("apikey", OCR_KEY);
  fd.append("base64Image", dataUrl);
  fd.append("language", "eng");
  fd.append("OCREngine", String(engine));
  fd.append("scale", "true");
  fd.append("detectOrientation", "true");
  if (opts.overlay) fd.append("isOverlayRequired", "true");
  if (opts.table) fd.append("isTable", "true");
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 20000);
  let r, body;
  try { r = await fetch(OCR_URL, { method: "POST", body: fd, signal: ctl.signal }); body = await r.text(); }
  catch (e) { throw ocrErr(e && e.name === "AbortError" ? "slow" : "net", e && e.message); }
  finally { clearTimeout(tm); }
  const limitHit = t => /limit|maximum|quota|exceed|upto|too many/i.test(t);
  let j;
  try { j = JSON.parse(body); } catch (e) { throw ocrErr(r.status === 403 || r.status === 429 || limitHit(body) ? "limit" : "bad", body); }
  if (j.IsErroredOnProcessing || +j.OCRExitCode >= 3) {
    const m = [].concat(j.ErrorMessage || [], j.ErrorDetails || []).join(" ");
    throw ocrErr(limitHit(m) ? "limit" : "bad", m);
  }
  const text = (j.ParsedResults || []).map(x => x.ParsedText || "").join("\n");
  if (!opts.full) return text;
  const lines = [];   // with the height of the letters, so the big price on a tag wins
  (j.ParsedResults || []).forEach(x => ((x.TextOverlay && x.TextOverlay.Lines) || []).forEach(l => lines.push({ text: String(l.LineText || ""), h: +l.MaxHeight || 0 })));
  return { text, lines };
}
// Turns read or pasted text into list rows; a line that is just a store name ("Aldi") picks the store instead.
function itemsFromText(text) {
  const stores = new Map(storeNames().map(n => [norm(n), n]));
  let store = null;
  const found = parsePasted(text).filter(f => { const n = stores.get(norm(f.text)); if (n) { store = store || n; return false; } return true; });
  return { found, store };
}

let scanBusy = false;
async function scanList() {
  if (scanBusy) return;
  scanBusy = true;
  try { await scanListInner(); } finally { scanBusy = false; }
}
async function scanListInner() {
  const st = aiStatus(), aiOut = st.list.every(x => x.state === "day");
  const how = await choose("Scan",
    "List: take a clear photo of the whole list from straight above. The free reader reads it in a few seconds; the AI only helps when needed.\nBarcode: find or add one item.  Receipt: update prices.\n\n"
      + (aiOut ? `AI: resting until ${resetClock()}. The free reader and Paste still work.` : aiStatusLine()),
    [{ label: "📸 Take photo", value: "cam", cls: "primary" }, { label: "🖼️ Choose photo", value: "lib" }, { label: "📋 Paste from Lens", value: "paste" },
     { label: "🏷️ Barcode", value: "barcode" }, { label: "🧾 Receipt prices", value: "receipt" }, { label: "Cancel", value: null }]);
  if (!how) return;
  if (how === "paste") return pasteFromLens();
  if (how === "barcode") return barcodeFlow();
  if (how === "receipt") return receiptFlow();
  if (how === "help") return lensGuide();
  const file = await pickImage(how === "cam");
  if (!file) return;
  return freeScan(file);
}
// 1) free reader → matched on the phone. 2) if it can't read the photo, the AI reads it.
async function freeScan(file) {
  const engines = [3, 2].filter(e => !ocrResting(e));
  if (!engines.length) return aiScan(file);
  const p = progressSheet("Reading your list");
  const t0 = Date.now();
  let img, text = "", why = "";
  try {
    p.set("Getting the photo ready…");
    img = await compressImage(file, { ladder: [[1600, 0.82], [1400, 0.78], [1280, 0.75], [1024, 0.72]], limit: 1000000, raw: true });
    const tick = setInterval(() => p.set(`Reading the words… ${Math.round((Date.now() - t0) / 1000)}s`), 1000);
    p.set("Reading the words…");
    try {
      for (const eng of engines) {
        try { text = await ocrRead(img, eng); why = ""; break; }
        catch (e) {
          console.warn("free reader", eng, e); why = e.kind;
          if (e.kind === "limit") restOcr(eng, 6 * 3600e3);      // try again later, the AI covers until then
          if (e.kind === "net") break;
        }
      }
    } finally { clearInterval(tick); }
  } catch (e) { console.warn("photo prep", e); why = "photo"; }
  p.close();
  const { found, store } = itemsFromText(text);
  if (found.length) return reviewScan(found, store, img, (Date.now() - t0) / 1000, { ocr: true, file });
  if (why === "net" && !navigator.onLine) { await choose("You're offline", "Connect to the internet to read a photo, or type the list instead.", [{ label: "OK", value: 1 }]); return; }
  toast(why ? "The free reader is busy, so the AI is reading your list" : "The free reader couldn't make out this one, so the AI is reading it");
  return aiScan(file);
}
async function aiScan(file) {
  getReader(orderModels(AI_MODELS.filter(m => !isSpent(m)))[0] || AI_MODELS[0]).catch(() => {});
  const p = progressSheet("Reading your list with AI");
  let photo, result;
  try {
    p.set("Getting the photo ready…");
    photo = await compressImage(file, { ladder: [[1280, 0.78], [1024, 0.72]], limit: 900000, raw: true, enhance: true });
    let msg = "Reading the handwriting…"; const t0 = Date.now();
    const tick = setInterval(() => p.set(`${msg} ${Math.round((Date.now() - t0) / 1000)}s`), 1000);
    p.set(msg);
    const store = lsGet("lastStore") || "";
    try { result = await readListPhoto([readerPrompt(store), { inlineData: { mimeType: "image/jpeg", data: photo.split(",")[1] } }], t => { msg = t; p.set(t); }); }
    finally { clearInterval(tick); }
    result._secs = (Date.now() - t0) / 1000;
  } catch (e) {
    console.error("scan", e);
    p.close();
    const detail = clip([e && e.code, e && e.status, e && e.message].filter(Boolean).join(" · ") || String(e), 300);
    await choose("Couldn't read the list", `${scanErrorText(e)}\n\nDetails (for your developer): ${detail}`, [{ label: "OK", value: 1 }]);
    return;
  }
  p.close();
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) {
    await choose("No items found", "I couldn't find any items in that photo. Try a closer, brighter photo of the list.", [{ label: "OK", value: 1 }]);
    return;
  }
  reviewScan(items, result.store, photo, result._secs, { ai: true });
}

function reviewScan(found, storeHint, photo, secs, opts = {}) {
  const names = storeNames();
  const hint = storeHint && names.find(n => norm(n) === norm(storeHint));
  let store = hint || lsGet("lastStore") || "";
  if (store && !names.includes(store)) store = "";
  const byId = new Map(S.inventory.map(i => [i.id, i]));
  const rows = found.slice(0, 80).map(f => {
    const text = clip(f.text || f.written || "", 120);
    const mk = f.matchId == null ? "" : String(f.matchId).trim();
    let match = (mk && (/^\d+$/.test(mk) ? scanCatalog[parseInt(mk, 10) - 1] : byId.get(mk))) || null;
    if (!match) match = localMatch(text, store);
    const q = parseInt(f.qty, 10);
    return { text, orig: text, written: clip(f.written || "", 120), where: clip(f.where || "", 40), qty: q >= 1 && q <= 99 ? q : 1, match: preferStore(match, store),
      low: String(f.confidence || "").toLowerCase() === "low", on: !!text && !f.off, note: clip(f.note || "", 160), listNote: clip(f.listNote || "", 80) };
  }).filter(r => r.text);
  if (!store) {   // no store named and none picked before: use the one most matches come from
    const tally = {};
    rows.forEach(r => { if (r.match && r.match.store) tally[r.match.store] = (tally[r.match.store] || 0) + 1; });
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (best && names.includes(best[0])) { store = best[0]; rows.forEach(r => { r.match = preferStore(r.match, store); }); }
  }
  let askAdmin = false;

  const s = openSheet("Check your list");
  const body = h("div");
  s.body.append(body);

  function draw() {
    body.textContent = "";
    const newCount = rows.filter(r => r.on && !r.match).length;
    const total = rows.filter(r => r.on).length;
    const sel = h("select", { "aria-label": "Store", onchange: e => {
      store = e.target.value;
      rows.forEach(r => { r.match = preferStore(r.match, store); });
      draw();
    } },
      h("option", { value: "", text: "Choose a store…", disabled: true, selected: !store }),
      names.map(n => h("option", { value: n, text: n, selected: n === store })));
    body.append(...[
      h("div", { class: "scan-top" },
        photo ? h("img", { class: "scan-photo", src: photo, alt: "Your list" }) : null,
        h("div", {},
          h("b", { text: opts.meals ? `${rows.length} ingredient${rows.length === 1 ? "" : "s"} for ${opts.meals} meal${opts.meals === 1 ? "" : "s"}` : `Found ${rows.length} item${rows.length === 1 ? "" : "s"}` + (opts.pasted && !opts.tidied ? " · matched instantly" : secs ? ` · read ${opts.ocr ? "free " : ""}in ${secs < 10 ? secs.toFixed(1) : Math.round(secs)} s` : "") }),
          h("div", { class: "lmeta", text: `${rows.filter(r => r.match).length} matched · ${rows.filter(r => !r.match).length} new` }),
          opts.meals || aiStatus().list.every(x => x.state === "day") ? null
            : opts.ocr ? h("button", { class: "link", type: "button", text: "✨ Not right? Read it again with AI", onclick: () => { s.close(); aiScan(opts.file); } })
            : opts.pasted && !opts.tidied ? h("button", { class: "link", type: "button", text: "✨ Looks wrong? Tidy it with AI", onclick: () => { s.close(); tidyWithAI(opts.pasted); } }) : null)),
      h("label", { class: "fl" }, h("span", { text: "Shopping at" }), sel),
      rows.map((r, idx) => scanRow(r, idx)),
      !S.admin && newCount ? h("label", { class: "check" },
        h("input", { type: "checkbox", checked: askAdmin, onchange: e => { askAdmin = e.target.checked; } }),
        "Ask the admin to add my new items for everyone") : null,
      h("div", { class: "actions", style: "margin-top:6px" },
        h("button", { class: "btn green block", type: "button", text: total ? `Add ${total} item${total === 1 ? "" : "s"} to “${listName()}”` : "Nothing selected", disabled: !total, onclick: confirm })),
      h("p", { class: "note", text: opts.meals ? "Things you already have were left out. Unchecked ones are basics you probably have; tick any you need." : opts.ocr ? "Read by OCR.space's free text reader (it doesn't keep your photo) and matched on your phone. No AI was used. Fix anything it misread and the app remembers it next time."
        : opts.pasted && !opts.tidied ? "Matched on your phone. Nothing was sent to the AI."
        : (photo ? "Your photo is" : "Your text is") + " sent to Google's Gemini AI to read it and isn't saved. This site is protected by reCAPTCHA; Google's Privacy Policy and Terms of Service apply." })
    ].flat().filter(x => x != null && x !== false));
  }

  function scanRow(r, idx) {
    const m = r.match;
    const status = m
      ? h("div", { class: "sr-status sr-ok" }, "✓ ", h("b", { text: m.name }),
          [m.store !== store ? m.store : "", aisleLabel(m.aisle), priceText(m)].filter(Boolean).length
            ? " · " + [m.store !== store ? m.store : "", aisleLabel(m.aisle), priceText(m)].filter(Boolean).join(" · ") : "")
      : (() => { const sg = !r.where && store ? suggestAisle(r.text, store) : null;
          return h("div", { class: "sr-status sr-new", text: r.where ? `＋ New item · aisle “${r.where}” · add price and photo later`
            : sg ? `＋ New item · ${aisleLabel(sg.aisle) || sg.aisle} suggested (${sg.why})` : "＋ New item · you can add aisle, price and photo later" }); })();
    return h("div", { class: "sr" + (r.on ? "" : " off") },
      h("input", { type: "checkbox", class: "sr-on", checked: r.on, "aria-label": "Include " + r.text, onchange: e => { r.on = e.target.checked; draw(); } }),
      m ? thumbEl(m.image, "thumb") : h("div", { class: "thumb ph", text: "✍️" }),
      h("div", { class: "sr-main" },
        h("div", { class: "sr-line" },
          h("input", { class: "sr-text", value: r.text, maxlength: "120", "aria-label": "Item name", onchange: e => {
            r.text = clip(e.target.value, 120);
            if (!r.match) { r.match = preferStore(localMatch(r.text, store), store); draw(); }
          } }),
          h("div", { class: "qty" },
            h("button", { type: "button", "aria-label": "Fewer", text: "−", onclick: () => { r.qty = Math.max(1, r.qty - 1); draw(); } }),
            h("span", { text: String(r.qty) }),
            h("button", { type: "button", "aria-label": "More", text: "+", onclick: () => { r.qty = Math.min(99, r.qty + 1); draw(); } }))),
        r.low ? h("div", { class: "sr-status sr-warn", text: `⚠️ Hard to read. It looked like “${r.written || r.text}”` }) : null,
        r.note ? h("div", { class: "lmeta", text: r.note }) : null,
        status,
        h("div", { class: "sr-tools" },
          h("button", { class: "link", type: "button", text: m ? "Change match" : "Find a match", onclick: () => pickMatch(r) }),
          m ? h("button", { class: "link", type: "button", text: "Make it a new item", onclick: () => { r.match = null; draw(); } }) : null)));
  }

  function pickMatch(r) {
    const ps = openSheet("Choose the item");
    const q = h("input", { type: "search", placeholder: "🔍 Search items…", value: r.text, "aria-label": "Search items" });
    const list = h("div", { class: "pick-list" });
    const fill = () => {
      const t = norm(q.value);
      const hits = S.inventory.filter(i => !t || norm(i.name).includes(t) || t.includes(norm(i.name)))
        .sort((a, b) => (b.store === store) - (a.store === store) || byName(a, b)).slice(0, 40);
      list.textContent = "";
      if (!hits.length) list.append(h("p", { class: "lmeta", text: "No items match. Use “New item” below." }));
      hits.forEach(i => list.append(h("button", { class: "srow", type: "button", onclick: () => { r.match = i; r.userPicked = true; ps.close(); draw(); } },
        thumbEl(i.image, "thumb"),
        h("div", { style: "flex:1;text-align:left" }, h("div", { class: "sn", text: i.name }),
          h("div", { class: "sc", text: [i.store, aisleLabel(i.aisle), priceText(i)].filter(Boolean).join(" · ") })))));
    };
    q.addEventListener("input", fill);
    ps.body.append(q, list, h("button", { class: "btn block", type: "button", style: "margin-top:10px", text: "＋ It's a new item", onclick: () => { r.match = null; ps.close(); draw(); } }));
    fill();
  }

  async function confirm() {
    const chosen = rows.filter(r => r.on);
    if (!chosen.length) return;
    if (opts.pasted) lsSet("lastPaste", pasteSig(opts.pasted));
    learnAliases(chosen.filter(r => r.match).flatMap(r => [[r.text, r.match], [r.orig, r.match]]));   // also what the reader saw, e.g. "MB OJ Socalories"   // remember what these words meant
    if (chosen.some(r => !r.match) && !store) { toast("Choose which store the new items belong to"); return; }
    if (store) lsSet("lastStore", store);
    const ops = [];
    const made = [];
    const pending = new Map(S.listItems.map(li => [li.inventoryId || ("n:" + norm(li.name) + "|" + li.store), li]));
    const addOp = (item, qty, note) => {
      const key = item.id || ("n:" + norm(item.name) + "|" + item.store);
      const existing = pending.get(key) || findOnList(item);
      if (existing) {
        const nq = Math.min(999, qtyOf(existing) + qty);
        existing.qty = nq;
        const u = { qty: nq, inCart: false };
        if (note) u.note = clip([existing.note, note].filter(Boolean).join(" + "), 80);
        ops.push(b => b.update(itemDoc(S.listId, existing.id), u));
      } else {
        const ref = doc(itemsCol(S.listId));
        const li = { name: clip(item.name, 120), aisle: clip(item.aisle, 40), price: cleanPrice(item.price), image: cleanImage(item.image),
          store: clip(item.store, 80) || "Other", addedAt: Date.now() + ops.length, inCart: false, qty, inventoryId: item.id || null, addedBy: uid() };
        if (note) li.note = clip(note, 80);
        if (isPerLb(item)) { li.per = "lb"; if (note) { const w = lbsOf({ note }); if (w && w !== 1) li.lbs = Math.min(100, Math.round(w * 4) / 4); } }
        pending.set(key, { ...li, id: ref.id });
        ops.push(b => b.set(ref, li));
      }
    };
    const seenNew = new Map();
    for (const r of chosen) {
      if (r.match) { addOp(r.match, r.qty, r.listNote); continue; }
      const name = r.text.charAt(0).toUpperCase() + r.text.slice(1);
      const key = norm(name);
      if (seenNew.has(key)) { addOp(seenNew.get(key), r.qty, r.listNote); continue; }
      let item;
      if (S.admin) {
        const ref = doc(scol("inventory"));
        const data = { name, store, aisle: clip(r.where || (suggestAisle(name, store) || {}).aisle, 40), price: "", image: "", createdAt: Date.now(), createdBy: uid() };
        ops.push(b => b.set(ref, data));
        item = { ...data, id: ref.id };
      } else {
        const id = "my_" + randCode(16);
        const data = { name, store, aisle: clip(r.where || (suggestAisle(name, store) || {}).aisle, 40), price: "", image: "", own: true, updatedAt: Date.now() };
        ops.push(b => b.set(mineDoc(id), data));
        item = { ...data, id };
      }
      seenNew.set(key, item);
      made.push(item);
      addOp(item, r.qty, r.listNote);
    }
    s.close();
    const p = progressSheet("Adding to your list");
    try {
      ensureStoreDoc(store);
      await commitOps(ops, n => p.set(`Saving… ${n} of ${ops.length}`));
    } catch (e) { p.close(); return fail(e); }
    p.close();
    if (!S.admin && askAdmin && made.length) {
      for (const it of made) {
        const req = { kind: "add", itemId: null, name: it.name, store: it.store, aisle: "", price: "", image: "", note: "From a scanned list",
          by: uid(), byName: clip(myName(), 80), createdAt: Date.now() };
        if (S.user.email) req.byEmail = S.user.email;
        try { await addDoc(collection(db, "requests"), req); } catch (e) { console.warn(e); }
      }
    }
    toast(`Added ${chosen.length} item${chosen.length === 1 ? "" : "s"} to ${listName()}` + (made.length ? ` · ${made.length} new to fill in` : ""));
    setTab("list");
  }

  draw();
}

/* ---------- items that still need an aisle, price or photo ---------- */
const needsDetails = i => priceNum(i.price) == null && !i.image;   // the aisle is often filled in for you now; price and photo still need a person
function myNeedsDetails() {
  return S.inventory.filter(i => needsDetails(i) && (S.admin || i._own)).sort(byName);
}
function fillInDetails() {
  const queue = myNeedsDetails();
  const total = queue.length;
  const next = () => {
    const it = queue.shift();
    if (!it) { toast("All filled in 🎉"); return; }
    const s = openSheet(`Fill in details · ${total - queue.length} of ${total}`);
    itemForm(s.body, { item: it, onDone: () => { s.close(); setTimeout(next, 250); } });
  };
  next();
}

/* =====================================================================
   STORE SMARTS
   Aisle signs → aisle maps → suggested aisles. Barcodes, price tags and
   receipts are read with the free reader or the phone itself. No AI.
   ===================================================================== */

/* ---------- what kind of thing is it? (matches items to aisle signs) ---------- */
// Each group lists sign words and product words. "_" joins a phrase (peanut_butter).
const AISLE_GROUPS = {
  cereal: "cereal cereals breakfast cheerios flakes granola oatmeal oats chex kix pop_tarts poptarts raisin_bran froot_loops lucky_charms special_k cinnamon_toast_crunch muesli",
  coffee: "coffee coffees k_cups kcups keurig espresso creamer creamers coffee_mate",
  tea: "tea teas teabags chai",
  bread: "bread breads bagels buns rolls english_muffins tortillas wraps pita loaf croissants",
  bakery: "bakery cake cakes donuts doughnuts muffins pie pies cupcakes danish",
  pasta: "pasta spaghetti macaroni penne ziti noodles lasagna linguine rigatoni fettuccine mac_and_cheese",
  sauce: "sauce sauces marinara alfredo pesto ragu prego",
  rice: "rice grains quinoa couscous risotto",
  canned: "canned canned_goods canned_vegetables canned_fruit tuna beans chickpeas spam canned_meat",
  soup: "soup soups broth stock bouillon ramen chili",
  condiment: "condiments ketchup mustard mayo mayonnaise relish dressing dressings bbq barbecue hot_sauce vinegar pickles olives salad_dressing",
  baking: "baking flour sugar brown_sugar baking_soda baking_powder yeast vanilla chocolate_chips cake_mix frosting cocoa sprinkles cornstarch",
  spice: "spices spice seasoning seasonings salt pepper cinnamon paprika oregano cumin garlic_powder onion_powder adobo sazon bay_leaves basil chili_powder",
  oil: "oil oils olive_oil vegetable_oil canola cooking_spray shortening",
  spreads: "peanut_butter jelly jam jams nutella honey syrup maple_syrup spreads",
  snack: "snacks snack chips crisps doritos lays pringles cheetos fritos tostitos pretzels popcorn munchos goldfish crackers cheez_it ritz triscuit wheat_thins nuts cashews almonds peanuts trail_mix jerky granola_bars",
  cookie: "cookies oreo oreos chips_ahoy biscuits wafers",
  candy: "candy candies chocolate gum mints snickers reeses",
  soda: "soda sodas pop cola coke pepsi sprite ginger_ale seltzer sparkling",
  drinks: "beverages beverage drinks juice juices water gatorade powerade lemonade sports_drinks energy_drinks oj",
  dairy: "dairy milk cheese cheeses yogurt yoghurt butter cream sour_cream cream_cheese cottage_cheese half_and_half eggs margarine",
  frozen: "frozen frozen_foods ice_cream pizza waffles fries tater_tots popsicles frozen_vegetables",
  meat: "meat meats beef chicken pork steak ground_beef turkey sausage bacon ham ribs roast chops thighs wings hot_dogs linguica chourico chorizo cacoila",
  seafood: "seafood fish shrimp salmon cod haddock tilapia scallops lobster crab",
  deli: "deli bologna salami provolone pepperoni hummus rotisserie cold_cuts",
  produce: "produce fruit fruits vegetables veggies apples bananas oranges lemons limes grapes berries strawberries blueberries lettuce spinach kale tomatoes potatoes onions garlic peppers carrots celery broccoli cucumbers avocados mushrooms herbs cilantro squash zucchini melon",
  international: "international ethnic mexican asian italian hispanic goya soy_sauce taco tacos salsa sriracha portuguese",
  paper: "paper paper_goods paper_towels toilet_paper bath_tissue tissue tissues napkins paper_plates cups bounty charmin angel_soft kleenex",
  cleaning: "cleaning cleaners cleaner bleach clorox lysol windex sponges dish_soap dishwasher trash_bags garbage_bags foil plastic_wrap ziploc storage_bags",
  laundry: "laundry detergent tide fabric_softener dryer_sheets",
  pet: "pet pets dog dogs cat cats cat_litter litter kibble pet_food",
  baby: "baby diapers wipes formula",
  health: "health beauty pharmacy medicine vitamins shampoo conditioner body_wash toothpaste toothbrush deodorant razors lotion bandages",
  household: "household batteries light_bulbs candles",
  alcohol: "beer wine liquor"
};
const NON_FOOD = new Set(["paper", "cleaning", "laundry", "pet", "baby", "health", "household"]);
const stem = w => w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y"
  : w.length > 4 && /(ches|shes|xes|oes)$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
// "Honey Nut Cheerios (14 oz)" → ["honey", "nut", "cheerio"]
const termsOf = t => String(t || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ")
  .split(/\s+/).filter(w => w.length > 1 && !/^\d+$/.test(w) && !STOP.has(w) && w !== "and").map(stem);
const GROUPS = Object.entries(AISLE_GROUPS).map(([k, v]) => {
  const words = new Set(), phrases = [];
  v.split(/\s+/).forEach(tok => { if (tok.includes("_")) { const p = termsOf(tok.replace(/_/g, " ")).join(" "); if (p) phrases.push(p); } else termsOf(tok).forEach(w => words.add(w)); });
  return { k, words, phrases };
});
// Which groups a name belongs to, weighted so the last word counts most ("Honey Nut Cheerios" is a cereal, not a spread).
function groupScores(text) {
  const t = termsOf(text), out = new Map();
  if (!t.length) return out;
  const w = i => 1 + i / t.length;
  const covered = new Set();
  const add = (k, v) => { if (v > (out.get(k) || 0)) out.set(k, v); };
  for (const g of GROUPS) for (const p of g.phrases) {          // phrases first: "canned vegetables" is canned, not produce
    const pw = p.split(" ");
    for (let i = 0; i + pw.length <= t.length; i++) {
      if (pw.every((x, j) => t[i + j] === x)) { add(g.k, w(i + pw.length - 1) + 0.25); for (let j = 0; j < pw.length; j++) covered.add(i + j); }
    }
  }
  t.forEach((x, i) => { if (covered.has(i)) return; for (const g of GROUPS) if (g.words.has(x)) add(g.k, w(i)); });
  return out;
}
const isNonFood = name => { const g = groupScores(name); if (!g.size) return false; const top = [...g.entries()].sort((a, b) => b[1] - a[1])[0][0]; return NON_FOOD.has(top); };

/* ---------- aisle maps: one per store. Admin's is shared; everyone else keeps a private one ---------- */
const aisleMapCol = () => scol("aisleMaps");
const myAisleCol = () => collection(db, "users", uid(), "aisleMaps");
function aisleMapFor(store) {
  if (!store) return null;
  const mine = !S.admin && S.aisleMine && S.aisleMine.get(store);
  return mine || (S.aisleShared && S.aisleShared.get(store)) || null;
}
const aislesOf = store => { const m = aisleMapFor(store); return m && Array.isArray(m.aisles) ? m.aisles : []; };
function cleanAisles(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(a => {
    const aisle = clip(a && a.aisle, 40);
    const cats = [...new Set((Array.isArray(a && a.cats) ? a.cats : []).map(c => clip(c, 40)).filter(Boolean))].slice(0, 16);
    if (!aisle) return;
    const same = out.find(x => norm(x.aisle) === norm(aisle));
    if (same) same.cats = [...new Set([...same.cats, ...cats])].slice(0, 16);
    else out.push({ aisle, cats });
  });
  return out.sort((x, y) => byAisle({ aisle: x.aisle }, { aisle: y.aisle })).slice(0, 120);
}
async function saveAisles(store, aisles) {
  const data = { store: clip(store, 80), aisles: cleanAisles(aisles), updatedAt: Date.now(), updatedBy: uid() };
  const ref = S.admin ? doc(aisleMapCol(), slug(store)) : doc(myAisleCol(), slug(store));
  const local = S.admin ? S.aisleShared : S.aisleMine;
  local.set(store, { ...data, id: slug(store) });   // show it straight away
  await setDoc(ref, data);
}

/* ---------- suggest an aisle for an item ---------- */
// 1) same item already has an aisle here  2) a very similar item does  3) an aisle sign mentions it  4) similar kinds of items sit there
function suggestAisle(name, store) {
  const n = norm(name);
  if (!n || !store) return null;
  const here = itemsIn(store).filter(i => i.aisle);
  const same = here.find(i => norm(i.name) === n);
  if (same) return { aisle: same.aisle, why: "already saved" };
  const q = termsOf(name);
  if (!q.length) return null;
  const gs = groupScores(name), top = topGroup(gs), qset = new Set(q);
  // a very similar item (2+ shared words, or the same single word)
  let best = null, bestScore = 0, bestShared = 0;
  for (const i of here) {
    const w = new Set(termsOf(i.name));
    if (!w.size) continue;
    const shared = q.filter(x => w.has(x)).length;
    const score = shared / Math.max(q.length, w.size);
    if (score > bestScore) { bestScore = score; best = i; bestShared = shared; }
  }
  if (best && bestScore >= 0.5 && (bestShared >= 2 || (q.length === 1 && termsOf(best.name).length === 1))) return { aisle: best.aisle, why: `like ${best.name}` };
  // an aisle sign that names it, or names its kind of thing
  let sign = null, signScore = 0, signWhy = "";
  for (const a of aislesOf(store)) {
    let direct = 0, groups = new Set(), why = "";
    for (const c of a.cats) {
      const hit = termsOf(c).filter(x => qset.has(x)).length;
      if (hit && !why) why = c;
      direct += hit;
      for (const k of groupScores(c).keys()) { groups.add(k); if (k === top && !why) why = c; }
    }
    const sc = 2 * direct + (top && groups.has(top) ? 2 : 0) + 0.5 * [...gs.keys()].filter(k => k !== top && groups.has(k)).length;
    if (sc > signScore) { signScore = sc; sign = a; signWhy = why; }
  }
  if (sign && signScore >= 2) return { aisle: sign.aisle, why: signWhy ? `${signWhy} sign` : "aisle sign" };
  // where the same kind of thing already sits in this store
  if (top) {
    const votes = new Map();
    here.forEach(i => { if (topGroup(groupScores(i.name)) === top) votes.set(i.aisle, (votes.get(i.aisle) || 0) + 1); });
    const v = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
    if (v) return { aisle: v[0], why: `with other ${GROUP_LABEL[top] || top}` };
  }
  if (best && bestScore >= 0.34 && (!top || topGroup(groupScores(best.name)) === top)) return { aisle: best.aisle, why: `like ${best.name}` };
  return null;
}
const GROUP_LABEL = { cereal: "cereal", coffee: "coffee", tea: "tea", bread: "bread", bakery: "bakery items", pasta: "pasta", sauce: "sauces", rice: "rice", canned: "canned goods",
  soup: "soups", condiment: "condiments", baking: "baking items", spice: "spices", oil: "oils", spreads: "spreads", snack: "snacks", cookie: "cookies", candy: "candy",
  soda: "soda", drinks: "drinks", dairy: "dairy", frozen: "frozen food", meat: "meat", seafood: "seafood", deli: "deli items", produce: "produce", international: "international foods",
  paper: "paper goods", cleaning: "cleaning supplies", laundry: "laundry items", pet: "pet supplies", baby: "baby items", health: "health & beauty", household: "household items", alcohol: "drinks" };
function topGroup(gs) { let k = null, v = 0; gs.forEach((s, g) => { if (s > v) { v = s; k = g; } }); return k; }
const sugText = sg => `${aisleLabel(sg.aisle) || sg.aisle}${sg.why ? ` (${sg.why})` : ""}`;

/* ---------- reading signs, tags and receipts with the free reader ---------- */
async function freeRead(file, { engines = [2, 3], ladder, overlay = false, table = false, title = "Reading…" } = {}) {
  const p = progressSheet(title);
  try {
    p.set("Getting the photo ready…");
    const img = await compressImage(file, { ladder: ladder || [[1600, 0.82], [1400, 0.78], [1280, 0.75], [1024, 0.72]], limit: 1000000, raw: true });
    p.set("Reading…");
    for (const eng of engines.filter(e => !ocrResting(e))) {
      try { const r = await ocrRead(img, eng, { overlay, table, full: true }); return { ...r, img }; }
      catch (e) {
        console.warn("free reader", eng, e);
        if (e.kind === "limit") restOcr(eng, 6 * 3600e3);
        if (e.kind === "net") break;
      }
    }
    return null;
  } catch (e) { console.warn(e); return null; }
  finally { p.close(); }
}
const titleCase = t => String(t || "").toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
// "AISLE 4 / CEREAL • COFFEE • TEA" → { aisle: "4", cats: ["Cereal", "Coffee", "Tea"] }
function parseSign(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  let aisle = "";
  const cats = [];
  for (let l of lines) {
    if (!aisle) {
      const m = l.match(/\b(?:aisle|isle|aile|pasillo)\s*#?\s*([a-z]?-?\d{1,2}[a-z]?)\b/i) || l.match(/^#?\s*(\d{1,2}[a-z]?)\b/i) || l.match(/^([a-z]-?\d{1,2})\b/i);
      if (m) { aisle = m[1].toUpperCase().replace("-", ""); l = l.replace(m[0], " "); }
    }
    l.split(/[•·|,\/;]|\s{2,}|\s-\s/).forEach(part => {
      const t = part.replace(/\b(aisle|isle|pasillo)\b/ig, " ").replace(/[^A-Za-z&' ]+/g, " ").replace(/\s+/g, " ").trim();
      if ((t.match(/[a-z]/gi) || []).length >= 3 && t.length <= 40) cats.push(titleCase(t));
    });
  }
  const seen = new Set();
  return { aisle, cats: cats.filter(c => { const k = norm(c); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12) };
}

/* ---------- the aisle map screen ---------- */
function openAisleMap(store) {
  const s = openSheet(`Aisles · ${store}`);
  const draw = () => {
    s.body.textContent = "";
    const list = aislesOf(store);
    const missing = itemsIn(store).filter(i => !i.aisle && (S.admin || i._own));
    put(s.body,
      h("p", { class: "msg", text: "Snap the sign over each aisle once. New items then get their aisle filled in for you." }),
      !S.admin ? h("div", { class: "pnote", text: "Your aisle map is saved just for you. You can send it to the admin to share with everyone." }) : null,
      list.length ? h("div", { class: "amlist" }, list.map(a => h("div", { class: "amrow" },
        aisleSign(a.aisle) || h("b", { class: "amlab", text: a.aisle }),
        h("div", { class: "amcats", text: a.cats.join(" · ") || "No categories yet" }),
        h("button", { class: "iconbtn", type: "button", "aria-label": "Edit " + aisleLabel(a.aisle), text: "✏️", onclick: () => signEditor(store, a, null, draw) }),
        h("button", { class: "iconbtn", type: "button", "aria-label": "Remove " + aisleLabel(a.aisle), text: "✕", onclick: async () => {
          if (!await confirmSheet("Remove aisle?", `Remove ${aisleLabel(a.aisle)} from the map? Items keep their aisles.`, "Remove", true)) return;
          try { await saveAisles(store, aislesOf(store).filter(x => x !== a)); } catch (e) { fail(e); }
          draw();
        } }))))
        : h("div", { class: "empty small" }, h("b", { text: "No aisles mapped yet" }), "Start at aisle 1 and work your way down."),
      h("div", { class: "actions" },
        h("button", { class: "btn primary", type: "button", text: "📸 Scan a sign", onclick: () => scanSign(store, draw) }),
        h("button", { class: "btn", type: "button", text: "＋ Type one in", onclick: () => signEditor(store, null, null, draw) })),
      missing.length ? h("button", { class: "btn green block", type: "button", style: "margin-top:10px", text: `✨ Fill in ${missing.length} missing aisle${missing.length === 1 ? "" : "s"}`, onclick: () => fillAisles(store, draw) }) : null,
      !S.admin && list.length ? h("button", { class: "btn block", type: "button", style: "margin-top:8px", text: "Send my aisle map to the admin", onclick: () => sendAisleMap(store) }) : null);
  };
  draw();
}
async function scanSign(store, after) {
  const file = await pickImage(true);
  if (!file) return;
  const res = await freeRead(file, { engines: [2, 3], title: "Reading the sign" });
  const parsed = parseSign(res && res.text);
  if (!res) toast("Couldn't read the sign. Type it in instead.");
  else if (!parsed.aisle && !parsed.cats.length) toast("No words found on that photo. Type it in instead.");
  signEditor(store, null, { ...parsed, img: res && res.img }, after);
}
function signEditor(store, existing, read, after) {
  const s = openSheet(existing ? `Edit ${aisleLabel(existing.aisle)}` : "Aisle sign");
  const aisle = h("input", { value: existing ? existing.aisle : (read && read.aisle) || "", maxlength: "40", placeholder: "e.g. 4, 12B or Produce", "aria-label": "Aisle" });
  const cats = h("textarea", { class: "pastebox", rows: "5", placeholder: "One per line, e.g.\nCereal\nCoffee\nTea", "aria-label": "What's in this aisle" });
  cats.value = (existing ? existing.cats : (read && read.cats) || []).join("\n");
  const save = async next => {
    const a = clip(aisle.value, 40);
    if (!a) { toast("Add the aisle number or name"); aisle.focus(); return; }
    const list = cats.value.split(/\n|,/).map(t => clip(titleCase(t.trim()), 40)).filter(Boolean);
    let all = aislesOf(store).filter(x => x !== existing);
    all.push({ aisle: a, cats: list });
    try { await saveAisles(store, all); } catch (e) { return fail(e); }
    s.close();
    toast(`${aisleLabel(a)} saved`);
    if (after) after();
    if (next) setTimeout(() => scanSign(store, after), 250);
  };
  put(s.body,
    read && read.img ? h("img", { class: "sign-photo", src: read.img, alt: "The sign you scanned" }) : null,
    read ? h("p", { class: "lmeta", text: "Check what the reader found and fix anything it got wrong." }) : null,
    h("label", { class: "fl" }, h("span", { text: "Aisle" }), aisle),
    h("label", { class: "fl" }, h("span", { text: "What's in it (from the sign)" }), cats),
    h("div", { class: "actions" },
      existing ? null : h("button", { class: "btn", type: "button", text: "Save & scan next", onclick: () => save(true) }),
      h("button", { class: "btn green", type: "button", text: "Save", onclick: () => save(false) })));
}
async function sendAisleMap(store) {
  const list = aislesOf(store);
  if (!list.length) return;
  const req = { kind: "aisles", name: "Aisle map", store: clip(store, 80), aisles: cleanAisles(list), note: "", by: uid(), byName: clip(myName(), 80), createdAt: Date.now() };
  if (S.user.email) req.byEmail = S.user.email;
  try { await addDoc(collection(db, "requests"), req); toast("Sent to the admin"); }
  catch (e) { fail(e); }
}
// Every item at a store without an aisle, with a suggestion to accept or change.
function fillAisles(store, after) {
  const items = itemsIn(store).filter(i => !i.aisle && (S.admin || i._own)).sort(byName);
  const rows = items.map(i => { const sg = suggestAisle(i.name, store); return { item: i, aisle: sg ? sg.aisle : "", why: sg ? sg.why : "", on: !!sg }; });
  const s = openSheet(`Fill in aisles · ${store}`);
  const draw = () => {
    s.body.textContent = "";
    const n = rows.filter(r => r.on && r.aisle).length;
    put(s.body,
      h("p", { class: "msg", text: rows.some(r => r.aisle) ? "Suggested from your aisle signs and the items you've already placed. Change any you know better." : "No suggestions yet. Scan a few aisle signs or give some items an aisle first." }),
      !S.admin ? h("p", { class: "lmeta", text: "This fills in your own items. Items on the main list get their aisles when the admin fills them in." }) : null,
      rows.map(r => h("div", { class: "sr" + (r.on ? "" : " off") },
        h("input", { type: "checkbox", class: "sr-on", checked: r.on, "aria-label": "Use for " + r.item.name, onchange: e => { r.on = e.target.checked; draw(); } }),
        thumbEl(r.item.image, "thumb"),
        h("div", { class: "sr-main" },
          h("div", { class: "sn", text: r.item.name }),
          h("div", { class: "fa-line" },
            h("input", { class: "fa-in", value: r.aisle, maxlength: "40", placeholder: "Aisle", "aria-label": "Aisle for " + r.item.name,
              onchange: e => { r.aisle = clip(e.target.value, 40); r.why = ""; r.on = !!r.aisle; draw(); } }),
            r.why ? h("span", { class: "lmeta", text: r.why }) : null)))),
      h("button", { class: "btn green block", type: "button", style: "margin-top:10px", disabled: !n, text: n ? `Save ${n} aisle${n === 1 ? "" : "s"}` : "Nothing to save", onclick: save }));
  };
  async function save() {
    const pick = rows.filter(r => r.on && r.aisle);
    if (!pick.length) return;
    const ops = [], changes = new Map();
    pick.forEach(r => {
      if (S.admin) {
        const data = { aisle: r.aisle, updatedAt: Date.now(), updatedBy: uid() };
        ops.push(b => b.update(sdoc("inventory", r.item.id), data));
        changes.set(r.item.id, { item: r.item, data });
      } else ops.push(b => b.update(mineDoc(r.item.id), { aisle: r.aisle, updatedAt: Date.now() }));
    });
    s.close();
    const p = progressSheet("Saving aisles");
    try { await commitOps(ops, k => p.set(`Saving… ${k} of ${ops.length}`)); } catch (e) { p.close(); return fail(e); }
    p.close();
    syncListsBulk(changes);
    toast(`Saved ${pick.length} aisle${pick.length === 1 ? "" : "s"}`);
    if (after) after();
  }
  draw();
}
// Brings price and aisle changes onto every list in one pass (admin changes only; private ones never touch shared lists).
async function syncListsBulk(changes) {
  if (!changes || !changes.size) return;
  for (const l of S.lists) {
    try {
      const snap = await getDocs(itemsCol(l.id));
      const ops = [];
      snap.forEach(ds => {
        const v = ds.data();
        for (const [id, { item, data }] of changes) {
          if ((v.inventoryId && v.inventoryId === id) || (norm(v.name) === norm(item.name) && v.store === item.store)) {
            const u = {};
            ["aisle", "price", "per"].forEach(k => { if (k in data) u[k] = data[k]; });
            if (Object.keys(u).length) ops.push(b => b.update(ds.ref, u));
            break;
          }
        }
      });
      if (ops.length) await commitOps(ops);
    } catch (e) { console.warn("list sync", l.id, e); }
  }
}

/* ---------- barcodes ---------- */
const OFF_API = "https://world.openfoodfacts.org/api/v2/product/";
const normUpc = c => { c = String(c || "").replace(/\D/g, ""); return c.length === 12 ? "0" + c : c; };
// Name, brand, size and photo from Open Food Facts (a free, public product database).
async function lookupBarcode(code) {
  const tryOne = async c => {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`${OFF_API}${encodeURIComponent(c)}.json?fields=product_name,product_name_en,brands,quantity,image_front_url,image_front_small_url`, { signal: ctl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || j.status !== 1 || !j.product) return null;
      const p = j.product;
      const brand = clip(String(p.brands || "").split(",")[0], 40);
      let name = clip(p.product_name_en || p.product_name || "", 90);
      if (brand && name && !norm(name).includes(norm(brand))) name = `${brand} ${name}`;
      else if (!name) name = brand;
      if (!name) return null;
      const qty = clip(p.quantity || "", 20);
      return { name: clip(titleCase(name) + (qty ? ` (${qty})` : ""), 120), image: p.image_front_url || p.image_front_small_url || "" };
    } catch (e) { return null; } finally { clearTimeout(tm); }
  };
  const raw = String(code || "").replace(/\D/g, "");
  return await tryOne(raw) || (normUpc(raw) !== raw ? await tryOne(normUpc(raw)) : null);
}
/* ---------- nutrition from your barcodes (Open Food Facts) and nutrition-label photos ---------- */
// Kept on this device, keyed by barcode ("nut:0041196010152") or, for a label photo of an item with no barcode,
// by item ("nut:id:abc123"). Barcode data is free to fetch again on any other device.
const NUT_FIELDS = "product_name,brands,nutriments,serving_size,allergens_tags,labels_tags,nutriscore_grade,nova_group";
let nutVer = 0;
function nutCached(key) { try { const v = lsGet("nut:" + key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function nutSave(key, v) { lsSet("nut:" + key, JSON.stringify(v)); nutVer++; }
const numOr = x => typeof x === "number" && isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && isFinite(+x) ? +x : null;
const nutOfItem = i => (i.upc && nutCached(normUpc(i.upc))) || nutCached("id:" + i.id) || null;
const NUT_FRESH = 30 * 864e5;
// Things that will never have Nutrition Facts: paper goods, cleaning, laundry, baby (except formula and baby food),
// pet, health & beauty, household. Uses the same categories the app already sorts aisles by.
function nonFood(i) {
  if (/formula|baby food|puree|teether|snack|cereal/i.test(i.name || "")) return false;
  return NON_FOOD.has(topGroup(groupScores(`${i.name || ""} ${i.aisle || ""}`)));
}
// Meat, deli, cheese and bakery packed in the store get a barcode that holds the price or weight, not a product,
// so no database will ever have them. Those start with 2 (02… once padded to 13 digits).
const storePacked = i => /^0?2\d{10,11}$/.test(normUpc(i.upc || ""));
async function fetchNutrition(upc, force) {
  upc = normUpc(upc);
  if (!/^\d{8,14}$/.test(upc)) return null;
  const old = nutCached(upc);
  if (old && !force && Date.now() - (old.t || 0) < NUT_FRESH) return old;
  const tryOne = async c => {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(`${OFF_API}${encodeURIComponent(c)}.json?fields=${NUT_FIELDS}`, { signal: ctl.signal });
      if (r.status === 404) return false;
      if (!r.ok) throw new Error("off " + r.status);
      const j = await r.json();
      return j && j.status === 1 && j.product ? j.product : false;
    } finally { clearTimeout(tm); }
  };
  let p;
  try { p = await tryOne(upc); if (p === false && upc.startsWith("0")) p = await tryOne(upc.slice(1)); }
  catch (e) { return old; }   // offline or the database is busy: keep what we had
  const label = old && old.src === "label" ? { src: "label", per100: old.per100, srv: old.srv } : {};
  if (!p) { const v = { ...(old || {}), src: "off", t: Date.now(), found: false, ...label }; nutSave(upc, v); return v; }
  const n = p.nutriments || {};
  const kcal = numOr(n["energy-kcal_100g"]) ?? (numOr(n.energy_100g) != null ? numOr(n.energy_100g) / 4.184 : null);
  const per100 = kcal == null ? null : { kcal, p: numOr(n.proteins_100g) ?? 0, c: numOr(n.carbohydrates_100g) ?? 0, f: numOr(n.fat_100g),
    fi: numOr(n.fiber_100g), su: numOr(n.sugars_100g), na: numOr(n.sodium_100g) != null ? Math.round(numOr(n.sodium_100g) * 1000) : null };
  const sk = numOr(n["energy-kcal_serving"]);
  const srv = sk != null ? { size: clip(p.serving_size || "", 40), kcal: sk, p: numOr(n.proteins_serving), c: numOr(n.carbohydrates_serving), f: numOr(n.fat_serving) }
    : p.serving_size ? { size: clip(p.serving_size, 40) } : null;
  const v = { src: "off", t: Date.now(), found: true, name: clip(p.product_name || "", 80), per100, srv,
    al: (p.allergens_tags || []).slice(0, 20), lb: (p.labels_tags || []).filter(t => /gluten|vegan|dairy|lactose|milk|organic/.test(t)).slice(0, 12),
    ns: clip(p.nutriscore_grade || "", 2), nova: numOr(p.nova_group), ...label };
  nutSave(upc, v);
  return v;
}
// Every scanned barcode that hasn't been looked up lately, gently (the database is free; don't hammer it).
let nutRunning = null;
function backfillNutrition(onProgress, force) {
  if (nutRunning) return nutRunning;
  const todo = [...new Set(S.inventory.filter(i => i.upc && !nonFood(i) && !storePacked(i)).map(i => normUpc(i.upc)))]
    .filter(u => { const c = nutCached(u); return force || !c || Date.now() - (c.t || 0) > NUT_FRESH; });
  if (!todo.length) return Promise.resolve(0);
  nutRunning = (async () => {
    let n = 0;
    for (const u of todo) { await fetchNutrition(u, true); n++; onProgress && onProgress(n, todo.length); await new Promise(r => setTimeout(r, 700)); }
    return n;
  })().finally(() => { nutRunning = null; });
  return nutRunning;
}
// Which of your products is this recipe ingredient? All the ingredient's words must be in the product's name,
// and both must be the same kind of food ("Rice" → Jasmine Rice, never Rice Vinegar).
let nutIdx = null, nutIdxKey = "";
function nutProducts() {
  const key = nutVer + ":" + S.inventory.length;
  if (nutIdx && nutIdxKey === key) return nutIdx;
  nutIdxKey = key;
  nutIdx = S.inventory.map(i => ({ i, nut: nutOfItem(i) })).filter(x => x.nut && (x.nut.per100 || (x.nut.al && x.nut.al.length) || (x.nut.lb && x.nut.lb.length)))
    .map(x => ({ ...x, terms: new Set(termsOf(x.i.name)), food: foodOf(x.i.name) }));
  return nutIdx;
}
function productFor(item, food, need) {
  const t = termsOf(item);
  if (!t.length) return null;
  return nutProducts().find(x => (!need || need(x.nut)) && x.food === food && t.every(w => x.terms.has(w))) || null;
}
function productNutrition(item, food) {
  const x = productFor(item, food, n => n.per100);
  return x ? { kcal: x.nut.per100.kcal, p: x.nut.per100.p, c: x.nut.per100.c } : null;
}
function productDiet(item, key) {
  const x = productFor(item, foodOf(item));
  if (!x) return null;
  const al = x.nut.al || [], lb = x.nut.lb || [];
  if (key === "gf") { if (lb.some(t => /gluten-free|no-gluten/.test(t))) return "free"; if (al.includes("en:gluten")) return "contains"; }
  if (key === "df") { if (lb.some(t => /vegan|dairy-free|no-milk|no-dairy/.test(t))) return "free"; if (al.includes("en:milk")) return "contains"; }
  return null;
}
// "🥫 200 cal · 7 g protein per serving (2 oz)"
function nutSummary(v) {
  if (!v) return "";
  const s = v.srv || {};
  if (s.kcal != null) return `${Math.round(s.kcal)} cal · ${Math.round(s.p || 0)} g protein · ${Math.round(s.c || 0)} g carbs per serving${s.size ? ` (${s.size})` : ""}`;
  if (v.per100) return `${Math.round(v.per100.kcal)} cal · ${Math.round(v.per100.p)} g protein · ${Math.round(v.per100.c)} g carbs per 100 g`;
  return "";
}
// A photo of the Nutrition Facts panel, read by the same free reader the app uses for recipes.
async function readNutritionLabel(item) {
  const how = await choose("Nutrition label", "Take a close photo of just the Nutrition Facts panel, straight on, without glare.",
    [{ label: "📸 Take photo", value: "cam", cls: "primary" }, { label: "🖼️ Choose photo", value: "lib" }, { label: "Cancel", value: null }]);
  if (!how) return null;
  const file = await pickImage(how === "cam");
  if (!file) return null;
  const p = progressSheet("Reading the label");
  let res;
  try {
    p.set("Getting the photo ready…");
    const photo = await compressImage(file, { ladder: [[1600, 0.85], [1280, 0.82], [1024, 0.8]], limit: 1200000, raw: true });
    p.set("Reading the numbers…");
    res = await aiJSON([[
      "This is a photo of a food package's Nutrition Facts panel. Read it exactly.",
      'Return JSON: {"found": boolean, "servingSize": string, "servingGrams": number or null, "calories": number or null, "protein": number or null, "carbs": number or null, "fat": number or null, "fiber": number or null, "sugar": number or null, "sodium": number or null (mg), "glutenFree": true or null (true only if the package says gluten-free), "contains": [string] (from a "Contains:" allergen line, e.g. "wheat", "milk")}',
      "Values are per serving, in grams except sodium. Use null for anything you can't read clearly. Never guess. Return only JSON."].join("\n"),
      { inlineData: { mimeType: "image/jpeg", data: photo.split(",")[1] } }], t => p.set(t), AI_MODELS);
  } catch (e) {
    p.close();
    await choose("Couldn't read the label", scanErrorText(e), [{ label: "OK", value: 1 }]);
    return null;
  }
  p.close();
  const kc = numOr(res && res.calories);
  if (!res || res.found === false || kc == null) {
    await choose("Couldn't read the label", "I couldn't make out the calories. Try again closer, straight on, with no glare.", [{ label: "OK", value: 1 }]);
    return null;
  }
  const g = numOr(res.servingGrams), f = x => numOr(res[x]);
  const lines = [`Serving: ${clip(res.servingSize || "?", 40)}`, `Calories: ${kc}`, ...[["Protein", "protein", "g"], ["Carbs", "carbs", "g"], ["Fat", "fat", "g"], ["Fiber", "fiber", "g"],
    ["Sugar", "sugar", "g"], ["Sodium", "sodium", "mg"]].map(([l, k, u]) => `${l}: ${f(k) == null ? "couldn't read" : f(k) + " " + u}`)];
  const contains = (Array.isArray(res.contains) ? res.contains : []).map(x => String(x).toLowerCase()).slice(0, 10);
  if (contains.length) lines.push(`Contains: ${contains.join(", ")}`);
  if (!g) lines.push("", "The serving weight wasn't readable, so recipes can't use these numbers yet. They'll still show on the item.");
  const ok = await choose("Is this right?", lines.join("\n"), [{ label: "Save", value: true, cls: "primary" }, { label: "Cancel", value: null }]);
  if (!ok) return null;
  const per = x => g && f(x) != null ? f(x) / g * 100 : null;
  const v = { src: "label", t: Date.now(), found: true,
    per100: g ? { kcal: kc / g * 100, p: per("protein") ?? 0, c: per("carbs") ?? 0, f: per("fat"), fi: per("fiber"), su: per("sugar"), na: f("sodium") != null ? Math.round(f("sodium") / g * 100) : null } : null,
    srv: { size: clip(res.servingSize || "", 40), kcal: kc, p: f("protein"), c: f("carbs"), f: f("fat") },
    al: [...new Set(contains.flatMap(c => /wheat|gluten|barley|rye/.test(c) ? ["en:gluten"] : /milk|dairy/.test(c) ? ["en:milk"] : []))],
    lb: res.glutenFree === true ? ["en:gluten-free"] : [] };
  const key = item.upc ? normUpc(item.upc) : "id:" + item.id;
  const old = nutCached(key);
  nutSave(key, old ? { ...old, ...v, al: [...new Set([...(old.al || []), ...v.al])], lb: [...new Set([...(old.lb || []), ...v.lb])] } : v);
  toast("Nutrition saved");
  return v;
}
// On the Meals tab: how many of your scanned products have nutrition facts, and which ones need a label photo.
function labelsCard() {
  const all = S.inventory.filter(i => i.upc);
  if (!all.length) return null;
  const skipNF = all.filter(nonFood), skipSP = all.filter(i => !nonFood(i) && storePacked(i));
  const scanned = all.filter(i => !nonFood(i) && !storePacked(i));   // food with a real product barcode
  const host = h("div", { class: "card nutcard" });
  const draw = (prog) => {
    const wasOpen = !!host.querySelector("details[open]");
    host.textContent = "";   // redraw in place: put() only adds, so clear first or the card repeats itself
    const withNut = scanned.filter(i => (nutOfItem(i) || {}).per100);
    const missing = scanned.filter(i => { const v = nutOfItem(i); return v && !v.per100; });
    const waiting = scanned.length - withNut.length - missing.length;
    put(host,
      h("h2", { text: "📊 Nutrition from your barcodes" }),
      h("p", { class: "lmeta", text: `${withNut.length} of ${scanned.length} scanned food products have nutrition facts. Recipes that use them show real numbers instead of estimates.` }),
      skipNF.length || skipSP.length ? h("p", { class: "lmeta", text: [skipNF.length ? `${skipNF.length} non-food item${skipNF.length === 1 ? "" : "s"} (paper goods, cleaning, baby, pet, health) skipped` : "",
        skipSP.length ? `${skipSP.length} store-packed item${skipSP.length === 1 ? "" : "s"} (meat, deli, bakery) skipped, no label needed` : ""].filter(Boolean).join(" · ") + "." }) : null,
      prog ? h("p", { class: "lmeta", text: `Checking the free product database… ${prog}` }) : waiting ? h("p", { class: "lmeta", text: `${waiting} still to check.` }) : null,
      missing.length ? h("details", wasOpen ? { open: "" } : {}, h("summary", { text: `${missing.length} product${missing.length === 1 ? "" : "s"} not in the database: add a label photo` }),
        h("div", { class: "nutmiss" }, missing.slice(0, 60).map(i => h("div", { class: "srow" },
          h("div", { class: "sn", text: i.name }),
          h("button", { class: "btn small", type: "button", text: "📷 Label", onclick: async () => { if (await readNutritionLabel(i)) draw(); } }))))) : null,
      h("div", { class: "actions", style: "margin-top:8px" },
        h("button", { class: "btn", type: "button", text: waiting ? "Check them now" : "↻ Check again", onclick: () => run(!waiting) })));
  };
  const run = force => backfillNutrition((n, t) => draw(`${n} of ${t}`), force).then(() => draw());
  draw();
  if (scanned.some(i => !nutOfItem(i))) run(false);   // fill in quietly the first time
  return host;
}

// Keeps a copy of the product photo in the app; falls back to the web address if the copy isn't allowed.
async function photoFromUrl(url) {
  if (!url) return "";
  try {
    const r = await fetch(url);
    if (!r.ok) throw 0;
    const b = await r.blob();
    return await compressImage(new File([b], "product.jpg", { type: b.type || "image/jpeg" })) || url;
  } catch (e) { return /^https:\/\//.test(url) ? url : ""; }
}
// Opens the camera and resolves with the barcode number (or null).
function scanBarcode() {
  return new Promise(res => {
    const s = openSheet("Scan a barcode");
    let stream = null, done = false, timer = 0;
    const stop = () => { clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const finish = v => { if (done) return; done = true; stop(); s.close(); res(v); };
    s.onclose = () => { if (!done) { done = true; stop(); res(null); } };
    let det = null;
    try { if ("BarcodeDetector" in window) det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }); } catch (e) { det = null; }
    const video = h("video", { class: "bc-video", playsinline: "", muted: "", autoplay: "" });
    video.muted = true;
    const msg = h("p", { class: "lmeta", text: det ? "Point the camera at the barcode. It reads by itself." : "This browser can't read barcodes with the camera. Type the numbers under the barcode instead." });
    const manual = h("input", { inputmode: "numeric", maxlength: "14", placeholder: "Numbers under the barcode", "aria-label": "Barcode number", enterkeyhint: "search" });
    const go = () => { const v = manual.value.replace(/\D/g, ""); if (v.length >= 8) finish(v); else toast("Type all the numbers under the barcode"); };
    manual.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    put(s.body,
      det ? h("div", { class: "bc-wrap" }, video, h("div", { class: "bc-aim" })) : null,
      msg,
      h("div", { class: "cookin" }, manual, h("button", { class: "btn primary", type: "button", text: "Look up", onclick: go })),
      det ? h("button", { class: "btn block", type: "button", style: "margin-top:8px", text: "📸 Take a photo of it instead", onclick: fromPhoto }) : null);
    async function fromPhoto() {
      const f = await pickImage(true);
      if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const codes = await det.detect(bmp);
        const c = codes.find(x => /^\d{8,14}$/.test(x.rawValue));
        if (c) finish(c.rawValue); else toast("No barcode found in that photo. Get closer and try again.");
      } catch (e) { toast("Couldn't read that photo"); }
    }
    if (!det) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "The camera isn't available here. Use a photo or type the numbers."; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async st => {
        if (done) { st.getTracks().forEach(t => t.stop()); return; }
        stream = st; video.srcObject = st;
        try { await video.play(); } catch (e) {}
        const tick = async () => {
          if (done) return;
          try {
            if (video.readyState >= 2) {
              const codes = await det.detect(video);
              const c = codes.find(x => /^\d{8,14}$/.test(x.rawValue));
              if (c) { try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} return finish(c.rawValue); }
            }
          } catch (e) {}
          timer = setTimeout(tick, 200);
        };
        tick();
      })
      .catch(() => { msg.textContent = "Allow the camera for this site to scan, or use a photo or the numbers."; });
  });
}
// Scan menu → Barcode: finds it in your items, or starts a new item with the name and photo filled in.
async function barcodeFlow() {
  const code = await scanBarcode();
  if (!code) return;
  const u = normUpc(code);
  const hits = S.inventory.filter(i => i.upc && normUpc(i.upc) === u);
  if (hits.length) {
    const s = openSheet("Found it");
    put(s.body,
      hits.map(i => h("div", { class: "sr" },
        thumbEl(i.image, "thumb"),
        h("div", { class: "sr-main" }, h("div", { class: "sn", text: i.name }),
          h("div", { class: "lmeta", text: [i.store, aisleLabel(i.aisle), priceText(i)].filter(Boolean).join(" · ") }),
          h("div", { class: "actions", style: "margin-top:6px" },
            h("button", { class: "btn", type: "button", text: "Edit", onclick: () => { s.close(); openEdit(i); } }),
            h("button", { class: "btn green", type: "button", text: "Add to list", onclick: () => { s.close(); addToList(i); } }))))),
      h("button", { class: "btn block", type: "button", style: "margin-top:10px", text: "＋ Save it at another store", onclick: () => {
        s.close(); openNewItem("", hits[0].name, { upc: u, image: hits[0].image || "" });
      } }));
    return;
  }
  const p = progressSheet("Looking it up");
  p.set("Checking the free product database…");
  const info = await lookupBarcode(code);
  let image = "";
  if (info && info.image) { p.set("Getting the photo…"); image = await photoFromUrl(info.image); }
  p.close();
  openNewItem(lsGet("lastStore") || "", info ? info.name : "", { upc: u, image,
    note: info ? "Found in the free product database. Check the name, then add the aisle and price." : "This barcode isn't in the product database. Type the name and snap a photo; the app remembers the barcode next time." });
}

/* ---------- price tags ---------- */
// Picks the price off a shelf tag: the biggest number with cents, skipping unit prices ("$0.21 per oz"); understands "2/$5".
function priceCandidates(res) {
  const lines = res && res.lines && res.lines.length ? res.lines : String(res && res.text || "").split(/\r?\n/).map(t => ({ text: t, h: 0 }));
  const out = [];
  const unitLine = /\b(per|unit|oz|lb|lbs|ct|fl|qt|pt|gal|kg|ml)\b|\/\s*(oz|lb|ct|ea)|¢/i;
  const perLbLine = /(\/|\bper\b)\s*(lb|pound)|\blb\b\s*$/i;
  const maxH = Math.max(0, ...lines.map(l => l.h || 0));
  for (const ln of lines) {
    const t = String(ln.text || ""), hgt = ln.h || 10;
    const perLb = perLbLine.test(t) && !/unit/i.test(t) && (!maxH || (ln.h || 0) >= maxH * 0.7);   // "$2.49 /lb" in big print: the item is sold by weight
    const unit = unitLine.test(t) && !perLb;
    let m;
    const multi = /(\d{1,2})\s*(?:\/\s*\$|for\s*\$?)\s*(\d{1,3}(?:[.,]\d{2})?)/ig;
    while ((m = multi.exec(t))) {
      const n = +m[1], tot = parseFloat(m[2].replace(",", "."));
      if (n >= 2 && n <= 10 && tot > 0 && tot < 500) out.push({ price: (tot / n).toFixed(2), label: `$${(tot / n).toFixed(2)} each (${n} for $${tot.toFixed(2)})`, score: hgt * 1.15 });
    }
    const dec = /(\$?)\s*(\d{1,3})[.,](\d{2})(?!\d)/g;
    while ((m = dec.exec(t))) {
      const v = `${+m[2]}.${m[3]}`, val = parseFloat(v);
      if (!(val > 0) || val > 999) continue;
      out.push({ price: v, label: `$${v}${perLb ? "/lb" : ""}`, per: perLb ? "lb" : "", score: hgt * (unit ? 0.3 : 1) * (m[1] ? 1.2 : 1) });
    }
    const sup = /\$\s*(\d{1,2})\s?(\d{2})(?![\d.,])/g;   // big dollars with small raised cents: "$2 99"
    while ((m = sup.exec(t))) { const v = `${+m[1]}.${m[2]}`; out.push({ price: v, label: `$${v}${perLb ? "/lb" : ""}`, per: perLb ? "lb" : "", score: hgt * 0.9 * (unit ? 0.3 : 1) }); }
  }
  const best = new Map();
  out.forEach(c => { if (!best.has(c.price) || best.get(c.price).score < c.score) best.set(c.price, c); });
  return [...best.values()].sort((a, b) => b.score - a.score);
}
async function readPriceTag() {
  const file = await pickImage(true);
  if (!file) return null;
  const res = await freeRead(file, { engines: [2, 3], overlay: true, title: "Reading the price tag" });
  if (!res) { toast("Couldn't read the tag. Type the price instead."); return null; }
  const c = priceCandidates(res);
  if (!c.length) { toast("No price found on that tag. Type it instead."); return null; }
  if (c.length === 1 || c[0].score >= c[1].score * 1.6) return { price: c[0].price, per: c[0].per || "" };
  const pick = await choose("Which price?", "The tag has more than one number. Tap the item's price.",
    [...c.slice(0, 4).map((x, i) => ({ label: x.label, value: x, cls: i ? "" : "primary" })), { label: "Cancel", value: null }]);
  return pick ? { price: pick.price, per: pick.per || "" } : null;
}


/* ---------- which items are sold by the pound ---------- */
// Produce, meat, deli and seafood are usually weighed; you choose. Items packed in the store (deli, fresh chicken)
// have a package price that changes each time, so leave those as "each" and update them from a receipt.
function perLbHelper(store) {
  const weighed = new Set(["produce", "meat", "seafood", "deli"]);
  const items = itemsIn(store).slice().sort(byName);
  const rows = items.map(i => { const g = topGroup(groupScores(i.name)); return { item: i, on: isPerLb(i), likely: weighed.has(g) }; })
    .sort((a, b) => (b.on - a.on) || (b.likely - a.likely) || byName(a.item, b.item));
  const s = openSheet(`Sold by the pound · ${store}`);
  const draw = () => {
    s.body.textContent = "";
    const changes = rows.filter(r => r.on !== isPerLb(r.item)).length;
    put(s.body,
      h("p", { class: "msg", text: "Tick what's priced per pound, like loose produce and meat from the counter. Your list then estimates the cost from the weight, and you can change the weight on the list." }),
      !S.admin ? h("p", { class: "lmeta", text: "Changes are saved just for you, like your other edits." }) : null,
      rows.map(r => h("label", { class: "plan-row" },
        h("input", { type: "checkbox", checked: r.on, onchange: e => { r.on = e.target.checked; draw(); } }),
        h("div", { style: "flex:1;min-width:0" }, h("b", { text: r.item.name }),
          h("div", { class: "lmeta", text: [priceNum(r.item.price) != null ? money(priceNum(r.item.price)) + (r.on ? "/lb" : "") : "no price", r.likely && !isPerLb(r.item) ? "often sold by weight" : ""].filter(Boolean).join(" · ") })))),
      h("div", { class: "stickybar" }, h("button", { class: "btn green block", type: "button", disabled: !changes,
        text: changes ? `Save ${changes} change${changes === 1 ? "" : "s"}` : "No changes", onclick: save })));
  };
  async function save() {
    const pick = rows.filter(r => r.on !== isPerLb(r.item));
    const ops = [], ch = new Map();
    pick.forEach(r => {
      const per = r.on ? "lb" : "";
      if (S.admin) { const data = { per, updatedAt: Date.now(), updatedBy: uid() }; ops.push(b => b.update(sdoc("inventory", r.item.id), data)); ch.set(r.item.id, { item: r.item, data }); }
      else ops.push(b => b.set(mineDoc(r.item.id), { name: clip(r.item.name, 120), store: clip(r.item.store, 80), aisle: clip(r.item.aisle, 40), price: cleanPrice(r.item.price), per, updatedAt: Date.now(), ...(r.item._own ? { own: true } : {}) }, { merge: true }));
    });
    s.close();
    try { await commitOps(ops); } catch (e) { return fail(e); }
    syncListsBulk(ch);
    toast(`Saved ${pick.length} item${pick.length === 1 ? "" : "s"}`);
  }
  draw();
}

/* ---------- receipts → prices ---------- */
const RECEIPT_SKIP = /(sub\s*total|subtotal|\btotal\b|\btax\b|change due|\bchange\b|\bcash\b|visa|master\s*card|amex|discover|debit|credit|balance|\btend\b|tendered|payment|\bauth|approv|\bref\b|reference|trans\b|savings|you saved|\bsaved\b|coupon|discount|bottle dep|deposit|points|member|rewards|items sold|number of items|# ?items|store #|\bst#|\btel\b|phone|thank|return|survey|cashier|register|\blane\b|\bop#|\bte#|\btr#|\bvoid\b|amount|\busd\b|account|card type|entry|\bdate\b)/i;
// Department headings printed between items (Market Basket and others). They're not items.
const RECEIPT_HEAD = /^(deli( dept)?|fresh poultry|poultry|grocery|juice|milk|dairy|markets kitchen|kitchen|prepackages?|produce( dept)?|self service aisle|tax grocery|bottle deposit|frozen( food)?s?|meat( dept)?|beef|pork|seafood|fish|bakery|bread|beer|wine|hba|health ?& ?beauty|general merchandise|gm|floral|snacks?|beverages?|sale)$/i;
const RANDOM_WEIGHT = /^2\d{10,12}$/;   // store-packed by weight: the price is in the barcode, so it changes package to package
// Reads item lines, prices, weights ("1.370 lb @ $2.49/lb"), multi-buys ("2 @ 2/9.00"), counts ("4 @ 1.25")
// and items packed in the store (barcodes starting with 2).
function parseReceipt(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const key = s => norm(s).replace(/[^a-z0-9]/g, "");
  let store = null;
  for (const l of lines.slice(0, 10)) {
    const k = key(l);
    store = storeNames().find(n => { const nk = key(n); return nk.length >= 3 && k.includes(nk); }) || null;
    if (store) break;
  }
  const rows = [];
  let pending = null, last = null;   // a count/deal/weight line printed before its item; the item line we just read
  const fits = (row, total) => Math.abs(parseFloat(row.total) - total) < 0.035;
  const applyTo = (row, info) => {
    if (info.lbs) { row.per = "lb"; row.lbs = info.lbs; row.price = info.unit.toFixed(2); row.qty = 1; }
    else { row.price = info.unit.toFixed(2); row.qty = info.n; if (info.deal) row.deal = info.deal; }
  };
  for (const raw of lines) {
    let l = raw, m;
    // weight line: "1.370 lb @ $2.49/lb" (Walmart prints "2.040 lb @ 1 lb /0.58")
    if ((m = l.match(/^(\d+(?:\.\d+)?)\s*(?:lb|lbs|#)\s*@\s*\$?\s*(\d+[.,]\d{2})\s*\/\s*(?:lb|lbs|#)/i)) || (m = l.match(/^(\d+(?:\.\d+)?)\s*lb\s*@\s*1\s*lb\s*\/\s*\$?(\d+[.,]\d{2})/i))) {
      const info = { lbs: +m[1], unit: parseFloat(m[2].replace(",", ".")) };
      if (last && fits(last, info.lbs * info.unit)) applyTo(last, info); else pending = info;
      last = null; continue;
    }
    // multi-buy: "2 @ 2/9.00" = two at 2 for $9.00; plain count: "4 @ 1.25"
    if ((m = l.match(/^(\d{1,3})\s*@\s*(\d{1,2})\s*\/\s*\$?(\d{1,4}[.,]\d{2})\s*$/)) || (m = l.match(/^(\d{1,3})\s*@\s*\$?(\d{1,4}[.,]\d{2})\s*$/))) {
      const n = +m[1], deal = m.length === 4 ? { size: +m[2], total: parseFloat(m[3].replace(",", ".")) } : null;
      const unit = deal ? deal.total / deal.size : parseFloat(m[2].replace(",", "."));
      const info = { n, unit, deal: deal && deal.size > 1 ? `${deal.size} for $${deal.total.toFixed(2)}` : "" };
      if (last && fits(last, n * unit)) applyTo(last, info); else pending = info;
      last = null; continue;
    }
    if (RECEIPT_HEAD.test(l)) { last = null; continue; }
    if (RECEIPT_SKIP.test(l)) { last = null; continue; }
    // "BANANAS 2.31 lb @ 0.69/lb 1.59" all on one line
    const inline = l.match(/^(.*?[A-Za-z].*?)\s+(\d+(?:\.\d+)?)\s*(?:lb|lbs)\s*@\s*\$?(\d+[.,]\d{2})\s*\/\s*lb\s+\$?(\d{1,4}[.,]\d{2})\b/i);
    m = inline ? null : l.match(/^(.*?[A-Za-z].*?)\s+\$?(-?\d{1,4}[.,]\d{2})\s*(?:[A-Z]{1,2}|\*)?\s*$/);
    if (!inline && !m) {
      // a wrapped name ("SMITH TERIYAKI" / "TENDER")
      if (last && /^[A-Za-z][A-Za-z0-9 &'./%-]{1,24}$/.test(l)) last.text = clip(last.text + " " + l, 80);
      else last = null;
      continue;
    }
    let desc = inline ? inline[1] : m[1];
    const total = parseFloat((inline ? inline[4] : m[2]).replace(",", "."));
    if (!(total > 0) || total > 500) { last = null; continue; }
    const code = (desc.match(/^(\d{4,})\s+/) || [])[1] || "";
    desc = desc.replace(/^\d{4,}\s+/, "").replace(/\s\d{6,}\b/g, " ").replace(/\s(?:KF|FN|NF|TF|TX|F|N|X|T|O|B|E)$/, "").replace(/\s+/g, " ").trim();
    if ((desc.match(/[a-z]/gi) || []).length < 2) { last = null; continue; }
    const row = { text: clip(desc, 80), price: total.toFixed(2), total: total.toFixed(2), qty: 1, code };
    if (RANDOM_WEIGHT.test(code)) row.storePacked = true;
    if (inline) applyTo(row, { lbs: +inline[2], unit: parseFloat(inline[3].replace(",", ".")) });
    else if (pending && (pending.lbs ? fits(row, pending.lbs * pending.unit) : fits(row, pending.n * pending.unit))) applyTo(row, pending);
    pending = null;
    rows.push(row);
    last = row;
  }
  return { store, rows: rows.slice(0, 80) };
}
async function receiptFlow() {
  const how = await choose("Scan a receipt", "Lay the receipt flat and take the photo straight on. Long receipt? Fold it and do it in two photos.\n\nPrices on your items are updated from it. Nothing is changed until you check and save.",
    [{ label: "📸 Take photo", value: "cam", cls: "primary" }, { label: "🖼️ Choose photo", value: "lib" }, { label: "Cancel", value: null }]);
  if (!how) return;
  const file = await pickImage(how === "cam");
  if (!file) return;
  const res = await freeRead(file, { engines: [2, 3], table: true, ladder: [[2000, 0.8], [1800, 0.78], [1600, 0.76], [1280, 0.72]], title: "Reading your receipt" });
  if (!res) { await choose("Couldn't read the receipt", "The free reader couldn't be reached or is busy. Try again in a minute.", [{ label: "OK", value: 1 }]); return; }
  const { store, rows } = parseReceipt(res.text);
  if (!rows.length) { await choose("No prices found", "Couldn't find item lines with prices. Try a straighter, closer photo in good light.", [{ label: "OK", value: 1 }]); return; }
  receiptReview(rows, store);
}
function receiptReview(found, storeHint) {
  const names = storeNames();
  let store = storeHint && names.includes(storeHint) ? storeHint : (lsGet("lastStore") || "");
  if (store && !names.includes(store)) store = "";
  let tellAdmin = false;
  const rows = found.map(f => ({ text: f.text, price: f.price, qty: f.qty || 1, per: f.per || "", lbs: f.lbs || 0, deal: f.deal || "", storePacked: !!f.storePacked,
    total: f.total || f.price, match: null, picked: false, on: false }));
  const changed = r => !!r.match && (priceNum(r.match.price) !== priceNum(r.price) || (r.per === "lb") !== isPerLb(r.match));
  const matchAll = () => rows.forEach(r => {
    if (r.picked) return;
    const m = store ? preferStore(localMatch(r.text, store), store) : null;
    r.match = m && m.store === store ? m : null;
    r.on = changed(r);
  });
  // two receipt lines can't both update one item (e.g. two sizes of the same juice): only the first counts
  const dupOf = r => r.match && rows.find(x => x !== r && x.match && x.match.id === r.match.id && x.on && rows.indexOf(x) < rows.indexOf(r));
  const dedupe = () => rows.forEach(r => { if (r.on && dupOf(r)) r.on = false; });
  matchAll(); dedupe();
  const s = openSheet("Update prices");
  const draw = () => {
    s.body.textContent = "";
    const n = rows.filter(r => r.on && r.match).length;
    const sel = h("select", { "aria-label": "Store", onchange: e => { store = e.target.value; rows.forEach(r => { r.picked = false; }); matchAll(); dedupe(); draw(); } },
      h("option", { value: "", text: "Which store is this from?", disabled: true, selected: !store }),
      names.map(nm => h("option", { value: nm, text: nm, selected: nm === store })));
    put(s.body,
      h("p", { class: "msg", text: `Found ${rows.length} line${rows.length === 1 ? "" : "s"} with prices. ${rows.filter(r => r.match).length} matched your items.` }),
      h("label", { class: "fl" }, h("span", { text: "Store" }), sel),
      rows.map(r => {
        const m = r.match, old = m ? priceNum(m.price) : null, same = m && !changed(r);
        const how = r.per ? `${fmtLbs(r.lbs)} lb @ $${r.price}/lb = $${r.total}` : r.deal ? `${r.qty} @ ${r.deal} → $${r.price} each` : r.qty > 1 ? `${r.qty} @ $${r.price} each` : "";
        return h("div", { class: "sr" + (r.on ? "" : " off") },
          h("input", { type: "checkbox", class: "sr-on", checked: r.on, disabled: !m, "aria-label": "Update " + r.text, onchange: e => { r.on = e.target.checked; if (r.on) rows.forEach(x => { if (x !== r && x.on && x.match && r.match && x.match.id === r.match.id) x.on = false; }); draw(); } }),
          m ? thumbEl(m.image, "thumb") : h("div", { class: "thumb ph", text: "🧾" }),
          h("div", { class: "sr-main" },
            h("div", { class: "rc-line" }, h("span", { class: "rc-desc", text: r.text }), h("b", { text: "$" + r.total })),
            how ? h("div", { class: "lmeta", text: how }) : null,
            r.storePacked ? h("div", { class: "lmeta", text: "⚖️ Weighed and packed in the store, so the price changes with each package." }) : null,
            m && dupOf(r) ? h("div", { class: "sr-status sr-warn", text: `Same item as a line above (${m.name}). Tap “Change match” if it's a different size.` }) :
            m ? h("div", { class: "sr-status " + (same ? "sr-ok" : "sr-new") }, (same ? "✓ " : "→ "), h("b", { text: m.name }),
                  same ? " · price is up to date" : ` · ${old != null ? priceText(m) : "no price"} → $${r.price}${r.per ? "/lb" : ""}`)
              : h("div", { class: "sr-status sr-warn", text: "Not matched to an item" }),
            h("div", { class: "sr-tools" },
              h("button", { class: "link", type: "button", text: m ? "Change match" : "Find a match", onclick: async () => {
                const it = await pickItem(r.text, store);
                if (it === undefined) return;
                r.match = it; r.picked = true; r.on = changed(r); dedupe(); draw();
              } }))));
      }),
      !S.admin && n ? h("label", { class: "check" }, h("input", { type: "checkbox", checked: tellAdmin, onchange: e => { tellAdmin = e.target.checked; } }), "Also send these prices to the admin") : null,
      h("button", { class: "btn green block", type: "button", style: "margin-top:8px", disabled: !n, text: n ? `Update ${n} price${n === 1 ? "" : "s"}` : "Nothing to update", onclick: save }),
      h("p", { class: "note", text: "Read by OCR.space's free text reader (it doesn't keep your photo). Matches you fix are remembered for the next receipt." }));
  };
  async function save() {
    const pick = rows.filter(r => r.on && r.match);
    if (!pick.length) return;
    const seen = rows.filter(r => r.match && !dupOf(r) && (r.on || !changed(r)));
    const jumps = await recordPrices(seen.map(r => ({ name: r.match.name, store, price: r.price, per: r.per === "lb" ? "lb" : (isPerLb(r.match) ? "lb" : ""), src: "receipt",
      was: r.match.store === store ? r.match.price : "", wasAt: r.match.updatedAt || r.match.createdAt })));
    learnAliases(rows.filter(r => r.match).map(r => [r.text, r.match]));
    lsSet("lastStore", store);
    const ops = [], changes = new Map();
    for (const r of pick) {
      const it = r.match, price = cleanPrice(r.price);
      if (S.admin) {
        const data = { price, updatedAt: Date.now(), updatedBy: uid() };
        if ((r.per === "lb") !== isPerLb(it)) data.per = r.per === "lb" ? "lb" : "";
        ops.push(b => b.update(sdoc("inventory", it.id), data));
        changes.set(it.id, { item: it, data });
      } else {
        const data = { name: clip(it.name, 120), store: clip(it.store, 80), aisle: clip(it.aisle, 40), price, per: r.per === "lb" ? "lb" : (isPerLb(it) ? "lb" : ""), updatedAt: Date.now() };
        if (it._own) data.own = true;
        ops.push(b => b.set(mineDoc(it.id), data, { merge: true }));
      }
    }
    s.close();
    const p = progressSheet("Updating prices");
    try { await commitOps(ops, k => p.set(`Saving… ${k} of ${ops.length}`)); } catch (e) { p.close(); return fail(e); }
    p.close();
    syncListsBulk(changes);
    let sent = 0;
    if (!S.admin && tellAdmin) {
      for (const r of pick.filter(r => !r.match._own).slice(0, 25)) {
        const it = r.match;
        const req = { kind: "change", itemId: it.id, name: clip(it.name, 120), store: clip(it.store, 80), aisle: clip(it.aisle, 40), price: cleanPrice(r.price), image: "", per: r.per === "lb" ? "lb" : (isPerLb(it) ? "lb" : ""),
          note: "Price from a receipt", by: uid(), byName: clip(myName(), 80), createdAt: Date.now() };
        if (S.user.email) req.byEmail = S.user.email;
        try { await addDoc(collection(db, "requests"), req); sent++; } catch (e) { console.warn(e); }
      }
    }
    jumpsToast(`Updated ${pick.length} price${pick.length === 1 ? "" : "s"}` + (S.admin ? "" : " for you") + (sent ? ` · sent ${sent} to the admin` : ""), jumps);
  }
  draw();
}
// Pick one of your items (resolves with the item, null for "no match", or undefined if closed).
function pickItem(query, store) {
  return new Promise(res => {
    let done = false;
    const ps = openSheet("Choose the item");
    const fin = v => { if (done) return; done = true; res(v); ps.close(); };
    ps.onclose = () => { if (!done) { done = true; res(undefined); } };
    const q = h("input", { type: "search", placeholder: "🔍 Search items…", value: query || "", "aria-label": "Search items" });
    const list = h("div", { class: "pick-list" });
    const fill = () => {
      const t = norm(q.value), tw = termsOf(q.value);
      const score = i => { const n = norm(i.name); if (!t) return 1; if (n.includes(t) || t.includes(n)) return 3; const w = new Set(termsOf(i.name)); return tw.filter(x => w.has(x)).length ? 2 : 0; };
      const hits = S.inventory.map(i => [i, score(i)]).filter(x => x[1] > 0)
        .sort((a, b) => (b[0].store === store) - (a[0].store === store) || b[1] - a[1] || byName(a[0], b[0])).slice(0, 40).map(x => x[0]);
      list.textContent = "";
      if (!hits.length) list.append(h("p", { class: "lmeta", text: "No items match. Try a shorter word." }));
      hits.forEach(i => list.append(h("button", { class: "srow", type: "button", onclick: () => fin(i) },
        thumbEl(i.image, "thumb"),
        h("div", { style: "flex:1;text-align:left" }, h("div", { class: "sn", text: i.name }),
          h("div", { class: "sc", text: [i.store, aisleLabel(i.aisle), priceText(i)].filter(Boolean).join(" · ") })))));
    };
    q.addEventListener("input", fill);
    ps.body.append(q, list, h("button", { class: "btn block", type: "button", style: "margin-top:10px", text: "Not one of my items", onclick: () => fin(null) }));
    fill();
  });
}

/* =====================================================================
   COOK: "what can I make with what I have?"
   Type, say or photograph your ingredients → the AI suggests meals →
   tap one for the full recipe → add anything missing to the shopping list.
   ===================================================================== */
const MEAL_TYPES = [["any", "Anything"], ["snack", "Snacks"], ["light meal", "Light meals"], ["sandwich", "Sandwiches"], ["dinner", "Dinners"], ["breakfast", "Breakfast"], ["dessert", "Desserts"]];
// How long: any number of minutes from 5 to 240, or 0 for no limit.
const TIME_MIN = 5, TIME_MAX = 240;
const fmtMins = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? " " + (m % 60) + " min" : ""}`;
const timeLabel = m => !m ? "No limit" : `Up to ${fmtMins(m)}`;
const COMMON_EXTRAS = ["Salt", "Pepper", "Olive Oil", "Butter", "Garlic", "Onion", "Eggs", "Milk", "Flour", "Sugar", "Soy Sauce", "Cheese"];
const C = {
  ings: [], type: "any", time: 0, avoid: "", ideas: null, busy: false, listening: false, useList: true, useBought: true, usePantry: true
};
function loadCookPrefs() {
  try {
    const p = JSON.parse(lsGet("cookPrefs") || "{}");
    if (Array.isArray(p.ings)) C.ings = p.ings.slice(0, 40);
    ["type", "avoid"].forEach(k => { if (typeof p[k] === "string") C[k] = p[k]; });
    ["useList", "useBought", "usePantry"].forEach(k => { if (typeof p[k] === "boolean") C[k] = p[k]; });
    if (Number.isInteger(p.time) && (p.time === 0 || (p.time >= TIME_MIN && p.time <= TIME_MAX))) C.time = p.time;
  } catch (e) {}
}
function saveCookPrefs() {
  lsSet("cookPrefs", JSON.stringify({ ings: C.ings, type: C.type, time: C.time, avoid: C.avoid, useList: C.useList, useBought: C.useBought, usePantry: C.usePantry }));
}
// "chicken, lettuce and 2 potatoes" → ["Chicken", "Lettuce", "2 potatoes"]
function splitIngredients(text) {
  return String(text || "").split(/,|;|\n|\band\b|\bplus\b|&/i)
    .map(t => t.replace(/^\s*(i have|we have|got|some|a few|a|an)\s+/i, "").trim())
    .filter(t => t && t.length <= 60)
    .map(t => t.charAt(0).toUpperCase() + t.slice(1));
}
function addIngredients(list) {
  let added = 0;
  for (const t of list) {
    if (C.ings.length >= 40) break;
    if (!C.ings.some(x => norm(x) === norm(t))) { C.ings.push(clip(t, 60)); added++; }
  }
  if (added) { C.ideas = null; saveCookPrefs(); }
  renderCook();
  return added;
}

let cookRecognizer = null;
function startVoice(input) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {   // e.g. some phones: the keyboard's own mic works everywhere
    input.focus();
    toast("Tap the 🎤 on your keyboard and say what you have");
    return;
  }
  if (C.listening && cookRecognizer) { cookRecognizer.stop(); return; }
  const r = new SR();
  cookRecognizer = r;
  r.lang = navigator.language || "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = e => {
    const said = Array.from(e.results).map(x => x[0].transcript).join(", ");
    const n = addIngredients(splitIngredients(said));
    toast(n ? `Added ${n} ingredient${n === 1 ? "" : "s"}` : "Didn't catch any ingredients. Try again.");
  };
  r.onerror = e => { if (e.error === "not-allowed") toast("Allow the microphone for this site to use voice."); else if (e.error !== "aborted" && e.error !== "no-speech") toast("Couldn't hear that. Try again."); };
  r.onend = () => { C.listening = false; renderCook(); };
  try { r.start(); C.listening = true; renderCook(); } catch (e) { C.listening = false; toast("Couldn't start the microphone."); }
}

async function ingredientsFromPhoto() {
  const how = await choose("Photo of your food", "Take a photo of what you have: the fridge, the counter, or groceries on the table.",
    [{ label: "📸 Take photo", value: "cam", cls: "primary" }, { label: "🖼️ Choose photo", value: "lib" }, { label: "Cancel", value: null }]);
  if (!how) return;
  const file = await pickImage(how === "cam");
  if (!file) return;
  const p = progressSheet("Looking at your food");
  try {
    p.set("Getting the photo ready…");
    const photo = await compressImage(file, { ladder: [[1024, 0.8], [800, 0.75]], limit: 900000, raw: true });  // smaller photo = cheaper to read
    p.set("Spotting ingredients…");
    const res = await aiJSON([
      "List the food ingredients you can see in this photo that someone could cook with. Use simple everyday names in Title Case (e.g. \"Chicken Breast\", \"Lettuce\", \"Mushrooms\"). Ignore packaging you can't identify, non-food items and condiments you can't read. Return only JSON: {\"ingredients\": [string]}",
      { inlineData: { mimeType: "image/jpeg", data: photo.split(",")[1] } }], t => p.set(t), AI_MODELS);
    p.close();
    const found = (Array.isArray(res.ingredients) ? res.ingredients : []).map(x => clip(x, 60)).filter(Boolean);
    if (!found.length) { await choose("Nothing spotted", "I couldn't pick out any food in that photo. Try a closer, brighter photo, or type what you have.", [{ label: "OK", value: 1 }]); return; }
    confirmFound(found);
  } catch (e) {
    p.close();
    console.error("food photo", e);
    await choose("Couldn't look at the photo", `${scanErrorText(e)}\n\nDetails (for your developer): ${clip([e && e.code, e && e.message].filter(Boolean).join(" · "), 300)}`, [{ label: "OK", value: 1 }]);
  }
}
// Photos can be wrong, so the person ticks what's really there before it's used.
function confirmFound(found) {
  const pick = new Map(found.map(f => [f, true]));
  const s = openSheet("Is this right?");
  const body = h("div");
  const draw = () => {
    body.textContent = "";
    body.append(h("p", { class: "msg", text: "Untick anything that's wrong. You can add more by typing after." }),
      h("div", { class: "pickchips" }, found.map(f => h("button", { type: "button", class: "ichip" + (pick.get(f) ? " on" : ""), "aria-pressed": String(pick.get(f)),
        onclick: () => { pick.set(f, !pick.get(f)); draw(); } }, pick.get(f) ? "✓ " : "", f))),
      h("div", { class: "actions", style: "margin-top:14px" },
        h("button", { class: "btn green block", type: "button", text: "Use these", onclick: () => {
          s.close(); const n = addIngredients(found.filter(f => pick.get(f)));
          if (n) toast(`Added ${n} ingredient${n === 1 ? "" : "s"}`);
        } })));
  };
  s.body.append(body);
  draw();
}

function cookCacheKey() {
  return "cook4:" + [allIngredients().map(norm).sort().join("|"), C.type, C.time, norm(C.avoid), useSoon().map(p => norm(p.name)).join("|")].join("#");
}
const RECIPE_RULES = [
  "List EVERY ingredient the recipe uses, including salt, pepper, oils, butter, spices, herbs, sauces and seasonings, each with an amount.",
  'For each ingredient set "have": true only if it is in their list (or clearly the same thing, e.g. "chicken" covers "chicken breast"); otherwise "have": false.',
  "Keep recipes simple and practical for a home kitchen, with clear numbered steps that include times and heat levels.",
  "For any meat, poultry, fish or egg dish, the steps must include the safe internal temperature (USDA: poultry 165°F, ground meat 160°F, whole cuts of beef/pork/lamb 145°F with a 3 minute rest, fish 145°F)."
];
const RECIPE_JSON = '{"name": string, "type": "snack"|"light meal"|"sandwich"|"dinner"|"breakfast"|"dessert", "minutes": number (hands-on prep plus cooking time ONLY; never include marinating, chilling, rising, soaking, defrosting or other waiting), "waitMinutes": number (total waiting time like marinating, chilling, rising or soaking; 0 if none), "waitNote": string or null (short plan-ahead note, e.g. "Marinate at least 2 hours"), "serves": number, "summary": string (one short sentence), "ingredients": [{"item": string, "amount": string, "have": boolean}], "steps": [string]}';
const avoidRule = () => C.avoid.trim() ? `STRICT: never include these (allergies or dislikes): ${C.avoid.trim()}. Also avoid anything that contains them.` : "";
function recipePrompt(fresh) {
  const type = C.type === "any" ? "a mix of snacks, light meals, sandwiches, dinners, breakfasts and desserts" : `only ${C.type} ideas`;
  return [
    "You are a friendly home cook helping a family decide what to make.",
    `Ingredients they have, or are already buying this week: ${allIngredients().join(", ")}.`,
    "Do not assume they have anything else, not even salt or oil: anything not in their list is something they would need to get.",
    "Prefer ideas that use more of what they have and need as few extra items as possible.",
    (C.usePantry && useSoon().length) ? `These need to be used up in the next day or two, so build most ideas around them: ${useSoon().map(p => foodName(p.name)).slice(0, 8).join(", ")}.` : "",
    C.time ? `Each idea's cooking time (hands-on prep plus cooking, the "minutes" field) must be ${C.time} minutes or less. Waiting time such as marinating or chilling does NOT count toward this limit, but report it in "waitMinutes".` : "",
    avoidRule(),
    `Suggest 6 different ideas: ${type}.`,
    fresh ? "Give different ideas from the most obvious ones." : "",
    ...RECIPE_RULES,
    `Return only JSON: {"ideas": [${RECIPE_JSON}]}`
  ].filter(Boolean).join("\n");
}
async function findMeals(fresh) {
  if (!allIngredients().length) { toast("Add at least one ingredient"); return; }
  if (C.busy) return;
  const key = cookCacheKey();
  if (!fresh) {   // same ingredients and filters as before? Show the saved ideas instead of asking the AI again.
    try { const hit = JSON.parse(localStorage.getItem(lsKey(key)) || "null"); if (hit && Array.isArray(hit.ideas) && Date.now() - hit.at < 7 * 864e5) { C.ideas = hit.ideas; C.fromCache = true; renderCook(); return; } } catch (e) {}
  }
  C.busy = true; renderCook();
  const p = progressSheet("Finding meals");
  try {
    p.set("Thinking of meals…");
    const res = await aiJSON([recipePrompt(fresh)], t => p.set(t), RECIPE_MODELS);
    const ideas = (Array.isArray(res.ideas) ? res.ideas : []).slice(0, 8).map(cleanIdea).filter(Boolean);
    if (!ideas.length) throw new Error("no ideas");
    C.ideas = ideas; C.fromCache = false;
    try { localStorage.setItem(lsKey(key), JSON.stringify({ at: Date.now(), ideas })); } catch (e) {}
  } catch (e) {
    console.error("recipes", e);
    p.close(); C.busy = false; renderCook();
    await choose("Couldn't find meals", `${scanErrorText(e)}\n\nDetails (for your developer): ${clip([e && e.code, e && e.message].filter(Boolean).join(" · "), 300)}`, [{ label: "OK", value: 1 }]);
    return;
  }
  p.close(); C.busy = false; renderCook();
  const r = $("#cookResults"); if (r) r.scrollIntoView({ behavior: "smooth", block: "start" });
}
const waitText = r => !r.waitMinutes ? "" : (r.waitNote || `${fmtMins(r.waitMinutes)} waiting`);
const iHave = item => C.ings.some(x => { const a = norm(x), b = norm(item); return a && b && (a === b || b.includes(a) || a.includes(b)); });
function cleanIdea(x) {
  if (!x || !x.name) return null;
  const ingredients = (Array.isArray(x.ingredients) ? x.ingredients : []).slice(0, 30).map(i => typeof i === "string"
      ? { item: clip(i, 80), amount: "", have: haveIt(i) }
      : { item: clip(i.item, 80), amount: clip(i.amount || "", 40), have: i.have === true || haveIt(i.item || "") })
    .filter(i => i.item);
  return {
    name: clip(x.name, 80), type: clip(x.type || "", 20).toLowerCase(), minutes: Math.max(0, Math.min(600, parseInt(x.minutes, 10) || 0)),
    waitMinutes: Math.max(0, Math.min(4320, parseInt(x.waitMinutes, 10) || 0)), waitNote: clip(x.waitNote || "", 80),
    serves: Math.max(0, Math.min(MAX_PEOPLE, parseInt(x.serves, 10) || 0)), summary: clip(x.summary || "", 200),
    ingredients, missing: ingredients.filter(i => !i.have).map(i => i.item).slice(0, 12),
    uses: ingredients.filter(i => i.have).map(i => i.item).slice(0, 12),
    steps: (Array.isArray(x.steps) ? x.steps : []).map(t => clip(String(t || ""), 400)).filter(Boolean).slice(0, 20)
  };
}

function addMissingToList(names) {
  let n = 0;
  for (const name of names) {
    const match = localMatch(name, lsGet("lastStore") || "");
    if (match) { addToListQuiet(match); n++; continue; }
    addDoc(itemsCol(S.listId), { name: clip(name, 120), aisle: "", price: "", image: "", store: "Other", addedAt: Date.now() + n,
      inCart: false, qty: 1, inventoryId: null, addedBy: uid() }).catch(fail);
    n++;
  }
  toast(`Added ${n} item${n === 1 ? "" : "s"} to ${listName()}`);
}
function addToListQuiet(item) {
  const existing = findOnList(item);
  if (existing) return;
  addDoc(itemsCol(S.listId), {
    name: clip(item.name, 120), aisle: clip(item.aisle, 40), price: cleanPrice(item.price), image: cleanImage(item.image),
    store: clip(item.store, 80) || "Other", addedAt: Date.now(), inCart: false, qty: 1, inventoryId: item.id || null, addedBy: uid(),
    ...(isPerLb(item) ? { per: "lb" } : {})
  }).catch(fail);
}

// The recipe screen doubles as an editor: change servings, swap, remove or add ingredients,
// then "Update recipe" asks the AI to rewrite amounts and steps to match.
async function updateRecipe(base, draft) {
  const prompt = [
    "You are a friendly home cook. Rewrite this recipe to match the person's changes.",
    `Original recipe: ${JSON.stringify({ name: base.name, serves: base.serves, ingredients: base.ingredients.map(i => ({ item: i.item, amount: i.amount })), steps: base.steps })}`,
    `They want it to serve ${draft.serves || base.serves || 2}.`,
    `Use exactly these ingredients (adjust amounts for the servings; you may add only salt, pepper or water if truly needed): ${draft.ingredients.map(i => i.item).join(", ")}.`,
    draft.note ? `Their note: ${draft.note}` : "",
    `Ingredients they have on hand: ${C.ings.join(", ") || "(not given)"}.`,
    "Keep the dish close to the original unless the changes require otherwise; rename it if it's now a different dish.",
    avoidRule(),
    ...RECIPE_RULES,
    `Return only JSON: ${RECIPE_JSON}`
  ].filter(Boolean).join("\n");
  const p = progressSheet("Updating the recipe");
  try {
    const res = await aiJSON([prompt], t => p.set(t), RECIPE_MODELS);
    const r = cleanIdea(res.recipe || res);
    if (!r || !r.steps.length) throw new Error("no json");
    return r;
  } finally { p.close(); }
}

/* ---------- quick swaps: one-for-one ingredients that cook the same way, so no AI is needed ---------- */
// Each group: [ingredient name to use, what it matches in a recipe, how the steps say it, word to use in the steps].
// A swap changes the ingredient and the wording in the steps; a note adds a step when something needs extra care.
const QUICK_SWAPS = [
  { items: [
    ["Ground beef", /^ground beef\b/i, /\bbeef\b(?! (broth|stock))/gi, "beef"], ["Ground turkey", /^ground turkey\b/i, /\bturkey\b/gi, "turkey", "Cook ground turkey until 165°F in the center."],
    ["Ground chicken", /^ground chicken\b/i, /\bchicken\b(?! (broth|stock))/gi, "chicken", "Cook ground chicken until 165°F in the center."],
    ["Ground pork", /^ground pork\b/i, /\bpork\b/gi, "pork", "Cook ground pork until no pink remains (160°F)."],
    ["Plant-based ground", /^plant-based ground/i, /\bplant-based ground\b/gi, "plant-based ground", "Plant-based ground cooks faster than meat; follow its package and don't drain it."]] },
  { note: "Cook chicken until 165°F inside.", items: [["Boneless chicken breasts", /^boneless chicken breasts?$/i], ["Boneless chicken thighs", /^boneless chicken thighs?$/i]] },
  { items: [["Cod fillets", /\bcod\b/i, /\bcod\b/gi, "cod"], ["Haddock fillets", /\bhaddock\b/i, /\bhaddock\b/gi, "haddock"],
    ["Pollock fillets", /\bpollock\b/i, /\bpollock\b/gi, "pollock"], ["Tilapia fillets", /\btilapia\b/i, /\btilapia\b/gi, "tilapia"]] },
  { items: [["Shredded cheddar cheese", /cheddar/i], ["Shredded Monterey Jack cheese", /monterey jack/i], ["Shredded pepper jack cheese", /pepper jack/i],
    ["Shredded Mexican cheese blend", /mexican cheese|^shredded cheese$/i]] },
  { items: [["Mozzarella cheese", /mozzarella/i, /\bmozzarella\b/gi, "mozzarella"], ["Provolone cheese", /provolone/i, /\bprovolone\b/gi, "provolone"]] },
  { items: [["Parmesan cheese", /^parmesan/i, /\bparmesan\b/gi, "Parmesan"], ["Pecorino Romano cheese", /^pecorino/i, /\bpecorino( romano)?\b/gi, "Pecorino"]] },
  { items: [["Sour cream", /^sour cream$/i, /\bsour cream\b/gi, "sour cream"], ["Plain Greek yogurt", /^(plain )?greek yogurt$/i, /\b(greek )?yogurt\b/gi, "Greek yogurt"]] },
  { items: [["Soy sauce", /^soy sauce$/i, /\bsoy sauce\b/gi, "soy sauce"], ["Tamari (gluten-free)", /^tamari/i, /\btamari\b/gi, "tamari"],
    ["Coconut aminos", /^coconut aminos$/i, /\bcoconut aminos\b/gi, "coconut aminos"]] },
  { items: [["Milk", /^(whole |2% )?milk$/i, /(?<!(coconut|oat|almond) )\bmilk\b/gi, "milk"], ["Oat milk", /^oat milk$/i, /\boat milk\b/gi, "oat milk"],
    ["Unsweetened almond milk", /almond milk$/i, /\balmond milk\b/gi, "almond milk"]] },
  { items: [["Chicken broth", /^chicken (broth|stock)$/i, /\bchicken (broth|stock)\b/gi, "chicken broth"], ["Vegetable broth", /^vegetable (broth|stock)$/i, /\bvegetable (broth|stock)\b/gi, "vegetable broth"]] },
  { items: [["Breadcrumbs", /^(plain |italian )?breadcrumbs$/i, /\bbreadcrumbs\b/gi, "breadcrumbs"], ["Panko breadcrumbs", /^panko/i, /\bpanko\b/gi, "panko"],
    ["Gluten-free breadcrumbs", /^gluten-free breadcrumbs$/i, /\bgluten-free breadcrumbs\b/gi, "gluten-free breadcrumbs"]] },
  { items: [["Flour tortillas", /^flour tortillas$/i], ["Corn tortillas", /^corn tortillas$/i], ["Whole wheat tortillas", /^whole wheat tortillas$/i]] },
  { time: true, items: ["Spaghetti", "Linguine", "Fettuccine", "Penne", "Rigatoni", "Rotini", "Bucatini"]
      .map(n => [n, new RegExp("^" + n + "$", "i"), new RegExp("\\b" + n + "\\b", "gi"), n.toLowerCase()])
      .concat([["Gluten-free pasta", /^gluten-free pasta$/i, /\bgluten-free pasta\b/gi, "gluten-free pasta"], ["Whole wheat pasta", /^whole wheat pasta$/i, /\bwhole wheat pasta\b/gi, "whole wheat pasta"]]) },
  { items: [["White rice", /^(white )?rice$/i], ["Jasmine rice", /^jasmine rice$/i], ["Basmati rice", /^basmati rice$/i]] },
  { items: [["Lemon", /^lemons?$/i, /\blemons?\b/gi, "lemon"], ["Lime", /^limes?$/i, /\blimes?\b/gi, "lime"]] },
  { items: [["Fresh cilantro", /^(fresh )?cilantro$/i, /\bcilantro\b/gi, "cilantro"], ["Fresh parsley", /^(fresh )?parsley$/i, /\bparsley\b/gi, "parsley"]] },
  { items: [["Honey", /^honey$/i, /\bhoney\b/gi, "honey"], ["Maple syrup", /^maple syrup$/i, /\bmaple syrup\b/gi, "maple syrup"]] },
  { savory: true, note: "Keep half-and-half at a gentle simmer so it doesn't split.", items: [["Heavy cream", /^heavy cream$/i, /(?<!(sour|ice|cashew) )\b(heavy )?cream\b/gi, "cream"],
    ["Half-and-half", /^half-and-half$/i, /\bhalf-and-half\b/gi, "half-and-half"]] },
  { items: [["Bacon", /^bacon$/i, /\bbacon\b/gi, "bacon"], ["Turkey bacon", /^turkey bacon$/i, /\bturkey bacon\b/gi, "turkey bacon"]] },
  { items: [["Kielbasa", /kielbasa/i, /\bkielbasa\b/gi, "kielbasa"], ["Smoked sausage", /^smoked sausage/i, /\bsmoked sausage\b/gi, "smoked sausage"],
    ["Andouille sausage", /andouille/i, /\bandouille\b/gi, "andouille"]] }
].map(g => ({ ...g, items: g.items.map(([label, re, step, word, note]) => ({ label, re, step, word, note: note || g.note, time: g.time })) }));
function swapChoices(item, r) {
  for (const g of QUICK_SWAPS) {
    if (g.savory && r && r.type === "dessert") continue;
    const from = g.items.find(x => x.re.test(item));
    if (from) return { from, to: g.items.filter(x => x !== from) };
  }
  return null;
}
const keepCase = (was, word) => /^[A-Z]/.test(was) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
function quickSwap(r, k, from, to) {
  const fix = t => from.step && to.word ? t.replace(from.step, w => keepCase(w, to.word)) : t;
  // Different pasta shapes cook for different times: point to the package instead of the old number.
  const steps = r.steps.map(fix).map(t => to.time && to.word && t.toLowerCase().includes(to.word.toLowerCase())
    ? t.replace(/\bfor (about )?\d+( to \d+)? minutes\b/i, "for the time on the package") : t);
  if (to.note && !steps.includes(to.note)) steps.push(to.note);
  return { ...r, name: fix(r.name), steps, ingredients: r.ingredients.map((x, j) => j === k ? { ...x, item: to.label, have: iHave(to.label) } : x) };
}

// "About 520 cal · 38 g protein · 45 g carbs per serving"
function nutritionLine(r) {
  if (!r.ingredients || !r.ingredients.length) return null;
  const n = nutrition(r.ingredients, r.serves, productNutrition);
  if (!n.kcal) return null;
  return h("p", { class: "lmeta nutline" }, h("b", { text: `About ${n.kcal} cal · ${n.protein} g protein · ${n.carbs} g carbs` }), " per serving",
    n.labels ? ` · uses ${n.labels} of your scanned label${n.labels === 1 ? "" : "s"}` : " (estimate)");
}
// 🌾 Gluten-free / 🥛 Dairy-free: a badge when it already is, a button when swaps can make it so.
function dietRow(r, on, off) {
  const bits = DIET_KEYS.map(key => {
    const d = DIETS[key], done = (r.diets || []).includes(key), st = done ? "done" : dietStatus(r.ingredients, key, productDiet);
    if (st === "yes") return h("span", { class: "dbadge", text: `${d.e} ${d.name}` });
    if (st === "done") return h("button", { type: "button", class: "dbadge on", title: "Undo the swaps", onclick: () => off(key) }, `${d.e} ${d.name} ✓ `, h("u", { text: "undo" }));
    if (st === "swap") return h("button", { type: "button", class: "dbtn", onclick: () => on(key), text: `${d.e} ${d.make}` });
    return null;
  }).filter(Boolean);
  return bits.length ? h("div", { class: "dietrow" }, bits) : null;
}

function openRecipe(r0) {
  let r = r0;                         // the recipe as it is now
  let draft = null;                   // pending edits, or null
  const s = openSheet(r.name);
  const body = h("div");
  const withDiets = (nr, ds) => ds.reduce((x, d) => dietStatus(x.ingredients, d, productDiet) === "swap" ? applyDiet(x, d, productDiet) : x, nr);
  const pickVersion = k => { r = withDiets(r.variants.make(k, r.serves || 4), r.diets || []); draft = null; s.setTitle && s.setTitle(r.name); draw(); };
  // Make it gluten-free / dairy-free, and undo. Undo rebuilds from the version (or the recipe as it first opened).
  const dietOn = key => { const orig = r.orig || r; r = { ...applyDiet(r, key, productDiet), orig }; draw(); toast(`${DIETS[key].e} ${DIETS[key].name} swaps made`); };
  const dietOff = key => {
    const keep = (r.diets || []).filter(d => d !== key);
    const base = r.variants ? r.variants.make(r.variants.cur, r.serves || 4) : r.orig;
    if (!base) return;
    r = keep.length ? { ...withDiets(base, keep), orig: r.orig } : base;
    draw();
  };
  s.body.append(body);
  const startDraft = () => { if (!draft) draft = { serves: r.serves || 2, ingredients: r.ingredients.map(i => ({ ...i })), note: "" }; };
  const changed = () => draft && (draft.serves !== (r.serves || 2) || draft.note.trim() ||
    draft.ingredients.length !== r.ingredients.length || draft.ingredients.some((i, k) => i.item !== r.ingredients[k].item));

  async function apply() {
    const onlyServes = draft && !draft.note.trim() && draft.ingredients.length === r.ingredients.length &&
      draft.ingredients.every((i, k) => i.item === r.ingredients[k].item);
    if (onlyServes) {   // just more or fewer people: scale the amounts here, no AI needed
      const f = draft.serves / (r.serves || 2), prev = r, wasSaved = isSaved(prev);
      r = { ...r, serves: draft.serves, ingredients: r.ingredients.map(i => ({ ...i, amount: scaleAmount(i.amount, f) })) };
      draft = null;
      if (wasSaved) { try { await toggleSave(prev); await toggleSave(r); } catch (e) {} }
      draw();
      toast(`Amounts changed for ${r.serves}`);
      return;
    }
    try {
      const nr = await updateRecipe(r, draft);
      const prev = r, wasSaved = isSaved(prev);
      r = nr; draft = null;
      if (wasSaved) { await toggleSave(prev); await toggleSave(r); }   // keep the saved copy in step with the edit
      s.setTitle && s.setTitle(r.name);
      draw();
      toast("Recipe updated");
    } catch (e) {
      console.error("update recipe", e);
      await choose("Couldn't update the recipe", `${scanErrorText(e)}\n\nDetails (for your developer): ${clip([e && e.code, e && e.message].filter(Boolean).join(" · "), 300)}`, [{ label: "OK", value: 1 }]);
    }
  }
  async function cook() {
    if (changed()) {
      const c = await choose("Update the recipe first?", "You changed the ingredients. Update the steps to match before cooking?",
        [{ label: "Update, then cook", value: "u", cls: "primary" }, { label: "Cook without changes", value: "c" }, { label: "Cancel", value: null }]);
      if (!c) return;
      if (c === "u") { await apply(); if (draft) return; }
      else draft = null;
    }
    s.close();
    startCooking(r);
  }

  function draw() {
    body.textContent = "";
    const d = draft || { serves: r.serves || 2, ingredients: r.ingredients };
    const stOf = i => { const st = ingStatus(i.item); return st === "need" && i.have && !r.quick ? "have" : st; };
    const need = d.ingredients.filter(i => stOf(i) === "need");
    const toggleHave = (item, st) => {
      if (st === "need") { if (!C.ings.some(x => norm(x) === norm(item))) C.ings.push(clip(item, 60)); }
      else C.ings = C.ings.filter(x => !sameFood(x, item));
      saveCookPrefs(); draw();
    };
    const cost = need.length ? mealCost(need) : null;
    const addIn = h("input", { placeholder: "Add an ingredient", maxlength: "60", autocapitalize: "words", enterkeyhint: "done", "aria-label": "Add an ingredient" });
    const addOne = () => { const t = clip(addIn.value, 60); if (!t) return; startDraft(); draft.ingredients.push({ item: t.charAt(0).toUpperCase() + t.slice(1), amount: "", have: iHave(t) }); draw(); };
    addIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addOne(); } });
    put(body,
      h("div", { class: "rmeta" },
        r.type ? h("span", { class: "rtag", text: r.type }) : null,
        r.minutes ? h("span", { text: `${fmtMins(r.minutes)} cooking` }) : null),
      r.variants ? h("div", { class: "fchips vchips", role: "group", "aria-label": "Version" }, r.variants.list.map(x =>
        h("button", { type: "button", class: "fchip" + (x.k === r.variants.cur ? " on" : ""), "aria-pressed": String(x.k === r.variants.cur),
          onclick: () => x.k !== r.variants.cur && pickVersion(x.k) }, `${x.e} ${x.label}`))) : null,
      nutritionLine(r),
      !draft ? dietRow(r, dietOn, dietOff) : null,
      r.waitMinutes ? h("div", { class: "rwait" }, h("b", { text: "⏳ Plan ahead" }), h("span", { text: waitText(r) + (r.waitNote && !/\d/.test(r.waitNote) ? ` (about ${fmtMins(r.waitMinutes)})` : "") })) : null,
      r.summary ? h("p", { class: "msg", text: r.summary }) : null,
      h("div", { class: "actions rtop" },
        h("button", { class: "btn green", type: "button", text: "▶ Start cooking", onclick: cook }),
        h("button", { class: "btn", type: "button", text: isSaved(r) ? "★ Saved" : "☆ Save", onclick: async e => {
          const was = isSaved(r); await toggleSave(r); e.target.textContent = was ? "☆ Save" : "★ Saved"; } }),
        h("button", { class: "btn", type: "button", text: "📅 Plan it", onclick: () => pickDayFor(r) }),
        isSaved(r) && !r.quick ? h("button", { class: "btn", type: "button", text: "✏️ Edit", onclick: () => { s.close(); recipeEditor(r, { editing: recipeId(r) }); } }) : null),
      h("div", { class: "rserve" }, h("b", { text: "Servings" }),
        h("div", { class: "qty" },
          h("button", { type: "button", "aria-label": "Fewer servings", text: "−", onclick: () => { startDraft(); draft.serves = Math.max(1, draft.serves - 1); draw(); } }),
          h("span", { text: String(d.serves) }),
          h("button", { type: "button", "aria-label": "More servings", text: "+", onclick: () => { startDraft(); draft.serves = Math.min(MAX_PEOPLE, draft.serves + 1); draw(); } }))),
      h("h3", { class: "rh", text: "Ingredients" }),
      h("p", { class: "lmeta", text: "Tap a name to swap it. Tap “need” if you already have it." }),
      h("ul", { class: "ring edit" }, d.ingredients.map((i, k) => {
        const st = stOf(i);
        return h("li", { class: st === "need" ? "miss" : "" },
          h("button", { type: "button", class: "ingname", "aria-label": "Swap " + i.item, onclick: async () => {
            const sw = swapChoices(i.item, r);
            if (sw) {
              const c = await choose(`Swap ${i.item}`, "Pick one and the steps update to match. No waiting.",
                [...sw.to.map(t => ({ label: t.label, value: t })), { label: "Something else…", value: "other" }, { label: "Cancel", value: null }]);
              if (!c) return;
              if (c !== "other") {
                if (draft) { draft.ingredients[k] = { ...draft.ingredients[k], item: c.label, have: iHave(c.label) }; }
                else r = quickSwap(r, k, sw.from, c);
                draw(); toast(`Swapped in ${c.label}`); return;
              }
            }
            const v = await promptSheet("Swap ingredient", `Use instead of ${i.item}`, i.item, "Swap", { max: 60 });
            if (!v || v === i.item) return;
            startDraft(); draft.ingredients[k] = { item: v, amount: draft.ingredients[k].amount, have: iHave(v) }; draw();
          } }, i.item),
          i.amount ? h("span", { class: "amt", text: i.amount }) : null,
          st === "list" ? h("span", { class: "listtag", text: "on list" })
            : h("button", { type: "button", class: st === "have" ? "havetag" : "need", "aria-label": (st === "have" ? "I don't have " : "I have ") + i.item,
                text: st === "have" ? "have" : "need", onclick: () => toggleHave(i.item, st) }),
          h("button", { type: "button", class: "ingx", "aria-label": "Remove " + i.item, text: "✕", onclick: () => { startDraft(); draft.ingredients.splice(k, 1); draw(); } }));
      })),
      h("div", { class: "cookin" }, addIn, h("button", { class: "btn", type: "button", text: "Add", onclick: addOne })),
      draft ? h("label", { class: "fl", style: "margin-top:12px" }, h("span", { text: "Anything else to change? (optional)" }),
        h("input", { value: draft.note, maxlength: "200", placeholder: "e.g. make it spicier, no oven", oninput: e => { draft.note = e.target.value; } })) : null,
      changed() ? h("div", { class: "rchange" },
        h("p", { text: draft.ingredients.length === r.ingredients.length && draft.ingredients.every((i, k) => i.item === r.ingredients[k].item) && !draft.note.trim()
          ? `Tap Update to change the amounts for ${draft.serves}.` : "You changed this recipe. Update it so the amounts and steps match (uses AI)." }),
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", text: "Undo changes", onclick: () => { draft = null; draw(); } }),
          h("button", { class: "btn primary", type: "button", text: "Update recipe", onclick: apply }))) : null,
      !draft && cost && cost.priced ? h("div", { class: "rcost", text: `About ${money(cost.sum)} for what you need` + (cost.priced < cost.total ? ` (${cost.priced} of ${cost.total} items have prices)` : "") }) : null,
      !draft && need.length ? h("button", { class: "btn violet block", type: "button", text: `Add ${need.length} missing item${need.length === 1 ? "" : "s"} to “${listName()}”`,
        onclick: () => { s.close(); recipesToList([{ name: r.name, serves: d.serves, ingredients: need }]); } }) : null,
      h("h3", { class: "rh", text: "Steps" }),
      draft ? h("p", { class: "lmeta", text: "Steps will update when you tap Update recipe." }) : null,
      h("ol", { class: "rsteps" + (draft ? " stale" : "") }, r.steps.map(t => h("li", { text: t }))),
      r.notes ? h("p", { class: "rq-note", text: r.notes }) : null,
      h("p", { class: "note", text: !isSaved(r) || r.quick ? (r.quick ? "A classic home recipe. Season to taste and cook meat to a safe temperature." : "Recipe ideas are written by AI. Check cooking temperatures and anything you're allergic to.") : "Your saved recipe. Tap ✏️ Edit to change it." }));
  }
  draw();
}

function renderCook() {
  const host = $("#cookBody");
  if (!host) return;
  host.textContent = "";
  const input = h("input", { id: "cookInput", placeholder: "e.g. chicken, mushrooms, potatoes", maxlength: "200", autocapitalize: "words", enterkeyhint: "done", "aria-label": "Ingredients you have" });
  const addTyped = () => { const n = addIngredients(splitIngredients(input.value)); input.value = ""; if (!n) $("#cookInput") && $("#cookInput").focus(); };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } });
  const tLabel = h("span", { class: "tval", text: timeLabel(C.time) });
  const slider = h("input", { type: "range", min: String(TIME_MIN), max: String(TIME_MAX), step: "5", value: String(C.time || 60), class: "tslider" + (C.time ? "" : " off"), "aria-label": "Maximum cooking time in minutes" });
  const box = h("input", { type: "number", inputmode: "numeric", min: String(TIME_MIN), max: String(TIME_MAX), step: "1", value: C.time ? String(C.time) : "", placeholder: "Any", class: "tbox", "aria-label": "Maximum minutes" });
  const anyBtn = h("button", { type: "button", class: "link tany", text: C.time ? "Clear time limit" : "", onclick: () => { box.value = ""; setTime(0, true); } });
  const setTime = (m, redraw) => {
    C.time = m;
    anyBtn.textContent = m ? "Clear time limit" : "";
    tLabel.textContent = timeLabel(m);
    slider.classList.toggle("off", !m);
    if (m) slider.value = String(Math.min(TIME_MAX, Math.max(TIME_MIN, m)));
    if (redraw) { C.ideas = null; saveCookPrefs(); }
  };
  slider.addEventListener("input", () => { const m = +slider.value; box.value = String(m); setTime(m, false); });
  slider.addEventListener("change", () => setTime(+slider.value, true));
  box.addEventListener("change", () => {
    const v = parseInt(box.value, 10);
    if (!v) { box.value = ""; setTime(0, true); return; }
    const m = Math.min(TIME_MAX, Math.max(TIME_MIN, v));
    box.value = String(m); setTime(m, true);
  });
  const extras = COMMON_EXTRAS.filter(x => !C.ings.some(i => norm(i) === norm(x)));
  const seg = (list, key) => h("div", { class: "seg wrap", role: "group" }, list.map(([v, label]) =>
    h("button", { type: "button", class: "segb" + (C[key] === v ? " on" : ""), "aria-pressed": String(C[key] === v), text: label,
      onclick: () => { C[key] = v; C.ideas = null; saveCookPrefs(); renderCook(); } })));
  const voiceOn = C.listening;

  const saved = S.recipes || [];
  const lf = listFoods().length, bf = boughtFoods().length, pf = pantryFoods().length, all = allIngredients();
  const soonNames = C.usePantry ? useSoon().map(p => foodName(p.name)) : [];
  const needCount = m => m.ingredients.filter(i => ingStatus(i.item) === "need" && !STAPLES.has(norm(i.item))).length;
  const tile = (m, open) => {
    const n = needCount(m);
    return h("button", { type: "button", class: "qtile", onclick: open },
      h("span", { class: "qe", text: m.e || "★" }),
      h("span", { class: "qn", text: m.name }),
      h("span", { class: "qs" + (n ? "" : " ok"), text: n ? `Need ${n}` : "✓ Ready" }));
  };
  const srcChip = (key, label, n) => h("button", { type: "button", class: "srcchip" + (C[key] && n ? " on" : ""), "aria-pressed": String(!!C[key]), disabled: !n,
    onclick: () => { C[key] = !C[key]; C.ideas = null; saveCookPrefs(); renderCook(); } },
    h("span", { class: "sbox", text: C[key] && n ? "✓" : "" }), `${label} (${n})`);
  const moreOpen = !!(C.time || C.avoid);
  const mealHits = h("div", { class: "qgrid hits" });
  const mealMake = h("div", { class: "mmake" });
  const mealSearch = h("input", { type: "search", class: "msearch", placeholder: "🔍 Find a meal, or type any dish…", "aria-label": "Find a meal or type a dish", enterkeyhint: "go", maxlength: "80" });
  mealSearch.addEventListener("input", () => {
    const raw = mealSearch.value.trim(), q = norm(raw);
    mealHits.textContent = ""; mealMake.textContent = "";
    if (!q) return;
    const hits = allMeals().filter(m => norm(m.name).includes(q) || (m.ingredients || []).some(i => norm(typeof i === "string" ? i : i.item).includes(q))).slice(0, 12);
    hits.forEach(m => mealHits.append(mealTile(m)));
    if (q.length >= 3 && !hits.some(m => norm(m.name) === q))
      mealMake.append(h("button", { class: "btn violet block", type: "button", onclick: () => recipeFromName(raw) }, `✨ Put together “${clip(raw, 40)}”`),
        h("p", { class: "lmeta", text: "Gets the full ingredient list and steps. Adjust it, add it to your list, or save it to ★ My recipes." }));
  });
  mealSearch.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = mealSearch.value.trim();
    if (raw.length >= 2) recipeFromName(raw);
  });
  host.append(...[
    plannedCard(),
    h("div", { class: "card qmeals" },
      h("div", { class: "ghead" }, h("h2", { text: "Meals" }),
        h("button", { class: "btn primary", type: "button", text: "🗓️ Plan the week", onclick: planMeals })),
      mealSearch,
      mealHits,
      mealMake,
      mealSections()),
    labelsCard(),
    h("div", { class: "card cook" },
      h("h2", { text: "Ideas from what you have" }),
      h("p", { class: "lmeta", text: "The AI suggests meals using:" }),
      h("div", { class: "srcrow" },
        srcChip("usePantry", "🏠 In my pantry", pf),
        srcChip("useList", "🛒 On my list", lf),
        srcChip("useBought", "🧺 Bought lately", bf)),
      soonNames.length ? h("p", { class: "lmeta soon soonline", text: `⏰ Used first: ${soonNames.slice(0, 6).join(", ")} (use soon)` }) : null,
      h("div", { class: "cookin", style: "margin-top:10px" }, input,
        h("button", { class: "btn", type: "button", "aria-label": "Add", text: "Add", onclick: addTyped })),
      h("div", { class: "actions cooktools" },
        h("button", { class: "btn" + (voiceOn ? " listening" : ""), type: "button", onclick: () => startVoice(input) }, voiceOn ? "● Listening… tap to stop" : "🎤 Say it"),
        h("button", { class: "btn", type: "button", onclick: ingredientsFromPhoto }, "📷 Photo of food")),
      C.ings.length ? h("div", { class: "pickchips" },
        C.ings.map(t => h("button", { type: "button", class: "ichip on", "aria-label": "Remove " + t,
          onclick: () => { C.ings = C.ings.filter(x => x !== t); C.ideas = null; saveCookPrefs(); renderCook(); } }, t, h("span", { class: "chipx", text: "×" }))),
        h("button", { type: "button", class: "link", text: "Clear typed", onclick: () => { C.ings = []; C.ideas = null; saveCookPrefs(); renderCook(); } }))
        : h("p", { class: "lmeta", text: lf || bf ? "Have anything else at home? Type it, say it or snap it." : "Type, say or snap a photo of the food you have." }),
      extras.length ? h("div", { class: "extras" }, h("span", { class: "lmeta", text: "Common extras:" }),
        extras.map(x => h("button", { type: "button", class: "xchip", onclick: () => addIngredients([x]) }, "+ " + x))) : null,
      h("h3", { class: "rh", text: "What kind of food?" }), seg(MEAL_TYPES, "type"),
      h("details", { class: "moreopts", open: moreOpen ? "" : null },
        h("summary", { text: "Time limit & allergies" + (moreOpen ? ` · ${[C.time ? timeLabel(C.time) : "", C.avoid ? "no " + C.avoid : ""].filter(Boolean).join(", ")}` : "") }),
        h("div", { class: "trow" }, h("h3", { class: "rh", text: "Cooking time" }), tLabel),
        h("p", { class: "lmeta tnote", text: "Prep and cooking only. Marinating or chilling time is shown separately." }),
        h("div", { class: "tpick" }, slider, h("label", { class: "tboxwrap" }, box, h("span", { text: "min" }))),
        anyBtn,
        h("label", { class: "fl" }, h("span", { text: "Never use (allergies or dislikes)" }),
          h("input", { value: C.avoid, maxlength: "150", placeholder: "e.g. peanuts, shellfish", onchange: e => { C.avoid = clip(e.target.value, 150); C.ideas = null; saveCookPrefs(); } }))),
      h("button", { class: "btn green block bigbtn", type: "button", disabled: C.busy || !all.length, onclick: () => findMeals(false) },
        C.busy ? "Finding meals…" : all.length ? `Find meals (${all.length} ingredient${all.length === 1 ? "" : "s"})` : "Find meals"),
      h("p", { class: "lmeta ailine", text: aiStatusLine() })),
    C.ideas ? h("div", { id: "cookResults" },
      h("div", { class: "ghead" }, h("h2", { text: `${C.ideas.length} ideas` }),
        h("button", { class: "link", type: "button", text: "Show different ideas", onclick: () => findMeals(true) })),
      h("div", { class: "ideas" }, C.ideas.map(r => {
        const miss = r.ingredients.filter(i => !i.have && ingStatus(i.item) === "need").map(i => i.item);
        return h("div", { class: "idea" },
          h("button", { class: "ideabody", type: "button", onclick: () => openRecipe(r) },
            h("div", { class: "itop" }, r.type ? h("span", { class: "rtag", text: r.type }) : null, r.minutes ? h("span", { class: "imin", text: fmtMins(r.minutes) }) : null),
            h("div", { class: "iname2", text: r.name }),
            r.waitMinutes ? h("div", { class: "iwait", text: `⏳ Plan ahead: ${waitText(r)}` }) : null,
            r.summary ? h("div", { class: "isum", text: r.summary }) : null,
            miss.length ? h("div", { class: "imiss", text: "Need: " + miss.join(", ") }) : h("div", { class: "ihave", text: "✓ You have everything" })),
          h("div", { class: "ideaacts" },
            h("button", { class: "btn", type: "button", text: "View & edit", onclick: () => openRecipe(r) }),
            h("button", { class: "btn green", type: "button", text: "▶ Cook", onclick: () => startCooking(r) })));
      }))) : null
  ].filter(Boolean));
}


/* ---------- quick meals: classic recipes built in, so they never need the AI ---------- */
// Older built-in meals moved from the old "Asian" group into their own country.
const MEAL_REGROUP = { "Teriyaki Chicken": "japanese", "General Tso's Chicken": "chinese", "Pad Thai": "thai", "Korean Beef Bulgogi": "korean",
  "Thai Red Curry Chicken": "thai", "Sweet & Sour Pork": "chinese", "Chicken Lo Mein": "chinese" };
// Extra categories for the older built-in meals (newer ones carry t: in meals-more.js).
const MEAL_TAGS = {
  "Beef Tacos": "mexican kids budget", "Pot Roast": "comfort onepot slow fall winter", "Beef Stew": "comfort onepot fall winter", "Chicken & Chouriço": "onepot",
  "Portuguese Kale Soup": "soups budget onepot fall winter", "Spaghetti & Meatballs": "italian kids comfort", "Chili": "onepot budget comfort fall winter",
  "Chicken Parm": "italian kids", "Shepherd's Pie": "comfort winter", "Chicken Stir-Fry": "chinese", "Baked Ziti": "italian kids budget",
  "Burgers": "grill kids sandwiches summer", "Steak Tips": "grill summer", "Meatloaf": "comfort kids", "Beef & Broccoli": "chinese", "Stuffed Peppers": "comfort",
  "Roast Chicken & Vegetables": "onepot comfort", "Chicken Fajitas": "mexican onepot", "Chicken Pot Pie": "comfort winter", "BBQ Chicken Thighs": "grill kids budget southern summer",
  "Sausage & Peppers": "italian sandwiches onepot budget", "Pork Chops & Apples": "comfort onepot fall", "Pulled Pork": "southern slow sandwiches grill",
  "Shrimp Scampi": "italian pasta", "Fish Tacos": "mexican summer", "Fish & Chips": "kids", "Chicken Alfredo": "italian kids", "Baked Mac & Cheese": "comfort kids budget southern",
  "Lasagna": "italian comfort", "Chicken Noodle Soup": "comfort kids onepot winter", "New England Clam Chowder": "comfort winter", "Minestrone": "italian budget onepot",
  "Caçoila": "sandwiches", "Eggplant Parm": "italian", "Black Bean Quesadillas": "mexican kids budget", "Vegetable Fried Rice": "chinese budget",
  "Grilled Cheese & Tomato Soup": "sandwiches comfort kids budget soups winter", "Spinach & Ricotta Stuffed Shells": "italian pasta", "Chicken Tortilla Soup": "soups",
  "Pork Chile Verde": "soups onepot", "Teriyaki Chicken": "kids", "Greek Chicken Souvlaki": "greek grill summer", "Moussaka": "greek comfort", "Chicken Shawarma": "sandwiches",
  "Greek Lemon Chicken & Potatoes": "greek onepot", "Shakshuka": "onepot breakfast", "Falafel Pitas": "sandwiches", "Sausage & Egg Breakfast Casserole": "kids"
};
// American regions: these show as chips inside the 🇺🇸 American tile (Southern & Cajun meals count as The South automatically).
const MEAL_REGIONS = {
  newengland: ["New England Clam Chowder", "Baked Haddock", "Baked Stuffed Shrimp", "Seafood Casserole", "Steak Tips", "Pot Roast", "Apple Crisp", "Blueberry Muffins",
    "Pork Chops & Apples", "Chicken Pot Pie", "Pumpkin Pie"],
  midatlantic: ["Philly Cheesesteaks", "Reuben Sandwiches", "Buffalo Chicken Wraps", "Buffalo Chicken Salad", "Eggs Benedict", "Chicken Parm", "Baked Ziti"],
  south: ["BBQ Chicken Thighs", "Pulled Pork", "Baked Mac & Cheese", "Blueberry Cobbler", "Banana Bread", "Strawberry Shortcake", "Chicken Salad Sandwiches"],
  midwest: ["Meatloaf", "Italian Beef Sandwiches", "Sloppy Joes", "Slow Cooker Swedish Meatballs", "Kielbasa, Cabbage & Potatoes", "Slow Cooker Beef Stroganoff",
    "Chocolate Sheet Cake", "Homemade Pizza"],
  southwest: ["Chili", "Slow Cooker White Chicken Chili", "Beef Burrito Bowls", "Chicken Fajitas", "Taco Salad", "Sheet Pan Chicken Nachos", "Breakfast Burritos", "Grilled Ribeye Steaks"],
  west: ["Cobb Salad", "French Dip Sandwiches", "Fish Tacos", "Chicken Caesar Salad", "Garlic Butter Salmon", "Strawberry Spinach Salad with Chicken"],
  hawaii: ["Teriyaki Chicken"],
  american: ["Burgers", "Grilled Cheese & Tomato Soup", "Chicken Noodle Soup", "BLT Sandwiches", "Pancakes", "Bacon, Eggs & Home Fries", "Chocolate Chip Cookies",
    "Fudgy Brownies", "Peanut Butter Cookies", "Homemade Chicken Tenders", "Western Omelette", "Split Pea Soup with Ham", "Sausage & Egg Breakfast Casserole"]
};
const REGION_OF = {};
for (const [r, names] of Object.entries(MEAL_REGIONS)) names.forEach(n => { REGION_OF[n] = ((REGION_OF[n] || "") + " " + r).trim(); });
const QUICK_MEALS = [
  { e: "🌮", g: "beef", name: "Beef Tacos", type: "dinner", minutes: 25, serves: 4, summary: "Seasoned ground beef in crunchy shells with all the toppings.",
    ingredients: [["Ground beef", "1 lb"], ["Taco shells", "12"], ["Taco seasoning", "1 packet"], ["Onion", "1 small"], ["Olive oil", "1 tsp"], ["Lettuce", "2 cups shredded"],
      ["Tomatoes", "2"], ["Shredded cheddar cheese", "1 cup"], ["Sour cream", "1/2 cup"], ["Salsa", "1 jar"]],
    steps: ["Dice the onion and tomatoes and shred the lettuce.", "Heat the oil in a large skillet over medium-high heat and cook the onion for 3 minutes.",
      "Add the beef, break it up and brown it for 7 minutes. Drain off the fat.", "Stir in the taco seasoning and 2/3 cup water. Simmer for 5 minutes until thick.",
      "Warm the shells in a 350°F oven for 5 minutes.", "Fill the shells with beef and top with lettuce, tomato, cheese, sour cream and salsa."] },
  { e: "🥩", g: "beef", name: "Pot Roast", type: "dinner", minutes: 210, serves: 6, summary: "Fall-apart chuck roast with carrots and potatoes in rich gravy.",
    ingredients: [["Chuck roast", "3 lb"], ["Salt", "2 tsp"], ["Black pepper", "1 tsp"], ["Olive oil", "2 tbsp"], ["Onions", "2"], ["Celery", "2 stalks"], ["Garlic", "4 cloves"],
      ["Tomato paste", "2 tbsp"], ["Red wine", "1 cup (or more broth)"], ["Beef broth", "2 cups"], ["Thyme", "1 tsp dried"], ["Bay leaves", "2"],
      ["Carrots", "1 lb"], ["Yukon Gold potatoes", "2 lb"], ["Flour", "2 tbsp"]],
    steps: ["Heat the oven to 300°F. Pat the roast dry and season all over with salt and pepper.", "Heat the oil in a Dutch oven over medium-high heat and sear the roast for 5 minutes per side. Set it aside.",
      "Cook the chopped onions and celery in the same pot for 5 minutes. Stir in the garlic and tomato paste for 1 minute.",
      "Pour in the wine and scrape up the browned bits, then add the broth, thyme and bay leaves.", "Put the roast back, cover and cook in the oven for 2 hours.",
      "Add the carrots and potatoes in big chunks, cover and cook for 1 hour more, until a fork slides in easily.",
      "Rest the roast for 10 minutes. Whisk the flour with 1/4 cup water, stir it into the juices and simmer for 3 minutes to make gravy."] },
  { e: "🍲", g: "soups", name: "Beef Stew", type: "dinner", minutes: 150, serves: 6, summary: "Hearty chunks of beef, potatoes and carrots in a thick gravy.",
    ingredients: [["Beef stew meat", "2 lb"], ["Flour", "1/4 cup"], ["Salt", "1 1/2 tsp"], ["Black pepper", "1 tsp"], ["Olive oil", "3 tbsp"], ["Onion", "1 large"], ["Garlic", "3 cloves"],
      ["Tomato paste", "2 tbsp"], ["Beef broth", "4 cups"], ["Worcestershire sauce", "1 tbsp"], ["Thyme", "1 tsp dried"], ["Bay leaves", "2"],
      ["Potatoes", "1 1/2 lb"], ["Carrots", "4"], ["Celery", "2 stalks"], ["Frozen peas", "1 cup"]],
    steps: ["Toss the beef with the flour, salt and pepper.", "Brown the beef in the oil in batches, about 5 minutes per batch. Set it aside.",
      "Cook the chopped onion for 5 minutes, then stir in the garlic and tomato paste for 1 minute.",
      "Add the broth, Worcestershire, thyme, bay leaves and the beef. Cover and simmer gently for 1 hour 30 minutes.",
      "Add the potatoes, carrots and celery in chunks. Simmer for 30 minutes until tender.", "Stir in the peas and cook for 5 minutes. Taste for salt."] },
  { e: "🍗", g: "portuguese", name: "Chicken & Chouriço", type: "dinner", minutes: 60, serves: 4, summary: "Portuguese-style roasted chicken and chouriço with potatoes, peppers and wine.",
    ingredients: [["Bone-in chicken thighs", "2 1/2 lb"], ["Chouriço", "1 lb"], ["Potatoes", "2 lb"], ["Onion", "1 large"], ["Red bell pepper", "1"], ["Garlic", "6 cloves"],
      ["Paprika", "2 tsp"], ["Crushed red pepper", "1/2 tsp"], ["White wine", "1 cup"], ["Olive oil", "3 tbsp"], ["Bay leaves", "2"], ["Salt", "1 1/2 tsp"], ["Black pepper", "1/2 tsp"], ["Parsley", "a handful"]],
    steps: ["Heat the oven to 400°F. Rub the chicken with the paprika, crushed garlic, salt and pepper.",
      "Brown the chicken skin-side down in the oil in a large oven-safe pan for 6 minutes. Set it aside.",
      "Brown the sliced chouriço in the same pan for 3 minutes.",
      "Add the potato chunks, sliced onion and pepper. Pour in the wine and add the bay leaves and crushed red pepper.",
      "Set the chicken on top, skin up, and roast for 40 minutes, until the chicken reaches 165°F and the potatoes are tender.", "Scatter the chopped parsley over and serve with crusty bread."] },
  { e: "🥬", g: "portuguese", name: "Portuguese Kale Soup", type: "dinner", minutes: 60, serves: 6, summary: "Classic New England kale soup with chouriço, potatoes and beans.",
    ingredients: [["Chouriço", "1 lb"], ["Kale", "1 bunch"], ["Potatoes", "1 1/2 lb"], ["Onion", "1"], ["Garlic", "3 cloves"], ["Kidney beans", "2 cans"], ["Chicken broth", "8 cups"],
      ["Olive oil", "2 tbsp"], ["Bay leaf", "1"], ["Salt", "to taste"], ["Black pepper", "to taste"], ["Crushed red pepper", "a pinch"]],
    steps: ["Cook the chopped onion in the oil for 5 minutes, then add the garlic for 1 minute.", "Add the sliced chouriço and cook for 3 minutes.",
      "Add the broth, diced potatoes and bay leaf. Simmer for 20 minutes.", "Mash some of the potatoes against the pot to thicken the soup.",
      "Stir in the chopped kale and the drained beans. Simmer for 15 minutes.", "Season with salt, pepper and a pinch of crushed red pepper."] },
  { e: "🍝", g: "pasta", name: "Spaghetti & Meatballs", type: "dinner", minutes: 50, serves: 4, summary: "Tender homemade meatballs simmered in marinara over spaghetti.",
    ingredients: [["Ground beef", "1 lb"], ["Breadcrumbs", "1/2 cup"], ["Egg", "1"], ["Parmesan cheese", "1/2 cup"], ["Garlic", "3 cloves"], ["Milk", "1/4 cup"], ["Italian seasoning", "1 tsp"],
      ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"], ["Olive oil", "1 tbsp"], ["Marinara sauce", "24 oz jar"], ["Spaghetti", "1 lb"]],
    steps: ["Mix the beef, breadcrumbs, egg, half the Parmesan, minced garlic, milk, seasoning, salt and pepper. Roll into 1 1/2 inch balls.",
      "Brown the meatballs in the oil for 7 minutes, turning them.", "Pour in the sauce, cover and simmer for 20 minutes.",
      "Meanwhile boil the spaghetti in salted water for 10 minutes. Drain.", "Serve the meatballs and sauce over the spaghetti with the rest of the Parmesan."] },
  { e: "🌶️", g: "soups", name: "Chili", type: "dinner", minutes: 60, serves: 6, summary: "Thick beef and bean chili with all the toppings.",
    ingredients: [["Ground beef", "1 1/2 lb"], ["Onion", "1"], ["Green bell pepper", "1"], ["Garlic", "3 cloves"], ["Chili powder", "3 tbsp"], ["Cumin", "2 tsp"],
      ["Tomato paste", "2 tbsp"], ["Crushed tomatoes", "28 oz can"], ["Kidney beans", "2 cans"], ["Beef broth", "1 cup"], ["Salt", "1 tsp"],
      ["Shredded cheddar cheese", "1 cup"], ["Sour cream", "1/2 cup"]],
    steps: ["Brown the beef for 8 minutes and drain the fat.", "Add the chopped onion and pepper and cook for 5 minutes.",
      "Stir in the garlic, chili powder, cumin and tomato paste for 1 minute.", "Add the tomatoes, drained beans and broth. Simmer for 30 minutes, stirring now and then.",
      "Season with salt and serve topped with cheese and sour cream."] },
  { e: "🧀", g: "chicken", name: "Chicken Parm", type: "dinner", minutes: 45, serves: 4, summary: "Crispy breaded chicken under marinara and melted mozzarella.",
    ingredients: [["Boneless chicken breasts", "1 1/2 lb"], ["Flour", "1/2 cup"], ["Eggs", "2"], ["Italian breadcrumbs", "1 cup"], ["Parmesan cheese", "1/2 cup"],
      ["Olive oil", "1/2 cup"], ["Marinara sauce", "2 cups"], ["Shredded mozzarella", "1 1/2 cups"], ["Spaghetti", "1 lb"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"]],
    steps: ["Heat the oven to 425°F. Slice the breasts into thin cutlets and season with salt and pepper.",
      "Coat each cutlet in flour, then beaten egg, then the breadcrumbs mixed with Parmesan.", "Fry in the oil for 3 minutes per side until golden.",
      "Put them in a baking dish, top with sauce and mozzarella and bake for 15 minutes.", "Meanwhile boil the spaghetti for 10 minutes and serve it alongside."] },
  { e: "🥧", g: "beef", name: "Shepherd's Pie", type: "dinner", minutes: 60, serves: 6, summary: "Savory beef and vegetables under fluffy mashed potatoes.",
    ingredients: [["Potatoes", "2 1/2 lb"], ["Butter", "4 tbsp"], ["Milk", "1/2 cup"], ["Ground beef", "1 1/2 lb"], ["Onion", "1"], ["Carrots", "2"], ["Garlic", "2 cloves"],
      ["Tomato paste", "2 tbsp"], ["Flour", "1 tbsp"], ["Beef broth", "1 cup"], ["Worcestershire sauce", "1 tbsp"], ["Frozen peas", "1 cup"], ["Frozen corn", "1 cup"], ["Salt", "2 tsp"]],
    steps: ["Boil the peeled potato chunks for 18 minutes. Mash with the butter, milk and 1 tsp salt.",
      "Heat the oven to 400°F. Brown the beef for 8 minutes, then add the diced onion and carrots for 5 minutes.",
      "Stir in the garlic, tomato paste and flour for 1 minute. Add the broth and Worcestershire and simmer for 5 minutes.",
      "Stir in the peas and corn and spread it all in a baking dish. Cover with the mashed potatoes.", "Bake for 20 minutes until golden on top."] },
  { e: "🥢", g: "chicken", name: "Chicken Stir-Fry", type: "dinner", minutes: 30, serves: 4, summary: "Quick chicken and vegetables in a honey soy sauce over rice.",
    ingredients: [["Boneless chicken breasts", "1 1/2 lb"], ["Broccoli", "1 head"], ["Red bell pepper", "1"], ["Carrots", "2"], ["Garlic", "3 cloves"], ["Fresh ginger", "1 tbsp grated"],
      ["Soy sauce", "1/4 cup"], ["Honey", "2 tbsp"], ["Cornstarch", "1 tbsp"], ["Vegetable oil", "2 tbsp"], ["Rice", "1 1/2 cups"], ["Green onions", "3"]],
    steps: ["Cook the rice following the package, about 18 minutes.", "Whisk the soy sauce, honey, cornstarch and 1/4 cup water.",
      "Stir-fry the sliced chicken in hot oil for 6 minutes until cooked through.", "Add the broccoli, pepper and carrots and stir-fry for 4 minutes.",
      "Add the garlic and ginger for 30 seconds, then the sauce. Cook for 2 minutes until glossy.", "Serve over rice with sliced green onions."] },
  { e: "🍅", g: "pasta", name: "Baked Ziti", type: "dinner", minutes: 50, serves: 6, summary: "Cheesy baked pasta with sausage and marinara.",
    ingredients: [["Ziti", "1 lb"], ["Italian sausage", "1 lb"], ["Marinara sauce", "24 oz jar"], ["Ricotta cheese", "15 oz"], ["Egg", "1"], ["Parmesan cheese", "1/2 cup"],
      ["Shredded mozzarella", "2 cups"], ["Garlic", "2 cloves"], ["Italian seasoning", "1 tsp"], ["Salt", "1 tsp"]],
    steps: ["Heat the oven to 375°F. Boil the ziti for 8 minutes (it finishes in the oven). Drain.",
      "Brown the sausage with the garlic for 6 minutes, then stir in the sauce and seasoning.",
      "Mix the ricotta, egg, Parmesan and half the mozzarella.", "Toss the pasta with the sauce and the ricotta mix, spread in a baking dish and top with the rest of the mozzarella.",
      "Bake for 25 minutes until bubbling."] },
  { e: "🍔", g: "beef", name: "Burgers", type: "dinner", minutes: 25, serves: 4, summary: "Juicy pan-seared or grilled cheeseburgers.",
    ingredients: [["Ground beef 80/20", "1 1/2 lb"], ["Hamburger buns", "4"], ["Cheese slices", "4"], ["Lettuce", "4 leaves"], ["Tomato", "1"], ["Onion", "1"],
      ["Pickles", "to taste"], ["Ketchup", "to taste"], ["Mustard", "to taste"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"]],
    steps: ["Shape the beef into 4 patties a little wider than the buns and press a dimple in the middle of each.", "Season both sides with salt and pepper.",
      "Cook on a hot grill or skillet for 4 minutes, flip, add the cheese and cook for 4 minutes more.", "Toast the buns for 1 minute.",
      "Build the burgers with lettuce, tomato, onion, pickles, ketchup and mustard."] },
  /* ---- beef ---- */
  { e: "🥩", g: "beef", name: "Steak Tips", type: "dinner", minutes: 20, waitMinutes: 120, waitNote: "Marinate at least 2 hours, or overnight", serves: 4, summary: "New England-style marinated sirloin tips, seared hot.",
    ingredients: [["Sirloin steak tips", "2 lb"], ["Soy sauce", "1/2 cup"], ["Brown sugar", "1/4 cup"], ["Olive oil", "1/4 cup"], ["Worcestershire sauce", "2 tbsp"], ["Garlic", "4 cloves"], ["Onion powder", "1 tsp"], ["Black pepper", "1 tsp"]],
    steps: ["Whisk the soy sauce, brown sugar, oil, Worcestershire, crushed garlic, onion powder and pepper.", "Add the steak tips, cover and marinate in the fridge for at least 2 hours.",
      "Heat a grill or cast-iron pan on high.", "Cook the tips for 8 minutes, turning, until browned and medium.", "Rest for 5 minutes before serving."] },
  { e: "🍖", g: "beef", name: "Meatloaf", type: "dinner", minutes: 80, serves: 6, summary: "Classic glazed meatloaf, moist and easy.",
    ingredients: [["Ground beef", "2 lb"], ["Breadcrumbs", "3/4 cup"], ["Milk", "1/2 cup"], ["Eggs", "2"], ["Onion", "1"], ["Garlic", "2 cloves"], ["Worcestershire sauce", "1 tbsp"],
      ["Salt", "1 1/2 tsp"], ["Black pepper", "1/2 tsp"], ["Ketchup", "1/2 cup"], ["Brown sugar", "2 tbsp"], ["Mustard", "1 tsp"]],
    steps: ["Heat the oven to 350°F. Soak the breadcrumbs in the milk for 5 minutes.", "Mix in the beef, eggs, grated onion, garlic, Worcestershire, salt and pepper. Don't overmix.",
      "Shape into a loaf in a baking pan.", "Stir the ketchup, brown sugar and mustard together and spread it on top.", "Bake for 1 hour, until the middle reaches 160°F.", "Rest for 10 minutes, then slice."] },
  { e: "🥦", g: "beef", name: "Beef & Broccoli", type: "dinner", minutes: 30, serves: 4, summary: "Takeout-style beef and broccoli in a savory sauce over rice.",
    ingredients: [["Flank steak", "1 1/2 lb"], ["Broccoli", "1 head"], ["Soy sauce", "1/3 cup"], ["Brown sugar", "3 tbsp"], ["Beef broth", "1/2 cup"], ["Cornstarch", "2 tbsp"],
      ["Garlic", "3 cloves"], ["Fresh ginger", "1 tbsp grated"], ["Vegetable oil", "2 tbsp"], ["Rice", "1 1/2 cups"]],
    steps: ["Cook the rice following the package, about 18 minutes.", "Slice the steak thin across the grain and toss with 1 tbsp cornstarch.",
      "Whisk the soy sauce, brown sugar, broth and the rest of the cornstarch.", "Sear the beef in hot oil in batches, 3 minutes per batch. Set aside.",
      "Add the broccoli and a splash of water, cover and steam for 3 minutes.", "Add the garlic and ginger for 30 seconds, then the beef and sauce. Simmer for 2 minutes until glossy."] },
  { e: "🫑", g: "beef", name: "Stuffed Peppers", type: "dinner", minutes: 75, serves: 6, summary: "Peppers filled with beef, rice and tomato, topped with cheese.",
    ingredients: [["Bell peppers", "6"], ["Ground beef", "1 lb"], ["Rice", "1/2 cup"], ["Onion", "1"], ["Garlic", "2 cloves"], ["Diced tomatoes", "14.5 oz can"], ["Tomato sauce", "15 oz can"],
      ["Italian seasoning", "1 tsp"], ["Shredded mozzarella", "1 cup"], ["Salt", "1 tsp"]],
    steps: ["Heat the oven to 375°F. Cook the rice, about 18 minutes.", "Cut the tops off the peppers and scoop out the seeds.", "Brown the beef with the chopped onion for 8 minutes, then add the garlic.",
      "Stir in the tomatoes, half the sauce, the rice, seasoning and salt.", "Fill the peppers, stand them in a baking dish and pour the rest of the sauce around them.",
      "Cover and bake for 35 minutes. Top with the cheese and bake uncovered for 10 minutes."] },
  /* ---- chicken ---- */
  { e: "🍗", g: "chicken", name: "Roast Chicken & Vegetables", type: "dinner", minutes: 100, serves: 4, summary: "Golden whole roast chicken on a bed of potatoes and carrots.",
    ingredients: [["Whole chicken", "4 to 5 lb"], ["Potatoes", "2 lb"], ["Carrots", "1 lb"], ["Onion", "1"], ["Lemon", "1"], ["Garlic", "1 head"], ["Butter", "3 tbsp"],
      ["Olive oil", "2 tbsp"], ["Thyme", "1 tsp dried"], ["Salt", "2 tsp"], ["Black pepper", "1 tsp"]],
    steps: ["Heat the oven to 425°F. Pat the chicken dry.", "Rub it with soft butter, thyme, salt and pepper. Put the halved lemon and garlic inside.",
      "Toss the cut potatoes, carrots and onion with oil and salt in a roasting pan and set the chicken on top.",
      "Roast for 1 hour 15 minutes, until the thigh reaches 165°F.", "Rest the chicken for 15 minutes before carving."] },
  { e: "🌯", g: "chicken", name: "Chicken Fajitas", type: "dinner", minutes: 30, serves: 4, summary: "Sizzling spiced chicken with peppers and onions.",
    ingredients: [["Boneless chicken breasts", "1 1/2 lb"], ["Bell peppers", "3"], ["Onion", "1"], ["Lime", "1"], ["Olive oil", "3 tbsp"], ["Chili powder", "2 tsp"], ["Cumin", "1 tsp"],
      ["Paprika", "1 tsp"], ["Garlic powder", "1 tsp"], ["Salt", "1 tsp"], ["Flour tortillas", "8"], ["Sour cream", "1/2 cup"], ["Salsa", "1 jar"], ["Shredded cheese", "1 cup"]],
    steps: ["Slice the chicken, peppers and onion into strips.", "Toss the chicken with half the oil, the spices, salt and lime juice. Let it sit for 10 minutes.",
      "Cook the chicken in a hot skillet for 6 minutes until done. Set aside.", "Cook the peppers and onion in the rest of the oil for 5 minutes.",
      "Warm the tortillas and serve with the chicken, peppers, sour cream, salsa and cheese."] },
  { e: "🥧", g: "chicken", name: "Chicken Pot Pie", type: "dinner", minutes: 60, serves: 6, summary: "Creamy chicken and vegetables under a flaky crust.",
    ingredients: [["Cooked chicken", "3 cups"], ["Frozen mixed vegetables", "2 cups"], ["Onion", "1"], ["Butter", "1/3 cup"], ["Flour", "1/3 cup"], ["Chicken broth", "1 3/4 cups"],
      ["Milk", "2/3 cup"], ["Thyme", "1/2 tsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"], ["Refrigerated pie crusts", "2"]],
    steps: ["Heat the oven to 425°F. Cook the chopped onion in the butter for 5 minutes.", "Stir in the flour for 1 minute, then whisk in the broth and milk. Simmer for 3 minutes until thick.",
      "Stir in the chicken, vegetables, thyme, salt and pepper.", "Line a pie dish with one crust, add the filling, cover with the other crust and cut a few slits.",
      "Bake for 35 minutes until golden. Rest for 10 minutes."] },
  { e: "🔥", g: "chicken", name: "BBQ Chicken Thighs", type: "dinner", minutes: 55, serves: 4, summary: "Oven-baked thighs with a sticky barbecue glaze.",
    ingredients: [["Bone-in chicken thighs", "3 lb"], ["BBQ sauce", "1 cup"], ["Brown sugar", "1 tbsp"], ["Paprika", "2 tsp"], ["Garlic powder", "1 tsp"], ["Onion powder", "1 tsp"],
      ["Salt", "1 1/2 tsp"], ["Black pepper", "1/2 tsp"], ["Olive oil", "1 tbsp"]],
    steps: ["Heat the oven to 400°F. Rub the chicken with oil, sugar, spices, salt and pepper.", "Bake skin-side up on a lined pan for 35 minutes.",
      "Brush with BBQ sauce and bake for 10 minutes more.", "Broil for 2 minutes to caramelize, watching closely."] },
  /* ---- pork & sausage ---- */
  { e: "🌭", g: "pork", name: "Sausage & Peppers", type: "dinner", minutes: 40, serves: 6, summary: "Italian sausage with sweet peppers and onions on rolls.",
    ingredients: [["Italian sausage", "2 lb"], ["Bell peppers", "3"], ["Onions", "2"], ["Garlic", "4 cloves"], ["Olive oil", "2 tbsp"], ["White wine", "1/2 cup"], ["Marinara sauce", "1/2 cup"], ["Sub rolls", "6"]],
    steps: ["Brown the sausages in the oil for 8 minutes. Set aside and slice.", "Cook the sliced peppers and onions for 10 minutes until soft.",
      "Add the garlic for 1 minute, then the wine and sauce.", "Return the sausage and simmer for 10 minutes. Serve on the rolls."] },
  { e: "🍎", g: "pork", name: "Pork Chops & Apples", type: "dinner", minutes: 30, serves: 4, summary: "Juicy seared chops with cinnamon apples and onions.",
    ingredients: [["Bone-in pork chops", "4"], ["Apples", "2"], ["Onion", "1"], ["Butter", "2 tbsp"], ["Olive oil", "1 tbsp"], ["Brown sugar", "2 tbsp"], ["Apple cider", "1/2 cup"],
      ["Cinnamon", "1/2 tsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"]],
    steps: ["Season the chops with salt and pepper.", "Sear in the oil for 5 minutes per side, until 145°F. Set aside to rest.",
      "Cook the sliced apples and onion in the butter for 5 minutes.", "Add the sugar, cider and cinnamon and simmer for 3 minutes.", "Return the chops for 2 minutes to warm through."] },
  { e: "🐖", g: "pork", name: "Pulled Pork", type: "dinner", minutes: 490, serves: 8, summary: "Slow-cooker pulled pork sandwiches.",
    ingredients: [["Pork shoulder", "4 lb"], ["Brown sugar", "1/4 cup"], ["Paprika", "1 tbsp"], ["Chili powder", "1 tbsp"], ["Garlic powder", "2 tsp"], ["Salt", "2 tsp"], ["Onion", "1"],
      ["Apple cider vinegar", "1/4 cup"], ["Chicken broth", "1/2 cup"], ["BBQ sauce", "1 1/2 cups"], ["Hamburger buns", "8"], ["Coleslaw mix", "1 bag"]],
    steps: ["Mix the sugar, paprika, chili powder, garlic powder and salt and rub it all over the pork.", "Put the sliced onion in the slow cooker, the pork on top, and pour in the vinegar and broth.",
      "Cook on low for 8 hours.", "Shred the pork, drain some liquid and stir in the BBQ sauce.", "Serve on buns with coleslaw."] },
  { e: "🍯", g: "pork", name: "Honey Garlic Pork Tenderloin", type: "dinner", minutes: 35, serves: 4, summary: "Tender roasted pork with a sticky honey garlic glaze.",
    ingredients: [["Pork tenderloin", "2 lb"], ["Honey", "1/4 cup"], ["Soy sauce", "3 tbsp"], ["Garlic", "4 cloves"], ["Olive oil", "1 tbsp"], ["Butter", "1 tbsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"]],
    steps: ["Heat the oven to 400°F. Season the pork with salt and pepper.", "Sear in the oil in an oven-safe pan for 5 minutes, turning to brown all sides.",
      "Stir the honey, soy sauce, garlic and butter and pour it over.", "Roast for 18 minutes, until 145°F.", "Rest for 5 minutes, slice and spoon the glaze over."] },
  /* ---- seafood ---- */
  { e: "🐟", g: "seafood", name: "Baked Haddock", type: "dinner", minutes: 30, serves: 4, summary: "New England baked haddock with a buttery cracker topping.",
    ingredients: [["Haddock fillets", "2 lb"], ["Ritz crackers", "1 sleeve"], ["Butter", "6 tbsp"], ["Lemon", "1"], ["White wine", "1/4 cup"], ["Garlic powder", "1/2 tsp"], ["Parsley", "2 tbsp"], ["Salt", "1/2 tsp"]],
    steps: ["Heat the oven to 400°F. Put the fish in a buttered baking dish, season and add the wine and half the lemon juice.",
      "Crush the crackers and mix with the melted butter, garlic powder and parsley.", "Spread the crumbs over the fish.", "Bake for 18 minutes, until the fish flakes. Serve with lemon wedges."] },
  { e: "🍤", g: "seafood", name: "Shrimp Scampi", type: "dinner", minutes: 25, serves: 4, summary: "Garlicky lemon butter shrimp over linguine.",
    ingredients: [["Shrimp", "1 1/2 lb peeled"], ["Linguine", "1 lb"], ["Butter", "4 tbsp"], ["Olive oil", "2 tbsp"], ["Garlic", "6 cloves"], ["White wine", "1/2 cup"], ["Lemon", "1"],
      ["Crushed red pepper", "1/4 tsp"], ["Parsley", "1/4 cup"], ["Salt", "1 tsp"]],
    steps: ["Boil the linguine for 10 minutes. Save 1/2 cup of the water and drain.", "Cook the garlic in the butter and oil for 1 minute.",
      "Add the shrimp and cook for 2 minutes per side.", "Add the wine, lemon juice and red pepper and simmer for 2 minutes.", "Toss with the pasta, parsley and a splash of pasta water."] },
  { e: "🌮", g: "seafood", name: "Fish Tacos", type: "dinner", minutes: 25, serves: 4, summary: "Spiced white fish with crunchy lime slaw.",
    ingredients: [["Cod or haddock", "1 1/2 lb"], ["Chili powder", "1 tsp"], ["Cumin", "1 tsp"], ["Garlic powder", "1/2 tsp"], ["Olive oil", "2 tbsp"], ["Corn tortillas", "12"],
      ["Shredded cabbage", "2 cups"], ["Sour cream", "1/2 cup"], ["Mayonnaise", "1/4 cup"], ["Limes", "2"], ["Cilantro", "a handful"], ["Avocado", "1"], ["Salt", "1 tsp"]],
    steps: ["Season the fish with the spices and salt.", "Cook in the oil for 4 minutes per side, then flake.", "Mix the sour cream, mayo and lime juice. Toss half with the cabbage.",
      "Warm the tortillas and fill with fish, slaw, avocado, cilantro and the rest of the sauce."] },
  { e: "🍣", g: "seafood", name: "Garlic Butter Salmon", type: "dinner", minutes: 25, serves: 4, summary: "Baked salmon and asparagus with lemon garlic butter.",
    ingredients: [["Salmon fillets", "4"], ["Asparagus", "1 lb"], ["Butter", "3 tbsp"], ["Garlic", "3 cloves"], ["Lemon", "1"], ["Olive oil", "1 tbsp"], ["Parsley", "2 tbsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"]],
    steps: ["Heat the oven to 400°F. Toss the asparagus with oil and salt on a sheet pan.", "Set the salmon on the pan and season.",
      "Melt the butter with the garlic and lemon juice and spoon it over the salmon.", "Bake for 13 minutes, until the salmon flakes. Top with parsley."] },
  { e: "🦐", g: "seafood", name: "Baked Stuffed Shrimp", type: "dinner", minutes: 45, serves: 4, summary: "New England classic: jumbo shrimp with buttery cracker stuffing.",
    ingredients: [["Jumbo shrimp", "1 1/2 lb"], ["Ritz crackers", "1 1/2 sleeves"], ["Butter", "1 stick"], ["Crabmeat", "6 oz"], ["Garlic", "2 cloves"], ["Lemon", "1"], ["Parsley", "2 tbsp"], ["Sherry or white wine", "2 tbsp"], ["Paprika", "1/2 tsp"]],
    steps: ["Heat the oven to 400°F. Butterfly the shrimp, leaving the tails on.", "Mix the crushed crackers, melted butter, crabmeat, garlic, parsley and sherry.",
      "Arrange the shrimp in a buttered dish and mound the stuffing on each one.", "Sprinkle with paprika and bake for 15 minutes, until the shrimp are pink. Serve with lemon."] },
  { e: "🍟", g: "seafood", name: "Fish & Chips", type: "dinner", minutes: 45, serves: 4, summary: "Crispy beer-battered fish with oven fries.",
    ingredients: [["Cod or haddock", "2 lb"], ["Potatoes", "2 lb"], ["Flour", "1 1/2 cups"], ["Beer", "12 oz"], ["Baking powder", "1 tsp"], ["Vegetable oil", "for frying"], ["Salt", "2 tsp"], ["Lemon", "1"], ["Tartar sauce", "1/2 cup"]],
    steps: ["Heat the oven to 425°F. Cut the potatoes into wedges, toss with oil and salt and bake for 35 minutes.", "Heat 2 inches of oil to 375°F.",
      "Whisk 1 cup flour, the baking powder, salt and cold beer into a batter.", "Dust the fish in the rest of the flour, dip in batter and fry for 5 minutes until golden.", "Serve with the fries, lemon and tartar sauce."] },
  /* ---- pasta ---- */
  { e: "🍝", g: "pasta", name: "Chicken Alfredo", type: "dinner", minutes: 30, serves: 4, summary: "Creamy Parmesan sauce with chicken and fettuccine.",
    ingredients: [["Fettuccine", "1 lb"], ["Boneless chicken breasts", "1 1/2 lb"], ["Butter", "4 tbsp"], ["Heavy cream", "2 cups"], ["Parmesan cheese", "1 1/2 cups grated"], ["Garlic", "2 cloves"],
      ["Olive oil", "1 tbsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"], ["Parsley", "2 tbsp"]],
    steps: ["Boil the fettuccine for 11 minutes and drain.", "Season and cook the chicken in the oil for 6 minutes per side. Slice.",
      "Melt the butter with the garlic, add the cream and simmer for 5 minutes.", "Stir in the Parmesan until smooth.", "Toss with the pasta and chicken and top with parsley."] },
  { e: "🧀", g: "pasta", name: "Baked Mac & Cheese", type: "dinner", minutes: 45, serves: 6, summary: "Creamy cheddar macaroni with a crunchy top.",
    ingredients: [["Elbow macaroni", "1 lb"], ["Butter", "4 tbsp"], ["Flour", "1/4 cup"], ["Milk", "3 cups"], ["Sharp cheddar cheese", "3 cups shredded"], ["Dry mustard", "1/2 tsp"],
      ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"], ["Breadcrumbs", "1/2 cup"]],
    steps: ["Heat the oven to 375°F. Boil the macaroni for 6 minutes and drain.", "Melt the butter, stir in the flour for 1 minute, then whisk in the milk. Simmer for 5 minutes until thick.",
      "Off the heat, stir in the cheese, mustard, salt and pepper.", "Mix with the pasta, spread in a dish and top with the breadcrumbs.", "Bake for 20 minutes until bubbling."] },
  { e: "🍅", g: "pasta", name: "Lasagna", type: "dinner", minutes: 95, serves: 8, summary: "Layers of meat sauce, ricotta and mozzarella.",
    ingredients: [["Lasagna noodles", "12"], ["Ground beef", "1 lb"], ["Marinara sauce", "2 jars (24 oz)"], ["Ricotta cheese", "15 oz"], ["Shredded mozzarella", "3 cups"], ["Parmesan cheese", "1/2 cup"],
      ["Egg", "1"], ["Garlic", "2 cloves"], ["Italian seasoning", "1 tsp"], ["Salt", "1 tsp"]],
    steps: ["Heat the oven to 375°F. Boil the noodles for 8 minutes and drain.", "Brown the beef with the garlic for 8 minutes, then stir in the sauce and seasoning.",
      "Mix the ricotta, egg, Parmesan and salt.", "Layer sauce, noodles, ricotta and mozzarella three times, ending with sauce and mozzarella.",
      "Cover with foil and bake for 25 minutes, then uncover and bake for 25 minutes more.", "Rest for 15 minutes before cutting."] },
  /* ---- soups & stews ---- */
  { e: "🍜", g: "soups", name: "Chicken Noodle Soup", type: "dinner", minutes: 50, serves: 6, summary: "Homemade comfort in a bowl.",
    ingredients: [["Boneless chicken thighs", "1 1/2 lb"], ["Chicken broth", "10 cups"], ["Carrots", "3"], ["Celery", "3 stalks"], ["Onion", "1"], ["Garlic", "2 cloves"], ["Egg noodles", "8 oz"],
      ["Butter", "2 tbsp"], ["Thyme", "1 tsp dried"], ["Bay leaf", "1"], ["Salt", "1 tsp"], ["Parsley", "2 tbsp"]],
    steps: ["Cook the chopped carrots, celery and onion in the butter for 6 minutes. Add the garlic.", "Add the broth, chicken, thyme and bay leaf. Simmer for 20 minutes.",
      "Take out the chicken and shred it.", "Add the noodles and cook for 8 minutes.", "Return the chicken, season and add the parsley."] },
  { e: "🦪", g: "soups", name: "New England Clam Chowder", type: "dinner", minutes: 45, serves: 6, summary: "Creamy chowder with clams, potatoes and bacon.",
    ingredients: [["Chopped clams", "3 cans (6.5 oz)"], ["Clam juice", "8 oz bottle"], ["Bacon", "4 slices"], ["Onion", "1"], ["Celery", "2 stalks"], ["Potatoes", "1 1/2 lb"], ["Butter", "3 tbsp"],
      ["Flour", "1/4 cup"], ["Milk", "2 cups"], ["Heavy cream", "1 cup"], ["Thyme", "1/2 tsp"], ["Bay leaf", "1"], ["Oyster crackers", "1 bag"]],
    steps: ["Crisp the chopped bacon for 6 minutes. Set aside.", "Cook the onion and celery in the fat and butter for 5 minutes. Stir in the flour for 1 minute.",
      "Add the clam juice (from the cans and bottle), diced potatoes, thyme and bay leaf. Simmer for 15 minutes.",
      "Add the milk, cream and clams and heat for 5 minutes without boiling.", "Top with the bacon and serve with oyster crackers."] },
  { e: "🥕", g: "soups", name: "Minestrone", type: "dinner", minutes: 45, serves: 6, summary: "Hearty Italian vegetable, bean and pasta soup.",
    ingredients: [["Olive oil", "2 tbsp"], ["Onion", "1"], ["Carrots", "2"], ["Celery", "2 stalks"], ["Garlic", "3 cloves"], ["Zucchini", "1"], ["Diced tomatoes", "28 oz can"],
      ["Vegetable broth", "6 cups"], ["Cannellini beans", "1 can"], ["Ditalini pasta", "1 cup"], ["Spinach", "2 cups"], ["Italian seasoning", "1 tsp"], ["Parmesan cheese", "1/2 cup"], ["Salt", "1 tsp"]],
    steps: ["Cook the onion, carrots and celery in the oil for 6 minutes. Add the garlic.", "Add the zucchini, tomatoes, broth and seasoning. Simmer for 15 minutes.",
      "Add the beans and pasta and simmer for 10 minutes.", "Stir in the spinach for 1 minute. Serve with Parmesan."] },
  /* ---- portuguese ---- */
  { e: "🥖", g: "portuguese", name: "Caçoila", type: "dinner", minutes: 200, waitMinutes: 720, waitNote: "Marinate overnight", serves: 8, summary: "Portuguese braised pork in red wine and spices, on soft rolls.",
    ingredients: [["Pork shoulder", "3 lb"], ["Red wine", "1 1/2 cups"], ["Crushed red pepper paste (pimenta moída)", "3 tbsp"], ["Paprika", "1 tbsp"], ["Garlic", "8 cloves"], ["Bay leaves", "3"],
      ["Allspice", "1/2 tsp"], ["Cinnamon stick", "1"], ["Onion", "1"], ["Salt", "2 tsp"], ["Portuguese rolls", "8"]],
    steps: ["Cut the pork into 2 inch cubes.", "Mix the wine, pepper paste, paprika, crushed garlic, bay leaves, allspice, cinnamon and salt. Add the pork and marinate overnight.",
      "Put the pork, marinade and sliced onion in a heavy pot. Cover and simmer on low for 3 hours, stirring now and then.", "Shred the pork in the sauce and serve on the rolls."] },
  { e: "🐟", g: "portuguese", name: "Bacalhau à Gomes de Sá", type: "dinner", minutes: 75, waitMinutes: 1440, waitNote: "Soak the salt cod 24 hours, changing the water 3 or 4 times", serves: 4,
    summary: "Salt cod baked with potatoes, slow-cooked onions, eggs and olives.",
    ingredients: [["Salt cod", "1 1/2 lb"], ["Milk", "2 cups"], ["Potatoes", "2 lb"], ["Onions", "2 large"], ["Garlic", "4 cloves"], ["Olive oil", "3/4 cup"], ["Eggs", "4"], ["Black olives", "1/2 cup"], ["Parsley", "a handful"], ["Black pepper", "1/2 tsp"]],
    steps: ["Soak the cod in cold water for 24 hours, changing the water 3 or 4 times.", "Poach the cod in the milk for 10 minutes, then flake it, removing skin and bones.",
      "Boil the potatoes for 15 minutes and slice them. Hard-boil the eggs for 10 minutes.", "Cook the sliced onions and garlic slowly in the olive oil for 15 minutes until soft and golden.",
      "Heat the oven to 400°F. Layer the potatoes, cod and onions with their oil in a dish and bake for 20 minutes.", "Top with sliced eggs, olives, parsley and pepper."] },
  { e: "🍳", g: "portuguese", name: "Bife à Portuguesa", type: "dinner", minutes: 50, waitMinutes: 60, waitNote: "Marinate the steaks 1 hour", serves: 4, summary: "Portuguese steak with garlic wine sauce, ham, a fried egg and potatoes.",
    ingredients: [["Sirloin steaks", "4"], ["Garlic", "6 cloves"], ["White wine", "1/2 cup"], ["Bay leaves", "2"], ["Paprika", "1 tsp"], ["Olive oil", "2 tbsp"], ["Butter", "2 tbsp"],
      ["Eggs", "4"], ["Presunto or ham", "4 slices"], ["Potatoes", "2 lb"], ["Salt", "1 1/2 tsp"], ["Piri piri hot sauce", "to taste"]],
    steps: ["Marinate the steaks with crushed garlic, wine, bay leaves, paprika and salt for 1 hour.", "Heat the oven to 425°F. Toss the cubed potatoes with oil and salt and roast for 35 minutes.",
      "Sear the steaks in the oil for 4 minutes per side. Set aside.", "Pour the marinade into the pan, simmer for 2 minutes and swirl in the butter.",
      "Fry the eggs for 3 minutes.", "Top each steak with ham, an egg and the sauce. Serve with the potatoes and hot sauce."] },
  { e: "🌶️", g: "portuguese", name: "Shrimp Mozambique", type: "dinner", minutes: 30, serves: 4, summary: "Shrimp in a spicy garlic, butter and beer sauce. Have bread for dipping.",
    ingredients: [["Shrimp", "2 lb"], ["Butter", "6 tbsp"], ["Garlic", "8 cloves"], ["Onion", "1"], ["Beer", "12 oz"], ["Piri piri hot sauce", "2 tbsp"], ["Sazon", "1 packet"], ["Paprika", "1 tsp"],
      ["Lemon", "1"], ["Parsley", "2 tbsp"], ["Rice", "1 1/2 cups"], ["Crusty bread", "1 loaf"]],
    steps: ["Cook the rice following the package, about 18 minutes.", "Cook the chopped onion and garlic in the butter for 5 minutes.",
      "Add the beer, hot sauce, sazon and paprika and simmer for 5 minutes.", "Add the shrimp and cook for 4 minutes until pink.", "Finish with lemon juice and parsley. Serve over rice with bread."] },
  /* ---- meatless ---- */
  { e: "🍆", g: "meatless", name: "Eggplant Parm", type: "dinner", minutes: 75, waitMinutes: 30, waitNote: "Salt the eggplant 30 minutes", serves: 6, summary: "Crispy eggplant layered with sauce and mozzarella.",
    ingredients: [["Eggplants", "2"], ["Salt", "1 tbsp"], ["Flour", "1 cup"], ["Eggs", "3"], ["Italian breadcrumbs", "2 cups"], ["Parmesan cheese", "1 cup"], ["Olive oil", "1/2 cup"],
      ["Marinara sauce", "24 oz jar"], ["Shredded mozzarella", "2 cups"], ["Basil", "a handful"]],
    steps: ["Slice the eggplant 1/2 inch thick, salt it and let it sit for 30 minutes. Pat dry.", "Coat in flour, then egg, then breadcrumbs mixed with half the Parmesan.",
      "Fry in the oil for 3 minutes per side.", "Heat the oven to 375°F. Layer sauce, eggplant, mozzarella and Parmesan in a dish.", "Bake for 25 minutes. Top with basil."] },
  { e: "🫓", g: "meatless", name: "Black Bean Quesadillas", type: "dinner", minutes: 25, serves: 4, summary: "Cheesy, crispy quesadillas with beans, corn and peppers.",
    ingredients: [["Flour tortillas", "8"], ["Black beans", "1 can"], ["Corn", "1 cup"], ["Shredded Mexican cheese", "2 cups"], ["Bell pepper", "1"], ["Green onions", "3"], ["Cumin", "1 tsp"],
      ["Chili powder", "1 tsp"], ["Butter", "2 tbsp"], ["Salsa", "1 jar"], ["Sour cream", "1/2 cup"]],
    steps: ["Mash half the drained beans with the cumin and chili powder, then stir in the rest with the corn.", "Cook the diced pepper for 4 minutes.",
      "Fill half of each tortilla with beans, pepper, green onions and cheese, and fold.", "Cook in butter for 3 minutes per side until crisp. Serve with salsa and sour cream."] },
  { e: "🍚", g: "meatless", name: "Vegetable Fried Rice", type: "dinner", minutes: 30, serves: 4, summary: "Quick fried rice with egg and vegetables.",
    ingredients: [["Rice", "1 1/2 cups"], ["Eggs", "3"], ["Frozen peas and carrots", "1 1/2 cups"], ["Onion", "1"], ["Garlic", "2 cloves"], ["Soy sauce", "3 tbsp"], ["Sesame oil", "1 tbsp"],
      ["Vegetable oil", "2 tbsp"], ["Green onions", "3"]],
    steps: ["Cook the rice (day-old rice works best) and spread it out to cool.", "Scramble the eggs in a little oil for 1 minute and set aside.",
      "Cook the chopped onion for 3 minutes, then the peas, carrots and garlic for 3 minutes.", "Add the rice and stir-fry for 4 minutes.", "Stir in the soy sauce, sesame oil, eggs and green onions."] },
  { e: "🥪", g: "meatless", name: "Grilled Cheese & Tomato Soup", type: "dinner", minutes: 35, serves: 4, summary: "Creamy tomato soup with golden grilled cheese.",
    ingredients: [["Crushed tomatoes", "28 oz can"], ["Butter", "7 tbsp"], ["Onion", "1"], ["Garlic", "2 cloves"], ["Vegetable broth", "2 cups"], ["Heavy cream", "1/2 cup"], ["Sugar", "1 tsp"],
      ["Basil", "a few leaves"], ["Sandwich bread", "8 slices"], ["Cheddar cheese slices", "8"], ["Salt", "1 tsp"]],
    steps: ["Cook the chopped onion in 3 tbsp butter for 5 minutes, then add the garlic.", "Add the tomatoes, broth, sugar and salt and simmer for 15 minutes.",
      "Blend until smooth and stir in the cream and basil.", "Butter the bread, fill with cheese and cook for 3 minutes per side until golden."] },
  { e: "🦞", g: "seafood", name: "Seafood Casserole", type: "dinner", minutes: 40, serves: 4, summary: "New England baked scallops, shrimp and haddock under buttery crumbs.",
    ingredients: [["Haddock", "1 lb"], ["Sea scallops", "1/2 lb"], ["Shrimp", "1/2 lb"], ["Butter", "6 tbsp"], ["Ritz crackers", "1 sleeve"], ["Sherry or white wine", "1/4 cup"],
      ["Lemon", "1"], ["Garlic", "2 cloves"], ["Parsley", "2 tbsp"], ["Paprika", "1/2 tsp"], ["Salt", "1/2 tsp"]],
    steps: ["Heat the oven to 400°F. Butter a baking dish and spread the haddock pieces, scallops and shrimp in it.", "Pour the sherry and lemon juice over and season with salt.",
      "Mix the crushed crackers with the melted butter, garlic and parsley and sprinkle over the seafood.", "Dust with paprika and bake for 20 minutes, until the seafood is cooked and the top is golden."] },
  { e: "🐚", g: "meatless", name: "Spinach & Ricotta Stuffed Shells", type: "dinner", minutes: 55, serves: 6, summary: "Jumbo shells filled with spinach and three cheeses, baked in marinara.",
    ingredients: [["Jumbo pasta shells", "12 oz box"], ["Ricotta cheese", "15 oz"], ["Frozen spinach", "10 oz"], ["Shredded mozzarella", "2 cups"], ["Parmesan cheese", "1/2 cup"], ["Egg", "1"],
      ["Garlic", "2 cloves"], ["Italian seasoning", "1 tsp"], ["Marinara sauce", "24 oz jar"], ["Salt", "1/2 tsp"]],
    steps: ["Heat the oven to 375°F. Boil the shells for 9 minutes and drain.", "Thaw and squeeze the spinach dry. Mix it with the ricotta, egg, half the mozzarella, the Parmesan, garlic, seasoning and salt.",
      "Spread half the sauce in a baking dish. Fill each shell and set them in the dish.", "Top with the rest of the sauce and mozzarella. Cover and bake for 25 minutes, then uncover for 5 minutes."] },
  /* ---- mexican ---- */
  { e: "🫔", g: "mexican", name: "Chicken Enchiladas", type: "dinner", minutes: 50, serves: 6, summary: "Cheesy chicken enchiladas baked in red sauce.",
    ingredients: [["Cooked chicken", "3 cups shredded"], ["Red enchilada sauce", "2 cans (10 oz)"], ["Flour tortillas", "10"], ["Shredded Mexican cheese", "2 1/2 cups"], ["Onion", "1"],
      ["Cumin", "1 tsp"], ["Olive oil", "1 tbsp"], ["Sour cream", "1/2 cup"], ["Cilantro", "a handful"], ["Salt", "1/2 tsp"]],
    steps: ["Heat the oven to 375°F. Cook the chopped onion in the oil for 5 minutes.", "Mix the onion with the chicken, cumin, salt, 1/2 cup sauce and 1 cup cheese.",
      "Spread 1/2 cup sauce in a baking dish. Fill and roll the tortillas and lay them seam-side down.", "Pour the rest of the sauce over and top with the rest of the cheese.",
      "Bake for 20 minutes until bubbling. Top with sour cream and cilantro."] },
  { e: "🌮", g: "mexican", name: "Pork Carnitas", type: "dinner", minutes: 210, serves: 8, summary: "Slow-braised, crispy pulled pork tacos with citrus and spices.",
    ingredients: [["Pork shoulder", "4 lb"], ["Orange", "1"], ["Limes", "2"], ["Onions", "2"], ["Garlic", "6 cloves"], ["Cumin", "2 tsp"], ["Oregano", "2 tsp"], ["Chili powder", "1 tsp"],
      ["Salt", "2 tsp"], ["Bay leaves", "2"], ["Corn tortillas", "16"], ["Cilantro", "a handful"], ["Salsa verde", "1 jar"]],
    steps: ["Heat the oven to 300°F. Cut the pork into 2 inch chunks and rub with the cumin, oregano, chili powder and salt.",
      "Put the pork in a Dutch oven with one quartered onion, the garlic, the orange juice and squeezed halves, the juice of one lime, the bay leaves and 1 cup water.",
      "Cover and braise for 3 hours until it falls apart.", "Shred the pork, spread it on a sheet pan with some of the juices and broil for 5 minutes until crispy.",
      "Serve in warm tortillas with chopped onion, cilantro, salsa verde and lime."] },
  { e: "🌶️", g: "mexican", name: "Chicken Tortilla Soup", type: "dinner", minutes: 45, serves: 6, summary: "Spiced chicken soup with beans and corn, topped with crunchy chips.",
    ingredients: [["Boneless chicken breasts", "1 1/2 lb"], ["Chicken broth", "6 cups"], ["Diced tomatoes with green chiles", "10 oz can"], ["Black beans", "1 can"], ["Corn", "1 cup"], ["Onion", "1"],
      ["Garlic", "3 cloves"], ["Jalapeño", "1"], ["Cumin", "2 tsp"], ["Chili powder", "1 tsp"], ["Olive oil", "1 tbsp"], ["Lime", "1"], ["Tortilla chips", "1 bag"], ["Avocado", "1"], ["Shredded cheese", "1 cup"]],
    steps: ["Cook the chopped onion and jalapeño in the oil for 5 minutes. Add the garlic and spices for 1 minute.", "Add the broth, tomatoes and chicken. Simmer for 20 minutes.",
      "Take out the chicken, shred it and return it with the beans and corn. Simmer for 5 minutes.", "Squeeze in the lime. Top bowls with chips, avocado and cheese."] },
  { e: "🌯", g: "mexican", name: "Beef Burrito Bowls", type: "dinner", minutes: 40, serves: 4, summary: "Cilantro lime rice bowls with seasoned beef and all the fixings.",
    ingredients: [["Ground beef", "1 lb"], ["Taco seasoning", "1 packet"], ["Rice", "1 1/2 cups"], ["Lime", "1"], ["Cilantro", "a handful"], ["Black beans", "1 can"], ["Corn", "1 cup"],
      ["Tomatoes", "2"], ["Avocado", "1"], ["Shredded cheese", "1 cup"], ["Sour cream", "1/2 cup"], ["Salsa", "1 jar"], ["Lettuce", "2 cups shredded"]],
    steps: ["Cook the rice, about 18 minutes, then stir in the lime juice and chopped cilantro.", "Brown the beef for 7 minutes and drain. Add the seasoning and 2/3 cup water and simmer for 5 minutes.",
      "Warm the beans and corn for 5 minutes.", "Build bowls with rice, beef, beans, corn, lettuce, tomato, avocado, cheese, sour cream and salsa."] },
  { e: "🌿", g: "mexican", name: "Pork Chile Verde", type: "dinner", minutes: 150, serves: 6, summary: "Tender pork stewed in roasted tomatillo and green chile sauce.",
    ingredients: [["Pork shoulder", "3 lb"], ["Tomatillos", "1 1/2 lb"], ["Poblano peppers", "2"], ["Jalapeños", "2"], ["Onion", "1"], ["Garlic", "5 cloves"], ["Chicken broth", "2 cups"],
      ["Cumin", "2 tsp"], ["Oregano", "1 tsp"], ["Cilantro", "a handful"], ["Vegetable oil", "2 tbsp"], ["Salt", "2 tsp"], ["Flour tortillas", "8"]],
    steps: ["Broil the husked tomatillos, poblanos, jalapeños and quartered onion for 10 minutes, turning, until charred.", "Peel the poblanos and blend everything with the garlic and cilantro.",
      "Season the cubed pork with salt and brown it in the oil in batches, 8 minutes per batch.", "Add the green sauce, broth, cumin and oregano. Cover and simmer for 2 hours until tender.",
      "Serve with warm tortillas or rice."] },
  { e: "🥑", g: "mexican", name: "Chicken Tinga Tostadas", type: "dinner", minutes: 40, serves: 4, summary: "Smoky chipotle shredded chicken on crispy tostadas.",
    ingredients: [["Boneless chicken breasts", "1 1/2 lb"], ["Chipotle peppers in adobo", "7 oz can"], ["Crushed tomatoes", "15 oz can"], ["Onion", "1"], ["Garlic", "3 cloves"], ["Oregano", "1 tsp"],
      ["Chicken broth", "1/2 cup"], ["Vegetable oil", "1 tbsp"], ["Tostada shells", "12"], ["Refried beans", "1 can"], ["Lettuce", "2 cups shredded"], ["Sour cream", "1/2 cup"], ["Queso fresco", "1/2 cup"], ["Avocado", "1"]],
    steps: ["Poach the chicken in salted water for 15 minutes, then shred.", "Cook the sliced onion in the oil for 5 minutes and the garlic for 1 minute.",
      "Blend the tomatoes, 2 or 3 chipotles with some sauce, the oregano and broth. Pour it in and simmer for 5 minutes.", "Add the chicken and simmer for 5 minutes.",
      "Spread warm beans on the tostadas and top with chicken, lettuce, sour cream, cheese and avocado."] },
  /* ---- asian ---- */
  { e: "🍱", g: "asian", name: "Teriyaki Chicken", type: "dinner", minutes: 35, serves: 4, summary: "Glossy homemade teriyaki chicken with rice and broccoli.",
    ingredients: [["Boneless chicken thighs", "2 lb"], ["Soy sauce", "1/2 cup"], ["Brown sugar", "1/4 cup"], ["Honey", "2 tbsp"], ["Rice vinegar", "1 tbsp"], ["Garlic", "2 cloves"],
      ["Fresh ginger", "1 tsp grated"], ["Cornstarch", "1 tbsp"], ["Vegetable oil", "1 tbsp"], ["Rice", "1 1/2 cups"], ["Broccoli", "1 head"], ["Sesame seeds", "1 tsp"]],
    steps: ["Cook the rice, about 18 minutes.", "Whisk the soy sauce, sugar, honey, vinegar, garlic and ginger, plus the cornstarch mixed in 1/4 cup water.",
      "Cook the chicken in the oil for 6 minutes per side.", "Steam the broccoli for 4 minutes.", "Pour the sauce over the chicken and simmer for 3 minutes until thick. Slice and top with sesame seeds."] },
  { e: "🥡", g: "asian", name: "General Tso's Chicken", type: "dinner", minutes: 40, serves: 4, summary: "Crispy chicken in a sweet, tangy, a little spicy sauce.",
    ingredients: [["Boneless chicken thighs", "1 1/2 lb"], ["Cornstarch", "1/2 cup"], ["Egg", "1"], ["Vegetable oil", "1 cup"], ["Soy sauce", "1/4 cup"], ["Hoisin sauce", "2 tbsp"], ["Rice vinegar", "2 tbsp"],
      ["Sugar", "3 tbsp"], ["Chicken broth", "1/2 cup"], ["Garlic", "3 cloves"], ["Fresh ginger", "1 tbsp grated"], ["Crushed red pepper", "1/2 tsp"], ["Green onions", "3"], ["Rice", "1 1/2 cups"]],
    steps: ["Cook the rice, about 18 minutes.", "Cut the chicken into bites, toss with the egg, then with all but 1 tbsp of the cornstarch.",
      "Fry in hot oil in batches for 5 minutes until crisp. Drain.", "Whisk the soy, hoisin, vinegar, sugar, broth and the last 1 tbsp cornstarch.",
      "In 1 tbsp oil cook the garlic, ginger and red pepper for 30 seconds, add the sauce and simmer for 2 minutes.", "Toss in the chicken and top with green onions."] },
  { e: "🥜", g: "asian", name: "Pad Thai", type: "dinner", minutes: 35, serves: 4, summary: "Rice noodles with shrimp, egg and peanuts in a sweet-sour sauce.",
    ingredients: [["Rice noodles", "8 oz"], ["Shrimp", "1 lb"], ["Eggs", "2"], ["Bean sprouts", "2 cups"], ["Green onions", "4"], ["Garlic", "3 cloves"], ["Fish sauce", "3 tbsp"],
      ["Brown sugar", "3 tbsp"], ["Tamarind paste", "2 tbsp"], ["Limes", "2"], ["Roasted peanuts", "1/3 cup"], ["Vegetable oil", "3 tbsp"], ["Crushed red pepper", "1/2 tsp"]],
    steps: ["Soak the noodles in hot water for 10 minutes and drain.", "Whisk the fish sauce, sugar, tamarind, red pepper and the juice of 1 lime.",
      "Cook the shrimp in hot oil for 2 minutes per side. Set aside.", "Cook the garlic for 30 seconds, push aside and scramble the eggs for 1 minute.",
      "Add the noodles and sauce and toss for 3 minutes.", "Add the shrimp, sprouts and green onions for 1 minute. Top with chopped peanuts and lime wedges."] },
  { e: "🇰🇷", g: "asian", name: "Korean Beef Bulgogi", type: "dinner", minutes: 25, waitMinutes: 60, waitNote: "Marinate 1 hour", serves: 4, summary: "Thin-sliced sweet soy beef, seared fast over high heat.",
    ingredients: [["Ribeye or sirloin steak", "1 1/2 lb"], ["Soy sauce", "1/3 cup"], ["Brown sugar", "3 tbsp"], ["Sesame oil", "2 tbsp"], ["Garlic", "4 cloves"], ["Fresh ginger", "1 tbsp grated"],
      ["Pear or apple", "1/2"], ["Green onions", "4"], ["Sesame seeds", "1 tsp"], ["Vegetable oil", "1 tbsp"], ["Rice", "1 1/2 cups"]],
    steps: ["Slice the beef as thin as you can (20 minutes in the freezer makes it easier).", "Mix the soy, sugar, sesame oil, garlic, ginger and grated pear. Marinate the beef for 1 hour.",
      "Cook the rice, about 18 minutes.", "Sear the beef in a very hot pan in batches, 2 minutes per batch.", "Top with green onions and sesame seeds and serve over rice."] },
  { e: "🍛", g: "asian", name: "Thai Red Curry Chicken", type: "dinner", minutes: 35, serves: 4, summary: "Creamy coconut red curry with chicken and vegetables.",
    ingredients: [["Boneless chicken breasts", "1 1/2 lb"], ["Coconut milk", "2 cans (13.5 oz)"], ["Red curry paste", "3 tbsp"], ["Bell pepper", "1"], ["Green beans", "1 cup"], ["Onion", "1"],
      ["Fish sauce", "1 tbsp"], ["Brown sugar", "1 tbsp"], ["Lime", "1"], ["Basil", "a handful"], ["Vegetable oil", "1 tbsp"], ["Rice", "1 1/2 cups"]],
    steps: ["Cook the rice, about 18 minutes.", "Cook the sliced onion in the oil for 3 minutes, then the curry paste for 1 minute.", "Stir in the coconut milk and bring to a simmer.",
      "Add the sliced chicken and simmer for 8 minutes.", "Add the pepper and green beans for 5 minutes.", "Stir in the fish sauce, sugar, lime juice and basil."] },
  { e: "🍍", g: "asian", name: "Sweet & Sour Pork", type: "dinner", minutes: 45, serves: 4, summary: "Crispy pork with pineapple and peppers in sweet and sour sauce.",
    ingredients: [["Pork loin", "1 1/2 lb"], ["Cornstarch", "1/2 cup"], ["Egg", "1"], ["Vegetable oil", "1 cup"], ["Pineapple chunks", "20 oz can"], ["Bell peppers", "2"], ["Onion", "1"],
      ["Ketchup", "1/3 cup"], ["Rice vinegar", "1/4 cup"], ["Sugar", "1/4 cup"], ["Soy sauce", "2 tbsp"], ["Rice", "1 1/2 cups"]],
    steps: ["Cook the rice, about 18 minutes.", "Toss the pork cubes with the egg, then all but 1 tbsp of the cornstarch. Fry in batches for 5 minutes until golden.",
      "Whisk the pineapple juice from the can with the ketchup, vinegar, sugar, soy and last 1 tbsp cornstarch.", "Stir-fry the peppers and onion for 3 minutes, then the pineapple for 1 minute.",
      "Add the sauce and simmer for 2 minutes until thick. Toss in the pork."] },
  { e: "🍜", g: "asian", name: "Chicken Lo Mein", type: "dinner", minutes: 25, serves: 4, summary: "Takeout-style noodles with chicken and vegetables.",
    ingredients: [["Lo mein noodles or spaghetti", "12 oz"], ["Boneless chicken breasts", "1 lb"], ["Carrots", "2"], ["Cabbage", "2 cups shredded"], ["Green onions", "4"], ["Garlic", "3 cloves"],
      ["Soy sauce", "1/4 cup"], ["Oyster sauce", "2 tbsp"], ["Sesame oil", "1 tbsp"], ["Sugar", "1 tsp"], ["Vegetable oil", "2 tbsp"]],
    steps: ["Boil the noodles for 6 minutes and drain.", "Stir-fry the sliced chicken in the oil for 5 minutes.", "Add the carrots and cabbage for 3 minutes, then the garlic for 30 seconds.",
      "Add the noodles, soy, oyster sauce, sesame oil and sugar and toss for 2 minutes. Top with green onions."] },
  /* ---- mediterranean ---- */
  { e: "🍢", g: "greek", name: "Greek Chicken Souvlaki", type: "dinner", minutes: 30, waitMinutes: 60, waitNote: "Marinate 1 hour, or overnight", serves: 4, summary: "Lemon-oregano chicken skewers with homemade tzatziki and pita.",
    ingredients: [["Boneless chicken thighs", "2 lb"], ["Olive oil", "1/4 cup"], ["Lemons", "2"], ["Garlic", "4 cloves"], ["Oregano", "2 tsp dried"], ["Salt", "1 1/2 tsp"], ["Black pepper", "1/2 tsp"],
      ["Pita bread", "8"], ["Greek yogurt", "1 cup"], ["Cucumber", "1"], ["Dill", "1 tbsp"], ["Tomatoes", "2"], ["Red onion", "1"], ["Skewers", "8"]],
    steps: ["Cut the chicken into 1 1/2 inch pieces. Marinate with the oil, juice of 1 lemon, 3 garlic cloves, oregano, salt and pepper for 1 hour.",
      "Make tzatziki: grate the cucumber, squeeze it dry and mix with the yogurt, the last garlic clove, dill, a squeeze of lemon and salt.",
      "Thread the chicken onto skewers (soak wooden ones first).", "Grill or broil for 12 minutes, turning, until cooked through.",
      "Serve on warm pita with tzatziki, sliced tomato and red onion."] },
  { e: "🥙", g: "greek", name: "Chicken Shawarma", type: "dinner", minutes: 45, serves: 4, summary: "Sheet-pan spiced chicken in pita with hummus and garlic yogurt.",
    ingredients: [["Boneless chicken thighs", "2 lb"], ["Olive oil", "1/4 cup"], ["Lemon", "1"], ["Garlic", "3 cloves"], ["Cumin", "2 tsp"], ["Paprika", "2 tsp"], ["Coriander", "1 tsp"],
      ["Turmeric", "1/2 tsp"], ["Cinnamon", "1/4 tsp"], ["Salt", "1 1/2 tsp"], ["Red onion", "1"], ["Pita bread", "8"], ["Hummus", "1 cup"], ["Plain yogurt", "1/2 cup"], ["Lettuce", "2 cups"], ["Tomatoes", "2"]],
    steps: ["Heat the oven to 425°F. Mix the oil, lemon juice, 2 garlic cloves, spices and salt.", "Toss the chicken and onion wedges in it and spread on a sheet pan.",
      "Roast for 30 minutes, then broil for 3 minutes to char the edges.", "Stir the last garlic clove into the yogurt.", "Slice the chicken and serve in pita with hummus, lettuce, tomato and garlic yogurt."] },
  { e: "🫕", g: "greek", name: "Moussaka", type: "dinner", minutes: 130, serves: 8, summary: "Greek layered eggplant and spiced meat sauce under a creamy topping.",
    ingredients: [["Eggplants", "3"], ["Ground beef or lamb", "1 1/2 lb"], ["Onion", "1"], ["Garlic", "3 cloves"], ["Tomato sauce", "15 oz can"], ["Red wine", "1/2 cup"], ["Cinnamon", "1 tsp"],
      ["Oregano", "1 tsp"], ["Olive oil", "1/3 cup"], ["Butter", "4 tbsp"], ["Flour", "1/3 cup"], ["Milk", "3 cups"], ["Eggs", "2"], ["Parmesan cheese", "1/2 cup"], ["Nutmeg", "a pinch"], ["Salt", "2 tsp"]],
    steps: ["Heat the oven to 400°F. Slice the eggplant 1/2 inch thick, brush with oil, salt and roast for 25 minutes.",
      "Brown the meat and onion for 10 minutes, add the garlic, then the wine, tomato sauce, cinnamon and oregano. Simmer for 15 minutes.",
      "Melt the butter, stir in the flour for 1 minute, whisk in the milk and simmer for 5 minutes. Off the heat whisk in the eggs, Parmesan and nutmeg.",
      "Lower the oven to 350°F. Layer eggplant, meat sauce and more eggplant in a 9x13 dish and pour the white sauce over.", "Bake for 45 minutes until golden. Rest for 20 minutes before cutting."] },
  { e: "🍋", g: "greek", name: "Greek Lemon Chicken & Potatoes", type: "dinner", minutes: 70, serves: 4, summary: "Crispy chicken thighs roasted with lemony, oregano potatoes.",
    ingredients: [["Bone-in chicken thighs", "2 1/2 lb"], ["Yukon Gold potatoes", "2 lb"], ["Lemons", "2"], ["Olive oil", "1/3 cup"], ["Garlic", "6 cloves"], ["Oregano", "1 tbsp dried"],
      ["Chicken broth", "1 cup"], ["Salt", "2 tsp"], ["Black pepper", "1 tsp"]],
    steps: ["Heat the oven to 425°F. Whisk the oil, lemon zest and juice, garlic, oregano, salt and pepper.", "Toss the potato wedges and chicken in it.",
      "Arrange in a roasting pan with the chicken skin-side up and pour the broth around.", "Roast for 55 minutes, until the chicken reaches 165°F and the potatoes are tender.", "Broil for 3 minutes to crisp the skin."] },
  { e: "🥘", g: "greek", name: "Shakshuka", type: "dinner", minutes: 35, serves: 4, summary: "Eggs poached in a spiced tomato and pepper sauce, with feta and bread.",
    ingredients: [["Olive oil", "2 tbsp"], ["Onion", "1"], ["Red bell pepper", "1"], ["Garlic", "3 cloves"], ["Cumin", "1 tsp"], ["Paprika", "1 tsp"], ["Crushed red pepper", "a pinch"],
      ["Crushed tomatoes", "28 oz can"], ["Eggs", "6"], ["Feta cheese", "1/2 cup"], ["Parsley", "a handful"], ["Crusty bread", "1 loaf"], ["Salt", "1 tsp"]],
    steps: ["Cook the onion and pepper in the oil for 6 minutes.", "Add the garlic and spices for 1 minute.", "Add the tomatoes and salt and simmer for 10 minutes.",
      "Make 6 wells, crack in the eggs, cover and cook for 7 minutes until the whites set.", "Top with feta and parsley and serve with bread."] },
  { e: "🧆", g: "greek", name: "Falafel Pitas", type: "dinner", minutes: 40, serves: 4, summary: "Crispy chickpea falafel in pita with tahini sauce and salad.",
    ingredients: [["Chickpeas", "2 cans (15 oz)"], ["Onion", "1 small"], ["Garlic", "3 cloves"], ["Parsley", "1/2 cup"], ["Cumin", "2 tsp"], ["Coriander", "1 tsp"], ["Flour", "1/4 cup"],
      ["Baking powder", "1 tsp"], ["Salt", "1 tsp"], ["Vegetable oil", "for frying"], ["Pita bread", "6"], ["Tomatoes", "2"], ["Cucumber", "1"], ["Tahini", "1/3 cup"], ["Lemon", "1"]],
    steps: ["Drain the chickpeas and pat them very dry.", "Pulse them with the onion, garlic, parsley, spices and salt until coarse. Stir in the flour and baking powder and rest for 10 minutes.",
      "Shape into small patties and fry in 1/2 inch of oil for 3 minutes per side.", "Whisk the tahini with the lemon juice, a few tablespoons of water and a pinch of salt.",
      "Fill the pitas with falafel, tomato, cucumber and tahini sauce."] },
  /* ---- breakfast (more) ---- */
  { e: "🥓", g: "breakfast", name: "Bacon, Eggs & Home Fries", type: "breakfast", minutes: 30, serves: 4, summary: "The classic diner breakfast at home.",
    ingredients: [["Bacon", "8 slices"], ["Eggs", "8"], ["Potatoes", "1 1/2 lb"], ["Onion", "1"], ["Butter", "2 tbsp"], ["Paprika", "1/2 tsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"], ["Bread", "4 slices"]],
    steps: ["Boil the diced potatoes for 6 minutes and drain.", "Cook the bacon for 8 minutes until crisp. Set aside.",
      "Fry the potatoes and chopped onion in the bacon fat and butter with paprika, salt and pepper for 12 minutes until golden.", "Cook the eggs the way you like, about 3 minutes.", "Serve with toast."] },
  { e: "🍳", g: "breakfast", name: "Western Omelette", type: "breakfast", minutes: 15, serves: 2, summary: "Fluffy omelette with ham, peppers, onion and cheddar.",
    ingredients: [["Eggs", "6"], ["Ham", "1/2 cup diced"], ["Bell pepper", "1/2"], ["Onion", "1/4"], ["Shredded cheddar cheese", "1/2 cup"], ["Butter", "1 tbsp"], ["Milk", "2 tbsp"], ["Salt", "1/4 tsp"]],
    steps: ["Cook the diced pepper, onion and ham in half the butter for 4 minutes. Set aside.", "Whisk the eggs with the milk and salt.",
      "Cook the eggs in the rest of the butter for 2 minutes, lifting the edges so the raw egg runs under.", "Add the filling and cheese to one half, fold and cook for 1 minute more."] },
  { e: "🧇", g: "breakfast", name: "Belgian Waffles", type: "breakfast", minutes: 25, serves: 4, summary: "Crisp outside, fluffy inside.",
    ingredients: [["Flour", "2 cups"], ["Sugar", "2 tbsp"], ["Baking powder", "1 tbsp"], ["Salt", "1/2 tsp"], ["Milk", "1 3/4 cups"], ["Eggs", "2"], ["Butter", "1/2 cup"], ["Vanilla", "1 tsp"],
      ["Maple syrup", "to serve"], ["Strawberries", "1 cup"]],
    steps: ["Heat the waffle iron.", "Whisk the dry ingredients, then the milk, eggs, melted butter and vanilla in another bowl.", "Stir together until just mixed.",
      "Cook each waffle for 5 minutes until golden. Serve with syrup and berries."] },
  { e: "🥚", g: "breakfast", name: "Eggs Benedict", type: "breakfast", minutes: 30, serves: 4, summary: "Poached eggs and Canadian bacon on English muffins with hollandaise.",
    ingredients: [["English muffins", "4"], ["Canadian bacon", "8 slices"], ["Eggs", "11"], ["Butter", "1/2 cup"], ["Lemon", "1"], ["White vinegar", "1 tbsp"], ["Cayenne", "a pinch"], ["Salt", "1/2 tsp"]],
    steps: ["Hollandaise: whisk 3 egg yolks with 1 tbsp lemon juice over barely simmering water, slowly drizzling in the melted butter, for 3 minutes until thick. Season with salt and cayenne.",
      "Brown the Canadian bacon for 2 minutes and toast the muffins.", "Poach the other 8 eggs in simmering water with the vinegar for 3 minutes.",
      "Stack muffin, bacon and egg and spoon the hollandaise over."] },
  { e: "🧀", g: "breakfast", name: "Sausage & Egg Breakfast Casserole", type: "breakfast", minutes: 60, serves: 8, summary: "Feeds a crowd. You can put it together the night before and bake in the morning.",
    ingredients: [["Breakfast sausage", "1 lb"], ["Eggs", "10"], ["Milk", "2 cups"], ["Bread", "6 slices"], ["Shredded cheddar cheese", "2 cups"], ["Dry mustard", "1 tsp"], ["Salt", "1 tsp"], ["Black pepper", "1/2 tsp"], ["Green onions", "3"]],
    steps: ["Heat the oven to 350°F. Brown the sausage for 7 minutes.", "Layer the cubed bread, sausage and cheese in a greased 9x13 dish.",
      "Whisk the eggs, milk, mustard, salt and pepper and pour over.", "Bake for 45 minutes until set. Rest for 5 minutes and top with green onions."] },
  { e: "🫐", g: "breakfast", name: "Blueberry Muffins", type: "breakfast", minutes: 35, serves: 12, summary: "Bakery-style muffins bursting with berries. Makes 12.",
    ingredients: [["Flour", "2 cups"], ["Sugar", "3/4 cup"], ["Baking powder", "2 tsp"], ["Salt", "1/2 tsp"], ["Milk", "1/2 cup"], ["Vegetable oil", "1/3 cup"], ["Egg", "1"], ["Vanilla", "1 tsp"], ["Blueberries", "1 1/2 cups"]],
    steps: ["Heat the oven to 400°F and line a muffin tin.", "Whisk the flour, sugar, baking powder and salt.", "Whisk the milk, oil, egg and vanilla and stir into the dry ingredients until just mixed.",
      "Fold in the blueberries, fill the cups and sprinkle a little sugar on top.", "Bake for 20 minutes until golden."] },
  { e: "🥖", g: "breakfast", name: "Chouriço & Eggs", type: "breakfast", minutes: 20, serves: 4, summary: "Portuguese-style scrambled eggs with chouriço and onion on soft rolls.",
    ingredients: [["Chouriço", "1/2 lb"], ["Eggs", "8"], ["Onion", "1"], ["Olive oil", "1 tbsp"], ["Portuguese rolls", "4"], ["Salt", "1/4 tsp"], ["Black pepper", "1/4 tsp"], ["Parsley", "1 tbsp"]],
    steps: ["Brown the sliced chouriço in the oil for 4 minutes.", "Add the sliced onion and cook for 4 minutes.", "Pour in the beaten eggs and scramble gently for 3 minutes.",
      "Season, add the parsley and serve on the rolls."] },
  /* ---- breakfast ---- */
  { e: "🥞", g: "breakfast", name: "Pancakes", type: "breakfast", minutes: 30, serves: 4, summary: "Fluffy buttermilk pancakes.",
    ingredients: [["Flour", "2 cups"], ["Sugar", "2 tbsp"], ["Baking powder", "2 tsp"], ["Baking soda", "1/2 tsp"], ["Salt", "1/2 tsp"], ["Buttermilk", "2 cups"], ["Eggs", "2"], ["Butter", "4 tbsp"], ["Maple syrup", "to serve"]],
    steps: ["Whisk the dry ingredients in one bowl and the buttermilk, eggs and melted butter in another.", "Stir them together until just mixed (lumps are fine). Rest for 5 minutes.",
      "Pour 1/4 cup at a time onto a buttered griddle over medium heat.", "Cook for 2 minutes until bubbles form, flip and cook for 1 minute more."] },
  { e: "🌯", g: "breakfast", name: "Breakfast Burritos", type: "breakfast", minutes: 30, serves: 4, summary: "Eggs, sausage, potatoes and cheese wrapped up to go. Chouriço works great too.",
    ingredients: [["Eggs", "8"], ["Frozen hash browns", "3 cups"], ["Breakfast sausage", "1 lb"], ["Shredded cheddar cheese", "2 cups"], ["Large flour tortillas", "8"], ["Onion", "1"], ["Bell pepper", "1"],
      ["Butter", "1 tbsp"], ["Salsa", "1 jar"], ["Salt", "1/2 tsp"]],
    steps: ["Cook the hash browns until crisp, about 10 minutes.", "Brown the sausage with the diced onion and pepper for 7 minutes.",
      "Scramble the eggs in the butter for 3 minutes.", "Fill the tortillas with everything plus cheese and salsa and roll them up.", "Crisp them seam-side down in a hot pan for 1 minute."] },
  { e: "🍞", g: "breakfast", name: "French Toast", type: "breakfast", minutes: 20, serves: 4, summary: "Golden cinnamon French toast. Portuguese sweet bread makes it extra good.",
    ingredients: [["Thick bread or Portuguese sweet bread", "8 slices"], ["Eggs", "4"], ["Milk", "1 cup"], ["Cinnamon", "1 tsp"], ["Vanilla", "1 tsp"], ["Sugar", "1 tbsp"], ["Butter", "2 tbsp"], ["Maple syrup", "to serve"]],
    steps: ["Whisk the eggs, milk, cinnamon, vanilla and sugar.", "Dip each slice for 10 seconds per side.", "Cook in butter over medium heat for 3 minutes per side until golden. Serve with syrup."] }

, ...MORE_MEALS].map(m => ({ ...m, g: MEAL_REGROUP[m.name] || m.g, t: [m.t || "", MEAL_TAGS[m.name] || "", REGION_OF[m.name] || ""].join(" ").trim(),
  id: "q-" + slug(m.name), quick: true, v: MEAL_VERSIONS[m.name] || null, ingredients: m.ingredients.map(([item, amount]) => ({ item, amount, have: false })) }));
// One version of a meal (see meal-versions.js): the base recipe with that version's swaps, extra ingredients and rewritten steps.
// Versions always start from the built-in recipe, even when you've saved your own copy of the base.
function mealVersion(m, k) {
  const src = m.vbase || m, V = src.v, ver = k && V ? V.v.find(x => x.k === k) : null;
  if (!ver) return m;
  const own = (o, key) => o && Object.prototype.hasOwnProperty.call(o, key);
  let ingredients = ver.ingredients ? ver.ingredients.map(([item, amount]) => ({ item, amount, have: false }))
    : src.ingredients.flatMap(i => !own(ver.swap, i.item) ? [i] : ver.swap[i.item] ? [{ item: ver.swap[i.item][0], amount: ver.swap[i.item][1], have: false }] : []);
  if (ver.add) ingredients = ingredients.concat(ver.add.map(([item, amount]) => ({ item, amount, have: false })));
  const steps = Array.isArray(ver.steps) ? ver.steps.slice() : src.steps.map((t, i) => own(ver.steps, i) ? ver.steps[i] : t).filter(t => t != null);
  return { ...src, name: ver.name, id: src.id + "-" + ver.k, vk: ver.k, ingredients, steps, summary: ver.summary || src.summary,
    minutes: own(ver, "minutes") ? ver.minutes : src.minutes, waitMinutes: own(ver, "waitMinutes") ? ver.waitMinutes : src.waitMinutes,
    waitNote: own(ver, "waitNote") ? ver.waitNote : src.waitNote, savedQuick: false };
}
const mealVersionKeys = m => { const V = (m.vbase || m).v; return V ? V.v.map(x => x.k) : []; };
const quickRecipe = m => ({ ...cleanIdea(m), ingredients: m.ingredients.map(i => ({ ...i, have: false })), quick: true, e: m.e });

/* ---------- what's on hand: typed in, bought lately, or already on the shopping list ---------- */
// Same thing? "Ground beef" ~ "Ground Beef (80/20)", "Beef" ~ "Ground Beef"; but "Egg" ≠ "Egg Noodles", "Garlic" ≠ "Garlic Powder".
function sameFood(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  let s = termsOf(a), l = termsOf(b);
  if (!s.length || !l.length) return false;
  if (s.length > l.length) [s, l] = [l, s];
  const ls = new Set(l);
  if (!s.every(w => ls.has(w))) return false;
  return s.length >= 2 || s[0] === l[l.length - 1];
}
const listFoods = () => {
  const seen = new Set();
  return (S.listItems || []).map(li => li.name).filter(n => n && !isNonFood(n))
    .map(n => clip(n.replace(/\((\d[^)]*|[^)]*\b(oz|lb|lbs|ct|pack|pk|rolls?|gal|gallon|count|fl)\b[^)]*)\)/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim(), 60))
    .filter(n => { const k = norm(n); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
};
// "have" (typed in or bought lately), "list" (already on the shopping list) or "need"
function ingStatus(item) {
  if (C.ings.some(x => sameFood(x, item)) || iHave(item)) return "have";
  if (pantryHas(item)) return "have";
  if (boughtFoods().some(x => sameFood(x, item))) return "have";
  if ((S.listItems || []).some(li => !isNonFood(li.name) && sameFood(li.name, item))) return "list";
  return "need";
}
// Everything the meal ideas can use, depending on the switches.
function allIngredients() {
  const out = [], seen = new Set();
  const add = n => { const k = norm(n); if (k && !seen.has(k)) { seen.add(k); out.push(n); } };
  C.ings.forEach(add);
  if (C.usePantry) { useSoon().forEach(p => add(foodName(p.name))); pantryFoods().forEach(add); }
  if (C.useList) listFoods().forEach(add);
  if (C.useBought) boughtFoods().forEach(add);
  return out.slice(0, 80);
}
// Recipes → one review screen of what's missing (things you have or already have on the list are left out).
/* ---------- adding up amounts across meals: "1 lb" + "1 1/2 lb" = "2 1/2 lb" ---------- */
const VOL_TSP = { tsp: 1, teaspoon: 1, tbsp: 3, tablespoon: 3, tbs: 3, tbl: 3, cup: 48, c: 48, pint: 96, pt: 96, quart: 192, qt: 192, gallon: 768, gal: 768, ml: 0.2029, liter: 202.9, litre: 202.9, l: 202.9 };
const WT_OZ = { oz: 1, ounce: 1, lb: 16, lbs: 16, pound: 16, g: 0.03527, gram: 0.03527, kg: 35.27 };
const CONTAINER_RE = /\b(cans?|jars?|box(?:es)?|bottles?|bags?|packages?|pkgs?|packets?|envelopes?|sleeves?|loaf|loaves|bunch(?:es)?|heads?|containers?|tubs?)\b/i;
const COUNT_UNITS = /\b(cloves?|slices?|stalks?|sticks?|sprigs?|leaves|pieces?|fillets?|strips?)\b/i;
const numVal = t => String(t).trim().split(/\s+/).reduce((s, p) => s + (p.includes("/") ? +p.split("/")[0] / +p.split("/")[1] : +p), 0);
const singular = u => u.toLowerCase().replace(/^(box|bunch)es$/, "$1").replace(/^loaves$/, "loaf").replace(/^leaves$/, "leaf").replace(/s$/, "");
// "1 1/2 lb" → { kind: "wt", n: 24 }, "2 cans (15 oz)" → { kind: "can", n: 2 }, "3 cloves" → { kind: "clove", n: 3 }, "to taste" → null
function parseAmount(a) {
  let t = String(a || "").toLowerCase().replace(/[½¼¾⅓⅔⅛]/g, c => " " + FRACS[c]).trim();
  const m = t.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*/);
  if (!m) return null;
  const n = m[2] ? +m[2] : numVal(m[1]);   // a range like "4 to 5 lb": plan for the bigger number
  if (!(n > 0)) return null;
  let rest = t.slice(m[0].length);
  const cont = rest.replace(/\([^)]*\)/g, " ").match(CONTAINER_RE);
  if (cont) {
    const sized = /^(oz|ounces?|lb|lbs|pounds?|g|kg|ml)\b/.test(rest.replace(/^\(/, ""));   // "28 oz can" is one can
    return { kind: singular(cont[1]), n: sized ? 1 : n };
  }
  rest = rest.replace(/\([^)]*\)/g, " ").trim();
  const u = rest.match(/^(teaspoons?|tablespoons?|tsps?|tbsps?|tbs|tbl|cups?|c\b|pints?|pt|quarts?|qts?|gallons?|gal|ml|liters?|litres?|l\b|ounces?|oz|pounds?|lbs?|grams?|g\b|kg)/);
  if (u) {
    const w = u[1].replace(/s$/, "").replace(/^tsp$/, "tsp").replace(/^tbsp$/, "tbsp");
    if (VOL_TSP[w] != null) return { kind: "vol", n: n * VOL_TSP[w] };
    if (WT_OZ[w] != null) return { kind: "wt", n: n * WT_OZ[w] };
  }
  if (/^sticks?\b/.test(rest)) return { kind: "vol", n: n * 24 };   // a stick of butter is 8 tbsp
  const cu = rest.match(COUNT_UNITS);
  return { kind: cu ? singular(cu[1]) : "", n };
}
const fracText = x => {
  const w = Math.floor(x + 1e-9), fr = x - w;
  const opts = [[0, ""], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"], [1, ""]];
  let b = opts[0]; opts.forEach(o => { if (Math.abs(fr - o[0]) < Math.abs(fr - b[0])) b = o; });
  const W = b[0] === 1 ? w + 1 : w;
  return W && b[1] ? `${W} ${b[1]}` : W ? String(W) : (b[1] || "1/4");
};
const plural = (n, u) => !u ? "" : " " + (n > 1 && !/s$/.test(u) ? (u === "box" || u === "bunch" ? u + "es" : u === "loaf" ? "loaves" : u === "leaf" ? "leaves" : u + "s") : u);
function amountText(kind, n) {
  if (kind === "vol") {
    const cupsNeat = Math.abs(n % 12) < 0.01 || Math.abs(n % 16) < 0.01;   // a quarter or a third of a cup
    if (n >= 48 || (n >= 12 && cupsNeat)) return `${fracText(n / 48)} cup${n > 48 ? "s" : ""}`;
    if (n >= 3) return `${fracText(n / 3)} tbsp`;
    return `${fracText(n)} tsp`;
  }
  if (kind === "wt") return n >= 16 ? `${fracText(n / 16)} lb` : `${fracText(n)} oz`;
  return `${fracText(n)}${plural(n, kind)}`;
}
// Adds amounts of the same ingredient. Different kinds ("4 tbsp" + "1 stick") are listed side by side.
function sumAmounts(list) {
  const totals = new Map(), loose = [];
  list.forEach(x => {
    const a = typeof x === "string" ? x : x.a, f = typeof x === "string" ? 1 : (x.f || 1);
    const p = parseAmount(a);
    if (!p) { const t = String(a || "").trim(); if (t && !loose.includes(t)) loose.push(t); return; }
    totals.set(p.kind, (totals.get(p.kind) || 0) + p.n * f);
  });
  totals.forEach((n, k) => { if (k !== "vol" && k !== "wt") totals.set(k, Math.ceil(n - 0.05)); });   // you can't buy 1 1/3 onions
  return { text: [...[...totals].map(([k, n]) => amountText(k, n)), ...loose].join(" + "), totals };
}
// How many to put on the list: cans, jars, bunches, heads and the like; whole things like onions or lemons.
function listQty(name, totals) {
  for (const [k, n] of totals) {
    if (k && CONTAINER_RE.test(k)) return Math.max(1, Math.min(99, Math.ceil(n - 1e-6)));
  }
  const plain = totals.get("");
  if (plain && totals.size === 1 && plain <= 12 && !/egg|tortilla|shell|bun|roll|pita|slice|muffin|noodle|chip|cracker|bread|wing|thigh|breast|shrimp|scallop|strip|leaf|leaves|sprout/i.test(name))
    return Math.max(1, Math.min(99, Math.ceil(plain - 1e-6)));
  return 1;
}
// Same ingredient for adding up? Words like "shredded" or "fresh" don't matter; "crushed" tomatoes are not "tomatoes".
const PREP_WORDS = new Set(["fresh", "large", "small", "medium", "chopped", "diced", "minced", "sliced", "boneless", "skinless", "shredded", "grated",
  "whole", "ripe", "dried", "dry", "ground", "extra", "virgin", "cold", "warm", "softened", "melted", "peeled", "lean", "plain"].map(stem));
function sameIngredient(a, b) {
  if (norm(a) === norm(b)) return true;
  const core = t => termsOf(t).filter(w => !PREP_WORDS.has(w) || w === "ground").sort().join(" ");
  const x = core(a), y = core(b);
  return !!x && x === y;
}
// Recipes → one review screen of what's missing, with amounts added up across meals.
// Things you have, or that are already on the list, are left out. people: size every recipe for this many.
function recipesToList(recipes, people) {
  const need = new Map();
  recipes.forEach(r => {
    const f = people && r.serves ? people / r.serves : 1;
    (r.ingredients || []).forEach(i => {
      const name = clip(typeof i === "string" ? i : i.item, 80);
      if (!name || ingStatus(name) !== "need") return;
      const k = [...need.keys()].find(x => sameIngredient(x, name)) || name;
      if (!need.has(k)) need.set(k, { text: name.charAt(0).toUpperCase() + name.slice(1), meals: [], amounts: [], off: STAPLES.has(norm(name)) });
      const e = need.get(k);
      if (!e.meals.includes(r.name)) e.meals.push(r.name);
      const amt = typeof i === "string" ? "" : i.amount;
      if (amt) e.amounts.push({ a: amt, f });
    });
  });
  if (!need.size) { toast(recipes.length > 1 ? "You already have everything for those meals 🎉" : "You already have everything for this 🎉"); return; }
  const found = [...need.values()].map(e => {
    const sum = sumAmounts(e.amounts);
    const forWhat = e.meals.length > 1 ? e.meals.join(", ") : e.meals[0];
    return { text: e.text, written: e.text, qty: listQty(e.text, sum.totals), matchId: null, confidence: "high", off: e.off,
      note: (sum.text ? `Need ${sum.text} · ` : "") + `for ${forWhat}`, listNote: clip([sum.text, forWhat].filter(Boolean).join(" · "), 80) };
  });
  reviewScan(found, null, null, 0, { meals: recipes.length });
}
// Recipe amounts × servings: "1 1/2 lb" × 2 → "3 lb"
function scaleAmount(a, f) {
  if (!a || !isFinite(f) || Math.abs(f - 1) < 1e-6) return a;
  if (/^\s*[\d./ ]+\s*(oz|ounces?|lb|lbs|g|kg|ml)\s+(cans?|jars?|box(es)?|bottles?|bags?|packages?|tubs?|containers?)\b/i.test(a)) {   // a can's size doesn't change, the number of cans does
    const n = Math.max(1, Math.round(f * 2) / 2);
    return (n === 1 ? "" : `${fracText(n)} × `) + a;
  }
  const m = String(a).match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?/);
  if (!m) return a;
  const val = t => t.trim().split(/\s+/).reduce((s, p) => s + (p.includes("/") ? +p.split("/")[0] / +p.split("/")[1] : +p), 0);
  const fmt = x => {
    const w = Math.floor(x + 1e-9), fr = x - w;
    const opts = [[0, ""], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"], [1, ""]];
    let b = opts[0]; opts.forEach(o => { if (Math.abs(fr - o[0]) < Math.abs(fr - b[0])) b = o; });
    const W = b[0] === 1 ? w + 1 : w;
    return W && b[1] ? `${W} ${b[1]}` : W ? String(W) : (b[1] || "1/4");
  };
  const p = parseAmount(a);
  const whole = p && p.kind !== "vol" && p.kind !== "wt";   // onions, eggs, cans, cloves: no "1 2/3 onions"
  const r = x => !whole ? x : x < 2 ? Math.max(0.5, Math.round(x * 2) / 2) : Math.round(x);
  let out = fmt(r(val(m[1]) * f));
  if (m[3]) out += "–" + fmt(r(+m[3] * f));
  return out + String(a).slice(m[0].length);
}

/* ---------- meal groups: the first layer of the Meals menu ---------- */
// A meal can sit in several groups: its main group (g), any extra tags (t), plus Beef/Chicken/Pork/Seafood/Meatless
// worked out from its ingredients and ⚡ for anything ready in 30 minutes. Your own recipes stay in ★ My recipes.
// a: the little animation each icon does (see .ga-* in index.html).
const MEAL_SECTIONS = [["top", "Picks for you"], ["health", "Healthy & diet"], ["protein", "By protein"], ["world", "Around the world"], ["style", "Ways to cook"]];
const SEASONS = { winter: { e: "❄️", name: "Winter warmers", a: "spin" }, spring: { e: "🌸", name: "Spring picks", a: "spin" },
  summer: { e: "☀️", name: "Summer picks", a: "spin" }, fall: { e: "🍂", name: "Fall favorites", a: "leaf" } };
const seasonNow = (d = new Date()) => ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"][d.getMonth()];
const SEASON_GROUPS = { winter: ["soups", "slow"], spring: ["salads"], summer: ["grill", "salads"], fall: ["soups", "slow"] };
const MEAL_GROUPS = [
  { k: "season", s: "top", ...SEASONS[seasonNow()] }, { k: "quick", s: "top", e: "⚡", name: "30 min or less", a: "zap" }, { k: "mine", s: "top", e: "⭐", name: "My recipes", a: "spin" },
  { k: "hiprotein", s: "health", e: "💪", name: "High protein", a: "hop" }, { k: "light", s: "health", e: "⚖️", name: "Lighter meals", a: "sway" },
  { k: "lowcarb", s: "health", e: "🥦", name: "Low carb", a: "hop" }, { k: "gf", s: "health", e: "🌾", name: "Gluten-free", a: "sway" },
  { k: "df", s: "health", e: "🥛", name: "Dairy-free", a: "hop" },
  { k: "beef", s: "protein", e: "🐄", name: "Beef", a: "sway" }, { k: "chicken", s: "protein", e: "🐔", name: "Chicken", a: "peck" },
  { k: "pork", s: "protein", e: "🐷", name: "Pork & Sausage", a: "wiggle" }, { k: "seafood", s: "protein", e: "🐟", name: "Seafood", a: "fish" },
  { k: "meatless", s: "protein", e: "🥕", name: "Meatless", a: "hop" },
  { k: "american", s: "world", e: "🇺🇸", name: "American", a: "wave" },
  { k: "portuguese", s: "world", e: "🇵🇹", name: "Portuguese", a: "wave" }, { k: "mexican", s: "world", e: "🇲🇽", name: "Mexican", a: "wave" },
  { k: "italian", s: "world", e: "🇮🇹", name: "Italian", a: "wave" }, { k: "chinese", s: "world", e: "🇨🇳", name: "Chinese", a: "wave" },
  { k: "japanese", s: "world", e: "🇯🇵", name: "Japanese", a: "wave" }, { k: "korean", s: "world", e: "🇰🇷", name: "Korean", a: "wave" },
  { k: "thai", s: "world", e: "🇹🇭", name: "Thai", a: "wave" }, { k: "indian", s: "world", e: "🇮🇳", name: "Indian", a: "wave" },
  { k: "greek", s: "world", e: "🇬🇷", name: "Greek & Mediterranean", a: "wave" }, { k: "southern", s: "world", e: "🤠", name: "Southern & Cajun", a: "sway" },
  { k: "breakfast", s: "style", e: "🍳", name: "Breakfast", a: "flip" }, { k: "slow", s: "style", e: "🐢", name: "Slow cooker", a: "crawl" },
  { k: "onepot", s: "style", e: "🥘", name: "One-pot & sheet pan", a: "bubble" }, { k: "grill", s: "style", e: "🔥", name: "BBQ & grill", a: "flicker" },
  { k: "soups", s: "style", e: "🍲", name: "Soups & stews", a: "bubble" }, { k: "pasta", s: "style", e: "🍝", name: "Pasta", a: "twirl" },
  { k: "salads", s: "style", e: "🥗", name: "Salads", a: "toss" }, { k: "sandwiches", s: "style", e: "🥪", name: "Sandwiches & wraps", a: "hop" },
  { k: "comfort", s: "style", e: "🧸", name: "Comfort food", a: "hug" }, { k: "kids", s: "style", e: "🎈", name: "Kid favorites", a: "float" },
  { k: "budget", s: "style", e: "🪙", name: "Budget meals", a: "spin" }, { k: "desserts", s: "style", e: "🧁", name: "Desserts", a: "hop" },
  // American regions: no tile of their own, they're the chips inside 🇺🇸 American.
  { k: "newengland", s: "region", e: "🦞", name: "New England" }, { k: "midatlantic", s: "region", e: "🗽", name: "Mid-Atlantic & NY" },
  { k: "south", s: "region", e: "🍑", name: "The South" }, { k: "midwest", s: "region", e: "🌽", name: "Midwest" },
  { k: "southwest", s: "region", e: "🌵", name: "Southwest & Texas" }, { k: "west", s: "region", e: "🌲", name: "West Coast & Northwest" },
  { k: "hawaii", s: "region", e: "🌺", name: "Hawaii" }
];
const REGION_KEYS = MEAL_GROUPS.filter(g => g.s === "region").map(g => g.k);
// One home per meal, for lists that should show each meal once (like Plan the week).
const mealHome = m => m.g === "mine" || !m.g ? "mine" : m.g === "breakfast" ? "breakfast" : (m.minutes && m.minutes <= 30 && !m.waitMinutes && m.type !== "dessert" ? "quick" : m.g);
const NOT_MEAT = /\b(broth|stock|bouillon|soup mix|base)\b/i;
const PROTEINS = {
  beef: /\b(ground beef|beef|steaks?|sirloin|ribeye|chuck|brisket|short ribs|corned beef|meatballs|veal)\b/i,
  chicken: /\b(chicken|drumsticks|wings)\b/i,
  pork: /\b(pork|ham|ham hock|sausages?|kielbasa|chouriço|chourico|linguiça|linguica|andouille|prosciutto|carnitas)\b/i,
  seafood: /\b(shrimp|cod|salmon|haddock|fish|tuna|clams?|scallops?|catfish|tilapia|crab|lobster|mussels|seafood|bacalhau)\b/i
};
const OTHER_MEAT = /\b(bacon|pancetta|pepperoni|turkey|lamb|anchov(y|ies)|salami|gelatin)\b/i;
const mealTagCache = new WeakMap();
function proteinsOf(m) {
  const names = (m.ingredients || []).map(i => typeof i === "string" ? i : i.item || "");
  const items = names.filter(x => !NOT_MEAT.test(x) && !/fish sauce|oyster sauce/i.test(x));
  const keys = Object.entries(PROTEINS).filter(([, re]) => items.some(x => re.test(x))).map(([k]) => k);
  const anyMeat = keys.length > 0 || items.some(x => OTHER_MEAT.test(x)) || names.some(x => /chicken broth|beef broth|chicken stock|beef stock/i.test(x));
  return { keys, anyMeat };
}
// Opened from a protein (tile or chip), which version fits it? "" = the base recipe.
function versionFor(m, prefer) {
  const ks = mealVersionKeys(m);
  if (!ks.length || !prefer.length) return "";
  const direct = ks.find(k => prefer.includes(k));   // e.g. 🐢 Slow cooker opens Pot Roast's slow cooker version
  if (direct) return direct;
  prefer = prefer.filter(k => PROTEIN_KEYS.includes(k) || HEALTH_KEYS.includes(k) || DIET_KEYS.includes(k));
  if (!prefer.length) return "";
  const fits = mm => { const p = proteinsOf(mm), t = healthTags(mm);
    return prefer.every(k => k === "meatless" ? !p.anyMeat : PROTEIN_KEYS.includes(k) ? p.keys.includes(k) : t.has(k)); };
  if (fits(m)) return "";
  return ks.find(k => fits(mealVersion(m, k))) || "";
}
const PROTEIN_KEYS = ["beef", "chicken", "pork", "seafood", "meatless"];
const HEALTH_KEYS = Object.keys(HEALTH);
// 💪 / ⚖️ / 🥦 from the nutrition estimate (not for desserts), 🌾 / 🥛 when it is, or can be made, gluten- or dairy-free.
function healthTags(m) {
  const out = new Set(), sweet = m.type === "dessert" || m.g === "desserts";
  if (!sweet && m.ingredients && m.ingredients.length) {
    const n = nutrition(m.ingredients, m.serves);
    HEALTH_KEYS.forEach(k => HEALTH[k](n) && out.add(k));
  }
  DIET_KEYS.forEach(d => dietStatus(m.ingredients, d) !== "no" && out.add(d));
  return out;
}
function mealGroups(m) {
  if (mealTagCache.has(m)) return mealTagCache.get(m);
  const out = new Set();
  if (m.g === "mine" || !m.g) out.add("mine");
  else {
    out.add(m.g);
    String(m.t || "").split(/\s+/).filter(Boolean).forEach(t => out.add(t));
    if (out.has("southern")) out.add("south");
    if (REGION_KEYS.some(r => out.has(r))) out.add("american");
    if (m.savedQuick) out.add("mine");   // a built-in meal you ★ saved shows in My recipes too
  }
  const sweet = m.type === "dessert" || m.g === "desserts", morning = m.type === "breakfast";
  if (!sweet && !morning && m.minutes && m.minutes <= 30 && !m.waitMinutes) out.add("quick");
  if (!sweet && !morning && m.g !== "mine") {
    // Every version counts: Tacos with a chicken version shows under 🐔 Chicken, and a bean version makes it Meatless too.
    const all = [m, ...mealVersionKeys(m).map(k => mealVersion(m, k))].map(proteinsOf);
    all.forEach(p => p.keys.forEach(k => out.add(k)));
    if (all.some(p => !p.anyMeat)) out.add("meatless"); else out.delete("meatless");
  }
  // Healthy & diet: from the estimated nutrition and the gluten/dairy check, counting every version of the meal.
  for (const k of [...healthTags(m), ...mealVersionKeys(m).flatMap(v => [...healthTags(mealVersion(m, v))])]) out.add(k);
  const sz = seasonNow();
  if (out.has(sz) || SEASON_GROUPS[sz].some(k => out.has(k) && k === m.g)) out.add("season");
  mealTagCache.set(m, out);
  return out;
}
const inGroup = (m, k) => mealGroups(m).has(k);
// Which tiles a meal actually sits in. Tags (above) can overlap freely and still drive the chips inside a sheet,
// but within the "Around the world" and "Ways to cook" rows each meal gets ONE tile, so every tile has its own meals
// instead of the same dishes again. Its main group wins; otherwise the most specific cuisine
// (a Cajun dish lands on 🤠 Southern, not also 🇺🇸 American), or the style tile
// with the fewest meals so far (meals with fewest choices placed first, so small tiles don't get starved).
// "Picks for you" (season, 30 min) and "By protein" stay as they are: those are shortcuts across everything.
const ONE_TILE_ROWS = ["world", "style"];
const WORLD_LAST = ["american"];   // only if nothing more specific fits: Cajun → Southern, not also American
let tileHomeCache = null;
function tileHomes() {
  if (tileHomeCache) return tileHomeCache;
  const homes = new Map();   // meal name → { world: key, style: key }
  ONE_TILE_ROWS.forEach(row => {
    const keys = MEAL_GROUPS.filter(g => g.s === row).map(g => g.k);
    const count = Object.fromEntries(keys.map(k => [k, 0]));
    const todo = [];
    QUICK_MEALS.forEach(m => {
      const set = homes.get(m.name) || {}; homes.set(m.name, set);
      const tags = mealGroups(m), can = keys.filter(k => tags.has(k));
      if (keys.includes(m.g) && !(row === "world" && WORLD_LAST.includes(m.g) && can.some(x => !WORLD_LAST.includes(x)))) { set[row] = m.g; count[m.g]++; }
      else if (can.length) todo.push([m, can]);
    });
    if (row === "world") todo.forEach(([m, can]) => {
      const k = can.find(x => !WORLD_LAST.includes(x)) || WORLD_LAST.find(x => can.includes(x));
      homes.get(m.name).world = k; count[k]++;
    });
    else todo.sort((a, b) => a[1].length - b[1].length).forEach(([m, can]) => {
      const k = can.reduce((best, x) => count[x] < count[best] ? x : best);
      homes.get(m.name).style = k; count[k]++;
    });
  });
  return (tileHomeCache = homes);
}
function inTile(m, k) {
  if (!inGroup(m, k)) return false;
  const row = (MEAL_GROUPS.find(g => g.k === k) || {}).s;
  if (!ONE_TILE_ROWS.includes(row) || m.g === "mine" || !m.g) return true;
  const home = (tileHomes().get(m.name) || {})[row];
  return !home || home === k;
}
// The animated icon on each category tile. Seafood is a little school of fish in different colors.
function groupIcon(g, i) {
  const style = `--d:${(i * 0.37) % 3}s;--hue:${(i * 47) % 360}deg`;
  if (g.a === "fish")
    return h("span", { class: "qe gicon ga-fish", style, "aria-hidden": "true" },
      h("span", { class: "glow" }),
      ["🐟", "🐠", "🐡", "🐟"].map((f, n) => h("span", { class: "fish f" + n, text: f })));
  return h("span", { class: "qe gicon ga-" + (g.a || "hop"), style, "aria-hidden": "true" }, h("span", { class: "glow" }), h("span", { class: "gemo", text: g.e }));
}
function groupTile(g, i) {
  const n = allMeals().filter(m => inTile(m, g.k)).length;
  return h("button", { type: "button", class: "qtile gtile", onclick: () => openGroup(g.k), "aria-label": `${g.name}, ${n} meals` },
    groupIcon(g, i), h("span", { class: "qn", text: g.name }), h("span", { class: "qs ok", text: `${n} meal${n === 1 ? "" : "s"}` }));
}
// Category tiles in short rows you swipe sideways: Picks, By protein, Around the world, Ways to cook.
function mealSections() {
  let i = 0;
  return h("div", { class: "gsections" }, MEAL_SECTIONS.map(([sk, label]) => {
    const tiles = MEAL_GROUPS.filter(g => g.s === sk).map(g => groupTile(g, i++));
    if (sk === "top") tiles.push(h("button", { type: "button", class: "qtile gtile add", onclick: addRecipeFlow },
      h("span", { class: "qe", text: "＋" }), h("span", { class: "qn", text: "Add a recipe" }), h("span", { class: "qs ok", text: "photo · paste · type" })));
    return h("section", { class: "gsec" }, h("div", { class: "gsech" }, h("h3", { text: label }), h("span", { class: "lmeta", text: tiles.length > 3 ? "swipe →" : "" })),
      h("div", { class: "grow" }, tiles));
  }));
}
// Built-in meals plus your saved ones, each exactly once: a saved copy of a built-in meal takes its place.
function allMeals() {
  const saved = (S.recipes || []).slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const byName = new Map();
  saved.forEach(r => { const k = norm(r.name); if (k && !byName.has(k)) byName.set(k, r); });
  const out = QUICK_MEALS.map(m => {
    const sv = byName.get(norm(m.name));
    if (!sv) return m;
    byName.delete(norm(m.name));
    return { ...sv, e: m.e, g: m.g, t: m.t, savedQuick: true, vbase: m.v ? m : null };
  });
  byName.forEach(r => out.push({ ...r, e: "★", g: "mine" }));
  return out;
}
function mealTile(m0, prefer = []) {
  const vk = versionFor(m0, prefer), m = vk ? mealVersion(m0, vk) : m0;
  const n = m.ingredients.filter(i => ingStatus(typeof i === "string" ? i : i.item) === "need" && !STAPLES.has(norm(typeof i === "string" ? i : i.item))).length;
  return h("button", { type: "button", class: "qtile", onclick: () => openMeal(m0, vk, prefer.filter(k => DIET_KEYS.includes(k))) },
    h("span", { class: "qe", text: m.e || "★" }),
    h("span", { class: "qn", text: (m.savedQuick ? "★ " : "") + m.name }),
    h("span", { class: "qs" + (n ? "" : " ok"), text: n ? `Need ${n}` : "✓ Ready" }));
}
// A category sheet. Chips along the top narrow it further — Chicken + ⚡ 30 min + Mexican — and they stack.
function openGroup(k) {
  const g = MEAL_GROUPS.find(x => x.k === k);
  const s = openSheet(`${g.e} ${g.name}`);
  const picked = new Set();
  const draw = () => {
    s.body.textContent = "";
    const base = allMeals().filter(m => inTile(m, k));
    const meals = base.filter(m => [...picked].every(p => inGroup(m, p)));
    const order = k === "american" ? [...MEAL_GROUPS.filter(o => o.s === "region"), ...MEAL_GROUPS.filter(o => o.s !== "region")] : MEAL_GROUPS.filter(o => o.s !== "region");
    const chips = order.filter(o => o.k !== k && o.k !== "mine").map(o => ({ o, n: meals.filter(m => inGroup(m, o.k)).length }))
      .filter(({ o, n }) => picked.has(o.k) || (n > 0 && n < meals.length));
    put(s.body,
      chips.length ? h("div", { class: "fchips", role: "group", "aria-label": "Narrow it down" },
        picked.size ? h("button", { type: "button", class: "fchip clear", text: "✕ Clear", onclick: () => { picked.clear(); draw(); } }) : null,
        chips.map(({ o, n }) => h("button", { type: "button", class: "fchip" + (picked.has(o.k) ? " on" : ""), "aria-pressed": String(picked.has(o.k)),
          onclick: () => { picked.has(o.k) ? picked.delete(o.k) : picked.add(o.k); draw(); } }, `${o.e} ${o.name}`, picked.has(o.k) ? "" : h("span", { class: "fn", text: String(n) })))) : null,
      picked.size ? h("p", { class: "lmeta", style: "margin:6px 2px 0", text: `${meals.length} of ${base.length} meals` }) : null,
      meals.length ? h("div", { class: "qgrid" }, meals.map(m => mealTile(m, [k, ...picked])))
        : h("div", { class: "empty small" }, h("b", { text: k === "mine" ? "No recipes of your own yet" : "Nothing here yet" }),
            k === "mine" ? "Add one from a photo, pasted text, or type it in. Tap ★ Save on any recipe to keep it here too." : "Recipes you add that fit here show up automatically."),
      h("button", { class: "btn block", type: "button", style: "margin-top:12px", text: "＋ Add a recipe", onclick: () => { s.close(); addRecipeFlow(); } }));
  };
  draw();
}
const PEOPLE_CHOICES = [2, 4, 6, 8];
async function askPeople(current) {
  const v = await promptSheet("How many people?", "Number of people (1 to 50)", current ? String(current) : "", "OK", { type: "number", max: 3, placeholder: "e.g. 5 or 12" });
  const n = parseInt(v, 10);
  if (!v) return 0;
  if (!(n >= 1 && n <= MAX_PEOPLE)) { toast("Pick a number from 1 to 50"); return 0; }
  return n;
}
// 2 / 4 / 6 / 8, plus the number you used last if it's something else (like 5 or 12).
const peopleOptions = last => [...new Set([...PEOPLE_CHOICES, ...(last && !PEOPLE_CHOICES.includes(last) ? [last] : [])])].sort((a, b) => a - b);
// Tapping a meal: how many people? Then the recipe, sized for them (no AI).
async function openMeal(m, vk = "", diets = []) {
  const one = k => k ? quickRecipe(mealVersion(m, k)) : m.quick ? quickRecipe(m) : cleanIdea(m);
  const base = one(vk);
  if (!base) return;
  const recipeServes = base.serves || 4;
  const last = +lsGet("people") || 0;
  const pick = last || recipeServes;
  let n = await choose(`${m.e || "★"} ${base.name}`, "How many people are eating?",
    [...peopleOptions(last).map(x => ({ label: `${x} ${x === 1 ? "person" : "people"}`, value: x, cls: x === pick ? "primary" : "" })),
     { label: "Other…", value: "other" }, { label: "Cancel", value: null }]);
  if (n === "other") n = await askPeople(last);
  if (!n) return;
  lsSet("people", String(n));
  const f = n / recipeServes;
  const sized = (b, people) => ({ ...b, serves: people, ingredients: b.ingredients.map(i => ({ ...i, amount: scaleAmount(i.amount, people / (b.serves || 4)) })) });
  const V = (m.vbase || m).v;
  const variants = V ? { cur: vk, list: [{ k: "", e: V.e, label: V.label }, ...V.v.map(x => ({ k: x.k, e: x.e, label: x.label }))],
    make(k, people) { return { ...sized(one(k), people), variants: { ...variants, cur: k } }; } } : null;
  // Opened from 🌾 Gluten-free or 🥛 Dairy-free: make the swaps right away.
  let r = { ...sized(base, n), variants };
  diets.forEach(d => { if (dietStatus(r.ingredients, d, productDiet) === "swap") r = applyDiet(r, d, productDiet); });
  openRecipe(r);
}

/* ---------- your own recipes: photo, pasted text, or typed ---------- */
const FRACS = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8" };
const UNIT_RE = "(?:cups?|c\\.|tablespoons?|tbsps?|tbs|tbl|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|cans?|cloves?|pinch(?:es)?|dash(?:es)?|packages?|pkgs?|packets?|envelopes?|jars?|sticks?|slices?|bunch(?:es)?|heads?|quarts?|qts?|pints?|pts?|grams?|g|kg|ml|liters?|litres?|gallons?|gal|bottles?|bags?|boxes?|containers?|stalks?|sprigs?|handfuls?|pieces?|whole|large|medium|small)\\b\\.?";
// "2 cloves garlic, minced" → { amount: "2 cloves (minced)", item: "Garlic" }
function splitIngredient(line) {
  let t = String(line || "").replace(/[½¼¾⅓⅔⅛]/g, c => " " + FRACS[c]).replace(/^[\s\-–•*·▪◦□☐>]+/, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let amount = "";
  const q = t.match(/^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/);
  if (q) { amount = q[1]; t = t.slice(q[0].length); }
  const paren = t.match(/^\(([^)]{1,30})\)\s*/);
  if (paren && amount) { amount += ` (${paren[1]})`; t = t.slice(paren[0].length); }
  const u = t.match(new RegExp("^" + UNIT_RE + "\\s*", "i"));
  if (u && (amount || /^(pinch|dash|handful|whole)/i.test(u[0]))) {
    const u2 = t.slice(u[0].length).match(new RegExp("^" + UNIT_RE + "\\s*", "i"));   // "1 large can" → both words
    amount = (amount + " " + u[0].trim() + (u2 ? " " + u2[0].trim() : "")).trim();
    t = t.slice(u[0].length + (u2 ? u2[0].length : 0));
  }
  t = t.replace(/^of\s+/i, "");
  let prep = "";
  const comma = t.indexOf(",");
  if (comma > 0) { prep = t.slice(comma + 1).trim(); t = t.slice(0, comma).trim(); }
  const more = t.match(/\s*\((optional|to taste|divided|or more|about [^)]*)\)\s*$/i);
  if (more) { prep = [more[1], prep].filter(Boolean).join(", "); t = t.slice(0, more.index).trim(); }
  if (/\bto taste$/i.test(t)) { prep = [prep, "to taste"].filter(Boolean).join(", "); t = t.replace(/\s*,?\s*to taste$/i, ""); }
  if (!/[a-z]{2}/i.test(t)) return null;
  const item = clip(t.charAt(0).toUpperCase() + t.slice(1), 80);
  return { item, amount: clip([amount, prep && (amount ? `(${prep})` : prep)].filter(Boolean).join(" "), 40) };
}
function parseMinutes(s) {
  const t = String(s || "").toLowerCase();
  const hr = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/), mn = t.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  return Math.round((hr ? parseFloat(hr[1]) * 60 : 0) + (mn ? +mn[1] : 0));
}
// Turns recipe text (a cookbook page, a card, a website) into a name, servings, time, ingredients and steps.
function parseRecipeText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const head = l => l.replace(/[:\-–—.]+$/, "").trim();
  const isIngHead = l => /^(ingredients?|you(?:'| wi)ll need|what you(?:'ll)? need|shopping list)$/i.test(head(l));
  const isStepHead = l => /^(directions?|instructions?|method|steps?|preparation|how to make(?: it)?|to make|procedure)$/i.test(head(l));
  const qtyStart = l => /^[\s\-–•*·▪◦□☐]*([½¼¾⅓⅔⅛]|\d+\s*\/\s*\d+|\d+(\.\d+)?\s*(?:-|–|to)?\s*\d*\s*[a-z(½¼¾⅓⅔]|\d+\s*$)/i.test(l) && !/^\s*\d+[.)]\s+[A-Z]/.test(l);
  const looksIng = l => qtyStart(l) || /^[\-–•*·▪◦□☐]/.test(l) || (l.length <= 40 && l.split(" ").length <= 6 && !/[.!?]$/.test(l));
  let name = "", serves = 0, minutes = 0, mode = null;
  const ing = [], steps = [];
  const hasIngHead = lines.some(isIngHead);
  for (const l of lines) {
    let m;
    if (/^\d{1,4}\s+[A-Z][A-Z &'’-]+$|^[A-Z][A-Z &'’-]+\s+\d{1,4}$/.test(l) || /^(jump to recipe|print recipe|pin recipe|save recipe|advertisement)\b/i.test(l) || /\bjump to recipe\b/i.test(l)) continue;   // page headers, website buttons
    if (l.length < 60 && (m = l.match(/\b(?:serves|servings|yield|yields|makes)\b\s*:?\s*(?:about\s*)?(\d{1,2})/i))) { serves = +m[1]; continue; }
    if (l.length < 70 && /\b(total|cook|cooking|prep|bake|baking|ready in)\b.*\btime\b|\btime\b\s*:|ready in/i.test(l) && parseMinutes(l)) {
      const v = parseMinutes(l);
      if (/total|ready/i.test(l) || !minutes) minutes = /prep/i.test(l) && minutes ? minutes + v : (/total|ready/i.test(l) ? v : minutes + v);
      continue;
    }
    if (isIngHead(l)) { mode = "ing"; continue; }
    if (isStepHead(l)) { mode = "step"; continue; }
    if (!name && !mode && !qtyStart(l) && l.length <= 70) { name = l.replace(/^recipe\s*:\s*/i, ""); continue; }
    if (!mode && hasIngHead) continue;   // anything between the name and "Ingredients" is page clutter
    if (mode === "ing" && !(l.length > 70 && /[.!?]$/.test(l))) ing.push(l);
    else if (mode === "step" || mode === "ing") { mode = "step"; steps.push(l); }
    else (looksIng(l) ? ing : steps).push(l);
  }
  // Steps: a new step starts at "1." / "Step 2" or after a full stop; wrapped lines join the one before.
  const joined = [];
  steps.forEach(l => {
    const numbered = /^(?:step\s*)?\d{1,2}\s*[.):-]\s*/i.test(l);
    const body = l.replace(/^(?:step\s*)?\d{1,2}\s*[.):-]\s*/i, "").trim();
    if (!body) return;
    if (!numbered && joined.length && !/[.!?:)]$/.test(joined[joined.length - 1])) joined[joined.length - 1] += " " + body;
    else joined.push(body);
  });
  let st = joined.map(s => clip(s, 400));
  if (st.length > 20) st = [...st.slice(0, 19), clip(st.slice(19).join(" "), 400)];
  const ings = ing.map(splitIngredient).filter(Boolean).slice(0, 30);
  return { name: clip(titleCase(name || "My recipe"), 80), serves: serves || 4, minutes, ingredients: ings, steps: st };
}
async function addRecipeFlow() {
  const how = await choose("Add a recipe", "Snap a recipe card or a cookbook page, paste a recipe from a website or a message, or type it in. It's saved under ★ My recipes, just for you.",
    [{ label: "📸 Photo of a recipe", value: "cam", cls: "primary" }, { label: "🖼️ Choose photo", value: "lib" }, { label: "📋 Paste text", value: "paste" },
     { label: "✍️ Type it in", value: "type" }, { label: "🔤 Just the name", value: "name" }, { label: "Cancel", value: null }]);
  if (!how) return;
  if (how === "type") return recipeEditor(null);
  if (how === "name") { const n = await promptSheet("What dish?", "Name of the dish", "", "Put it together", { max: 80, placeholder: "e.g. Chicken Marsala, Bacalhau à Gomes de Sá" }); if (n) recipeFromName(n); return; }
  if (how === "paste") return pasteRecipe();
  const file = await pickImage(how === "cam");
  if (!file) return;
  const res = await freeRead(file, { engines: [3, 2], title: "Reading the recipe" });
  if (!res || !String(res.text || "").trim()) { toast("Couldn't read that photo. You can paste or type it instead."); return recipeEditor(null); }
  recipeEditor(parseRecipeText(res.text), { raw: res.text, img: res.img });
}
function pasteRecipe() {
  const s = openSheet("Paste a recipe");
  const ta = h("textarea", { class: "pastebox", rows: "10", placeholder: "Paste the whole recipe: the name, the ingredients and the steps.", "aria-label": "Recipe text" });
  put(s.body,
    navigator.clipboard && navigator.clipboard.readText ? h("button", { class: "btn block", type: "button", text: "📋 Paste from clipboard", onclick: async () => {
      try { const t = await navigator.clipboard.readText(); if (t) ta.value = t; else toast("Nothing copied yet"); } catch (e) { ta.focus(); toast("Long-press the box and choose Paste"); }
    } }) : null,
    ta,
    h("button", { class: "btn green block", type: "button", style: "margin-top:10px", text: "Read the recipe", onclick: () => {
      const t = ta.value.trim();
      if (!t) { toast("Paste the recipe first"); return; }
      s.close(); recipeEditor(parseRecipeText(t), { raw: t });
    } }));
  setTimeout(() => ta.focus(), 50);
}
// { amount: "1 large (chopped)", item: "Onion" } → "1 large Onion, chopped" (reads back the same way)
function ingLine(i) {
  let amt = String(i.amount || "").trim(), prep = "";
  const m = amt.match(/^(.*?)\s*\(([^)0-9]*)\)$/);
  if (m) { amt = m[1].trim(); prep = m[2].trim(); }
  if (amt && !/^([\d½¼¾⅓⅔⅛]|pinch|dash|handful|whole)/i.test(amt)) { prep = [amt, prep].filter(Boolean).join(", "); amt = ""; }
  return [amt, i.item].filter(Boolean).join(" ") + (prep ? ", " + prep : "");
}
// The recipe editor: check what was read, fix anything, save. Also used to edit a saved recipe.
function recipeEditor(r, opts = {}) {
  const editing = opts.editing || null;
  const d = r ? { name: r.name || "", serves: r.serves || 4, minutes: r.minutes || 0, ingredients: (r.ingredients || []).map(i => typeof i === "string" ? i : ingLine(i)).join("\n"),
    steps: (r.steps || []).join("\n\n"), notes: r.notes || "" } : { name: "", serves: 4, minutes: 0, ingredients: "", steps: "", notes: "" };
  const s = openSheet(editing ? "Edit recipe" : "Your recipe");
  let busy = false;
  const draw = () => {
    s.body.textContent = "";
    const field = (label, el) => h("label", { class: "fl" }, h("span", { text: label }), el);
    const nm = h("input", { value: d.name, maxlength: "80", placeholder: "e.g. Vovó's Kale Soup", oninput: e => { d.name = e.target.value; } });
    const sv = h("input", { type: "number", inputmode: "numeric", min: "1", max: String(MAX_PEOPLE), value: String(d.serves), oninput: e => { d.serves = parseInt(e.target.value, 10) || 0; } });
    const mn = h("input", { type: "number", inputmode: "numeric", min: "0", max: "600", value: d.minutes ? String(d.minutes) : "", placeholder: "e.g. 45", oninput: e => { d.minutes = parseInt(e.target.value, 10) || 0; } });
    const ig = h("textarea", { class: "pastebox", rows: "8", placeholder: "One per line, e.g.\n2 lb chicken thighs\n1 tsp paprika\n3 cloves garlic, minced", oninput: e => { d.ingredients = e.target.value; } });
    ig.value = d.ingredients;
    const stp = h("textarea", { class: "pastebox", rows: "8", placeholder: "One step per line (or leave a blank line between steps)", oninput: e => { d.steps = e.target.value; } });
    stp.value = d.steps;
    const nt = h("textarea", { class: "pastebox", rows: "2", maxlength: "500", placeholder: "Optional, e.g. from Grandma's book, page 12", oninput: e => { d.notes = e.target.value; } });
    nt.value = d.notes;
    const aiOk = !aiStatus().list.every(x => x.state === "day");
    put(s.body,
      opts.img ? h("img", { class: "sign-photo", src: opts.img, alt: "Your recipe photo" }) : null,
      opts.raw ? h("p", { class: "lmeta", text: "Check what was read and fix anything that's off. Each ingredient on its own line makes the shopping list work best." }) : null,
      field("Recipe name", nm),
      h("div", { class: "two" }, field("Serves", sv), field("Cooking time (minutes)", mn)),
      field("Ingredients", ig),
      field("Steps", stp),
      field("Notes", nt),
      opts.raw ? h("details", { class: "lens-help" }, h("summary", { text: "What the reader saw" }), h("pre", { class: "rawtext", text: clip(opts.raw, 4000) })) : null,
      h("div", { class: "actions", style: "margin-top:6px" },
        opts.raw && aiOk ? h("button", { class: "btn", type: "button", text: "✨ Tidy with AI", onclick: tidy }) : null,
        h("button", { class: "btn green", type: "button", text: editing ? "Save changes" : "Save recipe", onclick: save })));
  };
  async function tidy() {
    if (busy) return;
    busy = true;
    const p = progressSheet("Tidying the recipe");
    try {
      p.set("Fixing reading mistakes…");
      const res = await aiJSON([[
        "This is a recipe copied from a photo of a cookbook page or a handwritten card, or pasted from a website. It may have reading mistakes, broken lines or extra text like page numbers and ads.",
        "Turn it into clean JSON. Keep the cook's recipe exactly as written: same ingredients, amounts and steps. Only fix obvious reading mistakes and join broken lines.",
        "Put each ingredient on its own with its amount. Keep each step in order.",
        '{"name": string, "serves": number, "minutes": number (prep plus cooking, 0 if not given), "ingredients": [{"item": string, "amount": string}], "steps": [string]}',
        "Return only JSON.", "---", clip(opts.raw, 6000)].join("\n")], t => p.set(t), RECIPE_MODELS);
      const r2 = res && (res.recipe || res);
      if (!r2 || !Array.isArray(r2.ingredients)) throw new Error("no json");
      Object.assign(d, { name: clip(r2.name || d.name, 80), serves: Math.max(1, Math.min(20, parseInt(r2.serves, 10) || d.serves)), minutes: Math.max(0, Math.min(600, parseInt(r2.minutes, 10) || d.minutes)),
        ingredients: r2.ingredients.map(i => typeof i === "string" ? i : ingLine({ item: clip(i.item, 80), amount: clip(i.amount, 40) })).join("\n"),
        steps: (Array.isArray(r2.steps) ? r2.steps : []).map(x => clip(String(x), 400)).join("\n\n") });
      draw();
      toast("Tidied. Check it over, then save.");
    } catch (e) {
      console.error("tidy recipe", e);
      toast(scanErrorText(e));
    } finally { p.close(); busy = false; }
  }
  async function save() {
    if (busy) return;
    const name = clip(titleCase(d.name.trim()), 80);
    if (!name) { toast("Give the recipe a name"); return; }
    const ingredients = d.ingredients.split("\n").map(splitIngredient).filter(Boolean).slice(0, 30).map(i => ({ ...i, have: false }));
    if (!ingredients.length) { toast("Add at least one ingredient"); return; }
    let steps = d.steps.split(/\n\s*\n|\n/).map(x => x.replace(/^(?:step\s*)?\d{1,2}\s*[.):-]\s*/i, "").trim()).filter(Boolean).map(x => clip(x, 400));
    if (steps.length > 20) steps = [...steps.slice(0, 19), clip(steps.slice(19).join(" "), 400)];
    const rec = { name, type: "dinner", minutes: Math.max(0, Math.min(600, d.minutes || 0)), serves: Math.max(1, Math.min(MAX_PEOPLE, d.serves || 4)), summary: "",
      uses: [], missing: [], ingredients, steps, notes: clip(d.notes, 500), savedAt: Date.now() };
    const id = recipeId(rec);
    busy = true;
    try {
      await setDoc(doc(db, "users", uid(), "recipes", id), rec);
      if (editing && editing !== id) await deleteDoc(doc(db, "users", uid(), "recipes", editing)).catch(() => {});
    } catch (e) { busy = false; return fail(e); }
    busy = false;
    s.close();
    toast(editing ? "Recipe updated" : "Saved to ★ My recipes");
    if (S.tab === "create") renderCook();
    if (!editing) openRecipe(cleanIdea(rec));
  }
  draw();
}


// Type any dish: open it if you have it, otherwise put a full recipe together (one AI request, remembered for 30 days).
async function recipeFromName(raw) {
  const name = clip(String(raw || "").replace(/\s+/g, " ").trim(), 80);
  if (!name) return;
  const known = allMeals().find(m => norm(m.name) === norm(name)) || allMeals().find(m => sameFood(m.name, name));
  if (known) return openMeal(known);
  const key = "dish:" + norm(name);
  try { const hit = JSON.parse(lsGet(key) || "null"); if (hit && hit.r && Date.now() - hit.at < 30 * 864e5) return openMeal({ ...hit.r, e: "✨" }); } catch (e) {}
  if (aiStatus().list.every(x => x.state === "day")) {
    const c = await choose(`“${name}”`, `The free AI is resting until ${resetClock()}, so it can't write this recipe right now. You can add it yourself instead.`,
      [{ label: "✍️ Type it in", value: "type", cls: "primary" }, { label: "📋 Paste a recipe", value: "paste" }, { label: "Cancel", value: null }]);
    if (c === "type") recipeEditor({ name, serves: 4, ingredients: [], steps: [] });
    if (c === "paste") pasteRecipe();
    return;
  }
  const p = progressSheet(`Putting together ${name}`);
  try {
    p.set("Writing the recipe…");
    const prompt = [
      `You are an experienced home cook. Write a classic, family-style recipe for: "${name}".`,
      "If the name is a regional or family dish (for example Portuguese or New England cooking), make the traditional version.",
      "Serve 4 unless the dish is usually made in a bigger batch.",
      avoidRule(),
      ...RECIPE_RULES,
      `Return only JSON: ${RECIPE_JSON}`
    ].filter(Boolean).join("\n");
    const res = await aiJSON([prompt], t => p.set(t), RECIPE_MODELS);
    const r = cleanIdea(res && (res.recipe || res));
    if (!r || !r.ingredients.length || !r.steps.length) throw new Error("no json");
    r.ingredients = r.ingredients.map(i => ({ ...i, have: false }));
    p.close();
    try { lsSet(key, JSON.stringify({ at: Date.now(), r })); } catch (e) {}
    openMeal({ ...r, e: "✨" });
  } catch (e) {
    p.close();
    console.error("dish", e);
    await choose("Couldn't put the recipe together", `${scanErrorText(e)}\n\nYou can also type or paste the recipe yourself.`, [{ label: "OK", value: 1 }]);
  }
}

/* ---------- meals on the calendar ---------- */
const MEAL_MARK = "🍽 ";
const isMealEvent = ev => String(ev.title || "").startsWith(MEAL_MARK);
const mealByName = name => allMeals().find(m => norm(m.name) === norm(name)) || null;
const dinnerTime = () => { const v = lsGet("dinnerAt") || "18:00"; return /^\d{2}:\d{2}$/.test(v) ? v : "18:00"; };
const fmtClock = (hh, mm) => new Date(2000, 0, 1, hh, mm).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function startBy(minutes) {
  const [H, M] = dinnerTime().split(":").map(Number);
  const t = H * 60 + M - (minutes || 0);
  const d = ((t % 1440) + 1440) % 1440;
  return { text: fmtClock(Math.floor(d / 60), d % 60), mins: d };
}
function nextDays(n) {
  const out = [], base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    out.push({ key: dateKey(d), label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) });
  }
  return out;
}
async function planMealOn(name, date) {
  try { await addDoc(hcol("events"), { title: clip(MEAL_MARK + name, 140), date, createdAt: Date.now(), createdBy: uid() }); }
  catch (e) { fail(e); }
}
async function pickDayFor(r) {
  const days = nextDays(7);
  const key = await choose(`Plan ${r.name}`, "Which day are you making it?", [...days.map((d, i) => ({ label: d.label, value: d.key, cls: i === 0 ? "primary" : "" })), { label: "Cancel", value: null }]);
  if (!key) return;
  await planMealOn(r.name, key);
  const label = days.find(d => d.key === key).label;
  toast(`On the calendar for ${label.toLowerCase().startsWith("to") ? label.toLowerCase() : label}`, { label: "Google Calendar", fn: () => openGoogleCal(r, key) });
}
// A real reminder on your phone: opens Google Calendar with the cooking time filled in.
function openGoogleCal(r, key) {
  const mins = (r.minutes || 60);
  const [H, M] = dinnerTime().split(":").map(Number);
  const end = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), H, M);
  const start = new Date(end.getTime() - mins * 60000);
  const f = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  const url = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Cook " + r.name) +
    "&dates=" + f(start) + "/" + f(end) + (tz ? "&ctz=" + encodeURIComponent(tz) : "") +
    "&details=" + encodeURIComponent(`Start cooking ${r.name} (${fmtMins(mins)}) to eat at ${fmtClock(H, M)}.` + (r.waitMinutes ? ` Plan ahead: ${waitText(r)}.` : ""));
  window.open(url, "_blank", "noopener");
}
// "Tonight" and "Tomorrow" at the top of Meals: what's planned, when to start, anything still missing.
function plannedCard() {
  const days = nextDays(2);
  const evs = (S.events || []).filter(isMealEvent).filter(ev => days.some(d => d.key === ev.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!evs.length) return null;
  const rows = evs.map(ev => {
    const name = ev.title.slice(MEAL_MARK.length), m = mealByName(name);
    const r = m ? (m.quick ? quickRecipe(m) : cleanIdea(m)) : null;
    const today = ev.date === days[0].key;
    const need = r ? r.ingredients.filter(i => ingStatus(i.item) === "need" && !STAPLES.has(norm(i.item))) : [];
    const sb = r && r.minutes ? startBy(r.minutes) : null;
    return h("div", { class: "plan-today" },
      h("div", { style: "flex:1;min-width:0" },
        h("b", { text: `${today ? "Tonight" : "Tomorrow"}: ${(m && m.e) || "🍽"} ${name}` }),
        sb ? h("div", { class: "lmeta", text: `${fmtMins(r.minutes)} · start by ${sb.text} to eat at ${fmtClock(...dinnerTime().split(":").map(Number))}` }) : null,
        r && r.waitMinutes ? h("div", { class: "iwait", text: `⏳ ${today ? "Plan ahead" : "Tonight"}: ${waitText(r)}` }) : null,
        need.length ? h("div", { class: "imiss", text: `Still need: ${need.slice(0, 5).map(i => i.item).join(", ")}${need.length > 5 ? ` and ${need.length - 5} more` : ""}` }) : null),
      h("div", { class: "plan-acts" },
        r ? h("button", { class: "btn", type: "button", text: "Open", onclick: () => openRecipe(r) }) : null,
        r && need.length ? h("button", { class: "btn violet", type: "button", text: "Add to list", onclick: () => recipesToList([{ name, ingredients: need }]) }) : null,
        r && today ? h("button", { class: "btn green", type: "button", text: "▶ Cook", onclick: () => startCooking(r) }) : null));
  });
  return h("div", { class: "card planned" },
    h("div", { class: "ghead" }, h("h2", { text: "Coming up" }),
      h("button", { class: "link", type: "button", text: `Dinner at ${fmtClock(...dinnerTime().split(":").map(Number))}`, onclick: async () => {
        const v = await promptSheet("Dinner time", "What time do you usually eat?", dinnerTime(), "Save", { type: "time" });
        if (v && /^\d{2}:\d{2}$/.test(v)) { lsSet("dinnerAt", v); renderCook(); }
      } })),
    rows);
}

/* ---------- what you bought lately (checked off on a list), kept two weeks on this phone ---------- */
function boughtMap() { try { const m = JSON.parse(lsGet("bought") || "{}"); return m && typeof m === "object" ? m : {}; } catch (e) { return {}; } }
function noteBought(items) {
  const m = boughtMap(), now = Date.now();
  let ch = false;
  (items || []).forEach(i => {
    if (!i.inCart) return;
    const k = norm(i.name);
    if (!k) return;
    if (!m[k] || now - m[k].t > 2 * 864e5) { m[k] = { n: clip(i.name, 120), t: now }; ch = true; }
  });
  const cutoff = now - 14 * 864e5;
  Object.keys(m).forEach(k => { if (!m[k] || m[k].t < cutoff) { delete m[k]; ch = true; } });
  const keys = Object.keys(m);
  if (keys.length > 150) { keys.sort((a, b) => m[a].t - m[b].t).slice(0, keys.length - 150).forEach(k => delete m[k]); ch = true; }
  if (ch) { lsSet("bought", JSON.stringify(m)); boughtMemo.t = 0; }
}
// Food you bought lately, as plain ingredient names: "Frosted Flakes (Strawberry Milkshake)" → "Frosted Flakes Strawberry Milkshake"
let boughtMemo = { t: 0, v: [] };
function boughtFoods() {
  if (Date.now() - boughtMemo.t < 1500) return boughtMemo.v;
  boughtMemo = { t: Date.now(), v: boughtFoodsNow() };
  return boughtMemo.v;
}
function boughtFoodsNow() {
  return Object.values(boughtMap()).sort((a, b) => b.t - a.t).map(x => x.n).filter(n => !isNonFood(n))
    .map(n => clip(n.replace(/\((\d[^)]*|[^)]*\b(oz|lb|lbs|ct|pack|pk|rolls?|gal|gallon|count|fl)\b[^)]*)\)/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim(), 60))
    .filter(Boolean).slice(0, 40);
}
// Do I already have it (or is it already on the shopping list)?
const haveIt = item => ingStatus(item) !== "need";
const STAPLES = new Set(["salt", "pepper", "black pepper", "salt and pepper", "water", "olive oil", "vegetable oil", "oil", "cooking spray", "sugar", "flour", "butter", "garlic powder", "onion powder"]);
// Pick a few meals → put them on days → one shopping list of what's missing, matched to your items and sorted by aisle.
function planMeals() {
  const all = allMeals();
  const picked = new Map();   // id → date key or ""
  const days = nextDays(7);
  let people = +lsGet("people") || 4;
  const s = openSheet("Plan your meals");
  const nextFree = () => {   // the next day without a meal already planned
    const used = new Set([...picked.values(), ...(S.events || []).filter(isMealEvent).map(ev => ev.date)]);
    const d = days.find(x => !used.has(x.key)); return d ? d.key : "";
  };
  const draw = () => {
    s.body.textContent = "";
    const row = r => {
      const on = picked.has(r.id);
      return h("div", { class: "plan-row" },
        h("input", { type: "checkbox", checked: on, "aria-label": "Plan " + r.name, onchange: e => { e.target.checked ? picked.set(r.id, nextFree()) : picked.delete(r.id); draw(); } }),
        h("div", { style: "flex:1;min-width:0" }, h("b", { text: (r.e ? r.e + " " : "★ ") + (r.savedQuick ? "★ " : "") + r.name }),
          h("div", { class: "lmeta", text: [r.minutes ? fmtMins(r.minutes) : "", `${(r.ingredients || []).length} ingredients`].filter(Boolean).join(" · ") })),
        on ? h("select", { class: "daysel", "aria-label": "Day for " + r.name, onchange: e => { picked.set(r.id, e.target.value); } },
          h("option", { value: "", text: "No day", selected: !picked.get(r.id) }),
          days.map(d => h("option", { value: d.key, text: d.label, selected: picked.get(r.id) === d.key }))) : null);
    };
    put(s.body,
      h("p", { class: "msg", text: "Tick the meals you want and pick a day for each. They go on your calendar, and you get one shopping list of everything you're missing, with amounts added up across meals." }),
      h("div", { class: "rserve" }, h("b", { text: "Cooking for" }),
        h("div", { class: "seg", role: "group", "aria-label": "Cooking for" }, peopleOptions(people).map(n => h("button", { type: "button", class: "segb" + (people === n ? " on" : ""), "aria-pressed": String(people === n),
          text: `${n}`, onclick: () => { people = n; lsSet("people", String(n)); draw(); } })),
          h("button", { type: "button", class: "segb", text: "Other…", onclick: async () => { const n = await askPeople(people); if (n) { people = n; lsSet("people", String(n)); draw(); } } }))),
      MEAL_GROUPS.filter(g => g.s !== "region").map(g => { const ms = all.filter(m => mealHome(m) === g.k); return ms.length ? [h("h3", { class: "rh", text: `${g.e} ${g.name}` }), ms.map(row)] : null; }).flat(2).filter(Boolean),
      h("div", { class: "stickybar" }, h("button", { class: "btn green block", type: "button", disabled: !picked.size,
        text: picked.size ? `Plan ${picked.size} meal${picked.size === 1 ? "" : "s"} & build the list` : "Pick at least one meal",
        onclick: async () => {
          const chosen = all.filter(r => picked.has(r.id));
          s.close();
          let n = 0;
          for (const r of chosen) { const d = picked.get(r.id); if (d) { await planMealOn(r.name, d); n++; } }
          if (n) toast(`${n} meal${n === 1 ? "" : "s"} on the calendar`);
          recipesToList(chosen.map(r => r.quick ? quickRecipe(r) : cleanIdea(r) || r), people);
        } })));
  };
  draw();
}
// What the missing ingredients cost, from your items' prices (items sold by weight use the recipe's pounds).
function mealCost(list) {
  let sum = 0, priced = 0;
  const store = lsGet("lastStore") || "";
  list.forEach(x => {
    const name = typeof x === "string" ? x : x.item, amount = typeof x === "string" ? "" : x.amount;
    const m = localMatch(name, store), p = m ? priceNum(m.price) : null;
    if (p == null) return;
    let lbs = 1;
    if (isPerLb(m)) { const a = parseAmount(amount); if (a && a.kind === "wt") lbs = a.n / 16; }
    sum += p * lbs; priced++;
  });
  return { sum, priced, total: list.length };
}

/* =====================================================================
   SAVED RECIPES (private to each person: users/{me}/recipes)
   ===================================================================== */
const recipeId = r => (slug(r.name).slice(0, 40) || "recipe") + "-" + (Array.from(r.name + (r.steps[0] || "")).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 1e6);
const isSaved = r => (S.recipes || []).some(x => x.id === recipeId(r));
async function toggleSave(r) {
  const id = recipeId(r);
  try {
    if (isSaved(r)) { await deleteDoc(doc(db, "users", uid(), "recipes", id)); toast("Removed from saved recipes"); }
    else {
      const d = cleanIdea(r);
      await setDoc(doc(db, "users", uid(), "recipes", id), { name: d.name, type: d.type, minutes: d.minutes, waitMinutes: d.waitMinutes, waitNote: d.waitNote, serves: d.serves, summary: d.summary,
        uses: d.uses, missing: d.missing, ingredients: d.ingredients, steps: d.steps, savedAt: Date.now() });
      toast("Saved ★");
    }
  } catch (e) { fail(e); }
}

/* =====================================================================
   COOK MODE: big steps, screen stays on, tap or say "next", timers
   ===================================================================== */
const CM = { r: null, i: -1, el: null, wake: null, speak: false, listen: false, rec: null, saying: false, have: new Set() };
const timers = [];   // { id, label, ends, done }
let timerTick = null;

function findDurations(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  let m;
  while ((m = re.exec(text)) && out.length < 3) {
    const n = parseFloat(m[2] || m[1]);
    const u = m[3].toLowerCase();
    const secs = u.startsWith("h") ? n * 3600 : u.startsWith("s") ? n : n * 60;
    if (secs >= 10 && secs <= 6 * 3600) out.push({ secs: Math.round(secs), label: m[0].replace(/\s+/g, " ") });
  }
  return out;
}
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
function beep() {
  try {
    const A = window.AudioContext || window.webkitAudioContext; const ac = new A();
    [0, 0.35, 0.7].forEach(t => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.28); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.3); });
    setTimeout(() => ac.close && ac.close(), 1500);
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
}
function startTimer(secs, label) {
  timers.push({ id: Date.now() + Math.random(), label, ends: Date.now() + secs * 1000, done: false });
  if (!timerTick) timerTick = setInterval(tickTimers, 500);
  tickTimers();
}
function tickTimers() {
  const now = Date.now();
  for (const t of timers) {
    if (!t.done && now >= t.ends) {
      t.done = true; beep();
      toast(`⏰ Timer done: ${t.label}`);
      sayText(`Timer done. ${t.label}.`, true);
    }
  }
  if (!timers.some(t => !t.done) && timerTick) { clearInterval(timerTick); timerTick = null; }
  drawTimers();
}
function drawTimers() {
  const host = CM.el && CM.el.querySelector(".cm-timers");
  if (!host) return;
  host.textContent = "";
  timers.filter(t => !t.done || Date.now() - t.ends < 60000).forEach(t => host.append(
    h("div", { class: "cm-timer" + (t.done ? " done" : "") },
      h("span", { text: t.done ? "Done!" : fmtTime((t.ends - Date.now()) / 1000) }), h("small", { text: t.label }),
      h("button", { type: "button", "aria-label": "Stop timer", text: "✕", onclick: e => { e.stopPropagation(); timers.splice(timers.indexOf(t), 1); drawTimers(); } }))));
}

function sayText(text, force) {
  if ((!CM.speak && !force) || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    CM.saying = true;
    u.onend = u.onerror = () => { CM.saying = false; };
    speechSynthesis.speak(u);
  } catch (e) {}
}
const cmText = () => {
  const r = CM.r;
  if (CM.i < 0) return "First, get these ready: " + r.ingredients.map(i => (i.amount ? i.amount + " " : "") + i.item).join(", ") + ".";
  if (CM.i >= r.steps.length) return "All done. Enjoy your meal!";
  return `Step ${CM.i + 1}. ${r.steps[CM.i]}`;
};

async function keepAwake() {
  try { if ("wakeLock" in navigator && !CM.wake && document.visibilityState === "visible") { CM.wake = await navigator.wakeLock.request("screen"); CM.wake.addEventListener("release", () => { CM.wake = null; }); } } catch (e) {}
}
function onVis() { if (CM.el && document.visibilityState === "visible") keepAwake(); }

function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { CM.listen = false; toast("Voice control isn't available in this browser. Tap the screen instead."); drawCook(); return; }
  try {
    const r = new SR();
    CM.rec = r;
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US";
    r.onresult = e => {
      if (CM.saying) return;   // don't react to our own voice reading the step
      const said = String(e.results[e.results.length - 1][0].transcript || "").toLowerCase();
      if (/\b(next|forward|continue|done)\b/.test(said)) cmGo(1);
      else if (/\b(back|previous|go back)\b/.test(said)) cmGo(-1);
      else if (/\b(repeat|again|what)\b/.test(said)) sayText(cmText(), true);
      else if (/\btimer\b/.test(said)) { const d = CM.i >= 0 && CM.r.steps[CM.i] ? findDurations(CM.r.steps[CM.i])[0] : null; if (d) { startTimer(d.secs, d.label); sayText(`Timer started for ${d.label}.`, true); } }
    };
    r.onerror = e => { if (e.error === "not-allowed") { CM.listen = false; toast("Allow the microphone for this site to use voice control."); drawCook(); } };
    r.onend = () => { if (CM.listen && CM.el) { try { r.start(); } catch (e) {} } };
    r.start();
  } catch (e) { CM.listen = false; drawCook(); }
}
function stopListening() { CM.listen = false; try { CM.rec && CM.rec.stop(); } catch (e) {} CM.rec = null; }

function cmGo(d) {
  const max = CM.r.steps.length;
  const ni = Math.max(-1, Math.min(max, CM.i + d));
  if (ni === CM.i) return;
  CM.i = ni;
  drawCook();
  sayText(cmText());
}

function startCooking(r) {
  try { startCookingInner(r); }
  catch (e) {
    console.error("cook mode", e);
    try { closeCook(); } catch (x) {}
    choose("Couldn't start cook mode", `Something went wrong opening cook mode.\n\nDetails (for your developer): ${clip(String(e && (e.message || e)), 300)}`, [{ label: "OK", value: 1 }]);
  }
}
function startCookingInner(r) {
  closeCook();
  document.querySelectorAll(".scrim").forEach(e => e.remove());
  CM.r = r; CM.i = -1; CM.have = new Set();
  CM.speak = lsGet("cmSpeak") === "1";
  CM.el = h("div", { class: "cookmode", role: "dialog", "aria-modal": "true", "aria-label": "Cook mode: " + r.name });
  document.body.append(CM.el);
  document.body.classList.add("lock");
  keepAwake();
  document.addEventListener("visibilitychange", onVis);
  document.addEventListener("keydown", cmKeys);
  drawCook();
  sayText(cmText());
}
function cmKeys(e) {
  if (!CM.el) return;
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); cmGo(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); cmGo(-1); }
  else if (e.key === "Escape") closeCook();
}
function closeCook() {
  if (!CM.el) return;
  stopListening();
  try { speechSynthesis.cancel(); } catch (e) {}
  try { CM.wake && CM.wake.release(); } catch (e) {}
  CM.wake = null;
  document.removeEventListener("visibilitychange", onVis);
  document.removeEventListener("keydown", cmKeys);
  CM.el.remove(); CM.el = null;
  if (!document.querySelector(".scrim")) document.body.classList.remove("lock");
}

function drawCook() {
  const r = CM.r, el = CM.el;
  if (!el) return;
  const total = r.steps.length;
  el.textContent = "";
  const top = h("div", { class: "cm-top" },
    h("button", { type: "button", class: "cm-x", "aria-label": "Close cook mode", text: "✕", onclick: closeCook }),
    h("div", { class: "cm-title" }, h("b", { text: r.name }),
      h("span", { text: CM.i < 0 ? "Get ready" : CM.i >= total ? "Finished" : `Step ${CM.i + 1} of ${total}` })),
    h("button", { type: "button", class: "cm-tog" + (CM.speak ? " on" : ""), "aria-pressed": String(CM.speak), "aria-label": "Read steps aloud",
      onclick: () => { CM.speak = !CM.speak; lsSet("cmSpeak", CM.speak ? "1" : "0"); if (CM.speak) sayText(cmText()); else try { speechSynthesis.cancel(); } catch (e) {} drawCook(); } }, CM.speak ? "🔊" : "🔈"),
    h("button", { type: "button", class: "cm-tog" + (CM.listen ? " on" : ""), "aria-pressed": String(CM.listen), "aria-label": "Voice control",
      onclick: () => { if (CM.listen) stopListening(); else { CM.listen = true; startListening(); toast("Say “next”, “back”, “repeat” or “timer”"); } drawCook(); } }, CM.listen ? "🎙️" : "🎤"));
  const prog = h("div", { class: "cm-prog" }, h("i", { style: `width:${Math.round(((CM.i + 1) / (total + 1)) * 100)}%` }));

  let main;
  if (CM.i < 0) {
    main = h("div", { class: "cm-main cm-ready" },
      r.waitMinutes ? h("div", { class: "rwait cm-wait" }, h("b", { text: "⏳ Plan ahead" }), h("span", { text: waitText(r) })) : null,
      h("p", { class: "cm-lead", text: "Get these out first" }),
      h("ul", { class: "cm-ings" }, r.ingredients.map(i => {
        const on = CM.have.has(i.item);
        return h("li", {}, h("button", { type: "button", class: on ? "on" : "", "aria-pressed": String(on),
          onclick: e => { e.stopPropagation(); if (on) CM.have.delete(i.item); else CM.have.add(i.item); drawCook(); } },
          h("span", { class: "cm-box", text: on ? "✓" : "" }), h("span", { class: "cm-ing", text: i.item }), i.amount ? h("span", { class: "cm-amt", text: i.amount }) : null));
      })));
  } else if (CM.i >= total) {
    main = h("div", { class: "cm-main cm-done" }, h("p", { class: "cm-big", text: "All done. Enjoy! 🍽️" }),
      h("button", { type: "button", class: "btn primary", text: "Close cook mode", onclick: e => { e.stopPropagation(); closeCook(); } }));
  } else {
    const text = r.steps[CM.i];
    const durs = findDurations(text);
    main = h("div", { class: "cm-main" },
      h("p", { class: "cm-big", "aria-live": "polite", text }),
      durs.length ? h("div", { class: "cm-tbtns" }, durs.map(d => h("button", { type: "button", class: "btn violet",
        onclick: e => { e.stopPropagation(); startTimer(d.secs, d.label); toast(`Timer started: ${d.label}`); } }, `⏱ Start ${d.label} timer`))) : null);
  }
  // Big tap areas: left side goes back, right side goes forward.
  main.addEventListener("click", e => {
    if (e.target.closest("button")) return;
    const rect = main.getBoundingClientRect();
    cmGo(e.clientX - rect.left < rect.width * 0.35 ? -1 : 1);
  });
  put(el, top, prog, h("div", { class: "cm-timers" }), main,
    h("div", { class: "cm-nav" },
      h("button", { type: "button", class: "btn", disabled: CM.i < 0, onclick: () => cmGo(-1) }, "‹ Back"),
      CM.i < total ? h("button", { type: "button", class: "btn primary", onclick: () => cmGo(1) }, CM.i < 0 ? "Start cooking ›" : CM.i === total - 1 ? "Finish ›" : "Next ›") : null));
  drawTimers();
}

/* =====================================================================
   PANTRY: what's at home. Shared with your household, like the lists.
   Things in the pantry count as "have" for meals, so they stay off the list.
   ===================================================================== */
const pantryCol = () => hcol("pantry");
const pantryDoc = id => hdoc("pantry", id);
const PLACES = [["fridge", "🧊", "Fridge"], ["freezer", "❄️", "Freezer"], ["pantry", "🥫", "Pantry"], ["other", "🏠", "Other"]];
const LEVELS = [["plenty", "Plenty"], ["low", "Running low"], ["out", "Out"]];
const placeOf = k => PLACES.find(p => p[0] === k) || PLACES[3];
const levelName = k => (LEVELS.find(l => l[0] === k) || LEVELS[0])[1];
const P = { where: "all" };   // Pantry tab filter (this screen only)
// "Frosted Flakes (14 oz)" → "Frosted Flakes"
const foodName = n => clip(String(n || "").replace(/\((\d[^)]*|[^)]*\b(oz|lb|lbs|ct|pack|pk|rolls?|gal|gallon|count|fl)\b[^)]*)\)/gi, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim(), 60);

// Where it probably goes: frozen food in the freezer, meat and dairy in the fridge, the rest in the cupboard.
function guessPlace(name) {
  const n = norm(name), g = topGroup(groupScores(name));
  if (/\bfrozen\b|ice cream|popsicle/.test(n) || g === "frozen") return "freezer";
  if (g && NON_FOOD.has(g)) return "other";
  if (["dairy", "meat", "seafood", "deli"].includes(g)) return "fridge";
  if (g === "produce") return /banana|potato|onion|garlic|avocado|squash|melon|pumpkin/.test(n) ? "pantry" : "fridge";
  if (/\b(oj|orange juice|lemonade|hummus|salsa fresca|tofu)\b/.test(n)) return "fridge";
  return "pantry";
}
// A rough "use by" for fresh food in the fridge, in days (0 = don't guess). Always shown as an estimate.
function guessDays(name, where) {
  if (where !== "fridge") return 0;
  const n = norm(name), g = topGroup(groupScores(name));
  if (g === "seafood") return 2;
  if (g === "meat") return /bacon|hot dog|\bham\b|linguica|chourico|chorizo|pepperoni|salami/.test(n) ? 7 : 2;
  if (g === "deli") return 5;
  if (/berr|lettuce|spinach|greens|kale|herb|cilantro|parsley|basil|mushroom|sprout/.test(n)) return 4;
  if (/\beggs?\b/.test(n)) return 21;
  if (/cheese/.test(n)) return /ricotta|cottage|mozzarella|cream cheese/.test(n) ? 10 : 21;
  if (/yogurt|yoghurt|sour cream/.test(n)) return 10;
  if (/milk|\bcream\b|half and half|\boj\b|juice/.test(n)) return 7;
  if (g === "produce") return 7;
  return 0;
}
const addDays = (n, from = new Date()) => { const d = new Date(from); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return dateKey(d); };
const daysUntil = key => { if (!key) return null; const [y, m, d] = key.split("-").map(Number); const t = new Date(y, m - 1, d, 12); const n = new Date(); n.setHours(12, 0, 0, 0); return Math.round((t - n) / 864e5); };
const shortDate = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); };
function useByText(p) {
  const n = daysUntil(p.expires);
  if (n == null) return "";
  const est = p.est ? "~" : "";
  if (n < 0) return `⚠️ Past its date (${shortDate(p.expires)})`;
  if (n === 0) return `⏰ ${est}Use today`;
  if (n === 1) return `⏰ ${est}Use by tomorrow`;
  return `${n <= 2 ? "⏰ " : ""}${est}Use by ${shortDate(p.expires)}`;
}
const useSoon = () => (S.pantry || []).filter(p => p.level !== "out" && p.expires && daysUntil(p.expires) <= 2)
  .sort((a, b) => daysUntil(a.expires) - daysUntil(b.expires));
// The pantry entry for a food, if there is one: "Ground beef" finds "Ground Beef (80/20)".
// Remembered per pantry snapshot: meal tiles ask about the same ingredients many times.
let pmMemo = { src: null, m: new Map() };
function pantryMatch(name) {
  if (pmMemo.src !== S.pantry) pmMemo = { src: S.pantry, m: new Map() };
  const k = norm(name);
  if (pmMemo.m.has(k)) return pmMemo.m.get(k);
  const f = foodName(name) || name;
  const hit = (S.pantry || []).find(p => norm(p.name) === k || sameFood(foodName(p.name) || p.name, f)) || null;
  pmMemo.m.set(k, hit);
  return hit;
}
const pantryHas = name => { const p = pantryMatch(name); return !!p && p.level !== "out"; };
const pantryFoods = () => {
  const seen = new Set();
  return (S.pantry || []).filter(p => p.level !== "out" && !isNonFood(p.name)).map(p => foodName(p.name))
    .filter(n => { const k = norm(n); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 80);
};

// Something from the pantry onto the shopping list: your saved item if there is one (with its store, aisle and price).
function addNameToList(name) {
  const onList = (S.listItems || []).find(li => !li.inCart && (norm(li.name) === norm(name) || sameFood(foodName(li.name) || li.name, foodName(name) || name)));
  if (onList) { toast(`${onList.name} is already on ${listName()}`); return; }
  const matches = S.inventory.filter(i => norm(i.name) === norm(name) || norm(foodName(i.name)) === norm(foodName(name)));
  const last = lsGet("lastStore");
  const pick = matches.find(i => i.store === last) || matches[0];
  if (pick) return addToList(pick);
  addDoc(itemsCol(S.listId), { name: clip(name, 120), aisle: "", price: "", image: "", store: "Other",
    addedAt: Date.now(), inCart: false, qty: 1, inventoryId: null, addedBy: uid() }).catch(fail);
  toast(`Added ${name} to ${listName()}`);
}
function pantryData(v) {
  const d = { name: clip(v.name, 120), where: PLACES.some(p => p[0] === v.where) ? v.where : "pantry", level: LEVELS.some(l => l[0] === v.level) ? v.level : "plenty",
    qty: Math.max(1, Math.min(999, Math.round(Number(v.qty) || 1))), note: clip(v.note, 80),
    expires: /^\d{4}-\d{2}-\d{2}$/.test(v.expires || "") ? v.expires : "", est: !!(v.expires && v.est), updatedAt: Date.now() };
  if (/^\d{8,14}$/.test(v.upc || "")) d.upc = v.upc;
  return d;
}
async function setLevel(p, level) {
  try { await updateDoc(pantryDoc(p.id), { level, updatedAt: Date.now() }); } catch (e) { return fail(e); }
  if (level === "plenty") return;
  toast(`${p.name}: ${levelName(level).toLowerCase()}`, { label: "Add to list", fn: () => addNameToList(p.name) });
}

function renderPantry() {
  const host = $("#pantryBody");
  if (!host) return;
  host.textContent = "";
  if (!S.ready.pantry) { host.append(h("div", { class: "empty", text: "Loading…" })); return; }
  const all = (S.pantry || []).slice().sort(byName);
  const checked = (S.listItems || []).filter(i => i.inCart).length;
  const inp = h("input", { list: "invNames", maxlength: "120", placeholder: "＋ Add something you have…", enterkeyhint: "done", "aria-label": "Add to pantry" });
  const add = () => {
    const name = clip(inp.value, 120);
    if (!name) return;
    inp.value = "";
    const have = pantryMatch(name);
    if (have && norm(foodName(have.name)) === norm(foodName(name))) {
      updateDoc(pantryDoc(have.id), { level: "plenty", qty: Math.min(999, (have.qty || 1) + (have.level === "out" ? 0 : 1)), updatedAt: Date.now() }).catch(fail);
      toast(`${have.name}: marked as plenty`);
      return;
    }
    const where = guessPlace(name), days = guessDays(name, where);
    addDoc(pantryCol(), { ...pantryData({ name, where, level: "plenty", qty: 1, expires: days ? addDays(days) : "", est: !!days }), addedAt: Date.now(), addedBy: uid() }).catch(fail);
    toast(`Added ${name} to the ${placeOf(where)[2].toLowerCase()}`);
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });

  const soon = useSoon();
  const short = all.filter(p => p.level !== "plenty");
  const shown = P.where === "all" ? all : all.filter(p => (p.where || "pantry") === P.where);
  const count = k => all.filter(p => (p.where || "pantry") === k).length;

  const row = p => h("div", { class: "pitem" + (p.level === "out" ? " out" : "") },
    h("button", { class: "pbody", type: "button", onclick: () => openPantryItem(p) },
      h("span", { class: "pplace", "aria-hidden": "true", text: placeOf(p.where)[1] }),
      h("span", { class: "ptext" },
        h("span", { class: "lname", text: p.name + (p.qty > 1 ? ` ×${p.qty}` : "") }),
        (p.expires || p.note) ? h("span", { class: "lmeta" + (p.expires && daysUntil(p.expires) <= 2 && p.level !== "out" ? " soon" : "") },
          [useByText(p), p.note].filter(Boolean).join(" · ")) : null)),
    h("button", { type: "button", class: "lvl " + (p.level || "plenty"), "aria-label": `${p.name}: ${levelName(p.level)}. Tap to change.`,
      text: levelName(p.level), onclick: () => setLevel(p, p.level === "plenty" ? "low" : p.level === "low" ? "out" : "plenty") }));

  put(host,
    h("div", { class: "quick" }, inp, h("button", { class: "btn primary", type: "button", text: "Add", onclick: add })),
    h("div", { class: "actions ptools" },
      h("button", { class: "btn" + (checked ? " green" : ""), type: "button", onclick: putAway, disabled: !checked },
        checked ? `🧺 Put away groceries (${checked})` : "🧺 Put away groceries"),
      h("button", { class: "btn", type: "button", text: "🏷️ Scan", onclick: pantryScan })),
    !checked && !all.length ? null : !checked ? h("p", { class: "lmeta", style: "margin:4px 2px 0", text: "After shopping, items you checked off on the list can go straight in here." }) : null,
    all.length ? null : h("div", { class: "empty" }, h("b", { text: "Nothing in the pantry yet" }),
      "Add what's in your fridge, freezer and cupboards. Meals then know what you have, and it stays off your shopping list.",
      h("p", { class: "lmeta", text: "Fastest way: check things off on your list while you shop, then tap “Put away groceries”." })),
    soon.length ? h("div", { class: "card pcard" }, h("h2", { text: "⏰ Use soon" }),
      h("div", { class: "gcard" }, soon.map(row)),
      h("button", { class: "btn block", type: "button", style: "margin-top:10px", text: "🍳 Meal ideas with these", onclick: () => { C.ideas = null; setTab("create"); toast("Use-soon items go first in “Ideas from what you have”"); } })) : null,
    short.length ? h("div", { class: "card pcard" }, h("div", { class: "ghead" }, h("h2", { text: "🛒 Running low or out" }),
        h("button", { class: "btn small", type: "button", text: "Add all to list", onclick: () => short.forEach(p => addNameToList(p.name)) })),
      h("div", { class: "gcard" }, short.map(row))) : null,
    all.length ? h("div", { class: "seg wrap pseg", role: "group", "aria-label": "Show" },
      [["all", "All", all.length], ...PLACES.map(p => [p[0], `${p[1]} ${p[2]}`, count(p[0])])].filter(x => x[0] === "all" || x[2]).map(([k, label, n]) =>
        h("button", { type: "button", class: "segb" + (P.where === k ? " on" : ""), "aria-pressed": String(P.where === k), text: `${label} (${n})`,
          onclick: () => { P.where = k; renderPantry(); } }))) : null,
    ...PLACES.map(([k, e, label]) => {
      const rows = shown.filter(p => (p.where || "pantry") === k);
      return rows.length ? h("section", { class: "group" }, h("div", { class: "ghead" }, h("h2", { text: `${e} ${label}` }), h("span", { text: String(rows.length) })),
        h("div", { class: "gcard" }, rows.map(row))) : null;
    }));
}

function openPantryItem(p, prefill) {
  const editing = !!p;
  const v = p ? { ...p } : { name: "", where: "pantry", level: "plenty", qty: 1, note: "", expires: "", est: false, upc: "", ...(prefill || {}) };
  if (!editing && v.name && !(prefill && prefill.where)) v.where = guessPlace(v.name);
  const s = openSheet(editing ? p.name : "Add to pantry");
  const draw = () => {
    s.body.textContent = "";
    const seg = (list, key, fmt) => h("div", { class: "seg wrap", role: "group" }, list.map(x => h("button", { type: "button", class: "segb" + (v[key] === x[0] ? " on" : ""),
      "aria-pressed": String(v[key] === x[0]), text: fmt(x), onclick: () => { v[key] = x[0]; draw(); } })));
    const date = h("input", { type: "date", value: v.expires || "", "aria-label": "Use by", onchange: e => { v.expires = e.target.value; v.est = false; draw(); } });
    put(s.body,
      h("label", { class: "fl" }, h("span", { text: "Name" }),
        h("input", { value: v.name, maxlength: "120", list: "invNames", placeholder: "e.g. Chicken thighs", oninput: e => { v.name = e.target.value; } })),
      h("h3", { class: "rh", text: "Where" }), seg(PLACES, "where", x => `${x[1]} ${x[2]}`),
      h("h3", { class: "rh", text: "How much is left" }), seg(LEVELS, "level", x => x[1]),
      h("div", { class: "qty" },
        h("button", { "aria-label": "Fewer", text: "−", onclick: () => { v.qty = Math.max(1, (v.qty || 1) - 1); draw(); } }), h("b", { text: String(v.qty || 1) }),
        h("button", { "aria-label": "More", text: "+", onclick: () => { v.qty = Math.min(999, (v.qty || 1) + 1); draw(); } })),
      h("h3", { class: "rh", text: "Use by" + (v.est && v.expires ? " (estimate)" : "") }),
      h("div", { class: "pdate" }, date,
        h("div", { class: "qchips" }, [["3 days", 3], ["1 week", 7], ["1 month", 30]].map(([l, n]) =>
          h("button", { type: "button", class: "xchip", text: `+${l}`, onclick: () => { v.expires = addDays(n); v.est = false; draw(); } })),
          v.expires ? h("button", { type: "button", class: "xchip", text: "No date", onclick: () => { v.expires = ""; v.est = false; draw(); } }) : null)),
      h("label", { class: "fl" }, h("span", { text: "Note (optional)" }),
        h("input", { value: v.note || "", maxlength: "80", placeholder: "e.g. top shelf, half a bag", oninput: e => { v.note = e.target.value; } })),
      v.upc ? h("div", { class: "lmeta", text: `🏷️ Barcode ${v.upc}` }) : null,
      h("div", { class: "menu", style: "margin-top:12px" },
        h("button", { class: "btn green", type: "button", text: editing ? "Save" : "Add to pantry", onclick: save }),
        h("button", { class: "btn", type: "button", text: "🛒 Add to shopping list", onclick: () => { addNameToList(v.name || (p && p.name)); } }),
        editing ? h("button", { class: "btn danger", type: "button", text: "✓ Used it up (remove)", onclick: usedUp }) : null));
  };
  async function save() {
    const name = clip(v.name, 120);
    if (!name) { toast("Add a name"); return; }
    const data = pantryData({ ...v, name });
    try {
      if (editing) await updateDoc(pantryDoc(p.id), data);
      else await addDoc(pantryCol(), { ...data, addedAt: Date.now(), addedBy: uid() });
    } catch (e) { return fail(e); }
    s.close();
    toast(editing ? "Saved" : `Added ${name}`);
  }
  async function usedUp() {
    const { id, ...data } = p;
    s.close();
    try { await deleteDoc(pantryDoc(id)); } catch (e) { return fail(e); }
    toast(`Removed ${p.name}`, { label: "Add to list", fn: () => addNameToList(p.name) });
  }
  draw();
}

// After shopping: everything checked off on the list goes into the pantry in one go.
function putAway() {
  const items = (S.listItems || []).filter(i => i.inCart).map(listView);
  if (!items.length) { toast("Check things off on your list first"); return; }
  const rows = items.map(i => {
    const where = (pantryMatch(i.name) || {}).where || guessPlace(i.name), days = guessDays(i.name, where);
    return { it: i, on: true, where, days };
  });
  let clear = true;
  const s = openSheet("Put away groceries");
  const draw = () => {
    s.body.textContent = "";
    const n = rows.filter(r => r.on).length;
    put(s.body,
      h("p", { class: "msg", text: "Where does everything go? Fresh food gets an estimated use-by date you can change later." }),
      rows.map(r => h("div", { class: "sr" + (r.on ? "" : " off") },
        h("input", { type: "checkbox", class: "sr-on", checked: r.on, "aria-label": "Put away " + r.it.name, onchange: e => { r.on = e.target.checked; draw(); } }),
        h("div", { class: "sr-main" },
          h("div", { class: "sn", text: r.it.name + (qtyOf(r.it) > 1 && !isPerLb(r.it) ? ` ×${qtyOf(r.it)}` : "") }),
          h("select", { class: "daysel", "aria-label": "Where " + r.it.name + " goes", onchange: e => { r.where = e.target.value; r.days = guessDays(r.it.name, r.where); draw(); } },
            PLACES.map(([k, e, l]) => h("option", { value: k, text: `${e} ${l}`, selected: r.where === k }))),
          r.days ? h("span", { class: "lmeta", text: `  ~use by ${shortDate(addDays(r.days))}` }) : null,
          pantryMatch(r.it.name) ? h("div", { class: "lmeta", text: `Already in the pantry as “${pantryMatch(r.it.name).name}”: it'll be marked as plenty.` }) : null))),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: clear, onchange: e => { clear = e.target.checked; } }), `Then clear them off “${listName()}”`),
      h("button", { class: "btn green block", type: "button", style: "margin-top:8px", disabled: !n, text: n ? `Put away ${n} item${n === 1 ? "" : "s"}` : "Pick at least one", onclick: save }));
  };
  async function save() {
    const pick = rows.filter(r => r.on);
    const ops = [], now = Date.now();
    pick.forEach(r => {
      const have = pantryMatch(r.it.name);
      const q = isPerLb(r.it) ? 1 : qtyOf(r.it);
      if (have) {
        const u = { level: "plenty", where: r.where, qty: Math.min(999, (have.level === "out" ? 0 : (have.qty || 1)) + q), updatedAt: now };
        if (r.days) { u.expires = addDays(r.days); u.est = true; }
        ops.push(b => b.update(pantryDoc(have.id), u));
      } else {
        const ref = doc(pantryCol());
        ops.push(b => b.set(ref, { ...pantryData({ name: foodName(r.it.name) || r.it.name, where: r.where, level: "plenty", qty: q,
          expires: r.days ? addDays(r.days) : "", est: !!r.days }), addedAt: now, addedBy: uid() }));
      }
    });
    s.close();
    try { await commitOps(ops); } catch (e) { return fail(e); }
    if (clear) {
      const listId = S.listId, done = pick.map(r => r.it._orig || r.it).map(({ id, _orig, ...data }) => ({ id, data }));
      try { await commitOps(done.map(c => b => b.delete(itemDoc(listId, c.id)))); } catch (e) { console.warn(e); }
      toast(`Put away ${pick.length} item${pick.length === 1 ? "" : "s"} 🧺`, { label: "Undo list", fn: () => commitOps(done.map(c => b => b.set(itemDoc(listId, c.id), { ...c.data, addedBy: uid() }))).catch(fail) });
    } else toast(`Put away ${pick.length} item${pick.length === 1 ? "" : "s"} 🧺`);
    setTab("pantry");
  }
  draw();
}

// Scan a barcode in the pantry: find it, or add it with the product's name.
async function pantryScan() {
  const code = await scanBarcode();
  if (!code) return;
  const u = normUpc(code);
  const have = (S.pantry || []).find(p => p.upc && normUpc(p.upc) === u);
  if (have) {
    const c = await choose(have.name, `It's in the ${placeOf(have.where)[2].toLowerCase()} (${levelName(have.level).toLowerCase()}).`,
      [{ label: "I bought more", value: "more", cls: "green" }, { label: "Used it up", value: "gone" }, { label: "Edit", value: "edit" }, { label: "Cancel", value: null }]);
    if (c === "more") { updateDoc(pantryDoc(have.id), { level: "plenty", qty: Math.min(999, (have.level === "out" ? 0 : have.qty || 1) + 1), updatedAt: Date.now() }).catch(fail); toast(`${have.name}: plenty`); }
    if (c === "gone") { deleteDoc(pantryDoc(have.id)).catch(fail); toast(`Removed ${have.name}`, { label: "Add to list", fn: () => addNameToList(have.name) }); }
    if (c === "edit") openPantryItem(have);
    return;
  }
  const item = S.inventory.find(i => i.upc && normUpc(i.upc) === u);
  let name = item ? item.name : "";
  if (!name) {
    const p = progressSheet("Looking it up"); p.set("Checking the free product database…");
    const info = await lookupBarcode(code);
    p.close();
    name = info ? info.name : "";
    if (!info) toast("Not in the product database. Type the name.");
  }
  const where = name ? guessPlace(name) : "pantry", days = name ? guessDays(name, where) : 0;
  openPantryItem(null, { name: foodName(name) || name, upc: u, where, expires: days ? addDays(days) : "", est: !!days });
}

/* =====================================================================
   PRICE HISTORY: every price you save, read off a tag or a receipt is kept
   (just for you) so you can see what things cost where, and when they go up.
   ===================================================================== */
const priceCol = () => collection(db, "users", uid(), "prices");
const priceKey = name => slug(foodName(name) || name);
const PRICE_KEEP = 60, PRICE_DAYS = 120;
const pricePts = name => { const d = S.prices && S.prices.get(priceKey(name)); return d && Array.isArray(d.pts) ? d.pts.filter(p => p && p.p > 0 && p.s) : []; };
// entries: [{ name, store, price, per, src, was, wasAt }] → resolves with the prices that went up: [{ name, store, from, to, per }]
async function recordPrices(entries) {
  if (!uid() || !S.prices) return [];
  const now = Date.now(), work = new Map(), jumps = [];
  for (const e of entries || []) {
    const p = priceNum(e.price), store = clip(e.store, 80), name = clip(foodName(e.name) || e.name, 120);
    if (!(p > 0) || !store || !name) continue;
    const per = e.per === "lb" ? "lb" : "", k = priceKey(name);
    if (!work.has(k)) work.set(k, { name, pts: pricePts(name).slice() });
    const w = work.get(k);
    const here = w.pts.filter(x => x.s === store && (x.per || "") === per);
    const was = priceNum(e.was);
    if (!here.length && was > 0 && Math.abs(was - p) > 0.004) here.push(w.pts[w.pts.push({ p: was, s: store, d: Math.min(now - 1, e.wasAt || now - 1), per, src: "before" }) - 1]);
    const prev = here[here.length - 1];
    if (prev && Math.abs(prev.p - p) < 0.005 && now - prev.d < 20 * 3600e3) continue;   // same price today: nothing new
    if (prev && p > prev.p * 1.1 && p - prev.p >= 0.2) jumps.push({ name, store, from: prev.p, to: p, per });
    w.pts.push({ p: Math.round(p * 100) / 100, s: store, d: now, per, src: clip(e.src || "edit", 10) });
  }
  const ops = [];
  work.forEach((w, k) => {
    const pts = w.pts.sort((a, b) => a.d - b.d).slice(-PRICE_KEEP);
    const data = { name: w.name, pts, updatedAt: now };
    S.prices.set(k, { ...data, id: k });   // show it straight away
    ops.push(b => b.set(doc(priceCol(), k), data));
  });
  if (ops.length) commitOps(ops).catch(e => console.warn("price history", e));
  return jumps;
}
const jumpText = j => `${j.name} ${money(j.from)} → ${money(j.to)}${j.per ? "/lb" : ""}`;
function jumpsToast(prefix, jumps) {
  if (!jumps.length) { if (prefix) toast(prefix); return; }
  const msg = `📈 ${jumps.length === 1 ? jumpText(jumps[0]) + " (up " + Math.round((jumps[0].to / jumps[0].from - 1) * 100) + "%)" : jumps.length + " prices went up"}`;
  toast((prefix ? prefix + " · " : "") + msg, { label: "See", fn: () => openPrices(jumps) });
}
// Latest price at each store (last 120 days), from your history plus your saved items.
function latestByStore(name, per) {
  const out = new Map(), cutoff = Date.now() - PRICE_DAYS * 864e5;
  pricePts(name).forEach(pt => { if ((pt.per || "") === (per || "") && pt.d >= cutoff && (!out.has(pt.s) || out.get(pt.s).d <= pt.d)) out.set(pt.s, pt); });
  (invByFood().get(norm(foodName(name) || name)) || []).forEach(i => {
    if (!i.store || (isPerLb(i) ? "lb" : "") !== (per || "")) return;
    const p = priceNum(i.price);
    if (p > 0 && !out.has(i.store)) out.set(i.store, { p, s: i.store, d: i.updatedAt || i.createdAt || 0, per: per || "", src: "item" });
  });
  return out;
}
let ibfMemo = { src: null, m: null };
function invByFood() {
  if (ibfMemo.src === S.inventory && ibfMemo.m) return ibfMemo.m;
  const m = new Map();
  (S.inventory || []).forEach(i => { const k = norm(foodName(i.name) || i.name); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
  ibfMemo = { src: S.inventory, m };
  return m;
}
// A noticeably better price somewhere else? (at least 5% and 10¢ less)
function cheaperAt(it) {
  const mine = priceNum(it.price);
  if (!(mine > 0) || !it.store) return null;
  let best = null;
  latestByStore(it.name, isPerLb(it) ? "lb" : "").forEach((pt, s) => {
    if (s === it.store) return;
    if (pt.p <= mine * 0.95 && mine - pt.p >= 0.1 && (!best || pt.p < best.p)) best = pt;
  });
  return best;
}
const ago = d => { if (!d) return ""; const n = Math.round((Date.now() - d) / 864e5); return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 14 ? `${n} days ago` : new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
// A tiny line of one store's prices over time. One series, so no legend; the numbers are listed beside it.
function sparkline(pts) {
  const ns = "http://www.w3.org/2000/svg", W = 360, H = 44, pad = 6;   // about the sheet's real size, so the dot stays round
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "spark"); svg.setAttribute("aria-hidden", "true");
  if (pts.length < 2) return svg;
  const ps = pts.map(p => p.p), lo = Math.min(...ps), hi = Math.max(...ps), t0 = pts[0].d, t1 = pts[pts.length - 1].d;
  const x = d => pad + (t1 > t0 ? (d - t0) / (t1 - t0) : 0.5) * (W - 2 * pad), y = p => hi > lo ? pad + (hi - p) / (hi - lo) * (H - 2 * pad) : H / 2;
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", pts.map(p => `${x(p.d).toFixed(1)},${y(p.p).toFixed(1)}`).join(" "));
  svg.append(line);
  const last = pts[pts.length - 1], dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", x(last.d).toFixed(1)); dot.setAttribute("cy", y(last.p).toFixed(1)); dot.setAttribute("r", "4");
  svg.append(dot);
  return svg;
}
const SRC_LABEL = { receipt: "receipt", tag: "price tag", edit: "typed in", before: "earlier price", item: "saved item", bulk: "update" };
function openPriceItem(name) {
  const s = openSheet(`📈 ${foodName(name) || name}`);
  const pts = pricePts(name);
  const pers = [...new Set(pts.map(p => p.per || ""))];
  if (!pers.length) pers.push("");
  put(s.body, pers.map(per => {
    const now = latestByStore(name, per);
    const stores = [...new Set([...pts.filter(p => (p.per || "") === per).map(p => p.s), ...now.keys()])];
    const cheapest = [...now.values()].sort((a, b) => a.p - b.p)[0];
    const u = per ? "/lb" : "";
    return [
      cheapest && now.size > 1 ? h("p", { class: "msg", text: `Cheapest lately: ${money(cheapest.p)}${u} at ${cheapest.s} (${ago(cheapest.d)}).` }) : null,
      stores.map(st => {
        const mine = pts.filter(p => p.s === st && (p.per || "") === per).sort((a, b) => a.d - b.d);
        const latest = mine[mine.length - 1] || now.get(st);
        if (!latest) return null;
        const ps = mine.map(p => p.p);
        return h("div", { class: "phist" },
          h("div", { class: "phead" }, storeTag(st), h("div", { style: "flex:1;min-width:0" }, h("div", { class: "sn", text: st }),
            h("div", { class: "lmeta", text: mine.length > 1 ? `Low ${money(Math.min(...ps))}${u} · High ${money(Math.max(...ps))}${u}` : `Seen ${ago(latest.d)}` })),
            h("div", { class: "pnow" }, h("b", { text: money(latest.p) + u }), h("div", { class: "lmeta", text: ago(latest.d) }))),
          mine.length > 1 ? sparkline(mine) : null,
          mine.length ? h("details", {}, h("summary", { text: `All ${mine.length} price${mine.length === 1 ? "" : "s"}` }),
            h("div", { class: "plist" }, mine.slice().reverse().map(p => h("div", {},
              h("span", { text: new Date(p.d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }) }),
              h("span", { class: "lmeta", text: SRC_LABEL[p.src] || "" }), h("b", { text: money(p.p) + u }))))) : null);
      })];
  }).flat(2).filter(Boolean),
  !pts.length ? h("p", { class: "lmeta", text: "No history yet. Prices are kept each time you save one, read a price tag or scan a receipt." }) : null);
}
// What changed lately: anything that went up at the same store in the last 60 days.
function recentJumps() {
  const out = [], cutoff = Date.now() - 60 * 864e5;
  (S.prices ? [...S.prices.values()] : []).forEach(d => {
    const pts = (d.pts || []).slice().sort((a, b) => a.d - b.d), seen = new Set();
    for (let i = pts.length - 1; i > 0; i--) {
      const cur = pts[i], key = cur.s + "|" + (cur.per || "");
      if (seen.has(key)) continue;
      seen.add(key);
      if (cur.d < cutoff) continue;
      const prev = pts.slice(0, i).reverse().find(x => x.s === cur.s && (x.per || "") === (cur.per || ""));
      if (prev && cur.p > prev.p * 1.1 && cur.p - prev.p >= 0.2) out.push({ name: d.name, store: cur.s, from: prev.p, to: cur.p, per: cur.per || "", d: cur.d });
    }
  });
  return out.sort((a, b) => b.d - a.d);
}
function openPrices(highlight) {
  const s = openSheet("📈 Prices");
  const q = h("input", { type: "search", placeholder: "🔍 Search prices…", "aria-label": "Search prices" });
  const list = h("div");
  const docs = () => (S.prices ? [...S.prices.values()] : []).filter(d => (d.pts || []).length).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const fill = () => {
    list.textContent = "";
    const t = norm(q.value);
    const jumps = t ? [] : (highlight && highlight.length ? highlight : recentJumps()).slice(0, 12);
    if (jumps.length) list.append(h("h3", { class: "rh", text: "📈 Went up lately" }),
      h("div", { class: "gcard" }, jumps.map(j => h("button", { class: "srow", type: "button", onclick: () => openPriceItem(j.name) },
        h("div", { style: "flex:1;text-align:left" }, h("div", { class: "sn", text: j.name }), h("div", { class: "sc", text: j.store })),
        h("span", { class: "pup", text: `${money(j.from)} → ${money(j.to)}${j.per ? "/lb" : ""}` })))));
    const all = docs().filter(d => !t || norm(d.name).includes(t));
    list.append(h("h3", { class: "rh", text: t ? `${all.length} match${all.length === 1 ? "" : "es"}` : `All prices (${all.length})` }));
    if (!all.length) list.append(h("p", { class: "lmeta", text: t ? "Nothing matches." : "No prices kept yet. Each time you save a price, read a price tag or scan a receipt, it's added here, just for you." }));
    all.slice(0, 200).forEach(d => {
      const pers = [...new Set(d.pts.map(p => p.per || ""))];
      const parts = pers.map(per => [...latestByStore(d.name, per).values()].sort((a, b) => a.p - b.p).map(pt => `${pt.s} ${money(pt.p)}${per ? "/lb" : ""}`)).flat();
      list.append(h("button", { class: "srow", type: "button", onclick: () => openPriceItem(d.name) },
        h("div", { style: "flex:1;text-align:left;min-width:0" }, h("div", { class: "sn", text: d.name }), h("div", { class: "sc", text: parts.join(" · ") || "No recent prices" })),
        h("span", { class: "chev", text: "›" })));
    });
  };
  q.addEventListener("input", fill);
  put(s.body, h("p", { class: "lmeta", text: "Kept just for you, from prices you save, price tags and receipts. Other people never see them." }), q, list);
  fill();
}

/* =====================================================================
   YOUR DATA: download everything the app keeps about you.
   ===================================================================== */
async function exportMyData() {
  const p = progressSheet("Gathering your data");
  try {
    const rows = async ref => { try { return (await getDocs(ref)).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { return []; } };
    p.set("Your recipes, items and prices…");
    const [recipes, myItems, prices, aisleMaps] = await Promise.all([rows(collection(db, "users", uid(), "recipes")), rows(mineCol()), rows(priceCol()), rows(myAisleCol())]);
    p.set("Your household's lists and pantry…");
    const lists = [];
    for (const l of S.lists || []) lists.push({ ...l, items: await rows(itemsCol(l.id)) });
    const out = {
      app: "Visual Shopping List", version: APP_VERSION, exportedAt: new Date().toISOString(),
      account: { uid: uid(), email: S.user.email || "", name: myName(), households: S.userDoc.households || {} },
      yours: { recipes, myItems: myItems.map(({ image, ...x }) => ({ ...x, hasPhoto: !!image })), prices, aisleMaps },
      household: { id: S.hid, name: S.household && S.household.name, members: (S.members || []).map(m => ({ name: m.name, email: m.email, role: m.role })),
        lists, pantry: await rows(pantryCol()), calendar: await rows(hcol("events")) }
    };
    saveFile(`my-shopping-data-${dateKey(new Date())}.json`, JSON.stringify(out, (k, v) => k === "image" ? (v ? "(photo)" : "") : v, 1), "application/json");
    toast("Your data is downloaded");
  } catch (e) { fail(e); } finally { p.close(); }
}

/* =====================================================================
   START
   ===================================================================== */
// A list shared to the app from Google Lens, Keep, Messages… (Android "Share" menu, app installed on the home screen)
(function captureShare() {
  const q = new URLSearchParams(location.search);
  if (!["share-text", "share-title", "share-url"].some(k => q.has(k))) return;
  const t = String(q.get("share-text") || q.get("share-title") || "").trim();
  if (t) S.sharedText = clip(t, 4000);
  history.replaceState(null, "", location.pathname + location.hash);
})();
(function captureInvite() {
  const q = new URLSearchParams(location.search), hq = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = (q.get("join") || hq.get("join") || "").replace(/[^A-Za-z0-9]/g, "");
  if (code.length >= 16 && code.length <= 40) {
    setPendingJoin(code, clip(q.get("from") || hq.get("from") || "", 40), clip(q.get("hh") || hq.get("hh") || "", 60));
    ["join", "from", "hh"].forEach(k => q.delete(k));
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
  }
})();
document.querySelectorAll(".tabs button[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
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
