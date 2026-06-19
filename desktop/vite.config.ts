import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { excludeDebugPlugin } from "./vite-plugin-exclude-debug";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), excludeDebugPlugin()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  css: {
    modules: {
      localsConvention: 'dashesOnly',
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/common/csvParse.ts',
        'src/common/sheetParsers.ts',
        'src/common/xIdUtils.ts',
        'src/db/repositories/applicantRepository.ts',
        'src/db/repositories/attendanceRepository.ts',
        'src/db/repositories/castRepository.ts',
        'src/db/repositories/commandContext.ts',
        'src/db/repositories/lotteryRepository.ts',
        'src/features/attendance/models/attendanceMatrix.ts',
        'src/features/lottery/services/lottery-draw.ts',
        'src/features/lottery/services/lottery-result-persistence.ts',
        'src/features/lottery/services/lottery-validation.ts',
        'src/features/matching/logics/caution-user.ts',
        'src/features/matching/logics/matching-hungarian-engine.ts',
        'src/features/matching/logics/matching-io.ts',
        'src/features/matching/logics/matching-m001.ts',
        'src/features/matching/logics/matching-m002.ts',
        'src/features/matching/logics/matching-m003.ts',
        'src/features/matching/logics/matching-table-engine.ts',
        'src/features/matching/logics/ng-judgment.ts',
        'src/features/matching/presenters/matching-result-export.ts',
        'src/features/matching/presenters/matching-result-view.ts',
        'src/features/matching/stores/matching-settings-store.ts',
        'src/stores/app-storage-store.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 58,
        functions: 100,
        lines: 80,
        perFile: true,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
