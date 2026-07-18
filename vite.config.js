import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'util', 'stream', 'crypto', 'os', 'events', 'path'],
      globals: {
        Buffer: true,
        global: true, // Vital para que GramJS no falle al buscar global.Buffer
      },
    }),
  ],
  
  // Le decimos a Vite que el objeto 'global' de Node es el 'window' del navegador
  define: {
    global: 'window', 
  },

  // Aseguramos que esbuild no rompa las dependencias en la fase de pre-empaquetado
  optimizeDeps: {
    esbuildOptions: {
      keepNames: true,
    }
  },

  build: {
    // Cambiamos a terser para un control absoluto sobre la ofuscación
    minify: 'terser',
    terserOptions: {
      keep_classnames: true, // ¡LA MAGIA REAL AQUÍ!
      keep_fnames: true,     // Evita que las funciones de GramJS se llamen 'd' o 't'
    },
    // Opcional pero recomendado para evitar advertencias de tamaño con GramJS
    chunkSizeWarningLimit: 2000, 
  }
});