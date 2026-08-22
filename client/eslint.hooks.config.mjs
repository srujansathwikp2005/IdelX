// Deploy gate: rules-of-hooks only.
//
// The main config carries the full Next.js rule set, which reports
// pre-existing findings across this codebase. Gating releases on all of them
// would block deploys for style issues and invite the gate being disabled.
//
// This one rule earns a hard gate on its own: a hook after a conditional
// return changes the hook count between renders and takes down every page
// rendering that component — while the server happily returns 200, so only a
// real browser reveals it. It shipped twice before this existed.
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    // Inline eslint-disable comments are ignored here for two reasons: the
    // source carries disables for Next rules this config does not load, which
    // would otherwise error as unknown; and nobody should be able to switch
    // off a crash-preventing rule with a comment.
    linterOptions: { noInlineConfig: true },
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
];
