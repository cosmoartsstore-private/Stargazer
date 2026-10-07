// 操作ガイドのタブ切替とStellaRecord連携状態を管理する。

import React, { useCallback, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { GuideFeatureDetails } from '@/features/guide/components/GuideFeatureDetails';
import { GuideFlowContent } from '@/features/guide/components/GuideFlowContent';
import type { FeatureId } from '@/features/guide/guideFeature';
import { isStellaRecordAvailable, registerToStellaRecord } from '@/tauri';
import { getMsg } from '@/messages/getMsg';
import styles from './GuidePage.module.css';
import shared from '@/styles/shared.module.css';

type Tab = 'flow' | 'features';
type StellaStatus = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

// ガイド上部で切り替える主要表示。
const GUIDE_TABS: ReadonlyArray<{ id: Tab; label: string }> = [{ id: 'flow', label: getMsg('GuidePage.tab.flow') }, { id: 'features', label: getMsg('GuidePage.tab.features') }];

const GUIDE_TAB_DOM_IDS: Record<Tab, { tab: string; panel: string }> = { flow: { tab: 'guide-tab-flow', panel: 'guide-tabpanel-flow' }, features: { tab: 'guide-tab-features', panel: 'guide-tabpanel-features' } };

function getStellaRegisterButtonLabel(status: StellaStatus): string {
  if (status === 'loading') return getMsg('GuidePage.stella.registering');
  if (status === 'success') return getMsg('GuidePage.stella.registered');
  return getMsg('GuidePage.stella.register');
}

interface GuideTabButtonProps {
  id: Tab;
  label: string;
  selected: boolean;
  onSelect: (tab: Tab) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, tab: Tab) => void;
  buttonRef: React.Ref<HTMLButtonElement>;
}

function GuideTabButton({ id, label, selected, onSelect, onKeyDown, buttonRef }: GuideTabButtonProps) {
  const handleClick = () => onSelect(id);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, id);
  const activeClassName = selected ? ` ${styles.guideTabActive}` : '';

  return <button ref={buttonRef} type="button" role="tab" id={GUIDE_TAB_DOM_IDS[id].tab} className={`${styles.guideTab}${activeClassName}`} aria-selected={selected} aria-controls={GUIDE_TAB_DOM_IDS[id].panel} tabIndex={selected ? 0 : -1} onClick={handleClick} onKeyDown={handleKeyDown}>{label}</button>;
}

export const GuidePage: React.FC = () => {
  // 表示中の説明タブ、機能プレビュー、StellaRecord連携状態。
  const [activeTab, setActiveTab] = useState<Tab>('flow');
  const [selectedFeature, setSelectedFeature] = useState<FeatureId>('applicant-data');
  const [stellaStatus, setStellaStatus] = useState<StellaStatus>('idle');
  const [stellaMessage, setStellaMessage] = useState('');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ flow: null, features: null });

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, currentTab: Tab) => {
    const currentIndex = GUIDE_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + GUIDE_TABS.length) % GUIDE_TABS.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % GUIDE_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = GUIDE_TABS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = GUIDE_TABS[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }, []);

  // StellaRecord連携の可否判定と登録処理はTauri境界へ委譲する。
  const handleStellaRegister = useCallback(async () => {
    setStellaStatus('loading');
    try {
      const available = await isStellaRecordAvailable();
      if (!available) {
        setStellaStatus('unavailable');
        setStellaMessage(getMsg('GuidePage.stella.unavailable'));
        return;
      }
      await registerToStellaRecord();
      setStellaStatus('success');
      setStellaMessage(getMsg('GuidePage.stella.registerSuccess'));
    } catch {
      setStellaStatus('error');
      setStellaMessage(getMsg('GuidePage.stella.registerFailed'));
    }
  }, []);

  // 連携状態からボタンと結果メッセージの見た目を導出する。
  const isStellaActionDisabled = stellaStatus === 'loading' || stellaStatus === 'success';
  const stellaButtonClassName = `${stellaStatus === 'success' ? shared.btnSuccess : shared.btnPrimary} ${styles.guideStellaButton}`;
  const stellaMessageClassName = [
    styles.guideStellaMessage,
    stellaStatus === 'success' ? styles.guideStellaMessageSuccess : '',
    stellaStatus === 'error' || stellaStatus === 'unavailable' ? styles.guideStellaMessageError : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`${shared.pageWrapper} ${styles.guidePage}`}>
      <div className={styles.guideTabs} role="tablist" aria-label={getMsg('GuidePage.tabListLabel')} aria-orientation="horizontal">
        {GUIDE_TABS.map((tab) => (
          <GuideTabButton key={tab.id} id={tab.id} label={tab.label} selected={activeTab === tab.id} onSelect={setActiveTab} onKeyDown={handleTabKeyDown} buttonRef={(element) => { tabRefs.current[tab.id] = element; }} />
        ))}
      </div>

      <div role="tabpanel" id={GUIDE_TAB_DOM_IDS.flow.panel} aria-labelledby={GUIDE_TAB_DOM_IDS.flow.tab} tabIndex={0} hidden={activeTab !== 'flow'}>
        {activeTab === 'flow' && (
          <div className={styles.guideFlowPageStack}>
            <GuideFlowContent />
            <section className={`${styles.guideSection} ${styles.guideStellaSection}`}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><Settings size={22} />{getMsg('GuidePage.stella.title')}</h2>
              <div className={`${styles.guideCard} ${styles.guideStellaCard}`}>
                <p className={styles.guideStellaDescription}>{getMsg('GuidePage.stella.description')}</p>
                <div className={styles.guideStellaActions}>
                  <button type="button" className={stellaButtonClassName} onClick={handleStellaRegister} disabled={isStellaActionDisabled}>{getStellaRegisterButtonLabel(stellaStatus)}</button>
                  {stellaMessage && <span className={stellaMessageClassName} role="status">{stellaMessage}</span>}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      <div role="tabpanel" id={GUIDE_TAB_DOM_IDS.features.panel} aria-labelledby={GUIDE_TAB_DOM_IDS.features.tab} tabIndex={0} hidden={activeTab !== 'features'}>{activeTab === 'features' && <GuideFeatureDetails selectedFeature={selectedFeature} onFeatureChange={setSelectedFeature} />}</div>
    </div>
  );
};
