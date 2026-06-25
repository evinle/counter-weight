import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@cw/recurrence': path.resolve(__dirname, 'packages/recurrence/src/index.ts'),
      '@cw/filters': path.resolve(__dirname, 'packages/filters/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '.claude/worktrees/**'],
  },
})
