/**
 * 本番ビルド時に src/debug をバンドル対象外にする。
 * 開発時は通常どおり読み込まれる。
 */
import type { Plugin } from 'vite';

const DEBUG_VIRTUAL_ID = 'virtual:debug-stub';
const DEBUG_RESOLVE_ID = '\0' + DEBUG_VIRTUAL_ID;

export function excludeDebugPlugin(): Plugin {
  return {
    name: 'exclude-debug-in-production',
    apply: 'build',
    resolveId(id) {
      if (id === '../debug' || id.startsWith('../debug/') || id === 'src/debug' || id === '@/debug') {
        return DEBUG_RESOLVE_ID;
      }
      return null;
    },
    load(id) {
      if (id === DEBUG_RESOLVE_ID) {
        return 'export const DebugPage = () => null;';
      }
      return null;
    },
  };
}
