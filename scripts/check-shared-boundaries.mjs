import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Client-safe code lives in the shared workspace package, plus any per-app
// `src/lib/shared` directory. Both must stay free of server-only imports.
const sharedRoots = [
	path.join(projectRoot, 'packages', 'shared', 'src'),
	path.join(projectRoot, 'apps', 'web', 'src', 'lib', 'shared'),
	path.join(projectRoot, 'apps', 'api', 'src', 'lib', 'shared'),
	path.join(projectRoot, 'apps', 'web', 'src', 'lib', 'client'),
];

const targetExtensions = new Set(['.ts', '.js', '.svelte']);

const forbiddenPatterns = [
	{ label: '$lib/server import', regex: /from\s+['"]\$lib\/server\//g },
	{ label: '$env/static/private import', regex: /from\s+['"]\$env\/static\/private['"]/g },
	{ label: '$env/dynamic/private import', regex: /from\s+['"]\$env\/dynamic\/private['"]/g },
	{ label: 'Node built-in import', regex: /from\s+['"]node:/g },
	{ label: 'Relative .server module import', regex: /from\s+['"].*\.server(?:\.[cm]?[jt]s)?['"]/g },
];

async function walk(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') {
			return [];
		}
		throw error;
	}

	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(fullPath)));
			continue;
		}

		if (targetExtensions.has(path.extname(entry.name))) {
			files.push(fullPath);
		}
	}

	return files;
}

function getLineNumber(source, index) {
	return source.slice(0, index).split('\n').length;
}

async function main() {
	const files = (await Promise.all(sharedRoots.map(walk))).flat();
	const violations = [];

	for (const file of files) {
		const source = await readFile(file, 'utf8');

		for (const pattern of forbiddenPatterns) {
			pattern.regex.lastIndex = 0;

			let match = pattern.regex.exec(source);
			while (match) {
				violations.push({
					file,
					line: getLineNumber(source, match.index),
					reason: pattern.label,
					snippet: match[0],
				});

				match = pattern.regex.exec(source);
			}
		}
	}

	if (violations.length > 0) {
		console.error('Shared boundary violations found:\n');
		for (const violation of violations) {
			const relative = path.relative(projectRoot, violation.file);
			console.error(`- ${relative}:${violation.line} [${violation.reason}] ${violation.snippet}`);
		}
		process.exit(1);
	}

	console.log(`Shared boundary check passed (${files.length} files scanned).`);
}

try {
	await main();
} catch (error) {
	console.error('Failed to run shared boundary check.');
	console.error(error);
	process.exit(1);
}
