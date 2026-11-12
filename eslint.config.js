import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    languageOptions: {
      globals: {
        fetch: "readonly",
        AbortSignal: "readonly",
        console: "readonly",
      },
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".npm-cache/**",
      ".wxt/**",
      ".output/**",
      "dist/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
