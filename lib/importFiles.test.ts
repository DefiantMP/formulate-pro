import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { MAX_IMPORT_BYTES, classifyImport, readDocx, readTextFile } from './importFiles';

function docx(bodyXml: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${bodyXml}</w:body></w:document>`
    ),
  });
}

describe('classifyImport', () => {
  it('recognises each supported kind, trusting the extension over a generic type', () => {
    expect(classifyImport('notes.txt', '', 10)).toMatchObject({ ok: true, kind: 'text' });
    expect(classifyImport('notes.md', 'application/octet-stream', 10)).toMatchObject({ ok: true, kind: 'text' });
    expect(classifyImport('sheet.pdf', '', 10)).toMatchObject({ ok: true, kind: 'pdf' });
    expect(classifyImport('page.JPG', '', 10)).toMatchObject({ ok: true, kind: 'image', mediaType: 'image/jpeg' });
    expect(classifyImport('scan.png', 'image/png', 10)).toMatchObject({ ok: true, kind: 'image' });
    expect(classifyImport('report.docx', '', 10)).toMatchObject({ ok: true, kind: 'docx' });
  });

  it('refuses HEIC and old .doc with a message saying what to do instead', () => {
    const heic = classifyImport('IMG_0001.HEIC', 'image/heic', 10);
    expect(heic).toMatchObject({ ok: false });
    expect(!heic.ok && heic.error).toMatch(/JPEG/);
    const doc = classifyImport('old.doc', 'application/msword', 10);
    expect(!doc.ok && doc.error).toMatch(/\.docx/);
  });

  it('refuses empty, oversized and unknown files', () => {
    expect(classifyImport('a.txt', '', 0).ok).toBe(false);
    expect(classifyImport('a.txt', '', MAX_IMPORT_BYTES + 1).ok).toBe(false);
    expect(classifyImport('a.exe', 'application/octet-stream', 10).ok).toBe(false);
  });
});

describe('readTextFile', () => {
  it('strips a byte-order mark and normalises line endings', () => {
    expect(readTextFile(strToU8('﻿line one\r\nline two\r\n'))).toBe('line one\nline two');
  });
});

describe('readDocx', () => {
  it('reads paragraphs in order, with tabs, breaks and escaped characters', () => {
    const bytes = docx(
      '<w:p><w:r><w:t>PB14G capping</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t xml:space="preserve">Mag stearate </w:t></w:r><w:r><w:t>1% &amp; PVPP &lt;5%</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Weight</w:t><w:tab/><w:t>0.58 g</w:t><w:br/><w:t>next line</w:t></w:r></w:p>'
    );
    expect(readDocx(bytes)).toBe('PB14G capping\nMag stearate 1% & PVPP <5%\nWeight\t0.58 g\nnext line');
  });

  it('explains a file that is not a Word document', () => {
    expect(() => readDocx(strToU8('not a zip'))).toThrow(/could not be opened/);
    expect(() => readDocx(zipSync({ 'other.xml': strToU8('<x/>') }))).toThrow(/not a readable Word/);
  });
});
