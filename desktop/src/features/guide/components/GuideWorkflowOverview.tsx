import React from 'react';
import { BarChart3, CheckCircle, Database, FileText, Settings, Users } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../GuidePage.module.css';

/** 全体フローと、応募管理画面が担う範囲を説明する。 */
export const GuideWorkflowOverview: React.FC = () => (
  <>
    {/* 概要グリッド */}
    <section className={styles.guideSection} style={{ marginBottom: 32 }}>
      <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><BarChart3 size={22} />{getMsg('GuidePage.tab.flow')}</h2>
      <div className={styles.guideFlowBox}>
        <div className={styles.guideFlowGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { icon: FileText, text: getMsg('GuidePage.flow.import.title'), desc: getMsg('GuidePage.flow.import.description') },
            { icon: Database, text: getMsg('GuidePage.flow.applicantData.title'), desc: getMsg('GuidePage.flow.applicantData.description') },
            { icon: Users, text: getMsg('GuidePage.flow.attendance.title'), desc: getMsg('GuidePage.flow.attendance.description') },
            { icon: Settings, text: getMsg('GuidePage.flow.lottery.title'), desc: getMsg('GuidePage.flow.lottery.description') },
            { icon: CheckCircle, text: getMsg('GuidePage.flow.matching.title'), desc: getMsg('GuidePage.flow.matching.description') },
            { icon: BarChart3, text: getMsg('GuidePage.flow.output.title'), desc: getMsg('GuidePage.flow.output.description') },
          ].map((item, idx) => (
            <div key={idx} className={styles.guideFlowItem}>
              <item.icon size={24} className={styles.guideFlowItemIcon} />
              <div className={styles.guideFlowItemTitle}>{idx + 1}. {item.text}</div>
              <div className={styles.guideFlowItemDesc}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className={styles.guideSection} style={{ marginBottom: 40 }}>
      <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><Database size={22} />{getMsg('GuidePage.flow.applicantManagementTitle')}</h2>
      <div className={styles.guideSectionGrid}>
        {[
          {
            title: getMsg('GuidePage.nav.import'),
            body: getMsg('GuidePage.flow.applicantManagementImport'),
            accent: 'var(--guide-accent-import)',
          },
          {
            title: getMsg('GuidePage.nav.lottery'),
            body: getMsg('GuidePage.flow.applicantManagementLottery'),
            accent: 'var(--guide-accent-lottery)',
          },
          {
            title: getMsg('GuidePage.nav.matching'),
            body: getMsg('GuidePage.flow.applicantManagementMatching'),
            accent: 'var(--guide-accent-matching)',
          },
        ].map((item) => (
          <div key={item.title} className={styles.guideCard} style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.accent, flexShrink: 0 }} />
              <h3 style={{ margin: 0, color: 'var(--text-heading)', fontSize: 16, fontWeight: 800 }}>{item.title}</h3>
            </div>
            <p style={{ margin: 0, color: 'var(--text-default)', fontSize: 13, lineHeight: 1.75 }}>{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  </>
);
