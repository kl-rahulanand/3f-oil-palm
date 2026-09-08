import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Providers } from "./providers";

const frontendRoot = resolve(process.cwd(), "frontend");

function QueryClientProbe() {
  return <span data-testid="query-client">{useQueryClient() ? "ready" : "missing"}</span>;
}

describe("the app tree is wrapped in a TanStack Query provider", () => {
  it("provides a QueryClient to descendants", () => {
    render(
      <Providers>
        <QueryClientProbe />
      </Providers>,
    );

    expect(screen.getByTestId("query-client")).toHaveTextContent("ready");
    expect(readFileSync(resolve(frontendRoot, "app/layout.tsx"), "utf8")).toMatch(
      /<Providers>[\s\S]*{children}[\s\S]*<\/Providers>/,
    );
    expect(() => render(<QueryClientProbe />)).toThrow(/No QueryClient set/);
  });
});
