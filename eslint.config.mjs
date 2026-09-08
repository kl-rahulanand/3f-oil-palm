import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
const frontendFiles = ["frontend/**/*.{js,jsx,ts,tsx}"];

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "frontend/.next/**", "frontend/next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals").map((config) => ({ ...config, files: frontendFiles })),
  {
    files: frontendFiles,
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  {
    files: ["backend/src/**/*.ts", "backend/test/**/*.ts", "contract/src/**/*.ts", "contract/test/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["eslint.config.mjs", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        process: "readonly",
      },
      sourceType: "module",
    },
    rules: js.configs.recommended.rules,
  },
];
