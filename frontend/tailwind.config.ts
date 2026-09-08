import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "deep-forest": "var(--kl-deep-forest)",
        emerald: "var(--kl-emerald)",
        mint: "var(--kl-mint)",
        white: "var(--kl-white)",
        page: "var(--surface-page)",
        card: "var(--surface-card)",
        ink: "var(--text-body)",
        secondary: "var(--text-secondary)",
        line: "var(--kl-line)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        body: ["var(--text-body)", { lineHeight: "var(--lh-body)" }],
        "body-sm": "var(--text-body-sm)",
      },
      fontWeight: {
        body: "var(--weight-body)",
        h2: "var(--weight-h2)",
      },
      borderRadius: {
        md: "var(--radius-md)",
      },
      spacing: {
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
      },
      height: {
        button: "var(--btn-height)",
      },
    },
  },
  plugins: [],
} satisfies Config;
