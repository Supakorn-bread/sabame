import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { Linter } from "eslint";
import { boundariesConfig } from "./workspace-boundaries.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const linter = new Linter();
for (const [name, owner, code, rejected] of [
  ["web uses shared contracts", "apps/web/view.js", "import x from '@sabame/domain/mal';", false],
  ["web cannot import API relatively", "apps/web/src/view.js", "import x from '../../api/src/main.js';", true],
  ["web cannot import Prisma", "apps/web/view.js", "import x from '@prisma/client';", true],
  ["API cannot import React", "apps/api/view.js", "import x from 'react';", true],
  ["shared package cannot import app", "packages/catalog/test.js", "export * from '../../apps/api/src/main.js';", true],
  ["domain cannot import server catalog", "packages/domain/test.js", "import x from '@sabame/catalog/catalog';", true],
  ["domain allows its own modules", "packages/domain/test.js", "export * from './tracker.js';", false],
  ["server can use catalog", "apps/web/view.js", "import x from '@sabame/catalog/catalog';", false],
  ["browser cannot dynamically import catalog", "apps/web/view.js", "'use client'; import('@sabame/catalog/catalog');", true],
  ["browser cannot import local server module", "apps/web/view.js", "'use client'; import x from '@/features/media/server/sdk';", true],
]) {
  test(name, () => {
    const errors = linter.verify(code, [boundariesConfig], { filename: path.join(root, owner) });
    assert.equal(errors.length, rejected ? 1 : 0, JSON.stringify(errors));
    if (rejected) assert.equal(errors[0].ruleId, "workspace/boundaries");
  });
}
