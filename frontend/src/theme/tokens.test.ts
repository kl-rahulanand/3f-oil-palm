import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sourceRoot =
  "docs/design/3F-Financial-MIS/_ds/knacklabs-design-system-63be358e-2e64-4441-bcd0-253b9c903a8b/tokens";
const tokenFiles = ["colors.css", "spacing.css", "typography.css"];

function tokenNames(css: string) {
  return new Set(css.match(/--[a-z0-9-]+(?=\s*:)/g) ?? []);
}

function expectTokenParity(source: string, port: string) {
  expect([...tokenNames(port)].sort()).toEqual([...tokenNames(source)].sort());
}

describe("the ported _ds theme exposes every token and the button consumes it", () => {
  it("keeps set-level token parity with the approved _ds source", () => {
    for (const file of tokenFiles) {
      const source = readFileSync(resolve(repoRoot, sourceRoot, file), "utf8");
      const port = readFileSync(resolve(repoRoot, "frontend/src/theme", file), "utf8");
      expectTokenParity(source, port);

      const [firstToken] = tokenNames(port);
      expect(() => expectTokenParity(source, port.replace(firstToken, "--negative-control"))).toThrow();
    }

    const button = readFileSync(resolve(repoRoot, "frontend/src/components/ui/button.tsx"), "utf8");
    const tailwind = readFileSync(resolve(repoRoot, "frontend/tailwind.config.ts"), "utf8");
    expect(button).toMatch(/bg-emerald/);
    expect(button).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(tailwind).toMatch(/emerald:\s*"var\(--kl-emerald\)"/);
    expect(tailwind).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
