import { defineConfig } from 'vite'

// VITE_BASE_PATH lets the GitHub Actions workflow build for a project page
// (e.g. /WhereThisFood/). Local dev falls back to the root.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
})
