# Architecture Decision Records

One short file per hard-to-reverse decision (a library, a protocol, a data model, a hosting choice). Number them in order and never delete one: if a decision changes, write a new ADR that says "Supersedes 000X" and mark the old one "Superseded".

| ADR | Title | Status |
|---|---|---|
| [0001](0001-tech-stack.md) | Tech stack and multiplayer model | Proposed |
| [0002](0002-single-player-first.md) | Single player first, with the server running the rules | Accepted; private worlds superseded by 0004 |
| [0003](0003-player-buildings.md) | Buildings and storehouse stock are per-player game state | Accepted |
| [0004](0004-shared-world.md) | A shared world of sections replaces private worlds | Accepted |

## Template

```markdown
# ADR 000X: <title>

- **Status:** Proposed | Accepted | Superseded by 000Y
- **Date:** YYYY-MM-DD
- **Deciders:** <names>

## Context
What problem or question forced a decision?

## Decision
What we chose, in a sentence or a short table.

## Alternatives considered
What else we looked at and why we didn't pick it.

## Consequences
What gets easier, what gets harder, and when to revisit.
```
