import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const auditedFiles = [
	'AGENTS.md',
	'apps/api/AGENTS.md',
	'apps/web/AGENTS.md',
	'.knowledge-base/AGENTS.md',
	'.knowledge-base/index.md',
	'.knowledge-base/api/index.md',
	'.knowledge-base/web/index.md',
];

const tokenWarningThresholds = new Map([
	['AGENTS.md', 500],
	['apps/api/AGENTS.md', 700],
	['apps/web/AGENTS.md', 700],
	['.knowledge-base/AGENTS.md', 400],
	['.knowledge-base/index.md', 800],
	['.knowledge-base/api/index.md', 800],
	['.knowledge-base/web/index.md', 800],
]);

function estimateTokens(source) {
	const trimmed = source.trim();
	if (!trimmed) {
		return 0;
	}

	const words = trimmed.split(/\s+/u).length;
	const chars = trimmed.length;

	return Math.ceil(Math.max(words * 1.35, chars / 4));
}

function getMarkdownLinks(source) {
	const links = [];
	const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
	let match = linkRegex.exec(source);

	while (match) {
		links.push(match[1]);
		match = linkRegex.exec(source);
	}

	return links;
}

function isExternalLink(link) {
	return /^(?:https?:|mailto:|#)/u.test(link);
}

async function getGitVersion(file) {
	try {
		const { stdout } = await execFileAsync('git', ['show', `HEAD:${file}`], {
			cwd: projectRoot,
			maxBuffer: 1024 * 1024 * 10,
		});

		return stdout;
	} catch {
		return null;
	}
}

async function fileExists(relativePath) {
	try {
		await stat(path.join(projectRoot, relativePath));
		return true;
	} catch {
		return false;
	}
}

async function auditLinks(file, source) {
	const brokenLinks = [];
	const fileDir = path.dirname(file);

	for (const link of getMarkdownLinks(source)) {
		const target = link.split('#', 1)[0];

		if (!target || isExternalLink(target)) {
			continue;
		}

		const normalized = path.normalize(path.join(fileDir, target));

		if (!(await fileExists(normalized))) {
			brokenLinks.push(link);
		}
	}

	return brokenLinks;
}

function formatDelta(current, baseline) {
	if (baseline === null) {
		return 'n/a';
	}

	const delta = current - baseline;
	const sign = delta > 0 ? '+' : '';
	const percent = baseline === 0 ? 0 : (delta / baseline) * 100;

	return `${sign}${delta} (${sign}${percent.toFixed(1)}%)`;
}

function printTable(rows) {
	const headers = ['File', 'Tokens', 'HEAD', 'Delta', 'Limit', 'Status'];
	const widths = headers.map((header, index) =>
		Math.max(
			header.length,
			...rows.map((row) => String(row[index]).length),
		),
	);

	const formatRow = (row) =>
		row.map((cell, index) => String(cell).padEnd(widths[index])).join('  ');

	console.log(formatRow(headers));
	console.log(formatRow(widths.map((width) => '-'.repeat(width))));

	for (const row of rows) {
		console.log(formatRow(row));
	}
}

async function main() {
	const rows = [];
	const brokenLinkReports = [];
	let totalCurrentTokens = 0;
	let totalBaselineTokens = 0;
	let hasBaselineForAll = true;
	let hasWarnings = false;

	for (const file of auditedFiles) {
		const source = await readFile(path.join(projectRoot, file), 'utf8');
		const currentTokens = estimateTokens(source);
		const baselineSource = await getGitVersion(file);
		const baselineTokens = baselineSource === null ? null : estimateTokens(baselineSource);
		const limit = tokenWarningThresholds.get(file) ?? 'n/a';
		const brokenLinks = await auditLinks(file, source);
		const overLimit = typeof limit === 'number' && currentTokens > limit;
		const status = [
			overLimit ? 'over-limit' : 'ok',
			brokenLinks.length > 0 ? 'broken-links' : null,
		].filter(Boolean).join(',');

		if (overLimit || brokenLinks.length > 0) {
			hasWarnings = true;
		}

		if (brokenLinks.length > 0) {
			brokenLinkReports.push({ file, brokenLinks });
		}

		totalCurrentTokens += currentTokens;

		if (baselineTokens === null) {
			hasBaselineForAll = false;
		} else {
			totalBaselineTokens += baselineTokens;
		}

		rows.push([
			file,
			currentTokens,
			baselineTokens ?? 'n/a',
			formatDelta(currentTokens, baselineTokens),
			limit,
			status || 'ok',
		]);
	}

	printTable(rows);
	console.log('');
	console.log(`Current estimated total: ${totalCurrentTokens} tokens`);

	if (hasBaselineForAll) {
		console.log(`HEAD estimated total:    ${totalBaselineTokens} tokens`);
		console.log(`Total delta:             ${formatDelta(totalCurrentTokens, totalBaselineTokens)}`);
	} else {
		console.log('HEAD estimated total:    n/a');
		console.log('Total delta:             n/a');
	}

	if (brokenLinkReports.length > 0) {
		console.error('\nBroken Markdown links:');
		for (const report of brokenLinkReports) {
			console.error(`- ${report.file}`);
			for (const link of report.brokenLinks) {
				console.error(`  - ${link}`);
			}
		}
	}

	if (hasWarnings) {
		process.exit(1);
	}
}

try {
	await main();
} catch (error) {
	console.error('Failed to audit agent doc tokens.');
	console.error(error);
	process.exit(1);
}
