type SpeechRecognitionResultLike = {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: { transcript: string } | undefined;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike | undefined;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type VoiceCommandController = {
  stop: () => void;
};

export function startVoiceCommand(options: {
  onTranscript: (transcript: string) => void;
  onStart: () => void;
  onEnd: () => void;
  onUnsupported: () => void;
}) {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as SpeechWindow;
  const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  if (!Recognition) {
    options.onUnsupported();
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    const cleanTranscript = `${finalTranscript} ${interimTranscript}`.trim();
    if (cleanTranscript) options.onTranscript(cleanTranscript);
  };
  recognition.onerror = options.onEnd;
  recognition.onend = options.onEnd;

  try {
    recognition.start();
    options.onStart();
  } catch {
    options.onEnd();
    return null;
  }

  return {
    stop: () => recognition.stop(),
  } satisfies VoiceCommandController;
}
