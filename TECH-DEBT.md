# Tech Debt

Tracked issues to fix incrementally. Nothing here blocks CI, but all of it is
visible on every `npm run lint` run (as warnings).

## React Compiler / react-hooks rules (47 warnings)

Next.js 16 ships stricter `react-hooks` rules (React Compiler). These flag
pre-existing patterns in live UI components. They were downgraded from `error`
to `warn` in `eslint.config.mjs` because refactoring effects/refs in components
**without UI test coverage** risks silent regressions.

**Fix these incrementally — add a component test first, then refactor.**

| Rule | Count | What it means | Hotspots |
|------|-------|---------------|----------|
| `react-hooks/refs` | 25 | Reading a ref during render | `components/files/file-grid.tsx` (16), `components/folders/folder-card.tsx` (9) |
| `react-hooks/set-state-in-effect` | 21 | `setState` called synchronously in an effect → cascading renders | `components/files/file-browser.tsx` (7), admin pages, several viewers |
| `react-hooks/static-components` | 1 | Component defined during render | 1 file |

To see the current list:

```bash
npx eslint 2>&1 | grep -E "react-hooks/(refs|set-state-in-effect|static-components)"
```

### Suggested order (highest render pressure first)
1. `components/files/file-grid.tsx` — 16, core file list, hit on every browse
2. `components/folders/folder-card.tsx` — 9
3. `components/files/file-browser.tsx` — 7

Once a file is clean, no config change is needed — the warnings simply disappear.
When all are resolved, promote the three rules back to `error` in
`eslint.config.mjs` to lock the win in.

## Other warnings (~76)

Mostly `@typescript-eslint/no-unused-vars` (unused imports/vars). Low risk,
safe to clean up opportunistically when touching a file.
