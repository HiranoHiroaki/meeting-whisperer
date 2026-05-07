const SAMPLE_FILES = [
  { file: "sample-01-system-development-demo.json", label: "01 | System Development" },
  { file: "sample-02-management-demo.json", label: "02 | Management" },
  { file: "sample-03-manufacturing-demo.json", label: "03 | Manufacturing" },
  { file: "sample-04-fashion-demo.json", label: "04 | Fashion" },
  { file: "sample-05-welfare-services-demo.json", label: "05 | Welfare" },
  { file: "sample-06-healthcare-demo.json", label: "06 | Healthcare" },
  { file: "sample-07-homelab-demo.json", label: "07 | Homelab" },
  { file: "sample-08-social-slang-demo.json", label: "08 | Social Slang" },
];

const STORAGE_KEY = "meeting_whisperer_profile_v1";
const API_STORAGE_KEY = "meeting_whisperer_api_base";
const DEFAULT_API_BASE = "http://localhost:7071/api";

const state = {
  demoData: null,
  terms: [],
  activeTerm: null,
  clickLog: [],
  profile: loadProfile(),
  liveMeetingText: "",
  liveDetails: {},
  apiBase: loadApiBase(),
  processedLines: 0,
  totalLines: 0,
  playback: {
    running: false,
    paused: false,
    cursor: 0,
    speed: 1,
    token: 0,
    events: [],
  },
};

const modeSelect = document.querySelector("#modeSelect");
const sampleSelect = document.querySelector("#sampleSelect");
const speedSelect = document.querySelector("#speedSelect");
const apiBaseInput = document.querySelector("#apiBaseInput");
const saveApiBtn = document.querySelector("#saveApiBtn");
const pingApiBtn = document.querySelector("#pingApiBtn");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const modeNotice = document.querySelector("#modeNotice");
const runStatus = document.querySelector("#runStatus");

const streamList = document.querySelector("#streamList");
const streamMeta = document.querySelector("#streamMeta");
const streamProgress = document.querySelector("#streamProgress");

const termChips = document.querySelector("#termChips");
const termTitle = document.querySelector("#termTitle");
const termDetail = document.querySelector("#termDetail");
const extractSource = document.querySelector("#extractSource");
const explainSource = document.querySelector("#explainSource");
const notesSource = document.querySelector("#notesSource");

const unknownBtn = document.querySelector("#unknownBtn");
const interestBtn = document.querySelector("#interestBtn");

const profileSummary = document.querySelector("#profileSummary");
const clearProfileBtn = document.querySelector("#clearProfileBtn");
const clickList = document.querySelector("#clickList");

const notesBtn = document.querySelector("#notesBtn");
const notesOutput = document.querySelector("#notesOutput");

init();

function init() {
  for (const sample of SAMPLE_FILES) {
    const opt = document.createElement("option");
    opt.value = sample.file;
    opt.textContent = sample.label;
    sampleSelect.append(opt);
  }

  apiBaseInput.value = state.apiBase;

  sampleSelect.addEventListener("change", () => {
    void loadSample(sampleSelect.value);
  });

  modeSelect.addEventListener("change", () => {
    updateModeView();
  });

  saveApiBtn.addEventListener("click", () => {
    const next = sanitizeApiBase(apiBaseInput.value);
    if (!next) {
      setRunStatus("API Base is invalid.");
      return;
    }
    state.apiBase = next;
    localStorage.setItem(API_STORAGE_KEY, next);
    apiBaseInput.value = next;
    setRunStatus(`Saved API Base: ${next}`);
    updateModeView();
  });

  pingApiBtn.addEventListener("click", async () => {
    await pingApi();
  });

  startBtn.addEventListener("click", async () => {
    if (modeSelect.value === "scripted") {
      await startPlayback();
      return;
    }

    await startLiveMode();
  });

  pauseBtn.addEventListener("click", () => {
    togglePause();
  });

  resetBtn.addEventListener("click", () => {
    resetPlayback();
  });

  unknownBtn.addEventListener("click", () => {
    recordAction("unknown");
  });

  interestBtn.addEventListener("click", () => {
    recordAction("interest");
  });

  clearProfileBtn.addEventListener("click", () => {
    state.profile = {};
    saveProfile(state.profile);
    state.clickLog = [];
    renderProfileSummary();
    renderClickList();
    setRunStatus("Local profile cleared.");
  });

  notesBtn.addEventListener("click", async () => {
    await generateNotes();
  });

  updateModeView();
  renderProfileSummary();
  renderClickList();
  updateStreamMeta(0, 0);
  setRunStatus("Ready.");
  void loadSample(SAMPLE_FILES[0].file);
}

async function loadSample(fileName) {
  stopPlaybackEngine();
  resetPlayback();

  const path = `../doc/samples/scripted-demo/${fileName}`;
  const response = await fetch(path);
  if (!response.ok) {
    setRunStatus(`Failed to load sample: ${fileName}`);
    throw new Error(`Failed to load sample: ${fileName}`);
  }

  state.demoData = await response.json();
  const total = countLineEvents(state.demoData.events);
  updateStreamMeta(0, total);
  notesOutput.textContent = "No notes generated yet.";
  setRunStatus(`Loaded sample: ${fileName}`);
}

function updateModeView() {
  if (modeSelect.value === "live") {
    modeNotice.textContent = `Live API mode: ${state.apiBase} に接続して抽出・説明・まとめを実行します。`;
    modeNotice.classList.remove("hidden");
    speedSelect.disabled = true;
    pauseBtn.disabled = true;
  } else {
    modeNotice.classList.add("hidden");
    speedSelect.disabled = false;
    pauseBtn.disabled = !state.playback.running;
  }
}

async function startPlayback() {
  if (!state.demoData) {
    setRunStatus("No sample loaded.");
    return;
  }

  if (state.playback.running && state.playback.paused) {
    state.playback.paused = false;
    pauseBtn.textContent = "Pause";
    setRunStatus("Resumed scripted playback.");
    return;
  }

  resetPlayback();

  state.playback.running = true;
  state.playback.paused = false;
  state.playback.cursor = 0;
  state.playback.speed = Number(speedSelect.value || "1");
  state.playback.events = [...state.demoData.events].sort((a, b) => a.at_ms - b.at_ms);
  state.playback.token += 1;
  pauseBtn.disabled = false;
  pauseBtn.textContent = "Pause";

  setRunStatus("Scripted playback started.");
  await runScriptedLoop(state.playback.token);
}

async function runScriptedLoop(token) {
  while (state.playback.running && state.playback.cursor < state.playback.events.length) {
    if (token !== state.playback.token) {
      return;
    }

    if (state.playback.paused) {
      await sleep(120);
      continue;
    }

    const idx = state.playback.cursor;
    const event = state.playback.events[idx];
    const prevAt = idx === 0 ? 0 : state.playback.events[idx - 1].at_ms;
    const delay = Math.max(0, Math.round((event.at_ms - prevAt) / state.playback.speed));

    await sleep(delay);
    if (token !== state.playback.token || !state.playback.running) {
      return;
    }

    handleEvent(event);
    state.playback.cursor += 1;
  }

  if (token === state.playback.token) {
    stopPlaybackEngine();
    setRunStatus("Scripted playback finished.");
  }
}

function togglePause() {
  if (!state.playback.running) {
    return;
  }

  state.playback.paused = !state.playback.paused;
  pauseBtn.textContent = state.playback.paused ? "Resume" : "Pause";
  setRunStatus(state.playback.paused ? "Playback paused." : "Playback resumed.");
}

async function startLiveMode() {
  if (!state.demoData) {
    setRunStatus("No sample loaded.");
    return;
  }

  stopPlaybackEngine();
  resetPlayback();

  const lines = state.demoData.events.filter((e) => e.type === "line");
  state.liveMeetingText = lines.map((x) => `${x.speaker}: ${x.text}`).join("\n");

  const previewLines = lines.slice(0, 20);
  for (const line of previewLines) {
    appendLine(line);
  }
  updateStreamMeta(previewLines.length, previewLines.length);

  setRunStatus("Calling extractTerms API...");

  try {
    const response = await postJson(`${state.apiBase}/extractTerms`, {
      text: state.liveMeetingText,
    });

    const terms = normalizeExtractTerms(response);
    if (terms.length === 0) {
      notesOutput.textContent = "No terms detected from API response.";
      extractSource.textContent = String(response?.source ?? "-");
      setRunStatus("Live mode ran, but no terms were detected.");
      return;
    }

    state.terms = terms.slice(0, 5);
    renderTermChips();
    extractSource.textContent = String(response?.source ?? "-");
    notesOutput.textContent = "Terms extracted by Live API. Select a term to fetch explanation.";
    setRunStatus(`Live extract succeeded. source=${extractSource.textContent}`);
  } catch (error) {
    notesOutput.textContent = `Live API error: ${String(error)}`;
    setRunStatus(`Live extract failed: ${String(error)}`);
  }
}

function handleEvent(event) {
  if (event.type === "line") {
    appendLine(event);
    return;
  }

  if (event.type === "term_chip") {
    for (const term of event.terms) {
      upsertTermChip(term);
    }
  }
}

function appendLine(event) {
  const line = document.createElement("article");
  line.className = "stream-line";

  const speaker = document.createElement("p");
  speaker.className = "stream-speaker";
  speaker.textContent = event.speaker;

  const text = document.createElement("p");
  text.className = "stream-text";
  text.innerHTML = highlightText(event.text, event.highlight_terms || []);

  line.append(speaker, text);
  streamList.append(line);
  streamList.scrollTop = streamList.scrollHeight;

  state.processedLines += 1;
  updateStreamMeta(state.processedLines, state.totalLines || state.processedLines);
}

function upsertTermChip(term) {
  state.terms = state.terms.filter((t) => t !== term);
  state.terms.unshift(term);
  state.terms = state.terms.slice(0, 5);
  renderTermChips();
}

function renderTermChips() {
  termChips.innerHTML = "";

  for (const term of state.terms) {
    const chip = document.createElement("button");
    chip.className = `term-chip${state.activeTerm === term ? " active" : ""}`;
    chip.textContent = term;
    chip.addEventListener("click", () => {
      state.activeTerm = term;
      renderTermChips();
      void renderTermDetail();
    });
    termChips.append(chip);
  }
}

async function renderTermDetail() {
  if (!state.activeTerm || !state.demoData) {
    termTitle.textContent = "No term selected";
    termDetail.textContent = "Run demo and click a term chip.";
    explainSource.textContent = "-";
    unknownBtn.disabled = true;
    interestBtn.disabled = true;
    return;
  }

  termTitle.textContent = state.activeTerm;
  unknownBtn.disabled = false;
  interestBtn.disabled = false;

  if (modeSelect.value === "live") {
    const cached = state.liveDetails[state.activeTerm];
    if (cached) {
      termDetail.textContent = cached.detail;
      explainSource.textContent = cached.source;
      return;
    }

    termDetail.textContent = "Loading explanation...";
    explainSource.textContent = "loading";

    try {
      const response = await postJson(`${state.apiBase}/explainTerm`, {
        term: state.activeTerm,
        context: state.liveMeetingText,
      });
      const detail = response?.detail || "No detail returned.";
      const source = String(response?.source ?? "-");
      state.liveDetails[state.activeTerm] = { detail, source };
      termDetail.textContent = detail;
      explainSource.textContent = source;
      setRunStatus(`Explain fetched. source=${source}`);
    } catch (error) {
      termDetail.textContent = `Live explain error: ${String(error)}`;
      explainSource.textContent = "error";
      setRunStatus(`Explain failed: ${String(error)}`);
    }
    return;
  }

  const hint = state.demoData.expected_weak_contexts?.slice(0, 2).join(" / ") || "meeting context";
  termDetail.textContent = `この会議では「${state.activeTerm}」は ${hint} に関連する概念を指している可能性があります。`;
  explainSource.textContent = "scripted";
}

function recordAction(action) {
  if (!state.activeTerm || !state.demoData) {
    return;
  }

  const term = state.activeTerm;
  const next = state.profile[term] || { unknown: 0, interest: 0, lastSeen: "", samples: [] };
  next[action] += 1;
  next.lastSeen = new Date().toISOString();
  if (!next.samples.includes(state.demoData.id)) {
    next.samples.push(state.demoData.id);
  }
  state.profile[term] = next;
  saveProfile(state.profile);

  state.clickLog.push({ term, action, at: new Date().toISOString() });
  renderProfileSummary();
  renderClickList();
}

function renderProfileSummary() {
  const allTerms = Object.entries(state.profile);
  if (allTerms.length === 0) {
    profileSummary.textContent = "No clicks yet.";
    return;
  }

  const ranked = allTerms
    .map(([term, v]) => ({ term, total: v.unknown + v.interest, unknown: v.unknown, interest: v.interest }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  profileSummary.textContent = ranked
    .map((x) => `${x.term} (U:${x.unknown} / I:${x.interest})`)
    .join(" | ");
}

function renderClickList() {
  clickList.innerHTML = "";

  if (state.clickLog.length === 0) {
    return;
  }

  const recent = [...state.clickLog].slice(-6).reverse();
  for (const item of recent) {
    const row = document.createElement("p");
    row.className = "click-item";
    const hhmm = new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    row.textContent = `${hhmm} | ${item.term} | ${item.action}`;
    clickList.append(row);
  }
}

async function generateNotes() {
  if (!state.demoData) {
    return;
  }

  const picked = unique(state.clickLog.map((x) => x.term));
  if (picked.length === 0) {
    notesOutput.textContent = "No clicked terms yet. Click Unknown/Interest on any term.";
    return;
  }

  if (modeSelect.value === "live") {
    try {
      const clickedTerms = state.clickLog.map((x) => ({ term: x.term, action: x.action }));
      const response = await postJson(`${state.apiBase}/generateNotes`, {
        clickedTerms,
        meetingText: state.liveMeetingText,
      });
      notesOutput.textContent = response?.notes || "No notes returned.";
      notesSource.textContent = String(response?.source ?? "-");
      setRunStatus(`Notes generated. source=${notesSource.textContent}`);
      return;
    } catch (error) {
      notesOutput.textContent = `Live notes error: ${String(error)}`;
      notesSource.textContent = "error";
      setRunStatus(`Notes failed: ${String(error)}`);
      return;
    }
  }

  const preview = picked.slice(0, 5).join(", ");
  notesOutput.textContent = `今回の会話では ${preview} などの用語で認知ギャップが発生しました。次回は同系列の用語を先読みして提示すると、会議中の聞き返しコストを下げられます。`;
  notesSource.textContent = "scripted";
}

function resetPlayback() {
  stopPlaybackEngine();
  state.terms = [];
  state.activeTerm = null;
  state.clickLog = [];
  state.liveMeetingText = "";
  state.liveDetails = {};
  state.processedLines = 0;
  state.totalLines = state.demoData ? countLineEvents(state.demoData.events) : 0;

  streamList.innerHTML = "";
  termChips.innerHTML = "";

  extractSource.textContent = "-";
  explainSource.textContent = "-";
  notesSource.textContent = "-";

  renderTermDetail();
  renderClickList();
  notesOutput.textContent = "No notes generated yet.";
  updateStreamMeta(0, state.totalLines);
  pauseBtn.textContent = "Pause";
}

function stopPlaybackEngine() {
  state.playback.running = false;
  state.playback.paused = false;
  state.playback.cursor = 0;
  state.playback.events = [];
  state.playback.token += 1;
  pauseBtn.disabled = true;
}

function updateStreamMeta(done, total) {
  state.processedLines = done;
  state.totalLines = total;
  streamMeta.textContent = `${done} / ${total} lines`;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  streamProgress.value = pct;
}

function countLineEvents(events) {
  return events.filter((e) => e.type === "line").length;
}

async function pingApi() {
  setRunStatus(`Pinging ${state.apiBase} ...`);
  try {
    const payload = await postJson(`${state.apiBase}/extractTerms`, { text: "ADR SKU RAG" });
    const source = String(payload?.source ?? "-");
    setRunStatus(`API reachable. extractTerms source=${source}`);
  } catch (error) {
    setRunStatus(`API ping failed: ${String(error)}`);
  }
}

function normalizeExtractTerms(payload) {
  if (Array.isArray(payload)) {
    return payload
      .map((x) => (typeof x?.term === "string" ? x.term.trim() : ""))
      .filter(Boolean);
  }

  if (Array.isArray(payload?.terms)) {
    return payload.terms
      .map((x) => (typeof x?.term === "string" ? x.term.trim() : ""))
      .filter(Boolean);
  }

  return [];
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const msg = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(msg);
  }

  return data;
}

function highlightText(text, terms) {
  if (!terms || terms.length === 0) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  const ordered = [...terms].sort((a, b) => b.length - a.length);
  let html = escapeHtml(text);

  for (const term of ordered) {
    const safe = escapeRegExp(term);
    const regex = new RegExp(safe, "gi");
    html = html.replace(regex, (matched) => `<mark class=\"term\">${matched}</mark>`);
  }

  return html.replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(arr) {
  return [...new Set(arr)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRunStatus(text) {
  runStatus.textContent = text;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function loadApiBase() {
  const raw = localStorage.getItem(API_STORAGE_KEY);
  return sanitizeApiBase(raw) || DEFAULT_API_BASE;
}

function sanitizeApiBase(value) {
  if (!value || typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return "";
  return text.replace(/\/$/, "");
}
