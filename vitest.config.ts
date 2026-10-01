import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', include: ['tests/*.test.tsx'], setupFiles: ['tests/setup.ts'], pool: 'threads', maxWorkers: 1, minWorkers: 1 } });
