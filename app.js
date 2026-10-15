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
const APP_VERSION = "2026.10.14-24";
const RULES_VERSION = "v11";   // must match the _rules/{v} line in firestore.rules
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
const ITEM_FIELDS = ["name", "store", "aisle", "price", "image"];
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
  Object.assign(S, { hid, household: null, members: [], inventory: [], catalog: [], mine: [], requests: [], recipes: [], tempStores: new Set(), storeDocs: [], lists: [], listItems: [], events: [],
    listId: null, store: null, invQuery: "", ready: { inv: false, items: false } });
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
    S.catalog = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    $("#dberr").classList.add("hidden");
    rebuildInventory();
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
    try { const mine = await getDocsFromServer(mineCol()); await commitOps(mine.docs.map(d => b => b.delete(d.ref))); } catch (e) {}
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
    h("div", { class: "lmeta", text: `App version ${APP_VERSION} · ${S.inventory.length} items` }),
    S.rulesOk === false ? h("p", { class: "err", text: "⚠️ The security rules in Firebase are an older version. In Firebase → Firestore Database → Rules, paste the newest firestore.rules and tap Publish. Until then some actions (like deleting) will be refused." })
      : S.rulesOk === true ? h("div", { class: "lmeta", text: "Security rules: up to date ✓" }) : null,
    h("div", { class: "menu", style: "margin-top:12px" },
      h("button", { class: "btn", text: "🛡️  Run security check", onclick: runSecurityCheck }),
      h("button", { class: "btn", text: "🆔  Copy my account ID", onclick: () => { try { navigator.clipboard.writeText(uid()); toast("Account ID copied"); } catch (e) { toast(uid()); } } }),
      h("button", { class: "btn", text: "↩️  Sign out", onclick: doSignOut }),
      owner ? h("button", { class: "btn danger", text: "🗑  Delete this household", onclick: deleteHouseholdFlow })
            : h("button", { class: "btn danger", text: "🚪  Leave this household", onclick: leaveHousehold }),
      h("button", { class: "btn danger", text: "⚠️  Delete my account", onclick: deleteAccountFlow })),
    h("p", { class: "note", text: "Items and stores are shared with everyone who uses the app. Lists and calendar stay private to your household. Signing out clears this account's data from this device." })));
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
    } else if (r.kind === "change") {
      rows.push(h("div", { class: "lmeta", text: "This item was deleted from the main list." }));
    } else {
      rows.push(h("div", { class: "rq-diff", text: [r.store, aisleLabel(r.aisle), r.price ? "$" + r.price : ""].filter(Boolean).join(" · ") }));
    }
    c.append(h("div", { class: "rq" },
      h("div", { class: "rq-top" },
        r.image ? h("img", { class: "rq-img", src: r.image, alt: "" }) : null,
        h("div", {},
          h("div", { class: "rq-title", text: (r.kind === "add" ? "Add: " : "Change: ") + (cur ? cur.name : r.name) }),
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
    if (r.kind === "change" && cur) {
      const data = { name: r.name, store: r.store, aisle: r.aisle || "", price: r.price || "", updatedAt: Date.now(), updatedBy: uid() };
      if (r.image) data.image = r.image;
      await updateDoc(sdoc("inventory", cur.id), data);
      ensureStoreDoc(r.store);
      syncListsFromItem(cur, data);
    } else {
      await setDoc(doc(scol("inventory")), { name: r.name, store: r.store, aisle: r.aisle || "", price: r.price || "", image: r.image || "", createdAt: Date.now(), createdBy: uid() });
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
    if (S.store) act.append(h("button", { class: "hbtn", "aria-label": "Store options", text: "⋯", onclick: () => storeMenu(S.store) }));
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
  const metaText = qtyOf(it) > 1 ? "×" + qtyOf(it) : "";
  const meta = h("div", { class: "lmeta" }, metaText,
    p != null ? h("span", { class: "price", text: (metaText ? "  " : "") + money(p * qtyOf(it)) }) : null);
  return h("div", { class: "litem" + (it.inCart ? " done" : "") },
    h("button", { class: "cb" + (it.inCart ? " on" : ""), "aria-label": (it.inCart ? "Uncheck " : "Check ") + it.name,
      onclick: () => updateDoc(itemDoc(S.listId, it.id), { inCart: !it.inCart }).catch(fail) },
      h("i", { text: it.inCart ? "✓" : "" })),
    h("button", { class: "lbody", onclick: () => openListItem(it) },
      thumbEl(it.image, "thumb"),
      h("div", { class: "ltext" }, h("div", { class: "lname", text: it.name || "Untitled" }), meta),
      aisleSign(it.aisle)),
    h("button", { class: "x", "aria-label": "Remove " + it.name, text: "✕", onclick: () => removeListItem(it) }));
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
  const items = S.listItems.map(listView);
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
        p != null ? h("span", { class: "price", text: (metaText ? "  " : "") + money(p) }) : null),
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

function itemForm(host, { item, store, name, onDone }) {
  const editing = !!item;
  const d = {
    name: item ? item.name || "" : (name || ""),
    store: item ? item.store || "" : (store || lsGet("lastStore") || ""),
    aisle: item ? item.aisle || "" : "",
    price: item ? (priceNum(item.price) != null ? String(item.price) : "") : "",
    image: item && item.image && item.image !== PLACEHOLDER ? item.image : ""
  };
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
    const aisles = [...new Set(itemsIn(d.store).map(i => i.aisle).filter(Boolean))].sort((a, b) => byAisle({ aisle: a }, { aisle: b }));
    dl.textContent = ""; aisles.forEach(a => dl.append(h("option", { value: a })));
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
    const origImage = item && item.image && item.image !== PLACEHOLDER ? item.image : "";
    const imageChanged = d.image !== origImage;
    busy = true;
    try {
      ensureStoreDoc(store);
      lsSet("lastStore", store);
      if (personalMode) { await savePersonal({ name, store, aisle, price, image, imageChanged }); onDone && onDone(); return; }
      if (editing) {
        const data = { name, store, aisle, price, updatedAt: Date.now(), updatedBy: uid() };
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

  async function savePersonal(v) {
    let target = editing ? item : S.inventory.find(i => i.store === v.store && norm(i.name) === norm(v.name));
    if (!editing && target) {
      const c = await choose("Already saved", `“${target.name}” is already in ${v.store}. Save these details as your version of it?`,
        [{ label: "Cancel", value: null }, { label: "Add as new", value: "new" }, { label: "Use my details", value: "update", cls: "primary" }]);
      if (!c) return;
      if (c === "new") target = null;
    }
    const data = { name: v.name, store: v.store, aisle: v.aisle, price: v.price, updatedAt: Date.now() };
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
function openNewItem(store, name) {
  const s = openSheet(store ? `New item · ${store}` : "New item");
  itemForm(s.body, { store, name, onDone: () => s.close() });
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
const errText = e => String([e && e.code, e && e.status, e && e.message].filter(Boolean).join(" ")).toLowerCase();
const isQuota = e => /429|quota|resource[-_ ]exhausted|rate.?limit|too many requests/.test(errText(e));
const isBusy = e => /\b5\d\d\b|unavailable|overloaded|internal|deadline|timeout|try again later/.test(errText(e));
const isNoModel = e => /\b404\b|not[-_ ]found|not supported|unsupported model|is not available/.test(errText(e)) && /model/.test(errText(e));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Recipes start with the "lite" models: they're plenty for recipes and have bigger free allowances,
// which saves the sharper models' allowance for reading handwriting.
const RECIPE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];
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
  if (m.includes("vsl/quota")) return "Today's free scanning allowance is used up. It resets overnight (about 3 AM Eastern). You can still add items by hand.";
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
    let t = raw.replace(/^[\s\-•*·◦▪☐☑✓✔\[\]]+/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (!t || t.length > 80) continue;
    let qty = 1, m;
    if ((m = t.match(/^(\d{1,2})\s*x\s*(.+)$/i))) { qty = +m[1]; t = m[2]; }
    else if ((m = t.match(/^(.+?)\s*x\s*(\d{1,2})$/i))) { qty = +m[2]; t = m[1]; }
    else if ((m = t.match(/^(\d{1,2})\s+([a-z].*)$/i))) { qty = +m[1]; t = m[2]; }
    t = t.trim();
    const sh = SHORTHAND[norm(t)];
    if (sh) t = sh;
    if (!/[a-z]/i.test(t)) continue;
    out.push({ text: t.charAt(0).toUpperCase() + t.slice(1), written: raw.trim(), qty: Math.max(1, Math.min(99, qty)), matchId: null, confidence: "high" });
  }
  return out;
}
async function pasteList() {
  const s = openSheet("Paste a list");
  const ta = h("textarea", { class: "pastebox", rows: "8", placeholder: "One item per line, e.g.\nmilk\n2x cream cheese\nbananas", "aria-label": "Your list" });
  const err = h("div", { class: "err hidden" });
  const go = async useAI => {
    const text = ta.value.trim();
    if (!text) { err.textContent = "Paste or type your list first."; err.classList.remove("hidden"); return; }
    if (!useAI) {
      const found = parsePasted(text);
      if (!found.length) { err.textContent = "Couldn't find any items in that text."; err.classList.remove("hidden"); return; }
      s.close(); reviewScan(found, null, null); return;
    }
    s.close();
    const p = progressSheet("Tidying your list");
    try {
      p.set("Fixing spelling and matching your items…");
      const res = await readListPhoto([readerPrompt(lsGet("lastStore") || "", clip(text, 4000))], t => p.set(t));
      p.close();
      const items = Array.isArray(res.items) ? res.items : [];
      if (!items.length) throw new Error("no json");
      reviewScan(items, res.store, null);
    } catch (e) {
      p.close();
      console.error("paste AI", e);
      const c = await choose("Couldn't tidy the list", `${scanErrorText(e)}\n\nYou can still add it without AI.`, [{ label: "Add without AI", value: 1, cls: "primary" }, { label: "Cancel", value: null }]);
      if (c) { const found = parsePasted(text); if (found.length) reviewScan(found, null, null); }
    }
  };
  put(s.body,
    h("p", { class: "msg", text: "On your Pixel: open the photo in Google Photos → Lens → Text → Select all → Copy. Then paste it here." }),
    navigator.clipboard && navigator.clipboard.readText ? h("button", { class: "btn block", type: "button", text: "📋 Paste from clipboard", onclick: async () => {
      try { const t = await navigator.clipboard.readText(); if (t) ta.value = (ta.value ? ta.value + "\n" : "") + t; else toast("The clipboard is empty"); }
      catch (e) { ta.focus(); toast("Long-press the box and choose Paste"); }
    } }) : null,
    ta, err,
    h("div", { class: "actions", style: "margin-top:10px" },
      h("button", { class: "btn", type: "button", text: "Fix spelling with AI", onclick: () => go(true) }),
      h("button", { class: "btn green", type: "button", text: "Add items", onclick: () => go(false) })),
    h("p", { class: "note", text: "“Add items” matches your list instantly on your phone (free). “Fix spelling with AI” also understands shorthand and messy lines." }));
  setTimeout(() => ta.focus(), 50);
}

let scanBusy = false;
async function scanList() {
  if (scanBusy) return;
  scanBusy = true;
  try { await scanListInner(); } finally { scanBusy = false; }
}
async function scanListInner() {
  getReader(orderModels(AI_MODELS.filter(m => !isSpent(m)))[0] || AI_MODELS[0]).catch(() => {});   // connect while they take the photo
  const how = await choose("Add a written list", "Take a clear photo of the whole list from straight above, or paste text you copied with Google Lens.",
    [{ label: "📸 Take photo", value: "cam", cls: "primary" }, { label: "🖼️ Choose photo", value: "lib" }, { label: "📋 Paste text", value: "paste" }, { label: "Cancel", value: null }]);
  if (!how) return;
  if (how === "paste") return pasteList();
  const file = await pickImage(how === "cam");
  if (!file) return;
  const p = progressSheet("Reading your list");
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
  reviewScan(items, result.store, photo);
}

function reviewScan(found, storeHint, photo) {
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
    return { text, written: clip(f.written || "", 120), where: clip(f.where || "", 40), qty: q >= 1 && q <= 99 ? q : 1, match: preferStore(match, store),
      low: String(f.confidence || "").toLowerCase() === "low", on: !!text };
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
          h("b", { text: `Found ${rows.length} item${rows.length === 1 ? "" : "s"}` }),
          h("div", { class: "lmeta", text: `${rows.filter(r => r.match).length} matched · ${rows.filter(r => !r.match).length} new` }))),
      h("label", { class: "fl" }, h("span", { text: "Shopping at" }), sel),
      rows.map((r, idx) => scanRow(r, idx)),
      !S.admin && newCount ? h("label", { class: "check" },
        h("input", { type: "checkbox", checked: askAdmin, onchange: e => { askAdmin = e.target.checked; } }),
        "Ask the admin to add my new items for everyone") : null,
      h("div", { class: "actions", style: "margin-top:6px" },
        h("button", { class: "btn green block", type: "button", text: total ? `Add ${total} item${total === 1 ? "" : "s"} to “${listName()}”` : "Nothing selected", disabled: !total, onclick: confirm })),
      h("p", { class: "note", text: "Your photo is sent to Google's Gemini AI to read it and isn't saved. This site is protected by reCAPTCHA; Google's Privacy Policy and Terms of Service apply." })
    ].flat().filter(x => x != null && x !== false));
  }

  function scanRow(r, idx) {
    const m = r.match;
    const status = m
      ? h("div", { class: "sr-status sr-ok" }, "✓ ", h("b", { text: m.name }),
          [m.store !== store ? m.store : "", aisleLabel(m.aisle), priceNum(m.price) != null ? money(priceNum(m.price)) : ""].filter(Boolean).length
            ? " · " + [m.store !== store ? m.store : "", aisleLabel(m.aisle), priceNum(m.price) != null ? money(priceNum(m.price)) : ""].filter(Boolean).join(" · ") : "")
      : h("div", { class: "sr-status sr-new", text: r.where ? `＋ New item · aisle “${r.where}” · add price and photo later` : "＋ New item · you can add aisle, price and photo later" });
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
          h("div", { class: "sc", text: [i.store, aisleLabel(i.aisle), priceNum(i.price) != null ? money(priceNum(i.price)) : ""].filter(Boolean).join(" · ") })))));
    };
    q.addEventListener("input", fill);
    ps.body.append(q, list, h("button", { class: "btn block", type: "button", style: "margin-top:10px", text: "＋ It's a new item", onclick: () => { r.match = null; ps.close(); draw(); } }));
    fill();
  }

  async function confirm() {
    const chosen = rows.filter(r => r.on);
    if (!chosen.length) return;
    learnAliases(chosen.filter(r => r.match).map(r => [r.text, r.match]));   // remember what these words meant
    if (chosen.some(r => !r.match) && !store) { toast("Choose which store the new items belong to"); return; }
    if (store) lsSet("lastStore", store);
    const ops = [];
    const made = [];
    const pending = new Map(S.listItems.map(li => [li.inventoryId || ("n:" + norm(li.name) + "|" + li.store), li]));
    const addOp = (item, qty) => {
      const key = item.id || ("n:" + norm(item.name) + "|" + item.store);
      const existing = pending.get(key) || findOnList(item);
      if (existing) {
        const nq = Math.min(999, qtyOf(existing) + qty);
        existing.qty = nq;
        ops.push(b => b.update(itemDoc(S.listId, existing.id), { qty: nq, inCart: false }));
      } else {
        const ref = doc(itemsCol(S.listId));
        const li = { name: clip(item.name, 120), aisle: clip(item.aisle, 40), price: cleanPrice(item.price), image: cleanImage(item.image),
          store: clip(item.store, 80) || "Other", addedAt: Date.now() + ops.length, inCart: false, qty, inventoryId: item.id || null, addedBy: uid() };
        pending.set(key, { ...li, id: ref.id });
        ops.push(b => b.set(ref, li));
      }
    };
    const seenNew = new Map();
    for (const r of chosen) {
      if (r.match) { addOp(r.match, r.qty); continue; }
      const name = r.text.charAt(0).toUpperCase() + r.text.slice(1);
      const key = norm(name);
      if (seenNew.has(key)) { addOp(seenNew.get(key), r.qty); continue; }
      let item;
      if (S.admin) {
        const ref = doc(scol("inventory"));
        const data = { name, store, aisle: clip(r.where, 40), price: "", image: "", createdAt: Date.now(), createdBy: uid() };
        ops.push(b => b.set(ref, data));
        item = { ...data, id: ref.id };
      } else {
        const id = "my_" + randCode(16);
        const data = { name, store, aisle: clip(r.where, 40), price: "", image: "", own: true, updatedAt: Date.now() };
        ops.push(b => b.set(mineDoc(id), data));
        item = { ...data, id };
      }
      seenNew.set(key, item);
      made.push(item);
      addOp(item, r.qty);
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
const needsDetails = i => !i.aisle && priceNum(i.price) == null && !i.image;
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
  ings: [], type: "any", time: 0, avoid: "", ideas: null, busy: false, listening: false
};
function loadCookPrefs() {
  try {
    const p = JSON.parse(lsGet("cookPrefs") || "{}");
    if (Array.isArray(p.ings)) C.ings = p.ings.slice(0, 40);
    ["type", "avoid"].forEach(k => { if (typeof p[k] === "string") C[k] = p[k]; });
    if (Number.isInteger(p.time) && (p.time === 0 || (p.time >= TIME_MIN && p.time <= TIME_MAX))) C.time = p.time;
  } catch (e) {}
}
function saveCookPrefs() {
  lsSet("cookPrefs", JSON.stringify({ ings: C.ings, type: C.type, time: C.time, avoid: C.avoid }));
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
  return "cook3:" + [C.ings.map(norm).sort().join("|"), C.type, C.time, norm(C.avoid)].join("#");
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
    `Ingredients they have: ${C.ings.join(", ")}.`,
    "Do not assume they have anything else, not even salt or oil: anything not in their list is something they would need to get.",
    "Prefer ideas that use more of what they have and need as few extra items as possible.",
    C.time ? `Each idea's cooking time (hands-on prep plus cooking, the "minutes" field) must be ${C.time} minutes or less. Waiting time such as marinating or chilling does NOT count toward this limit, but report it in "waitMinutes".` : "",
    avoidRule(),
    `Suggest 6 different ideas: ${type}.`,
    fresh ? "Give different ideas from the most obvious ones." : "",
    ...RECIPE_RULES,
    `Return only JSON: {"ideas": [${RECIPE_JSON}]}`
  ].filter(Boolean).join("\n");
}
async function findMeals(fresh) {
  if (!C.ings.length) { toast("Add at least one ingredient"); return; }
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
      ? { item: clip(i, 80), amount: "", have: iHave(i) }
      : { item: clip(i.item, 80), amount: clip(i.amount || "", 40), have: i.have === true || iHave(i.item || "") })
    .filter(i => i.item);
  return {
    name: clip(x.name, 80), type: clip(x.type || "", 20).toLowerCase(), minutes: Math.max(0, Math.min(600, parseInt(x.minutes, 10) || 0)),
    waitMinutes: Math.max(0, Math.min(4320, parseInt(x.waitMinutes, 10) || 0)), waitNote: clip(x.waitNote || "", 80),
    serves: Math.max(0, Math.min(20, parseInt(x.serves, 10) || 0)), summary: clip(x.summary || "", 200),
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
    store: clip(item.store, 80) || "Other", addedAt: Date.now(), inCart: false, qty: 1, inventoryId: item.id || null, addedBy: uid()
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

function openRecipe(r0) {
  let r = r0;                         // the recipe as it is now
  let draft = null;                   // pending edits, or null
  const s = openSheet(r.name);
  const body = h("div");
  s.body.append(body);
  const startDraft = () => { if (!draft) draft = { serves: r.serves || 2, ingredients: r.ingredients.map(i => ({ ...i })), note: "" }; };
  const changed = () => draft && (draft.serves !== (r.serves || 2) || draft.note.trim() ||
    draft.ingredients.length !== r.ingredients.length || draft.ingredients.some((i, k) => i.item !== r.ingredients[k].item));

  async function apply() {
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
    const need = d.ingredients.filter(i => !i.have && !iHave(i.item));
    const addIn = h("input", { placeholder: "Add an ingredient", maxlength: "60", autocapitalize: "words", enterkeyhint: "done", "aria-label": "Add an ingredient" });
    const addOne = () => { const t = clip(addIn.value, 60); if (!t) return; startDraft(); draft.ingredients.push({ item: t.charAt(0).toUpperCase() + t.slice(1), amount: "", have: iHave(t) }); draw(); };
    addIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addOne(); } });
    put(body,
      h("div", { class: "rmeta" },
        r.type ? h("span", { class: "rtag", text: r.type }) : null,
        r.minutes ? h("span", { text: `${fmtMins(r.minutes)} cooking` }) : null),
      r.waitMinutes ? h("div", { class: "rwait" }, h("b", { text: "⏳ Plan ahead" }), h("span", { text: waitText(r) + (r.waitNote && !/\d/.test(r.waitNote) ? ` (about ${fmtMins(r.waitMinutes)})` : "") })) : null,
      r.summary ? h("p", { class: "msg", text: r.summary }) : null,
      h("div", { class: "actions rtop" },
        h("button", { class: "btn green", type: "button", text: "▶ Start cooking", onclick: cook }),
        h("button", { class: "btn", type: "button", text: isSaved(r) ? "★ Saved" : "☆ Save", onclick: async e => {
          const was = isSaved(r); await toggleSave(r); e.target.textContent = was ? "☆ Save" : "★ Saved"; } })),
      h("div", { class: "rserve" }, h("b", { text: "Servings" }),
        h("div", { class: "qty" },
          h("button", { type: "button", "aria-label": "Fewer servings", text: "−", onclick: () => { startDraft(); draft.serves = Math.max(1, draft.serves - 1); draw(); } }),
          h("span", { text: String(d.serves) }),
          h("button", { type: "button", "aria-label": "More servings", text: "+", onclick: () => { startDraft(); draft.serves = Math.min(20, draft.serves + 1); draw(); } }))),
      h("h3", { class: "rh", text: "Ingredients" }),
      h("p", { class: "lmeta", text: "Tap a name to swap it for something else." }),
      h("ul", { class: "ring edit" }, d.ingredients.map((i, k) => {
        const has = i.have || iHave(i.item);
        return h("li", { class: has ? "" : "miss" },
          h("button", { type: "button", class: "ingname", "aria-label": "Swap " + i.item, onclick: async () => {
            const v = await promptSheet("Swap ingredient", `Use instead of ${i.item}`, i.item, "Swap", { max: 60 });
            if (!v || v === i.item) return;
            startDraft(); draft.ingredients[k] = { item: v, amount: draft.ingredients[k].amount, have: iHave(v) }; draw();
          } }, i.item),
          i.amount ? h("span", { class: "amt", text: i.amount }) : null,
          h("span", { class: has ? "havetag" : "need", text: has ? "have" : "need" }),
          h("button", { type: "button", class: "ingx", "aria-label": "Remove " + i.item, text: "✕", onclick: () => { startDraft(); draft.ingredients.splice(k, 1); draw(); } }));
      })),
      h("div", { class: "cookin" }, addIn, h("button", { class: "btn", type: "button", text: "Add", onclick: addOne })),
      draft ? h("label", { class: "fl", style: "margin-top:12px" }, h("span", { text: "Anything else to change? (optional)" }),
        h("input", { value: draft.note, maxlength: "200", placeholder: "e.g. make it spicier, no oven", oninput: e => { draft.note = e.target.value; } })) : null,
      changed() ? h("div", { class: "rchange" },
        h("p", { text: "You changed this recipe. Update it so the amounts and steps match." }),
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", text: "Undo changes", onclick: () => { draft = null; draw(); } }),
          h("button", { class: "btn primary", type: "button", text: "Update recipe", onclick: apply }))) : null,
      !draft && need.length ? h("button", { class: "btn violet block", type: "button", text: `Add ${need.length} missing item${need.length === 1 ? "" : "s"} to “${listName()}”`,
        onclick: () => addMissingToList(need.map(i => i.item)) }) : null,
      h("h3", { class: "rh", text: "Steps" }),
      draft ? h("p", { class: "lmeta", text: "Steps will update when you tap Update recipe." }) : null,
      h("ol", { class: "rsteps" + (draft ? " stale" : "") }, r.steps.map(t => h("li", { text: t }))),
      h("p", { class: "note", text: "Recipe ideas are written by AI. Check cooking temperatures and anything you're allergic to." }));
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
  host.append(...[
    saved.length ? h("div", { class: "card saved" },
      h("h2", { text: `Saved recipes (${saved.length})` }),
      h("div", { class: "shelf" }, saved.map(r => h("button", { type: "button", class: "shelfitem", onclick: () => openRecipe(cleanIdea(r)) },
        h("span", { class: "si-name", text: "★ " + r.name }),
        h("span", { class: "si-meta", text: [r.type, r.minutes ? fmtMins(r.minutes) : "", r.waitMinutes ? "plan ahead" : ""].filter(Boolean).join(", ") }))))) : null,
    h("div", { class: "card cook" },
      h("h2", { text: "What do you have?" }),
      h("div", { class: "cookin" }, input,
        h("button", { class: "btn", type: "button", "aria-label": "Add", text: "Add", onclick: addTyped })),
      h("div", { class: "actions cooktools" },
        h("button", { class: "btn" + (voiceOn ? " listening" : ""), type: "button", onclick: () => startVoice(input) }, voiceOn ? "● Listening… tap to stop" : "🎤 Say it"),
        h("button", { class: "btn", type: "button", onclick: ingredientsFromPhoto }, "📷 Photo of food")),
      C.ings.length ? h("div", { class: "pickchips" },
        C.ings.map(t => h("button", { type: "button", class: "ichip on", "aria-label": "Remove " + t,
          onclick: () => { C.ings = C.ings.filter(x => x !== t); C.ideas = null; saveCookPrefs(); renderCook(); } }, t, h("span", { class: "chipx", text: "×" }))),
        h("button", { type: "button", class: "link", text: "Clear all", onclick: () => { C.ings = []; C.ideas = null; saveCookPrefs(); renderCook(); } }))
        : h("p", { class: "lmeta", text: "Type, say, or snap a photo of the food you have." }),
      extras.length ? h("div", { class: "extras" }, h("span", { class: "lmeta", text: "Common extras:" }),
        extras.map(x => h("button", { type: "button", class: "xchip", onclick: () => addIngredients([x]) }, "+ " + x))) : null,
      h("h3", { class: "rh", text: "What kind of food?" }), seg(MEAL_TYPES, "type"),
      h("div", { class: "trow" }, h("h3", { class: "rh", text: "Cooking time" }), tLabel),
      h("p", { class: "lmeta tnote", text: "Prep and cooking only. Marinating or chilling time is shown separately." }),
      h("div", { class: "tpick" }, slider, h("label", { class: "tboxwrap" }, box, h("span", { text: "min" }))),
      anyBtn,
      h("label", { class: "fl" }, h("span", { text: "Never use (allergies or dislikes)" }),
        h("input", { value: C.avoid, maxlength: "150", placeholder: "e.g. peanuts, shellfish", onchange: e => { C.avoid = clip(e.target.value, 150); C.ideas = null; saveCookPrefs(); } })),
      h("button", { class: "btn green block bigbtn", type: "button", disabled: C.busy || !C.ings.length, onclick: () => findMeals(false) },
        C.busy ? "Finding meals…" : "Find meals")),
    C.ideas ? h("div", { id: "cookResults" },
      h("div", { class: "ghead" }, h("h2", { text: `${C.ideas.length} ideas` }),
        h("button", { class: "link", type: "button", text: "Show different ideas", onclick: () => findMeals(true) })),
      h("div", { class: "ideas" }, C.ideas.map(r => h("div", { class: "idea" },
        h("button", { class: "ideabody", type: "button", onclick: () => openRecipe(r) },
          h("div", { class: "itop" }, r.type ? h("span", { class: "rtag", text: r.type }) : null, r.minutes ? h("span", { class: "imin", text: fmtMins(r.minutes) }) : null),
          h("div", { class: "iname2", text: r.name }),
          r.waitMinutes ? h("div", { class: "iwait", text: `⏳ Plan ahead: ${waitText(r)}` }) : null,
          r.summary ? h("div", { class: "isum", text: r.summary }) : null,
          r.missing.length ? h("div", { class: "imiss", text: "Need: " + r.missing.join(", ") }) : h("div", { class: "ihave", text: "✓ You have everything" })),
        h("div", { class: "ideaacts" },
          h("button", { class: "btn", type: "button", text: "View & edit", onclick: () => openRecipe(r) }),
          h("button", { class: "btn green", type: "button", text: "▶ Cook", onclick: () => startCooking(r) })))))) : null
  ].filter(Boolean));
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
   START
   ===================================================================== */
(function captureInvite() {
  const m = location.hash.match(/join=([A-Za-z0-9]{16,40})/);
  if (m) {
    setPendingJoin(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
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
