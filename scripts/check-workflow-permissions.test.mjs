import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { findPrivilegeIssues } from './check-workflow-permissions.mjs';

const WORKFLOW = '.github/workflows/ci.yml';
// A GitHub expression reading a secret, built so the test strings are not mistaken for template placeholders.
const secret = (name) => `\${{ secrets.${name} }}`;

describe('check-workflow-permissions CLI', () => {
  it("passes on this repository's workflows", () => {
    const script = fileURLToPath(new URL('./check-workflow-permissions.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /workflow/);
  });
});

describe('findPrivilegeIssues: workflow permissions', () => {
  it('accepts a workflow with read-only top-level permissions', () => {
    const yaml = ['name: CI', 'permissions:', '  contents: read', 'jobs:', '  lint:', '    steps:', '      - run: pnpm lint'].join('\n');
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), []);
  });

  it('rejects a workflow without top-level permissions', () => {
    const yaml = ['name: CI', 'jobs:', '  lint:', '    steps:', '      - run: pnpm lint'].join('\n');
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), [{ file: WORKFLOW, line: 1, reason: 'workflow declares no top-level permissions' }]);
  });
});

describe('findPrivilegeIssues: write grants', () => {
  const job = (permissionLines) =>
    ['permissions:', '  contents: read', 'jobs:', '  analyze:', '    permissions:', ...permissionLines, '    steps:', '      - run: x'].join('\n');

  it('rejects a write grant at workflow level', () => {
    const yaml = ['permissions:', '  contents: write', 'jobs: {}'].join('\n');
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), [
      { file: WORKFLOW, line: 2, reason: 'write grant at workflow level; set it on the job that needs it' },
    ]);
  });

  it('rejects write-all at workflow level', () => {
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, 'permissions: write-all\njobs: {}'), [
      { file: WORKFLOW, line: 1, reason: 'write grant at workflow level; set it on the job that needs it' },
    ]);
  });

  it('accepts a job-level write grant with a comment saying why', () => {
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, job(['      # Uploads the scan results.', '      security-events: write'])), []);
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, job(['      security-events: write # uploads the scan results'])), []);
  });

  it('rejects a job-level write grant without a comment', () => {
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, job(['      contents: read', '      security-events: write'])), [
      { file: WORKFLOW, line: 7, reason: 'write grant without a comment saying why' },
    ]);
  });
});

describe('findPrivilegeIssues: secrets', () => {
  const workflow = (...rest) => ['permissions:', '  contents: read', ...rest].join('\n');
  const outside = (line) => ({ file: WORKFLOW, line, reason: 'secret mapped outside the step that uses it' });

  it('accepts a secret passed to the step that uses it', () => {
    const yaml = workflow(
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: ./.github/actions/setup',
      '      - name: Upload source maps',
      '        env:',
      `          SENTRY_AUTH_TOKEN: ${secret('SENTRY_AUTH_TOKEN')}`,
      '        run: pnpm sentry:upload',
    );
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), []);
  });

  it('rejects a secret mapped at workflow level', () => {
    const yaml = workflow('env:', `  DATABASE_PASSWORD: ${secret('DATABASE_PASSWORD')}`, 'jobs: {}');
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), [outside(4)]);
  });

  it('rejects a secret mapped at job level', () => {
    const yaml = workflow(
      'jobs:',
      '  check:',
      '    env:',
      `      SIGNING_SECRET: ${secret('SIGNING_SECRET')}`,
      '    steps:',
      '      - run: pnpm check',
    );
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), [outside(6)]);
  });

  it('rejects a secret after the steps of a job end', () => {
    const yaml = workflow('jobs:', '  check:', '    steps:', '      - run: pnpm check', '  deploy:', '    env:', `      TOKEN: ${secret('TOKEN')}`);
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), [outside(9)]);
  });

  it('rejects passing every secret to a reusable workflow', () => {
    const yaml = workflow('jobs:', '  call:', '    uses: ./.github/workflows/other.yml', '    secrets: inherit');
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, yaml), [outside(6)]);
  });

  it('rejects a secret given to a dependency install step', () => {
    const install = { file: WORKFLOW, line: 8, reason: 'dependency install step sees a secret' };
    const viaSetup = workflow(
      'jobs:',
      '  check:',
      '    steps:',
      '      - uses: ./.github/actions/setup',
      '        env:',
      `          TOKEN: ${secret('TOKEN')}`,
    );
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, viaSetup), [install]);
    const viaRun = workflow(
      'jobs:',
      '  check:',
      '    steps:',
      '      - run: pnpm install --frozen-lockfile',
      '        env:',
      `          TOKEN: ${secret('TOKEN')}`,
    );
    assert.deepEqual(findPrivilegeIssues(WORKFLOW, viaRun), [install]);
  });
});
