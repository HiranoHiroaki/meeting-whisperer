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

const state = {
  demoData: null,
  timers: [],
  terms: [],
  activeTerm: null,
  clickLog: [],
  profile: loadProfile(),
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

  startBtn.addEventListener("click", () => {
    if (modeSelect.value !== "scripted") {
      return;
    }
    startPlayback();
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

  notesBtn.addEventListener("click", () => {
    generateNotes();
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
    modeNotice.textContent =
      "Live API mode is reserved for backend integration. Use Scripted Demo mode during judging for stable playback.";
    modeNotice.classList.remove("hidden");
    startBtn.disabled = true;
    sampleSelect.disabled = true;
  } else {
    modeNotice.classList.add("hidden");
    startBtn.disabled = false;
    sampleSelect.disabled = false;
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
      renderTermDetail();
    });
    termChips.append(chip);
  }
}

function renderTermDetail() {
  if (!state.activeTerm || !state.demoData) {
    termTitle.textContent = "No term selected";
    termDetail.textContent = "Run demo and click a term chip.";
    unknownBtn.disabled = true;
    interestBtn.disabled = true;
    return;
  }

  const hint = state.demoData.expected_weak_contexts?.slice(0, 2).join(" / ") || "meeting context";
  termTitle.textContent = state.activeTerm;
  termDetail.textContent = `この会議では「${state.activeTerm}」は ${hint} に関連する概念を指している可能性があります。`;
  unknownBtn.disabled = false;
  interestBtn.disabled = false;
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

function generateNotes() {
  if (!state.demoData) {
    return;
  }

  const picked = unique(state.clickLog.map((x) => x.term));
  if (picked.length === 0) {
    notesOutput.textContent = "No clicked terms yet. Click Unknown/Interest on any term.";
    return;
  }

  const preview = picked.slice(0, 5).join(", ");
  notesOutput.textContent = `今回の会話では ${preview} などの用語で認知ギャップが発生しました。次回は同系列の用語を先読みして提示すると、会議中の聞き返しコストを下げられます。`;
}

function resetPlayback() {
  clearTimers();
  state.terms = [];
  state.activeTerm = null;
  state.clickLog = [];
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
