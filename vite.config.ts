import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: 'public/manifest.json',
      watchFilePaths: ['public/**/*'],
      skipManifestValidation: true,
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
