import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  css: {
    modules: {
      localsConvention: 'dashesOnly',
    },
  },
  test: {
    include: ['src/test/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: path.resolve(__dirname, 'src/coverage'),
      include: [
        'src/common/csvParse.ts',
        'src/common/arrayUtils.ts',
        'src/common/browserStorage.ts',
        'src/common/castReferences.ts',
        'src/common/downloadTsv.ts',
        'src/common/sheetParsers.ts',
        'src/common/xIdUtils.ts',
        'src/db/initializer.ts',
        'src/db/repositories/groupRowsBy.ts',
        'src/db/repositories/applicantRepository.ts',
        'src/db/repositories/attendanceRepository.ts',
        'src/db/repositories/castRepository.ts',
        'src/db/repositories/commandContext.ts',
        'src/db/repositories/cautionUserRepository.ts',
        'src/db/repositories/eventRepository.ts',
        'src/db/repositories/lotteryRepository.ts',
        'src/db/repositories/sessionWorkflowRepository.ts',
        'src/db/repositories/settingsRepository.ts',
        'src/features/attendance/models/attendanceMatrix.ts',
        'src/features/attendance/models/recordDate.ts',
        'src/features/cast-management/castManagementModel.ts',
        'src/features/data-management/applicantListModel.ts',
        'src/features/data-management/dataManagementNavigation.ts',
        'src/features/data-management/dataManagementViewModel.ts',
        'src/features/import/importPreviewModel.ts',
        'src/features/lottery/services/lottery-draw.ts',
        'src/features/lottery/services/lottery-result-persistence.ts',
        'src/features/lottery/services/lottery-validation.ts',
        'src/features/matching/logics/caution-user.ts',
        'src/features/matching/logics/matching-capacity.ts',
        'src/features/matching/logics/matching-hungarian-engine.ts',
        'src/features/matching/logics/matching-input-integrity.ts',
        'src/features/matching/logics/matching-io.ts',
        'src/features/matching/logics/matching-m003.ts',
        'src/features/matching/logics/matching-result-integrity.ts',
        'src/features/matching/logics/matching-table-engine.ts',
        'src/features/matching/logics/ng-judgment.ts',
        'src/features/matching/presenters/matching-result-export.ts',
        'src/features/matching/presenters/matching-result-view.ts',
        'src/features/matching/stores/matching-settings-store.ts',
        'src/features/ng-management/ngUserManagementModel.ts',
        'src/features/tweet/tweetTemplate.ts',
        'src/layout/appNavigation.ts',
        'src/messages/getMsg.ts',
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

  // `tauri dev`と`tauri build`で使うTauri向けVite設定。
  //
  // 1. Rust errorを確認できるよう、Vite側で画面を消去しない。
  clearScreen: false,
  // 2. Tauriが固定portを使うため、使用中の場合は別portへ切り替えず失敗させる。
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
      // 3. Rust側の変更はViteの監視対象から除外する。
      ignored: ["**/src-tauri/**"],
    },
  },
}));
