import { parseEnhanceResult } from './parse';
import { FORMAT_RETRY_MESSAGE, answersMessage, draftMessage, systemPrompt, tokensRetryMessage } from './prompts';
import { missingTokens } from './tokenGuard';
import type { Answer, CancellationLike, ChatMessage, EnhanceResult, Mode, OutputLanguage, TextModel } from './types';

export type EnhanceErrorCode = 'format' | 'tokens' | 'cancelled';

export class EnhanceError extends Error {
  constructor(
    readonly code: EnhanceErrorCode,
    message: string,
    readonly detail?: string[],
  ) {
    super(message);
  }
}

export interface EnhanceRequest {
  draft: string;
  mode: Mode;
  language: OutputLanguage;
  context: string;
}

export interface FollowUp {
  previous: EnhanceResult;
  answers: Answer[];
}

export interface Conversation {
  messages: ChatMessage[];
  result: EnhanceResult;
}

export class Enhancer {
  constructor(private readonly model: TextModel) {}

  /** First pass over the draft. The returned conversation is needed for {@link answer}. */
  async enhance(request: EnhanceRequest, token?: CancellationLike): Promise<Conversation> {
    const messages: ChatMessage[] = [
      { role: 'user', content: systemPrompt(request.mode, request.language) },
      { role: 'user', content: draftMessage(request.draft, request.context) },
    ];
    return this.run(messages, request.draft, token);
  }

  /** Second pass that folds the user's answers to the model's questions into the prompt. */
  async answer(conversation: Conversation, draft: string, answers: Answer[], token?: CancellationLike): Promise<Conversation> {
    const messages: ChatMessage[] = [
      ...conversation.messages,
      { role: 'user', content: answersMessage(conversation.result, answers) },
    ];
    return this.run(messages, draft, token);
  }

  private async run(messages: ChatMessage[], draft: string, token?: CancellationLike): Promise<Conversation> {
    let raw = await this.ask(messages, token);
    let result = parseEnhanceResult(raw);
    if (!result) {
      messages = [...messages, { role: 'assistant', content: raw }, { role: 'user', content: FORMAT_RETRY_MESSAGE }];
      raw = await this.ask(messages, token);
      result = parseEnhanceResult(raw);
      if (!result) throw new EnhanceError('format', 'The model did not return a usable answer.');
    }

    let missing = missingTokens(draft, result.improved);
    if (missing.length) {
      messages = [...messages, { role: 'assistant', content: raw }, { role: 'user', content: tokensRetryMessage(missing) }];
      raw = await this.ask(messages, token);
      const retried = parseEnhanceResult(raw);
      missing = retried ? missingTokens(draft, retried.improved) : missing;
      if (!retried || missing.length) {
        throw new EnhanceError('tokens', 'The model changed references or code that must stay verbatim.', missing);
      }
      result = retried;
    }
    return { messages: [...messages, { role: 'assistant', content: raw }], result };
  }

  private async ask(messages: ChatMessage[], token?: CancellationLike): Promise<string> {
    if (token?.isCancellationRequested) throw new EnhanceError('cancelled', 'Cancelled.');
    const reply = await this.model.complete(messages, token);
    if (token?.isCancellationRequested) throw new EnhanceError('cancelled', 'Cancelled.');
    return reply;
  }
}
