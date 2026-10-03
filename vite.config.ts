import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, maxWorkers: 2 },
});
