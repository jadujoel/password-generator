/// <reference types="bun-types" />
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

Bun.serve({
  port: 3002,
  async fetch(request: Request) {
    let url = new URL(request.url);

    // Common headers for caching
    const headers = new Headers();

    // Handle API Requests
    if (url.pathname.startsWith("/api/")) {
      const api = url.pathname.slice(5);
      const file = Bun.file(`api/${api}.ts`);
      return file.exists().then((exists) => {
        if (exists) {
          // headers.set('Cache-Control', 'no-cache'); // API responses should not be cached
          return import(file.name!).then((mod) => mod.default(request));
        } else {
          return new Response("Not Found", { status: 404, headers });
        }
      });
    }

    // Determine if the client accepts gzip encoding
    const acceptEncoding = request.headers.get('Accept-Encoding') ?? '';
    const canGzip = acceptEncoding.includes('gzip');

    // Handle public file requests
    if (request.method === "GET") {
      if (!url.pathname.includes(".")) {
        url.pathname += "/index.html";
      }

      const path = `public/${url.pathname}`;
      const file = Bun.file(path);
      const exists = await file.exists();

      if (exists) {
        const fileBuffer = await file.arrayBuffer();
        const fileHash = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex');

        // ETag and conditional GET support
        const ifNoneMatch = request.headers.get('If-None-Match');
        if (ifNoneMatch === fileHash) {
          return new Response(null, { status: 304, headers }); // Not Modified
        }

        headers.set('ETag', fileHash);
        headers.set('Content-Type', determineContentType(path));

        if (canGzip) {
          // Compress the content using zlib if the client accepts gzip encoding
          return new Promise((resolve, reject) => {
            zlib.gzip(Buffer.from(fileBuffer), (err, buffer) => {
              if (err) {
                reject(new Response("Internal Server Error", { status: 500 }));
              } else {
                headers.set('Content-Encoding', 'gzip');
                resolve(new Response(buffer, { headers }));
              }
            });
          });
        } else {
          return new Response(fileBuffer, { headers });
        }
      } else {
        return new Response("Not Found", { status: 404, headers });
      }
    }
  }
});

console.log('Server running on http://localhost:3002');

const extensionMap = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ico: 'image/x-icon',
  png: 'image/png',
  webp: 'image/webp',
  json: 'application/json',
} as const

function determineContentType(path: string): string {
  return extensionMap[path.split('.').pop() as keyof typeof extensionMap] ?? 'application/octet-stream';
}
