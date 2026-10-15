// Vrai type d'un fichier par ses premiers octets (TR-SEC-08, SECURITY_NOTES §3.3).
import { describe, expect, it } from 'vitest';
import { maxBytesFor, MIB, sniffFileType } from './file-types';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

describe('sniffFileType', () => {
  it('TR-SEC-08 : reconnaît PNG, JPEG, WebP, PDF et DOCX par leurs premiers octets', () => {
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffFileType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8 ')))).toBe(
      'image/webp',
    );
    expect(sniffFileType(bytes(...ascii('%PDF-1.7')))).toBe('application/pdf');
    expect(sniffFileType(bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('TR-SEC-08 : un exécutable, du HTML, un GIF, un WAV (RIFF sans WEBP) ou un fichier vide sont refusés', () => {
    expect(sniffFileType(bytes(...ascii('MZ'), 0x90, 0))).toBeNull();
    expect(sniffFileType(bytes(...ascii('<html><script>')))).toBeNull();
    expect(sniffFileType(bytes(...ascii('GIF89a')))).toBeNull();
    expect(sniffFileType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVEfmt ')))).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
    expect(sniffFileType(bytes(0x89, 0x50))).toBeNull();
  });
});

describe('maxBytesFor', () => {
  it('TR-SEC-08 : 10 Mo pour une image, 20 Mo pour un PDF ou un DOCX', () => {
    expect(maxBytesFor('image/png')).toBe(10 * MIB);
    expect(maxBytesFor('application/pdf')).toBe(20 * MIB);
  });
});
