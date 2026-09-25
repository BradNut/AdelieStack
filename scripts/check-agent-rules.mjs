import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesDir = path.join(projectRoot, '.agents', 'rules');

function parseFrontmatter(content) {
	if (!content.startsWith('---\n')) {
		return null;
	}

	const endIndex = content.indexOf('\n---\n', 4);
	if (endIndex === -1) {
		return null;
	}

	const frontmatterSource = content.slice(4, endIndex);
	const values = new Map();

	for (const line of frontmatterSource.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const separatorIndex = trimmed.indexOf(':');
		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		values.set(key, value);
	}

	return values;
}

async function main() {
	const entries = await readdir(rulesDir, { withFileTypes: true });
	const ruleFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => entry.name)
		.sort();

	if (ruleFiles.length === 0) {
		console.error('No agent rule files found under .agents/rules.');
		process.exit(1);
	}

	const violations = [];

	for (const filename of ruleFiles) {
		const fullPath = path.join(rulesDir, filename);
		const source = await readFile(fullPath, 'utf8');
		const frontmatter = parseFrontmatter(source);

		if (!frontmatter) {
			violations.push(`${filename}: missing YAML frontmatter with trigger: always_on`);
			continue;
		}

		const trigger = frontmatter.get('trigger');
		if (trigger !== 'always_on') {
			violations.push(`${filename}: expected trigger: always_on, received ${trigger ?? '(missing)'}`);
		}
	}

	if (violations.length > 0) {
		console.error('Agent rule enforcement failed:\n');
		for (const violation of violations) {
			console.error(`- ${violation}`);
		}
		process.exit(1);
	}

	console.log(`Agent rules enforcement passed (${ruleFiles.length} files validated).`);
}

try {
	await main();
} catch (error) {
	console.error('Failed to validate agent rules.');
	console.error(error);
	process.exit(1);
}
