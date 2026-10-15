// Transport réel contre un petit serveur local : connexion sur l'adresse validée (pas de résolution du nom),
// décompression bornée, aucune redirection suivie. Le serveur écoute sur 127.0.0.1 : c'est `safe-fetch` qui
// interdit ces adresses, le transport, lui, doit seulement obéir à l'adresse qu'on lui donne.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeTransport } from './node-transport';

let server: http.Server;
let port = 0;
let lastHost = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastHost = req.headers.host ?? '';
    if (req.url === '/gzip') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      res.end(zlib.gzipSync('<p>compressé</p>'));
    } else if (req.url === '/bomb') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      res.end(zlib.gzipSync(Buffer.alloc(5_000_000, 97)));
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: 'http://169.254.169.254/' });
      res.end();
    } else if (req.url === '/weird') {
      res.writeHead(200, { 'content-encoding': 'compress' });
      res.end('x');
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<p>ok</p>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
});

async function get(path: string, address = '127.0.0.1') {
  // Le nom `site-public.example.invalid` n'existe pas : seule l'adresse figée peut faire aboutir la connexion.
  const response = await nodeTransport({
    url: new URL(`http://site-public.example.invalid:${String(port)}${path}`),
    address,
    headers: { 'user-agent': 'test' },
    signal: AbortSignal.timeout(3000),
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    chunks.push(chunk);
    size += chunk.length;
  }
  return { response, text: Buffer.concat(chunks).toString('utf8'), size };
}

describe('nodeTransport', () => {
  it('anti-rebinding : se connecte sur l’adresse validée sans résoudre le nom, et garde le nom dans Host', async () => {
    const { response, text } = await get('/');
    expect(response.status).toBe(200);
    expect(text).toBe('<p>ok</p>');
    expect(lastHost).toBe(`site-public.example.invalid:${String(port)}`);
  });

  it('décompresse un corps gzip', async () => {
    expect((await get('/gzip')).text).toBe('<p>compressé</p>');
  });

  it('ne suit jamais une redirection : elle est rendue telle quelle à safe-fetch, qui la revérifie', async () => {
    const { response } = await get('/redirect');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('http://169.254.169.254/');
  });

  it('un encodage inconnu est refusé au lieu de lire des octets illisibles', async () => {
    await expect(get('/weird')).rejects.toThrow();
  });

  it('un nom sans adresse figée ne se résout pas : une adresse inaccessible échoue (aucune seconde résolution)', async () => {
    await expect(get('/', '203.0.113.1')).rejects.toThrow();
  }, 10_000);

  it('bombe de décompression : le lecteur peut s’arrêter et fermer, la taille lue reste bornée par l’appelant', async () => {
    const response = await nodeTransport({
      url: new URL(`http://site-public.example.invalid:${String(port)}/bomb`),
      address: '127.0.0.1',
      headers: {},
      signal: AbortSignal.timeout(3000),
    });
    let read = 0;
    for await (const chunk of response.body) {
      read += chunk.length;
      if (read >= 10_000) break;
    }
    response.close();
    expect(read).toBeGreaterThanOrEqual(10_000);
    expect(read).toBeLessThan(5_000_000);
  });
});
