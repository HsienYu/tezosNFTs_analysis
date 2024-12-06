import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'public/build',
    emptyOutDir: true
  },
  publicDir: 'static' // Change this to a different folder
});