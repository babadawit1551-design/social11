import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export interface ClipSegment {
  startSeconds: number;
  endSeconds: number;
  title: string;
  description: string;
  viralScore: number; // 0.0–1.0
}

export interface JobConfig {
  maxClips: number;
  minClipDuration: number;
  maxClipDuration: number;
}

const TIMEOUT_MS = 30_000;

function buildPrompt(transcript: unknown, jobConfig: JobConfig): string {
  return `You are a viral content expert. Analyze the following video transcript and identify the most engaging, viral-worthy segments.

Return a JSON array of clip segments. Each segment must have:
- startSeconds: number (start time in seconds)
- endSeconds: number (end time in seconds, must be > startSeconds)
- title: string (catchy title for the Short, max 100 chars)
- description: string (engaging description, max 500 chars)
- viralScore: number between 0.0 and 1.0 (higher = more viral potential)

Constraints:
- Each clip duration must be between ${jobConfig.minClipDuration} and ${jobConfig.maxClipDuration} seconds
- Return at most ${jobConfig.maxClips} segments
- Order by viralScore descending
- Return ONLY the JSON array, no other text

Transcript:
${JSON.stringify(transcript)}`;
}

function parseSegments(raw: string): ClipSegment[] {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not a JSON array');
  }
  return parsed as ClipSegment[];
}

function filterAndRankSegments(segments: ClipSegment[], jobConfig: JobConfig): ClipSegment[] {
  const { minClipDuration, maxClipDuration, maxClips } = jobConfig;

  return segments
    .filter((seg) => {
      const duration = seg.endSeconds - seg.startSeconds;
      return duration >= minClipDuration && duration <= maxClipDuration;
    })
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, maxClips);
}

async function callOpenAI(prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  const response = await client.chat.completions.create(
    {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');
  return content;
}

async function callAnthropic(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  const response = await client.messages.create(
    {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );

  const block = response.content[0];
  if (!block || block.type !== 'text') throw new Error('Anthropic returned empty content');
  return block.text;
}

/**
 * Analyzes a transcript using OpenAI GPT-4 (primary) or Anthropic Claude (fallback).
 * Returns filtered and ranked ClipSegments within the job config constraints.
 *
 * Retry strategy (req 4.4):
 *   1. Call OpenAI — if it times out or fails, retry once
 *   2. If second OpenAI attempt fails, try Anthropic
 *   3. If Anthropic also fails, throw with ai_analysis_failed
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export async function analyzeTranscript(
  transcript: unknown,
  jobConfig: JobConfig,
): Promise<ClipSegment[]> {
  const prompt = buildPrompt(transcript, jobConfig);

  // Attempt 1: OpenAI
  let openAiError: unknown;
  try {
    const raw = await callOpenAI(prompt);
    const segments = parseSegments(raw);
    return filterAndRankSegments(segments, jobConfig);
  } catch (err) {
    openAiError = err;
  }

  // Attempt 2: OpenAI retry
  try {
    const raw = await callOpenAI(prompt);
    const segments = parseSegments(raw);
    return filterAndRankSegments(segments, jobConfig);
  } catch {
    // Both OpenAI attempts failed — fall through to Anthropic
  }

  // Attempt 3: Anthropic fallback
  try {
    const raw = await callAnthropic(prompt);
    const segments = parseSegments(raw);
    return filterAndRankSegments(segments, jobConfig);
  } catch {
    // All attempts exhausted
    const error = new Error('ai_analysis_failed');
    (error as Error & { cause?: unknown }).cause = openAiError;
    throw error;
  }
}
