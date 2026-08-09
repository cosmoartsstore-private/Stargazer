import React from 'react';
import { BarChart3, CheckCircle, Database, FileText, Settings, Users } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../GuidePage.module.css';

/** 全体フローと、応募管理画面が担う範囲を説明する。 */
export const GuideWorkflowOverview: React.FC = () => (
  <>
    {/* 概要グリッド */}
    <section className={styles.guideSection}>
      <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><BarChart3 size={22} />{getMsg('GuidePage.tab.flow')}</h2>
      <div className={styles.guideFlowBox}>
        <div className={styles.guideFlowGrid}>
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

    <section className={styles.guideSection}>
      <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><Database size={22} />{getMsg('GuidePage.flow.applicantManagementTitle')}</h2>
      <div className={`${styles.guideSectionGrid} ${styles.guideOverviewCardGrid}`}>
        {[
          {
            title: getMsg('GuidePage.nav.import'),
            body: getMsg('GuidePage.flow.applicantManagementImport'),
          },
          {
            title: getMsg('GuidePage.nav.lottery'),
            body: getMsg('GuidePage.flow.applicantManagementLottery'),
          },
          {
            title: getMsg('GuidePage.nav.matching'),
            body: getMsg('GuidePage.flow.applicantManagementMatching'),
          },
        ].map((item) => (
          <div key={item.title} className={`${styles.guideCard} ${styles.guideOverviewCard}`}>
            <h3 className={styles.guideOverviewCardTitle}>{item.title}</h3>
            <p className={styles.guideOverviewCardBody}>{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  </>
);
