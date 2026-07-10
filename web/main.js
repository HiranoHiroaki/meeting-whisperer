import { DEBUG_CONFIG } from "./debug.config.js";
import { createTranscriptAdapter } from "./transcript-adapter.js";
import {
  buildExtractRequestPayload as buildExtractRequestPayloadCore,
  parseExtractPayload as parseExtractPayloadCore,
  buildRoutesFromExtract as buildRoutesFromExtractCore,
  resolveDictionaryProfile as resolveDictionaryProfileCore,
  resolveMeetingDomain as resolveMeetingDomainCore,
} from "./knowledge-engine.js";
import { renderSmallTalkExamples as renderSmallTalkExamplesCore } from "./render.js";
import { PERSONAL_DICTIONARY_SEED } from "./personal-dictionary.seed.js";
import { HAKASE_COMMENTS } from "./hakase-comments.js";
import { preloadUiButtonImages } from "./ui-assets.js";
import {
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
  safeSessionGet,
  safeSessionSet,
  sanitizeApiBase,
  loadApiBase as storageLoadApiBase,
  loadProfile as storageLoadProfile,
  saveProfile as storageSaveProfile,
  loadSupplements as storageLoadSupplements,
  saveSupplements as storageSaveSupplements,
  loadPersonalDictionary as storageLoadPersonalDictionary,
} from "./storage.js";

const SAMPLE_FILES = [
  { file: "sample-01-system-development-demo.json", label: "01 | システム開発" },
  { file: "sample-02-management-demo.json", label: "02 | 経営" },
  { file: "sample-03-manufacturing-demo.json", label: "03 | 製造業" },
  { file: "sample-04-fashion-demo.json", label: "04 | 服飾" },
  { file: "sample-05-welfare-services-demo.json", label: "05 | 福祉サービス" },
  { file: "sample-06-healthcare-demo.json", label: "06 | 看護・医療" },
  { file: "sample-07-homelab-demo.json", label: "07 | 自作PC/ホームラボ" },
  { file: "sample-08-social-slang-demo.json", label: "08 | 雑談/界隈用語" },
];

const STORAGE_KEY = "meeting_whisperer_profile_v1";
const API_STORAGE_KEY = "meeting_whisperer_api_base";
const API_KEY_STORAGE_KEY = "meeting_whisperer_function_key";
const SPEECH_PROVIDER_STORAGE_KEY = "meeting_whisperer_speech_provider";
const PERSONAL_DICT_STORAGE_KEY = "meeting_whisperer_personal_dictionary_v1";
const PERSONAL_DICT_CLEANUP_KEY = "meeting_whisperer_personal_dictionary_cleanup_v1";
const DEBUG_STORAGE_KEY = "meeting_whisperer_debug";
const SUPPLEMENT_STORAGE_KEY = "meeting_whisperer_supplements_v1";
const DEFAULT_LOCAL_API_BASE = "http://localhost:7071/api";
const HTTP_REQUEST_TIMEOUT_MS = 20000;

const debug = createDebugRuntime(DEBUG_CONFIG);
const transcriptAdapter = createTranscriptAdapter();
let personalDictDraft = {};

const state = {
  demoData: null,
  terms: [],
  termMeta: {},
  activeTerm: null,
  clickLog: [],
  clickSeq: 0,
  expandedUnknownByTerm: {},
  profile: loadProfile(),
  liveMeetingText: "",
  liveDetails: {},
  termSeenSeq: 0,
  personalTermSummaries: {},
  liveDebug: {
    dictionary: null,
    dispatcherPolicy: null,
    extractSource: "-",
    routes: {},
    dictionaryMode: "-",
    dictionaryProfile: null,
    dispatcherBypassed: null
  },
  generatedMinutes: "",
  generatedNotes: "",
  generatedSupplement: "",
  savedSupplements: loadSupplements(),
  hasSessionStarted: false,
  personalDictionary: loadPersonalDictionary(),
  drawerOpen: false,
  debugPanelOpen: debug.enabled,
  apiBase: loadApiBase(),
  functionKey: loadFunctionKey(),
  contextId: 0,
  extractMissQueue: [],
  extractMissInFlight: false,
  extractBatchBuffer: "",
  extractBatchInFlight: false,
  extractBatchTimer: null,
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
  voice: {
    stream: null,
    running: false,
    source: "mic",
    provider: loadSpeechProvider(),
  },
  explainPrefetchInFlight: {},
};

const menuToggleBtn = document.querySelector("#menuToggleBtn");
const menuBackdrop = document.querySelector("#menuBackdrop");
const leftMenu = document.querySelector("#leftMenu");
const editPersonalDictBtn = document.querySelector("#editPersonalDictBtn");
const personalDictEditorBody = document.querySelector("#personalDictEditorBody");
const personalDictDrawerCancelBtn = document.querySelector("#personalDictDrawerCancelBtn");
const personalDictDrawerSaveBtn = document.querySelector("#personalDictDrawerSaveBtn");

const sampleSelect = document.querySelector("#sampleSelect");
const sampleTabBtn = document.querySelector("#sampleTabBtn");
const meetTabBtn = document.querySelector("#meetTabBtn");
const voiceTabBtn = document.querySelector("#voiceTabBtn");
const sampleIngestPane = document.querySelector("#sampleIngestPane");
const meetIngestPane = document.querySelector("#meetIngestPane");
const voiceIngestPane = document.querySelector("#voiceIngestPane");
const meetingInput = document.querySelector("#meetingInput");
const meetResolveBtn = document.querySelector("#meetResolveBtn");
const meetRouteStatus = document.querySelector("#meetRouteStatus");
const voiceProviderSelect = document.querySelector("#voiceProviderSelect");
const voiceSourceSelect = document.querySelector("#voiceSourceSelect");
const voiceStartBtn = document.querySelector("#voiceStartBtn");
const voiceStopBtn = document.querySelector("#voiceStopBtn");
const voiceResetBtn = document.querySelector("#voiceResetBtn");
const voiceStatus = document.querySelector("#voiceStatus");
const playbackControls = document.querySelector("#playbackControls");
const speedSelect = document.querySelector("#speedSelect");
const apiBaseInput = document.querySelector("#apiBaseInput");
const functionKeyInput = document.querySelector("#functionKeyInput");
const saveApiBtn = document.querySelector("#saveApiBtn");
const pingApiBtn = document.querySelector("#pingApiBtn");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const modeNotice = document.querySelector("#modeNotice");
const runStatus = document.querySelector("#runStatus");
const appMain = document.querySelector(".app-main");
const dictionaryProfileInfo = document.querySelector("#dictionaryProfileInfo");
const dispatcherRateInfo = document.querySelector("#dispatcherRateInfo");

const streamList = document.querySelector("#streamList");
const streamMeta = document.querySelector("#streamMeta");
const streamProgress = document.querySelector("#streamProgress");
const streamMetaWrap = document.querySelector(".stream-meta");

const termChips = document.querySelector("#termChips");
const termTitle = document.querySelector("#termTitle");
const termDetail = document.querySelector("#termDetail");
const personalMemoText = document.querySelector("#personalMemoText");
const personalMemoTitle = document.querySelector("#personalMemoTitle");
const termContextHint = document.querySelector("#termContextHint");
const termBox2Text = document.querySelector("#termBox2Text");
const unknownExplainCard = document.querySelector("#unknownExplainCard");
const unknownExplainText = document.querySelector("#unknownExplainText");
const unknownAiSummaryText = document.querySelector("#unknownAiSummaryText");
const smallTalkList = document.querySelector("#smallTalkList");
const smallTalkListInline = document.querySelector("#smallTalkListInline");
const clearTermsBtn = document.querySelector("#clearTermsBtn");
const explainSource = document.querySelector("#explainSource");
const notesSource = document.querySelector("#notesSource");

const unknownBtn = document.querySelector("#unknownBtn");
const interestBtn = document.querySelector("#interestBtn");

const profileSummary = document.querySelector("#profileSummary");
const clearProfileBtn = document.querySelector("#clearProfileBtn");
const clickList = document.querySelector("#clickList");

const notesOutput = document.querySelector("#notesOutput");
const notesLoading = document.querySelector("#notesLoading");
const saveNotesBtn = document.querySelector("#saveNotesBtn");
const minutesZone = document.querySelector("#minutesZone");
const notesCard = document.querySelector("#notesCard");
const hakaseCard = document.querySelector(".card-8b");
const hakaseComment = document.querySelector("#hakaseComment");
const minutesBtn = document.querySelector("#minutesBtn");
const personalDictLane = document.querySelector("#personalDictLane");
const registerPersonalDictBtn = document.querySelector("#registerPersonalDictBtn");
const personalDictCard = document.querySelector("#personalDictCard");
const minutesCard = document.querySelector("#minutesCard");
const minutesOutput = document.querySelector("#minutesOutput");
const minutesLoading = document.querySelector("#minutesLoading");
const saveMinutesBtn = document.querySelector("#saveMinutesBtn");
const personalDictList = document.querySelector("#personalDictList");
const personalDictCancelBtn = document.querySelector("#personalDictCancelBtn");
const personalDictSaveBtn = document.querySelector("#personalDictSaveBtn");
const supplementBtn = document.querySelector("#supplementBtn");
const supplementCard = document.querySelector("#supplementCard");
const supplementOutput = document.querySelector("#supplementOutput");
const saveSupplementBtn = document.querySelector("#saveSupplementBtn");
const savedSupplementList = document.querySelector("#savedSupplementList");
const debugCard = document.querySelector("#debugCard");
const debugBackdrop = document.querySelector("#debugBackdrop");
const debugStateBadge = document.querySelector("#debugStateBadge");
const debugProbeBtn = document.querySelector("#debugProbeBtn");
const debugToggleBtn = document.querySelector("#debugToggleBtn");
const toTopBtn = document.querySelector("#toTopBtn");
const debugDictionaryInfo = document.querySelector("#debugDictionaryInfo");
const debugPolicyInfo = document.querySelector("#debugPolicyInfo");
const debugRouteList = document.querySelector("#debugRouteList");


const allowRuntimeDebugBridge =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
if (DEBUG_CONFIG.exposeToWindow && allowRuntimeDebugBridge) {
  window.__MW_DEBUG = {
    get enabled() {
      return debug.enabled;
    },
    set enabled(next) {
      setDebugMode(Boolean(next), "window");
    },
    enable() {
      setDebugMode(true, "window");
    },
    disable() {
      setDebugMode(false, "window");
    },
    openPanel() {
      setDebugPanelOpen(true);
    },
    closePanel() {
      setDebugPanelOpen(false);
    }
  };
}

debugLog("app", "debug runtime initialized", {
  enabled: debug.enabled,
  anchors: debug.anchors,
});

init();

function init() {
  debugLog("app", "init start");
  preloadUiButtonImages();
  ensurePersonalDictionarySeeded();
  prunePersonalDictionaryToSeedOnce();

  menuToggleBtn?.addEventListener("click", () => {
    setDrawerOpen(!state.drawerOpen);
  });
  menuBackdrop?.addEventListener("click", () => {
    setDrawerOpen(false);
  });
  editPersonalDictBtn?.addEventListener("click", () => {
    openPersonalDictDrawer();
  });
  personalDictEditorBody?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const delBtn = target.closest("button[data-delete-term]");
    if (delBtn instanceof HTMLButtonElement) {
      const term = String(delBtn.dataset.deleteTerm || "").trim();
      if (!term) return;
      markPersonalDictDeleteConfirm(term);
      return;
    }
    const confirmBtn = target.closest("button[data-delete-confirm]");
    if (confirmBtn instanceof HTMLButtonElement) {
      const term = String(confirmBtn.dataset.deleteConfirm || "").trim();
      if (!term) return;
      deletePersonalDictDraftTerm(term);
      return;
    }
    const cancelBtn = target.closest("button[data-delete-cancel]");
    if (cancelBtn instanceof HTMLButtonElement) {
      const term = String(cancelBtn.dataset.deleteCancel || "").trim();
      if (!term) return;
      clearPersonalDictDeleteConfirm(term);
    }
  });
  personalDictDrawerCancelBtn?.addEventListener("click", () => {
    setDrawerOpen(false);
  });
  personalDictDrawerSaveBtn?.addEventListener("click", () => {
    savePersonalDictDraft();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.drawerOpen) setDrawerOpen(false);
      if (state.debugPanelOpen) setDebugPanelOpen(false);
    }
  });

  for (const sample of SAMPLE_FILES) {
    const opt = document.createElement("option");
    opt.value = sample.file;
    opt.textContent = sample.label;
    sampleSelect.append(opt);
  }

  apiBaseInput.value = state.apiBase;
  if (functionKeyInput) functionKeyInput.value = state.functionKey || "";
  if (voiceProviderSelect) voiceProviderSelect.value = state.voice.provider || "webspeech";
  if (voiceSourceSelect) voiceSourceSelect.value = state.voice.source || "mic";
  streamList.classList.add("is-empty");
  if (minutesZone) minutesZone.classList.add("hidden");
  if (notesCard) notesCard.classList.add("hidden");
  if (hakaseCard) hakaseCard.classList.add("hidden");
  if (personalDictLane) personalDictLane.classList.add("hidden");
  if (personalDictCard) personalDictCard.classList.add("hidden");

  sampleSelect.addEventListener("change", () => {
    debugLog("ui", "sample changed", { file: sampleSelect.value });
    void loadSample(sampleSelect.value).catch((error) => {
      debugError("ui", "sample load failed", { file: sampleSelect.value, error: String(error) });
      setRunStatus(`サンプルの読み込みに失敗: ${String(error)}`);
    });
  });

  sampleTabBtn?.addEventListener("click", () => {
    setIngestMode("sample");
  });
  meetTabBtn?.addEventListener("click", () => {
    setIngestMode("meet_mock");
  });
  voiceTabBtn?.addEventListener("click", () => {
    setIngestMode("voice");
  });
  meetResolveBtn?.addEventListener("click", async () => {
    await runMeetMockRoute();
  });
  voiceStartBtn?.addEventListener("click", async () => {
    await startVoiceInput();
  });
  voiceStopBtn?.addEventListener("click", () => {
    stopVoiceInput("停止しました。");
  });
  voiceResetBtn?.addEventListener("click", () => {
    resetPlayback();
    setRunStatus("音声入力セッションをリセットしました。");
  });
  voiceSourceSelect?.addEventListener("change", () => {
    state.voice.source = String(voiceSourceSelect.value || "mic");
  });
  voiceProviderSelect?.addEventListener("change", () => {
    state.voice.provider = String(voiceProviderSelect.value || "webspeech");
    safeStorageSet(SPEECH_PROVIDER_STORAGE_KEY, state.voice.provider);
  });

  saveApiBtn.addEventListener("click", () => {
    debugLog("ui", "save api clicked", { raw: apiBaseInput.value });
    const next = sanitizeApiBase(apiBaseInput.value);
    if (!next) {
      setRunStatus("API接続先が不正です。");
      debugWarn("ui", "api base invalid", { raw: apiBaseInput.value });
      return;
    }
    state.apiBase = next;
    safeStorageSet(API_STORAGE_KEY, next);
    apiBaseInput.value = next;
    if (functionKeyInput) {
      state.functionKey = String(functionKeyInput.value || "").trim();
      safeSessionSet(API_KEY_STORAGE_KEY, state.functionKey);
    }
    setRunStatus(`API接続先を保存しました: ${next}`);
    updateModeView();
  });

  pingApiBtn.addEventListener("click", async () => {
    debugLog("ui", "ping api clicked", { base: state.apiBase });
    await pingApi();
  });

  startBtn.addEventListener("click", async () => {
    debugLog("ui", "start clicked", { mode: "demo_live_unified" });
    await startPlayback();
  });

  pauseBtn.addEventListener("click", () => {
    togglePause();
  });

  resetBtn.addEventListener("click", () => {
    resetPlayback();
  });

  unknownBtn.addEventListener("click", async () => {
    recordAction("unknown");
    await runUnknownAssist();
  });

  interestBtn.addEventListener("click", () => {
    recordAction("interest");
  });

  clearProfileBtn.addEventListener("click", () => {
    state.profile = {};
    saveProfile(state.profile);
    state.clickLog = [];
    state.clickSeq = 0;
    renderProfileSummary();
    renderClickList();
    setRunStatus("ローカル学習シグナルをクリアしました。");
  });
  clearTermsBtn?.addEventListener("click", () => {
    state.terms = [];
    state.termMeta = {};
    state.activeTerm = null;
    state.liveDetails = {};
    state.explainPrefetchInFlight = {};
    renderTermChips();
    void renderTermDetail();
    setRunStatus("抽出用語をクリアしました。");
  });

  profileSummary?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest("button[data-click-id]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const idRaw = btn.dataset.clickId;
    const clickId = Number(idRaw);
    if (!Number.isFinite(clickId)) return;
    removeClickSignal(clickId);
  });

  saveNotesBtn?.addEventListener("click", () => {
    if (!state.generatedNotes?.trim()) {
      setRunStatus("会議文脈付きまとめがまだありません。");
      return;
    }
    const name = `shittaka-summary-${buildTimestampCompact()}.md`;
    downloadTextAsFile(name, state.generatedNotes);
    setRunStatus(`会議文脈付きまとめを保存しました: ${name}`);
  });

  minutesBtn?.addEventListener("click", async () => {
    if (minutesZone) minutesZone.classList.remove("hidden");
    if (notesCard) notesCard.classList.remove("hidden");
    if (hakaseCard) hakaseCard.classList.remove("hidden");
    if (personalDictLane) personalDictLane.classList.remove("hidden");
    scrollToFarRightAfterLayout();
    renderHakaseComment();
    await generateMeetingOutputs();
  });

  saveMinutesBtn?.addEventListener("click", () => {
    if (!state.generatedMinutes) {
      setRunStatus("議事録がまだありません。");
      return;
    }
    downloadTextAsFile(`minutes-${buildTimestampCompact()}.md`, state.generatedMinutes);
    setRunStatus("議事録を保存しました。");
  });
  registerPersonalDictBtn?.addEventListener("click", () => {
    openPersonalDictModal();
    scrollToFarRightAfterLayout();
  });
  personalDictCancelBtn?.addEventListener("click", () => {
    closePersonalDictModal();
  });
  personalDictSaveBtn?.addEventListener("click", () => {
    commitPersonalDictionarySelection();
  });
  personalDictList?.addEventListener("change", () => {
    syncPersonalDictSaveEnabled();
  });

  supplementBtn?.addEventListener("click", () => {
    generateSupplementDocument();
  });

  saveSupplementBtn?.addEventListener("click", () => {
    if (!state.generatedSupplement) {
      setRunStatus("補足説明がまだありません。");
      return;
    }
    const term = sanitizeFileSegment(state.activeTerm || "supplement");
    const fileName = `supplement-${term}-${buildTimestampCompact()}.md`;
    downloadTextAsFile(fileName, state.generatedSupplement);
    appendSavedSupplement(fileName, state.generatedSupplement);
    setRunStatus("補足説明を保存しました。");
  });

  debugProbeBtn?.addEventListener("click", async () => {
    await probeDispatcherForDebugCard();
  });

  debugToggleBtn?.addEventListener("click", () => {
    setDebugPanelOpen(!state.debugPanelOpen);
  });
  debugBackdrop?.addEventListener("click", () => {
    setDebugPanelOpen(false);
  });
  toTopBtn?.addEventListener("click", () => {
    runToTopScroll();
  });
  appMain?.addEventListener("scroll", syncToTopButtonVisibility, { passive: true });
  window.addEventListener("scroll", syncToTopButtonVisibility, { passive: true });
  window.addEventListener("resize", syncToTopButtonVisibility, { passive: true });
  configureToTopButtonSprite();

  updateModeView();
  renderDictionaryDispatcherSummary();
  updateDebugVisibility();
  setDrawerOpen(false);
  renderProfileSummary();
  renderClickList();
  renderSavedSupplements();
  renderPersonalDictDrawer();
  renderDebugCard();
  updateStreamMeta(0, 0);
  setVoiceStatus("待機中");
  renderHakaseComment();
  syncToTopButtonVisibility();
  if (minutesBtn) minutesBtn.disabled = true;
  setRunStatus("準備完了。");
  setIngestMode("sample");
  void loadSample(SAMPLE_FILES[0].file).catch((error) => {
    debugError("app", "initial sample load failed", { error: String(error) });
    setRunStatus(`初期サンプルの読み込みに失敗: ${String(error)}`);
  });
}

function setIngestMode(mode) {
  const sampleMode = mode === "sample";
  const meetMode = mode === "meet_mock";
  const voiceMode = mode === "voice";
  sampleIngestPane?.classList.toggle("hidden", !sampleMode);
  meetIngestPane?.classList.toggle("hidden", !meetMode);
  voiceIngestPane?.classList.toggle("hidden", !voiceMode);
  sampleTabBtn?.classList.toggle("active", sampleMode);
  meetTabBtn?.classList.toggle("active", meetMode);
  voiceTabBtn?.classList.toggle("active", voiceMode);
  playbackControls?.classList.toggle("hidden", voiceMode);
  voiceStatus?.classList.toggle("hidden", !voiceMode);
  streamMetaWrap?.classList.toggle("hidden", !sampleMode);
}

function prunePersonalDictionaryToSeedOnce() {
  const already = safeStorageGet(PERSONAL_DICT_CLEANUP_KEY);
  if (already === "1") return;

  const seed = buildSeedPersonalDictionary();
  const seedKeys = new Set(Object.keys(seed));
  const current = state.personalDictionary && typeof state.personalDictionary === "object"
    ? state.personalDictionary
    : {};

  const pruned = {};
  for (const key of Object.keys(current)) {
    if (!seedKeys.has(key)) continue;
    pruned[key] = current[key];
  }
  const merged = { ...seed, ...pruned };
  state.personalDictionary = merged;
  safeStorageSet(PERSONAL_DICT_STORAGE_KEY, JSON.stringify(merged));
  safeStorageSet(PERSONAL_DICT_CLEANUP_KEY, "1");
}

function ensurePersonalDictionarySeeded() {
  const seed = buildSeedPersonalDictionary();
  const current = state.personalDictionary && typeof state.personalDictionary === "object"
    ? state.personalDictionary
    : {};
  const merged = { ...seed, ...current };
  state.personalDictionary = merged;
  safeStorageSet(PERSONAL_DICT_STORAGE_KEY, JSON.stringify(merged));
}

async function runMeetMockRoute() {
  const raw = String(meetingInput?.value ?? "").trim();
  if (!raw) {
    setRunStatus("Meet URL / conferenceRecord ID を入力してください。");
    return;
  }
  if (meetResolveBtn) meetResolveBtn.disabled = true;
  try {
    const steps = [
      "1. ユーザー入力を受領",
      "2. Meet APIでconferenceRecords解決 (mock)",
      "3. transcripts一覧取得 (mock)",
      "4. transcripts.entries取得 (mock)",
      "5. entries を TranscriptLine[] に変換 (mock)",
      "6. SessionStoreへ流し込み (既存再生導線)"
    ];
    for (const step of steps) {
      if (meetRouteStatus) meetRouteStatus.textContent = step;
      setRunStatus(`Meet導線(Mock): ${step}`);
      await sleep(240);
    }

    const lines = buildMockTranscriptLines(raw);
    applyTranscriptLinesToSession(lines, raw);
    if (meetRouteStatus) meetRouteStatus.textContent = `完了: ${lines.length}行を読み込みました`;
    setRunStatus("Meet導線(Mock)完了。開始ボタンで再生できます。");
  } finally {
    if (meetResolveBtn) meetResolveBtn.disabled = false;
  }
}

function buildMockTranscriptLines(sourceTag) {
  const seed = sanitizeFileSegment(sourceTag).slice(0, 12) || "meet";
  return [
    { speaker: "田中", text: `会議コード(${seed}) の transcript を取り込めるか確認します。` },
    { speaker: "佐藤", text: "conferenceRecords を解決して transcripts 一覧を引く流れでいきます。" },
    { speaker: "高橋", text: "transcripts.entries を TranscriptLine[] に正規化して既存 SessionStore に流し込みます。" },
    { speaker: "村上", text: "再生は既存の会議ログ導線をそのまま使える形に揃えます。" },
  ];
}

function applyTranscriptLinesToSession(lines, sourceTag) {
  stopPlaybackEngine();
  resetPlayback();
  const events = lines.map((line, idx) => ({
    type: "line",
    at_ms: idx * 2100,
    speaker: line.speaker,
    text: line.text,
    highlight_terms: [],
  }));
  state.demoData = {
    id: `meet-mock-${Date.now()}`,
    source: "meet_mock",
    title: `Meet Mock: ${sourceTag}`,
    events,
  };
  state.totalLines = events.length;
  updateStreamMeta(0, state.totalLines);
  streamList.innerHTML = "";
  streamList.classList.add("is-empty");
}

async function loadSample(fileName) {
  debugLog("app", "loadSample start", { fileName });
  stopPlaybackEngine();
  resetPlayback();

  const path = `./doc/samples/scripted-demo/${fileName}`;
  const response = await fetch(path);
  debugLog("app", "loadSample fetch completed", { path, status: response.status, ok: response.ok });
  if (!response.ok) {
    setRunStatus(`サンプル読み込み失敗: ${fileName}`);
    throw new Error(`サンプル読み込み失敗: ${fileName}`);
  }

  state.demoData = await response.json();
  const total = countLineEvents(state.demoData.events);
  debugLog("app", "loadSample parsed", {
    id: state.demoData?.id,
    events: state.demoData?.events?.length ?? 0,
    totalLines: total,
  });
  updateStreamMeta(0, total);
  notesOutput.textContent = "まだ生成していません。";
  setRunStatus(`サンプル読み込み完了: ${fileName}`);
}

function updateModeView() {
  debugLog("ui", "updateModeView", { mode: "demo_live_unified", apiBase: state.apiBase });
  modeNotice.textContent = `演出デモ再生 + Live API実行: ${state.apiBase}`;
  modeNotice.classList.remove("hidden");
  speedSelect.disabled = false;
  pauseBtn.disabled = !state.playback.running;
  setButtonLabel(startBtn, "開始");
  renderDebugCard();
  renderDictionaryDispatcherSummary();
}

async function startPlayback() {
  debugLog("playback", "startPlayback called", {
    hasDemoData: Boolean(state.demoData),
    running: state.playback.running,
    paused: state.playback.paused,
  });
  if (!state.demoData) {
    setRunStatus("サンプルが読み込まれていません。");
    return;
  }

  if (state.playback.running && state.playback.paused) {
    setRunStatus("一時停止中に開始が押されたため、先頭から再生をやり直します。");
  }

  state.hasSessionStarted = true;
  renderDictionaryDispatcherSummary();
  resetPlayback();
  const contextId = state.contextId;
  const lines = state.demoData.events.filter((e) => e.type === "line");
  state.liveMeetingText = "";
  debugLog("api", "unified payload prepared", { lineCount: lines.length, textLength: 0 });

  state.playback.running = true;
  state.playback.paused = false;
  state.playback.cursor = 0;
  state.playback.speed = Number(speedSelect.value || "1");
  state.playback.events = [...state.demoData.events].sort((a, b) => a.at_ms - b.at_ms);
  state.playback.token += 1;
  debugLog("playback", "playback initialized", {
    speed: state.playback.speed,
    totalEvents: state.playback.events.length,
    token: state.playback.token,
  });
  pauseBtn.disabled = false;
  setButtonLabel(pauseBtn, "一時停止");

  setRunStatus("演出デモ再生を開始。Live APIで用語抽出中...");
  await runScriptedLoop(state.playback.token);
}

async function transcribeAudioSegment(audioBase64, mimeType) {
  const response = await postJson(`${state.apiBase}/transcribeAudio`, {
    audioContent: audioBase64,
    mimeType,
    languageCode: "ja-JP",
  });
  return String(response?.text ?? "");
}

async function startVoiceInput() {
  stopPlaybackEngine();
  resetPlayback();

  state.voice.source = String(voiceSourceSelect?.value || "mic");
  state.voice.provider = String(voiceProviderSelect?.value || state.voice.provider || "webspeech");
  if (state.voice.source === "tab") {
    try {
      state.voice.stream = await transcriptAdapter.acquireTabStream();
    } catch (error) {
      setVoiceStatus("タブ音声の取得を許可できませんでした。");
      setRunStatus(`音声入力開始に失敗: ${String(error)}`);
      return;
    }
  }
  try {
    await transcriptAdapter.start({
      provider: state.voice.provider,
      source: state.voice.source,
      tabStream: state.voice.stream,
      transcribe: transcribeAudioSegment,
      onStatus: (text) => setVoiceStatus(text),
      onInterim: (text) => setVoiceStatus(`認識中: ${text.slice(0, 80)}`),
      onFinal: (text) => {
        appendLiveTranscriptLine(text);
        setVoiceStatus("実行中: 発話を待機しています...");
      },
      onError: (text) => stopVoiceInput(text),
      onStarted: (text) => setVoiceStatus(text),
    });
    state.voice.running = true;
    bootstrapVoiceSession();
    setRunStatus("音声入力を開始しました。会議ログと抽出をリアルタイム更新します。");
  } catch (error) {
    stopVoiceInput(`音声入力開始に失敗: ${String(error)}`);
  }
}

function bootstrapVoiceSession() {
  state.hasSessionStarted = true;
  renderDictionaryDispatcherSummary();
  state.playback.running = true;
  state.playback.paused = false;
  state.extractMissQueue = [];
  state.extractMissInFlight = false;
  state.extractBatchBuffer = "";
  state.extractBatchInFlight = false;
  if (state.extractBatchTimer) {
    clearTimeout(state.extractBatchTimer);
    state.extractBatchTimer = null;
  }
  state.processedLines = 0;
  state.totalLines = 0;
  updateStreamMeta(0, 0);
  pauseBtn.disabled = true;
}

function stopVoiceInput(statusText = "停止しました。") {
  const hadVoiceSession = Boolean(transcriptAdapter.isRunning() || state.voice.stream || state.voice.running);
  state.voice.running = false;
  transcriptAdapter.stop();
  if (state.extractBatchTimer) {
    clearTimeout(state.extractBatchTimer);
    state.extractBatchTimer = null;
  }
  if (state.voice.stream) {
    for (const track of state.voice.stream.getTracks()) track.stop();
    state.voice.stream = null;
  }
  setVoiceStatus(statusText);
  if (!hadVoiceSession) return;
  state.playback.running = false;
  setRunStatus("音声入力を停止しました。");
}

function setVoiceStatus(text) {
  if (voiceStatus) voiceStatus.textContent = text;
  if (voiceStartBtn) voiceStartBtn.disabled = state.voice.running;
  if (voiceStopBtn) voiceStopBtn.disabled = !state.voice.running;
}

function appendLiveTranscriptLine(text) {
  const speaker = state.voice.source === "tab" ? "TAB_AUDIO" : "MIC";
  appendLine({
    type: "line",
    speaker,
    text,
    highlight_terms: [],
  });
}

// Route A: dictionary-first miss recovery. Route B: every 2s diff batch.
const EXTRACT_DIFF_BATCH_MS = 2000;
const EXTRACT_MIN_CHUNK_CHARS = 2;

function isExtractSessionActive(contextId) {
  return Boolean(state.playback.running && contextId === state.contextId && contextId > 0);
}

function applyExtractResponse(parsed, sourceTag) {
  if (!parsed) return;
  const terms = Array.isArray(parsed.terms) ? parsed.terms : [];
  if (terms.length > 0) {
    mergeExtractedTerms(terms);
    renderTermChips();
  }
  state.liveDebug.dictionary = parsed.dictionary;
  state.liveDebug.dispatcherPolicy = parsed.dispatcherPolicy;
  state.liveDebug.extractSource = parsed.source;
  state.liveDebug.dictionaryMode = parsed.dictionaryMode;
  state.liveDebug.dictionaryProfile = parsed.dictionaryProfile;
  state.liveDebug.dispatcherBypassed = parsed.dispatcherBypassed;
  const nextRoutes = buildRoutesFromExtract(terms, parsed.source);
  state.liveDebug.routes = { ...state.liveDebug.routes, ...nextRoutes };
  renderDebugCard();
  renderDictionaryDispatcherSummary();
  debugLog("api", `${sourceTag} response`, {
    source: parsed.source,
    termCount: terms.length,
  });
}

function scheduleBatchDiffExtract(contextId) {
  if (!isExtractSessionActive(contextId)) return;
  if (state.extractBatchTimer) return;

  state.extractBatchTimer = setTimeout(() => {
    state.extractBatchTimer = null;
    void runBatchDiffExtract(contextId);
  }, EXTRACT_DIFF_BATCH_MS);
}

function enqueueExtractForLine(cleanText) {
  const chunk = String(cleanText || "").trim();
  if (!chunk || chunk.length < EXTRACT_MIN_CHUNK_CHARS) return;

  const contextId = state.contextId;
  if (!isExtractSessionActive(contextId)) return;

  // Route A: run dictionary-first then AI only when dictionary misses.
  state.extractMissQueue.push(chunk);
  void drainMissQueue(contextId);

  // Route B: independent 2s batch over transcript diffs.
  state.extractBatchBuffer = state.extractBatchBuffer
    ? `${state.extractBatchBuffer}\n${chunk}`
    : chunk;
  scheduleBatchDiffExtract(contextId);
}

async function drainMissQueue(contextId) {
  if (!isExtractSessionActive(contextId)) return;
  if (state.extractMissInFlight) return;
  const chunk = String(state.extractMissQueue.shift() || "").trim();
  if (!chunk) return;

  try {
    state.extractMissInFlight = true;
    const fastPayload = { ...buildExtractRequestPayload(chunk), skipAi: true };
    const fastResponse = await postJson(`${state.apiBase}/extractTerms`, fastPayload);
    if (!isExtractSessionActive(contextId)) return;
    const fastParsed = parseExtractPayload(fastResponse);
    applyExtractResponse(fastParsed, "extractTerms miss-route dictionary");

    if (fastParsed.terms.length > 0) {
      return;
    }

    const fullResponse = await postJson(`${state.apiBase}/extractTerms`, buildExtractRequestPayload(chunk));
    if (!isExtractSessionActive(contextId)) return;
    const fullParsed = parseExtractPayload(fullResponse);
    applyExtractResponse(fullParsed, "extractTerms miss-route ai");
  } catch (error) {
    debugError("api", "extractTerms miss-route failed", { error: String(error) });
  } finally {
    state.extractMissInFlight = false;
    if (state.extractMissQueue.length > 0 && isExtractSessionActive(contextId)) {
      void drainMissQueue(contextId);
    }
  }
}

async function runBatchDiffExtract(contextId) {
  if (!isExtractSessionActive(contextId)) return;
  if (state.extractBatchInFlight) {
    scheduleBatchDiffExtract(contextId);
    return;
  }

  const chunk = String(state.extractBatchBuffer || "").trim();
  if (!chunk) return;
  state.extractBatchBuffer = "";

  try {
    state.extractBatchInFlight = true;
    const response = await postJson(`${state.apiBase}/extractTerms`, buildExtractRequestPayload(chunk));
    if (!isExtractSessionActive(contextId)) return;
    const parsed = parseExtractPayload(response);
    applyExtractResponse(parsed, "extractTerms 2s-diff-route");
    if (parsed.terms.length > 0) {
      setRunStatus(`抽出更新: ${parsed.terms.length}件`);
    }
  } catch (error) {
    // Re-queue chunk on transient failure.
    state.extractBatchBuffer = state.extractBatchBuffer
      ? `${chunk}\n${state.extractBatchBuffer}`
      : chunk;
    debugError("api", "extractTerms 2s-diff-route failed", { error: String(error) });
  } finally {
    state.extractBatchInFlight = false;
    if (state.extractBatchBuffer.trim() && isExtractSessionActive(contextId)) {
      scheduleBatchDiffExtract(contextId);
    }
  }
}

async function runScriptedLoop(token) {
  debugLog("playback", "runScriptedLoop start", { token });
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
    setRunStatus("演出デモの再生が完了しました。");
  }
}

function togglePause() {
  if (!state.playback.running) {
    debugWarn("playback", "togglePause ignored because playback not running");
    return;
  }

  state.playback.paused = !state.playback.paused;
  debugLog("playback", "togglePause", { paused: state.playback.paused });
  setButtonLabel(pauseBtn, state.playback.paused ? "再開" : "一時停止");
  setRunStatus(state.playback.paused ? "再生を一時停止しました。" : "再生を再開しました。");
}

function getCurrentMeetingTextForApi() {
  if (!state.demoData || !Array.isArray(state.demoData.events)) return "";
  const lines = state.demoData.events.filter((e) => e.type === "line");
  return lines.map((x) => `${x.speaker}: ${sanitizeLineText(x.text)}`).join("\n");
}

function parseTranscriptLines(meetingText) {
  const lines = String(meetingText || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  return lines.map((line, idx) => {
    const m = line.match(/^([^:：]{1,24})[：:]\s*(.+)$/);
    if (m) {
      return { idx: idx + 1, speaker: m[1].trim(), text: m[2].trim() };
    }
    return { idx: idx + 1, speaker: "unknown", text: line };
  });
}

function buildFocusTermsFromClicks() {
  const out = [];
  const seen = new Set();
  for (let i = state.clickLog.length - 1; i >= 0; i -= 1) {
    const row = state.clickLog[i];
    const term = String(row?.term || "").trim();
    const action = String(row?.action || "").trim();
    if (!term || seen.has(term)) continue;
    if (action !== "unknown" && action !== "interest") continue;
    seen.add(term);
    out.push({ term, action });
  }
  return out.reverse();
}

function buildMeetingPackage() {
  const meetingText = String(state.liveMeetingText || "").trim();
  const transcript = parseTranscriptLines(meetingText);
  const focusTerms = buildFocusTermsFromClicks();
  return {
    meetingMeta: {
      mode: state.voice.running ? "voice" : "sample",
      sampleId: state.demoData?.id || "",
      generatedAt: new Date().toISOString(),
      processedLines: state.processedLines || transcript.length,
    },
    transcript,
    focusTerms,
    extractedTerms: unique(state.terms.map((x) => String(x || "").trim()).filter(Boolean)),
  };
}

async function probeDispatcherForDebugCard() {
  if (!debug.enabled) return;

  const text = state.liveMeetingText || getCurrentMeetingTextForApi();

  if (!text) {
    setRunStatus("ディスパッチャ検証中断: 会議テキストがありません。");
    return;
  }

  setRunStatus(`ディスパッチャ検証: extractTermsを呼び出し中 (${state.apiBase}) ...`);
  debugLog("api", "debug probe start", { mode: "demo_live_unified", textLength: text.length });

  try {
    const response = await postJson(`${state.apiBase}/extractTerms`, buildExtractRequestPayload(text));
    const parsed = parseExtractPayload(response);

    state.liveDebug.dictionary = parsed.dictionary;
    state.liveDebug.dispatcherPolicy = parsed.dispatcherPolicy;
    state.liveDebug.extractSource = parsed.source;
    state.liveDebug.dictionaryMode = parsed.dictionaryMode;
    state.liveDebug.dictionaryProfile = parsed.dictionaryProfile;
    state.liveDebug.dispatcherBypassed = parsed.dispatcherBypassed;
    state.liveDebug.routes = buildRoutesFromExtract(parsed.terms, parsed.source);

    if (parsed.terms.length > 0) {
      mergeExtractedTerms(parsed.terms);
      renderTermChips();
    }

    renderDebugCard();
    setRunStatus(`ディスパッチャ検証完了: source=${parsed.source}, terms=${parsed.terms.length}`);
    debugLog("api", "debug probe success", { source: parsed.source, termCount: parsed.terms.length });
  } catch (error) {
    debugError("api", "debug probe failed", { error: String(error) });
    setRunStatus(`ディスパッチャ検証失敗: ${String(error)}`);
  }
}

function handleEvent(event) {
  if (event.type === "line") {
    appendLine(event);
    return;
  }

  if (event.type === "term_chip") {
    // Unified mode: term chips are controlled only by /extractTerms API.
    // scripted term_chip events are kept only for visual stream highlighting.
    return;
  }
}

function appendLine(event) {
  streamList.classList.remove("is-empty");
  const cleanText = sanitizeLineText(event.text);
  const line = document.createElement("article");
  line.className = "stream-line";

  const speaker = document.createElement("p");
  speaker.className = "stream-speaker";
  speaker.textContent = event.speaker;

  const text = document.createElement("p");
  text.className = "stream-text";
  text.dataset.rawText = cleanText;
  text.innerHTML = highlightText(cleanText, state.terms);

  line.append(speaker, text);
  streamList.append(line);
  streamList.scrollTop = streamList.scrollHeight;

  state.liveMeetingText = state.liveMeetingText ? `${state.liveMeetingText}\n${cleanText}` : cleanText;

  state.processedLines += 1;
  if (minutesBtn) minutesBtn.disabled = state.processedLines <= 0;
  updateStreamMeta(state.processedLines, state.totalLines || state.processedLines);
  upsertSynchronousTermsFromLine(event);
  refreshStreamHighlights();
  enqueueExtractForLine(cleanText);
}

function refreshStreamHighlights() {
  const nodes = streamList.querySelectorAll(".stream-text");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const raw = node.dataset.rawText || "";
    if (!raw) continue;
    node.innerHTML = highlightText(raw, state.terms);
  }
}

function upsertSynchronousTermsFromLine(event) {
  const immediateTerms = Array.isArray(event?.highlight_terms)
    ? event.highlight_terms.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];

  if (immediateTerms.length === 0) return;
  let addedNew = false;
  let movedByRecency = false;
  for (const term of immediateTerms) {
    const resolvedLabel = resolveDisplayTermLabel(term, null);
    const existing = findMergeTargetTerm(resolvedLabel, null);
    const targetLabel = existing || resolvedLabel;
    if (!existing) {
      state.terms.unshift(targetLabel);
      addedNew = true;
    }
    const nextDetectId = computeDetectIdFromMeetingText(targetLabel, null);
    if (!state.termMeta[targetLabel]) {
      state.termMeta[targetLabel] = {
        term: targetLabel,
        summary: `${term} が会議中に検出されました。`,
        source: "stream_sync_loading",
        detectId: nextDetectId,
      };
    } else {
      const prevDetectId = Number(state.termMeta[targetLabel]?.detectId || 0);
      if (nextDetectId > prevDetectId) {
        state.termMeta[targetLabel] = {
          ...state.termMeta[targetLabel],
          detectId: nextDetectId,
        };
        movedByRecency = true;
      }
    }
    scheduleUnknownExplainPrefetch(targetLabel, state.termMeta[targetLabel]);
  }
  if (addedNew || movedByRecency) {
    reorderTermsByRecentContext();
  }
  renderTermChips();
}

function upsertTermChip(term) {
  const existing = state.terms.includes(term);
  if (!existing) {
    state.terms.unshift(term);
  }
  if (!state.termMeta[term]) {
    state.termMeta[term] = {
      term,
      summary: "演出デモ上の抽出候補",
      reasons: ["scripted"],
      detectId: computeDetectIdFromMeetingText(term, null),
    };
  }
  if (!state.liveDebug.routes[term]) {
    state.liveDebug.routes[term] = {
      extract: {
        source: "scripted_stream",
        matchedText: term,
        score: null,
        reason: null,
        reasons: ["scripted_stream"],
        hits: null,
        category: null,
        file: null,
        layer: null,
      },
      explain: null,
    };
  }
  renderTermChips();
  renderDebugCard();
}

function shouldPreferDictionaryOnlyForTerm(term) {
  const route = state.liveDebug?.routes?.[term]?.extract;
  if (!route) return false;
  if (route.source === "scripted_stream") return false;
  if (route.layer === "fixed" || route.layer === "project_local") return true;
  if (typeof route.file === "string" && route.file.trim().length > 0) return true;
  if (route.reason === "term" || route.reason === "alias" || route.reason === "uppercase") return true;
  return false;
}

function renderTermChips() {
  termChips.innerHTML = "";

  for (const term of state.terms) {
    const chip = document.createElement("button");
    const meta = state.termMeta?.[term] || {};
    const isLoading = Boolean(state.explainPrefetchInFlight?.[term]);
    const isPersonal = Boolean(findPersonalDictionaryEntry(term));
    chip.className = `term-chip${state.activeTerm === term ? " active" : ""}${isLoading ? " loading" : ""}${isPersonal ? " personal" : ""}`;
    chip.textContent = term;
    chip.title = getTermHelpMessage(term);
    chip.disabled = isLoading;
    chip.setAttribute("aria-busy", isLoading ? "true" : "false");
    chip.addEventListener("click", () => {
      if (isLoading) return;
      state.activeTerm = term;
      renderTermChips();
      void renderTermDetail();
    });
    termChips.append(chip);
  }
}

function mergeExtractedTerms(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  let addedNew = false;
  let movedByRecency = false;

  for (const row of rows) {
    if (!row || typeof row.term !== "string") continue;
    const term = sanitizeTermLabel(row.term);
    if (!term) continue;

    const resolvedLabel = resolveDisplayTermLabel(term, row);
    const existing = findMergeTargetTerm(resolvedLabel, row);
    const targetLabel = existing || resolvedLabel;
    if (!existing) {
      state.terms.unshift(targetLabel);
      addedNew = true;
    }
    const prev = state.termMeta[targetLabel] || {};
    const prevDetectId = Number(prev.detectId || 0);
    const nextDetectId = computeDetectIdFromMeetingText(targetLabel, row);
    const detectId = prevDetectId > 0 ? Math.max(prevDetectId, nextDetectId) : nextDetectId;
    if (existing && detectId > prevDetectId) {
      movedByRecency = true;
    }
    state.termMeta[targetLabel] = { ...prev, ...row, term: targetLabel, detectId };
    if (existing && existing !== resolvedLabel && state.termMeta[resolvedLabel]) {
      delete state.termMeta[resolvedLabel];
    }
    scheduleUnknownExplainPrefetch(targetLabel, row);
  }
  // 新規語追加 or 既存語の最新言及更新時にのみ並びを更新する。
  if (addedNew || movedByRecency) {
    reorderTermsByRecentContext();
  }
  refreshStreamHighlights();
}

function canonicalTermKey(term) {
  return sanitizeTermLabel(term).toLowerCase();
}

function sanitizeTermLabel(term) {
  return String(term || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;[^&]*&gt;/g, " ")
    .replace(/[<>"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTermSearchCandidates(term, row) {
  const out = [];
  const base = sanitizeTermLabel(term);
  if (base) out.push(base);

  const compact = base.replace(/\s*\([^)]*\)\s*/g, "").trim();
  if (compact && compact !== base) out.push(compact);

  const matchedText =
    typeof row?.dispatcher?.matchedText === "string"
      ? sanitizeTermLabel(row.dispatcher.matchedText)
      : "";
  if (matchedText) out.push(matchedText);

  const reasons = Array.isArray(row?.reasons) ? row.reasons : [];
  for (const r of reasons) {
    if (typeof r !== "string") continue;
    if (!r.startsWith("matched:")) continue;
    const value = sanitizeTermLabel(r.slice("matched:".length));
    if (value) out.push(value);
  }

  return [...new Set(out)];
}

function findLatestTermOffsetInText(text, candidates) {
  const body = String(text || "");
  if (!body || !Array.isArray(candidates) || candidates.length === 0) return -1;

  const lower = body.toLowerCase();
  let best = -1;

  for (const raw of candidates) {
    const term = sanitizeTermLabel(raw);
    if (!term) continue;

    if (/^[A-Za-z0-9/+._#-]+$/.test(term)) {
      const escaped = escapeRegExp(term);
      const regex = new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=[^A-Za-z0-9]|$)`, "gi");
      let m;
      while ((m = regex.exec(body)) !== null) {
        const idx = (m.index ?? 0) + String(m[1] || "").length;
        if (idx > best) best = idx;
        if (regex.lastIndex === m.index) regex.lastIndex += 1;
      }
      continue;
    }

    const needle = term.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      if (idx > best) best = idx;
      from = idx + Math.max(1, needle.length);
    }
  }

  return best;
}

function computeDetectIdFromMeetingText(term, row) {
  const candidates = buildTermSearchCandidates(term, row);
  const latestOffset = findLatestTermOffsetInText(state.liveMeetingText, candidates);
  if (latestOffset >= 0) {
    // 最新出現位置を優先。API返却順ではなく会議本文で安定させる。
    return latestOffset + 1;
  }
  // 文中ヒットが取れないケースだけ連番フォールバック。
  return ++state.termSeenSeq;
}

function inferPocSense(row) {
  const merged = [
    row?.summary ?? "",
    ...(Array.isArray(row?.reasons) ? row.reasons : []),
    row?.category ?? "",
    state.liveMeetingText ?? ""
  ]
    .join(" ")
    .toLowerCase();

  const conceptWords = ["concept", "実証", "検証", "プロト", "mvp", "pilot", "設計", "開発", "導入"];
  const medicalWords = ["point of care", "患者", "診療", "病棟", "看護", "臨床", "検体", "ベッドサイド", "医療"];

  const conceptScore = conceptWords.reduce((n, w) => n + (merged.includes(w) ? 1 : 0), 0);
  const medicalScore = medicalWords.reduce((n, w) => n + (merged.includes(w) ? 1 : 0), 0);

  if (conceptScore === medicalScore) return "ambiguous";
  return conceptScore > medicalScore ? "concept" : "medical";
}

function resolveDisplayTermLabel(term, row) {
  const cleaned = sanitizeTermLabel(term);
  const key = canonicalTermKey(cleaned);
  if (key !== "poc") return cleaned;
  const sense = inferPocSense(row);
  if (sense === "concept") return "PoC (概念実証)";
  if (sense === "medical") return "POC (Point of Care)";
  return "PoC / POC";
}

function findMergeTargetTerm(nextTerm, row) {
  const nextKey = canonicalTermKey(nextTerm);
  const nextIsPoc = nextKey.startsWith("poc");

  for (const existing of state.terms) {
    const existingKey = canonicalTermKey(existing);
    const existingIsPoc = existingKey.startsWith("poc");

    // 通常語は大文字小文字違いを統合
    if (!nextIsPoc && !existingIsPoc && existingKey === nextKey) {
      return existing;
    }

    // PoC系は意味が同じ時だけ統合
    if (nextIsPoc && existingIsPoc && existingKey === nextKey) {
      return existing;
    }
  }
  return null;
}

function reorderTermsByRecentContext() {
  if (!Array.isArray(state.terms) || state.terms.length <= 1) return;

  const scored = state.terms.map((term, idx) => {
    const detectId = Number(state.termMeta?.[term]?.detectId || 0);
    return { term, detectId, idx };
  });

  scored.sort((a, b) => {
    // 会議本文での出現位置（detectId）新しい順で統一。
    if (a.detectId !== b.detectId) return b.detectId - a.detectId;
    // 同率時のみ既存順維持。
    return a.idx - b.idx;
  });

  state.terms = scored.map((x) => x.term);
}

function getTermHelpMessage(term) {
  const aliasNote = (() => {
    const meta = state.termMeta?.[term];
    const matched = typeof meta?.dispatcher?.matchedText === "string" ? meta.dispatcher.matchedText.trim() : "";
    if (!matched) return "";
    const display = sanitizeTermLabel(term);
    const displayCompact = display.replace(/\s*\([^)]*\)\s*/g, "").trim();
    const a = matched.toLowerCase();
    const b = display.toLowerCase();
    const c = displayCompact.toLowerCase();
    // 表示語と一致する場合は名寄せ扱いにしない。
    if (a === b || (c && a === c)) return "";
    return `元用語: ${matched}`;
  })();

  const detail = state.liveDetails?.[term];
  if (detail?.hoverTip && String(detail.hoverTip).trim()) {
    const base = String(detail.hoverTip).trim();
    return aliasNote ? `${base} | ${aliasNote}` : base;
  }
  const meta = state.termMeta?.[term];
  if (meta) {
    const summary = meta.summary && String(meta.summary).trim() ? String(meta.summary).trim() : "";
    const source = String(meta.source || "");
    if (source === "stream_sync_loading") {
      const base = `${term} の説明は未取得です。クリックして詳細を表示できます。`;
      return aliasNote ? `${base} | ${aliasNote}` : base;
    }
    if (!debug.enabled) {
      const base = summary || `${term} の説明を表示します。`;
      return aliasNote ? `${base} | ${aliasNote}` : base;
    }
    const parts = [];
    if (summary) parts.push(summary);
    if (meta.origin) parts.push(`origin=${meta.origin}`);
    if (meta.source) parts.push(`source=${meta.source}`);
    if (meta.profile) parts.push(`profile=${meta.profile}`);
    if (typeof meta.confidence === "number") parts.push(`confidence=${meta.confidence}`);
    if (aliasNote) parts.push(aliasNote);
    if (parts.length > 0) return parts.join(" | ");
  }

  const route = state.liveDebug?.routes?.[term]?.extract;
  if (route?.category) {
    return `${term} は「${route.category}」カテゴリの候補です。`;
  }

  const fallback = `${term} の説明を表示します。`;
  return aliasNote ? `${fallback} | ${aliasNote}` : fallback;
}

function normalizeExplainResponse(term, response) {
  const hoverTipRaw = typeof response?.hoverTip === "string" ? response.hoverTip.trim() : "";
  const explain140Raw = typeof response?.explain140 === "string" ? response.explain140.trim() : "";
  const context180Raw = typeof response?.context180 === "string" ? response.context180.trim() : "";
  const rawDetail = typeof response?.detail === "string" ? response.detail.trim() : "";
  let rawBrief = typeof response?.brief === "string" ? response.brief.trim() : "";
  let rawContextHint = typeof response?.contextHint === "string" ? response.contextHint.trim() : "";
  let rawUnknownDetail = typeof response?.unknownDetail === "string" ? response.unknownDetail.trim() : "";
  let rawSmallTalkExamples = Array.isArray(response?.smallTalkExamples)
    ? response.smallTalkExamples.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 3)
    : [];

  // Guard: if rawBrief or rawUnknownDetail themselves contain JSON (e.g. truncated response
  // caused parse failure upstream and the raw AI output leaked through), rescue the fields.
  const looksLikeJson = (s) => s.startsWith("{") || s.includes('"brief"') || s.includes('"contextHint"');
  if (rawBrief && looksLikeJson(rawBrief)) {
    try {
      const start = rawBrief.indexOf("{");
      const end = rawBrief.lastIndexOf("}");
      const candidate = end > start ? rawBrief.slice(start, end + 1) : rawBrief;
      const p = JSON.parse(candidate);
      if (p && typeof p === "object") {
        if (typeof p.brief === "string" && p.brief.trim()) rawBrief = p.brief.trim();
        if (typeof p.contextHint === "string" && p.contextHint.trim()) rawContextHint = rawContextHint || p.contextHint.trim();
        if (typeof p.unknownDetail === "string" && p.unknownDetail.trim()) rawUnknownDetail = rawUnknownDetail || p.unknownDetail.trim();
      }
    } catch {
      // rawBrief is not valid JSON; clear it so the detail-fallback path runs
      rawBrief = "";
    }
  }
  if (rawUnknownDetail && looksLikeJson(rawUnknownDetail)) {
    try {
      const start = rawUnknownDetail.indexOf("{");
      const end = rawUnknownDetail.lastIndexOf("}");
      const candidate = end > start ? rawUnknownDetail.slice(start, end + 1) : rawUnknownDetail;
      const p = JSON.parse(candidate);
      if (p && typeof p === "object") {
        if (!rawBrief && typeof p.brief === "string" && p.brief.trim()) rawBrief = p.brief.trim();
        if (!rawContextHint && typeof p.contextHint === "string" && p.contextHint.trim()) rawContextHint = p.contextHint.trim();
        if (typeof p.unknownDetail === "string" && p.unknownDetail.trim()) rawUnknownDetail = p.unknownDetail.trim();
        else rawUnknownDetail = "";
      }
    } catch {
      rawUnknownDetail = "";
    }
  }

  // Some providers return JSON text (or JSON fragment) inside `detail`.
  if (!rawBrief && rawDetail.includes("{") && rawDetail.includes("}")) {
    const unescapeJsonText = (s) =>
      String(s || "")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\")
        .trim();

    const extractJsonLikeField = (src, key) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`"${escapedKey}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|\\s*}\\s*$)`, "i");
      const m = src.match(re);
      return m?.[1] ? unescapeJsonText(m[1]) : "";
    };

    const tryParse = (text) => {
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") return false;
        if (typeof parsed.brief === "string" && parsed.brief.trim()) {
          rawBrief = parsed.brief.trim();
        }
        if (typeof parsed.contextHint === "string" && parsed.contextHint.trim()) {
          rawContextHint = parsed.contextHint.trim();
        }
        if (typeof parsed.unknownDetail === "string" && parsed.unknownDetail.trim()) {
          rawUnknownDetail = parsed.unknownDetail.trim();
        }
        return Boolean(rawBrief || rawContextHint || rawUnknownDetail);
      } catch {
        return false;
      }
    };

    // 1) raw as-is
    let parsedOk = tryParse(rawDetail);

    // 2) strip code fence
    if (!parsedOk) {
      const fence = rawDetail.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence?.[1]) {
        parsedOk = tryParse(fence[1].trim());
      }
    }

    // 3) extract first JSON-object-like segment
    if (!parsedOk) {
      const start = rawDetail.indexOf("{");
      const end = rawDetail.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsedOk = tryParse(rawDetail.slice(start, end + 1).trim());
      }
    }

    // 4) regex fallback for malformed JSON-ish response
    if (!parsedOk) {
      rawBrief = extractJsonLikeField(rawDetail, "brief") || rawBrief;
      rawContextHint = extractJsonLikeField(rawDetail, "contextHint") || rawContextHint;
      rawUnknownDetail = extractJsonLikeField(rawDetail, "unknownDetail") || rawUnknownDetail;

      // 5) extra rescue: key order based split when malformed quotes break regex
      if (!rawBrief && rawDetail.includes('"brief"')) {
        const start = rawDetail.indexOf('"brief"');
        const next = rawDetail.indexOf('"contextHint"', start + 1);
        if (start >= 0 && next > start) {
          const chunk = rawDetail.slice(start, next);
          const q1 = chunk.indexOf(":", 0);
          if (q1 >= 0) {
            const v = chunk.slice(q1 + 1).replace(/^[\s"]+/, "").replace(/[\s",]+$/, "");
            rawBrief = unescapeJsonText(v);
          }
        }
      }
      if (!rawContextHint && rawDetail.includes('"contextHint"')) {
        const start = rawDetail.indexOf('"contextHint"');
        const next = rawDetail.indexOf('"unknownDetail"', start + 1);
        if (start >= 0 && next > start) {
          const chunk = rawDetail.slice(start, next);
          const q1 = chunk.indexOf(":", 0);
          if (q1 >= 0) {
            const v = chunk.slice(q1 + 1).replace(/^[\s"]+/, "").replace(/[\s",]+$/, "");
            rawContextHint = unescapeJsonText(v);
          }
        }
      }
    }
  }

  let brief = explain140Raw || rawBrief;
  let contextHint = context180Raw || rawContextHint;

  if (!brief && rawDetail) {
    const parts = rawDetail.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    brief = parts[0] ?? "";
    contextHint = contextHint || parts[1] || "";
  }

  if (!brief) {
    brief = `「${term}」の説明を取得しました。`;
  }

  if (!contextHint) {
    contextHint = `この会議では「${term}」が重要語として扱われています。`;
  }

  const unknownDetail =
    rawUnknownDetail ||
    `${brief}\n\n${
      contextHint ||
      `この会議では「${term}」の前提を短く共有しておくと、議論の行き違いを防ぎやすくなります。`
    }`;
  const smallTalkExamples =
    rawSmallTalkExamples.length > 0
      ? rawSmallTalkExamples
      : buildFallbackSmallTalkExamplesFromContext(term, context180Raw || contextHint || unknownDetail);

  return {
    hoverTip: hoverTipRaw || brief,
    explain140: explain140Raw || brief,
    context180: context180Raw || contextHint,
    brief,
    contextHint,
    unknownDetail,
    smallTalkExamples,
    source: String(response?.source ?? "-"),
  };
}

function sanitizeExplainHtml(raw) {
  const src = String(raw ?? "");
  if (!src) return "";
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>")
    .replace(/&lt;u&gt;/gi, "<u>")
    .replace(/&lt;\/u&gt;/gi, "</u>")
    .replace(/\r?\n/g, "<br>");
}

function buildFallbackSmallTalkExamplesFromContext(term, contextText) {
  const t = String(term || "").trim();
  const c = String(contextText || "").trim();
  if (!t && !c) return [];
  const short = c.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const clipped = short.length > 70 ? `${short.slice(0, 70)}...` : short;
  return [
    `${t}って、いまの話だと「${clipped || `${t}の前提合わせ`}」って理解で合ってますか？`,
    `${t}の基準だけ先にそろえてから進める、でよさそうですか？`,
  ];
}

function getMeetingContextForExplain() {
  return state.liveMeetingText || getCurrentMeetingTextForApi();
}

async function fetchExplainForTerm(term, forceRefresh = false, options = {}) {
  if (!term) {
    return null;
  }
  const contextId = options?.contextId ?? state.contextId;
  const preferDictionaryOnly = options?.preferDictionaryOnly === true;
  const forceContextualAi = options?.forceContextualAi === true;
  const strictAi = options?.strictAi === true;

  const cached = state.liveDetails?.[term];
  if (cached && !forceRefresh) {
    return cached;
  }

  const response = await postJson(`${state.apiBase}/explainTerm`, {
    term,
    context: getMeetingContextForExplain(),
    meetingDomain: resolveMeetingDomain(),
    preferDictionaryOnly,
    forceContextualAi,
    strictAi,
    includeDebug: Boolean(debug.enabled),
  });
  if (contextId !== state.contextId) {
    debugLog("api", "explainTerm ignored due to stale context", { contextId, current: state.contextId, term });
    return null;
  }
  const normalized = normalizeExplainResponse(term, response);
  state.liveDetails[term] = normalized;
  attachExplainRoute(term, response);
  renderDebugCard();
  return normalized;
}

async function runUnknownAssist() {
  const term = state.activeTerm;
  if (!term) return;
  const contextId = state.contextId;

  state.expandedUnknownByTerm[term] = true;
  setUnknownExplainVisible(true, "補足説明を生成しています...");
  renderSmallTalkExamples(["知ったか発言例を生成しています..."]);
  setRunStatus(`補足説明を生成中: ${term}`);

  try {
    const normalized = await fetchExplainForTerm(term, true, {
      preferDictionaryOnly: false,
      forceContextualAi: true,
      strictAi: false,
      contextId,
    });
    if (!normalized) return;
    if (contextId !== state.contextId) return;

    if (state.activeTerm === term) {
      explainSource.textContent = normalized.source;
      renderUnknownExplainForActiveTerm();
    }

    debugLog("api", "unknown assist generated", {
      term,
      source: normalized.source,
      preview: shortText(normalized.unknownDetail, 140),
    });
    setRunStatus(`補足説明を生成しました: ${term}`);
  } catch (error) {
    const message = String(error || "");
    if (message.includes("STRICT_AI_UNAVAILABLE")) {
      debugWarn("api", "unknown assist strict mode unavailable; retrying with fallback mode", { term, error: message });
      try {
        const fallbackNormalized = await fetchExplainForTerm(term, true, {
          preferDictionaryOnly: false,
          forceContextualAi: true,
          strictAi: false,
          contextId,
        });
        if (!fallbackNormalized) return;
        if (contextId !== state.contextId) return;
        if (state.activeTerm === term) {
          explainSource.textContent = fallbackNormalized.source;
          renderUnknownExplainForActiveTerm();
        }
        setRunStatus(`補足説明を生成しました(フォールバック): ${term}`);
        return;
      } catch (fallbackError) {
        debugError("api", "unknown assist fallback retry failed", { term, error: String(fallbackError) });
      }
    }

    debugError("api", "unknown assist failed", { term, error: message });
    setUnknownExplainVisible(true, "補足説明のAI生成に失敗しました。もう一度お試しください。");
    renderSmallTalkExamples([]);
    setRunStatus(`補足説明のAI生成に失敗: ${message}`);
  }
}


function buildContextEstimateText(term) {
  const text = getMeetingContextForExplain();
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const hit = lines.find((line) => line.toLowerCase().includes(String(term).toLowerCase()));
  if (hit) {
    return `文脈推定\n\n${term} は会議中で次の発言に関連して使われています: ${hit}\n\nこの用語の定義を先に合わせると、議論の取りこぼしを減らせます。`;
  }
  return `文脈推定\n\n${term} はこの会議で重要語として扱われています。まず短い定義を共有すると、会議中の認識ズレを減らせます。`;
}

function setUnknownExplainVisible(visible, text = "") {
  if (!unknownExplainCard || !unknownExplainText || !unknownAiSummaryText) return;
  if (visible) {
    unknownExplainText.innerHTML = sanitizeExplainHtml(text || "補足説明はまだありません。");
    return;
  }
  unknownAiSummaryText.textContent = "知らないボタンを押下するとAIが要約した説明が表示されます。";
  unknownExplainText.textContent = "知らないボタンを押下するとAIが要約した説明が表示されます。";
}

function renderSmallTalkExamples(examples = []) {
  renderSmallTalkExamplesCore(smallTalkList, examples);
  renderSmallTalkExamplesCore(smallTalkListInline, examples);
}

function renderUnknownExplainForActiveTerm() {
  const term = state.activeTerm;
  if (!term) {
    setUnknownExplainVisible(false);
    renderSmallTalkExamples([]);
    return;
  }

  if (!state.expandedUnknownByTerm[term]) {
    setUnknownExplainVisible(false);
    renderSmallTalkExamples([]);
    return;
  }

  const detail = state.liveDetails?.[term]?.unknownDetail;
  const summary = state.liveDetails?.[term]?.explain140 || state.liveDetails?.[term]?.brief;
  if (detail && String(detail).trim()) {
    if (unknownAiSummaryText) {
      unknownAiSummaryText.innerHTML = sanitizeExplainHtml(summary && String(summary).trim() ? String(summary).trim() : "要約はまだありません。");
    }
    setUnknownExplainVisible(true, String(detail).trim());
    renderSmallTalkExamples(state.liveDetails?.[term]?.smallTalkExamples || []);
    return;
  }

  const seedSummary = state.termMeta?.[term]?.summary || `${term} は会議内で重要語として扱われています。`;
  const hint = state.liveDetails?.[term]?.contextHint || `この会議では「${term}」の意味合わせが論点です。`;
  const fallback = `${seedSummary}\n\n${hint}`;
  if (unknownAiSummaryText) {
    unknownAiSummaryText.innerHTML = sanitizeExplainHtml(summary && String(summary).trim() ? String(summary).trim() : "要約はまだありません。");
  }
  setUnknownExplainVisible(true, fallback);
  renderSmallTalkExamples(state.liveDetails?.[term]?.smallTalkExamples || []);
}

function findPersonalDictionaryEntry(term) {
  const key = String(term || "").trim();
  if (!key) return null;
  const exact = state.personalDictionary?.[key];
  if (exact && typeof exact === "object") return exact;
  const lower = key.toLowerCase();
  for (const row of Object.values(state.personalDictionary || {})) {
    if (!row || typeof row !== "object") continue;
    const t = String(row.term || "").trim();
    if (!t) continue;
    if (t.toLowerCase() === lower) return row;
  }
  return null;
}

function isPersonalDominantForTerm(term) {
  const key = String(term || "").trim();
  if (!key) return false;
  const meta = state.termMeta?.[key] || {};
  const source = String(meta.source || "").toLowerCase();
  const origin = String(meta.origin || "").toLowerCase();
  const routeSource = String(state.liveDebug?.routes?.[key]?.extract?.source || "").toLowerCase();
  return source === "personal_dictionary" || origin === "personal_dictionary" || routeSource === "personal_dictionary";
}

function renderPersonalMemo(term) {
  if (!personalMemoText) return false;
  if (personalMemoTitle) personalMemoTitle.classList.remove("hidden");
  personalMemoText.classList.remove("hidden");
  const row = findPersonalDictionaryEntry(term);
  if (!row) {
    personalMemoText.textContent = "自分辞書のメモがあればここに表示されます。";
    return false;
  }
  const memo = String(row.memo || "").trim();
  personalMemoText.textContent = memo || "（自分メモ未入力）";
  return true;
}

function scheduleUnknownExplainPrefetch(term, row) {
  if (!term || !row) return;
  if (isPersonalDominantForTerm(term) && findPersonalDictionaryEntry(term)) return;
  const source = String(row.source || "").toLowerCase();
  const origin = String(row.origin || "").toLowerCase();
  const isDictionaryBacked =
    source === "personal_dictionary" ||
    source === "fixed_dictionary" ||
    source === "dictionary_dispatcher" ||
    origin === "personal_dictionary" ||
    origin === "fixed_dictionary" ||
    origin === "dictionary_dispatcher";
  if (isDictionaryBacked) return;
  const isAiUnknown =
    origin === "ai" ||
    source === "ai" ||
    source.includes("openai") ||
    source.includes("gemini");
  if (!isAiUnknown) return;
  if (state.liveDetails?.[term]) return;
  if (state.explainPrefetchInFlight?.[term]) return;
  state.explainPrefetchInFlight[term] = true;
  const contextId = state.contextId;
  void fetchExplainForTerm(term, true, {
    preferDictionaryOnly: false,
    forceContextualAi: true,
    strictAi: false,
    contextId,
  })
    .catch(() => {})
    .finally(() => {
      delete state.explainPrefetchInFlight[term];
      renderTermChips();
    });
}

async function renderTermDetail() {
  if (!state.activeTerm || !state.demoData) {
    termTitle.textContent = "用語未選択";
    termDetail.textContent = "用語チップを押すと説明を表示します。";
    if (termBox2Text) termBox2Text.textContent = "用語を選択すると、会議文脈の説明を表示します。";
    if (personalMemoTitle) personalMemoTitle.classList.remove("hidden");
    if (personalMemoText) {
      personalMemoText.classList.remove("hidden");
      personalMemoText.textContent = "自分辞書のメモがあればここに表示されます。";
    }
    if (termContextHint) {
      termContextHint.textContent = "";
    }
    explainSource.textContent = "-";
    unknownBtn.disabled = true;
    interestBtn.disabled = true;
    setUnknownExplainVisible(false);
    renderSmallTalkExamples([]);
    return;
  }

  termTitle.textContent = state.activeTerm;
  unknownBtn.disabled = false;
  interestBtn.disabled = false;
  const hasPersonalMemo = renderPersonalMemo(state.activeTerm);

  const personalEntry = findPersonalDictionaryEntry(state.activeTerm);
  if (personalEntry && hasPersonalMemo && isPersonalDominantForTerm(state.activeTerm)) {
    const ownSummary = String(personalEntry.summary || "").trim();
    if (ownSummary) {
      termDetail.innerHTML = sanitizeExplainHtml(ownSummary);
      if (termBox2Text) termBox2Text.textContent = "";
      if (termContextHint) {
        termContextHint.innerHTML = "";
      }
      explainSource.textContent = "personal_dictionary";
      renderUnknownExplainForActiveTerm();
      return;
    }
  }

  debugLog("api", "renderTermDetail unified mode", { term: state.activeTerm });
  const cached = state.liveDetails[state.activeTerm];
  if (cached) {
    debugLog("api", "renderTermDetail cache hit", { term: state.activeTerm });
    termDetail.innerHTML = sanitizeExplainHtml(cached.explain140 || cached.brief);
    if (termBox2Text) {
      termBox2Text.innerHTML = sanitizeExplainHtml(cached.context180 || cached.unknownDetail || cached.contextHint || "");
    }
    if (termContextHint) {
      termContextHint.innerHTML = "";
    }
    explainSource.textContent = cached.source;
    renderUnknownExplainForActiveTerm();
    return;
  }

  termDetail.textContent = "説明を取得しています...";
  if (termBox2Text) termBox2Text.textContent = "会議文脈を取得しています...";
  if (termContextHint) {
    termContextHint.innerHTML = "";
  }
  explainSource.textContent = "loading";
  setUnknownExplainVisible(false);

  try {
    const preferDictionaryOnly = shouldPreferDictionaryOnlyForTerm(state.activeTerm);
    const normalized = await fetchExplainForTerm(state.activeTerm, false, {
      preferDictionaryOnly,
      contextId: state.contextId,
    });
    if (!normalized) {
      throw new Error("説明レスポンスが空です。");
    }
    debugLog("api", "explainTerm response", {
      term: state.activeTerm,
      source: normalized.source,
      detailPreview: shortText(normalized.brief, 140),
    });
    termDetail.innerHTML = sanitizeExplainHtml(normalized.explain140 || normalized.brief);
    if (termBox2Text) {
      termBox2Text.innerHTML = sanitizeExplainHtml(normalized.context180 || normalized.unknownDetail || normalized.contextHint || "");
    }
    if (termContextHint) {
      termContextHint.innerHTML = "";
    }
    explainSource.textContent = normalized.source;
    renderUnknownExplainForActiveTerm();
    setRunStatus(`説明取得成功: source=${normalized.source}`);
  } catch (error) {
    debugError("api", "explainTerm failed", { term: state.activeTerm, error: String(error) });
    termDetail.textContent = `説明取得エラー: ${String(error)}`;
    if (termBox2Text) termBox2Text.textContent = "会議文脈の取得に失敗しました。";
    if (termContextHint) {
      termContextHint.innerHTML = "";
    }
    explainSource.textContent = "error";
    setUnknownExplainVisible(false);
    setRunStatus(`説明取得失敗: ${String(error)}`);
  }
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

  state.clickLog.push({
    id: ++state.clickSeq,
    term,
    action,
    at: new Date().toISOString(),
    sampleId: state.demoData?.id ?? ""
  });
  if (action === "unknown") {
    state.expandedUnknownByTerm[term] = true;
    renderUnknownExplainForActiveTerm();
  }
  debugLog("ui", "action recorded", {
    term,
    action,
    clickCount: state.clickLog.length,
    profile: state.profile[term],
  });
  renderProfileSummary();
  renderClickList();
}

function recomputeProfileFromClickLog() {
  const next = {};
  for (const item of state.clickLog) {
    const term = item.term;
    if (!term) continue;
    const row = next[term] || { unknown: 0, interest: 0, lastSeen: "", samples: [] };
    if (item.action === "unknown" || item.action === "interest") {
      row[item.action] += 1;
    }
    row.lastSeen = item.at || row.lastSeen;
    if (item.sampleId && !row.samples.includes(item.sampleId)) {
      row.samples.push(item.sampleId);
    }
    next[term] = row;
  }
  state.profile = next;
  saveProfile(state.profile);
}

function removeClickSignal(clickId) {
  const before = state.clickLog.length;
  state.clickLog = state.clickLog.filter((x) => x.id !== clickId);
  if (state.clickLog.length === before) return;
  recomputeProfileFromClickLog();
  renderProfileSummary();
  renderClickList();
  setRunStatus("ローカル学習シグナルを1件削除しました。");
}

function renderProfileSummary() {
  if (!profileSummary) return;
  if (state.clickLog.length === 0) {
    profileSummary.classList.remove("signal-chips");
    profileSummary.innerHTML = "クリック履歴はまだありません。";
    return;
  }

  profileSummary.classList.add("signal-chips");
  const recent = [...state.clickLog].slice(-60);
  const html = recent
    .map((item) => {
      const cls = item.action === "unknown" ? "unknown" : "interest";
      const label = escapeHtml(item.term);
      const clickId = Number.isFinite(item.id) ? String(item.id) : "";
      return `<span class="signal-chip ${cls}" title="${item.action === "unknown" ? "知らない" : "気になる"}">${label}<button class="signal-chip-remove" type="button" data-click-id="${clickId}" aria-label="このシグナルを削除">×</button></span>`;
    })
    .join("");
  profileSummary.innerHTML = html;
}

function renderClickList() {
  if (clickList) {
    clickList.innerHTML = "";
    clickList.classList.add("hidden");
  }
}

function getCurrentLearningWordCandidates() {
  const seen = new Set();
  const out = [];
  for (let i = state.clickLog.length - 1; i >= 0; i -= 1) {
    const item = state.clickLog[i];
    const term = String(item?.term || "").trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const summaryRaw = String(
      state.personalTermSummaries?.[term] ||
      state.termMeta?.[term]?.summary ||
      ""
    ).trim();
    const summary = normalizePersonalSummary(summaryRaw || `${term} は今回の会議で学習対象になった用語です。`);
    out.push({ term, summary });
  }
  return out.reverse();
}

function openPersonalDictModal() {
  if (!personalDictCard || !personalDictList) return;
  const rows = getCurrentLearningWordCandidates();
  if (rows.length === 0) {
    personalDictList.innerHTML = `<p class="mini-meta">登録できる学習ワードがありません。先に「知らない」「気になる」を押してください。</p>`;
  } else {
    const html = rows
      .map((row, index) => {
        const termEsc = escapeHtml(row.term);
        const summaryHtml = sanitizeExplainHtml(row.summary);
        const prevMemo = String(state.personalDictionary?.[row.term]?.memo || "").trim();
        const memoEsc = escapeHtml(prevMemo);
        return `<div class="personal-dict-item"><label class="personal-dict-head"><input type="checkbox" data-term="${termEsc}" ${index >= 0 ? "checked" : ""} /><div><div class="personal-dict-label">${termEsc}</div><div class="personal-dict-summary">${summaryHtml}</div></div></label><label class="personal-dict-memo-wrap">自分メモ<textarea class="personal-dict-memo-input" data-memo-term="${termEsc}" placeholder="この用語の自分メモを入力">${memoEsc}</textarea></label></div>`;
      })
      .join("");
    personalDictList.innerHTML = html;
  }
  syncPersonalDictSaveEnabled();
  personalDictCard.classList.remove("hidden");
  document.body.classList.add("personal-register-open");
}

function closePersonalDictModal() {
  personalDictCard?.classList.add("hidden");
  document.body.classList.remove("personal-register-open");
}

function openPersonalDictDrawer() {
  personalDictDraft = clonePersonalDictionary(state.personalDictionary || {});
  clearAllDeleteConfirmFlags();
  renderPersonalDictDrawer();
  setDrawerOpen(true);
}

function renderPersonalDictDrawer() {
  if (!personalDictEditorBody) return;
  const source =
    personalDictDraft && typeof personalDictDraft === "object"
      ? personalDictDraft
      : (state.personalDictionary || {});
  const rows = Object.values(source)
    .filter((x) => x && typeof x === "object")
    .sort((a, b) => String(a.term || "").localeCompare(String(b.term || ""), "ja"));

  if (rows.length === 0) {
    personalDictEditorBody.innerHTML = `<p class="mini-meta">パーソナル辞書はまだ空です。</p>`;
    if (personalDictDrawerSaveBtn) personalDictDrawerSaveBtn.disabled = true;
    return;
  }

  if (personalDictDrawerSaveBtn) personalDictDrawerSaveBtn.disabled = false;
  personalDictEditorBody.innerHTML = rows
    .map((row) => {
      const term = escapeHtml(String(row.term || ""));
      const summary = sanitizeExplainHtml(String(row.summary || ""));
      const memo = escapeHtml(String(row.memo || ""));
      const confirm = row._deleteConfirm === true;
      const deleteCell = confirm
        ? `<div class="personal-dict-delete-wrap"><div class="personal-dict-delete-confirm"><button type="button" class="personal-dict-delete-btn icon" data-delete-confirm="${term}" aria-label="${term}を削除確定">✓</button><button type="button" class="personal-dict-delete-btn icon" data-delete-cancel="${term}" aria-label="${term}の削除を戻す">↩</button></div></div>`
        : `<div class="personal-dict-delete-wrap"><button type="button" class="personal-dict-delete-btn icon" data-delete-term="${term}" aria-label="${term}を削除">×</button></div>`;
      return `<div class="personal-dict-editor-row"><div>${deleteCell}</div><div class="personal-dict-cell word">${term}</div><div class="personal-dict-cell">${summary}</div><div><textarea class="personal-dict-memo" name="personal_dict_memo" data-term="${term}" placeholder="この用語のメモ">${memo}</textarea></div></div>`;
    })
    .join("");
}

function savePersonalDictDraft() {
  if (!personalDictEditorBody) return;
  const base =
    personalDictDraft && typeof personalDictDraft === "object"
      ? personalDictDraft
      : (state.personalDictionary || {});
  const next = clonePersonalDictionary(base);
  const memos = personalDictEditorBody.querySelectorAll("textarea.personal-dict-memo[data-term]");
  for (const node of memos) {
    if (!(node instanceof HTMLTextAreaElement)) continue;
    const term = String(node.dataset.term || "").trim();
    if (!term || !next[term]) continue;
    next[term].memo = String(node.value || "").trim();
    next[term].updatedAt = new Date().toISOString();
  }
  for (const key of Object.keys(next)) {
    if (next[key] && typeof next[key] === "object") {
      delete next[key]._deleteConfirm;
    }
  }
  state.personalDictionary = next;
  safeStorageSet(PERSONAL_DICT_STORAGE_KEY, JSON.stringify(next));
  setDrawerOpen(false);
  setRunStatus("自分辞書のメモを保存しました。");
}

function markPersonalDictDeleteConfirm(term) {
  if (!personalDictDraft?.[term]) return;
  personalDictDraft[term]._deleteConfirm = true;
  renderPersonalDictDrawer();
}

function clearPersonalDictDeleteConfirm(term) {
  if (!personalDictDraft?.[term]) return;
  delete personalDictDraft[term]._deleteConfirm;
  renderPersonalDictDrawer();
}

function clearAllDeleteConfirmFlags() {
  if (!personalDictDraft || typeof personalDictDraft !== "object") return;
  for (const key of Object.keys(personalDictDraft)) {
    if (personalDictDraft[key] && typeof personalDictDraft[key] === "object") {
      delete personalDictDraft[key]._deleteConfirm;
    }
  }
}

function deletePersonalDictDraftTerm(term) {
  if (!personalDictDraft?.[term]) return;
  delete personalDictDraft[term];
  renderPersonalDictDrawer();
}

function commitPersonalDictionarySelection() {
  if (!personalDictList) return;
  const checks = personalDictList.querySelectorAll("input[type='checkbox'][data-term]");
  const memoMap = new Map();
  const memoNodes = personalDictList.querySelectorAll("textarea[data-memo-term]");
  for (const m of memoNodes) {
    if (!(m instanceof HTMLTextAreaElement)) continue;
    const term = String(m.dataset.memoTerm || "").trim();
    if (!term) continue;
    memoMap.set(term, String(m.value || "").trim());
  }
  const selected = [];
  for (const node of checks) {
    if (!(node instanceof HTMLInputElement)) continue;
    if (!node.checked) continue;
    const term = String(node.dataset.term || "").trim();
    if (!term) continue;
    const summary = normalizePersonalSummary(String(
      state.personalTermSummaries?.[term] ||
      state.termMeta?.[term]?.summary ||
      `${term} は今回の会議で学習対象になった用語です。`
    ));
    selected.push({ term, summary, memo: memoMap.get(term) || "" });
  }

  if (selected.length === 0) {
    setRunStatus("登録対象が未選択です。");
    return;
  }

  const now = new Date().toISOString();
  const next = { ...(state.personalDictionary || {}) };
  for (const row of selected) {
    const prev = next[row.term] || null;
    next[row.term] = {
      term: row.term,
      summary: row.summary,
      memo: row.memo,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      saveCount: Number(prev?.saveCount || 0) + 1
    };
  }
  state.personalDictionary = next;
  safeStorageSet(PERSONAL_DICT_STORAGE_KEY, JSON.stringify(next));
  closePersonalDictModal();
  setRunStatus(`自分辞書に登録しました: ${selected.length}件`);
}

function syncPersonalDictSaveEnabled() {
  if (!personalDictSaveBtn || !personalDictList) return;
  const checks = personalDictList.querySelectorAll("input[type='checkbox'][data-term]");
  if (checks.length === 0) {
    personalDictSaveBtn.disabled = true;
    return;
  }
  const hasChecked = Array.from(checks).some((node) => node instanceof HTMLInputElement && node.checked);
  personalDictSaveBtn.disabled = !hasChecked;
}

async function generateNotes(options = {}) {
  if (!state.demoData) {
    debugWarn("notes", "generateNotes skipped: no demoData");
    return;
  }

  const meetingText = state.liveMeetingText;
  const lines = meetingText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length === 0) {
    notesOutput.textContent = "会議ログがありません。";
    notesSource.textContent = "-";
    return;
  }
  const meetingPackage = buildMeetingPackage();
  if (!Array.isArray(meetingPackage.focusTerms) || meetingPackage.focusTerms.length === 0) {
    notesOutput.textContent = "学習ワードがありません。「知らない」「気になる」を押してから生成してください。";
    notesSource.textContent = "-";
    setRunStatus("学習ワードがないため、会議文脈付きまとめは生成しません。");
    return false;
  }

  const compact = options?.compact === true;
  const meetingSource = compact ? buildNotesCompactInput(meetingText) : buildMinutesMarkdown(meetingText);
  const payload = { meetingText: meetingSource, meetingPackage };
  if (notesLoading) notesLoading.classList.remove("hidden");
  setRunStatus(compact ? "会議文脈付きまとめを再生成中です(短縮コンテキスト)..." : "会議文脈付きまとめを生成中です...");
  debugLog("notes", "generateNotes request prepared", {
    apiBase: state.apiBase,
    rawMeetingChars: meetingText.length,
    sentMeetingChars: meetingSource.length,
    hasGeneratedMinutes: Boolean(state.generatedMinutes?.trim()),
    clickCount: state.clickLog.length,
  });

  try {
    const response = await postJson(`${state.apiBase}/generateNotes`, payload);
    debugLog("notes", "generateNotes response received", {
      source: response?.source ?? "-",
      hasNotes: Boolean(String(response?.notes ?? "").trim()),
      aiError: response?.aiError ?? null,
      inputStats: response?.inputStats ?? null,
    });
    notesOutput.textContent = String(response?.notes ?? "まとめが返りませんでした。");
    state.generatedNotes = notesOutput.textContent;
    notesSource.textContent = String(response?.source ?? "-");
    if (String(response?.source ?? "") === "context_estimate") {
      const aiError = String(response?.aiError ?? "").trim();
      const stat = response?.inputStats
        ? `raw=${response.inputStats.rawChars ?? "-"}, sent=${response.inputStats.sentChars ?? "-"}`
        : "raw/sent=-";
      setRunStatus(`会議文脈付きまとめはフォールバック表示です。原因=${aiError || "AIエラー詳細なし"} (${stat})`);
      debugWarn("notes", "generateNotes fallback rendered", {
        aiError: aiError || null,
        inputStats: response?.inputStats ?? null,
      });
      return false;
    }
    setRunStatus(`会議文脈付きまとめを生成しました: source=${notesSource.textContent}`);
    return true;
  } catch (error) {
    debugError("notes", "generateNotes request failed", { error: String(error), apiBase: state.apiBase });
    notesOutput.textContent = `まとめ生成エラー: ${String(error)}`;
    notesSource.textContent = "error";
    setRunStatus(`まとめ生成失敗: ${String(error)}`);
    return false;
  } finally {
    if (notesLoading) notesLoading.classList.add("hidden");
  }
}

function buildNotesCompactInput(meetingText) {
  const lines = String(meetingText || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const head = lines.slice(0, 12);
  const tail = lines.slice(-18);
  const merged = [...head, ...tail];
  const dedup = [];
  const seen = new Set();
  for (const line of merged) {
    if (seen.has(line)) continue;
    seen.add(line);
    dedup.push(line);
  }
  return buildMinutesMarkdown(dedup.join("\n"));
}

async function generateMeetingOutputs() {
  if (minutesBtn) minutesBtn.disabled = true;
  try {
    await generateMinutesDocument();
    let ok = await generateNotes({ compact: false });
    if (!ok) {
      ok = await generateNotes({ compact: true });
    }
    await generatePersonalTermSummaries();
    if (!ok) {
      setRunStatus("学習ワードまとめの生成に失敗しました。時間をおいて再試行してください。");
    }
  } finally {
    if (minutesBtn) minutesBtn.disabled = false;
  }
}

function resolveTermCategory(term, meta, domain) {
  const cat = meta?.dispatcher?.category || meta?.category || "";
  if (cat) {
    if (cat === "it") return "IT/システム";
    if (cat === "business") return "業務/経営";
    if (cat === "manufacturing") return "製造";
    if (cat === "medical") return "医療/福祉";
    return cat;
  }
  if (/RBAC|Entra|Identity|Token|Blob|Event Grid|Functions|Container/i.test(term)) return "セキュリティ/クラウド";
  if (/SKU|SAP|ERP|MES|SCADA/i.test(term)) return "業務/在庫管理";
  if (/RAG|Embedding|Vector|LLM|OpenAI/i.test(term)) return "AI/検索";
  return domain;
}

function stripSpeakerPrefixForNotes(line) {
  return String(line).replace(/^[^:：]{1,24}[：:]\s*/, "").trim();
}

function buildMinutesMarkdown(meetingText) {
  const lines = String(meetingText || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const speakers = unique(
    lines
      .map((line) => line.split(":")[0]?.trim() ?? "")
      .filter((x) => x.length > 0)
      .slice(0, 12)
  );
  const keyTerms = unique([...state.terms, ...state.clickLog.map((x) => x.term)]).slice(0, 10);
  const highlightLines = lines.slice(0, 8);
  const actionLines = lines.filter((x) => /(する|対応|確認|決め|進め|予定|次回|MVP)/.test(x)).slice(0, 6);

  return [
    "# 議事録",
    "",
    `- 生成日時: ${new Date().toLocaleString()}`,
    `- モード: 演出デモ + Live API`,
    `- サンプル: ${sampleSelect.options[sampleSelect.selectedIndex]?.textContent ?? "-"}`,
    "",
    "## 参加者",
    speakers.length > 0 ? speakers.map((x) => `- ${x}`).join("\n") : "- （会議ログから取得できませんでした）",
    "",
    "## 主要用語",
    keyTerms.length > 0 ? keyTerms.map((x) => `- ${x}`).join("\n") : "- （抽出語なし）",
    "",
    "## 主要論点（抜粋）",
    highlightLines.length > 0 ? highlightLines.map((x) => `- ${x}`).join("\n") : "- （抜粋なし）",
    "",
    "## 次アクション候補",
    actionLines.length > 0 ? actionLines.map((x) => `- ${x}`).join("\n") : "- （アクション候補なし）",
    ""
  ].join("\n");
}

async function generateMinutesDocument() {
  const meetingText = state.liveMeetingText;
  if (!meetingText) {
    setRunStatus("議事録を作成する会議ログがありません。");
    return;
  }
  const payload = { meetingText: buildMinutesMarkdown(meetingText), meetingPackage: buildMeetingPackage() };
  minutesBtn.disabled = true;
  if (minutesLoading) minutesLoading.classList.remove("hidden");
  if (minutesCard) minutesCard.classList.remove("hidden");
  if (minutesOutput) minutesOutput.textContent = "生成中...";
  setRunStatus("議事録を生成中です...");
  try {
    const response = await postJson(`${state.apiBase}/generateMinutes`, payload);
    const text = String(response?.minutes ?? "").trim();
    state.generatedMinutes = text || buildMinutesMarkdown(meetingText);
    if (minutesOutput) minutesOutput.textContent = state.generatedMinutes;
    setRunStatus(`議事録を作成しました: source=${String(response?.source ?? "-")}`);
  } catch (error) {
    const fallback = buildMinutesMarkdown(meetingText);
    state.generatedMinutes = fallback;
    if (minutesOutput) minutesOutput.textContent = fallback;
    setRunStatus(`議事録AI生成失敗のためローカル生成を表示: ${String(error)}`);
    debugError("notes", "generateMinutes failed", { error: String(error) });
  } finally {
    minutesBtn.disabled = false;
    if (minutesLoading) minutesLoading.classList.add("hidden");
  }
}

function generateSupplementDocument() {
  const term = state.activeTerm;
  if (!term) {
    setRunStatus("先に用語を1つ選択してください。");
    return;
  }

  const detail = termDetail?.textContent?.trim() || "説明がありません。";
  const source = explainSource?.textContent?.trim() || "-";
  const meetingText = state.liveMeetingText || getCurrentMeetingTextForApi();

  const contextLines = meetingText
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 5);

  const related = state.terms.filter((x) => x !== term).slice(0, 5);

  const markdown = [
    `# 補足説明: ${term}`,
    "",
    `- 生成日時: ${new Date().toLocaleString()}`,
    `- 説明ソース: ${source}`,
    "",
    "## かんたん説明",
    detail,
    "",
    "## 会議文脈での使われ方",
    contextLines.length > 0 ? contextLines.map((x) => `- ${x}`).join("\n") : "- 文脈行を取得できませんでした。",
    "",
    "## 関連語",
    related.length > 0 ? related.map((x) => `- ${x}`).join("\n") : "- 関連語なし",
    ""
  ].join("\n");

  state.generatedSupplement = markdown;
  if (supplementCard) supplementCard.classList.remove("hidden");
  if (supplementOutput) supplementOutput.textContent = markdown;
  setRunStatus(`補足説明ドキュメントを作成しました: ${term}`);
}

function resetPlayback() {
  stopVoiceInput("待機中");
  stopPlaybackEngine();
  if (state.extractBatchTimer) {
    clearTimeout(state.extractBatchTimer);
    state.extractBatchTimer = null;
  }
  state.contextId += 1;
  state.terms = [];
  state.termMeta = {};
  state.activeTerm = null;
  state.clickLog = [];
  state.expandedUnknownByTerm = {};
  state.liveMeetingText = "";
  state.liveDetails = {};
  state.termSeenSeq = 0;
  state.extractMissQueue = [];
  state.extractMissInFlight = false;
  state.extractBatchBuffer = "";
  state.extractBatchInFlight = false;
  state.liveDebug = {
    dictionary: null,
    dispatcherPolicy: null,
    extractSource: "-",
    routes: {},
    dictionaryMode: "-",
    dictionaryProfile: null,
    dispatcherBypassed: null
  };
  state.processedLines = 0;
  state.totalLines = state.demoData ? countLineEvents(state.demoData.events) : 0;

  streamList.innerHTML = "";
  streamList.classList.add("is-empty");
  termChips.innerHTML = "";

  explainSource.textContent = "-";
  notesSource.textContent = "-";

  renderTermDetail();
  renderProfileSummary();
  renderClickList();
  notesOutput.textContent = "まだ生成していません。";
  state.generatedNotes = "";
  state.generatedMinutes = "";
  state.generatedSupplement = "";
  if (minutesZone) minutesZone.classList.add("hidden");
  if (notesCard) notesCard.classList.add("hidden");
  if (hakaseCard) hakaseCard.classList.add("hidden");
  if (personalDictLane) personalDictLane.classList.add("hidden");
  if (personalDictCard) personalDictCard.classList.add("hidden");
  if (notesLoading) notesLoading.classList.add("hidden");
  if (minutesLoading) minutesLoading.classList.add("hidden");
  if (minutesBtn) minutesBtn.disabled = true;
  if (minutesCard) minutesCard.classList.add("hidden");
  if (minutesOutput) minutesOutput.textContent = "議事録はまだ作成されていません。";
  if (supplementCard) supplementCard.classList.add("hidden");
  if (supplementOutput) supplementOutput.textContent = "補足説明はまだ作成されていません。";
  setUnknownExplainVisible(false);
  updateStreamMeta(0, state.totalLines);
  setButtonLabel(pauseBtn, "一時停止");
  renderDebugCard();
  renderDictionaryDispatcherSummary();
}

function renderHakaseComment() {
  if (!hakaseComment) return;
  const idx = Math.floor(Math.random() * HAKASE_COMMENTS.length);
  hakaseComment.textContent = HAKASE_COMMENTS[idx];
}

function renderDictionaryDispatcherSummary() {
  if (!state.hasSessionStarted) {
    if (dictionaryProfileInfo) {
      dictionaryProfileInfo.textContent = "会話の流れで自動的に優先する辞書を選びます。";
    }
    if (dispatcherRateInfo) {
      dispatcherRateInfo.textContent = "";
    }
    return;
  }

  if (dictionaryProfileInfo) {
    const profile = formatDictionaryProfileLabel(state.liveDebug?.dictionaryProfile);
    const mode = state.liveDebug?.dictionaryMode || "-";
    dictionaryProfileInfo.textContent = `辞書: ${profile} (mode=${mode})`;
  }

  if (dispatcherRateInfo) {
    // 画面に出ている用語を母数にし、各語のルート情報で逐次集計する
    const total = Array.isArray(state.terms) ? state.terms.length : 0;
    let selected = 0;
    for (const term of state.terms || []) {
      const route = state.liveDebug?.routes?.[term]?.extract;
      if (!route) continue;
      const source = String(route.source || "").toLowerCase();
      const hasDispatcherSignal =
        source.includes("dictionary") ||
        typeof route.score === "number" ||
        typeof route.reason === "string" ||
        Array.isArray(route.reasons);
      if (hasDispatcherSignal) selected += 1;
    }
    const pct = total > 0 ? Math.round((selected / total) * 100) : 0;
    dispatcherRateInfo.textContent = `ワード判別進捗: ${selected}/${total} (${pct}%)`;
  }
}

function formatDictionaryProfileLabel(profileRaw) {
  const profile = String(profileRaw || "").trim();
  if (!profile) return "未選択";
  const key = profile.toLowerCase();

  if (key.includes("system") || key.includes("it")) return "IT辞書";
  if (key.includes("business") || key.includes("management")) return "経営辞書";
  if (key.includes("medical") || key.includes("healthcare") || key.includes("nursing")) return "医療・看護辞書";
  if (key.includes("manufacturing")) return "製造業辞書";
  if (key.includes("fashion")) return "ファッション辞書";
  if (key.includes("welfare")) return "福祉辞書";
  if (key.includes("social")) return "雑談・界隈辞書";
  if (key.includes("homelab") || key.includes("pc")) return "PC/ホームラボ辞書";
  return profile;
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
  streamMeta.textContent = `${done} / ${total} 行`;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  streamProgress.value = pct;
}

function countLineEvents(events) {
  return events.filter((e) => e.type === "line").length;
}

async function pingApi() {
  setRunStatus(`API疎通確認中: ${state.apiBase} ...`);
  debugLog("network", "pingApi start", { base: state.apiBase });
  try {
    const payload = await postJson(`${state.apiBase}/extractTerms`, buildExtractRequestPayload("ADR SKU RAG"));
    const source = String(payload?.source ?? "-");
    debugLog("network", "pingApi success", { source });
    setRunStatus(`API疎通OK: extractTerms source=${source}`);
  } catch (error) {
    debugError("network", "pingApi failed", { error: String(error) });
    setRunStatus(`API疎通失敗: ${String(error)}`);
  }
}

function resolveDictionaryProfile() {
  return resolveDictionaryProfileCore(String(sampleSelect?.value ?? ""));
}

function resolveMeetingDomain() {
  return resolveMeetingDomainCore(String(sampleSelect?.value ?? ""));
}

function buildExtractRequestPayload(text) {
  return buildExtractRequestPayloadCore(text, {
    selectedSample: String(sampleSelect?.value ?? ""),
    includeDebug: Boolean(debug.enabled),
    personalDictionary: state.personalDictionary,
  });
}

function parseExtractPayload(payload) {
  return parseExtractPayloadCore(payload);
}

function buildRoutesFromExtract(terms, source) {
  return buildRoutesFromExtractCore(terms, source);
}

function attachExplainRoute(term, response) {
  if (!term) return;
  const route = state.liveDebug.routes[term] ?? { extract: null, explain: null };
  route.explain = {
    source: String(response?.source ?? "-"),
    style: response?.style ? String(response.style) : null,
    matchType: response?.dictionary?.matchType ? String(response.dictionary.matchType) : null,
    dictionaryFile: response?.dictionary?.file ? String(response.dictionary.file) : null,
    layer: response?.dictionary?.layer ? String(response.dictionary.layer) : null,
  };
  state.liveDebug.routes[term] = route;
}

function renderDebugCard() {
  if (!debugCard) return;

  if (!debug.enabled) {
    debugCard.classList.add("hidden");
    debugBackdrop?.classList.add("hidden");
    if (debugToggleBtn) debugToggleBtn.classList.add("hidden");
    return;
  }

  if (debugToggleBtn) {
    debugToggleBtn.classList.remove("hidden");
    debugToggleBtn.textContent = state.debugPanelOpen ? "デバッグを閉じる" : "デバッグを開く";
  }

  if (state.debugPanelOpen) {
    debugCard.classList.remove("hidden");
    debugBackdrop?.classList.remove("hidden");
  } else {
    debugCard.classList.add("hidden");
    debugBackdrop?.classList.add("hidden");
    return;
  }

  debugStateBadge.textContent = "debug: on (demo_live_unified)";
  if (debugProbeBtn) {
    debugProbeBtn.disabled = false;
  }

  const dict = state.liveDebug.dictionary;
  if (dict) {
    const files = Array.isArray(dict.files) ? dict.files.length : 0;
    const entries = typeof dict.totalEntries === "number" ? dict.totalEntries : "-";
    const dirs = Array.isArray(dict.sourceDirs) ? dict.sourceDirs.length : 0;
    const mode = state.liveDebug.dictionaryMode ?? "-";
    const profile = state.liveDebug.dictionaryProfile ?? "-";
    const bypass = typeof state.liveDebug.dispatcherBypassed === "boolean"
      ? String(state.liveDebug.dispatcherBypassed)
      : "-";
    debugDictionaryInfo.textContent = `辞書状態: mode=${mode} | profile=${profile} | dispatcherBypassed=${bypass} | entries=${entries} | files=${files} | sourceDirs=${dirs}`;
  } else {
    debugDictionaryInfo.textContent = "辞書状態: 未取得（「ディスパッチャ検証」またはLive API抽出を実行）";
  }

  const policy = state.liveDebug.dispatcherPolicy;
  if (state.liveDebug.dispatcherBypassed === true) {
    debugPolicyInfo.textContent = "評価軸: 固定辞書モード（dispatcher経路は待避中）";
  } else if (policy?.scoring && policy?.thresholds) {
    const s = policy.scoring;
    const t = policy.thresholds;
    debugPolicyInfo.textContent =
      `評価軸: term=${s.exactTerm}, alias=${s.alias}, upperFloor=${s.uppercaseFloor}, context=${s.contextBonus}, short=${s.shortTokenPenalty}, generic=${s.genericWordPenalty}, minScore=${t.minScore}, perLine=${t.maxPerLine}, perCategoryLine=${t.maxPerCategoryPerLine}, maxTotal=${t.maxTotal}`;
  } else {
    debugPolicyInfo.textContent = "評価軸: APIからdispatcherPolicy待機中（ディスパッチャ検証）。";
  }

  const rows = Object.entries(state.liveDebug.routes);
  if (rows.length === 0) {
    debugRouteList.innerHTML = '<p class="debug-route-item">通過経路データはまだありません。</p>';
    return;
  }

  const html = rows
    .map(([term, route]) => {
      const ex = route?.extract ?? {};
      const exReasons = Array.isArray(ex.reasons) ? ex.reasons.join(", ") : "-";
      const exLine =
        `抽出=${ex.source ?? "-"} | origin=${ex.origin ?? "-"} | profile=${ex.profile ?? "-"} | conf=${ex.confidence ?? "-"} | matched=${ex.matchedText ?? "-"} | score=${ex.score ?? "-"} | reason=${ex.reason ?? "-"} | reasons=[${exReasons}] | cat=${ex.category ?? "-"} | file=${ex.file ?? "-"}`;

      const ep = route?.explain ?? null;
      const epLine = ep
        ? `説明=${ep.source ?? "-"} | style=${ep.style ?? "-"} | matchType=${ep.matchType ?? "-"} | file=${ep.dictionaryFile ?? "-"} | layer=${ep.layer ?? "-"}`
        : "説明=未実行";

      return `<article class="debug-route-item"><strong>${escapeHtml(term)}</strong><br>${escapeHtml(exLine)}<br>${escapeHtml(epLine)}</article>`;
    })
    .join("");

  debugRouteList.innerHTML = html;
}

async function postJson(url, body) {
  const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const requestPayload = JSON.stringify(body ?? {});
  const bodyKeys =
    body && typeof body === "object" && !Array.isArray(body)
      ? Object.keys(body).slice(0, 16)
      : [];
  debugLog("network", "request start", {
    requestId,
    url,
    method: "POST",
    bodyChars: requestPayload.length,
    bodyKeys,
  });

  let response;
  let timeoutHandle = null;
  const controller = new AbortController();
  try {
    const headers = {
      "content-type": "application/json",
    };
    if (state.functionKey) {
      headers["x-functions-key"] = state.functionKey;
    }
    timeoutHandle = setTimeout(() => controller.abort("timeout"), HTTP_REQUEST_TIMEOUT_MS);
    response = await fetch(url, {
      method: "POST",
      headers,
      body: requestPayload,
      signal: controller.signal,
    });
  } catch (error) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const message = resolveFetchFailureMessage(url, error);
    debugError("network", "request transport failed", { requestId, url, error: String(error) });
    throw new Error(message);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  const contentType = response.headers.get("content-type") || "";
  let text = "";
  try {
    text = await response.text();
  } catch (error) {
    debugError("network", "response read failed", {
      requestId,
      status: response.status,
      error: String(error),
    });
    throw new Error(`Response read failed (${response.status}).`);
  }

  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      debugWarn("network", "response json parse failed", {
        requestId,
        status: response.status,
        contentType,
        textChars: text.length,
        error: String(error),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${shortText(text, 200)}`);
      }
      throw new Error(`Invalid JSON response from API (${response.status}).`);
    }
  }

  debugLog("network", "request completed", {
    requestId,
    status: response.status,
    ok: response.ok,
    contentType,
    payloadChars: text.length,
    payloadKeys:
      data && typeof data === "object" && !Array.isArray(data)
        ? Object.keys(data).slice(0, 16)
        : [],
  });

  if (!response.ok) {
    const msg = data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
    const branch = classifyHttpError(response.status);
    debugWarn("network", "http error response", {
      requestId,
      status: response.status,
      branch,
      message: msg,
      payloadKeys:
        data && typeof data === "object" && !Array.isArray(data)
          ? Object.keys(data).slice(0, 16)
          : [],
    });
    throw new Error(`[${branch}] ${msg}`);
  }

  return data;
}

function highlightText(text, terms) {
  const raw = String(text ?? "");
  if (!terms || terms.length === 0) {
    return escapeHtml(raw).replace(/\n/g, "<br>");
  }

  const uniqueTerms = [...new Set(
    terms
      .flatMap((x) => resolveHighlightCandidates(x))
      .map((x) => sanitizeTermLabel(x))
      .filter(Boolean)
  )];
  if (uniqueTerms.length === 0) {
    return escapeHtml(raw).replace(/\n/g, "<br>");
  }

  // Build one combined regex so we never re-scan inserted markup.
  const ordered = uniqueTerms.sort((a, b) => b.length - a.length);
  const pattern = ordered.map((term) => escapeRegExp(term)).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");

  let out = "";
  let last = 0;
  for (const m of raw.matchAll(regex)) {
    const idx = m.index ?? 0;
    const hit = m[0] ?? "";
    out += escapeHtml(raw.slice(last, idx));
    out += `<mark class="term">${escapeHtml(hit)}</mark>`;
    last = idx + hit.length;
  }
  out += escapeHtml(raw.slice(last));

  return out.replace(/\n/g, "<br>");
}

function resolveHighlightCandidates(term) {
  const out = [];
  const base = sanitizeTermLabel(term);
  if (base) out.push(base);

  // "PoC (概念実証)" のような表示語から括弧を外した素語も候補にする
  const compact = base.replace(/\s*\([^)]*\)\s*/g, "").trim();
  if (compact && compact !== base) out.push(compact);

  const meta = state.termMeta?.[term];
  const matchedText = typeof meta?.dispatcher?.matchedText === "string" ? meta.dispatcher.matchedText.trim() : "";
  if (matchedText) out.push(matchedText);

  // reasons に "matched:Functions" のようなヒントが入る場合を拾う
  const reasons = Array.isArray(meta?.reasons) ? meta.reasons : [];
  for (const r of reasons) {
    if (typeof r !== "string") continue;
    if (!r.startsWith("matched:")) continue;
    const v = r.slice("matched:".length).trim();
    if (v) out.push(v);
  }

  return [...new Set(out)];
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

function createDebugRuntime(baseConfig) {
  const query = new URLSearchParams(window.location.search);
  const queryDebug = query.get("debug");
  let stored = null;
  try {
    stored = localStorage.getItem(DEBUG_STORAGE_KEY);
  } catch {
    stored = null;
  }

  let enabled = Boolean(baseConfig?.enabled);
  if (stored === "1") enabled = true;
  if (stored === "0") enabled = false;
  if (queryDebug === "1" || queryDebug === "true") enabled = true;
  if (queryDebug === "0" || queryDebug === "false") enabled = false;

  return {
    enabled,
    level: baseConfig?.level ?? "debug",
    anchors: {
      app: true,
      ui: true,
      playback: true,
      storage: true,
      network: true,
      api: true,
      ...(baseConfig?.anchors ?? {}),
    },
  };
}

function setDebugMode(enabled, source = "unknown") {
  debug.enabled = Boolean(enabled);
  safeStorageSet(DEBUG_STORAGE_KEY, debug.enabled ? "1" : "0");
  if (!debug.enabled) {
    state.debugPanelOpen = false;
  } else if (debug.enabled && !state.debugPanelOpen) {
    state.debugPanelOpen = true;
  }
  debugLog("app", "debug mode changed", { enabled: debug.enabled, source });
  updateDebugVisibility();
  renderDebugCard();
}

function updateDebugVisibility() {
  document.body.classList.toggle("debug-enabled", Boolean(debug.enabled));
}

function setDebugPanelOpen(open) {
  state.debugPanelOpen = Boolean(open);
  renderDebugCard();
}

function debugLog(anchor, message, payload) {
  if (!debug.enabled || !debug.anchors?.[anchor]) return;
  if (payload === undefined) {
    console.log(`[MW][${anchor}] ${message}`);
    return;
  }
  console.log(`[MW][${anchor}] ${message}`, payload);
}

function debugWarn(anchor, message, payload) {
  if (!debug.enabled || !debug.anchors?.[anchor]) return;
  if (payload === undefined) {
    console.warn(`[MW][${anchor}] ${message}`);
    return;
  }
  console.warn(`[MW][${anchor}] ${message}`, payload);
}

function debugError(anchor, message, payload) {
  if (!debug.enabled || !debug.anchors?.[anchor]) return;
  if (payload === undefined) {
    console.error(`[MW][${anchor}] ${message}`);
    return;
  }
  console.error(`[MW][${anchor}] ${message}`, payload);
}

function shortText(value, max = 220) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function classifyHttpError(status) {
  if (status === 400) return "HTTP_BAD_REQUEST";
  if (status === 401) return "HTTP_UNAUTHORIZED";
  if (status === 403) return "HTTP_FORBIDDEN";
  if (status === 404) return "HTTP_NOT_FOUND";
  if (status === 408) return "HTTP_TIMEOUT";
  if (status === 409) return "HTTP_CONFLICT";
  if (status === 422) return "HTTP_UNPROCESSABLE";
  if (status === 429) return "HTTP_RATE_LIMIT";
  if (status >= 500) return "HTTP_SERVER_ERROR";
  return "HTTP_ERROR";
}

function resolveFetchFailureMessage(url, error) {
  const text = String(error);
  if (/AbortError|timeout/i.test(text)) {
    return `Request timeout (${url}). API応答が遅延しています。`;
  }
  if (error instanceof TypeError || /Failed to fetch/i.test(text)) {
    return `Failed to fetch (${url}). API未起動/CORS/URL不一致の可能性があります。`;
  }
  return `Network request failed (${url}): ${text}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setDrawerOpen(open) {
  state.drawerOpen = Boolean(open);
  if (state.drawerOpen) {
    document.body.classList.add("menu-open");
  } else {
    document.body.classList.remove("menu-open");
  }

  if (menuToggleBtn) {
    menuToggleBtn.textContent = state.drawerOpen ? "✕ メニュー" : "☰ メニュー";
    menuToggleBtn.setAttribute("aria-expanded", state.drawerOpen ? "true" : "false");
  }

  if (leftMenu) {
    leftMenu.setAttribute("aria-hidden", state.drawerOpen ? "false" : "true");
  }
}

function setRunStatus(text) {
  runStatus.textContent = text;
  debugLog("ui", "status", { text });
}

function sanitizeLineText(value) {
  return String(value ?? "")
    .replace(/<mark\b[^>]*>/gi, "")
    .replace(/<\/mark>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;mark\b[^&]*&gt;/gi, "")
    .replace(/&lt;\/mark&gt;/gi, "")
    .trim();
}

function configureToTopButtonSprite() {
  if (!(toTopBtn instanceof HTMLButtonElement)) return;
}

function isTopVisible() {
  if (appMain instanceof HTMLElement) {
    return appMain.scrollLeft <= 4;
  }
  return window.scrollX <= 4;
}

function syncToTopButtonVisibility() {
  if (!(toTopBtn instanceof HTMLButtonElement)) return;
  const visible = !isTopVisible();
  toTopBtn.classList.toggle("hidden", !visible);
  if (!visible) return;
  toTopBtn.style.right = `${resolveToTopRightPx()}px`;
}

function runToTopScroll() {
  if (!(toTopBtn instanceof HTMLButtonElement)) return;
  toTopBtn.classList.add("shake");
  if (appMain instanceof HTMLElement) {
    appMain.scrollTo({ left: 0, behavior: "smooth" });
  } else {
    window.scrollTo({ left: 0, behavior: "smooth" });
  }

  const finish = () => {
    if (isTopVisible()) {
      toTopBtn.classList.remove("shake");
      toTopBtn.classList.add("hidden");
      return;
    }
    requestAnimationFrame(finish);
  };
  requestAnimationFrame(finish);
}

function isPersonalRegisterVisible() {
  return Boolean(personalDictCard && !personalDictCard.classList.contains("hidden"));
}

function resolveToTopRightPx() {
  const NORMAL_RIGHT = 18;
  const REGISTER_RIGHT = 550;
  if (!isPersonalRegisterVisible()) return NORMAL_RIGHT;
  if (!(appMain instanceof HTMLElement)) return REGISTER_RIGHT;

  const maxScroll = Math.max(0, appMain.scrollWidth - appMain.clientWidth);
  if (maxScroll <= 0) return NORMAL_RIGHT;

  // 右端から左へ戻る間はREGISTER_RIGHTで固定し、
  // 十分左へ戻って干渉が消えたらNORMAL_RIGHTへ切り替える。
  const movedLeftFromRightEdge = maxScroll - appMain.scrollLeft;
  const switchThreshold = Math.max(0, REGISTER_RIGHT - NORMAL_RIGHT);
  return movedLeftFromRightEdge < switchThreshold ? REGISTER_RIGHT : NORMAL_RIGHT;
}

function scrollToFarRight() {
  if (appMain instanceof HTMLElement) {
    appMain.scrollTo({ left: appMain.scrollWidth, behavior: "smooth" });
    return;
  }
  window.scrollTo({ left: Number.MAX_SAFE_INTEGER, behavior: "smooth" });
}

function scrollToFarRightAfterLayout() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToFarRight();
    });
  });
}

function setButtonLabel(button, text) {
  if (!(button instanceof HTMLButtonElement)) return;
  const label = button.querySelector(".btn-border-label");
  if (label) {
    label.textContent = text;
    return;
  }
  button.textContent = text;
}


function loadProfile() {
  return storageLoadProfile(STORAGE_KEY);
}

function loadPersonalDictionary() {
  const seed = buildSeedPersonalDictionary();
  return storageLoadPersonalDictionary(PERSONAL_DICT_STORAGE_KEY, seed);
}

async function generatePersonalTermSummaries() {
  const terms = unique(state.clickLog.map((x) => String(x.term || "").trim()).filter(Boolean)).slice(0, 30);
  if (terms.length === 0) return;
  for (const term of terms) {
    if (state.personalTermSummaries?.[term]) continue;
    try {
      const normalized = await fetchExplainForTerm(term, false, {
        preferDictionaryOnly: false,
        forceContextualAi: true,
        strictAi: false,
        contextId: state.contextId,
      });
      if (!normalized) continue;
      const base = String(normalized.brief || "").trim();
      if (!base) continue;
      state.personalTermSummaries[term] = normalizePersonalSummary(base);
    } catch {
      // ignore; fallback summary will be used
    }
  }
}

function normalizePersonalSummary(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= 160) return normalized;

  // Prefer sentence-level compression around 140 chars before fallback clipping.
  const sentences = normalized
    .split(/(?<=[。！？!?])/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (sentences.length > 1) {
    let out = "";
    for (const sentence of sentences) {
      const next = `${out}${sentence}`.trim();
      if (next.length > 160) break;
      out = next;
      if (out.length >= 120) break;
    }
    if (out.length >= 80) return out;
  }

  // Fallback: keep up to 160 chars.
  return `${normalized.slice(0, 159)}…`;
}

function buildSeedPersonalDictionary() {
  const now = new Date().toISOString();
  const out = {};
  for (const row of PERSONAL_DICTIONARY_SEED) {
    const term = String(row.term || "").trim();
    if (!term) continue;
    out[term] = {
      term,
      summary: String(row.summary || "").trim() || `${term} はユーザーの個人辞書に登録されています。`,
      memo: String(row.memo || "").trim(),
      createdAt: now,
      updatedAt: now,
      saveCount: 1,
    };
  }
  return out;
}

function clonePersonalDictionary(dict) {
  try {
    return JSON.parse(JSON.stringify(dict || {}));
  } catch {
    return {};
  }
}

function saveProfile(profile) {
  storageSaveProfile(STORAGE_KEY, profile);
}

function loadSupplements() {
  return storageLoadSupplements(SUPPLEMENT_STORAGE_KEY);
}

function saveSupplements(items) {
  storageSaveSupplements(SUPPLEMENT_STORAGE_KEY, items);
}

function appendSavedSupplement(fileName, content) {
  state.savedSupplements.push({
    fileName,
    content,
    createdAt: new Date().toISOString()
  });
  state.savedSupplements = state.savedSupplements.slice(-20);
  saveSupplements(state.savedSupplements);
  renderSavedSupplements();
}

function renderSavedSupplements() {
  if (!savedSupplementList) return;
  savedSupplementList.innerHTML = "";

  if (!state.savedSupplements || state.savedSupplements.length === 0) {
    savedSupplementList.innerHTML = '<p class="saved-supplement-item">保存済みデータはまだありません。</p>';
    return;
  }

  const recent = [...state.savedSupplements].reverse().slice(0, 10);
  for (const item of recent) {
    const row = document.createElement("article");
    row.className = "saved-supplement-item";

    const stamp = new Date(item.createdAt).toLocaleString();
    const preview = shortText(item.content.replace(/\s+/g, " "), 110);
    row.innerHTML = `<strong>${escapeHtml(item.fileName)}</strong><br>${escapeHtml(stamp)}<br>${escapeHtml(preview)}`;
    row.title = "クリックで本文を読み込み";
    row.addEventListener("click", () => {
      state.generatedSupplement = item.content;
      if (supplementCard) supplementCard.classList.remove("hidden");
      if (supplementOutput) supplementOutput.textContent = item.content;
      setRunStatus(`保存済み補足を読み込みました: ${item.fileName}`);
    });
    savedSupplementList.append(row);
  }
}

function downloadTextAsFile(fileName, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFileSegment(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "doc";
}

function buildTimestampCompact() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function loadApiBase() {
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const fallback = isLocalHost ? DEFAULT_LOCAL_API_BASE : `${window.location.origin.replace(/\/$/, "")}/api`;
  return storageLoadApiBase(API_STORAGE_KEY, fallback, host);
}

function loadFunctionKey() {
  const raw = safeSessionGet(API_KEY_STORAGE_KEY) ?? safeStorageGet(API_KEY_STORAGE_KEY);
  if (raw) {
    // Legacy migration: old localStorage key is moved to session-only.
    safeSessionSet(API_KEY_STORAGE_KEY, raw);
    safeStorageRemove(API_KEY_STORAGE_KEY);
  }
  return typeof raw === "string" ? raw.trim() : "";
}

function loadSpeechProvider() {
  const raw = safeStorageGet(SPEECH_PROVIDER_STORAGE_KEY);
  if (raw === "google" || raw === "webspeech") return raw;
  return "webspeech";
}
