// Fails when a GitHub Actions `uses:` is not pinned to a full commit SHA with a
// version comment, a container image is untagged, `latest` or a floating
// major-only tag, or a Dockerfile installs a package at `@latest` (#235). Scans tracked workflows/actions, compose files and Dockerfiles.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const usesPattern = /^\s*-?\s*uses:\s*['"]?([^'"\s#]+)/;
const fullSha = /@[0-9a-f]{40}$/;
const versionComment = /#\s*v\d+(\.\d+)*\s*$/;
const imagePattern = /^\s*-?\s*image:\s*['"]?([^'"\s#]+)/;
const fromPattern = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i;
// A specific version has at least major.minor (`18.7`, `v1.33.1`, `24.22.3-alpine`, `5.2.6-24`).
const specificVersion = /^v?\d+\.\d+/;
// A package a Dockerfile installs at `latest` (`corepack prepare pnpm@latest`, `npm i -g turbo@latest`).
const latestPackage = /(?:^|\s)((?:@[\w.-]+\/)?[\w.-]+@latest)\b/g;

function checkAction(ref, text) {
  if (ref.startsWith('./')) return null;
  if (!fullSha.test(ref)) return 'action not pinned to a full commit SHA';
  if (!versionComment.test(text)) return 'SHA pin missing a "# vX.Y.Z" comment';
  return null;
}

function checkImage(ref) {
  if (/@sha256:[0-9a-f]{64}$/.test(ref)) return null;
  // The tag follows the last colon, unless that colon belongs to a registry host:port.
  const lastSlash = ref.lastIndexOf('/');
  const colon = ref.indexOf(':', lastSlash + 1);
  if (colon === -1) return 'image has no tag';
  const tag = ref.slice(colon + 1);
  if (tag === 'latest') return 'image uses the "latest" tag';
  if (!specificVersion.test(tag)) return 'image tag is not a specific version';
  return null;
}

function isDockerfile(file) {
  const name = file.split('/').pop();
  return name === 'Dockerfile' || name.startsWith('Dockerfile.') || name.endsWith('.Dockerfile');
}

function findUnpinnedDockerfileRefs(file, content) {
  const findings = [];
  const stages = new Set();
  content.split('\n').forEach((text, index) => {
    for (const [, pkg] of text.matchAll(latestPackage)) findings.push({ file, line: index + 1, ref: pkg, reason: 'package installed at "latest"' });
    const from = fromPattern.exec(text);
    if (!from) return;
    const [, ref, stage] = from;
    if (!stages.has(ref.toLowerCase())) {
      const reason = checkImage(ref);
      if (reason) findings.push({ file, line: index + 1, ref, reason });
    }
    if (stage) stages.add(stage.toLowerCase());
  });
  return findings;
}

export function findUnpinnedRefs(file, content) {
  if (isDockerfile(file)) return findUnpinnedDockerfileRefs(file, content);
  const findings = [];
  content.split('\n').forEach((text, index) => {
    const uses = usesPattern.exec(text);
    const image = imagePattern.exec(text);
    const ref = uses?.[1] ?? image?.[1];
    const reason = uses ? checkAction(ref, text) : image ? checkImage(ref) : null;
    if (reason) findings.push({ file, line: index + 1, ref, reason });
  });
  return findings;
}

function isChecked(file) {
  if (isDockerfile(file)) return true;
  if (!/\.ya?ml$/.test(file)) return false;
  return file.startsWith('.github/') || /(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test(file);
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: projectRoot, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && isChecked(file) && existsSync(path.join(projectRoot, file)));
  const findings = files.flatMap((file) => findUnpinnedRefs(file, readFileSync(path.join(projectRoot, file), 'utf8')));
  if (findings.length === 0) {
    console.log(`Pinned refs: ${files.length} files checked, all actions and images pinned.`);
    return;
  }
  for (const { file, line, ref, reason } of findings) console.error(`${file}:${line}  ${ref}  (${reason})`);
  console.error(
    `\n${findings.length} unpinned reference(s). Pin actions to a commit SHA with a "# vX.Y.Z" comment and images to a specific version.`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
