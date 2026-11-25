// ESLint flat config for services/api (BR-60). Runs in CI inside the unit-test
// container; `npm run lint` locally. Type-aware rules can be added later once the
// suite is fast enough to run them on every PR.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "reports/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // `_name` marks intentionally unused bindings (e.g. Express's 4-arg error handler).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      // Logging goes through injected loggers or console.error/warn; no stray console.log.
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      eqeqeq: ["error", "always"],
    },
  },
  // The entry point prints its listen/shutdown lines to stdout.
  { files: ["src/server.ts"], rules: { "no-console": "off" } },
);
