# Stargazer Agent Entry

The global Codex rules apply. This file contains only Stargazer-specific routing and constraints.

## Read next

- Usage and scope: `README.md`
- Architecture and state/DB flow: `docs/ARCHITECTURE.md`
- Unresolved product decisions: `SPEC_DECISION_ITEMS.md`
- Historical UI references: `.claude/design-references/README.md`

Other `.claude/` material is internal working context, not public specification; read only what the task needs.

## Constraints

- Work under `desktop/`: React/TypeScript frontend and Tauri/Rust backend.
- Current schema definitions in `desktop/src-tauri/src/lib.rs` are authoritative; do not duplicate DDL in frontend repositories.
- Run multi-statement updates in Rust command transactions; the frontend remains a read and command-call boundary. Keep event-shared and import-session-owned data separate; see `docs/ARCHITECTURE.md`.
- When changing `AppContextType`, update the real-screen preview context in `desktop/src/features/guide/guideSampleContext.ts`.
- When tests are explicitly in scope, cover pure lottery, matching, import, and persistence logic that affects business results.
- Install JavaScript dependencies only with `npm ci --ignore-scripts --prefix desktop`. The root `package.json` only forwards commands; do not create a root `package-lock.json` or root `node_modules`.
- Treat every request to launch the app as a manual-testing handoff. Before launching, ensure the executable reflects the current production source and verify every local test DB under the active `Data/` root matches the current Rust schema. Because the project is pre-release, rebuild stale disposable test data instead of launching against or migrating it.
- Keep short attributes, arguments, and object literals on one line when clear; wrap for conditions, side effects, formatter limits, or readability.

## Verification commands and files

- Relevant commands: `npm test`, `npm run test:coverage`, `npm run build --prefix desktop`, `cargo test --manifest-path desktop/src-tauri/Cargo.toml`.
- Use root `npm run build` only when distribution output is in scope.
- Keep public information in `README.md` or `docs/`, unresolved decisions in `SPEC_DECISION_ITEMS.md`, and internal artifacts in `.claude/`; add no verification artifacts at repository root.
