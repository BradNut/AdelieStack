import { fileTypeFromBuffer } from 'file-type';

/** How much of a file is read to identify it; enough for every signature file-type looks for. */
export const CONTENT_SNIFF_BYTES = 4100;

/**
 * Types a browser runs scripts from. Refused like any other unlisted type, so a caller has to name them to allow them.
 * XML is script-capable too (a browser honours script in an XHTML-namespaced element of any XML document), so listing
 * `application/xml` in `acceptedTypes` is the same explicit choice.
 */
export const ActiveContentType = {
  HTML: 'text/html',
  SVG: 'image/svg+xml',
} as const;

/** A map, not an object, so a root named `constructor` finds nothing. */
const CONTENT_TYPE_BY_ROOT: ReadonlyMap<string, string> = new Map([
  ['svg', ActiveContentType.SVG],
  ['html', ActiveContentType.HTML],
  ['head', ActiveContentType.HTML],
  ['body', ActiveContentType.HTML],
  ['script', ActiveContentType.HTML],
]);

const HTML_ROOT = 'html';
const HTML_DOCTYPE_PATTERN = /^<!doctype\s+html(?=[\s>]|$)/i;
const DOCTYPE_PATTERN = /^<!doctype/i;
/** Captures the local name. It has to be followed by a delimiter: a name the sniff window cuts short could be any name. */
const ROOT_ELEMENT_PATTERN = /^<(?:[^\s/>!?]*:)?([^\s/>!?:]+)[\s/>]/;

/** `head` is decoded by its byte order mark, because file-type recognises a UTF-16 XML declaration as XML. */
const decodeHead = (head: Buffer): string => {
  if (head[0] === 0xff && head[1] === 0xfe) return head.toString('utf16le');
  if (head[0] === 0xfe && head[1] === 0xff) {
    // swap16 works in place and throws on an odd length.
    return Buffer.from(head.subarray(0, head.length - (head.length % 2)))
      .swap16()
      .toString('utf16le');
  }
  return head.toString('utf8');
};

const endOfToken = (text: string, token: string, from: number): number | undefined => {
  const index = text.indexOf(token, from);
  return index === -1 ? undefined : index + token.length;
};

/** Where a DOCTYPE ends. Its internal subset holds `>` of its own, and comments, instructions and literals can hold anything. */
const endOfDoctype = (text: string): number | undefined => {
  let inInternalSubset = false;
  let position: number | undefined = 0;

  while (position !== undefined && position < text.length) {
    const char: string | undefined = text[position];
    if (char === '>' && !inInternalSubset) return position + 1;

    if (text.startsWith('<!--', position)) position = endOfToken(text, '-->', position);
    else if (text.startsWith('<?', position)) position = endOfToken(text, '?>', position);
    else if (char === '"' || char === "'") position = endOfToken(text, char, position + 1);
    else {
      if (char === '[') inInternalSubset = true;
      if (char === ']') inInternalSubset = false;
      position += 1;
    }
  }
  return undefined;
};

/** Where the comment, instruction or DOCTYPE at the start of `text` ends; `undefined` if it does not end, or none is there. */
const endOfPrologueItem = (text: string): number | undefined => {
  if (text.startsWith('<?')) return endOfToken(text, '?>', 2);
  if (text.startsWith('<!--')) return endOfToken(text, '-->', 4);
  if (DOCTYPE_PATTERN.test(text)) return endOfDoctype(text);
  return undefined;
};

/** The lower-cased local name of the document's root element; an HTML doctype counts as `html`. `undefined` if the root is not reached. */
const findRootName = (markup: string): string | undefined => {
  let rest = markup;

  while (true) {
    rest = rest.trimStart();
    if (HTML_DOCTYPE_PATTERN.test(rest)) return HTML_ROOT;

    const rootName = ROOT_ELEMENT_PATTERN.exec(rest)?.[1];
    if (rootName) return rootName.toLowerCase();

    const end = endOfPrologueItem(rest);
    if (end === undefined) return undefined;
    rest = rest.slice(end);
  }
};

/**
 * Identifies a file from its leading bytes; `undefined` when they match nothing known.
 * file-type only recognises binary signatures and calls anything with an XML declaration XML, so markup is judged by its root
 * element first. Markup whose root cannot be seen is left unrecognised, since it could be anything once past what was read.
 */
export const detectContentType = async (head: Buffer): Promise<string | undefined> => {
  const text = decodeHead(head).trimStart();
  if (text.startsWith('<')) {
    const rootName = findRootName(text);
    if (rootName === undefined) return undefined;

    const markupType = CONTENT_TYPE_BY_ROOT.get(rootName);
    if (markupType) return markupType;
  }
  return (await fileTypeFromBuffer(head))?.mime;
};
