# Changelog

## 0.2.0

- Expand is now the default mode; **Fix Prompt Only** replaces the Expand shortcut in the menu.
- Uses the model selected in the chat view until you pick one for PromptPen; a model you pick sticks. When the chat is on Auto, PromptPen asks once instead of using Auto.
- The status bar shows whether the model follows the chat.

## 0.1.0

- Improve the prompt in VS Code's chat input in place, with a model chosen from VS Code's language models.
- Fix and Expand modes; clarifying questions for contradictions and ambiguities.
- Version history with back/forward, diff against the original, undo.
- Protected tokens (`#file:` references, `@mentions`, `/commands`, URLs, code) are verified after every rewrite.
- Optional workspace and chat history context.
- English and Turkish UI.
