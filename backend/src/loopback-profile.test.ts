import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "./config";
import { listenForRequests } from "./main";

test("BIND_HOST overrides the mock-OTP loopback default, and its absence does not", async () => {
  const environment = { ...process.env };
  process.env.NODE_ENV = "development";
  process.env.AUTH_OTP_MOCK = "true";

  try {
    // Unset: the guard stands. A mock-OTP instance stays off the network.
    delete process.env.BIND_HOST;
    const guarded: Array<[number, string | undefined]> = [];
    await listenForRequests({} as INestApplication, loadConfig(), async (_app, port, host) => {
      guarded.push([port, host]);
    });
    assert.deepEqual(guarded, [[4000, "127.0.0.1"]]);

    // Set: a deliberate, explicit exposure. A container cannot work without it -
    // Docker's publisher cannot reach a process on the container's own loopback.
    process.env.BIND_HOST = "0.0.0.0";
    const exposed: Array<[number, string | undefined]> = [];
    await listenForRequests({} as INestApplication, loadConfig(), async (_app, port, host) => {
      exposed.push([port, host]);
    });
    assert.deepEqual(exposed, [[4000, "0.0.0.0"]]);

    // Blank is not a bind address; it must fall back to the guard rather than
    // listening everywhere because someone left BIND_HOST= in an env file.
    process.env.BIND_HOST = "   ";
    const blank: Array<[number, string | undefined]> = [];
    await listenForRequests({} as INestApplication, loadConfig(), async (_app, port, host) => {
      blank.push([port, host]);
    });
    assert.deepEqual(blank, [[4000, "127.0.0.1"]]);
  } finally {
    process.env = environment;
  }
});

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
