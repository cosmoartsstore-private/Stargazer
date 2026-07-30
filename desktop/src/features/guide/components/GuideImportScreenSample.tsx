// 現行の取込画面と同じ情報構造を、ガイド用の静的サンプルとして表示する。

import React from 'react';
import { ChevronDown, FileText, Sheet, Upload } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import styles from '../GuidePage.module.css';
import { ScreenSample } from './content/GuideContentPrimitives';

interface SampleMappingRow {
  label: string;
  sourceIndex: number;
  sourceLabel: string;
  required?: boolean;
}

const SAMPLE_MAPPING_ROWS: readonly SampleMappingRow[] = [
  { label: getMsg('ImportPage.userNameLabel'), sourceIndex: 1, sourceLabel: getMsg('GuidePage.label.name') },
  { label: getMsg('ImportPage.xIdLabel'), sourceIndex: 2, sourceLabel: getMsg('ImportPage.xIdLabel'), required: true },
  { label: getMsg('ImportPage.vrchatLinkLabel'), sourceIndex: 3, sourceLabel: getMsg('ImportPage.vrchatLinkLabel') },
  { label: getMsg('ImportPage.preferredCastColumn', { rank: 1 }), sourceIndex: 4, sourceLabel: getMsg('ImportPage.preferredCastColumn', { rank: 1 }) },
  { label: getMsg('ImportPage.preferredCastColumn', { rank: 2 }), sourceIndex: 5, sourceLabel: getMsg('ImportPage.preferredCastColumn', { rank: 2 }) },
  { label: getMsg('ImportPage.preferredCastColumn', { rank: 3 }), sourceIndex: 6, sourceLabel: getMsg('ImportPage.preferredCastColumn', { rank: 3 }) },
];

const SAMPLE_PREVIEW_ROWS = [
  {
    name: getMsg('GuidePage.flow.applicantData.sampleUser1'),
    xId: getMsg('GuidePage.flow.applicantData.sampleXId1'),
    casts: [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')],
  },
  {
    name: getMsg('GuidePage.flow.applicantData.sampleUser2'),
    xId: getMsg('GuidePage.flow.applicantData.sampleXId2'),
    casts: [getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castA')],
  },
  {
    name: getMsg('GuidePage.flow.applicantData.sampleUser3'),
    xId: getMsg('GuidePage.flow.applicantData.sampleXId3'),
    casts: [getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB')],
  },
] as const;

/** ファイル選択、列の割り当て、プレビュー、確定操作を現行画面と同じ順序で示す。 */
export const GuideImportScreenSample: React.FC = () => (
  <ScreenSample title={getMsg('GuidePage.nav.import')}>
    <div className={styles.guideImportSample}>
      <div className={styles.guideImportFileSection}>
        <span className={styles.guideImportFileButton}><Upload size={12} aria-hidden="true" />{getMsg('ImportPage.reselectTsv')}</span>
        <span className={styles.guideImportFileName}><FileText size={12} aria-hidden="true" />responses.tsv</span>
      </div>

      <section className={styles.guideImportSection}>
        <h4 className={styles.guideImportSectionHeader}>
          <ChevronDown className={styles.guideImportSectionChevron} size={12} aria-hidden="true" />
          {getMsg('ImportPage.mappingSettings')}
        </h4>
        <div className={styles.guideImportMappingTable}>
          {SAMPLE_MAPPING_ROWS.map(row => (
            <div key={row.label} className={styles.guideImportMappingRow}>
              <span className={styles.guideImportMappingLabel}>
                {row.label}{row.required && <span className={styles.guideImportRequired}> *</span>}
              </span>
              <span className={styles.guideImportSelect}>
                {getMsg('ImportPage.columnOption', { index: row.sourceIndex, label: row.sourceLabel })}
                <ChevronDown size={11} aria-hidden="true" />
              </span>
            </div>
          ))}
          <div className={styles.guideImportCastFormatRow}>
            <span className={styles.guideImportCastFormatLabel}>{getMsg('ImportPage.castFormatLabel')}</span>
            <span className={styles.guideImportSegmented}>
              <span className={styles.guideImportSegmentSelected}>{getMsg('ImportPage.rankedColumns')}</span>
              <span>{getMsg('ImportPage.unrankedCommaSeparated')}</span>
            </span>
          </div>
        </div>
      </section>

      <section className={styles.guideImportSection}>
        <div className={styles.guideImportPreviewHeader}>
          <h4 className={styles.guideImportSectionHeader}>
            <ChevronDown className={styles.guideImportSectionChevron} size={12} aria-hidden="true" />
            {getMsg('ImportPage.previewTitle')}
            <span className={styles.guideImportPreviewCount}>{getMsg('ImportPage.previewCount', { count: SAMPLE_PREVIEW_ROWS.length })}</span>
          </h4>
          <span className={styles.guideImportRawColumns}><Sheet size={11} aria-hidden="true" />{getMsg('ImportPage.showAllColumns')}</span>
        </div>
        <div className={styles.guideImportPreviewTableWrap}>
          <table className={styles.guideImportPreviewTable}>
            <thead>
              <tr>
                <th scope="col">{getMsg('ImportPage.userNameLabel')}</th>
                <th scope="col">{getMsg('ImportPage.xIdLabel')}</th>
                {[1, 2, 3].map(rank => <th key={rank} scope="col">{getMsg('ImportPage.preferredCastColumn', { rank })}</th>)}
              </tr>
            </thead>
            <tbody>
              {SAMPLE_PREVIEW_ROWS.map(row => (
                <tr key={row.xId}>
                  <td>{row.name}</td>
                  <td>{formatXAccountIdForDisplay(row.xId)}</td>
                  {row.casts.map((cast, index) => <td key={index}>{cast}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.guideImportFooter}>
          <span className={styles.guideImportValidation}>{getMsg('ImportPage.importableCount', { count: SAMPLE_PREVIEW_ROWS.length })}</span>
          <span className={styles.guideImportActions}>
            <span className={styles.guideImportSecondaryAction}>{getMsg('ImportPage.proceedToLottery')}</span>
            <span className={styles.guideImportPrimaryAction}>{getMsg('ImportPage.importCount', { count: SAMPLE_PREVIEW_ROWS.length })}</span>
          </span>
        </div>
      </section>
    </div>
  </ScreenSample>
);
