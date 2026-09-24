# Draft issue for microsoft/vscode

**Title:** Extension commands contributed to `chat/input/status` never run

**VS Code:** 1.138.0 (commit 7debcd0e2acdea1c52de81bf9ee1620444407dda), Windows 11

**Steps**

1. Contribute a command to the `chat/input/status` menu (the only non-proposed menu inside the chat input):
   ```json
   "menus": { "chat/input/status": [{ "command": "my.command", "group": "navigation" }] }
   ```
2. Open the chat view and click the button (it renders at the right end of the row below the input).

**Expected:** `my.command` runs.

**Actual:** Nothing happens and no error is shown. With `--log trace` the renderer logs `CommandService#executeCommand my.command`, but the extension host never logs `ExtHostCommands#$executeContributedCommand`.

**Cause (as far as we can tell):** `ChatInputPart` creates the status toolbar with `menuOptions: { shouldForwardArgs: true }` and `context = { widget }`, so the live `ChatWidget` is passed as the command argument. It cannot be serialized for the extension host RPC, so the call is dropped. Other chat menus pass a serializable context such as `{ $mid: MarshalledId.ChatViewContext, sessionResource }`.

**Suggestion:** pass a serializable context (for example `sessionResource` plus the input's `chatSessionInput:` URI) for extension-contributed items, which would also let extensions know which chat input the button belongs to.

**Use case:** [PromptPen](https://github.com/Metonya/promptpen) rewrites the prompt in the chat input (typos, contradictions) and needs a button next to the input; related request: #278111.
