// キャスト別NGと要注意人物の二つの管理ワークフローを切り替えるページ。

import { useState, type FC, type KeyboardEvent } from 'react';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import { ConfirmDialog, NoticeDialog } from '@/components/ConfirmModal';
import { getMsg } from '@/messages/getMsg';
import { useAppContext } from '@/stores/AppContext';
import shared from '@/styles/shared.module.css';
import { CastNgPanel } from './components/CastNgPanel';
import { CautionUserPanel } from './components/CautionUserPanel';
import { useCastNgManagement } from './hooks/useCastNgManagement';
import { useCautionUserManagement } from './hooks/useCautionUserManagement';
import { useProfileLinkConfirmation } from './hooks/useProfileLinkConfirmation';
import styles from './NGUserManagementPage.module.css';

export {
  resolveDisplayedThreshold,
  resolveSelectedCastId,
} from './ngUserManagementModel';

export type NgManagementTab = 'cast-ng' | 'caution';

interface NGUserManagementPageProps {
  initialTab?: NgManagementTab;
}

/** 選択中のタブだけへ強調classを加える。 */
function getNgSubTabClassName(isActive: boolean): string {
  return [
    styles.ngSubTab,
    isActive ? styles.ngSubTabActive : '',
  ].filter(Boolean).join(' ');
}

export const NGUserManagementPage: FC<NGUserManagementPageProps> = ({ initialTab = 'cast-ng' }) => {
  // ページ全体で共有するタブ選択と、操作結果を通知するalert。
  const [ngTab, setNgTab] = useState<NgManagementTab>(initialTab);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 両ワークフローが参照するイベント共有データとContext更新契約。
  const {
    casts,
    setCasts,
    matchingSettings,
    setMatchingSettings,
    currentEventName,
  } = useAppContext();

  // 保存調停は各workflowへ分離し、ページはタブと共通ダイアログだけを統括する。
  const castNg = useCastNgManagement({
    casts,
    setCasts,
    currentEventName,
    showAlert: setAlertMessage,
  });
  const cautionUsers = useCautionUserManagement({
    casts,
    matchingSettings,
    setMatchingSettings,
    currentEventName,
    showAlert: setAlertMessage,
  });
  const profileLink = useProfileLinkConfirmation({ showAlert: setAlertMessage });

  // JSXから呼ぶページ単位のタブ・ダイアログ操作。
  function handleCastNgTabClick(): void {
    setNgTab('cast-ng');
  }

  function handleCautionTabClick(): void {
    setNgTab('caution');
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: NgManagementTab): void {
    const currentIndex = tab === 'cast-ng' ? 0 : 1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? 1 : 0;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = 1;
    else return;

    event.preventDefault();
    const nextTab: NgManagementTab = nextIndex === 0 ? 'cast-ng' : 'caution';
    setNgTab(nextTab);
    document.getElementById(`ng-management-tab-${nextTab}`)?.focus();
  }

  const handleCastNgTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => handleTabKeyDown(event, 'cast-ng');
  const handleCautionTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => handleTabKeyDown(event, 'caution');

  function handleAlertConfirm(): void {
    setAlertMessage(null);
  }

  function handleCastNgDeleteConfirm(): void {
    void castNg.confirmDelete();
  }

  function handleCautionDeleteConfirm(): void {
    void cautionUsers.confirmDelete();
  }

  function handleProfileLinkConfirm(): void {
    void profileLink.confirm();
  }

  // 保存状態に追随する確認ラベルと、選択中アカウントのリンク確認文。
  const deleteNgConfirmLabel = castNg.state.isSaving
    ? getMsg('NGUserManagementPage.deleting')
    : getMsg('common.delete');
  const unregisterCautionConfirmLabel = cautionUsers.state.isSaving
    ? getMsg('NGUserManagementPage.unregistering')
    : getMsg('NGUserManagementPage.unregister');
  const deleteNgRegistrationMessage = castNg.pendingDelete
    ? getMsg('NGUserManagementPage.deleteNgRegistrationMessage', {
        label: castNg.pendingDelete.entry.username?.trim()
          || (castNg.pendingDelete.entry.accountId
            ? formatXAccountIdForDisplay(castNg.pendingDelete.entry.accountId)
            : '')
          || getMsg('NGUserManagementPage.ngUserFallback'),
      })
    : '';
  const unregisterCautionMessage = cautionUsers.pendingDeleteAccountId
    ? getMsg('NGUserManagementPage.unregisterCautionMessage', {
        accountId: formatXAccountIdForDisplay(cautionUsers.pendingDeleteAccountId),
      })
    : '';
  const openProfileMessage = profileLink.pendingLink
    ? getMsg('NGUserManagementPage.openLinkMessage', { label: profileLink.pendingLink.label })
    : '';

  return (
    <div className={`${shared.pageWrapper} ${shared.pageWrapperInner} ${styles.ngPage}`}>
      <div className={styles.ngSubTabs} role="tablist" aria-label={getMsg('NGUserManagementPage.tabListLabel')}>
        <button id="ng-management-tab-cast-ng" type="button" role="tab" aria-controls="ng-management-tabpanel" aria-selected={ngTab === 'cast-ng'} tabIndex={ngTab === 'cast-ng' ? 0 : -1} className={getNgSubTabClassName(ngTab === 'cast-ng')} onClick={handleCastNgTabClick} onKeyDown={handleCastNgTabKeyDown}>{getMsg('NGUserManagementPage.castNgTab')}</button>
        <button id="ng-management-tab-caution" type="button" role="tab" aria-controls="ng-management-tabpanel" aria-selected={ngTab === 'caution'} tabIndex={ngTab === 'caution' ? 0 : -1} className={getNgSubTabClassName(ngTab === 'caution')} onClick={handleCautionTabClick} onKeyDown={handleCautionTabKeyDown}>{getMsg('NGUserManagementPage.cautionTab')}</button>
      </div>

      <div id="ng-management-tabpanel" className={shared.pageTabContent} role="tabpanel" aria-labelledby={`ng-management-tab-${ngTab}`} tabIndex={0}>
        {ngTab === 'cast-ng' && <CastNgPanel controller={castNg} onRequestProfileLink={profileLink.request} />}
        {ngTab === 'caution' && <CautionUserPanel controller={cautionUsers} onRequestProfileLink={profileLink.request} />}
      </div>

      {alertMessage && (
        <NoticeDialog
          title={getMsg('InternalManagementPage.ngManagementTab')}
          message={alertMessage}
          closeLabel={getMsg('common.close')}
          onClose={handleAlertConfirm}
        />
      )}
      {castNg.pendingDelete && (
        <ConfirmDialog
          title={getMsg('NGUserManagementPage.deleteNgRegistrationTitle')}
          message={deleteNgRegistrationMessage}
          confirmLabel={deleteNgConfirmLabel}
          cancelLabel={getMsg('common.cancel')}
          confirmDisabled={castNg.state.isSaving}
          intent="danger"
          onConfirm={handleCastNgDeleteConfirm}
          onCancel={castNg.cancelDelete}
        />
      )}
      {cautionUsers.pendingDeleteAccountId && (
        <ConfirmDialog
          title={getMsg('NGUserManagementPage.unregisterCautionTitle')}
          message={unregisterCautionMessage}
          confirmLabel={unregisterCautionConfirmLabel}
          cancelLabel={getMsg('common.cancel')}
          confirmDisabled={cautionUsers.state.isSaving}
          intent="danger"
          onConfirm={handleCautionDeleteConfirm}
          onCancel={cautionUsers.cancelDelete}
        />
      )}
      {profileLink.pendingLink && (
        <ConfirmDialog
          title={getMsg('common.openLink')}
          message={openProfileMessage}
          confirmLabel={getMsg('common.openLink')}
          cancelLabel={getMsg('common.cancel')}
          onConfirm={handleProfileLinkConfirm}
          onCancel={profileLink.cancel}
        />
      )}
    </div>
  );
};
