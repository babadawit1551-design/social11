import { describe, it, expect } from 'vitest';
import { generateSrt } from './srtGenerator';
import type { WhisperSegment } from 'whisper-node';

describe('generateSrt', () => {
  const transcript: WhisperSegment[] = [
    { start: 0, end: 2.5, speech: 'Hello world' },
    { start: 2.5, end: 5.0, speech: 'This is a test' },
    { start: 5.0, end: 8.0, speech: 'Another segment' },
    { start: 10.0, end: 13.0, speech: 'Outside clip range' },
  ];

  it('filters segments to clip time range', () => {
    const srt = generateSrt(transcript, 0, 8.0);
    expect(srt).toContain('Hello world');
    expect(srt).toContain('This is a test');
    expect(srt).toContain('Another segment');
    expect(srt).not.toContain('Outside clip range');
  });

  it('adjusts timestamps relative to clip start', () => {
    // Clip starts at 5.0s — "Another segment" (5.0–8.0) should become 0.0–3.0
    const srt = generateSrt(transcript, 5.0, 8.0);
    expect(srt).toContain('00:00:00,000 --> 00:00:03,000');
    expect(srt).toContain('Another segment');
  });

  it('returns empty string when no segments fall in range', () => {
    const srt = generateSrt(transcript, 20.0, 30.0);
    expect(srt).toBe('');
  });

  it('uses sequential 1-based indices', () => {
    const srt = generateSrt(transcript, 0, 8.0);
    const lines = srt.split('\n');
    expect(lines[0]).toBe('1');
    // Find the second entry index
    const secondEntryStart = srt.indexOf('\n\n') + 2;
    expect(srt.slice(secondEntryStart, secondEntryStart + 1)).toBe('2');
  });

  it('formats SRT time correctly for sub-second values', () => {
    const seg: WhisperSegment[] = [{ start: 1.5, end: 3.75, speech: 'Hi' }];
    const srt = generateSrt(seg, 0, 5.0);
    expect(srt).toContain('00:00:01,500 --> 00:00:03,750');
  });

  it('formats SRT time correctly for values over 1 minute', () => {
    const seg: WhisperSegment[] = [{ start: 65.0, end: 70.0, speech: 'Long video' }];
    const srt = generateSrt(seg, 60.0, 75.0);
    // Adjusted: 65-60=5.0 --> 70-60=10.0
    expect(srt).toContain('00:00:05,000 --> 00:00:10,000');
  });

  it('uses segment.speech as caption text without modification (req 6.4)', () => {
    const seg: WhisperSegment[] = [{ start: 1.0, end: 3.0, speech: 'exact spoken words' }];
    const srt = generateSrt(seg, 0, 5.0);
    expect(srt).toContain('exact spoken words');
  });

  it('returns empty string for empty transcript', () => {
    const srt = generateSrt([], 0, 10.0);
    expect(srt).toBe('');
  });

  it('excludes segments that only partially overlap (start before clip)', () => {
    // Segment starts before clip start — should be excluded (start < clipStart)
    const seg: WhisperSegment[] = [{ start: 3.0, end: 7.0, speech: 'Partial overlap' }];
    const srt = generateSrt(seg, 5.0, 10.0);
    expect(srt).toBe('');
  });

  it('excludes segments that only partially overlap (end after clip)', () => {
    // Segment ends after clip end — should be excluded (end > clipEnd)
    const seg: WhisperSegment[] = [{ start: 5.0, end: 12.0, speech: 'Partial overlap end' }];
    const srt = generateSrt(seg, 5.0, 10.0);
    expect(srt).toBe('');
  });
});
