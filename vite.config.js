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
  esbuild: {
    // ¡LA MAGIA! Evita que Vite cambie "BigInteger" por "d"
    keepNames: true 
  },
  build: {
    // Nos aseguramos de que el empaquetador respete la regla
    minify: 'esbuild' 
  }
});