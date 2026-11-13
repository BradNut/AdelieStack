import { describe, expect, it } from 'vitest';
import { ActiveContentType, CONTENT_SNIFF_BYTES, detectContentType } from '#lib/server/api/storage/content-type';
import { createPng } from './storage-test.helpers';

const XML = 'application/xml';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const SVG_ROOT = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

/** The bytes an upload is judged on: never more than the sniff window. */
const headOf = (content: string | Buffer) => Buffer.from(content).subarray(0, CONTENT_SNIFF_BYTES);

const utf16le = (text: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
const utf16be = (text: string) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);

/** A comment of the size that leaves `tail` as the last thing inside the sniff window. */
const commentFillingWindowBefore = (prefix: string, tail: string) => {
  const open = '<!--';
  const close = '-->';
  return `${prefix}${open}${'x'.repeat(CONTENT_SNIFF_BYTES - prefix.length - open.length - close.length - tail.length)}${close}${tail}`;
};

describe('detectContentType', () => {
  describe('a document whose root element is SVG', () => {
    it.each([
      ['a bare root', SVG_ROOT],
      ['an upper-case root', '<SVG></SVG>'],
      ['a root closed at once', '<svg/>'],
      ['a namespace prefix', '<x:svg xmlns:x="http://www.w3.org/2000/svg"></x:svg>'],
      ['a byte order mark and whitespace', `﻿ \n\t${SVG_ROOT}`],
      ['an XML declaration', `${XML_DECLARATION}${SVG_ROOT}`],
      ['a processing instruction', `${XML_DECLARATION}<?xml-stylesheet href="a.css"?>${SVG_ROOT}`],
      ['a comment', `${XML_DECLARATION}<!-- <note> -->\n${SVG_ROOT}`],
      ['an SVG doctype', `${XML_DECLARATION}<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">${SVG_ROOT}`],
      ['a doctype with an internal subset', `<!DOCTYPE svg [<!ENTITY a "b"><!ELEMENT c ANY>]>${SVG_ROOT}`],
      ['a doctype literal that looks like its end', `<!DOCTYPE svg [<!ENTITY a "]><note>">]>${SVG_ROOT}`],
      ['a doctype comment holding an apostrophe', `<!DOCTYPE svg [<!-- it's -->]>${SVG_ROOT}`],
      ['a root that only just fits the window', commentFillingWindowBefore('', '<svg>')],
    ])('is SVG behind %s', async (_label, content) => {
      await expect(detectContentType(headOf(content))).resolves.toBe(ActiveContentType.SVG);
    });

    it.each([
      ['UTF-16 little-endian', utf16le],
      ['UTF-16 big-endian', utf16be],
    ])('is SVG when encoded as %s', async (_label, encode) => {
      await expect(detectContentType(headOf(encode(`${XML_DECLARATION}${SVG_ROOT}`)))).resolves.toBe(ActiveContentType.SVG);
    });

    it('does not fail on an odd number of UTF-16 big-endian bytes', async () => {
      await expect(detectContentType(Buffer.from([0xfe, 0xff, 0x00]))).resolves.toBeUndefined();
    });
  });

  describe('a document whose root element is HTML', () => {
    it.each([
      ['an html root', '<html></html>'],
      ['a head root', '<head><title>t</title></head>'],
      ['a body root', '<body></body>'],
      ['a script root', '<script>alert(1)</script>'],
      ['an upper-case root', '<HTML></HTML>'],
      ['a namespace prefix', '<h:html xmlns:h="http://www.w3.org/1999/xhtml"></h:html>'],
      ['an HTML doctype', '<!doctype html><p>hi</p>'],
      ['an HTML doctype in capitals', '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p>hi</p>'],
      ['an HTML doctype behind a comment', '<!-- a page --><!doctype html><p>hi</p>'],
      ['an HTML doctype cut off by the window', '<!doctype html'],
      ['an unrelated doctype before an html root', '<!DOCTYPE note><html></html>'],
      ['a page embedding SVG', '<!doctype html><html><body><svg></svg></body></html>'],
    ])('is HTML with %s', async (_label, content) => {
      await expect(detectContentType(headOf(content))).resolves.toBe(ActiveContentType.HTML);
    });
  });

  describe('a document with any other root element', () => {
    it.each([
      ['containing a body element', '<note><body>hi</body></note>'],
      ['containing an svg element', '<note><svg/></note>'],
      ['containing a script element', '<note><script/></note>'],
      ['whose comment mentions svg', '<!-- <svg> --><note/>'],
      ['whose instruction mentions html', '<?html ?><note/>'],
      ['whose root merely starts like svg', '<svgdoc/>'],
      ['whose doctype merely starts like html', '<!DOCTYPE htmlish><note/>'],
      ['whose root shares a name with an object member', '<constructor/>'],
    ])('stays XML when it is declared XML %s', async (_label, content) => {
      await expect(detectContentType(headOf(`${XML_DECLARATION}${content}`))).resolves.toBe(XML);
    });

    it.each([
      ['an element that is no document format', '<p>hello</p>'],
      ['undeclared XML', '<note><body>hi</body></note>'],
    ])('leaves %s unrecognised', async (_label, content) => {
      await expect(detectContentType(headOf(content))).resolves.toBeUndefined();
    });
  });

  describe('a document whose root is not reached within the window', () => {
    it.each([
      ['a huge leading comment', `${XML_DECLARATION}<!--${'x'.repeat(CONTENT_SNIFF_BYTES)}-->${SVG_ROOT}`],
      ['a huge processing instruction', `${XML_DECLARATION}<?pad ${'x'.repeat(CONTENT_SNIFF_BYTES)}?>${SVG_ROOT}`],
      ['a huge doctype', `${XML_DECLARATION}<!DOCTYPE svg [${'x'.repeat(CONTENT_SNIFF_BYTES)}]>${SVG_ROOT}`],
      ['a doctype literal never closed', `${XML_DECLARATION}<!DOCTYPE svg "unclosed>${SVG_ROOT}`],
      ['a comment never closed', `${XML_DECLARATION}<!-- ${SVG_ROOT}`],
      ['a root name cut off by the window', commentFillingWindowBefore(XML_DECLARATION, '<sv')],
      ['a declaration with nothing after it', XML_DECLARATION],
      ['text instead of a root', `${XML_DECLARATION}text${SVG_ROOT}`],
    ])('is unrecognised behind %s', async (_label, content) => {
      await expect(detectContentType(headOf(content))).resolves.toBeUndefined();
    });
  });

  describe('a file that is not markup', () => {
    it('is identified from its binary signature', async () => {
      await expect(detectContentType(await createPng(4, 4))).resolves.toBe('image/png');
    });

    it.each([
      ['plain text', 'just some text'],
      ['nothing at all', ''],
    ])('leaves %s unrecognised', async (_label, content) => {
      await expect(detectContentType(headOf(content))).resolves.toBeUndefined();
    });
  });
});
