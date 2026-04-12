declare module 'whisper-node' {
  export interface WhisperWord {
    word: string;
    start: number;
    end: number;
  }

  export interface WhisperSegment {
    start: number;
    end: number;
    speech: string;
    words?: WhisperWord[];
  }

  export interface WhisperOptions {
    word_timestamps?: boolean;
    model?: string;
    language?: string;
  }

  export function whisper(
    filePath: string,
    options?: WhisperOptions,
  ): Promise<WhisperSegment[]>;
}
