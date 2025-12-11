# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Go backend (entrypoint `cmd/server/main.go`) that drives tmux sessions and serves WebSocket + QR endpoints; configuration lives in `configs/config.yaml`.
- `web/`: Next.js 16 + TypeScript UI under `src/app`; shared types in `src/types`; static assets in `public/`.
- `shared/protocol.md`: Source of truth for client/server message contracts.
- `start.sh`: Convenience script to build the backend, launch it on :8080, and start the frontend on :3000.

## Build, Test, and Development Commands
- Backend dev: `cd server && go run ./cmd/server` (reads `configs/config.yaml`; requires tmux on PATH).
- Backend build: `cd server && go build -o bin/server ./cmd/server`.
- Backend tests: `cd server && go test ./...` (table-driven tests in `_test.go` files).
- Frontend setup: `cd web && npm install` once per clone.
- Frontend dev: `cd web && npm run dev` (Next dev server on :3000).
- Frontend build: `cd web && npm run build`; lint with `cd web && npm run lint`.
- Full stack locally: `./start.sh` from repo root to run both services together.

## Coding Style & Naming Conventions
- Go: run `gofmt` before committing; keep packages lower_snake, exported identifiers in PascalCase with short doc comments; prefer context-aware functions and error wrapping.
- TypeScript/React: 2-space indent, functional components, hooks-first composition; prefer `type` aliases in `src/types`; file names kebab-case where possible.
- Keep config and secrets out of source; reference tokens/ports via `configs/config.yaml` rather than hardcoding.

## Testing Guidelines
- Backend: add table-driven unit tests next to code (`*_test.go`) and run `go test ./...`; cover tmux interactions with small fakes where possible.
- Frontend: lint on every UI change; add component tests with React Testing Library when introducing new views; capture screenshots for layout changes.
- Aim for happy-path + error-path coverage for protocol handlers and session lifecycle.

## Commit & Pull Request Guidelines
- Commits: short imperative subject lines (e.g., `Add tmux session cleanup`); group related changes and include rationale in body if non-obvious.
- PRs: include summary, manual/test commands run, and screenshots for UI updates; link issues or protocol updates; call out config changes (ports, token lifetime, CORS origins) explicitly.
