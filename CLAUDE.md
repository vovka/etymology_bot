# Code Style Rules

## Core Philosophy
Code is for humans first. Optimize for readability, modularity, and maintainability over cleverness.

## Simplicity First
- Write the minimum code that solves the requested problem.
- Do not add speculative features, configuration, or abstractions.
- Avoid new dependencies unless the task clearly requires them.
- Do not add error handling for scenarios that cannot happen in the actual system.
- If a solution feels overbuilt, simplify it before presenting it.

## Surgical Changes
- Touch only files needed for the task.
- Do not refactor adjacent code, comments, formatting, or naming unless required.
- Match the existing project style even when a different style would be preferable.
- Remove only dead code introduced by your own change; mention unrelated dead code instead of deleting it.
- Every changed line should trace directly to the request.

## Coding Standards (targets, not hard rules)
Never extract a function or split a file just to hit a number. Judgment beats the target;
simplicity / no premature abstraction always wins.

1. Files: aim for ~100 lines or fewer (start new files around ~80).
2. Functions/methods: aim for ~10 lines or fewer, each doing one thing.
3. Lines: aim for ~120 characters or fewer.
4. Prefer OOP when it fits the domain; functional/procedural when clearly simpler.
5. Prefer one class per file where practical; file name = class name (`User.py`, `UserValidator.ts`);
   free functions live in `utils/` or `helpers/`.
6. Keep code DRY — extract genuinely repeated logic, but don't pre-extract logic that appears once.
7. Keep roughly 3–7 items per level (architecture layers, modules, directories). Group mixed-purpose
   files into subfolders by context; homogeneous sets (e.g. `models/`) may stay flat.

## In practice
- Extract helpers; use early returns to flatten nesting.
- Name extracted functions descriptively — the name is the documentation.
- Break long calls across lines or pull out a well-named intermediate variable.
- Comments explain *why*, not *what*.
- Copy-paste is a smell: same logic twice → one place.
- Legacy files violating targets: improve incrementally as you touch them; no broad refactors unless asked.

## Verification
- Define success criteria for non-trivial work up front.
- Prefer a failing test or reproduction before fixing bugs.
- Verify with the narrowest relevant tests, lint, or type checks; if you can't, say what remains unverified.
