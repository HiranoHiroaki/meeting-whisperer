export function createTranscriptAdapter() {
  let webRecognition = null;
  let restartTimer = null;
  let running = false;
  let googleSession = null;

  const GOOGLE_SEGMENT_MS = 5000;
  const GOOGLE_MIN_BLOB_BYTES = 1200;

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function stop() {
    running = false;
    clearRestartTimer();
    if (webRecognition) {
      try {
        webRecognition.onresult = null;
        webRecognition.onerror = null;
        webRecognition.onend = null;
        webRecognition.stop();
      } catch {
        // noop
      }
      webRecognition = null;
    }
    if (googleSession) {
      const session = googleSession;
      googleSession = null;
      try {
        if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
      } catch {
        // noop
      }
      if (session.ownedStream) {
        for (const track of session.ownedStream.getTracks()) track.stop();
      }
      if (session.segmentTimer) clearTimeout(session.segmentTimer);
    }
  }

  async function acquireTabStream() {
    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  }

  function pickRecorderMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    for (const candidate of candidates) {
      if (window.MediaRecorder?.isTypeSupported?.(candidate)) return candidate;
    }
    return "";
  }

  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // Google Cloud Speech-to-Text route: record short standalone segments
  // (MediaRecorder restarted per segment so every blob has a full container
  // header) and relay them through /api/transcribeAudio. Keyless on the
  // browser side — auth lives on the server (ADC).
  async function startGoogleSpeech({ source, tabStream, transcribe, onStatus, onFinal, onError, onStarted }) {
    if (!window.MediaRecorder) throw new Error("このブラウザはMediaRecorderに未対応です。");
    if (typeof transcribe !== "function") throw new Error("transcribe callback が設定されていません。");
    const mimeType = pickRecorderMimeType();
    if (!mimeType) throw new Error("opus録音に対応したブラウザが必要です。");

    let mediaStream;
    let ownedStream = null;
    if (source === "tab" && tabStream && tabStream.getAudioTracks().length > 0) {
      mediaStream = new MediaStream([tabStream.getAudioTracks()[0]]);
    } else {
      ownedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream = ownedStream;
      if (source === "tab") onStatus?.("タブ音声を取得できないためマイク入力に切替しました。");
    }

    const session = { recorder: null, ownedStream, segmentTimer: null };
    googleSession = session;
    running = true;

    const recordSegment = () => {
      if (!running || googleSession !== session) return;
      let recorder;
      try {
        recorder = new MediaRecorder(mediaStream, { mimeType, audioBitsPerSecond: 32000 });
      } catch (error) {
        onError?.(`録音を開始できませんでした: ${String(error)}`);
        return;
      }
      session.recorder = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        // Fire the next segment immediately so recording stays continuous
        // while the previous segment is being transcribed.
        recordSegment();
        if (blob.size < GOOGLE_MIN_BLOB_BYTES) return;
        void (async () => {
          try {
            const base64 = await blobToBase64(blob);
            const text = await transcribe(base64, mimeType);
            if (!running || googleSession !== session) return;
            const trimmed = String(text ?? "").trim();
            if (trimmed) onFinal?.(trimmed);
          } catch (error) {
            if (!running || googleSession !== session) return;
            // A failed segment should not kill the session; report and keep going.
            onStatus?.(`文字起こし失敗(継続中): ${String(error).slice(0, 120)}`);
          }
        })();
      };
      recorder.onerror = (event) => {
        onError?.(`録音エラー: ${String(event?.error ?? "unknown")}`);
      };
      try {
        recorder.start();
      } catch (error) {
        onError?.(`録音を開始できませんでした: ${String(error)}`);
        return;
      }
      session.segmentTimer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, GOOGLE_SEGMENT_MS);
    };

    recordSegment();
    onStarted?.("実行中: Google Cloud Speech-to-Text (約5秒ごとに確定)");
  }

  async function start({
    provider,
    source,
    tabStream,
    transcribe,
    onStatus,
    onFinal,
    onInterim,
    onError,
    onStarted,
  }) {
    stop();
    if (provider === "google") {
      await startGoogleSpeech({ source, tabStream, transcribe, onStatus, onFinal, onError, onStarted });
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) throw new Error("このブラウザは音声認識APIに未対応です。");

    webRecognition = new SpeechRecognitionCtor();
    webRecognition.lang = "ja-JP";
    webRecognition.continuous = true;
    webRecognition.interimResults = true;
    webRecognition.maxAlternatives = 1;
    running = true;

    webRecognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += text;
        else interimTranscript += text;
      }
      if (interimTranscript.trim()) onInterim?.(interimTranscript.trim());
      if (finalTranscript.trim()) onFinal?.(finalTranscript.trim());
    };
    webRecognition.onerror = (event) => {
      const detail = event?.error ? `(${event.error})` : "";
      onError?.(`音声認識エラー ${detail}`.trim());
    };
    webRecognition.onend = () => {
      if (!running) return;
      clearRestartTimer();
      restartTimer = setTimeout(() => {
        if (!running || !webRecognition) return;
        try {
          webRecognition.start();
        } catch {
          onError?.("音声認識を再開できませんでした。");
        }
      }, 280);
    };

    if (source === "tab" && tabStream && tabStream.getAudioTracks().length > 0) {
      webRecognition.start(tabStream.getAudioTracks()[0]);
    } else {
      webRecognition.start();
    }
    onStarted?.(source === "tab" ? "実行中: タブ音声文字起こし (非対応環境では既定マイク)" : "実行中: マイク文字起こし");
  }

  return {
    start,
    stop,
    acquireTabStream,
    isRunning: () => running,
  };
}
