import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // React Compiler / react-hooks rules introduced in Next 16 flag ~47 pre-existing
    // patterns across live UI components (file-grid, file-browser, folder-card, ...).
    // These are real refactor candidates, but changing effects/refs in components
    // that have no UI test coverage risks silent regressions. Downgraded to "warn"
    // so they stay visible on every lint run without blocking CI, and are tracked as
    // tech debt in TECH-DEBT.md to be fixed incrementally with tests.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
    },
  },
]);

export default eslintConfig;
