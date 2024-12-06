import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'build', // Change this to 'build'
    emptyOutDir: true
  },
  publicDir: 'static'
});