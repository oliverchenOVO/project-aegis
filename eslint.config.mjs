import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: ["node_modules/**", "**/dist/**", "release/**", "test-results/**"],
  },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
