import { useRef, useState } from 'react';
import { getMsg } from '@/messages/getMsg';
import { openExternalUrl } from '@/tauri';
import { buildXProfileUrl } from '../ngUserManagementModel';

export interface PendingProfileLink {
  label: string;
  url: string;
}

interface UseProfileLinkConfirmationParams {
  showAlert: (message: string) => void;
}

/** 二つのNG管理パネルで共有する、Xプロフィールの確認と外部起動を管理する。 */
export function useProfileLinkConfirmation({
  showAlert,
}: UseProfileLinkConfirmationParams) {
  // 確認ダイアログに表示するアカウント名と、確認後にだけ開くURL。
  const [pendingLink, setPendingLink] = useState<PendingProfileLink | null>(null);

  // ダイアログの連続確定で外部リンクを重複起動しないための同期ガード。
  const isOpeningRef = useRef(false);

  function request(accountId: string | undefined, fallbackLabel: string): void {
    const url = buildXProfileUrl(accountId);
    if (!url) return;
    setPendingLink({ label: accountId ?? fallbackLabel, url });
  }

  async function confirm(): Promise<void> {
    if (!pendingLink || isOpeningRef.current) return;
    const { url } = pendingLink;
    isOpeningRef.current = true;
    setPendingLink(null);
    try {
      await openExternalUrl(url);
    } catch {
      showAlert(getMsg('NGUserManagementPage.openProfileFailed'));
    } finally {
      isOpeningRef.current = false;
    }
  }

  function cancel(): void {
    if (!isOpeningRef.current) setPendingLink(null);
  }

  return { pendingLink, request, confirm, cancel };
}
