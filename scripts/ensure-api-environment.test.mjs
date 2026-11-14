import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { withDevelopmentEnvironment } from './ensure-api-environment.mjs';

describe('withDevelopmentEnvironment', () => {
  it('creates the file content when there is none', () => {
    assert.equal(withDevelopmentEnvironment(undefined), 'ENVIRONMENT=development\n');
  });

  it('appends the line and keeps every other line as it was', () => {
    assert.equal(withDevelopmentEnvironment('# local\nPORT=3001\n'), '# local\nPORT=3001\nENVIRONMENT=development\n');
  });

  it('adds the missing newline before appending', () => {
    assert.equal(withDevelopmentEnvironment('PORT=3001'), 'PORT=3001\nENVIRONMENT=development\n');
  });

  it('treats a commented-out ENVIRONMENT as unset', () => {
    assert.equal(withDevelopmentEnvironment('# ENVIRONMENT=production\n'), '# ENVIRONMENT=production\nENVIRONMENT=development\n');
  });

  it('does not count a variable that only ends in ENVIRONMENT', () => {
    assert.equal(withDevelopmentEnvironment('SENTRY_ENVIRONMENT=x\n'), 'SENTRY_ENVIRONMENT=x\nENVIRONMENT=development\n');
  });

  for (const content of [
    'ENVIRONMENT=staging\n',
    'ENVIRONMENT=development',
    '  ENVIRONMENT = production\n',
    'export ENVIRONMENT=production\n',
    'ENVIRONMENT=\n',
  ]) {
    it(`leaves a file that already sets it untouched: ${JSON.stringify(content)}`, () => {
      assert.equal(withDevelopmentEnvironment(content), undefined);
    });
  }
});

describe('ensure-api-environment CLI', () => {
  const script = fileURLToPath(new URL('./ensure-api-environment.mjs', import.meta.url));
  let dir;
  let envFile;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ensure-api-environment-'));
    envFile = path.join(dir, '.env');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = () => spawnSync(process.execPath, [script, envFile], { encoding: 'utf8' });

  it('creates the env file with ENVIRONMENT=development', () => {
    assert.equal(run().status, 0);
    assert.equal(readFileSync(envFile, 'utf8'), 'ENVIRONMENT=development\n');
  });

  it('appends to an env file that does not set it', () => {
    writeFileSync(envFile, 'PORT=3001\n');
    assert.equal(run().status, 0);
    assert.equal(readFileSync(envFile, 'utf8'), 'PORT=3001\nENVIRONMENT=development\n');
  });

  it('never overwrites an Environment the file already sets', () => {
    writeFileSync(envFile, 'ENVIRONMENT=staging\nPORT=3001\n');
    assert.equal(run().status, 0);
    assert.equal(readFileSync(envFile, 'utf8'), 'ENVIRONMENT=staging\nPORT=3001\n');
  });
});
