import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Identifiant de build : le front compare /version.json à cette valeur pour se recharger après un déploiement
const BUILD_ID = process.env.APP_VERSION || new Date().toISOString()

function versionFile() {
  return {
    name: 'messous-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      // Point d'entrée et outillage de test exclus
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80, perFile: true },
    },
  },
})
