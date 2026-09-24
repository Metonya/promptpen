import type { EnhanceResult, Question, QuestionKind } from './types';

const KINDS: QuestionKind[] = ['contradiction', 'ambiguity', 'missing'];
const MAX_CHANGES = 5;
const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 4;

function extractJsonObject(raw: string): string | undefined {
  const text = raw.replace(/^﻿/, '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : undefined;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim()) : [];

function toQuestion(v: unknown): Question | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.question !== 'string' || !o.question.trim()) return undefined;
  const kind = KINDS.includes(o.kind as QuestionKind) ? (o.kind as QuestionKind) : 'ambiguity';
  return { question: o.question.trim(), options: strings(o.options).slice(0, MAX_OPTIONS), kind };
}

/** Parses the model's JSON reply, tolerating code fences and surrounding prose. */
export function parseEnhanceResult(raw: string): EnhanceResult | undefined {
  const json = extractJsonObject(raw);
  if (!json) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  if (typeof o.improved !== 'string' || !o.improved.trim()) return undefined;
  const questions = Array.isArray(o.questions)
    ? o.questions.map(toQuestion).filter((q): q is Question => !!q).slice(0, MAX_QUESTIONS)
    : [];
  return { improved: o.improved.trim(), changes: strings(o.changes).slice(0, MAX_CHANGES), questions };
}
