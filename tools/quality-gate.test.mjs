import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { ESLint } from "eslint";
import prettier from "prettier";

const expectedCommands = {
  FACTORY_STRUCTURAL_CMD: "npm run structural",
  FACTORY_TYPECHECK_CMD: "npm run typecheck",
  FACTORY_QUALITY_CMD: "npm run quality",
  FACTORY_TEST_CMD: "npm run test:hermetic",
};

const hermeticTests = [
  "backend/src/app.routes.test.ts",
  "backend/src/branding.identifiers.test.ts",
  "backend/src/chat/ask-budget-period.test.ts",
  "backend/src/chat/ask-budget-states.test.ts",
  "backend/src/chat/ask-drill-context.test.ts",
  "backend/src/chat/ask-drill-issuer.test.ts",
  "backend/src/chat/ask-drill.service.test.ts",
  "backend/src/chat/ask-period.test.ts",
  "backend/src/chat/chat.controller.test.ts",
  "backend/src/chat/chat.schemas.test.ts",
  "backend/src/chat/chat.service.test.ts",
  "backend/src/chat/chat.sse.test.ts",
  "backend/src/chat/plant-set.test.ts",
  "backend/src/chat/reconciliation-guard.test.ts",
  "backend/src/chat/redundant-month-filter.test.ts",
  "backend/src/chat/selectionExecutor.composed.test.ts",
  "backend/src/chat/smalltalk-guard.test.ts",
  "backend/src/chat/statement-explanation.service.test.ts",
  "backend/src/chat/statement-grounding.service.test.ts",
  "backend/src/chat/statement-intent.test.ts",
  "backend/src/chat/suppression.test.ts",
  "backend/src/chat/timeWindowParse.test.ts",
  "backend/src/common/error-envelope.wiring.test.ts",
  "backend/src/common/exploration-audit.filter.test.ts",
  "backend/src/common/request-logging.test.ts",
  "backend/src/conversations/conversations.service.test.ts",
  "backend/src/core/dimension-values.service.test.ts",
  "backend/src/db/migrate.trim.test.ts",
  "backend/src/db/seed-users.test.ts",
  "backend/src/financial-chat/financial-disposable-db.guard.test.ts",
  "backend/src/financial-chat/financial-report-baseline.test.ts",
  "backend/src/health/health.controller.test.ts",
  "backend/src/help/ask-help-suggestions-still-carry-mbs-q.test.ts",
  "backend/src/help/help.service.test.ts",
  "backend/src/ingest/ingest.controller.test.ts",
  "backend/src/ingest/ingest.service.test.ts",
  "backend/src/ingest/mis-budget.parser.test.ts",
  "backend/src/ingest/sap-actuals.parser.test.ts",
  "backend/src/loopback-profile.test.ts",
  "backend/src/llm/bedrock.provider.test.ts",
  "backend/src/mapping/mapping-master.db.test.ts",
  "backend/src/mapping/mapping-master.test.ts",
  "backend/src/mapping/selection-resolver.service.test.ts",
  "backend/src/measures/authored-measure.registry.test.ts",
  "backend/src/measures/measures.guard.test.ts",
  "backend/src/mis/mis-selection.controller.test.ts",
  "backend/src/mis/mis-drill.controller.test.ts",
  "backend/src/mis/mis-drill.service.test.ts",
  "backend/src/mis/mis-statement-export.test.ts",
  "backend/src/mis/mis-statement.controller.test.ts",
  "backend/src/mis/mis-statement.service.test.ts",
  "backend/src/mis/statement-attestation.test.ts",
  "backend/src/pins/pins.schemas.test.ts",
  "backend/src/pins/pins.service.test.ts",
  "backend/src/saved/saved.service.test.ts",
  "backend/src/semantic/definitionVersion.test.ts",
  "backend/src/semantic/measure-filter.helper.test.ts",
  "backend/src/semantic/semanticLayer.financial.test.ts",
  "backend/src/semantic/semanticLayer.statement.test.ts",
  "backend/src/sql/sqlBuilder.composed.test.ts",
  "backend/src/sql/sqlBuilder.provenance.test.ts",
  "backend/src/sql/sqlBuilder.selection.test.ts",
  "backend/src/sql/sqlBuilder.statement.test.ts",
  "backend/src/sql/sqlValidator.composed.test.ts",
  "backend/src/sql/sqlValidator.pii.test.ts",
  "backend/src/swagger-production.test.ts",
  "backend/src/swagger.test.ts",
  "backend/src/warehouse/all-plants-reconciliation.db.test.ts",
  "backend/src/warehouse/composed-relation.db.test.ts",
  "backend/src/warehouse/drill-transactions.db.test.ts",
  "backend/src/warehouse/drill-transactions.repository.test.ts",
  "backend/src/warehouse/freshness.adapters.test.ts",
  "backend/src/warehouse/gl-name.repository.test.ts",
  "backend/src/warehouse/gl-month-rollups.db.test.ts",
  "backend/src/warehouse/golden-financial.db.test.ts",
  "backend/src/warehouse/load-freshness.db.test.ts",
  "backend/src/warehouse/measure-filter.db.test.ts",
  "backend/src/warehouse/postgres.adapter.oid.test.ts",
  "backend/src/warehouse/reconciliation.repository.test.ts",
  "backend/src/warehouse/selection-slice.db.test.ts",
  "backend/src/warehouse/statement-projection.db.test.ts",
  "backend/src/warehouse/warehouse-schema.test.ts",
];

const dbTests = [
  "backend/src/admin/access-metadata.controller.test.ts",
  "backend/src/auth/auth.controller.test.ts",
  "backend/src/chat/ask-drill.controller.db.test.ts",
  "backend/src/conversations/conversations.service.db.test.ts",
  "backend/src/core/audit.service.test.ts",
  "backend/src/core/session.service.test.ts",
  "backend/src/db/migrate.exploration.db.test.ts",
  "backend/src/db/migrate.test.ts",
  "backend/src/usage/usage.controller.test.ts",
  "backend/src/usage/usage.service.test.ts",
  "backend/src/users/users.controller.test.ts",
];

const backendTestRunner =
  "cd .. && TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register --test";
const backendHermeticTestRunner =
  "cd .. && STATEMENT_ATTESTATION_SECRETS=hermetic-statement-attestation-secret TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register --test";

const expectedScripts = {
  "build:contract": "npm -w @3f/contract run build",
  "build:backend": "npm -w @3f/backend run build",
  "build:frontend": "npm run build:contract && npm -w @3f/frontend run build",
  build: "npm run build:contract && npm run build:backend && npm run build:frontend",
  structural: "npm run build",
  "dev:frontend": "npm -w @3f/frontend run dev",
  "typecheck:frontend": "npm -w @3f/frontend run typecheck",
  typecheck: "npm -w @3f/contract run typecheck && npm -w @3f/backend run typecheck && npm run typecheck:frontend",
  "lint:frontend":
    'eslint --config eslint.config.mjs "frontend/app/**/*.{ts,tsx}" "frontend/src/**/*.{ts,tsx}" frontend/next.config.ts frontend/postcss.config.mjs frontend/tailwind.config.ts frontend/vitest.config.ts --no-error-on-unmatched-pattern',
  lint: 'eslint --config eslint.config.mjs "backend/src/**/*.ts" "backend/test/**/*.ts" "contract/src/**/*.ts" "contract/test/**/*.ts" eslint.config.mjs "tools/**/*.mjs" --no-error-on-unmatched-pattern && npm run lint:frontend',
  "format:check:frontend":
    'prettier --config .prettierrc.json --check "frontend/app/**/*.{ts,tsx,css,md}" "frontend/src/**/*.{ts,tsx,css}" frontend/package.json frontend/tsconfig.json frontend/next.config.ts frontend/postcss.config.mjs frontend/tailwind.config.ts frontend/vitest.config.ts --no-error-on-unmatched-pattern',
  "format:check":
    'prettier --config .prettierrc.json --ignore-path .prettierignore --check "backend/src/**/*.ts" "backend/test/**/*.ts" "contract/src/**/*.ts" "contract/test/**/*.ts" package.json backend/package.json contract/package.json .prettierrc.json eslint.config.mjs .github/workflows/quality.yml "tools/**/*.mjs" --no-error-on-unmatched-pattern && npm run format:check:frontend',
  quality: "npm run lint && npm run format:check",
  "test:frontend": "npm -w @3f/frontend run test",
  "test:hermetic":
    "npm -w @3f/contract run test && npm -w @3f/backend run test:hermetic && npm run test:frontend && node --test tools/quality-gate.test.mjs",
  "test:db": "npm -w @3f/backend run test:db",
  "verify:ci": "npm run structural && npm run typecheck && npm run quality && npm run test:hermetic",
};

const expectedWorkspaceScripts = {
  backend: {
    build: "tsc -p tsconfig.json",
    typecheck: "tsc -p tsconfig.json --noEmit",
    lint: 'cd .. && eslint --config eslint.config.mjs "backend/src/**/*.ts" "backend/test/**/*.ts" --no-error-on-unmatched-pattern',
    "format:check":
      'cd .. && prettier --config .prettierrc.json --ignore-path .prettierignore --check "backend/src/**/*.ts" "backend/test/**/*.ts" --no-error-on-unmatched-pattern',
    "test:hermetic": `${backendHermeticTestRunner} ${hermeticTests.join(" ")}`,
    "test:db": `${backendTestRunner} ${dbTests.join(" ")}`,
    "test:warehouse-proof":
      "cd .. && STATEMENT_ATTESTATION_SECRETS=warehouse-proof-statement-attestation-secret TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 WAREHOUSE_DB_TEST=1 node --require ts-node/register --test --test-concurrency=1 backend/src/warehouse/reconciliation.repository.test.ts backend/src/warehouse/gl-month-rollups.db.test.ts backend/src/warehouse/composed-relation.db.test.ts backend/src/warehouse/golden-financial.db.test.ts backend/src/mapping/mapping-master.db.test.ts backend/src/warehouse/statement-projection.db.test.ts backend/src/warehouse/selection-slice.db.test.ts backend/src/warehouse/drill-transactions.db.test.ts backend/src/warehouse/gl-name.repository.test.ts backend/src/warehouse/load-freshness.db.test.ts backend/src/warehouse/measure-filter.db.test.ts backend/src/warehouse/all-plants-reconciliation.db.test.ts",
    "test:financial-chat-db-proof": "node ../tools/financial-chat-db-proof.mjs",
    "master:generate": "ts-node -T src/mapping/generate-mapping-master.ts",
  },
  contract: {
    build: "tsc -p tsconfig.json",
    typecheck: "tsc -p tsconfig.json --noEmit",
    lint: 'cd .. && eslint --config eslint.config.mjs "contract/src/**/*.ts" "contract/test/**/*.ts" --no-error-on-unmatched-pattern',
    "format:check":
      'cd .. && prettier --config .prettierrc.json --ignore-path .prettierignore --check "contract/src/**/*.ts" "contract/test/**/*.ts" --no-error-on-unmatched-pattern',
    test: "cd .. && TS_NODE_PROJECT=contract/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register --test contract/test/auth-contract.test.ts contract/test/row-key.test.ts",
  },
  frontend: {
    build: "NEXT_TELEMETRY_DISABLED=1 next build",
    dev: "next dev -H 127.0.0.1 -p 3000",
    typecheck: "tsc --noEmit",
    test: "cd .. && npm exec --no -- vitest run --config frontend/vitest.config.ts",
  },
};

const expectedWorkflow = `name: Product quality

on:
  push:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 20
          cache: npm
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0
        with:
          python-version: "3.11"
      - run: npm ci
      - run: npm run verify:ci
`;

const ignoredBaselineHashes = new Map(
  `6b9700c706d00dcfcba190bd2750a24f897aee0b3a1fe20fa39511703ac6aee5 backend/src/admin/access-metadata.controller.test.ts
10093f22f8bc4055bf5efbf5a4748d93bc74f09e3db77b5012cea910be29dba7 backend/src/admin/access-metadata.service.ts
61276be021b0ee4e6f69b71571f8ee8d1cafb5c65fcbd4bcd2c66dff79a74af0 backend/src/auth/auth.controller.test.ts
c96d9a455bdc15fa5143d51ac482c014a203218d3fbca9601b7a111b0d2bf6e0 backend/src/auth/auth.controller.ts
7bb9ca84daeb1f17f120322cbf8aac1b21f5887e50307ff696cf93f104903e9a backend/src/auth/auth.guard.ts
46a4caf182b422bc97625c7d4fe093fefd6a995bd92bc189e21427d0b6cf57bc backend/src/auth/auth.schemas.ts
2bf3b8a6a4a99053b0c960962714d02748d79f83bb5eff2abc82728b8f428b47 backend/src/auth/cookies.ts
27fcf5cef0f49b1de541e36e5930fa75337f604a01bbfd2254d6511681812faa backend/src/auth/rate-limit.service.ts
e85528150c0ebdfc7e199915a28487acc28ccb6011ea649ca4cf89c61e17753c backend/src/chat/ambiguity.ts
8f23925eb1ac1c01f4938f30f8838820a84b512092772b6781e3229f6964b84e backend/src/chat/chat.sse.ts
d87c8800569af74975ce67dbdb408de2ebbc1c11cbf00a5eb51f42190e1aefe9 backend/src/chat/suppression.ts
a91b8489592d28d7e418290e34799dcfb58238c54bb1050fba339280d11ed646 backend/src/chat/timeWindowParse.ts
c401ca278a38b619644004834a832197cd3e21ea4394dff874611ba000adb90d backend/src/common/openapi.ts
5cdcc416d806108b06f887f81fded9bce2288cfeb36d825546a401d619f6ed8b backend/src/conversations/conversations.controller.ts
9db182303af310614919aa97c2ea0228dc4dbca406af52863fc22c650909c612 backend/src/core/dimension-values.service.test.ts
b218baa747af4070dc3bd9ef6b7188f6f1c79e8e1f92c94330087cbbecc8fd76 backend/src/core/rbac.service.ts
ceaa15512931da9c7b4874e9f73b45e2f1143fa11c36b2f52a6ebfb0821dd75b backend/src/core/session.service.test.ts
819c28a31a0c36a411c3e655939c797ce2c40ac2f57384a1f27b9d9723bcbbf2 backend/src/core/session.service.ts
5414f861e89f339709c595131720b7dad8d3891181b2fb1b243d948f8fd78605 backend/src/db/schema.ts
fdd5b42a8c71a4ae157087975610d937c371c2e9ed32399478f3f61fb8db6d69 backend/src/email/email.service.ts
96b9245a12b5beba3a4a566481760658363ba82bc02f7bfe037a8e6b8848bd60 backend/src/grants/grants.controller.ts
f97f5a40ebac02d0c31e0adb3cfc1ed19d1c134e0e943623714824594a44bf2b backend/src/measures/authored-measure.registry.test.ts
96d894688cfebd5a2b8b54d3b53b1324ff9cec8d15ca6e01887de97fb6d89d9d backend/src/measures/authored-measure.registry.ts
0dfcb8c559afbec03ba57263bdb948ad28b582a555bf8d8cf60b579fce0ab4b3 backend/src/measures/measure-authoring.catalog.ts
bf94f2bb3dfcf7f0c200d22c660c9b768e511fa2f5eee9a558351a1a5fac5997 backend/src/measures/measure-compiler.ts
92b9f412e89da7a9e4f92e4fe8c6c2463c32b2123ccb9aff470f856ae5d43f16 backend/src/measures/measures.controller.ts
91ec7447e738b5ded87619650cd7005f4115a65cc68d6108a2d27196ce6546d2 backend/src/measures/measures.module.ts
0e60ecdbc6e1c8ed436c00201f64eeb4b406768a60d3166b0d5a25e4db939840 backend/src/measures/measures.schemas.ts
03011f262717f9465b3f347323fbef3d9b20ca8ae2ce7d5bbe650df3edde2d3c backend/src/measures/measures.service.ts
933e6c77490f45144c43b5e58c5917a7dc4e2d87cafbc7e6c807a30defee2cae backend/src/recon/recon.run.ts
c16c3caf691704a163a15c6b4e52bd5bb0360ad742dfff8151e310d69b149712 backend/src/recon/recon.store.ts
2acc47706b6cffcac04ecd156725b593c3240b9bf2c00154a8a6ce01150306e6 backend/src/recon/reconciliation.service.ts
48af5fd4514fb0ff8e81812eea986b4026488c9c548afab66df0fa5cdd55b633 backend/src/reports/reports.service.ts
430a16cf27377aad3c3f64136659755773322fd3189d436ca39b38c0e8edc9ba backend/src/semantic/definitionVersion.test.ts
8d4180354a45af0dd7a53c37e7124df29fc5fa0f76c54a8a007186d1bc94d5d1 backend/src/sql/sql.constants.ts
bf87de09ae5d480823d3f7cc3d45f625e2903594afeaf7eaa13a866321c811d6 backend/src/sql/sqlValidator.ts
2e736292f4b2732ede4917855dbd30ffa6f0388106c7976560179ddfe7d2e4a0 backend/src/usage/usage.controller.test.ts
3bab2da5c4017c7785f9bde9c5dff0dc450909034c5807cb1800909cca51b778 backend/src/usage/usage.controller.ts
4961bd904aadc46f001c57a6c08a4704931c1eabfcdae2c3c99792cfebad0a90 backend/src/usage/usage.service.test.ts
84b00e97a0fc507b8a6391a51718bef685726c2a9372e22c1013e3b1d0b5d8a2 backend/src/usage/usage.service.ts
89dbea46e702c9dc8838f3401687ec0902e2706b53dd8e5843644021783a3f90 backend/src/users/users.constants.ts
570020b0c167290b0da56180c6edb9250e29d4bcfe9bb67cdfc4a093709a98e6 backend/src/users/users.controller.ts`
    .split("\n")
    .map((line) => line.split(" "))
    .map(([hash, path]) => [path, hash]),
);

function readCommands(envrc) {
  const found = {};
  const harnessDefaults = `if [ ! -f constitution/VENDORED_FROM ]; then
  export FACTORY_STRUCTURAL_CMD="python3 factory/scripts/check_dual_runtime.py"
  export FACTORY_TYPECHECK_CMD="python3 factory/scripts/check_factory_scaffold.py"
  export FACTORY_TEST_CMD="uv run --with pytest --with psutil python -m pytest factory/tests -q"
fi`;
  for (const line of envrc.replace(harnessDefaults, "").split("\n")) {
    const stripped = line.trim();
    const match = stripped.match(/^export\s+(FACTORY_[^=\s]+)\s*=(.*)$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    let value = rawValue.trim();
    if (value.length >= 2 && value[0] === value.at(-1) && ['"', "'"].includes(value[0])) value = value.slice(1, -1);
    if (name.endsWith("_CMD")) found[name] = value;
  }
  return found;
}

function backendTests() {
  return readdirSync("backend/src", { recursive: true })
    .map((path) => `backend/src/${path.replaceAll("\\", "/")}`)
    .filter((path) => path.endsWith(".test.ts"))
    .sort();
}

function validateIgnoredBaseline(ignore, readPath = readFileSync) {
  assert.match(ignore, /# D-0006 \(2026-09-07\):/);
  assert.match(ignore, /Before editing a listed file, format it and remove it here in the same change\./);
  assert.match(ignore, /Every new ignore entry requires its own named, dated deferral\./);
  assert.doesNotMatch(ignore, /^(?:backend|contract)\/(?:\*{1,2})/m, "vendored exclusions must name files");

  const ignoredPaths = [...ignoredBaselineHashes.keys()];
  assert.deepEqual(
    ignore
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .sort(),
    ["**/dist/**", "**/node_modules/**", ...ignoredPaths].sort(),
    "the Prettier ignore list must contain only the pinned build, debt, and harness paths",
  );
  for (const path of ignoredPaths) {
    assert.ok(ignoredBaselineHashes.has(path), `${path} has no pinned D-0006 baseline hash`);
    const contents = Buffer.from(readPath(path)).toString("utf8").replaceAll("\r\n", "\n");
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      ignoredBaselineHashes.get(path),
      `${path} changed while still excluded by D-0006`,
    );
  }
}

function selectScripts(scripts, expected) {
  return Object.fromEntries(Object.keys(expected).map((name) => [name, scripts[name]]));
}

function validateGate({
  commands,
  workspaces,
  rootScripts,
  backendScripts,
  contractScripts,
  frontendScripts,
  frontendPackage,
  frontendIgnore,
  frontendTsconfig,
  workflow,
  ignore,
  testFiles,
}) {
  assert.deepEqual(commands, expectedCommands, "the four FACTORY commands must match the pinned graph");
  assert.deepEqual(workspaces, ["contract", "backend", "frontend"], "the workspace graph must include frontend");
  for (const [name, body] of Object.entries(expectedScripts)) {
    assert.equal(rootScripts[name], body, `root script ${name} must retain its pinned body`);
  }
  assert.deepEqual(backendScripts, expectedWorkspaceScripts.backend, "backend gate leaves must retain their bodies");
  assert.deepEqual(contractScripts, expectedWorkspaceScripts.contract, "contract gate leaves must retain their bodies");
  assert.deepEqual(frontendScripts, expectedWorkspaceScripts.frontend, "frontend gate leaves must retain their bodies");
  for (const [name, version] of Object.entries({
    ...frontendPackage.dependencies,
    ...frontendPackage.devDependencies,
  })) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be exact-pinned`);
  }
  assert.equal(frontendPackage.dependencies["@3f/contract"], "0.0.0");
  assert.deepEqual(
    frontendIgnore.split(/\r?\n/).filter(Boolean),
    [".next/", "next-env.d.ts", "*.tsbuildinfo"],
    "frontend generated build files must remain ignored",
  );
  assert.ok(frontendTsconfig.compilerOptions.plugins.some(({ name }) => name === "next"));
  assert.ok(frontendTsconfig.include.includes(".next/types/**/*.ts"));
  assert.deepEqual(
    testFiles,
    [...dbTests, ...hermeticTests].sort(),
    "every backend test must be declared hermetic or DB-backed",
  );
  assert.equal(workflow, expectedWorkflow, "quality CI must be immutable, read-only, and run on every push only");
  validateIgnoredBaseline(ignore);
}

test("the four FACTORY commands are declared in .envrc and name scripts that exist", async () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const backendPackage = JSON.parse(readFileSync("backend/package.json", "utf8"));
  const contractPackage = JSON.parse(readFileSync("contract/package.json", "utf8"));
  const frontendPackage = JSON.parse(readFileSync("frontend/package.json", "utf8"));
  const envrc = readFileSync(".envrc", "utf8");
  const gate = {
    commands: readCommands(envrc),
    workspaces: packageJson.workspaces,
    rootScripts: packageJson.scripts,
    backendScripts: selectScripts(backendPackage.scripts, expectedWorkspaceScripts.backend),
    contractScripts: selectScripts(contractPackage.scripts, expectedWorkspaceScripts.contract),
    frontendScripts: selectScripts(frontendPackage.scripts, expectedWorkspaceScripts.frontend),
    frontendPackage,
    frontendIgnore: readFileSync("frontend/.gitignore", "utf8"),
    frontendTsconfig: JSON.parse(readFileSync("frontend/tsconfig.json", "utf8")),
    workflow: readFileSync(".github/workflows/quality.yml", "utf8").replaceAll("\r\n", "\n"),
    ignore: readFileSync(".prettierignore", "utf8"),
    testFiles: backendTests(),
  };

  validateGate(gate);

  const missingCommand = { ...gate.commands };
  delete missingCommand.FACTORY_TEST_CMD;
  assert.throws(() => validateGate({ ...gate, commands: missingCommand }), /four FACTORY commands/);
  assert.throws(
    () => validateGate({ ...gate, commands: { ...gate.commands, FACTORY_TYPECHECK_CMD: "npm run typechek" } }),
    /four FACTORY commands/,
  );
  assert.throws(
    () => validateGate({ ...gate, commands: { ...gate.commands, FACTORY_QUALITY_CMD: "npm run build" } }),
    /four FACTORY commands/,
  );
  assert.throws(
    () => validateGate({ ...gate, commands: readCommands(`${envrc}\nexport FACTORY_QUALITY_CMD=true\n`) }),
    /four FACTORY commands/,
  );
  assert.throws(
    () => validateGate({ ...gate, commands: readCommands(`${envrc}\nexport  FACTORY_QUALITY_CMD=x\n`) }),
    /four FACTORY commands/,
  );
  assert.throws(
    () => validateGate({ ...gate, commands: readCommands(`${envrc}\nexport FACTORY_QUALITY_CMD=$(echo true)\n`) }),
    /four FACTORY commands/,
  );
  assert.throws(
    () =>
      validateGate({
        ...gate,
        commands: readCommands(
          `${envrc}\nif [ -f constitution/VENDORED_FROM ]; then\n  export FACTORY_QUALITY_CMD=true\nfi\n`,
        ),
      }),
    /four FACTORY commands/,
  );
  for (const name of Object.keys(expectedScripts)) {
    assert.throws(
      () => validateGate({ ...gate, rootScripts: { ...gate.rootScripts, [name]: "true" } }),
      new RegExp(`root script ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  }
  for (const [workspace, scripts] of [
    ["backend", gate.backendScripts],
    ["contract", gate.contractScripts],
    ["frontend", gate.frontendScripts],
  ]) {
    for (const name of Object.keys(scripts)) {
      assert.throws(
        () => validateGate({ ...gate, [`${workspace}Scripts`]: { ...scripts, [name]: "true" } }),
        new RegExp(`${workspace} gate leaves`),
      );
    }
  }
  assert.throws(
    () => validateGate({ ...gate, workflow: gate.workflow.replace("\njobs:", "\n  pull_request:\n\njobs:") }),
    /every push only/,
  );
  assert.throws(
    () => validateGate({ ...gate, workflow: gate.workflow.replace("  push:\n", "  push:\n    branches: [main]\n") }),
    /every push only/,
  );
  assert.throws(() => validateGate({ ...gate, testFiles: [...gate.testFiles, "backend/src/new.test.ts"] }), /declared/);
  assert.throws(
    () =>
      validateIgnoredBaseline(gate.ignore, (path) =>
        path === "backend/src/auth/auth.controller.ts" ? Buffer.from("changed") : readFileSync(path),
      ),
    /changed while still excluded/,
  );
  assert.throws(() => validateIgnoredBaseline(`${gate.ignore}\ntools/**\n`), /only the pinned/);

  const eslint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
  const backendConfig = await eslint.calculateConfigForFile("backend/src/config.ts");
  assert.ok(Object.keys(backendConfig.rules).length > 0, "backend files must receive the root ESLint ruleset");
  const [eslintFailure] = await eslint.lintText("debugger;\n", { filePath: "backend/src/negative-control.ts" });
  assert.ok(eslintFailure.errorCount > 0, "an obvious error must fail ESLint");
  const frontendConfig = await eslint.calculateConfigForFile("frontend/src/negative-control.tsx");
  assert.ok(frontendConfig.rules["@next/next/no-img-element"], "frontend files must receive Next rules");
  const [frontendFailure] = await eslint.lintText('export const Fixture = () => <img src="/x" />;\n', {
    filePath: "frontend/src/negative-control.tsx",
  });
  assert.ok(
    frontendFailure.messages.some(({ ruleId }) => ruleId === "@next/next/no-img-element"),
    "a known frontend violation must be reported",
  );
  assert.equal(await prettier.check("debugger;\n", { filepath: "tools/negative-control.mjs" }), true);

  const formattingDrift = "export default {answer:42}\n";
  const [eslintSuccess] = await eslint.lintText(formattingDrift, { filePath: "tools/negative-control.mjs" });
  assert.equal(eslintSuccess.errorCount, 0, "formatting-only drift must pass ESLint");
  assert.equal(await prettier.check(formattingDrift, { filepath: "tools/negative-control.mjs" }), false);
});

test("the quality gate runs all three workspaces and independently pins backend VENDORED_FROM", () => {
  const rootScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const contractScripts = JSON.parse(readFileSync("contract/package.json", "utf8")).scripts;
  const provenance = Object.fromEntries(
    readFileSync("backend/VENDORED_FROM", "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(/:\s+/, 2)),
  );

  assert.equal(rootScripts["test:hermetic"], expectedScripts["test:hermetic"]);
  assert.equal(contractScripts.test, expectedWorkspaceScripts.contract.test);
  assert.equal(provenance.repository, "https://github.com/knacklabs/mbs-pulse.git");
  assert.equal(provenance.commit, "e639840b0e01371544d3f5d8f6cac1686c0176c4");
});
