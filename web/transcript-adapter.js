export function createTranscriptAdapter() {
  let webRecognition = null;
  let azureRecognizer = null;
  let restartTimer = null;
  let running = false;

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
    if (azureRecognizer) {
      try {
        azureRecognizer.stopContinuousRecognitionAsync(
          () => azureRecognizer?.close(),
          () => azureRecognizer?.close()
        );
      } catch {
        // noop
      }
      azureRecognizer = null;
    }
  }

  async function acquireTabStream() {
    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  }

  async function start({
    provider,
    source,
    tabStream,
    speechKey,
    speechRegion,
    onStatus,
    onFinal,
    onInterim,
    onError,
    onStarted,
  }) {
    stop();
    if (provider === "azure") {
      const sdk = window.SpeechSDK;
      if (!sdk) throw new Error("Azure Speech SDKが見つかりません。");
      if (!speechKey || !speechRegion) throw new Error("Speech Key / Region を設定してください。");

      const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
      speechConfig.speechRecognitionLanguage = "ja-JP";

      let audioConfig;
      if (source === "tab" && tabStream && tabStream.getAudioTracks().length > 0) {
        try {
          audioConfig = sdk.AudioConfig.fromStreamInput(tabStream);
        } catch {
          audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
          onStatus?.("タブ音声は未対応のためマイク入力に切替しました。");
        }
      } else {
        audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      }

      azureRecognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      running = true;
      azureRecognizer.recognizing = (_sender, event) => {
        const text = String(event?.result?.text || "").trim();
        if (text) onInterim?.(text);
      };
      azureRecognizer.recognized = (_sender, event) => {
        const text = String(event?.result?.text || "").trim();
        if (text) onFinal?.(text);
      };
      azureRecognizer.canceled = (_sender, event) => {
        const detail = event?.errorDetails ? ` ${event.errorDetails}` : "";
        onError?.(`Azure Speechエラー:${detail}`.trim());
      };
      azureRecognizer.sessionStopped = () => {
        if (running) onError?.("Azure Speechセッションが終了しました。");
      };

      await new Promise((resolve, reject) => {
        azureRecognizer.startContinuousRecognitionAsync(resolve, reject);
      });
      onStarted?.("実行中: Azure AI Speech");
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
