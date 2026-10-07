# Windows EXE packaging (HTTP mode)

The EXE runs the existing local HTTP core in a thread and opens the built React UI
in a pywebview/WebView2 window. IPC is deferred. Teammates do not need Python or Node.js.

## Build

Run from `article_editor/` on Windows x64. Use the same Python interpreter for
installation and PyInstaller; this environment has Python 3.13 at the path below
and has no `py` launcher:

```powershell
$python = 'C:\Users\504-03\AppData\Local\Programs\Python\Python313\python.exe'
& $python -m pip install -r packaging\requirements-build.txt
& $python packaging\prepare_platform.py
& $python -m PyInstaller --noconfirm --clean packaging\AINewsroom.spec
```

`packaging\build_windows.bat` is the interactive equivalent with `py -3` or
`python` on PATH. It prepares the platform bundle, then removes existing `build/` and `dist/`. The direct command
above avoids that blanket deletion. Both output folders are already ignored in
`article_editor/.gitignore`; never commit or ship build staging/logs.

The build requirements include SQLCipher (`sqlcipher3-wheels`), keyring, ONNX
Runtime, tokenizers, NumPy, pywebview, and the PDF/HWP document readers. The spec
collects native extensions, DLLs/providers, metadata for keyring backend discovery,
the Windows Credential Manager backend, and lazy AI imports. `collect_all` also
collects dynamic libraries ([PyInstaller hook documentation](https://pyinstaller.org/en/stable/hooks.html#PyInstaller.utils.hooks.collect_all)).
Torch/transformers and training tools remain excluded.

`app/frontend/index.html` and its assets must already be built. The UI build is
owned by the frontend workstream; the EXE build does not modify `web/` or rebuild it.
For a separate frontend build, run `npm --prefix web ci` and
`npm --prefix web run build` before packaging.

Default output (distribute the entire folder):

```text
dist/AINewsroom/
  AINewsroom.exe
  AINewsroom-debug.exe
  _internal/
    frontend/
    models_manifest.json
    platform-generator/       required; includes production node_modules
    node/node.exe             bundled Windows x64 runtime
    node/LICENSE              matching Node/third-party license notices
    bundle.json               build input provenance
    ... Python libraries, native DLLs, WebView2 .NET libraries
```

- `$env:AINEWSROOM_ONEFILE = '1'`: produces `dist/AINewsroom.exe` and
  `dist/AINewsroom-debug.exe`; resources extract to `_MEIPASS` on each run.
- `$env:AINEWSROOM_NAME = 'CustomName'`: changes both executable names and the
  one-dir output folder.
- `packaging/app.ico`, if present, becomes the executable icon.
- Remove the option environment variables to return to default one-dir output.
- The ONNX libraries and optional generator increase size; measure the actual
  output instead of using the obsolete 28 MB estimate.

## Bundled platform conversion / Node.js

Run `python packaging/prepare_platform.py` before the first EXE build or after
changing platform-generator sources. The repeatable tool copies source JavaScript,
`public/` runtime assets and the unchanged package/lock files into an isolated
staging folder, then installs `npm ci --omit=dev --no-audit --no-fund` there.
It copies the build PC's Windows x64 node.exe and downloads the matching official
Node LICENSE (including third-party notices). Browser downloads are disabled.
The development generator/node_modules and all .env files are excluded from copying.

Prepared inputs are published to ignored `packaging/vendor/`, which survives
`build/` and `dist/` cleanup. Existing task-owned prepared bundles are renamed to
`vendor-previous-*` on refresh, never recursively deleted. Source digests detect
concurrent changes and stale prepared sources. Dependency packages retain their
existing license files. Repeated preparation reuses a complete matching bundle.

The PyInstaller spec uses these prepared files without network/npm calls. Missing,
incomplete or stale prepared sources now stop the build with a preparation message;
the generator is no longer silently omitted. The spec prints bundled sizes.

Prepared on this PC (2026-10-07): Node **v24.18.0 Windows x64**, 92,534,088 bytes;
generator + **110 production packages**, 5,871 files, 55,409,882 bytes.
Combined prepared files are about **141.24 MiB**, not the final EXE distribution size.
Functional generation/EXE tests remain deferred. The next step is the EXE build.

Frozen lookup order:

| Resource | Lookup |
|---|---|
| Generator | `PLATFORM_GENERATOR_DIR` override, then `_MEIPASS/platform-generator`, then `<exe folder>/platform-generator` |
| Node | `<exe folder>/node/node.exe`, then `_MEIPASS/node/node.exe`, then PATH |

The runtime still reports HTTP 503 if its Node/adapter files are missing. Prepared
builds include both. Development lookup and the `PLATFORM_GENERATOR_DIR` override
retain their behavior. Conversion routes AI requests through the Python core
rather than passing API keys to Node.

## First run for a teammate

1. Unzip the entire `AINewsroom` folder and run `AINewsroom.exe`. Keep `_internal`
   beside both EXEs. Windows 10/11 x64, Edge WebView2 Runtime, and the .NET Framework
   used by pythonnet are required; install WebView2 if the window cannot open.
2. Sign in with your own account for backend AI services. The EXE ignores the
   development `.env` test-account auto-login feature even when account variables
   exist. General `.env` configuration is still supported; do not distribute a
   developer `.env` or production API keys. OS environment variables take priority.
3. Save a sample article, close the app, reopen it, and verify the saved article.
   Article revisions, sources, and media are encrypted in the vault. There is no
   plaintext articles folder for normal saves.
4. Install local ONNX title/subtitle, boundary, judge and embedding models through
   the app's model installer or the CLI below. Weights are not bundled. All five
   checked-in manifest entries now point to Hugging Face repositories under Tig0w0.
   A local/UNC source with `--from` remains optional for offline installation.
5. Use platform conversion with the bundled generator and Node. No separate Node
   installation is required on the teammate PC.

## Data and device key

```text
%LOCALAPPDATA%/AI Newsroom/
  vault.db             encrypted SQLCipher database (plus WAL/SHM when open)
  models/              installed model files and hf/ cache
  webview/             WebView2 profile / IndexedDB
  logs/app.log         EXE diagnostic log
  settings.json        local preferences
  open/                temporary decrypted files opened in external programs
```

The device key is stored under the `AI Newsroom` service / `device-key` account in
Windows Credential Manager via keyring. It is tied to the Windows user on that PC;
copying the EXE or vault alone is not a cross-PC backup/restore mechanism. A missing
key fails closed. Login credentials do not replace this key.

`Documents/AI Newsroom` follows the Windows known Documents folder (including
OneDrive redirection) for legacy material/export-related paths; new saves use the
vault. Development and frozen builds use the same default data location.
`AI_NEWSROOM_APPDATA`, `AI_NEWSROOM_DOCUMENTS`, and `AI_NEWSROOM_VAULT` override these
paths; the vault override is a **database filename**, not a directory.
`MODELS_DIR` can override the model directory. The EXE folder is for code/resources,
not normal vault/model storage. Existing legacy files may be imported at startup.

## CLI and safe diagnostics

| Command | Behavior |
|---|---|
| `AINewsroom.exe` | Native window; closing it stops the local HTTP core |
| `AINewsroom.exe --browser` | Open the UI in a browser |
| `AINewsroom-debug.exe --check` | Headless startup diagnostics; prints `STARTUP CHECK PASSED` on success |
| `AINewsroom-debug.exe --models` | Report manifest/model installation status |
| `AINewsroom-debug.exe --models install --from "\\server\share\models"` | Install model files with size/hash verification |
| `AINewsroom-debug.exe --smoke write` / `--smoke read` | Opens a real window and checks UI/IndexedDB persistence; has no headless option |
| `--debug` | Enable WebView2 developer tools |

The smoke harness does **not** save/reopen an article in the encrypted core vault;
its persistence check is an IndexedDB marker. Skip it in a headless build sandbox.
Embedding retrieval now defaults to ONNX Runtime + tokenizers + NumPy;
torch/transformers are required only for the explicit development override.
Rebuild the EXE to include this change and the configured Hugging Face manifest.
Actual download/inference and encrypted article persistence checks remain deferred.

Never validate a build against the real vault or real device key. This Python
snippet runs `--check` with environment overrides **only in the child process**,
cleans the new temporary directories, and cannot load developer `.env` files:

```python
import os, subprocess, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory(prefix="ainews-exe-check-") as directory:
    root = Path(directory)
    env = {**os.environ,
        "AI_NEWSROOM_APPDATA": str(root / "appdata"),
        "AI_NEWSROOM_DOCUMENTS": str(root / "documents"),
        "AI_NEWSROOM_VAULT": str(root / "vault" / "vault.db"),
        "AI_NEWSROOM_KEY_SERVICE": "AI Newsroom (exe-build-check)",
        "AI_NEWSROOM_SKIP_DOTENV": "1",
        "MODELS_DIR": str(root / "models"),
        "DESKTOP_STORAGE_DIR": str(root / "webview"),
    }
    result = subprocess.run([r"dist\AINewsroom\AINewsroom-debug.exe", "--check"],
                            env=env, timeout=60)
    raise SystemExit(result.returncode)
```

Save this snippet under ignored `temp/` and run it with the selected Python from
`article_editor/`. `--check` verifies HTTP/UI startup and reports shell/models
status; it does not prove ONNX inference, downloads, or article persistence.
Vault use during an isolated check can create a Credential Manager entry under the
test service; keep any cleanup confined to that service, never the normal one.

If the window fails, inspect the isolated log or `%LOCALAPPDATA%/AI Newsroom/logs/app.log`.
The core picks an available loopback port from 8877 through 8899 without displacing
other applications. Unsigned EXEs can show Windows SmartScreen warnings; signing
and distribution policy are reviewer decisions.
