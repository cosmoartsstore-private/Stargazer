import {
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { ExternalLink } from 'lucide-react';
import type { CautionUser } from '@/common/types/entities';
import {
  flushPendingPageCommits,
  registerPendingPageCommit,
} from '@/common/pageCommitRegistry';
import {
  buildXProfileUrl,
  formatXAccountIdForDisplay,
} from '@/common/xIdUtils';
import { getMsg } from '@/messages/getMsg';
import type { CautionCandidate } from '@/features/matching/logics/caution-user';
import shared from '@/styles/shared.module.css';
import type { CautionFormValues } from '../ngUserManagementModel';
import styles from '../NGUserManagementPage.module.css';
import { EntryDetailsEditor } from './EntryDetailsEditor';

export interface CautionUserPanelController {
  state: {
    cautionUsers: CautionUser[];
    candidates: CautionCandidate[];
    displayedThreshold: number;
    thresholdDraft: string;
    form: CautionFormValues;
    isSaving: boolean;
    isSavingThreshold: boolean;
  };
  actions: {
    setThresholdDraft: (value: string) => void;
    commitThreshold: (draft: string) => Promise<boolean>;
    updateForm: (patch: Partial<CautionFormValues>) => void;
    addManual: () => Promise<void>;
    addCandidate: (candidate: CautionCandidate) => Promise<void>;
    requestDelete: (accountId: string) => void;
    updateDetails: (accountId: string, notes: string) => Promise<void>;
  };
}

export interface CautionUserPanelProps {
  controller: CautionUserPanelController;
  notesDiscardGeneration: number;
  onEntryNotesDirtyChange: (editorId: string, dirty: boolean) => void;
  onRequestProfileLink: (accountId: string | undefined, fallbackLabel: string) => void;
}

interface CautionCandidateCardProps {
  candidate: CautionCandidate;
  isSaving: boolean;
  onAdd: (candidate: CautionCandidate) => Promise<void>;
}

function CautionCandidateCard({ candidate, isSaving, onAdd }: CautionCandidateCardProps) {
  const displayAccountId = formatXAccountIdForDisplay(candidate.accountId);

  function handleAddClick(): void {
    void onAdd(candidate);
  }

  return (
    <div className={styles.cautionCandidateCard}>
      <div className={styles.cautionCandidateId}>{displayAccountId}</div>
      <div className={styles.cautionCandidateNames}>
        {candidate.usernames.length > 0
          ? candidate.usernames.map((name) => (
            <span key={name} className={styles.cautionCandidateNameChip}>{name}</span>
          ))
          : <span className={styles.cautionCandidateNoname}>{getMsg('common.unnamed')}</span>}
      </div>
      <div className={styles.cautionCandidateCasts}>
        <span className={styles.cautionCandidateCountText}>{getMsg('NGUserManagementPage.candidateNgCount', { count: candidate.castCount })}</span>
      </div>
      <button type="button" className={`${shared.btnPrimary} ${styles.cautionCandidateAddBtn}`} aria-label={`${displayAccountId} ${getMsg('NGUserManagementPage.addToCaution')}`} disabled={isSaving} onClick={handleAddClick}>{isSaving ? getMsg('common.saving') : getMsg('NGUserManagementPage.addToCaution')}</button>
    </div>
  );
}

interface CautionUserRowProps {
  user: CautionUser;
  isSaving: boolean;
  notesDiscardGeneration: number;
  onRequestDelete: (accountId: string) => void;
  onEntryNotesDirtyChange: (editorId: string, dirty: boolean) => void;
  onUpdateDetails: (accountId: string, notes: string) => Promise<void>;
  onRequestProfileLink: (accountId: string | undefined, fallbackLabel: string) => void;
}

function CautionUserRow({
  user,
  isSaving,
  notesDiscardGeneration,
  onRequestDelete,
  onEntryNotesDirtyChange,
  onUpdateDetails,
  onRequestProfileLink,
}: CautionUserRowProps) {
  // 対象アカウントからリンク可否と各操作の表示ラベルを導出する。
  const hasProfileLink = buildXProfileUrl(user.accountId) !== null;
  const displayAccountId = formatXAccountIdForDisplay(user.accountId);
  const isCandidateRegistration = (user.ngCastCount ?? 0) > 0;
  const openProfileAriaLabel = getMsg(
    'NGUserManagementPage.openXAccountAriaLabel',
    { accountId: displayAccountId },
  );
  const unregisterCautionAriaLabel = getMsg(
    'NGUserManagementPage.unregisterCautionAriaLabel',
    { accountId: displayAccountId },
  );

  // この行の型付き対象を、各DOMイベントから直接親の操作へ渡す。
  function handleProfileLinkClick(): void {
    onRequestProfileLink(user.accountId, displayAccountId);
  }

  function handleDeleteClick(): void {
    void (async () => {
      if (!await flushPendingPageCommits()) return;
      onRequestDelete(user.accountId);
    })();
  }

  function handleDetailsSave(notes: string): Promise<void> {
    return onUpdateDetails(user.accountId, notes);
  }

  return (
    <div className={styles.ngDetailItem}>
      <div className={styles.ngDetailSummary}>
        <div className={styles.ngCastGrid__text}>
          <span className={styles.ngCastGrid__textName}>{user.username}</span>
          <span className={styles.ngCastGrid__textId}>{displayAccountId}</span>
        </div>
        {hasProfileLink && (
          <button type="button" className={styles.ngLinkButton} aria-label={openProfileAriaLabel} onClick={handleProfileLinkClick}><ExternalLink size={14} /></button>
        )}
        {isCandidateRegistration && (
          <span className={`${styles.ngPage__badge} ${styles.ngPage__badgeCandidate}`}>{getMsg('NGUserManagementPage.candidateRegistration')}</span>
        )}
        {!isCandidateRegistration && (
          <span className={`${styles.ngPage__badge} ${styles.ngPage__badgeManual}`}>{getMsg('NGUserManagementPage.manualRegistration')}</span>
        )}
        <button type="button" className={styles.ngCastGrid__remove} aria-label={unregisterCautionAriaLabel} onClick={handleDeleteClick}>×</button>
      </div>
      <EntryDetailsEditor notes={user.notes} disabled={isSaving} discardGeneration={notesDiscardGeneration} saveTargetLabel={displayAccountId} onSave={handleDetailsSave} onDirtyChange={onEntryNotesDirtyChange} />
    </div>
  );
}

/** 要注意人物候補と登録済み一覧を、同一の保存状態に合わせて表示する。 */
export function CautionUserPanel({ controller, notesDiscardGeneration, onEntryNotesDirtyChange, onRequestProfileLink }: CautionUserPanelProps) {
  const thresholdInputId = useId();
  const thresholdSuffixId = useId();
  const thresholdInputRef = useRef<HTMLInputElement>(null);

  // controllerが管理する候補、登録済み一覧、入力状態。
  const {
    cautionUsers,
    candidates,
    displayedThreshold,
    thresholdDraft,
    form,
    isSaving,
    isSavingThreshold,
  } = controller.state;

  // controllerが提供する閾値、登録、削除、詳細更新操作。
  const {
    setThresholdDraft,
    commitThreshold,
    updateForm,
    addManual,
    addCandidate,
    requestDelete,
    updateDetails,
  } = controller.actions;
  const thresholdCommitRef = useRef(commitThreshold);
  thresholdCommitRef.current = commitThreshold;

  // 入力欄の表示中だけ、画面遷移前に最新の閾値を確定できるよう登録する。
  useEffect(
    () => registerPendingPageCommit(() => {
      const input = thresholdInputRef.current;
      return input ? thresholdCommitRef.current(input.value) : Promise.resolve(true);
    }),
    [],
  );

  // 候補閾値のDOMイベントを下書き更新と保存へ接続する。
  function handleThresholdChange(event: ChangeEvent<HTMLInputElement>): void {
    setThresholdDraft(event.target.value);
  }

  function handleThresholdBlur(event: FocusEvent<HTMLInputElement>): void {
    void commitThreshold(event.currentTarget.value);
  }

  function handleThresholdKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  // 手動登録フォームの各入力を、対応する項目だけの更新へ接続する。
  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>): void {
    updateForm({ username: event.target.value });
  }

  function handleAccountIdChange(event: ChangeEvent<HTMLInputElement>): void {
    updateForm({ accountId: event.target.value });
  }

  function handleNotesChange(event: ChangeEvent<HTMLInputElement>): void {
    updateForm({ notes: event.target.value });
  }

  function handleAddInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') void addManual();
  }

  function handleAddClick(): void {
    void addManual();
  }

  return (
    <div className={styles.ngPage}>
      {/* 候補セクション */}
      <div className={styles.ngPage__section}>
        <div className={styles.ngPage__sectionHeader}>
          <div className={styles.cautionSectionHeaderLayout}>
            <div>
              <h2 className={styles.ngPage__sectionTitle}>{getMsg('NGUserManagementPage.candidatesHeading')}</h2>
              <p className={styles.ngPage__sectionDesc}>{getMsg('NGUserManagementPage.candidatesDescription')}</p>
            </div>
            <div className={styles.cautionThresholdCtrl}>
              <label htmlFor={thresholdInputId} className={styles.cautionThresholdLabel}>{getMsg('NGUserManagementPage.ngCastCount')}</label>
              <input ref={thresholdInputRef} id={thresholdInputId} type="number" min={1} className={`${shared.formInput} ${styles.cautionThresholdInput}`} value={thresholdDraft} disabled={isSavingThreshold} aria-describedby={thresholdSuffixId} onChange={handleThresholdChange} onBlur={handleThresholdBlur} onKeyDown={handleThresholdKeyDown} />
              <span id={thresholdSuffixId} className={styles.cautionThresholdLabel}>{getMsg('NGUserManagementPage.candidateThresholdSuffix')}</span>
            </div>
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className={styles.ngDetailEmpty}>
            {getMsg('NGUserManagementPage.noCandidates', { threshold: displayedThreshold })}
          </div>
        ) : (
          <div className={styles.cautionCandidateList}>
            {candidates.map((candidate) => (
              <CautionCandidateCard key={candidate.accountId} candidate={candidate} isSaving={isSaving} onAdd={addCandidate} />
            ))}
          </div>
        )}
      </div>

      {/* 登録済みセクション */}
      <div className={styles.ngPage__section}>
        <div className={styles.ngPage__sectionHeader}>
          <h2 className={styles.ngPage__sectionTitle}>{getMsg('NGUserManagementPage.registeredCautionHeading')}</h2>
          <p className={styles.ngPage__sectionDesc}>{getMsg('NGUserManagementPage.registeredCautionDescription')}</p>
        </div>
        <div className={`${styles.ngPage__addRow} ${styles.ngPage__addRowSpaced}`}>
          <input type="text" className={`${shared.formInput} ${styles.ngPage__addInputName}`} placeholder={getMsg('NGUserManagementPage.usernamePlaceholder')} aria-label={getMsg('NGUserManagementPage.usernamePlaceholder')} value={form.username} onChange={handleUsernameChange} />
          <input type="text" className={`${shared.formInput} ${styles.ngPage__addInputId}`} placeholder={getMsg('NGUserManagementPage.xIdPlaceholder')} aria-label={getMsg('NGUserManagementPage.xIdPlaceholder')} value={form.accountId} onChange={handleAccountIdChange} onKeyDown={handleAddInputKeyDown} />
          <input type="text" className={`${shared.formInput} ${styles.ngPage__addInputNotes}`} placeholder={getMsg('NGUserManagementPage.optionalReasonAndNotes')} aria-label={getMsg('NGUserManagementPage.optionalReasonAndNotes')} value={form.notes} onChange={handleNotesChange} onKeyDown={handleAddInputKeyDown} />
          <button type="button" className={`${shared.btnPrimary} ${shared.btnFixedH}`} disabled={isSaving} onClick={handleAddClick}>{isSaving ? getMsg('common.saving') : getMsg('NGUserManagementPage.registerCaution')}</button>
        </div>

        {cautionUsers.length === 0 ? (
          <div className={styles.ngDetailEmpty}>{getMsg('NGUserManagementPage.noCautionRegistrations')}</div>
        ) : (
          <div className={styles.ngDetailList}>
            {cautionUsers.map((user) => (
              <CautionUserRow
                key={user.accountId}
                user={user}
                isSaving={isSaving}
                notesDiscardGeneration={notesDiscardGeneration}
                onRequestDelete={requestDelete}
                onEntryNotesDirtyChange={onEntryNotesDirtyChange}
                onUpdateDetails={updateDetails}
                onRequestProfileLink={onRequestProfileLink}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
