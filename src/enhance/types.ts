export type Mode = 'fix' | 'expand';
export type OutputLanguage = 'same' | 'en';

export type QuestionKind = 'contradiction' | 'ambiguity' | 'missing';

export interface Question {
  question: string;
  options: string[];
  kind: QuestionKind;
}

export interface EnhanceResult {
  improved: string;
  changes: string[];
  questions: Question[];
}

export interface Answer {
  question: string;
  answer: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
}

/** The minimal model surface the enhancer needs; implemented over vscode.lm and by test fakes. */
export interface TextModel {
  complete(messages: ChatMessage[], token?: CancellationLike): Promise<string>;
}
