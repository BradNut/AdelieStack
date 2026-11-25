// Fails when a workflow runs with more privilege than it needs (#269): no top-level `permissions`, a write grant
// at workflow level or without a comment saying why, or a secret mapped anywhere but the step that uses it.
// A dependency install step (the shared setup action, or `pnpm install`) gets no secret at all.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const topLevelKey = /^([\w-]+):/;
const writeGrant = /:\s*write(-all)?\b/;
const trailingComment = /\s#/;
const comment = /^\s*#/;
const secretRef = /\bsecrets\.|^\s*secrets:\s*inherit\b/;
const stepsKey = /^(\s*)steps:\s*$/;
const installStep = /uses:\s*\.\/\.github\/actions\/setup\b|\bpnpm install\b/;
const indentOf = (text) => text.length - text.trimStart().length;

function hasCommentAbove(lines, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue;
    return comment.test(lines[i]);
  }
  return false;
}

export function findPrivilegeIssues(file, content) {
  const lines = content.split('\n');
  const findings = [];
  const add = (index, reason) => findings.push({ file, line: index + 1, reason });
  if (!lines.some((text) => /^permissions:/.test(text))) add(0, 'workflow declares no top-level permissions');

  let section = null;
  // Indent of the open `steps:` key, and whether the step being read installs dependencies.
  let stepsIndent = null;
  let installing = false;
  lines.forEach((text, index) => {
    if (comment.test(text) || text.trim() === '') return;
    section = topLevelKey.exec(text)?.[1] ?? section;
    const indent = indentOf(text);
    if (stepsIndent !== null && indent <= stepsIndent) stepsIndent = null;
    const steps = stepsKey.exec(text);
    if (steps) stepsIndent = steps[1].length;
    else if (stepsIndent !== null && text.trimStart().startsWith('- ') && indent <= stepsIndent + 2) installing = false;
    if (stepsIndent !== null && installStep.test(text)) installing = true;
    if (secretRef.test(text)) {
      if (stepsIndent === null) add(index, 'secret mapped outside the step that uses it');
      else if (installing) add(index, 'dependency install step sees a secret');
    }
    if (!writeGrant.test(text)) return;
    if (section === 'permissions') add(index, 'write grant at workflow level; set it on the job that needs it');
    else if (!trailingComment.test(text) && !hasCommentAbove(lines, index)) add(index, 'write grant without a comment saying why');
  });
  return findings;
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '.github/workflows'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => /\.ya?ml$/.test(file) && existsSync(path.join(projectRoot, file)));
  const findings = files.flatMap((file) => findPrivilegeIssues(file, readFileSync(path.join(projectRoot, file), 'utf8')));
  if (findings.length === 0) {
    console.log(`Workflow permissions: ${files.length} workflows checked, all least privilege.`);
    return;
  }
  for (const { file, line, reason } of findings) console.error(`${file}:${line}  ${reason}`);
  console.error(
    `\n${findings.length} privilege issue(s). Declare read-only permissions, widen them on the job with a comment saying why, and pass each secret only to the step that uses it.`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
