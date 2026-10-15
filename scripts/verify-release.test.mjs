import assert from "node:assert/strict";
import test from "node:test";
import { assertReleaseOAuthPassed, validateTestDatabaseUrl } from "./verify-release.mjs";

test("accepts a local PostgreSQL sabame_test URL without query or fragment", () => {
  const value = "postgresql://sabame:secret@127.0.0.1:55432/sabame_test";
  assert.equal(validateTestDatabaseUrl(value), value);
});

test("rejects missing, malformed, remote, or non-test database URLs", () => {
  for (const value of [
    undefined,
    "",
    "not a URL",
    "postgresql://sabame@database.example/sabame_test",
    "postgresql://sabame@127.0.0.1:55432/sabame_dev",
  ]) {
    assert.throws(() => validateTestDatabaseUrl(value), /TEST_DATABASE_URL/);
  }
});

test("rejects URL query and fragment delimiters, including empty values", () => {
  for (const value of [
    "postgresql://sabame@localhost/sabame_test?sslmode=disable",
    "postgresql://sabame@localhost/sabame_test?",
    "postgresql://sabame@localhost/sabame_test#fragment",
    "postgresql://sabame@localhost/sabame_test#",
  ]) {
    assert.throws(() => validateTestDatabaseUrl(value), /query strings or fragments/);
  }
});

test("requires the configured OAuth boundary test to pass in the Playwright report", () => {
  const spec = {
    file: "backend-boundary.spec.ts",
    tags: ["release-oauth"],
    tests: [{ status: "expected", results: [{ status: "passed" }] }],
  };
  assert.doesNotThrow(() => assertReleaseOAuthPassed({ suites: [{ specs: [spec] }] }));
  for (const [status, resultStatus] of [["skipped", "skipped"], ["unexpected", "failed"]]) {
    const failedSpec = { ...spec, tests: [{ status, results: [{ status: resultStatus }] }] };
    assert.throws(
      () => assertReleaseOAuthPassed({ suites: [{ specs: [failedSpec] }] }),
      /did not pass/,
    );
  }
  assert.throws(() => assertReleaseOAuthPassed({ suites: [] }), /found 0/);
});
