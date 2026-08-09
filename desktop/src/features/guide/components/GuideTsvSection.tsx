import React from 'react';
import { Download, MoreVertical, Sheet } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import { formatXAccountIdForDisplay } from '@/common/xIdUtils';
import shared from '@/styles/shared.module.css';
import styles from '../GuidePage.module.css';

const SAMPLE_ROWS = [
  {
    timestamp: '2026/7/25 20:14:08',
    username: getMsg('GuidePage.flow.applicantData.sampleUser1'),
    xId: getMsg('GuidePage.flow.applicantData.sampleXId1'),
    preference: getMsg('GuidePage.sample.castA'),
  },
  {
    timestamp: '2026/7/25 20:18:42',
    username: getMsg('GuidePage.flow.applicantData.sampleUser2'),
    xId: getMsg('GuidePage.flow.applicantData.sampleXId2'),
    preference: getMsg('GuidePage.sample.castB'),
  },
  {
    timestamp: '2026/7/25 20:23:11',
    username: getMsg('GuidePage.flow.applicantData.sampleUser3'),
    xId: getMsg('GuidePage.flow.applicantData.sampleXId3'),
    preference: getMsg('GuidePage.sample.castC'),
  },
] as const;

function FormsResponseSample() {
  return (
    <figure className={styles.guideTsvSample}>
      <figcaption className={styles.guideTsvSampleCaption}>{getMsg('GuidePage.tsv.formsSampleCaption')}</figcaption>
      <div className={styles.guideFormsMock}>
        <div className={styles.guideFormsTitlebar}>
          <strong>{getMsg('GuidePage.tsv.formTitle')}</strong>
          <MoreVertical size={17} aria-hidden="true" />
        </div>
        <div className={styles.guideFormsTabs}>
          <span>{getMsg('GuidePage.tsv.questionsTab')}</span>
          <span className={styles.guideFormsTabActive}>{getMsg('GuidePage.tsv.responsesTab')}</span>
          <span>{getMsg('GuidePage.tsv.settingsTab')}</span>
        </div>
        <div className={styles.guideFormsResponseCard}>
          <div>
            <strong>{getMsg('GuidePage.tsv.responseCount')}</strong>
            <span>{getMsg('GuidePage.tsv.acceptingResponses')}</span>
          </div>
          <div className={styles.guideFormsActions}>
            <span className={styles.guideFormsSheetIcon} aria-hidden="true"><Sheet size={19} /></span>
            <MoreVertical size={19} aria-hidden="true" />
          </div>
        </div>
        <div className={styles.guideFormsMenu}>
          <span className={styles.guideFormsMenuItemActive}>{getMsg('GuidePage.tsv.linkSpreadsheet')}</span>
        </div>
        <div className={styles.guideFormsCallout}>{getMsg('GuidePage.tsv.clickHere')}</div>
      </div>
    </figure>
  );
}

function SpreadsheetDownloadSample() {
  const menuLabels = [
    getMsg('GuidePage.tsv.fileMenu'),
    getMsg('GuidePage.tsv.editMenu'),
    getMsg('GuidePage.tsv.viewMenu'),
    getMsg('GuidePage.tsv.insertMenu'),
    getMsg('GuidePage.tsv.formatMenu'),
    getMsg('GuidePage.tsv.dataMenu'),
    getMsg('GuidePage.tsv.toolsMenu'),
  ];

  return (
    <figure className={styles.guideTsvSample}>
      <figcaption className={styles.guideTsvSampleCaption}>{getMsg('GuidePage.tsv.sheetSampleCaption')}</figcaption>
      <div className={styles.guideSpreadsheetMock}>
        <div className={styles.guideSpreadsheetTitlebar}>
          <span className={styles.guideSpreadsheetAppIcon} aria-hidden="true"><Sheet size={22} /></span>
          <strong>{getMsg('GuidePage.tsv.sampleFileName')}</strong>
        </div>
        <div className={styles.guideSpreadsheetMenuBar}>
          {menuLabels.map((label, index) => (
            <span key={label} className={index === 0 ? styles.guideSpreadsheetMenuActive : undefined}>{label}</span>
          ))}
        </div>
        <div className={styles.guideSpreadsheetFormulaBar}>
          <span>A1</span>
          <span className={styles.guideSpreadsheetFormulaIcon}>fx</span>
          <span />
        </div>
        <div className={styles.guideSpreadsheetGridWrap}>
          <table className={styles.guideSpreadsheetGrid} aria-label={getMsg('GuidePage.tsv.sheetSampleCaption')}>
            <thead>
              <tr>
                <th aria-label={getMsg('GuidePage.tsv.rowNumberHeader')} />
                {['A', 'B', 'C', 'D'].map(column => <th key={column} scope="col">{column}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">1</th>
                <td className={styles.guideSpreadsheetHeaderCell}>{getMsg('GuidePage.tsv.timestampHeader')}</td>
                <td className={styles.guideSpreadsheetHeaderCell}>{getMsg('GuidePage.label.userName')}</td>
                <td className={styles.guideSpreadsheetHeaderCell}>{getMsg('GuidePage.label.xId')}</td>
                <td className={styles.guideSpreadsheetHeaderCell}>{getMsg('GuidePage.label.preference1')}</td>
              </tr>
              {SAMPLE_ROWS.map((row, index) => (
                <tr key={row.xId}>
                  <th scope="row">{index + 2}</th>
                  <td>{row.timestamp}</td>
                  <td>{row.username}</td>
                  <td>{formatXAccountIdForDisplay(row.xId)}</td>
                  <td>{row.preference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.guideSpreadsheetTabs}>
          <span aria-hidden="true">＋</span>
          <strong>{getMsg('GuidePage.tsv.sampleSheetName')}</strong>
        </div>
        <div className={styles.guideSpreadsheetFileMenu}>
          <span>{getMsg('GuidePage.tsv.newMenu')}</span>
          <span>{getMsg('GuidePage.tsv.openMenu')}</span>
          <span className={styles.guideSpreadsheetDownloadItem}>{getMsg('GuidePage.tsv.downloadMenu')}<span aria-hidden="true">›</span></span>
        </div>
        <div className={styles.guideSpreadsheetDownloadMenu}>
          <span>{getMsg('GuidePage.tsv.excelFormat')}</span>
          <span>{getMsg('GuidePage.tsv.csvFormat')}</span>
          <strong>{getMsg('GuidePage.tsv.tsvFormat')}</strong>
        </div>
      </div>
    </figure>
  );
}

/** スプレッドシートからTSVを準備する手順を表示する。 */
export const GuideTsvSection: React.FC = () => (
  <section className={`${styles.guideSection} ${styles.guideTsvSection}`}>
    <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><Sheet size={22} />{getMsg('GuidePage.tsv.title')}</h2>
    <p className={`${shared.pageHeaderSubtitle} ${styles.guideTsvDescription}`}>{getMsg('GuidePage.tsv.description')}</p>
    <div className={styles.guideStackVertical}>
      <article className={styles.guideCard}>
        <div className={styles.guideTsvStepLayout}>
          <div className={styles.guideTsvInstructions}>
            <h3 className={styles.guideTsvStepHeading}><Sheet size={18} />{getMsg('GuidePage.tsv.stepATitle')}</h3>
            <ol className={styles.guideNumberedSteps}>
              <li>{getMsg('GuidePage.tsv.stepA1')}</li>
              <li>{getMsg('GuidePage.tsv.stepA2')}</li>
              <li>{getMsg('GuidePage.tsv.stepA3')}</li>
            </ol>
          </div>
          <FormsResponseSample />
        </div>
      </article>
      <article className={styles.guideCard}>
        <div className={styles.guideTsvStepLayout}>
          <div className={styles.guideTsvInstructions}>
            <h3 className={styles.guideTsvStepHeading}><Download size={18} />{getMsg('GuidePage.tsv.stepBTitle')}</h3>
            <ol className={styles.guideNumberedSteps}>
              <li>{getMsg('GuidePage.tsv.stepB1')}</li>
              <li>{getMsg('GuidePage.tsv.stepB2')}</li>
              <li>{getMsg('GuidePage.tsv.stepB3')}</li>
            </ol>
          </div>
          <SpreadsheetDownloadSample />
        </div>
      </article>
    </div>
  </section>
);
