# EXT-006 — Custom ticket markdown templates (.templates/)

| Field | Value |
|-------|-------|
| **Epic** | E — Ticket Authoring & Templates |
| **Type** | Feature |
| **Priority** | P2 |
| **Estimate** | S (1–2 days) |
| **Status** | Ongoing |
| **Depends on** | EXT-000 |
| **Blocks** | — |
| **Labels** | `templates`, `scaffolding`, `authoring`, `customization` |
| **Milestone** | v0.2.0 |

## Summary
Support defining custom Markdown ticket templates in a `Tickets/.templates/` directory (e.g. `feature.md`, `bug.md`, `spike.md`, `refactor.md`), and allow users to select a template when clicking `+ New Ticket`.

## Description
Different ticket types require different metadata, sections, and checklists. For example, a `bug.md` template needs reproduction steps and logs, while a `feature.md` template needs UX specs and acceptance criteria.

This feature:
1. Detects any `.md` files located in `<boardRoot>/.templates/`.
2. Adds a "Template" dropdown in the `+ New Ticket` modal.
3. Pre-fills the title, fields table, acceptance criteria, and work log according to the chosen template.
4. Auto-substitutes placeholders like `{title}`, `{date}`, `{column}`, `{user}`.

## Acceptance Criteria
- [ ] Extension discovers templates in `Tickets/.templates/`.
- [ ] New Ticket modal provides a template picker if templates exist.
- [ ] Selecting a template dynamically updates the preview/editor text.
- [ ] If no `.templates/` folder exists, falls back to the clean default template.
- [ ] Extension provides a command or button to "Initialize Default Templates".

## Work Log
- **2026-09-04**: Drafted requirements and added ticket to Ready backlog.
