import { useRef, useState } from 'react';

/** state反映前の再実行を同期的に拒否し、単一非同期操作の終了処理を保証する。 */
export function useExclusiveMutation() {
  const [isActive, setIsActive] = useState(false);
  const isActiveRef = useRef(false);

  const begin = (): boolean => {
    if (isActiveRef.current) return false;
    isActiveRef.current = true;
    setIsActive(true);
    return true;
  };

  const end = (): void => {
    isActiveRef.current = false;
    setIsActive(false);
  };

  const getIsActive = (): boolean => isActiveRef.current;

  const run = async <T>(mutation: () => Promise<T>): Promise<T | undefined> => {
    if (!begin()) return undefined;
    try {
      return await mutation();
    } finally {
      end();
    }
  };

  return { isActive, run, getIsActive };
}
