import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const globalsPath = resolve(process.cwd(), "frontend/app/globals.css");
const workspaceGlobalsPath = resolve(process.cwd(), "../frontend/app/globals.css");
const cssPath = existsSync(globalsPath) ? globalsPath : workspaceGlobalsPath;
const css = readFileSync(cssPath, "utf8");

const documentedTokens = [
  "--bg",
  "--panel",
  "--panel2",
  "--ink",
  "--muted",
  "--faint",
  "--line",
  "--line2",
  "--azure",
  "--azure-ink",
  "--azure-soft",
  "--azure-ring",
  "--accent",
  "--accent-d",
  "--accent-soft",
  "--accent-ring",
  "--grid",
  "--grid-strong",
  "--b1",
  "--b2",
  "--b3",
  "--b4",
  "--b5",
  "--ok",
  "--ok-soft",
  "--ok-line",
  "--warn",
  "--warn-soft",
  "--warn-line",
  "--danger",
  "--rail",
  "--rail2",
  "--rail-ink",
  "--rail-dim",
  "--rail-line",
  "--head",
  "--grid-head",
  "--codebg",
  "--code-ink",
  "--shadow",
  "--shadow-sm",
] as const;

const navyRamp = {
  light: {
    "--b1": "#1c4e80",
    "--b2": "#3a6ea3",
    "--b3": "#5f8cba",
    "--b4": "#8bafd2",
    "--b5": "#b7cee6",
  },
  dark: {
    "--b1": "#5a9bdd",
    "--b2": "#4f92d6",
    "--b3": "#3f7cbd",
    "--b4": "#31608f",
    "--b5": "#274a6d",
  },
} as const;

test("Atlas light and dark themes define the full documented token set", () => {
  const light = declarationsFor(":root");
  const dark = declarationsFor('[data-theme="dark"]');

  for (const token of documentedTokens) {
    assert.ok(light[token], `:root missing ${token}`);
    assert.ok(dark[token], `[data-theme="dark"] missing ${token}`);
  }

  assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort(), "light and dark token names must match");
});

test("Atlas accents stay separated and chart bars use the navy ramp", () => {
  const light = declarationsFor(":root");
  const dark = declarationsFor('[data-theme="dark"]');

  assert.notEqual(light["--accent"], light["--azure"], "light brand accent must not be azure");
  assert.notEqual(dark["--accent"], dark["--azure"], "dark brand accent must not be azure");

  for (const [token, expected] of Object.entries(navyRamp.light)) {
    assert.equal(light[token], expected, `light ${token} must remain the Atlas navy chart ramp`);
    assert.notEqual(light[token], light["--azure"], `light ${token} must not use azure`);
  }

  for (const [token, expected] of Object.entries(navyRamp.dark)) {
    assert.equal(dark[token], expected, `dark ${token} must remain the Atlas navy chart ramp`);
    assert.notEqual(dark[token], dark["--azure"], `dark ${token} must not use azure`);
  }
});

function declarationsFor(selector: string): Record<string, string> {
  const block = findBlock(selector);
  const declarations: Record<string, string> = {};
  const declarationPattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;

  while ((match = declarationPattern.exec(block))) {
    declarations[match[1]] = normalizeCssValue(match[2]);
  }

  return declarations;
}

function findBlock(selector: string): string {
  const pattern = new RegExp(`(?:^|})\\s*[^{}]*${escapeRegExp(selector)}[^{}]*\\{([^{}]*)\\}`, "m");
  const match = css.match(pattern);
  assert.ok(match, `missing ${selector} block`);
  return match[1];
}

function normalizeCssValue(value: string): string {
  return value.trim().replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
