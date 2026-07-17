// public/sw.js
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Interceptamos la ruta, ahora esperando que termine en .mp4
  if (url.pathname.startsWith('/stream/')) {
    const range = event.request.headers.get('range') || 'bytes=0-';

    event.respondWith(
      new Promise(async (resolve) => {
        const clients = await self.clients.matchAll();
        if (clients.length === 0) {
           return resolve(new Response("Error: Sin cliente web", {status: 500}));
        }
        
        const messageChannel = new MessageChannel();
        
        messageChannel.port1.onmessage = (event) => {
            if (event.data.error) {
                console.error("SW: Error recibido", event.data.error);
                return resolve(new Response(null, {status: 500}));
            }

            const { chunk, start, end, totalSize } = event.data;
            
            // LA MAGIA: Pasamos el chunk directamente SIN envolverlo en un Blob
            const responseHeaders = new Headers({
                "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunk.byteLength.toString(),
                "Content-Type": 'video/mp4; codecs="avc1.640028, mp4a.40.2"', // <--- CAMBIA ESTA LÍNEA
                "Content-Disposition": "inline"
            });
            
            resolve(new Response(chunk, {
                status: 206,
                headers: responseHeaders
            }));
        };
        
        clients[0].postMessage({
            type: 'REQUEST_CHUNK',
            range: range
        }, [messageChannel.port2]);
      })
    );
  }
});