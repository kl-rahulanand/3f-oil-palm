#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function escapeXmlAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function relativizeTestcaseFiles(xml, relativeFile) {
  const escapedFile = escapeXmlAttribute(relativeFile);
  const testcaseTag = /<testcase\b(?:"[^"]*"|'[^']*'|[^'">])*>/g;

  return xml.replace(testcaseTag, (tag) => {
    const fileAttribute = /\sfile=(?:"[^"]*"|'[^']*')/;
    if (fileAttribute.test(tag)) {
      return tag.replace(fileAttribute, ` file="${escapedFile}"`);
    }

    return tag.replace(/>$/, ` file="${escapedFile}">`);
  });
}

function parseArguments(argv) {
  const options = {};
  const nodeArguments = [];

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (value === undefined) {
      throw new Error(
        "Usage: node tools/junit-run.mjs --file <path> --name <pattern> --report <path> [--require <loader>] [--import <loader>]",
      );
    }

    if (flag === "--require" || flag === "--import") {
      nodeArguments.push(flag, value);
      continue;
    }

    if (!["--file", "--name", "--report"].includes(flag)) {
      throw new Error(
        "Usage: node tools/junit-run.mjs --file <path> --name <pattern> --report <path> [--require <loader>] [--import <loader>]",
      );
    }

    if (options[flag] !== undefined) {
      throw new Error(`Duplicate argument: ${flag}`);
    }

    options[flag] = value;
  }

  for (const flag of ["--file", "--name", "--report"]) {
    if (options[flag] === undefined) {
      throw new Error(`Missing required argument: ${flag}`);
    }
  }

  return { options, nodeArguments };
}

function runNodeTest(file, name, nodeArguments) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...nodeArguments, "--test", `--test-name-pattern=${name}`, "--test-reporter=junit", file],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function main() {
  const { options, nodeArguments } = parseArguments(process.argv.slice(2));
  const relativeFile = path.relative(process.cwd(), path.resolve(options["--file"])).split(path.sep).join("/");
  const result = await runNodeTest(options["--file"], options["--name"], nodeArguments);
  const report = relativizeTestcaseFiles(result.stdout, relativeFile);
  const reportPath = path.resolve(options["--report"]);

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.code;
}

const invokedPath = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
