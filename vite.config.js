import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      // Añadimos 'os', 'events' y 'path' a la lista
      include: ['buffer', 'util', 'stream', 'crypto', 'os', 'events', 'path'],
      globals: {
        Buffer: true,
      },
    }),
  ],
});