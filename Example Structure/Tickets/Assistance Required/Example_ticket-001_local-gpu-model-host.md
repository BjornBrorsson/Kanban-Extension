# ACM-001 — Provision local GPU host & deploy Gemma 4 27B MoE

> _Reconstructed 2026-09-03 from `PROJECT_LOG.md` / `PROJECT_MEMORIES.md` after the original ticket file was lost in the 2026-06-09 duplicate cleanup. Content reflects real project history to the best available record._

| Field | Value |
|-------|-------|
| **Epic** | A — Foundation & Infrastructure |
| **Type** | Infrastructure / MLOps |
| **Priority** | P0 — Critical |
| **Estimate** | M (2–3 days) |
| **Status** | Assistance Required |
| **Depends on** | — |
| **Blocks** | ACM-006, ACM-033 |
| **Labels** | `llm`, `infra`, `gpu`, `ollama` |

## Summary
Stand up the local model-serving endpoint the agent orchestrator calls for reasoning/generation. Target production model is **Gemma 4 27B MoE**; local dev uses the lighter **Gemma 4 E4B** via Ollama per `AGENT.md`.

## Description
The orchestrator (ACM-006) is built against an LLM-client protocol so it can talk to any OpenAI-compatible or Ollama-compatible endpoint. This ticket is the actual model host: install Ollama, pull `gemma4:e4b` for local dev, confirm streaming + JSON-mode-equivalent structured output works end to end, and document the config path to swap in the 27B MoE target model later.

## Acceptance Criteria
- [x] Ollama installed and running locally.
- [x] `gemma4:e4b` pulled and available.
- [ ] Backend `.env` model endpoint config reliably points at the running Ollama instance (currently blocked — operator reports Ollama PATH/env is not "sticking" between sessions/terminals).
- [ ] End-to-end smoke test: orchestrator round-trip (prompt → tool calls → structured `staged_action`) against the real local model, not a fake/test double.
- [ ] Config documented for swapping to the target 27B MoE deployment later (same client protocol, different endpoint/model name).

## Technical Notes
- Client protocol is already defined and consumed by `AgentOrchestrator` (ACM-006) — this ticket only needs to supply a working endpoint, not new orchestrator code.
- Known blocker (2026-09-03): Ollama is installed and `gemma4:e4b` is downloaded, but the Ollama executable/model PATH is not persisting reliably across shells — needs environment-variable/PATH troubleshooting (likely a user-vs-machine PATH scope issue, or Ollama's own `OLLAMA_MODELS`/install-dir env var not being picked up by new terminals).
- Once Ollama responds locally, re-run backend `pytest -q` LLM-dependent tests (previously stubbed/fake) and the manual orchestrator smoke test.

## Definition of Done
- Local Ollama endpoint is reachable from the backend on every fresh shell/service start (no manual PATH fix-up required), `gemma4:e4b` responds to a real orchestrator round trip, and the swap-to-27B-MoE config path is documented.

## Work Log

### 2026-06-09
- Moved to Assistance Required: model endpoint, streaming, JSON-mode, and benchmark verification require the actual local LLM setup, unavailable on the temporary PC at the time.

### 2026-06-23
- Noted still blocking: Ollama not installed; agent sessions that reach the LLM call step fail until Ollama is installed and `gemma4:e4b` is pulled.

### 2026-09-03
- Status update from operator: Ollama is now installed and running, `gemma4:e4b` is downloaded and ready, but PATH/environment configuration is not persisting reliably — ticket remains Assistance Required pending a PATH fix.
