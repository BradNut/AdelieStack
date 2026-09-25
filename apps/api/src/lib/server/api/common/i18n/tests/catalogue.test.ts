import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');
const webRoot = path.resolve(apiRoot, '../web');

type InlangSettings = {
  baseLocale: string;
  locales: string[];
  'plugin.inlang.messageFormat': { pathPattern: string[] };
};

type MessageFile = Record<string, string>;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function readSettings(appRoot: string) {
  return readJson<InlangSettings>(path.join(appRoot, 'project.inlang/settings.json'));
}

function messageKeys(file: MessageFile) {
  return Object.keys(file).filter((key) => key !== '$schema');
}

/** Keys present in the base locale file but absent from a translation. */
function findMissingKeys(base: MessageFile, translation: MessageFile) {
  const translated = new Set(messageKeys(translation));
  return messageKeys(base).filter((key) => !translated.has(key));
}

const LOCALE_DIR_PATTERN = /^\.\/messages\/\{locale\}\/[\w-]+\.json$/;

describe('message catalogue', () => {
  const apiSettings = readSettings(apiRoot);
  const webSettings = readSettings(webRoot);
  const apiPatterns = apiSettings['plugin.inlang.messageFormat'].pathPattern;

  it('shares the base locale and locale list with the web app', () => {
    expect(apiSettings.baseLocale).toBe(webSettings.baseLocale);
    expect(apiSettings.locales).toEqual(webSettings.locales);
  });

  it('uses the same per-locale directory layout as the web app', () => {
    const webPatterns = webSettings['plugin.inlang.messageFormat'].pathPattern;
    for (const pattern of [...apiPatterns, ...webPatterns]) {
      expect(pattern).toMatch(LOCALE_DIR_PATTERN);
    }
    expect(readdirSync(path.join(apiRoot, 'messages')).sort()).toEqual([...apiSettings.locales].sort());
  });

  it('defines every base-locale message key in every locale', () => {
    for (const pattern of apiPatterns) {
      const fileFor = (locale: string) => readJson<MessageFile>(path.join(apiRoot, pattern.replace('{locale}', locale)));
      const base = fileFor(apiSettings.baseLocale);
      expect(messageKeys(base).length).toBeGreaterThan(0);
      for (const locale of apiSettings.locales) {
        const translation = fileFor(locale);
        expect({ locale, missing: findMissingKeys(base, translation) }).toEqual({ locale, missing: [] });
        expect({ locale, extra: findMissingKeys(translation, base) }).toEqual({ locale, extra: [] });
      }
    }
  });

  it('reports keys missing from a translation', () => {
    const base = { $schema: 'x', greeting: 'Hi', farewell: 'Bye' };
    expect(findMissingKeys(base, { $schema: 'x', greeting: 'Hallo' })).toEqual(['farewell']);
    expect(findMissingKeys(base, {})).toEqual(['greeting', 'farewell']);
    expect(findMissingKeys(base, { greeting: 'Hallo', farewell: 'Tschüss' })).toEqual([]);
  });
});
