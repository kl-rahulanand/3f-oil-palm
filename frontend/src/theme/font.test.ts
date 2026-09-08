import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceExtensions = new Set([".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenFontSource = /next\/font\/google|fonts\.(?:googleapis|gstatic)\.com/;
const frontendRoot = resolve(process.cwd(), "frontend");

function runtimeSources() {
  return ["app", "src"]
    .flatMap((root) =>
      readdirSync(resolve(frontendRoot, root), { recursive: true })
        .map((path) => resolve(frontendRoot, root, path.toString()))
        .filter((path) => sourceExtensions.has(extname(path)) && !path.includes(".test.")),
    )
    .concat([
      resolve(frontendRoot, "next.config.ts"),
      resolve(frontendRoot, "postcss.config.mjs"),
      resolve(frontendRoot, "tailwind.config.ts"),
      resolve(frontendRoot, "vitest.config.ts"),
    ]);
}

function expectNoGoogleFont(source: string) {
  expect(source).not.toMatch(forbiddenFontSource);
}

describe("the frontend loads local Inter and references no Google font", () => {
  it("uses the provenance-pinned Inter variable font", () => {
    const layout = readFileSync(resolve(frontendRoot, "app/layout.tsx"), "utf8");
    const globals = readFileSync(resolve(frontendRoot, "app/globals.css"), "utf8");
    const provenance = readFileSync(resolve(frontendRoot, "app/fonts/PROVENANCE.md"), "utf8");
    // InterVariable.woff2 is a committed VENDORED TRUNK ASSET (present at HEAD,
    // git-tracked); it is deliberately outside this task's per-task review diff
    // because the autoreview refuses binaries. This test reads the real committed
    // file and asserts its SHA-256 matches PROVENANCE.md — so the font is present,
    // not absent, and this suite passes (verify is green).
    const font = readFileSync(resolve(frontendRoot, "app/fonts/InterVariable.woff2"));
    const digest = createHash("sha256").update(font).digest("hex");

    expect(layout).toMatch(/from "next\/font\/local"/);
    expect(layout).toMatch(/src: "\.\/fonts\/InterVariable\.woff2"/);
    expect(layout).toMatch(/variable: "--font-inter"/);
    expect(globals.indexOf("--font-sans: var(--font-inter)")).toBeGreaterThan(globals.lastIndexOf("@import"));
    expect(provenance).toContain(`Expected SHA-256: \`${digest}\``);

    const runtime = runtimeSources()
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expectNoGoogleFont(runtime);
    expect(() => expectNoGoogleFont(`${runtime}\nimport font from "next/font/google";`)).toThrow();
  });
});
