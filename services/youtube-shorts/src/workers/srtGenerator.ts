import type { WhisperSegment } from 'whisper-node';

/**
 * Formats a time value in seconds to SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const secs = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mins = totalMin % 60;
  const hours = Math.floor(totalMin / 60);

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Generates SRT caption content from Whisper segments scoped to a clip's time range.
 * Filters segments that fall within [startSeconds, endSeconds], adjusts timestamps
 * relative to the clip start, and formats as SRT (req 6.1, 6.2, 6.4).
 *
 * @param transcript - Full array of WhisperSegment from transcription
 * @param startSeconds - Clip start time in the source video
 * @param endSeconds - Clip end time in the source video
 * @returns SRT-formatted string, or empty string if no segments fall in range
 */
export function generateSrt(
  transcript: WhisperSegment[],
  startSeconds: number,
  endSeconds: number,
): string {
  // Filter segments that fall within the clip's time range (req 6.1)
  const clippedSegments = transcript.filter(
    (seg) => seg.start >= startSeconds && seg.end <= endSeconds,
  );

  if (clippedSegments.length === 0) {
    return '';
  }

  const entries: string[] = [];

  for (let i = 0; i < clippedSegments.length; i++) {
    const seg = clippedSegments[i];
    // Adjust timestamps relative to clip start (req 6.1)
    const adjustedStart = seg.start - startSeconds;
    const adjustedEnd = seg.end - startSeconds;

    const index = i + 1;
    const startTime = formatSrtTime(adjustedStart);
    const endTime = formatSrtTime(adjustedEnd);
    // Use segment.speech as caption text — no added or removed words (req 6.4)
    const text = seg.speech;

    entries.push(`${index}\n${startTime} --> ${endTime}\n${text}`);
  }

  return entries.join('\n\n');
}
