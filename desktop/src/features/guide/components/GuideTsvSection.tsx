import React from 'react';
import { Download, Sheet } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../GuidePage.module.css';

const TSV_STEP_HEADING_STYLE: React.CSSProperties = {
  color: 'var(--text-heading)',
  fontSize: 17,
  fontWeight: 600,
  marginBottom: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const SPREADSHEET_LINK_SAMPLE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  backgroundColor: '#34a853',
  color: '#fff',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 500,
};

const TSV_FORMAT_SAMPLE_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: '#1a73e8',
  fontWeight: 600,
  padding: '3px 0',
  backgroundColor: 'rgba(26,115,232,0.08)',
  margin: '2px -8px',
  paddingLeft: 8,
};

/** スプレッドシートからTSVを準備する手順を表示する。 */
export const GuideTsvSection: React.FC = () => (
  <section className={styles.guideSection} style={{ marginBottom: 40 }}>
    <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><Sheet size={22} />{getMsg('GuidePage.tsv.title')}</h2>
    <p className={shared.pageHeaderSubtitle} style={{ marginBottom: 20, color: 'var(--text-muted)' }}>{getMsg('GuidePage.tsv.description')}</p>
    <div className={styles.guideStackVertical}>
      <div className={styles.guideCard}>
        <div className={styles.guideSectionGrid}>
          <div>
            <h3 style={TSV_STEP_HEADING_STYLE}><Sheet size={18} />{getMsg('GuidePage.tsv.stepATitle')}</h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-default)', fontSize: 14, lineHeight: 1.9 }}>
              <li>{getMsg('GuidePage.tsv.stepA1')}</li>
              <li>{getMsg('GuidePage.tsv.stepA2')}</li>
              <li>{getMsg('GuidePage.tsv.stepA3')}</li>
            </ul>
          </div>
          <div
            className={styles.guideSamplePreview}
            style={{ backgroundColor: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #dadce0', transform: 'scale(0.95)', transformOrigin: 'top right' }}
          >
            <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dadce0', padding: 16 }}>
              <span style={SPREADSHEET_LINK_SAMPLE_STYLE}>{getMsg('GuidePage.tsv.linkSpreadsheet')}</span>
              <div style={{ fontSize: 10, color: '#5f6368', marginTop: 8 }}>{getMsg('GuidePage.tsv.clickHere')}</div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.guideCard}>
        <div className={styles.guideSectionGrid}>
          <div>
            <h3 style={TSV_STEP_HEADING_STYLE}><Download size={18} />{getMsg('GuidePage.tsv.stepBTitle')}</h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-default)', fontSize: 14, lineHeight: 1.9 }}>
              <li>{getMsg('GuidePage.tsv.stepB1')}</li>
              <li>{getMsg('GuidePage.tsv.stepB2')}</li>
              <li>{getMsg('GuidePage.tsv.stepB3')}</li>
            </ul>
          </div>
          <div
            className={styles.guideSamplePreview}
            style={{ backgroundColor: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #dadce0', transform: 'scale(0.95)', transformOrigin: 'top right' }}
          >
            <div style={{ backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: 4, padding: '6px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <div style={{ padding: '6px 16px 8px', backgroundColor: '#f8f9fa' }}>
                <div style={{ fontSize: 10, color: '#5f6368', marginBottom: 4 }}>{getMsg('GuidePage.tsv.downloadMenu')}</div>
                <div style={{ paddingLeft: 8, borderLeft: '2px solid #1a73e8' }}>
                  {[
                    getMsg('GuidePage.tsv.excelFormat'),
                    getMsg('GuidePage.tsv.csvFormat'),
                  ].map(f => (
                    <div key={f} style={{ fontSize: 11, color: '#5f6368', padding: '3px 0' }}>{f}</div>
                  ))}
                  <div style={TSV_FORMAT_SAMPLE_STYLE}>{getMsg('GuidePage.tsv.tsvFormat')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
