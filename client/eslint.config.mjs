import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Hooks called after a conditional return change the hook count between
      // renders, which crashes the entire page with "This page couldn't load".
      // It shipped twice — once on the product page, once on checkout — and
      // both times the server kept returning 200, so nothing but a browser
      // showed it. An error, not a warning: this must fail the build.
      "react-hooks/rules-of-hooks": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
