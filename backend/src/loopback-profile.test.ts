import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "./config";
import { listenForRequests } from "./main";

test("the mock-OTP profile resolves loopback defaults for listen host CORS PGHOST and compose ports", async () => {
  const environment = { ...process.env };
  process.env.NODE_ENV = "development";
  process.env.AUTH_OTP_MOCK = "true";
  delete process.env.FRONTEND_ORIGIN;
  delete process.env.PGHOST;

  try {
    const config = loadConfig();
    assert.equal(config.frontendOrigin, "http://127.0.0.1:3000");
    assert.equal(config.pg.host, "127.0.0.1");

    const calls: Array<[number, string | undefined]> = [];
    await listenForRequests({} as INestApplication, config, async (_app, port, host) => {
      calls.push([port, host]);
    });
    assert.deepEqual(calls, [[4000, "127.0.0.1"]]);

    process.env.FRONTEND_ORIGIN = "https://frontend.example";
    assert.equal(loadConfig().frontendOrigin, "https://frontend.example");

    const compose = readFileSync("docker-compose.yml", "utf8");
    assert.match(compose, /127\.0\.0\.1:\$\{PGPORT:-5432\}:5432/);
    assert.match(compose, /127\.0\.0\.1:5433:5432/);
  } finally {
    process.env = environment;
  }
});
