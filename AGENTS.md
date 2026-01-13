## Project Philosophy
DAEMON is a terminal-based AI agent with sci-fi aesthetics. It supports both **text** and **voice** interaction modes, and renders an interactive glitching avatar in the terminal via OpenTUI.

## Commands
- `bun install` - Install deps
- `bun dev` / `bun run dev` - Run with hot reload (`bun run --watch src/index.tsx`)
- `bun run format` - Format code (writes changes) via Biome
- `bun run format:check` - Check formatting (no writes) via Biome
- `bun run lint` - Lint code (configured to be low-noise) via Biome
- `bun run lint:fix` - Auto-fix lint where possible via Biome
- `bun run typecheck` - TypeScript typecheck (`bunx tsc -p tsconfig.json --noEmit`)
- `bun run check` - Run `typecheck` + `lint` + `format:check`
- `bun test <pattern>` - Run tests
- `bun run preview:avatar` - Render PNG frames to `tmp/avatar-preview/`
- `bun run preview:avatar:mp4` - Render an MP4 preview to `tmp/avatar-preview.mp4` (requires `ffmpeg`)
- `bun run setup:browsers` - Install Playwright Chromium binaries (optional; see JS-rendered page support)

Note: Use the `bun run` scripts above for Biome. Avoid `bunx biome` (there’s a different npm package named `biome`).

## System Dependencies
- `sox` is required for microphone input and audio playback (macOS uses CoreAudio via sox).
- `ffmpeg` is required for:
  - TTS “effects” pipeline (voice output processing)
  - `preview:avatar:mp4` stitching

## Optional: JS-rendered page support (`renderUrl`)
DAEMON defaults to Exa-based `fetchUrls` for retrieving web page text. For JavaScript-heavy sites (SPAs) where `fetchUrls` returns "shell-only" content, DAEMON can optionally use a local Playwright Chromium renderer via the `renderUrl` tool.

This feature is optional and not installed by default. If Playwright/Chromium aren't installed, DAEMON hides the `renderUrl` tool. A startup toast only appears if Playwright is installed but the Chromium binaries are missing.

Install steps (local development):
- `bun add -d playwright`
- `bun run setup:browsers`

Install steps (global install via npm/bun):
- `npm i -g playwright` (or `bun add -g playwright`)
- `npx playwright install chromium`

## Environment / API Keys
DAEMON reads keys from environment variables, and can also store them in local preferences and apply them to `process.env` at runtime.

- `OPENROUTER_API_KEY` - required for response generation (OpenRouter models)
- `OPENAI_API_KEY` - required for transcription; also enables voice output UI options
- `EXA_API_KEY` - required for web search tool (`src/ai/tools/web-search.ts`)

Audio tuning (optional):
- `DAEMON_AUDIO_DEVICE` / `AUDIO_DEVICE` - input device name override for sox capture
- `DAEMON_AUDIO_BUFFER_BYTES` / `DAEMON_SOX_BUFFER_BYTES` - sox buffer size tuning

## Tech Stack
- Runtime: Bun, TypeScript (strict mode, ESM)
- UI: OpenTUI framework (React-like terminal UI).
- AI:
  - Vercel AI SDK (`ai`) with OpenRouter provider for response generation
  - OpenAI provider for transcription + TTS
  - Exa (`exa-js`) for web search

## Persistence
- Preferences: `~/.config/daemon/preferences.json` (macOS/Linux; OS-appropriate path on Windows) via `src/utils/preferences.ts`
- Sessions: `~/.config/daemon/sessions.sqlite` (SQLite via `bun:sqlite`) via `src/state/session-store.ts`

## Code Style
- Formatting: Tabs are used throughout the TS/TSX sources; follow existing formatting.
- Organization:
  - `src/index.tsx`: OpenTUI renderer + app bootstrap
  - `src/app/`: App composition and higher-level UI layout
  - `src/app/components/`: App-level panes/layers (avatar layer, conversation pane, overlays)
  - `src/components/`: Reusable UI widgets (menus, overlays, status, input bar, tool views)
  - `src/hooks/`: UI hooks and event wiring (keyboard, menus, sessions, loaders)
  - `src/state/`: App state + persistence (`daemon-state.ts`, `session-store.ts`)
  - `src/types/`: Centralized type definitions and theme constants (`src/types/index.ts`, `src/types/theme.ts`)
  - `src/ui/`: UI constants / markdown styling (`src/ui/constants.ts`)
  - `src/ai/`: Models, tools, system prompt, agent loop (`src/ai/daemon-ai.ts`, `src/ai/tools/`, `src/ai/system-prompt.ts`)
  - `src/voice/`: Audio recording + speech synthesis (`src/voice/audio-recorder.ts`, `src/voice/tts/`)
  - `src/avatar/`: Avatar renderables + rig/animation logic
  - `src/utils/`: Shared utilities (preferences, debug logging, OpenRouter model helpers)
  - `src/scripts/`: One-off setup/dev scripts (e.g., Playwright browser setup)
  - `src/cli.ts`: CLI entrypoint (build target for published package)
  - `src/avatar-preview.ts`: Avatar preview renderer (PNG/MP4 output)
- Imports: External packages first, then internal. Prefer relative imports inside the same feature area; the `src/*` path alias is available for cross-tree imports.
- Types: Use `type` keyword for type-only imports; prefer interfaces for object shapes. Centralize in `src/types/index.ts`.
- Naming: PascalCase for types/components, camelCase for functions/variables, SCREAMING_SNAKE for constants.
- Error handling: Wrap in try/catch, convert unknown errors with `error instanceof Error ? error : new Error(String(error))`.
- JSX: Uses `@opentui/react` with custom components extended via `extend()`. Prefer small, functional components.
- State: EventEmitter pattern for cross-component state (`src/state/daemon-state.ts`). Hook-based UI state management (`src/hooks/`). Session persistence in `src/state/session-store.ts`.
- Async: Use AbortController for cancellable async operations (e.g. response generation, transcription, TTS).
