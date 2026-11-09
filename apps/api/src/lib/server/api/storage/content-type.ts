import { fileTypeFromBuffer } from 'file-type';

/** How much of a file is read to identify it; enough for every signature file-type looks for. */
export const CONTENT_SNIFF_BYTES = 4100;

/** Types a browser runs scripts from. Refused like any other unlisted type, so a caller has to name them to allow them. */
export const ActiveContentType = {
  HTML: 'text/html',
  SVG: 'image/svg+xml',
} as const;

const MARKUP_ROOT_PATTERN = /<(svg|html|head|body|script|!doctype\s+html)[\s>/]/i;

/** file-type only recognises binary signatures, and reads an SVG as XML, so markup is identified here first. */
const detectMarkup = (head: Buffer): string | undefined => {
  const text = head.toString('utf8').trimStart();
  if (!text.startsWith('<')) return undefined;

  const root = MARKUP_ROOT_PATTERN.exec(text)?.[1];
  if (!root) return undefined;
  return root.toLowerCase() === 'svg' ? ActiveContentType.SVG : ActiveContentType.HTML;
};

/** Identifies a file from its leading bytes; `undefined` when they match nothing known. */
export const detectContentType = async (head: Buffer): Promise<string | undefined> => detectMarkup(head) ?? (await fileTypeFromBuffer(head))?.mime;
