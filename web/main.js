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
const SPEECH_KEY_STORAGE_KEY = "meeting_whisperer_speech_key";
const SPEECH_REGION_STORAGE_KEY = "meeting_whisperer_speech_region";
const SPEECH_PROVIDER_STORAGE_KEY = "meeting_whisperer_speech_provider";
const DEBUG_STORAGE_KEY = "meeting_whisperer_debug";
const SUPPLEMENT_STORAGE_KEY = "meeting_whisperer_supplements_v1";
const DEFAULT_API_BASE = "http://localhost:7071/api";
const SENSITIVE_STORAGE_KEYS = new Set([API_KEY_STORAGE_KEY, SPEECH_KEY_STORAGE_KEY]);

const debug = createDebugRuntime(DEBUG_CONFIG);
const transcriptAdapter = createTranscriptAdapter();

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
  drawerOpen: false,
  debugPanelOpen: debug.enabled,
  apiBase: loadApiBase(),
  functionKey: loadFunctionKey(),
  contextId: 0,
  lastExtractAtMs: 0,
  lastAiExtractAtMs: 0,
  extractInFlight: false,
  extractDebounceTimer: null,
  lastExtractTextLength: 0,
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
    speechKey: loadSpeechKey(),
    speechRegion: loadSpeechRegion(),
  },
};

const menuToggleBtn = document.querySelector("#menuToggleBtn");
const menuBackdrop = document.querySelector("#menuBackdrop");
const leftMenu = document.querySelector("#leftMenu");

const sampleSelect = document.querySelector("#sampleSelect");
const sampleTabBtn = document.querySelector("#sampleTabBtn");
const graphTabBtn = document.querySelector("#graphTabBtn");
const voiceTabBtn = document.querySelector("#voiceTabBtn");
const sampleIngestPane = document.querySelector("#sampleIngestPane");
const graphIngestPane = document.querySelector("#graphIngestPane");
const voiceIngestPane = document.querySelector("#voiceIngestPane");
const meetingInput = document.querySelector("#meetingInput");
const graphResolveBtn = document.querySelector("#graphResolveBtn");
const graphRouteStatus = document.querySelector("#graphRouteStatus");
const voiceProviderSelect = document.querySelector("#voiceProviderSelect");
const voiceSourceSelect = document.querySelector("#voiceSourceSelect");
const voiceStartBtn = document.querySelector("#voiceStartBtn");
const voiceStopBtn = document.querySelector("#voiceStopBtn");
const voiceStatus = document.querySelector("#voiceStatus");
const playbackControls = document.querySelector("#playbackControls");
const speedSelect = document.querySelector("#speedSelect");
const apiBaseInput = document.querySelector("#apiBaseInput");
const functionKeyInput = document.querySelector("#functionKeyInput");
const speechKeyInput = document.querySelector("#speechKeyInput");
const speechRegionInput = document.querySelector("#speechRegionInput");
const saveApiBtn = document.querySelector("#saveApiBtn");
const pingApiBtn = document.querySelector("#pingApiBtn");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const modeNotice = document.querySelector("#modeNotice");
const runStatus = document.querySelector("#runStatus");
const dictionaryProfileInfo = document.querySelector("#dictionaryProfileInfo");
const dispatcherRateInfo = document.querySelector("#dispatcherRateInfo");

const streamList = document.querySelector("#streamList");
const streamMeta = document.querySelector("#streamMeta");
const streamProgress = document.querySelector("#streamProgress");

const termChips = document.querySelector("#termChips");
const termTitle = document.querySelector("#termTitle");
const termDetail = document.querySelector("#termDetail");
const termContextHint = document.querySelector("#termContextHint");
const unknownExplainCard = document.querySelector("#unknownExplainCard");
const unknownExplainText = document.querySelector("#unknownExplainText");
const unknownAiSummaryText = document.querySelector("#unknownAiSummaryText");
const smallTalkList = document.querySelector("#smallTalkList");
const extractSource = document.querySelector("#extractSource");
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
const minutesCard = document.querySelector("#minutesCard");
const minutesOutput = document.querySelector("#minutesOutput");
const minutesLoading = document.querySelector("#minutesLoading");
const saveMinutesBtn = document.querySelector("#saveMinutesBtn");
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
const debugDictionaryInfo = document.querySelector("#debugDictionaryInfo");
const debugPolicyInfo = document.querySelector("#debugPolicyInfo");
const debugRouteList = document.querySelector("#debugRouteList");

const HAKASE_COMMENTS = [
  "このツールを早く卒業できるようになるといいのぉ。博士は楽できるんじゃがな。",
  "また来てもよいが、できれば次は“わかる側”で会議に参加するんじゃぞ。",
  "知らない言葉が減るたびに、おぬしの知力ゲージは上がっとる。たぶん。",
  "毎回ワシを呼び出しておるが、そのうち自力で理解してくれんかのぉ。",
  "今日も知らん単語まみれじゃったな。会議って大変じゃのぉ。",
  "“なんとなく頷く力”だけでは、社会は渡れんのじゃ。",
  "次回はチップを押す回数が半分くらいになるとよいのぉ。",
  "ワシが暇になるくらい賢くなってくれると嬉しいんじゃが。",
  "そのうち“知ったかくん”ではなく“わかってるくん”になれるとええな。",
  "会議中に“それ知ってます”と言える日は…まあ、来るじゃろ。",
  "今日はずいぶん助けてしもうたのぉ。請求書は送らんから安心せい。",
  "知らないことを押せるのは才能じゃ。押しすぎな気もするがの。",
  "おぬしの学習速度、ワシはちゃんと見とるぞ。たまにじゃが。",
  "また来るのは構わんが、少しは予習もしてくるんじゃぞ。",
  "知ったかで乗り切れん単語だけ、ちゃんと押しておるな？ ワシには分かるぞ。"
];

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

  menuToggleBtn?.addEventListener("click", () => {
    setDrawerOpen(!state.drawerOpen);
  });
  menuBackdrop?.addEventListener("click", () => {
    setDrawerOpen(false);
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
  if (speechKeyInput) speechKeyInput.value = state.voice.speechKey || "";
  if (speechRegionInput) speechRegionInput.value = state.voice.speechRegion || "";
  if (voiceProviderSelect) voiceProviderSelect.value = state.voice.provider || "webspeech";
  if (voiceSourceSelect) voiceSourceSelect.value = state.voice.source || "mic";
  streamList.classList.add("is-empty");
  if (minutesZone) minutesZone.classList.add("hidden");
  if (notesCard) notesCard.classList.add("hidden");
  if (hakaseCard) hakaseCard.classList.add("hidden");

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
  graphTabBtn?.addEventListener("click", () => {
    setIngestMode("graph_mock");
  });
  voiceTabBtn?.addEventListener("click", () => {
    setIngestMode("voice");
  });
  graphResolveBtn?.addEventListener("click", async () => {
    await runGraphMockRoute();
  });
  voiceStartBtn?.addEventListener("click", async () => {
    await startVoiceInput();
  });
  voiceStopBtn?.addEventListener("click", () => {
    stopVoiceInput("停止しました。");
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
    if (speechKeyInput) {
      state.voice.speechKey = String(speechKeyInput.value || "").trim();
      safeSessionSet(SPEECH_KEY_STORAGE_KEY, state.voice.speechKey);
    }
    if (speechRegionInput) {
      state.voice.speechRegion = String(speechRegionInput.value || "").trim();
      safeStorageSet(SPEECH_REGION_STORAGE_KEY, state.voice.speechRegion);
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

  updateModeView();
  renderDictionaryDispatcherSummary();
  updateDebugVisibility();
  setDrawerOpen(false);
  renderProfileSummary();
  renderClickList();
  renderSavedSupplements();
  renderDebugCard();
  updateStreamMeta(0, 0);
  setVoiceStatus("待機中");
  renderHakaseComment();
  setRunStatus("準備完了。");
  setIngestMode("sample");
  void loadSample(SAMPLE_FILES[0].file).catch((error) => {
    debugError("app", "initial sample load failed", { error: String(error) });
    setRunStatus(`初期サンプルの読み込みに失敗: ${String(error)}`);
  });
}

function setIngestMode(mode) {
  const sampleMode = mode === "sample";
  const graphMode = mode === "graph_mock";
  const voiceMode = mode === "voice";
  sampleIngestPane?.classList.toggle("hidden", !sampleMode);
  graphIngestPane?.classList.toggle("hidden", !graphMode);
  voiceIngestPane?.classList.toggle("hidden", !voiceMode);
  sampleTabBtn?.classList.toggle("active", sampleMode);
  graphTabBtn?.classList.toggle("active", graphMode);
  voiceTabBtn?.classList.toggle("active", voiceMode);
  playbackControls?.classList.toggle("hidden", voiceMode);
  voiceStatus?.classList.toggle("hidden", !voiceMode);
}

async function runGraphMockRoute() {
  const raw = String(meetingInput?.value ?? "").trim();
  if (!raw) {
    setRunStatus("meeting URL / meetingId を入力してください。");
    return;
  }
  if (graphResolveBtn) graphResolveBtn.disabled = true;
  try {
    const steps = [
      "1. ユーザー入力を受領",
      "2. Graph APIでonlineMeeting解決 (mock)",
      "3. transcripts一覧取得 (mock)",
      "4. transcript content取得 (mock)",
      "5. VTT/text を TranscriptLine[] に変換 (mock)",
      "6. SessionStoreへ流し込み (既存再生導線)"
    ];
    for (const step of steps) {
      if (graphRouteStatus) graphRouteStatus.textContent = step;
      setRunStatus(`Graph導線(Mock): ${step}`);
      await sleep(240);
    }

    const lines = buildMockTranscriptLines(raw);
    applyTranscriptLinesToSession(lines, raw);
    if (graphRouteStatus) graphRouteStatus.textContent = `完了: ${lines.length}行を読み込みました`;
    setRunStatus("Graph導線(Mock)完了。開始ボタンで再生できます。");
  } finally {
    if (graphResolveBtn) graphResolveBtn.disabled = false;
  }
}

function buildMockTranscriptLines(sourceTag) {
  const seed = sanitizeFileSegment(sourceTag).slice(0, 12) || "graph";
  return [
    { speaker: "田中", text: `meetingId(${seed}) の transcript を取り込めるか確認します。` },
    { speaker: "佐藤", text: "onlineMeeting を解決して transcript 一覧を引く流れでいきます。" },
    { speaker: "高橋", text: "VTT を TranscriptLine[] に正規化して既存 SessionStore に流し込みます。" },
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
    id: `graph-mock-${Date.now()}`,
    source: "graph_mock",
    title: `Graph Mock: ${sourceTag}`,
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

  const path = `../doc/samples/scripted-demo/${fileName}`;
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
  startBtn.textContent = "開始";
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
    state.playback.paused = false;
    pauseBtn.textContent = "一時停止";
    setRunStatus("演出デモの再生を再開しました。");
    return;
  }

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
  pauseBtn.textContent = "一時停止";

  setRunStatus("演出デモ再生を開始。Live APIで用語抽出中...");
  await runScriptedLoop(state.playback.token);
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
    const speechKey = String(speechKeyInput?.value || state.voice.speechKey || "").trim();
    const speechRegion = String(speechRegionInput?.value || state.voice.speechRegion || "").trim();
    if (speechKey) {
      state.voice.speechKey = speechKey;
      safeSessionSet(SPEECH_KEY_STORAGE_KEY, speechKey);
    }
    if (speechRegion) {
      state.voice.speechRegion = speechRegion;
      safeStorageSet(SPEECH_REGION_STORAGE_KEY, speechRegion);
    }
    await transcriptAdapter.start({
      provider: state.voice.provider,
      source: state.voice.source,
      tabStream: state.voice.stream,
      speechKey,
      speechRegion,
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
  state.playback.running = true;
  state.playback.paused = false;
  state.lastExtractAtMs = 0;
  state.lastAiExtractAtMs = 0;
  state.extractInFlight = false;
  state.lastExtractTextLength = 0;
  state.processedLines = 0;
  state.totalLines = 0;
  updateStreamMeta(0, 0);
  pauseBtn.disabled = true;
}

function stopVoiceInput(statusText = "停止しました。") {
  const hadVoiceSession = Boolean(transcriptAdapter.isRunning() || state.voice.stream || state.voice.running);
  state.voice.running = false;
  transcriptAdapter.stop();
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

// AI enrichment at most every 12 seconds; dictionary-only on every other call.
const AI_EXTRACT_MIN_INTERVAL_MS = 12000;

async function runExtractTermsForCurrentMeeting(contextId) {
  if (!state.liveMeetingText) {
    return;
  }
  if (contextId !== state.contextId) {
    return;
  }
  if (state.extractInFlight) {
    return;
  }

  try {
    state.extractInFlight = true;
    state.lastExtractAtMs = Date.now();
    state.lastExtractTextLength = state.liveMeetingText.length;

    // Phase 1 – dictionary-only (fast). Shows chips without waiting for AI.
    const fastPayload = { ...buildExtractRequestPayload(state.liveMeetingText), skipAi: true };
    const fastResponse = await postJson(`${state.apiBase}/extractTerms`, fastPayload);
    if (contextId !== state.contextId) {
      debugLog("api", "extractTerms fast ignored stale context", { contextId, current: state.contextId });
      return;
    }
    const fastParsed = parseExtractPayload(fastResponse);
    if (fastParsed.terms.length > 0) {
      mergeExtractedTerms(fastParsed.terms);
      renderTermChips();
      extractSource.textContent = String(fastResponse?.source ?? "-");
      debugLog("api", "extractTerms fast response", { termCount: fastParsed.terms.length });
    }

    // Phase 2 – full AI extract (rate-limited). Enriches with AI-detected unknown terms.
    const timeSinceAiMs = Date.now() - state.lastAiExtractAtMs;
    if (timeSinceAiMs < AI_EXTRACT_MIN_INTERVAL_MS) {
      if (fastParsed.terms.length === 0) {
        setRunStatus("抽出完了: 用語検出なし");
      } else {
        setRunStatus(`辞書抽出成功: ${fastParsed.terms.length}件`);
      }
      return;
    }

    const fullResponse = await postJson(`${state.apiBase}/extractTerms`, buildExtractRequestPayload(state.liveMeetingText));
    if (contextId !== state.contextId) {
      debugLog("api", "extractTerms full ignored stale context", { contextId, current: state.contextId });
      return;
    }
    const parsed = parseExtractPayload(fullResponse);
    const terms = parsed.terms.map((x) => x.term);
    mergeExtractedTerms(parsed.terms);
    state.liveDebug.dictionary = parsed.dictionary;
    state.liveDebug.dispatcherPolicy = parsed.dispatcherPolicy;
    state.liveDebug.extractSource = parsed.source;
    state.liveDebug.dictionaryMode = parsed.dictionaryMode;
    state.liveDebug.dictionaryProfile = parsed.dictionaryProfile;
    state.liveDebug.dispatcherBypassed = parsed.dispatcherBypassed;
    state.liveDebug.routes = buildRoutesFromExtract(parsed.terms, parsed.source);
    state.lastAiExtractAtMs = Date.now();
    renderDebugCard();
    renderDictionaryDispatcherSummary();

    debugLog("api", "extractTerms full response", {
      source: fullResponse?.source ?? "-",
      termCount: terms.length,
    });

    if (terms.length === 0) {
      notesOutput.textContent = "API応答で用語が検出されませんでした。";
      extractSource.textContent = String(fullResponse?.source ?? "-");
      setRunStatus("抽出完了: 用語検出なし");
      return;
    }

    renderTermChips();
    extractSource.textContent = String(fullResponse?.source ?? "-");
    notesOutput.textContent = "Live APIで用語抽出しました。用語を選ぶと説明を取得します。";
    setRunStatus(`抽出成功: source=${extractSource.textContent}`);
  } catch (error) {
    debugError("api", "extractTerms failed", { error: String(error) });
    notesOutput.textContent = `Live APIエラー: ${String(error)}`;
    setRunStatus(`抽出失敗: ${String(error)}`);
  } finally {
    state.extractInFlight = false;
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
  pauseBtn.textContent = state.playback.paused ? "再開" : "一時停止";
  setRunStatus(state.playback.paused ? "再生を一時停止しました。" : "再生を再開しました。");
}

function getCurrentMeetingTextForApi() {
  if (!state.demoData || !Array.isArray(state.demoData.events)) return "";
  const lines = state.demoData.events.filter((e) => e.type === "line");
  return lines.map((x) => `${x.speaker}: ${x.text}`).join("\n");
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
  const line = document.createElement("article");
  line.className = "stream-line";

  const speaker = document.createElement("p");
  speaker.className = "stream-speaker";
  speaker.textContent = event.speaker;

  const text = document.createElement("p");
  text.className = "stream-text";
  text.dataset.rawText = event.text;
  text.innerHTML = highlightText(event.text, state.terms);

  line.append(speaker, text);
  streamList.append(line);
  streamList.scrollTop = streamList.scrollHeight;

  const asText = `${event.speaker}: ${event.text}`;
  state.liveMeetingText = state.liveMeetingText ? `${state.liveMeetingText}\n${asText}` : asText;

  state.processedLines += 1;
  updateStreamMeta(state.processedLines, state.totalLines || state.processedLines);
  upsertSynchronousTermsFromLine(event);
  refreshStreamHighlights();
  scheduleExtractRefresh("line_appended");
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
  for (const term of immediateTerms) {
    const resolvedLabel = resolveDisplayTermLabel(term, null);
    const existing = findMergeTargetTerm(resolvedLabel, null);
    if (existing) {
      state.terms = state.terms.filter((x) => x !== existing);
    }
    state.terms.unshift(resolvedLabel);
    if (!state.termMeta[resolvedLabel]) {
      state.termMeta[resolvedLabel] = {
        term: resolvedLabel,
        summary: `${term} の説明を取得中です。`,
        source: "stream_sync_loading",
      };
    }
  }
  reorderTermsByRecentContext();
  renderTermChips();
}

function scheduleExtractRefresh(reason = "unspecified") {
  if (!state.playback.running) return;
  if (!state.liveMeetingText) return;
  if (state.contextId <= 0) return;

  if (state.extractDebounceTimer) {
    clearTimeout(state.extractDebounceTimer);
    state.extractDebounceTimer = null;
  }

  const minIntervalMs = 650;
  const debounceMs = 320;
  const now = Date.now();
  const wait = Math.max(debounceMs, minIntervalMs - (now - state.lastExtractAtMs));
  const contextId = state.contextId;

  state.extractDebounceTimer = setTimeout(() => {
    state.extractDebounceTimer = null;
    if (contextId !== state.contextId) return;
    if (!state.playback.running) return;
    if (!state.liveMeetingText) return;
    if (state.liveMeetingText.length <= state.lastExtractTextLength) return;
    debugLog("api", "scheduleExtractRefresh firing", {
      reason,
      textLength: state.liveMeetingText.length,
      processedLines: state.processedLines
    });
    void runExtractTermsForCurrentMeeting(contextId);
  }, wait);
}

function upsertTermChip(term) {
  state.terms = state.terms.filter((t) => t !== term);
  state.terms.unshift(term);
  if (!state.termMeta[term]) {
    state.termMeta[term] = {
      term,
      summary: "演出デモ上の抽出候補",
      reasons: ["scripted"]
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
    chip.className = `term-chip${state.activeTerm === term ? " active" : ""}`;
    chip.textContent = term;
    chip.title = getTermHelpMessage(term);
    chip.addEventListener("click", () => {
      state.activeTerm = term;
      renderTermChips();
      void renderTermDetail();
    });
    termChips.append(chip);
  }
}

function mergeExtractedTerms(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  for (const row of rows) {
    if (!row || typeof row.term !== "string") continue;
    const term = row.term.trim();
    if (!term) continue;

    const resolvedLabel = resolveDisplayTermLabel(term, row);
    const existing = findMergeTargetTerm(resolvedLabel, row);

    // 最新検出を先頭に寄せる。
    if (existing) {
      state.terms = state.terms.filter((x) => x !== existing);
      if (state.termMeta[existing] && existing !== resolvedLabel) {
        delete state.termMeta[existing];
      }
    }
    state.terms.unshift(resolvedLabel);
    state.termMeta[resolvedLabel] = { ...row, term: resolvedLabel };
  }
  reorderTermsByRecentContext();
  refreshStreamHighlights();
}

function canonicalTermKey(term) {
  return String(term || "").trim().toLowerCase();
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
  const key = canonicalTermKey(term);
  if (key !== "poc") return term;
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
  const text = String(state.liveMeetingText || "").toLowerCase();
  if (!text) return;

  const scored = state.terms.map((term, idx) => {
    const probe = termSearchToken(term);
    const pos = text.lastIndexOf(probe);
    return { term, pos, idx };
  });

  scored.sort((a, b) => {
    // 直近で出現した用語を先頭へ。未出現(-1)は後ろへ。
    if (a.pos !== b.pos) return b.pos - a.pos;
    // 同率時は既存順を維持。
    return a.idx - b.idx;
  });

  state.terms = scored.map((x) => x.term);
}

function termSearchToken(term) {
  const raw = String(term || "").toLowerCase();
  if (raw.startsWith("poc")) return "poc";
  const compact = raw.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return compact || raw;
}

function getTermHelpMessage(term) {
  const meta = state.termMeta?.[term];
  if (meta) {
    const summary = meta.summary && String(meta.summary).trim() ? String(meta.summary).trim() : "";
    if (!debug.enabled) {
      return summary || `${term} の説明を表示します。`;
    }
    const parts = [];
    if (summary) parts.push(summary);
    if (meta.origin) parts.push(`origin=${meta.origin}`);
    if (meta.source) parts.push(`source=${meta.source}`);
    if (meta.profile) parts.push(`profile=${meta.profile}`);
    if (typeof meta.confidence === "number") parts.push(`confidence=${meta.confidence}`);
    if (parts.length > 0) return parts.join(" | ");
  }

  const route = state.liveDebug?.routes?.[term]?.extract;
  if (route?.category) {
    return `${term} は「${route.category}」カテゴリの候補です。`;
  }

  return `${term} の説明を表示します。`;
}

function normalizeExplainResponse(term, response) {
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

  let brief = rawBrief;
  let contextHint = rawContextHint;

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
      : [
          `${term}は先に基準だけ軽く揃えておくと、後で迷いにくいですね。`,
          `${term}の扱いって、現時点ではどこまで合意できていましたっけ？`,
        ];

  return {
    brief,
    contextHint,
    unknownDetail,
    smallTalkExamples,
    source: String(response?.source ?? "-"),
  };
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
      strictAi: true,
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
    debugError("api", "unknown assist failed", { term, error: String(error) });
    setUnknownExplainVisible(true, "補足説明のAI生成に失敗しました。もう一度お試しください。");
    renderSmallTalkExamples([]);
    setRunStatus(`補足説明のAI生成に失敗: ${String(error)}`);
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
    unknownExplainText.textContent = text || "補足説明はまだありません。";
    return;
  }
  unknownAiSummaryText.textContent = "知らないボタンを押下するとAIが要約した説明が表示されます。";
  unknownExplainText.textContent = "知らないボタンを押下するとAIが要約した説明が表示されます。";
}

function renderSmallTalkExamples(examples = []) {
  renderSmallTalkExamplesCore(smallTalkList, examples);
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
  const summary = state.liveDetails?.[term]?.brief;
  if (detail && String(detail).trim()) {
    if (unknownAiSummaryText) {
      unknownAiSummaryText.textContent = summary && String(summary).trim() ? String(summary).trim() : "要約はまだありません。";
    }
    setUnknownExplainVisible(true, String(detail).trim());
    renderSmallTalkExamples(state.liveDetails?.[term]?.smallTalkExamples || []);
    return;
  }

  const seedSummary = state.termMeta?.[term]?.summary || `${term} は会議内で重要語として扱われています。`;
  const hint = state.liveDetails?.[term]?.contextHint || `この会議では「${term}」の意味合わせが論点です。`;
  const fallback = `${seedSummary}\n\n${hint}`;
  if (unknownAiSummaryText) {
    unknownAiSummaryText.textContent = summary && String(summary).trim() ? String(summary).trim() : "要約はまだありません。";
  }
  setUnknownExplainVisible(true, fallback);
  renderSmallTalkExamples(state.liveDetails?.[term]?.smallTalkExamples || []);
}

async function renderTermDetail() {
  if (!state.activeTerm || !state.demoData) {
    termTitle.textContent = "用語未選択";
    termDetail.textContent = "用語チップを押すと説明を表示します。";
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

  debugLog("api", "renderTermDetail unified mode", { term: state.activeTerm });
  const cached = state.liveDetails[state.activeTerm];
  if (cached) {
    debugLog("api", "renderTermDetail cache hit", { term: state.activeTerm });
    termDetail.textContent = cached.brief;
    if (termContextHint) {
      termContextHint.textContent = cached.contextHint || "";
    }
    explainSource.textContent = cached.source;
    renderUnknownExplainForActiveTerm();
    return;
  }

  termDetail.textContent = "説明を取得しています...";
  if (termContextHint) {
    termContextHint.textContent = "";
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
    termDetail.textContent = normalized.brief;
    if (termContextHint) {
      termContextHint.textContent = normalized.contextHint;
    }
    explainSource.textContent = normalized.source;
    renderUnknownExplainForActiveTerm();
    setRunStatus(`説明取得成功: source=${normalized.source}`);
  } catch (error) {
    debugError("api", "explainTerm failed", { term: state.activeTerm, error: String(error) });
    termDetail.textContent = `説明取得エラー: ${String(error)}`;
    if (termContextHint) {
      termContextHint.textContent = "";
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

async function generateNotes(options = {}) {
  if (!state.demoData) {
    debugWarn("notes", "generateNotes skipped: no demoData");
    return;
  }

  const meetingText = state.liveMeetingText || getCurrentMeetingTextForApi();
  const lines = meetingText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length === 0) {
    notesOutput.textContent = "会議ログがありません。";
    notesSource.textContent = "-";
    return;
  }

  const compact = options?.compact === true;
  const meetingSource = compact ? buildNotesCompactInput(meetingText) : buildMinutesMarkdown(meetingText);
  const payload = { meetingText: meetingSource };
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
  const meetingText = state.liveMeetingText || getCurrentMeetingTextForApi();
  if (!meetingText) {
    setRunStatus("議事録を作成する会議ログがありません。");
    return;
  }
  const payload = { meetingText: buildMinutesMarkdown(meetingText) };
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
  if (state.extractDebounceTimer) {
    clearTimeout(state.extractDebounceTimer);
    state.extractDebounceTimer = null;
  }
  state.contextId += 1;
  state.terms = [];
  state.termMeta = {};
  state.activeTerm = null;
  state.clickLog = [];
  state.expandedUnknownByTerm = {};
  state.liveMeetingText = "";
  state.liveDetails = {};
  state.lastExtractAtMs = 0;
  state.lastAiExtractAtMs = 0;
  state.extractInFlight = false;
  state.lastExtractTextLength = 0;
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

  extractSource.textContent = "-";
  explainSource.textContent = "-";
  notesSource.textContent = "-";

  renderTermDetail();
  renderClickList();
  notesOutput.textContent = "まだ生成していません。";
  state.generatedNotes = "";
  state.generatedMinutes = "";
  state.generatedSupplement = "";
  if (minutesZone) minutesZone.classList.add("hidden");
  if (notesCard) notesCard.classList.add("hidden");
  if (hakaseCard) hakaseCard.classList.add("hidden");
  if (notesLoading) notesLoading.classList.add("hidden");
  if (minutesLoading) minutesLoading.classList.add("hidden");
  if (minutesBtn) minutesBtn.disabled = false;
  if (minutesCard) minutesCard.classList.add("hidden");
  if (minutesOutput) minutesOutput.textContent = "議事録はまだ作成されていません。";
  if (supplementCard) supplementCard.classList.add("hidden");
  if (supplementOutput) supplementOutput.textContent = "補足説明はまだ作成されていません。";
  setUnknownExplainVisible(false);
  updateStreamMeta(0, state.totalLines);
  pauseBtn.textContent = "一時停止";
  renderDebugCard();
  renderDictionaryDispatcherSummary();
}

function renderHakaseComment() {
  if (!hakaseComment) return;
  const idx = Math.floor(Math.random() * HAKASE_COMMENTS.length);
  hakaseComment.textContent = HAKASE_COMMENTS[idx];
}

function renderDictionaryDispatcherSummary() {
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
    dispatcherRateInfo.textContent = `ディスパッチャ選定率: ${selected}/${total} (${pct}%)`;
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
  const requestPayload = JSON.stringify(body);
  debugLog("network", "request start", {
    requestId,
    url,
    method: "POST",
    bodyPreview: shortText(requestPayload, 200),
  });

  let response;
  try {
    const headers = {
      "content-type": "application/json",
    };
    if (state.functionKey) {
      headers["x-functions-key"] = state.functionKey;
    }
    response = await fetch(url, {
      method: "POST",
      headers,
      body: requestPayload,
    });
  } catch (error) {
    const message = resolveFetchFailureMessage(url, error);
    debugError("network", "request transport failed", { requestId, url, error: String(error) });
    throw new Error(message);
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
        textPreview: shortText(text, 260),
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
    payloadPreview: shortText(data, 260),
  });

  if (!response.ok) {
    const msg = data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
    const branch = classifyHttpError(response.status);
    debugWarn("network", "http error response", {
      requestId,
      status: response.status,
      branch,
      message: msg,
      payloadPreview: shortText(data, 260),
    });
    throw new Error(`[${branch}] ${msg}`);
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

function loadProfile() {
  try {
    const raw = safeStorageGet(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfile(profile) {
  safeStorageSet(STORAGE_KEY, JSON.stringify(profile));
}

function loadSupplements() {
  try {
    const raw = safeStorageGet(SUPPLEMENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        fileName: typeof x.fileName === "string" ? x.fileName : `supplement-${Date.now()}.md`,
        content: typeof x.content === "string" ? x.content : "",
        createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date().toISOString()
      }))
      .slice(-20);
  } catch {
    return [];
  }
}

function saveSupplements(items) {
  safeStorageSet(SUPPLEMENT_STORAGE_KEY, JSON.stringify(items.slice(-20)));
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
  const raw = safeStorageGet(API_STORAGE_KEY);
  return sanitizeApiBase(raw) || DEFAULT_API_BASE;
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

function loadSpeechKey() {
  const raw = safeSessionGet(SPEECH_KEY_STORAGE_KEY) ?? safeStorageGet(SPEECH_KEY_STORAGE_KEY);
  if (raw) {
    // Legacy migration: old localStorage key is moved to session-only.
    safeSessionSet(SPEECH_KEY_STORAGE_KEY, raw);
    safeStorageRemove(SPEECH_KEY_STORAGE_KEY);
  }
  return typeof raw === "string" ? raw.trim() : "";
}

function loadSpeechRegion() {
  const raw = safeStorageGet(SPEECH_REGION_STORAGE_KEY);
  return typeof raw === "string" ? raw.trim() : "";
}

function loadSpeechProvider() {
  const raw = safeStorageGet(SPEECH_PROVIDER_STORAGE_KEY);
  if (raw === "azure" || raw === "webspeech") return raw;
  return "webspeech";
}

function sanitizeApiBase(value) {
  if (!value || typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  const isLocalHost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  const isLocalApp =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocalHost) return "";
  if (!isLocalApp && parsed.protocol !== "https:") return "";
  if (!/^https?:$/i.test(parsed.protocol)) return "";
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
}

function safeStorageGet(key) {
  try {
    const value = localStorage.getItem(key);
    debugLog("storage", "storage get", { key, hasValue: value !== null });
    return value;
  } catch {
    debugWarn("storage", "storage get failed", { key });
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    debugLog("storage", "storage set", { key, valuePreview: maskSensitiveStorageValue(key, value) });
    return true;
  } catch {
    debugWarn("storage", "storage set failed", { key });
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    debugLog("storage", "storage remove", { key });
    return true;
  } catch {
    debugWarn("storage", "storage remove failed", { key });
    return false;
  }
}

function safeSessionGet(key) {
  try {
    const value = sessionStorage.getItem(key);
    debugLog("storage", "session get", { key, hasValue: value !== null });
    return value;
  } catch {
    debugWarn("storage", "session get failed", { key });
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
    debugLog("storage", "session set", { key, valuePreview: maskSensitiveStorageValue(key, value) });
    return true;
  } catch {
    debugWarn("storage", "session set failed", { key });
    return false;
  }
}

function maskSensitiveStorageValue(key, value) {
  if (!SENSITIVE_STORAGE_KEYS.has(key)) return shortText(value, 80);
  const raw = String(value ?? "");
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}
