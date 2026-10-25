import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Base path MUST match the deployment target (PLAN §17):
// https://mgonzalvez.github.io/empire-apparently/
export default defineConfig({
  base: '/empire-apparently/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
