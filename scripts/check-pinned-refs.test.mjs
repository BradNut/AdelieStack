import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { findUnpinnedRefs } from './check-pinned-refs.mjs';

describe('check-pinned-refs CLI', () => {
  it("passes on this repository's workflows, compose file and Dockerfiles", () => {
    const script = fileURLToPath(new URL('./check-pinned-refs.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
});

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

describe('findUnpinnedRefs: workflow actions', () => {
  it('accepts an action pinned to a commit SHA with a version comment', () => {
    const yaml = `steps:\n  - uses: actions/checkout@${SHA} # v7.0.1\n`;
    assert.deepEqual(findUnpinnedRefs('.github/workflows/ci.yml', yaml), []);
  });

  it('accepts local actions', () => {
    const yaml = '    - uses: ./.github/actions/setup\n';
    assert.deepEqual(findUnpinnedRefs('.github/workflows/ci.yml', yaml), []);
  });

  it('rejects an action pinned to a tag', () => {
    const yaml = 'steps:\n  - uses: actions/checkout@v7\n';
    assert.deepEqual(findUnpinnedRefs('.github/workflows/ci.yml', yaml), [
      { file: '.github/workflows/ci.yml', line: 2, ref: 'actions/checkout@v7', reason: 'action not pinned to a full commit SHA' },
    ]);
  });

  it('rejects a SHA pin without a version comment', () => {
    const yaml = `- uses: actions/checkout@${SHA}\n`;
    assert.deepEqual(findUnpinnedRefs('.github/actions/setup/action.yml', yaml), [
      { file: '.github/actions/setup/action.yml', line: 1, ref: `actions/checkout@${SHA}`, reason: 'SHA pin missing a "# vX.Y.Z" comment' },
    ]);
  });
});

describe('findUnpinnedRefs: YAML images', () => {
  const finding = (line, ref, reason) => ({ file: 'docker-compose.yaml', line, ref, reason });

  it('accepts images pinned to a specific version or digest', () => {
    const yaml = [
      'services:',
      '  db:',
      '    image: postgres:18.7',
      '  mail:',
      '    image: axllent/mailpit:v1.33.1',
      '  spotlight:',
      '    image: "ghcr.io/getsentry/spotlight:4.12.1"',
      '  cache:',
      `    image: redis@sha256:${'a'.repeat(64)}`,
    ].join('\n');
    assert.deepEqual(findUnpinnedRefs('docker-compose.yaml', yaml), []);
  });

  it('rejects latest, untagged and major-only floating tags', () => {
    const yaml = ['    image: redis:latest', '    image: axllent/mailpit', '    image: postgres:18', '    image: localhost:5000/app'].join('\n');
    assert.deepEqual(findUnpinnedRefs('docker-compose.yaml', yaml), [
      finding(1, 'redis:latest', 'image uses the "latest" tag'),
      finding(2, 'axllent/mailpit', 'image has no tag'),
      finding(3, 'postgres:18', 'image tag is not a specific version'),
      finding(4, 'localhost:5000/app', 'image has no tag'),
    ]);
  });
});

describe('findUnpinnedRefs: Dockerfile FROM', () => {
  it('accepts pinned base images and references to earlier build stages', () => {
    const dockerfile = [
      'FROM node:24.22.3-alpine AS base',
      'FROM base AS build',
      'from --platform=linux/amd64 node:24.22.3-alpine as runtime',
      'COPY --from=build /app /app',
    ].join('\n');
    assert.deepEqual(findUnpinnedRefs('apps/api/Dockerfile', dockerfile), []);
  });

  it('rejects floating base images, including after --platform', () => {
    const dockerfile = ['FROM node:24-alpine AS base', 'FROM base AS build', 'FROM --platform=$BUILDPLATFORM debian AS tools'].join('\n');
    assert.deepEqual(findUnpinnedRefs('apps/api/Dockerfile', dockerfile), [
      { file: 'apps/api/Dockerfile', line: 1, ref: 'node:24-alpine', reason: 'image tag is not a specific version' },
      { file: 'apps/api/Dockerfile', line: 3, ref: 'debian', reason: 'image has no tag' },
    ]);
  });
});
