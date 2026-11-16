import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "docs/**", "content/**", "packages/api/data/**", "docs/evidence/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["packages/web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Fetch-on-mount effects here reset to "loading" before requesting; the rule would force a data library for no gain.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: globals.node } },
  { files: ["packages/web/e2e/**"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // Brief 01 code is unchanged by Brief 02; keep its existing style.
  { files: ["packages/curriculum/**"], rules: { "no-useless-assignment": "off" } },
);
