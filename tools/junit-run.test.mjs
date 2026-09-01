import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { relativizeTestcaseFiles } from './junit-run.mjs';

const runner = fileURLToPath(new URL('./junit-run.mjs', import.meta.url));

test('relativizes junit file attribute', () => {
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<testsuites>',
    '  <testcase name="absolute" file="/private/tmp/example.test.mjs"/>',
    "  <testcase name=\"other\" file='elsewhere/other.test.mjs'></testcase>",
    '</testsuites>',
  ].join('\n');

  const result = relativizeTestcaseFiles(xml, 'tools/junit-run.test.mjs');
  const fileAttributes = [...result.matchAll(/<testcase\b[^>]*\sfile="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(fileAttributes, [
    'tools/junit-run.test.mjs',
    'tools/junit-run.test.mjs',
  ]);
  assert.doesNotMatch(result, /private\/tmp|elsewhere\/other/);
});

test('propagates passing and failing node:test exit codes', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'junit-run-'));
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  context.after(() => rm(directory, { recursive: true, force: true }));

  for (const [expected, body] of [
    [0, "import test from 'node:test'; test('target', () => {});"],
    [1, "import test from 'node:test'; test('target', () => { throw new Error('no'); });"],
  ]) {
    const file = path.join(directory, `exit-${expected}.test.mjs`);
    const report = path.join(directory, `exit-${expected}.xml`);
    await writeFile(file, body);

    const result = spawnSync(
      process.execPath,
      [runner, '--file', path.basename(file), '--name', 'target', '--report', report],
      { cwd: directory, encoding: 'utf8', env: environment },
    );

    assert.equal(result.status, expected, result.stderr);
    assert.match(await readFile(report, 'utf8'), /<testsuites/);
  }
});

test('passes require and import loaders to node:test', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'junit-loaders-'));
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  context.after(() => rm(directory, { recursive: true, force: true }));

  await writeFile(path.join(directory, 'register.cjs'), 'global.__requiredByJunitRun = true;');
  await writeFile(path.join(directory, 'import.mjs'), 'globalThis.__importedByJunitRun = true;');
  await writeFile(
    path.join(directory, 'loader.test.mjs'),
    "import assert from 'node:assert/strict'; import test from 'node:test'; test('target', () => { assert.equal(global.__requiredByJunitRun, true); assert.equal(globalThis.__importedByJunitRun, true); });",
  );

  const result = spawnSync(
    process.execPath,
    [
      runner,
      '--file',
      'loader.test.mjs',
      '--name',
      'target',
      '--report',
      'loader.xml',
      '--require',
      './register.cjs',
      '--import',
      './import.mjs',
    ],
    { cwd: directory, encoding: 'utf8', env: environment },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(path.join(directory, 'loader.xml'), 'utf8'), /<testsuites/);
});
