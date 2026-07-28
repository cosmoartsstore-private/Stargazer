// 機能別ガイドの選択ナビゲーションと表示対象の切替を担当する。

import React from 'react';
import {
  BarChart3, Calendar, CheckCircle, Database, FileText, Settings, Users, UserX,
} from 'lucide-react';
import type { FeatureId } from '@/features/guide/guideSampleContext';
import { getMsg } from '@/messages/getMsg';
import styles from '../GuidePage.module.css';
import { APPLICANT_MANAGEMENT_FEATURE_CONTENT } from './content/ApplicantManagementFeatureContent';
import { getGuideFeatureHeadingId } from './content/GuideContentPrimitives';
import { INTERNAL_MANAGEMENT_FEATURE_CONTENT } from './content/InternalManagementFeatureContent';

interface NavItem { id: FeatureId; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }

// 機能プレビューを応募者管理と内部管理のナビゲーションへ分類する。
const NAV_GROUPS: NavGroup[] = [
  {
    label: getMsg('GuidePage.nav.applicantManagement'),
    items: [
      { id: 'applicant-data', label: getMsg('GuidePage.nav.applicantData'), icon: <Database size={15} /> },
      { id: 'import', label: getMsg('GuidePage.nav.import'), icon: <FileText size={15} /> },
      { id: 'lottery', label: getMsg('GuidePage.nav.lottery'), icon: <CheckCircle size={15} /> },
      { id: 'matching', label: getMsg('GuidePage.nav.matching'), icon: <BarChart3 size={15} /> },
    ],
  },
  {
    label: getMsg('GuidePage.nav.internalManagement'),
    items: [
      { id: 'cast', label: getMsg('GuidePage.nav.cast'), icon: <Users size={15} /> },
      { id: 'ng', label: getMsg('GuidePage.nav.ng'), icon: <UserX size={15} /> },
      { id: 'attendance', label: getMsg('GuidePage.nav.attendance'), icon: <Calendar size={15} /> },
      { id: 'tweet', label: getMsg('GuidePage.nav.tweet'), icon: <Settings size={15} /> },
    ],
  },
];

const FEATURE_CONTENT: Record<FeatureId, React.ReactNode> = {
  ...APPLICANT_MANAGEMENT_FEATURE_CONTENT,
  ...INTERNAL_MANAGEMENT_FEATURE_CONTENT,
};

interface FeaturePickerButtonProps {
  item: NavItem;
  selected: boolean;
  onSelect: (feature: FeatureId) => void;
}

function FeaturePickerButton({ item, selected, onSelect }: FeaturePickerButtonProps) {
  const handleClick = () => onSelect(item.id);
  const activeClass = selected ? ` ${styles.guideFeaturePickerButtonActive}` : '';

  return <button type="button" onClick={handleClick} className={`${styles.guideFeaturePickerButton}${activeClass}`} aria-pressed={selected}><span className={styles.guideFeaturePickerIcon}>{item.icon}</span>{item.label}</button>;
}

interface GuideFeatureDetailsProps {
  selectedFeature: FeatureId;
  onFeatureChange: (feature: FeatureId) => void;
}

/** 選択中の機能に対応する説明と実画面プレビューを表示する。 */
export const GuideFeatureDetails: React.FC<GuideFeatureDetailsProps> = ({ selectedFeature, onFeatureChange }) => {
  return (
    <div className={styles.guideFeaturesLayout}>
      <nav className={styles.guideFeaturePicker} aria-label={getMsg('GuidePage.featurePickerAriaLabel')}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.guideFeaturePickerGroup}>
            <div className={styles.guideFeaturePickerLabel}>{group.label}</div>
            <div className={styles.guideFeaturePickerGrid}>
              {group.items.map((item) => (
                <FeaturePickerButton key={item.id} item={item} selected={selectedFeature === item.id} onSelect={onFeatureChange} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <section className={styles.guideFeatureContent} aria-labelledby={getGuideFeatureHeadingId(selectedFeature)}>{FEATURE_CONTENT[selectedFeature]}</section>
    </div>
  );
};
