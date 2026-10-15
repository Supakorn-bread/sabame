import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredTag = "release-oauth";
const requiredFile = "backend-boundary.spec.ts";
const invalidDatabaseMessage = "Set TEST_DATABASE_URL to a local PostgreSQL URL for the dedicated sabame_test database without query strings or fragments";

export function validateTestDatabaseUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(invalidDatabaseMessage);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(invalidDatabaseMessage);
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/sabame_test" ||
    value.includes("?") ||
    value.includes("#") ||
    url.search ||
    url.hash
  ) {
    throw new Error(invalidDatabaseMessage);
  }

  return value;
}

export function assertReleaseOAuthPassed(report) {
  const matches = [];
  const visit = (suites = []) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (spec.file === requiredFile && spec.tags?.includes(requiredTag)) {
          matches.push(spec);
        }
      }
      visit(suite.suites);
    }
  };

  visit(report?.suites);

  if (matches.length !== 1) {
    throw new Error(`Expected one @${requiredTag} test in the Playwright report, found ${matches.length}`);
  }

  const [spec] = matches;
  const [test] = spec.tests ?? [];
  const lastResult = test?.results?.at(-1);
  if (
    spec.tests?.length !== 1 ||
    test.status !== "expected" ||
    lastResult?.status !== "passed"
  ) {
    throw new Error(`The configured OAuth boundary test did not pass (status: ${test?.status ?? "missing"})`);
  }
}

function run(command, args, env) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

async function verifyRelease() {
  let databaseUrl;
  try {
    databaseUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const baseEnv = { ...process.env, TEST_DATABASE_URL: databaseUrl };
  const checks = [
    ["npm", ["run", "lint"]],
    ["npm", ["run", "typecheck"]],
    ["npm", ["test"]],
    ["npm", ["run", "test:api"]],
    ["npm", ["run", "test:integration"]],
  ];

  for (const [command, args] of checks) {
    const status = run(command, args, baseEnv);
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
  }

  const databaseEnv = {
    ...baseEnv,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  };
  const migrationStatus = run("npm", ["run", "db:migrate"], databaseEnv);
  if (migrationStatus !== 0) {
    process.exitCode = migrationStatus;
    return;
  }

  const reportDirectory = await mkdtemp(join(tmpdir(), "sabame-release-"));
  const reportFile = join(reportDirectory, "playwright.json");
  const e2eEnv = {
    ...databaseEnv,
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
  };

  try {
    const e2eStatus = run("npm", ["run", "test:e2e", "--", "--reporter=list,json"], e2eEnv);
    let reportPassed = false;
    try {
      assertReleaseOAuthPassed(JSON.parse(await readFile(reportFile, "utf8")));
      reportPassed = true;
    } catch (error) {
      console.error(error.message);
    }

    if (e2eStatus !== 0 || !reportPassed) {
      process.exitCode = e2eStatus || 1;
    }
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await verifyRelease();
}
