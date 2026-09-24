import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/** Uses a locally installed VS Code when available instead of downloading one. */
function localVSCode(): string | undefined {
  const candidates = [
    process.env.VSCODE_EXECUTABLE,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
      : undefined,
  ];
  return candidates.find((c): c is string => !!c && fs.existsSync(c));
}

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptpen-test-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'promptpen-workspace-'));
  const cdpPort = process.env.PROMPTPEN_CDP_PORT ?? '9339';
  process.env.PROMPTPEN_CDP_PORT = cdpPort;
  await runTests({
    vscodeExecutablePath: localVSCode(),
    extensionDevelopmentPath: [root, path.join(root, 'test', 'fixtures', 'fake-lm')],
    extensionTestsPath: path.join(__dirname, 'suite', 'index.js'),
    extensionTestsEnv: { PROMPTPEN_USER_DATA_DIR: userDataDir },
    launchArgs: [workspace, '--user-data-dir', userDataDir, '--disable-workspace-trust', '--disable-extensions', `--remote-debugging-port=${cdpPort}`],
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
