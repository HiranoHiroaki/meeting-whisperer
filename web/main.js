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
const API_BASE = localStorage.getItem("meeting_whisperer_api_base") || "http://localhost:7071/api";

const state = {
  demoData: null,
  timers: [],
  terms: [],
  activeTerm: null,
  clickLog: [],
  profile: loadProfile(),
  liveMeetingText: "",
  liveDetails: {},
};

const modeSelect = document.querySelector("#modeSelect");
const sampleSelect = document.querySelector("#sampleSelect");
const speedSelect = document.querySelector("#speedSelect");
const startBtn = document.querySelector("#startBtn");
const resetBtn = document.querySelector("#resetBtn");
const modeNotice = document.querySelector("#modeNotice");
const streamList = document.querySelector("#streamList");
const termChips = document.querySelector("#termChips");
const termTitle = document.querySelector("#termTitle");
const termDetail = document.querySelector("#termDetail");
const unknownBtn = document.querySelector("#unknownBtn");
const interestBtn = document.querySelector("#interestBtn");
const profileSummary = document.querySelector("#profileSummary");
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

  sampleSelect.addEventListener("change", () => {
    void loadSample(sampleSelect.value);
  });

  modeSelect.addEventListener("change", () => {
    updateModeView();
  });

  startBtn.addEventListener("click", async () => {
    if (modeSelect.value === "scripted") {
      startPlayback();
      return;
    }

    await startLiveMode();
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

  notesBtn.addEventListener("click", async () => {
    await generateNotes();
  });

  updateModeView();
  renderProfileSummary();
  void loadSample(SAMPLE_FILES[0].file);
}

async function loadSample(fileName) {
  clearTimers();
  resetPlayback();

  const path = `../doc/samples/scripted-demo/${fileName}`;
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load sample: ${fileName}`);
  }

  state.demoData = await response.json();
  notesOutput.textContent = "No notes generated yet.";
}

function updateModeView() {
  if (modeSelect.value === "live") {
    modeNotice.textContent = `Live API mode: ${API_BASE} に接続して抽出・説明・まとめを実行します。`;
    modeNotice.classList.remove("hidden");
    speedSelect.disabled = true;
  } else {
    modeNotice.classList.add("hidden");
    speedSelect.disabled = false;
  }
}

function startPlayback() {
  if (!state.demoData) {
    return;
  }

  resetPlayback();

  const speed = Number(speedSelect.value || "1");
  for (const event of state.demoData.events) {
    const waitMs = Math.round(event.at_ms / speed);
    const timer = setTimeout(() => {
      handleEvent(event);
    }, waitMs);
    state.timers.push(timer);
  }
}

async function startLiveMode() {
  if (!state.demoData) {
    return;
  }

  resetPlayback();
  const lines = state.demoData.events.filter((e) => e.type === "line");
  state.liveMeetingText = lines.map((x) => `${x.speaker}: ${x.text}`).join("\n");

  for (const line of lines.slice(0, 20)) {
    appendLine(line);
  }

  try {
    const response = await postJson(`${API_BASE}/extractTerms`, {
      text: state.liveMeetingText,
    });

    const terms = normalizeExtractTerms(response);
    if (terms.length === 0) {
      notesOutput.textContent = "No terms detected from API response.";
      return;
    }

    state.terms = terms.slice(0, 5);
    renderTermChips();
    notesOutput.textContent = "Terms extracted by Live API. Select one to fetch contextual explanation.";
  } catch (error) {
    notesOutput.textContent = `Live API error: ${String(error)}`;
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
      termDetail.textContent = cached;
      return;
    }

    termDetail.textContent = "Loading explanation...";
    try {
      const response = await postJson(`${API_BASE}/explainTerm`, {
        term: state.activeTerm,
        context: state.liveMeetingText,
      });
      const detail = response?.detail || "No detail returned.";
      state.liveDetails[state.activeTerm] = detail;
      termDetail.textContent = detail;
    } catch (error) {
      termDetail.textContent = `Live explain error: ${String(error)}`;
    }
    return;
  }

  const hint = state.demoData.expected_weak_contexts?.slice(0, 2).join(" / ") || "meeting context";
  termDetail.textContent = `この会議では「${state.activeTerm}」は ${hint} に関連する概念を指している可能性があります。`;
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
      const response = await postJson(`${API_BASE}/generateNotes`, {
        clickedTerms,
        meetingText: state.liveMeetingText,
      });
      notesOutput.textContent = response?.notes || "No notes returned.";
      return;
    } catch (error) {
      notesOutput.textContent = `Live notes error: ${String(error)}`;
      return;
    }
  }

  const preview = picked.slice(0, 5).join(", ");
  notesOutput.textContent = `今回の会話では ${preview} などの用語で認知ギャップが発生しました。次回は同系列の用語を先読みして提示すると、会議中の聞き返しコストを下げられます。`;
}

function resetPlayback() {
  clearTimers();
  state.terms = [];
  state.activeTerm = null;
  state.clickLog = [];
  state.liveMeetingText = "";
  state.liveDetails = {};
  streamList.innerHTML = "";
  termChips.innerHTML = "";
  renderTermDetail();
  notesOutput.textContent = "No notes generated yet.";
}

function clearTimers() {
  for (const timer of state.timers) {
    clearTimeout(timer);
  }
  state.timers = [];
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
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const msg = json?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(msg);
  }

  return json;
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
