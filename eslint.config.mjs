import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/*
 * `next lint` is deprecated in Next 15 and gone in 16, so this is the ESLint
 * CLI with a flat config. Before this there was no config at all: the six
 * `eslint-disable-next-line` comments in the source were suppressing rules
 * nothing ever ran.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "ios/**",
      "prisma/migrations/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The mock control sender reports its sends to the terminal on purpose;
      // that is its whole job in MOCK_LOCAL_SERVICES mode.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      // A leading underscore is how this codebase says "required by the
      // signature, deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // App Router has no pages/_document; the stylesheet in app/layout.tsx is
      // the documented place for it.
      "@next/next/no-page-custom-font": "off",
    },
  },
  {
    // Last, so it wins: flat config resolves later entries over earlier ones.
    // prisma/seed.ts and the benchmarks are CLIs — their output IS the point.
    files: ["prisma/**/*.ts", "services/**/bench/**/*.ts"],
    rules: { "no-console": "off" },
  },
];

export default config;
