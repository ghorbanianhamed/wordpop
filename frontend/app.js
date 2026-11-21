// WordPop PWA – plain JavaScript, no build step.

const $view = document.getElementById("view");
const $tabbar = document.getElementById("tabbar");
const $toast = document.getElementById("toast");

const state = { user: null, categories: [], installDismissed: sessionStorageGet("installDismissed") };

// ---------- helpers ----------
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, { method = "GET", body } = {}) {
  // The free server sleeps when unused; if a request is slow, say so instead of looking frozen.
  const slow = setTimeout(() => showWaking(true), 2500);
  let res;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(path, {
          method,
          credentials: "same-origin",
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt >= 5) throw new Error("Can't reach WordPop. Check your internet connection and try again.");
        showWaking(true);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      // While waking up, the host may answer with its own HTML page instead of our JSON: wait and retry.
      const isJson = (res.headers.get("content-type") || "").includes("json") || res.status === 204;
      if (isJson || attempt >= 20) break;
      showWaking(true);
      await new Promise((r) => setTimeout(r, 4000));
    }
  } finally { clearTimeout(slow); showWaking(false); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) { state.user = null; state.tts = null; location.hash = "#/login"; }
    let msg = data.detail;
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg.replace(/^Value error, /, "")).join(", ");
    const err = new Error(msg || `Something went wrong (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let wakingEl;
function showWaking(on) {
  if (on && !wakingEl) {
    wakingEl = document.createElement("div");
    wakingEl.className = "waking";
    wakingEl.innerHTML = "<span class='spinner'></span> Waking up WordPop… the first load after a break takes a moment.";
    document.body.appendChild(wakingEl);
  } else if (!on && wakingEl) { wakingEl.remove(); wakingEl = null; }
}

let toastTimer;
function toast(msg) {
  $toast.textContent = msg; $toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => ($toast.hidden = true), 2800);
}

function route() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  return { path: path || "/words", params: new URLSearchParams(query) };
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOSNonSafari = () => isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function catChips(selected = [], name = "cat") {
  if (!state.categories.length) return `<p class="muted small">No categories yet – <a href="#/categories">create one</a>.</p>`;
  return `<div class="chips">${state.categories.map((c) =>
    `<button type="button" class="chip" data-${name}="${c.id}" aria-pressed="${selected.includes(c.id)}">
      <span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join("")}</div>`;
}
function bindToggleChips(root, attr) {
  root.querySelectorAll(`[data-${attr}]`).forEach((b) =>
    b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true")));
}
const pressedIds = (root, attr) => [...root.querySelectorAll(`[data-${attr}][aria-pressed="true"]`)].map((b) => Number(b.dataset[attr]));

async function loadCategories() { state.categories = await api("/api/categories"); }

// ---------- install guide (iPhone) ----------
function installGuide() {
  if (isIOSNonSafari()) {
    return `<div class="card install"><h1>Open in Safari</h1>
      <p>On iPhone, notifications only work when WordPop is opened in <b>Safari</b>.</p>
      <p class="muted">Copy this page's link and paste it into Safari.</p>
      <button class="secondary" id="copy-link">Copy link</button></div>`;
  }
  return `<div class="card install">
    <img src="/icons/icon-192.png" width="72" height="72" alt="" style="border-radius:16px" />
    <h1>Install WordPop on your iPhone</h1>
    <p class="muted">It takes 20 seconds and lets WordPop send you word reminders.</p>
    <ol>
      <li>Tap the <b>Share</b> button <span class="share-ico">⬆</span> at the bottom of Safari.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      <li>Open <b>WordPop</b> from your Home Screen and sign in there.</li>
    </ol>
    <p class="small muted">Tip: install first, then sign in inside the installed app – the app and Safari keep separate logins.</p>
    <button class="ghost" id="skip-install">Continue in the browser for now</button>
  </div>`;
}

// ---------- screens ----------
const screens = {};

screens["/login"] = async () => {
  if (isIOS() && !isStandalone() && !state.installDismissed) {
    $view.innerHTML = installGuide();
    document.getElementById("skip-install")?.addEventListener("click", () => {
      state.installDismissed = "1"; sessionStorageSet("installDismissed", "1"); render();
    });
    document.getElementById("copy-link")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(location.origin); toast("Link copied");
    });
    return;
  }
  let mode = sessionStorageGet("authMode") || "signup";
  const draw = () => {
    $view.innerHTML = `
      <div class="card stack">
        <h1>${mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p class="muted">${mode === "signup" ? "Save words, phrases, quotes or poems in any language, and get reminders until you remember them." : "Sign in to see your words."}</p>
        <form id="auth" class="stack">
          <div><label for="email">Email</label><input id="email" type="email" autocomplete="email" required /></div>
          <div><label for="pw">Password</label>
            <input id="pw" type="password" minlength="8" required autocomplete="${mode === "signup" ? "new-password" : "current-password"}" />
            ${mode === "signup" ? '<p class="small muted">At least 8 characters.</p>' : ""}</div>
          ${mode === "login" ? '<p class="small" style="margin:0;text-align:right"><a href="#/forgot">Forgot password?</a></p>' : ""}
          <p class="error" id="err" hidden></p>
          <button class="block" type="submit">${mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        <p class="center small">${mode === "signup" ? "Already have an account?" : "New here?"}
          <a href="#" id="switch">${mode === "signup" ? "Sign in" : "Create an account"}</a></p>
        <p class="center small muted"><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
      </div>`;
    document.getElementById("switch").onclick = (e) => {
      e.preventDefault(); mode = mode === "signup" ? "login" : "signup"; sessionStorageSet("authMode", mode); draw();
    };
    document.getElementById("auth").onsubmit = async (e) => {
      e.preventDefault();
      const err = document.getElementById("err"); err.hidden = true;
      const body = { email: email.value.trim(), password: pw.value };
      if (mode === "signup") body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      try {
        state.user = await api(`/api/auth/${mode}`, { method: "POST", body });
        await loadCategories();
        location.hash = mode === "signup" ? "#/welcome" : "#/words";
      } catch (ex) {
        err.innerHTML = esc(ex.message) + (mode === "signup" && /already exists/.test(ex.message)
          ? ' – <a href="#" id="to-login">sign in</a> or <a href="#/forgot">reset your password</a>.' : "");
        err.hidden = false;
        document.getElementById("to-login")?.addEventListener("click", (e2) => {
          e2.preventDefault(); mode = "login"; sessionStorageSet("authMode", mode); draw(); email.value = body.email;
        });
      }
    };
  };
  draw();
};

screens["/forgot"] = async () => {
  $view.innerHTML = `
    <div class="card stack">
      <h1>Forgot your password?</h1>
      <p class="muted">Enter the email you signed up with. We'll send you a link to choose a new password.</p>
      <form id="forgot" class="stack">
        <div><label for="f-email">Email</label><input id="f-email" type="email" autocomplete="email" required /></div>
        <p class="error" id="err" hidden></p>
        <button class="block" type="submit">Send reset link</button>
      </form>
      <p class="center small"><a href="#/login">← Back to sign in</a></p>
    </div>`;
  document.getElementById("forgot").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await api("/api/auth/forgot-password", { method: "POST", body: { email: document.getElementById("f-email").value.trim() } });
      $view.innerHTML = `<div class="card stack center">
        <h1>Check your email 📬</h1>
        <p>${esc(r.message)}</p>
        <p class="small muted">The link expires in 1 hour. Not there? Check your spam folder, or try again in a few minutes.</p>
        <a href="#/login">← Back to sign in</a></div>`;
    } catch (ex) {
      const err = document.getElementById("err"); err.textContent = ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = "Send reset link";
    }
  };
};

screens["/reset"] = async ({ params }) => {
  const token = params.get("token");
  if (!token) { location.hash = "#/forgot"; return; }
  $view.innerHTML = `
    <div class="card stack">
      <h1>Choose a new password</h1>
      <form id="reset" class="stack">
        <div><label for="r-pw">New password</label><input id="r-pw" type="password" minlength="8" required autocomplete="new-password" />
          <p class="small muted">At least 8 characters.</p></div>
        <div><label for="r-pw2">Repeat new password</label><input id="r-pw2" type="password" minlength="8" required autocomplete="new-password" /></div>
        <p class="error" id="err" hidden></p>
        <button class="block" type="submit">Save new password</button>
      </form>
    </div>`;
  document.getElementById("reset").onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("err"); err.hidden = true;
    const pw = document.getElementById("r-pw").value, pw2 = document.getElementById("r-pw2").value;
    if (pw !== pw2) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
    try {
      state.user = await api("/api/auth/reset-password", { method: "POST", body: { token, password: pw } });
      toast("Password changed ✓ You're signed in.");
      location.hash = "#/words";
    } catch (ex) {
      err.innerHTML = `${esc(ex.message)} <a href="#/forgot">Send a new link</a>`; err.hidden = false;
    }
  };
};

screens["/welcome"] = async () => {
  const lists = await api("/api/starter-lists");
  $view.innerHTML = `
    <h1>Let's get you started 👋</h1>
    <div class="card stack">
      <h2>Pick some categories</h2>
      <p class="muted small">Categories keep your entries organised. They start empty – you add your own words, phrases and quotes. You can create more anytime.</p>
      ${starterListHtml(lists)}
    </div>
    <a class="btn block" href="#/words">Continue</a>`;
  bindStarterButtons();
};

function starterListHtml(lists) {
  return lists.map((l) => `
    <div class="row between">
      <div class="grow"><span class="dot" style="background:${esc(l.color)}"></span> <b>${esc(l.name)}</b><br />
        <span class="small muted">${esc(l.description)}</span></div>
      <button class="secondary small" data-import="${esc(l.key)}">Add</button>
    </div>`).join("");
}
function bindStarterButtons() {
  $view.querySelectorAll("[data-import]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const r = await api(`/api/starter-lists/${b.dataset.import}/import`, { method: "POST" });
      b.textContent = "Added ✓"; toast(r.created ? `“${r.name}” category added` : `You already have “${r.name}”`); await loadCategories();
    } catch (e) { b.disabled = false; toast(e.message); }
  }));
}

screens["/words"] = async ({ params }) => {
  await Promise.all([loadCategories(), loadTts()]);
  const filter = params.get("category");
  const words = await api(`/api/words${filter ? `?category_id=${encodeURIComponent(filter)}` : ""}`);
  $view.innerHTML = `
    <div class="card">
      <h2>Add a word, phrase or quote</h2>
      <form id="add" class="stack">
        <div class="row" style="align-items:flex-start"><textarea id="w-text" class="grow" rows="2" maxlength="500" placeholder="A word, phrase, sentence, quote or short poem – in any language" required autocomplete="off" autocapitalize="sentences" style="width:auto;min-height:48px"></textarea>
          <button type="button" class="secondary" id="lookup" title="English dictionary">Look up</button></div>
        <div><label for="w-meaning">Meaning or note <span class="muted small">(optional – English words can be filled automatically)</span></label>
          <textarea id="w-meaning" rows="2"></textarea></div>
        <div><label for="w-example">Example <span class="muted small">(optional)</span></label><input id="w-example" /></div>
        <div><label>Categories</label>${catChips([], "newcat")}</div>
        <p class="error" id="add-err" hidden></p>
        <button class="block" type="submit">Save word</button>
      </form>
    </div>
    <div id="notif-ask"></div>
    <div class="card">
      <div class="row between"><h2>Your words <span class="muted small">(${words.length})</span></h2>
        ${words.length ? `<button class="ghost small" id="select-mode" type="button">Select</button>` : ""}</div>
      <div class="row select-bar" id="select-bar" hidden>
        <button class="ghost small" id="select-all" type="button">Select all</button>
        <button class="danger small" id="delete-selected" type="button" disabled>Delete</button>
        <button class="ghost small" id="select-cancel" type="button">Cancel</button>
      </div>
      <div class="chips scroll-x" style="margin-bottom:8px">
        <a class="chip" aria-pressed="${!filter}" href="#/words">All</a>
        ${state.categories.map((c) => `<a class="chip" aria-pressed="${String(c.id) === filter}" href="#/words?category=${c.id}">
          <span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</a>`).join("")}
      </div>
      <input id="search" placeholder="Search…" type="search" style="margin-bottom:8px" />
      <div id="list">${words.length ? words.map(wordItem).join("") : `<p class="muted center">No words yet. Add your first one above.</p>`}</div>
    </div>`;

  bindToggleChips($view, "newcat");
  const text = document.getElementById("w-text"), meaning = document.getElementById("w-meaning"), example = document.getElementById("w-example");

  const shared = takeShared();
  if (shared) {
    text.value = shared;
    document.getElementById("add").insertAdjacentHTML("beforebegin",
      `<p class="share-note small">📥 Shared to WordPop – add a meaning if you like, then tap <b>Save word</b>.</p>`);
  }
  if (shared || params.get("add")) { text.focus(); text.scrollIntoView({ block: "center" }); }

  document.getElementById("lookup").onclick = async () => {
    if (!text.value.trim()) return text.focus();
    try {
      const r = await api(`/api/dictionary/${encodeURIComponent(text.value.trim())}`);
      meaning.value = r.meaning; if (!example.value) example.value = r.example || "";
      toast(r.phonetic ? `Found it ${r.phonetic}` : "Found it");
    } catch (e) { toast(e.message); }
  };

  document.getElementById("add").onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("add-err"); err.hidden = true;
    const btn = e.submitter; btn.disabled = true; btn.textContent = "Saving…";
    try {
      await api("/api/words", { method: "POST", body: {
        text: text.value, meaning: meaning.value, example: example.value, category_ids: pressedIds($view, "newcat") } });
      toast("Saved ✓");
      const firstWord = words.length === 0;
      await screens["/words"]({ params });
      if (firstWord) maybeAskForNotifications();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = "Save word"; }
  };

  document.getElementById("search").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    $view.querySelectorAll(".word-item").forEach((el) => (el.hidden = !el.dataset.text.includes(q)));
  };
  bindWordItems(words, params);
  if (words.length) bindSelection(params);
  if (words.length) maybeAskForNotifications();
};

// Select several entries (or all of them) and delete them in one go.
function bindSelection(params) {
  const list = document.getElementById("list"), bar = document.getElementById("select-bar");
  const modeBtn = document.getElementById("select-mode"), delBtn = document.getElementById("delete-selected");
  const visible = () => [...list.querySelectorAll(".word-item:not([hidden]) .pick")];
  const picked = () => [...list.querySelectorAll(".pick:checked")];
  const update = () => {
    const n = picked().length;
    delBtn.disabled = n === 0; delete delBtn.dataset.armed;
    delBtn.textContent = n ? `Delete ${n}` : "Delete";
    const all = visible();
    document.getElementById("select-all").textContent = all.length && all.every((c) => c.checked) ? "Select none" : "Select all";
  };
  const setMode = (on) => {
    list.classList.toggle("selecting", on); bar.hidden = !on; modeBtn.hidden = on;
    if (on) list.querySelectorAll("details[open]").forEach((d) => (d.open = false));
    else list.querySelectorAll(".pick").forEach((c) => (c.checked = false));
    update();
  };
  modeBtn.onclick = () => setMode(true);
  document.getElementById("select-cancel").onclick = () => setMode(false);
  document.getElementById("select-all").onclick = () => {
    const all = visible(), check = !all.every((c) => c.checked);
    all.forEach((c) => (c.checked = check)); update();
  };
  // While selecting, tapping an entry ticks it instead of opening the flashcard.
  list.querySelectorAll(".word-item summary").forEach((s) => s.addEventListener("click", (e) => {
    if (!list.classList.contains("selecting")) return;
    e.preventDefault();
    const box = s.querySelector(".pick"); box.checked = !box.checked;
    update();
  }));
  delBtn.onclick = async () => {
    const ids = picked().map((c) => Number(c.dataset.pick));
    if (!ids.length) return;
    if (!delBtn.dataset.armed) {
      delBtn.dataset.armed = "1"; delBtn.textContent = `Tap again to delete ${ids.length}`;
      setTimeout(() => { if (delBtn.dataset.armed) update(); }, 3000);
      return;
    }
    delBtn.disabled = true;
    try {
      const r = await api("/api/words/delete-many", { method: "POST", body: { ids } });
      toast(`Deleted ${r.deleted} ${r.deleted === 1 ? "entry" : "entries"}`);
      screens["/words"]({ params });
    } catch (ex) { toast(ex.message); update(); }
  };
}

function boxLabel(box) { return box >= 5 ? "⭐ mastered" : box === 0 ? "new" : `level ${box}/5`; }

// ---------- listening ----------
// English is read by a Canadian voice when the device has one (the most natural-sounding
// first), or by the voice the person picked in Settings. Other languages use the device's
// voice for that language. Voices differ per device, so the choice is kept on the device.
const canSpeak = "speechSynthesis" in window;
const VOICE_KEY = "wordpop.voice";
const savedVoiceName = () => { try { return localStorage.getItem(VOICE_KEY) || ""; } catch { return ""; } };
const voices = () => (canSpeak ? speechSynthesis.getVoices() : []);
const norm = (lang) => (lang || "").replace("_", "-");
const NATURAL = /natural|neural|enhanced|premium|online|google/i;

// Higher is better: Canadian, then US (closest accent), then other English; natural voices first.
function englishRank(v) {
  const lang = norm(v.lang);
  return (lang === "en-CA" ? 100 : lang === "en-US" ? 50 : 10) + (NATURAL.test(v.name) ? 20 : 0) + (v.default ? 1 : 0);
}
function englishVoices() {
  return voices().filter((v) => norm(v.lang).startsWith("en")).sort((a, b) => englishRank(b) - englishRank(a));
}
function pickVoice(lang) {
  const base = lang.split("-")[0];
  if (base === "en") {
    const saved = savedVoiceName() && englishVoices().find((v) => v.name === savedVoiceName());
    return saved || englishVoices()[0];
  }
  const all = voices();
  return all.find((v) => norm(v.lang) === lang && NATURAL.test(v.name)) || all.find((v) => norm(v.lang) === lang) ||
    all.find((v) => norm(v.lang).startsWith(base));
}
// Speak English ourselves (instead of the dictionary's British/US recording) when a Canadian
// voice exists or the person chose a voice.
const preferVoiceForEnglish = () => Boolean(savedVoiceName()) || englishVoices().some((v) => norm(v.lang) === "en-CA");

function speak(text, lang) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || "en-US";
  const voice = pickVoice(u.lang);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = 0.92;
  synth.speak(u);
}
// ---------- natural voices (made on the server) ----------
// Four natural English voices - Canadian and American, a woman and a man. When they are set
// up on the server and chosen in Settings, English is read by them on every device; the
// phone's own voice is the fallback (and is still used for other languages).
async function loadTts(force = false) {
  if (!state.tts || force) state.tts = await api("/api/tts/voices").catch(() => ({ available: false, selected: "device", voices: [] }));
  return state.tts;
}
// Natural voices need WordPop Plus: a subscription, the free trial (which starts with the first
// listen), or payments not being set up yet.
const plusAllowed = () => { const b = state.tts?.billing; return !b || b.plus || (b.billing_enabled && !b.trial_started); };
const naturalVoice = () => (state.tts?.available && state.tts.selected !== "device" && plusAllowed() ? state.tts.selected : "");
let toldTrialEnded = false;
function maybeTellTrialEnded() {
  const b = state.tts?.billing;
  if (toldTrialEnded || !b?.billing_enabled || b.plus || !b.trial_started || state.tts.selected === "device") return;
  toldTrialEnded = true;
  toast("Your free trial of the natural voices has ended – see Settings → Voice");
}
let playing = null;
function playNatural(text, voiceId) {
  if (canSpeak) speechSynthesis.cancel();
  playing?.pause();
  playing = new Audio(`/api/tts?voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(text.trim().slice(0, 600))}`);
  return playing.play();
}
// Read any text aloud: natural voice for English when available, otherwise the phone's voice.
function sayText(text, lang) {
  const english = (lang || "en").startsWith("en"), voiceId = naturalVoice();
  if (english && voiceId) {
    const firstListen = !state.tts.billing?.trial_started;
    return playNatural(text, voiceId)
      .then(() => firstListen && loadTts(true)) // the free trial may have just started
      .catch(() => { loadTts(true); if (canSpeak) speak(text, lang); });
  }
  if (english) maybeTellTrialEnded();
  if (canSpeak) speak(text, lang);
}

function exampleHtml(w, attr) {
  if (!w.example) return "";
  const btn = canSpeak || naturalVoice() ? ` <button class="ghost small say" ${attr} aria-label="Listen to the example">🔊</button>` : "";
  return `<i dir="auto">“${esc(w.example)}”</i>${btn}`;
}
function listen(w) {
  const english = (w.lang || "en").startsWith("en");
  if (english && naturalVoice()) return sayText(w.text, w.lang);
  if (w.audio_url && !(canSpeak && english && preferVoiceForEnglish())) {
    return new Audio(w.audio_url).play().catch(() => canSpeak && speak(w.text, w.lang));
  }
  if (canSpeak) speak(w.text, w.lang);
}
const canListen = (w) => Boolean(w.audio_url) || canSpeak || Boolean(naturalVoice());

const ACCENTS = { "en-CA": "Canadian", "en-US": "American", "en-GB": "British", "en-AU": "Australian", "en-IE": "Irish",
  "en-IN": "Indian", "en-NZ": "New Zealand", "en-ZA": "South African" };
// ---------- CSV import & export ----------
const categoryOptions = (first) => `<option value="">${esc(first)}</option>` +
  state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

// Excel on Windows often saves CSV in its own encoding, not UTF-8: try UTF-8 first.
async function readTextFile(file) {
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

function bindImportExport() {
  const exportCat = document.getElementById("export-cat"), exportBtn = document.getElementById("export-btn");
  exportCat.onchange = () => { exportBtn.href = `/api/words/export${exportCat.value ? `?category_id=${exportCat.value}` : ""}`; };

  const file = document.getElementById("import-file"), btn = document.getElementById("import-btn");
  const out = document.getElementById("import-result");
  file.onchange = () => { btn.disabled = !file.files.length; out.hidden = true; };
  btn.onclick = async () => {
    const f = file.files[0]; if (!f) return;
    if (f.size > 2_000_000) { toast("That file is too big (2 MB max)"); return; }
    btn.disabled = true; btn.textContent = "Importing…";
    try {
      const body = { csv: await readTextFile(f) };
      const cat = document.getElementById("import-cat").value; if (cat) body.category_id = Number(cat);
      const r = await api("/api/words/import", { method: "POST", body });
      const parts = [`✓ ${r.added} ${r.added === 1 ? "entry" : "entries"} added`];
      if (r.duplicates) parts.push(`${r.duplicates} already in your list (skipped)`);
      if (r.categories_created.length) parts.push(`new categories: ${r.categories_created.join(", ")}`);
      if (r.errors.length) parts.push(`${r.errors.length} line${r.errors.length === 1 ? "" : "s"} skipped – ` +
        r.errors.slice(0, 5).map((e) => `line ${e.line}: ${e.reason}`).join("; ") + (r.errors.length > 5 ? "…" : ""));
      out.textContent = parts.join(" · "); out.hidden = false;
      toast(`${r.added} added`); file.value = ""; await loadCategories();
    } catch (e) { out.textContent = e.message; out.hidden = false; }
    btn.textContent = "⬆ Import"; btn.disabled = !file.files.length;
  };

  document.getElementById("csv-template").onclick = (e) => {
    e.preventDefault();
    const sample = "\ufefftext,meaning,example,categories\r\n" +
      "Obviously,\"clearly, without doubt\",She was obviously very upset.,Vocabulary\r\n" +
      "give up,stop trying,Don't give up now!,Phrasal Verbs\r\n" +
      "谢谢,thank you,,Chinese Basics\r\n";
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([sample], { type: "text/csv" })), download: "wordpop-sample.csv" });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

const SAMPLE = "Hi! This is how your words will sound."; // free for everyone (same text on the server)

function plusPanel(b) {
  if (!b?.billing_enabled) return "";
  const date = (iso) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const buy = `<div class="row plus-buy">
      <button class="small" type="button" data-plan="monthly">${esc(b.prices.monthly)} / month</button>
      <button class="small" type="button" data-plan="yearly">${esc(b.prices.yearly)} / year <span class="save">save 16%</span></button></div>
    <p class="small muted">Renews automatically, cancel any time. <a href="/terms.html">Terms</a></p>`;
  if (b.reason === "admin") return `<div class="plus-box"><p>⭐ <b>WordPop Plus</b> – included for admins.</p></div>`;
  if (b.reason === "subscription") {
    return `<div class="plus-box"><p>⭐ <b>WordPop Plus</b> · ${b.plan === "yearly" ? "yearly" : "monthly"}<br>
      <span class="small muted">${b.cancel_at_period_end ? "Ends" : "Renews"} ${b.renews_at ? date(b.renews_at) : ""}</span></p>
      ${b.can_manage ? `<div class="row"><button class="ghost small" type="button" id="plus-manage">Manage subscription</button></div>` : ""}</div>`;
  }
  if (b.reason === "trial") {
    const days = Math.max(1, Math.ceil((new Date(b.trial_ends_at) - Date.now()) / 86400000));
    return `<div class="plus-box"><p>🎁 <b>Free trial</b> – ${days} day${days === 1 ? "" : "s"} left.
      <span class="small muted">Keep the natural voices with WordPop Plus:</span></p>${buy}</div>`;
  }
  if (!b.trial_started) {
    return `<div class="plus-box"><p>🎁 <b>Try the natural voices free for ${b.trial_days} days.</b>
      <span class="small muted">The trial starts the first time you tap Listen – no card needed. Tap ▶ to hear each voice.</span></p>
      <p class="small muted">Already sure? Get WordPop Plus now:</p>${buy}</div>`;
  }
  return `<div class="plus-box"><p>Your free trial has ended. <b>Get WordPop Plus</b> to keep the natural voices –
    until then, your phone's voice reads your entries.</p>${buy}
    ${b.can_manage ? `<button class="ghost small" type="button" id="plus-manage">Manage subscription</button>` : ""}</div>`;
}

// Stripe.js must be loaded from Stripe itself (that's what keeps card details off our server).
// Newest version first (it matches the API version the server uses), older ones as a fallback.
const STRIPE_JS = ["https://js.stripe.com/endive/stripe.js", "https://js.stripe.com/dahlia/stripe.js", "https://js.stripe.com/v3/"];
let stripeJs = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement("script"), { src, async: true });
    s.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error("no Stripe")));
    s.onerror = () => { s.remove(); reject(new Error("not found")); };
    document.head.appendChild(s);
  });
}
function loadStripeJs() {
  stripeJs ||= (async () => {
    for (const src of STRIPE_JS) {
      try { return await loadScript(src); } catch { /* try the next one */ }
    }
    stripeJs = null;
    throw new Error("Couldn't load the payment form – check your connection");
  })();
  return stripeJs;
}

// Open Stripe's own payment page (also the fallback if the in-app form has a problem).
async function openHostedCheckout(plan) {
  location.href = (await api("/api/billing/checkout", { method: "POST", body: { plan, hosted: true } })).url;
}

// The payment form in a box over the app (Stripe embedded checkout).
async function openPaymentBox(plan, publishableKey) {
  const overlay = document.createElement("div");
  overlay.className = "pay-overlay";
  overlay.innerHTML = `<div class="pay-box" role="dialog" aria-modal="true" aria-label="Get WordPop Plus">
    <button class="pay-close ghost small" type="button" aria-label="Close">✕</button>
    <div id="pay-mount"><p class="center muted pad">Loading the secure payment form…</p></div>
    <p class="center small pay-fallback"><a href="#" id="pay-hosted">Problem with the form? Open Stripe's payment page instead</a></p></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("no-scroll");
  let checkout = null;
  const close = () => {
    checkout?.destroy(); overlay.remove(); document.body.classList.remove("no-scroll");
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.querySelector(".pay-close").onclick = close;
  overlay.querySelector("#pay-hosted").onclick = (e) => {
    e.preventDefault(); close(); openHostedCheckout(plan).catch((err) => toast(err.message));
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  try {
    const stripe = (await loadStripeJs())(publishableKey);
    // Renamed in Stripe's 2026 versions: createEmbeddedCheckoutPage (new) / initEmbeddedCheckout (old).
    const create = (stripe.createEmbeddedCheckoutPage || stripe.initEmbeddedCheckout).bind(stripe);
    checkout = await create({
      fetchClientSecret: async () => (await api("/api/billing/checkout", { method: "POST", body: { plan } })).client_secret,
      onComplete: () => { close(); welcomeToPlus(); },
    });
    if (!overlay.isConnected) { checkout.destroy(); return; } // closed while loading
    overlay.querySelector("#pay-mount").innerHTML = "";
    checkout.mount("#pay-mount");
  } catch (e) { close(); toast(e.message); }
}

function bindPlus() {
  $view.querySelectorAll("[data-plan]").forEach((btn) => (btn.onclick = async () => {
    const key = state.tts?.billing?.publishable_key;
    if (key) return openPaymentBox(btn.dataset.plan, key);
    btn.disabled = true; // no publishable key: Stripe's own payment page
    try { await openHostedCheckout(btn.dataset.plan); }
    catch (e) { toast(e.message); btn.disabled = false; }
  }));
  const manage = document.getElementById("plus-manage");
  if (manage) manage.onclick = async () => {
    manage.disabled = true;
    try { location.href = (await api("/api/billing/portal", { method: "POST" })).url; }
    catch (e) { toast(e.message); manage.disabled = false; }
  };
}

// Back from the Stripe payment page: the webhook may take a few seconds to arrive.
async function welcomeToPlus() {
  toast("Thank you! Activating WordPop Plus…");
  for (let i = 0; i < 6; i++) {
    const t = await loadTts(true);
    if (t.billing?.reason === "subscription") { toast("🎉 WordPop Plus is active"); return screens["/settings"]({ params: new URLSearchParams() }); }
    await new Promise((r) => setTimeout(r, 2000));
  }
  toast("Payment received – Plus will show up in a minute");
}
function bindNaturalVoices() {
  $view.querySelectorAll("[data-sample]").forEach((b) => (b.onclick = (e) => {
    e.preventDefault(); playNatural(SAMPLE, b.dataset.sample).catch(() => toast("Couldn't play the voice right now"));
  }));
  $view.querySelectorAll('input[name="voice"]').forEach((r) => (r.onchange = async () => {
    await api("/api/me/settings", { method: "PUT", body: { voice: r.value } });
    state.tts.selected = r.value;
    const device = document.getElementById("device-voice"); if (device) device.hidden = r.value !== "device";
    if (r.value === "device") { if (canSpeak) speak(SAMPLE, "en-US"); }
    else playNatural(SAMPLE, r.value).catch(() => {});
    toast("Voice saved ✓");
  }));
}

function bindVoicePicker() {
  const select = document.getElementById("voice"), hint = document.getElementById("voice-hint");
  const fill = () => {
    const list = englishVoices(), saved = savedVoiceName();
    select.innerHTML = `<option value="">Automatic${list[0] ? ` – ${esc(list[0].name)}` : ""}</option>` + list.map((v) =>
      `<option value="${esc(v.name)}" ${v.name === saved ? "selected" : ""}>${esc(v.name)} (${ACCENTS[norm(v.lang)] || esc(v.lang)})</option>`).join("");
    hint.textContent = !list.length ? "Loading voices…" : list.some((v) => norm(v.lang) === "en-CA") ? ""
      : "No Canadian voice on this device yet, so the closest one is used. On iPhone: Settings → Accessibility → Spoken Content → Voices → English. On Android: Settings → Text-to-speech → install voice data.";
  };
  fill();
  speechSynthesis.onvoiceschanged = fill; // (replaces the previous visit's handler)
  select.onchange = () => {
    try { select.value ? localStorage.setItem(VOICE_KEY, select.value) : localStorage.removeItem(VOICE_KEY); } catch { /* private mode */ }
    speak("Hi! This is how your words will sound.", "en-US");
  };
  document.getElementById("voice-test").onclick = () => speak("Hi! This is how your words will sound.", "en-US");
}
if (canSpeak) speechSynthesis.getVoices(); // starts loading the voice list early (Chrome)

function wordItem(w) {
  return `<details class="word-item" data-id="${w.id}" data-text="${esc(w.text.toLowerCase())}">
    <summary><input type="checkbox" class="pick" data-pick="${w.id}" aria-label="Select ${esc(w.text)}" tabindex="-1" /><span class="word-head"><span class="word-text" dir="auto">${esc(w.text)}</span> <span class="muted small phonetic">${esc(w.phonetic)}</span></span>
      <span class="box-badge">${boxLabel(w.box)}</span></summary>
    <div class="stack card-back">
      ${w.meaning ? `<div class="keep-lines" dir="auto">${esc(w.meaning)}</div>` : ""}
      ${w.example ? `<div class="muted">${exampleHtml(w, `data-say-example="${w.id}"`)}</div>` : ""}
      ${w.categories.length ? `<div class="chips">${w.categories.map((c) => `<span class="chip"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span>`).join("")}</div>` : ""}
      <div class="row card-actions">
        ${canListen(w) ? `<button class="ghost small" data-listen="${w.id}">🔊 Listen</button>` : ""}
        <button class="ghost small" data-edit="${w.id}">Edit</button>
        <button class="danger small" data-del="${w.id}">Delete</button>
      </div>
    </div></details>`;
}

function bindWordItems(words, params) {
  $view.querySelectorAll("[data-listen]").forEach((b) => (b.onclick = () => listen(words.find((x) => x.id === Number(b.dataset.listen)))));
  $view.querySelectorAll("[data-say-example]").forEach((b) => (b.onclick = () => {
    const w = words.find((x) => x.id === Number(b.dataset.sayExample)); sayText(w.example, w.lang);
  }));
  $view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirmInline(b)) return;
    await api(`/api/words/${b.dataset.del}`, { method: "DELETE" }); toast("Deleted"); screens["/words"]({ params });
  }));
  $view.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
    const w = words.find((x) => x.id === Number(b.dataset.edit));
    const box = b.closest(".stack");
    box.innerHTML = `
      <div><label>Text</label><textarea data-f="text" rows="2" maxlength="500">${esc(w.text)}</textarea></div>
      <div><label>Meaning or note</label><textarea data-f="meaning">${esc(w.meaning)}</textarea></div>
      <div><label>Example</label><input data-f="example" value="${esc(w.example)}" /></div>
      <div><label>Categories</label>${catChips(w.categories.map((c) => c.id), "editcat")}</div>
      <div class="row"><button class="small" data-save>Save</button><button class="ghost small" data-cancel>Cancel</button></div>`;
    bindToggleChips(box, "editcat");
    box.querySelector("[data-cancel]").onclick = () => screens["/words"]({ params });
    box.querySelector("[data-save]").onclick = async () => {
      const f = (n) => box.querySelector(`[data-f="${n}"]`).value;
      try {
        await api(`/api/words/${w.id}`, { method: "PATCH", body: { text: f("text"), meaning: f("meaning"), example: f("example"), category_ids: pressedIds(box, "editcat") } });
        toast("Saved ✓"); screens["/words"]({ params });
      } catch (e) { toast(e.message); }
    };
  }));
}

// Two-tap delete instead of a blocking browser dialog.
function confirmInline(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1"; const old = btn.textContent; btn.textContent = "Tap again to delete";
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
  return false;
}

screens["/categories"] = async () => {
  const [settings] = await Promise.all([api("/api/me/settings"), loadCategories()]);
  const colors = ["#4F46E5", "#DC2626", "#16A34A", "#D97706", "#0891B2", "#DB2777", "#7C3AED", "#475569"];
  $view.innerHTML = `
    <h1>Categories</h1>
    <div class="card">
      <h2>New category</h2>
      <form id="new-cat" class="stack">
        <input id="cat-name" placeholder="e.g. Spanish, Poems, Math, Motivation" required maxlength="60" />
        <div class="chips" id="colors">${colors.map((c, i) => `<button type="button" class="chip" data-color="${c}" aria-pressed="${i === 0}" aria-label="Color ${c}"><span class="dot" style="background:${c}"></span></button>`).join("")}</div>
        <button class="block">Create</button>
      </form>
    </div>
    <div class="card">
      <h2>Notifications per category</h2>
      <p class="small muted">Only entries in a switched-on category are sent as reminders. “No category” covers entries you haven't put in any category.</p>
      <div class="row between word-item">
        <span class="grow row"><span class="dot" style="background:transparent;border:1px dashed currentColor"></span><b>No category</b></span>
        <label class="switch" title="Notifications"><input type="checkbox" id="notify-uncategorized" ${settings.notify_uncategorized ? "checked" : ""} aria-label="Notifications for entries without a category" /><span></span></label>
      </div>
      ${state.categories.length ? state.categories.map((c) => `
        <div class="row between word-item">
          <a class="grow row" href="#/words?category=${c.id}" style="color:inherit;text-decoration:none">
            <span class="dot" style="background:${esc(c.color)}"></span><b>${esc(c.name)}</b>
            <span class="muted small">${c.word_count} ${c.word_count === 1 ? "entry" : "entries"}</span></a>
          <label class="switch" title="Notifications"><input type="checkbox" data-notify="${c.id}" ${c.notify ? "checked" : ""} aria-label="Notifications for ${esc(c.name)}" /><span></span></label>
          <button class="danger small" data-delcat="${c.id}" aria-label="Delete ${esc(c.name)}">✕</button>
        </div>`).join("") : `<p class="muted">No categories yet.</p>`}
    </div>`;

  const colorBtns = $view.querySelectorAll("[data-color]");
  colorBtns.forEach((b) => (b.onclick = () => colorBtns.forEach((x) => x.setAttribute("aria-pressed", x === b))));
  document.getElementById("new-cat").onsubmit = async (e) => {
    e.preventDefault();
    const color = $view.querySelector('[data-color][aria-pressed="true"]').dataset.color;
    try { await api("/api/categories", { method: "POST", body: { name: document.getElementById("cat-name").value, color } }); toast("Category created"); screens["/categories"](); }
    catch (ex) { toast(ex.message); }
  };
  document.getElementById("notify-uncategorized").onchange = async (e) => {
    await api("/api/me/settings", { method: "PUT", body: { notify_uncategorized: e.target.checked } });
    toast(e.target.checked ? "Reminders on for entries without a category" : "Reminders off for entries without a category");
  };
  $view.querySelectorAll("[data-notify]").forEach((i) => (i.onchange = async () => {
    await api(`/api/categories/${i.dataset.notify}`, { method: "PATCH", body: { notify: i.checked } });
    toast(i.checked ? "Reminders on" : "Reminders off for this category");
  }));
  $view.querySelectorAll("[data-delcat]").forEach((b) => (b.onclick = async () => {
    if (!confirmInline(b)) return;
    await api(`/api/categories/${b.dataset.delcat}`, { method: "DELETE" }); toast("Category deleted (words kept)"); screens["/categories"]();
  }));
};

screens["/quiz"] = async ({ params }) => {
  await Promise.all([loadCategories(), loadTts()]);
  let category = params.get("category") || "";
  let wordId = params.get("word");
  let lastId = null, done = 0;

  const next = async () => {
    const q = new URLSearchParams();
    if (category) q.set("category_id", category);
    if (wordId) { q.set("word_id", wordId); wordId = null; }
    if (lastId) q.set("exclude_id", lastId);
    const w = await api(`/api/quiz/next?${q}`);
    draw(w);
  };

  const draw = (w) => {
    $view.innerHTML = `
      <div class="row between"><h1>Quiz</h1>
        <select id="qcat" style="width:auto"><option value="">All words</option>
          ${state.categories.map((c) => `<option value="${c.id}" ${String(c.id) === category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      ${!w ? `<div class="card center pad"><p>No words to practise yet.</p><a class="btn" href="#/words">Add words</a></div>` : `
      <div class="card quiz-card">
        <p class="muted small">${done ? `${done} reviewed this session · ` : ""}${boxLabel(w.box)}</p>
        <p class="quiz-word${w.text.length > 40 ? " long" : ""}" dir="auto">${esc(w.text)}</p>
        <p class="muted">${esc(w.phonetic)} ${canListen(w) ? `<button class="ghost small" id="listen" aria-label="Listen">🔊</button>` : ""}</p>
        <div id="answer" hidden>
          ${w.meaning ? `<p class="quiz-meaning" dir="auto">${esc(w.meaning)}</p>` : `<p class="muted small">No meaning or note added – did you remember it? You can add one with “Edit” on the Words page.</p>`}
          ${w.example ? `<p class="muted">${exampleHtml(w, 'id="say-example"')}</p>` : ""}
          <div class="quiz-actions">
            <button class="bad" id="forgot">✗ Forgot</button>
            <button class="good" id="knew">✓ I knew it</button>
          </div>
        </div>
        <button class="block brown" id="reveal" style="margin-top:1rem">Show meaning</button>
      </div>
      <p class="center small muted">Think of the meaning first, then check. Words you forget come back sooner.</p>`}`;
    document.getElementById("qcat").onchange = (e) => { category = e.target.value; lastId = null; next(); };
    if (!w) return;
    document.getElementById("listen")?.addEventListener("click", () => listen(w));
    document.getElementById("say-example")?.addEventListener("click", () => sayText(w.example, w.lang));
    document.getElementById("reveal").onclick = (e) => { e.target.hidden = true; document.getElementById("answer").hidden = false; };
    const answer = async (knew) => {
      await api("/api/quiz/answer", { method: "POST", body: { word_id: w.id, knew } });
      done++; lastId = w.id; next();
    };
    document.getElementById("knew").onclick = () => answer(true);
    document.getElementById("forgot").onclick = () => answer(false);
  };
  await next();
};

screens["/progress"] = async () => {
  const p = await api("/api/me/progress");
  const max = Math.max(1, ...p.last_7_days.map((d) => d.reviews));
  const dayName = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
  $view.innerHTML = `
    <h1>Your progress</h1>
    <div class="tiles">
      <div class="tile"><div class="num">${p.streak_days} 🔥</div><div class="lbl">day streak</div></div>
      <div class="tile"><div class="num">${p.mastered}</div><div class="lbl">words mastered</div></div>
      <div class="tile"><div class="num">${p.total_words}</div><div class="lbl">words saved</div></div>
      <div class="tile"><div class="num">${p.accuracy ?? "–"}${p.accuracy != null ? "%" : ""}</div><div class="lbl">answers correct</div></div>
    </div>
    <div class="card">
      <h2>Reviews in the last 7 days</h2>
      <div class="bars" role="img" aria-label="Reviews per day: ${p.last_7_days.map((d) => `${dayName(d.date)} ${d.reviews}`).join(", ")}">
        ${p.last_7_days.map((d) => `<div class="bar-col" tabindex="0"><span class="tip">${dayName(d.date)}: ${d.reviews} reviews</span>
          <div class="bar" style="height:${(d.reviews / max) * 100}%"></div></div>`).join("")}
      </div>
      <div class="bar-labels">${p.last_7_days.map((d) => `<span>${dayName(d.date)}</span>`).join("")}</div>
    </div>
    <div class="card">
      <h2>Where your words are</h2>
      <table class="simple">
        <tr><td>New</td><td>${p.new}</td></tr>
        <tr><td>Learning</td><td>${p.learning}</td></tr>
        <tr><td>Mastered ⭐</td><td>${p.mastered}</td></tr>
        <tr><td>Due for review now</td><td>${p.due_now}</td></tr>
      </table>
      ${p.due_now ? `<a class="btn block" href="#/quiz" style="margin-top:12px">Review ${p.due_now} due words</a>` : ""}
    </div>
    ${p.hardest.length ? `<div class="card"><h2>Hardest words</h2><table class="simple">
      ${p.hardest.map((h) => `<tr><td>${esc(h.text)}</td><td>forgot ${h.times_wrong}×</td></tr>`).join("")}</table></div>` : ""}`;
};

screens["/settings"] = async ({ params } = {}) => {
  const [s, lists, tts] = await Promise.all([api("/api/me/settings"), api("/api/starter-lists"), loadTts(true), loadCategories()]);
  const zones = (Intl.supportedValuesOf?.("timeZone") ?? [s.timezone]);
  if (!zones.includes(s.timezone)) zones.unshift(s.timezone);
  const hours = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => i + from);
  const fmtH = (h) => (h === 24 ? "Midnight" : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" }));
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const paused = s.paused_until && new Date(s.paused_until) > new Date();

  $view.innerHTML = `
    <h1>Settings</h1>
    <div class="card stack">
      <h2>Notifications</h2>
      <div id="push-status"></div>
    </div>
    <div class="card stack">
      <h2>When to remind me</h2>
      <div><label for="every">How often</label><select id="every">
        ${[[30, "Every 30 minutes"], [60, "Every hour"], [120, "Every 2 hours"], [180, "Every 3 hours"], [240, "Every 4 hours"], [360, "3 times a day"], [720, "Twice a day"], [1440, "Once a day"]]
          .map(([v, l]) => `<option value="${v}" ${v === s.notify_every_minutes ? "selected" : ""}>${l}</option>`).join("")}
        ${[30, 60, 120, 180, 240, 360, 720, 1440].includes(s.notify_every_minutes) ? "" : `<option selected value="${s.notify_every_minutes}">Every ${s.notify_every_minutes} min</option>`}
      </select></div>
      <div class="row">
        <div class="grow"><label for="start">From</label><select id="start">${hours(0, 23).map((h) => `<option value="${h}" ${h === s.active_start_hour ? "selected" : ""}>${fmtH(h)}</option>`).join("")}</select></div>
        <div class="grow"><label for="end">Until</label><select id="end">${hours(1, 24).map((h) => `<option value="${h}" ${h === s.active_end_hour ? "selected" : ""}>${fmtH(h)}</option>`).join("")}</select></div>
      </div>
      <div><label>Days</label><div class="days">${dayNames.map((d, i) => `<button type="button" class="chip" data-day="${i}" aria-pressed="${s.active_days.includes(String(i))}">${d}</button>`).join("")}</div></div>
      <div><label for="limit">Maximum per day</label><select id="limit">${[3, 5, 8, 10, 15, 20, 30].concat(s.daily_limit).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)
        .map((v) => `<option ${v === s.daily_limit ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="tz">Time zone</label><select id="tz">${zones.map((z) => `<option ${z === s.timezone ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></div>
      <p class="error" id="set-err" hidden></p>
      <button class="block" id="save-settings">Save</button>
    </div>
    <div class="card stack">
      <h2>Take a break</h2>
      <p class="small muted">${paused ? `Paused until ${new Date(s.paused_until).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.` : "Pause reminders during exams, trips or busy days."}</p>
      <div class="row">${paused ? `<button class="secondary" data-pause="0">Resume now</button>` :
        `<button class="ghost" data-pause="3">3 hours</button><button class="ghost" data-pause="24">1 day</button><button class="ghost" data-pause="168">1 week</button>`}</div>
    </div>
    ${tts.available || canSpeak ? `<div class="card stack">
      <h2>Voice</h2>
      <p class="small muted">The voice that reads your English entries and examples.</p>
      ${tts.available ? plusPanel(tts.billing) : ""}
      ${tts.available ? `<div class="voice-list" role="radiogroup" aria-label="Voice">
        ${tts.voices.map((v) => `<label class="voice-option">
          <input type="radio" name="voice" value="${v.id}" ${tts.selected === v.id ? "checked" : ""} />
          <span class="grow"><b>${esc(v.label)}</b> <span class="muted small">· ${esc(v.accent)} ${esc(v.gender)}${v.id === tts.default ? " · default" : ""}</span></span>
          <button class="ghost small" type="button" data-sample="${v.id}" aria-label="Play ${esc(v.label)}">▶</button></label>`).join("")}
        ${canSpeak ? `<label class="voice-option"><input type="radio" name="voice" value="device" ${tts.selected === "device" ? "checked" : ""} />
          <span class="grow"><b>This phone's voice</b> <span class="muted small">· works offline</span></span></label>` : ""}
      </div>` : ""}
      ${canSpeak ? `<div id="device-voice" class="stack" ${tts.available && tts.selected !== "device" ? "hidden" : ""}>
        <div class="row"><select id="voice" class="grow" style="width:auto" aria-label="Phone voice"></select>
          <button class="ghost" id="voice-test" type="button">🔊 Test</button></div>
        <p class="small muted" id="voice-hint"></p>
      </div>` : ""}
    </div>` : ""}
    <div class="card stack">
      <h2>Add from other apps</h2>
      <p class="small muted">Save a word while you read – in the browser, email, news or e-books – without copying and pasting.</p>
      <details class="help"><summary><b>Android</b> (and Chrome or Edge on a computer)</summary>
        <ol class="small"><li>Install WordPop on your Home Screen (if you haven't).</li>
          <li>In any app, select a word or sentence and tap <b>Share</b>.</li>
          <li>Pick <b>WordPop</b>. It opens with the text ready – tap <b>Save word</b>.</li></ol></details>
      <details class="help"><summary><b>iPhone</b> – one-time setup with the Shortcuts app</summary>
        <ol class="small"><li>Open the <b>Shortcuts</b> app, tap <b>+</b>, and name it “Add to WordPop”.</li>
          <li>Tap <b>ⓘ</b> (or the name at the top) and turn on <b>Show in Share Sheet</b>; set it to receive <b>Text</b>.</li>
          <li>Add the action <b>URL Encode</b> (input: <i>Shortcut Input</i>).</li>
          <li>Add the action <b>Open URLs</b> with this address, then tap the end of it and insert <i>URL Encoded Text</i>:<br>
            <code class="copy-url">${esc(location.origin)}/?text=</code> <button class="ghost small" type="button" id="copy-share-url">Copy</button></li>
          <li>Now select text in any app → <b>Share</b> → <b>Add to WordPop</b>. It opens in Safari, where you sign in once.</li></ol></details>
    </div>
    <div class="card stack">
      <h2>Import &amp; export</h2>
      <p class="small muted">Move entries to and from a spreadsheet (Excel, Google Sheets, Numbers) as a CSV file –
        for a backup, or to add many entries at once.</p>
      <div class="stack">
        <label for="export-cat">Export</label>
        <div class="row"><select id="export-cat" class="grow" style="width:auto">${categoryOptions("All entries")}</select>
          <a class="btn secondary" id="export-btn" href="/api/words/export" download>⬇ Export CSV</a></div>
      </div>
      <div class="stack">
        <label for="import-file">Import</label>
        <input id="import-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" />
        <div class="row"><select id="import-cat" class="grow" style="width:auto" aria-label="Also add to category">${categoryOptions("No extra category")}</select>
          <button class="secondary" id="import-btn" type="button" disabled>⬆ Import</button></div>
        <p class="small muted">Columns: <b>text</b> (required), meaning, example, categories (separate several with “;”).
          Entries you already have are skipped. <a href="#" id="csv-template">Download a sample file</a></p>
        <p class="small" id="import-result" hidden></p>
      </div>
    </div>
    <div class="card stack"><h2>Ready-made categories</h2><p class="small muted">Add an empty category with one tap, then fill it with your own entries.</p>${starterListHtml(lists)}</div>
    <div class="card stack">
      <h2>Account</h2>
      <p class="small muted">Signed in as ${esc(state.user.email)}</p>
      ${state.user.is_admin ? `<a class="btn secondary block" href="#/admin">📊 App statistics (admin)</a>` : ""}
      <button class="ghost block" id="logout">Sign out</button>
      <button class="danger block" id="delete-account">Delete my account and all data</button>
      <p class="center small"><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
    </div>`;

  bindToggleChips($view, "day");
  bindStarterButtons();
  renderPushStatus();
  if (canSpeak) bindVoicePicker();
  bindImportExport();
  document.getElementById("copy-share-url").onclick = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/?text=`); toast("Copied ✓"); }
    catch { toast("Press and hold the address to copy it"); }
  };
  if (tts.available) { bindNaturalVoices(); bindPlus(); }
  if (params?.get("plus") === "success") { history.replaceState(null, "", "#/settings"); welcomeToPlus(); }

  document.getElementById("save-settings").onclick = async () => {
    const err = document.getElementById("set-err"); err.hidden = true;
    const start = Number(document.getElementById("start").value), end = Number(document.getElementById("end").value);
    if (end <= start) { err.textContent = "“Until” must be later than “From”."; err.hidden = false; return; }
    try {
      await api("/api/me/settings", { method: "PUT", body: {
        notify_every_minutes: Number(document.getElementById("every").value), active_start_hour: start, active_end_hour: end,
        active_days: pressedIds($view, "day").sort().join(""), daily_limit: Number(document.getElementById("limit").value),
        timezone: document.getElementById("tz").value } });
      toast("Settings saved ✓");
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  $view.querySelectorAll("[data-pause]").forEach((b) => (b.onclick = async () => {
    await api("/api/me/pause", { method: "POST", body: { hours: Number(b.dataset.pause) } });
    toast(b.dataset.pause === "0" ? "Reminders resumed" : "Reminders paused"); screens["/settings"]();
  }));
  document.getElementById("logout").onclick = async () => { await api("/api/auth/logout", { method: "POST" }); state.user = null; state.tts = null; location.hash = "#/login"; };
  document.getElementById("delete-account").onclick = async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to permanently delete everything"; return; }
    await api("/api/auth/me", { method: "DELETE" }); state.user = null; state.tts = null; toast("Account deleted"); location.hash = "#/login";
  };
};

screens["/admin"] = async () => {
  const s = await api("/api/admin/stats");
  const pct = (v) => (v == null ? "not enough data yet" : `${v}%`);
  $view.innerHTML = `
    <h1>App statistics</h1>
    <div class="tiles">
      <div class="tile"><div class="num">${s.users_total}</div><div class="lbl">users</div></div>
      <div class="tile"><div class="num">${s.active_last_7_days}</div><div class="lbl">active last 7 days</div></div>
    </div>
    <div class="card"><table class="simple">
      <tr><td>Sign-ups, last 7 days</td><td>${s.signups_last_7_days}</td></tr>
      <tr><td>Users with notifications on</td><td>${s.users_with_notifications}</td></tr>
      <tr><td>Users with 10+ words</td><td>${s.users_with_10_plus_words}</td></tr>
      <tr><td>Average words per user</td><td>${s.avg_words_per_user}</td></tr>
      <tr><td>Quiz answers, last 7 days</td><td>${s.reviews_last_7_days}</td></tr>
      <tr><td>Came back after 1 day</td><td>${pct(s.retention_day_1_pct)}</td></tr>
      <tr><td>Came back after 7 days</td><td>${pct(s.retention_day_7_pct)}</td></tr>
      <tr><td>Came back after 28 days</td><td>${pct(s.retention_day_28_pct)}</td></tr>
    </table></div>
    <a href="#/settings">← Back to settings</a>`;
};

// ---------- push notifications ----------
function b64ToUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") { toast("Notifications were not allowed"); return false; }
  const { key } = await api("/api/push/public-key");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  await api("/api/push/subscribe", { method: "POST", body: sub.toJSON() });
  toast("Notifications on ✓");
  return true;
}

async function renderPushStatus() {
  const el = document.getElementById("push-status"); if (!el) return;
  if (!pushSupported()) {
    el.innerHTML = isIOS() && !isStandalone()
      ? `<p>To get reminders on iPhone, add WordPop to your Home Screen first: tap <span class="share-ico">⬆</span> <b>Share</b> → <b>Add to Home Screen</b>, then open it from there.</p>`
      : `<p class="muted">This browser doesn't support notifications.</p>`;
    return;
  }
  const sub = await currentSubscription();
  if (Notification.permission === "denied") {
    el.innerHTML = `<p>Notifications are blocked. Turn them on in your phone's <b>Settings → Notifications → WordPop</b>.</p>`;
  } else if (sub) {
    el.innerHTML = `<p>✅ Notifications are on for this device.</p>
      <div class="row"><button class="secondary" id="test-push">Send me a word now</button><button class="ghost" id="off-push">Turn off</button></div>`;
    document.getElementById("test-push").onclick = async () => {
      try { const r = await api("/api/push/test", { method: "POST" }); toast(r.delivered ? "Sent – check your notifications" : "Couldn't deliver, try turning notifications off and on"); }
      catch (e) { toast(e.message); }
    };
    document.getElementById("off-push").onclick = async () => {
      await api("/api/push/unsubscribe", { method: "POST", body: sub.toJSON() }); await sub.unsubscribe(); renderPushStatus();
    };
  } else {
    el.innerHTML = `<p class="muted">Get your words as reminders on this device.</p><button class="block" id="on-push">Turn on notifications</button>`;
    document.getElementById("on-push").onclick = async () => { try { await enablePush(); } catch (e) { toast(e.message); } renderPushStatus(); };
  }
}

// Ask at a helpful moment (after adding a word), never on first load.
async function maybeAskForNotifications() {
  const box = document.getElementById("notif-ask");
  if (!box || !pushSupported() || Notification.permission !== "default" || sessionStorageGet("askedPush")) return;
  if (await currentSubscription()) return;
  box.innerHTML = `<div class="card notice stack"><b>🔔 Want reminders for your words?</b>
    <p class="small" style="margin:0">Allow notifications and WordPop will remind you of your words during the day. You choose how often in Settings.</p>
    <div class="row"><button id="ask-yes">Allow notifications</button><button class="ghost" id="ask-no">Not now</button></div></div>`;
  document.getElementById("ask-yes").onclick = async () => { try { await enablePush(); } catch (e) { toast(e.message); } box.innerHTML = ""; };
  document.getElementById("ask-no").onclick = () => { sessionStorageSet("askedPush", "1"); box.innerHTML = ""; };
}

// ---------- router ----------
// ---------- Share to WordPop ----------
// Android (and Chrome/Edge on computers) list the installed app in the Share menu; it then opens
// as /?share_text=...&share_title=...&share_url=... . On iPhone a Shortcut opens /?text=... .
// The text is kept in sessionStorage so it survives a sign-in, then prefilled in "Add".
const SHARE_KEY = "wordpop.shared";
function cleanShared(text, title) {
  const tidy = (s) => (s || "").replace(/https?:\/\/\S+/g, "").trim()
    .replace(/^["“”'‘’«]+|["“”'‘’»]+$/g, "").trim();
  return (tidy(text) || tidy(title)).slice(0, 500);
}
function captureShare() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].some((k) => ["share_text", "share_title", "share_url", "text"].includes(k))) return;
  const shared = cleanShared(q.get("share_text") ?? q.get("text"), q.get("share_title"));
  if (shared) sessionStorageSet(SHARE_KEY, shared);
  history.replaceState(null, "", "/#/words"); // tidy the address; the text is kept for the Words screen
}
function takeShared() {
  const t = sessionStorageGet(SHARE_KEY);
  if (t) sessionStorageSet(SHARE_KEY, "");
  return t || "";
}

async function render() {
  const r = route();
  const publicRoute = ["/login", "/forgot", "/reset"].includes(r.path);
  if (!state.user && !publicRoute) {
    try { state.user = await api("/api/auth/me"); }
    catch (e) {
      if (e.status === 401) { location.hash = "#/login"; return; }
      // Server unreachable: keep the user signed in and offer a retry instead of the login page.
      $view.innerHTML = `<div class="card center pad"><p>${esc(e.message)}</p><button onclick="location.reload()">Try again</button></div>`;
      return;
    }
  }
  if (state.user && r.path === "/login") { location.hash = "#/words"; return; }
  $tabbar.hidden = !state.user || publicRoute;
  $tabbar.querySelectorAll("a").forEach((a) => a.classList.toggle("active", r.path === `/${a.dataset.tab}`));
  const screen = screens[r.path] || screens["/words"];
  try { await screen(r); }
  catch (e) { $view.innerHTML = `<div class="card center pad"><p class="error">${esc(e.message)}</p><button onclick="location.reload()">Try again</button></div>`; }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
if ("serviceWorker" in navigator) {
  // When a new version of the app finishes installing, it takes over this page; reload once
  // so the person sees the update right away instead of on the next launch.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    // Never throw away something being typed: then reload when the app is next put away.
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (!typing) location.reload();
    else document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && location.reload());
  });
  navigator.serviceWorker.register("/sw.js").then((reg) => reg.update()).catch(() => {});
  // A PWA can stay open in the background for days: look for an update whenever it comes back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  });
}
// When a notification is tapped while the app is open, the service worker asks us to navigate.
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "navigate") location.hash = e.data.url.replace(/^\/?/, ""); });
captureShare();
render();
