// 全体フローに含まれる各画面の操作手順を表示する。

import React from 'react';
import { BarChart3, CheckCircle, Database, FileText, Settings, Users } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import styles from '../GuidePage.module.css';
import shared from '@/styles/shared.module.css';
import { ScreenSample } from './content/GuideContentPrimitives';
import { GuideImportScreenSample } from './GuideImportScreenSample';

interface FlowStepHeaderProps {
  number: number;
  icon: React.ReactNode;
  title: string;
  accent: string;
  accentSoft: string;
}

/** 基本的な流れで繰り返す、手順番号付きの色分け見出し。 */
const FlowStepHeader: React.FC<FlowStepHeaderProps> = ({ number, icon, title, accent, accentSoft }) => {
  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
    background: `linear-gradient(135deg, ${accent} 0%, ${accentSoft} 100%)`,
  };
  const numberStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
    fontWeight: 800, fontSize: 15, flexShrink: 0,
  };

  return (
    <div style={headerStyle}>
      <div style={numberStyle}>{number}</div>
      {icon}
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{title}</span>
    </div>
  );
};

interface FlowStepBulletProps {
  number: number;
  accent: string;
}

/** 各手順カード内の箇条書き番号を、featureの配色で表示する。 */
const FlowStepBullet: React.FC<FlowStepBulletProps> = ({ number, accent }) => {
  const style: React.CSSProperties = {
    width: 20, height: 20, borderRadius: '50%', background: accent,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
    fontWeight: 700, color: '#ffffff', flexShrink: 0, marginTop: 1,
  };

  return <div style={style}>{number}</div>;
};

interface GuideSampleActionProps {
  label: string;
  tone?: 'primary' | 'secondary' | 'success' | 'export';
}

/** 操作できない画面例のボタンを、実画面の主要なボタン種別に合わせて表示する。 */
const GuideSampleAction: React.FC<GuideSampleActionProps> = ({ label, tone = 'secondary' }) => {
  const toneClassName = {
    primary: styles.guideFlowActionPrimary,
    secondary: styles.guideFlowActionSecondary,
    success: styles.guideFlowActionSuccess,
    export: styles.guideFlowActionExport,
  }[tone];

  return <span className={`${styles.guideFlowAction} ${toneClassName}`}>{label}</span>;
};

const GuideAttendanceScreenSample: React.FC = () => (
  <ScreenSample title={getMsg('GuidePage.feature.attendance.settingsTitle')}>
    <div className={styles.guideFlowSample}>
      <div className={styles.guideFlowAttendanceToolbar}>
        <div className={styles.guideFlowAttendanceSummary}>
          <span className={styles.guideFlowAttendancePresentCount}>{getMsg('AttendanceSetupView.presentCount', { count: 3 })}</span>
          <span className={styles.guideFlowAttendanceAbsentCount}>{getMsg('AttendanceSetupView.absentCount', { count: 1 })}</span>
        </div>
        <div className={styles.guideFlowAttendanceActions}>
          <GuideSampleAction label={getMsg('AttendanceSetupView.allPresent')} tone="success" />
          <GuideSampleAction label={getMsg('AttendanceSetupView.allAbsent')} />
          <GuideSampleAction label={getMsg('AttendanceSetupView.recordAttendance')} tone="primary" />
        </div>
      </div>

      <div className={styles.guideFlowAttendanceColumns}>
        <section className={styles.guideFlowMiniPanel}>
          <header className={styles.guideFlowMiniPanelHeader}>
            <strong>{getMsg('AttendanceSetupView.presentTitle')}</strong>
            <span className={`${styles.guideFlowCountBadge} ${styles.guideFlowCountBadgePresent}`}>3</span>
          </header>
          <div className={styles.guideFlowCastList}>
            {[getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')].map(castName => (
              <span key={castName} className={`${styles.guideFlowCastRow} ${styles.guideFlowCastRowPresent}`}>{castName}</span>
            ))}
          </div>
        </section>

        <section className={styles.guideFlowMiniPanel}>
          <header className={styles.guideFlowMiniPanelHeader}>
            <strong>{getMsg('AttendanceSetupView.absentTitle')}</strong>
            <span className={styles.guideFlowCountBadge}>1</span>
          </header>
          <div className={styles.guideFlowCastList}>
            <span className={`${styles.guideFlowCastRow} ${styles.guideFlowCastRowAbsent}`}>
              <span>{getMsg('GuidePage.sample.castD')}</span>
              <span className={styles.guideFlowCastStatus}>{getMsg('AttendanceSetupView.absentStatus')}</span>
            </span>
          </div>
        </section>
      </div>
    </div>
  </ScreenSample>
);

const GuideCounterSample: React.FC<{ value: string }> = ({ value }) => (
  <span className={styles.guideFlowCounter}>
    <span aria-hidden>−</span>
    <strong>{value}</strong>
    <span aria-hidden>＋</span>
  </span>
);

const GuideLotteryScreenSample: React.FC = () => (
  <ScreenSample title={getMsg('GuidePage.feature.lottery.sampleTitle')}>
    <div className={styles.guideFlowLotteryLayout}>
      <section className={styles.guideFlowMiniPanel}>
        <header className={`${styles.guideFlowMiniPanelHeader} ${styles.guideFlowPanelHeading}`}>
          <strong>{getMsg('LotteryPage.conditionInputHeading')}</strong>
          <span>{getMsg('LotteryPage.conditionInputDescription')}</span>
        </header>
        <div className={styles.guideFlowLotteryFields}>
          <div className={styles.guideFlowLotteryFieldWide}>
            <span className={styles.guideFlowFieldLabel}>{getMsg('GuidePage.feature.lottery.formatLabel')}</span>
            <div className={styles.guideFlowSegmentedControl}>
              <span>{getMsg('matchingTypeCodes.lotteryOnly')}</span>
              <span className={styles.guideFlowSegmentedSelected}>{getMsg('GuidePage.feature.lottery.random')}</span>
              <span>{getMsg('matchingTypeCodes.rotation')}</span>
            </div>
          </div>
          <div>
            <span className={styles.guideFlowFieldLabel}>{getMsg('GuidePage.feature.lottery.winnerCountLabel')}</span>
            <GuideCounterSample value="20" />
          </div>
          <div>
            <span className={styles.guideFlowFieldLabel}>{getMsg('GuidePage.feature.lottery.rotationLabel')}</span>
            <GuideCounterSample value="3" />
          </div>
          <div>
            <span className={styles.guideFlowFieldLabel}>{getMsg('GuidePage.flow.lottery.tableCountLabel')}</span>
            <GuideCounterSample value="4" />
          </div>
        </div>
      </section>

      <section className={`${styles.guideFlowMiniPanel} ${styles.guideFlowValidationPanel}`}>
        <header className={`${styles.guideFlowMiniPanelHeader} ${styles.guideFlowPanelHeading}`}>
          <strong>{getMsg('LotteryPage.statusTitle')}</strong>
          <span>{getMsg('LotteryPage.statusDescription')}</span>
        </header>
        <div className={styles.guideFlowValidationBody}>
          <span className={styles.guideFlowInfoBadge}>{getMsg('LotteryValidationPanel.infoBadge')}</span>
          <div className={styles.guideFlowValidationInfo}>
            <strong>{getMsg('GuidePage.flow.lottery.sampleStatus')}</strong>
            <span>{getMsg('GuidePage.feature.lottery.sampleAttendingCasts')}</span>
          </div>
          <div className={styles.guideFlowReadyState}>
            <CheckCircle size={12} aria-hidden />
            <span>{getMsg('LotteryValidationPanel.noProblems')}</span>
          </div>
        </div>
        <footer className={styles.guideFlowPanelActionBar}>
          <GuideSampleAction label={getMsg('GuidePage.feature.lottery.execute')} tone="primary" />
        </footer>
      </section>
    </div>
  </ScreenSample>
);

interface GuideAssignmentProps {
  name: string;
  xId: string;
  preference: string;
  tone: 'first' | 'second' | 'third';
}

const GuideAssignment: React.FC<GuideAssignmentProps> = ({ name, xId, preference, tone }) => {
  const toneClassName = {
    first: styles.guideFlowAssignmentFirst,
    second: styles.guideFlowAssignmentSecond,
    third: styles.guideFlowAssignmentThird,
  }[tone];

  return (
    <div className={`${styles.guideFlowAssignment} ${toneClassName}`}>
      <strong>{name}</strong>
      <span className={styles.guideFlowAssignmentId}>{xId}</span>
      <span className={styles.guideFlowAssignmentRank}>{preference}</span>
    </div>
  );
};

const GuideMatchingScreenSample: React.FC = () => (
  <ScreenSample title={getMsg('GuidePage.flow.matching.sampleTitle')}>
    <div className={styles.guideFlowSample}>
      <div className={styles.guideFlowExecutionBar}>
        <span className={styles.guideFlowExecutionStatus}><CheckCircle size={12} aria-hidden />{getMsg('LotteryValidationPanel.noProblems')}</span>
        <GuideSampleAction label={getMsg('MatchingPage.runLabel')} tone="primary" />
      </div>

      <section className={styles.guideFlowResultPanel}>
        <header className={styles.guideFlowResultHeader}>
          <div>
            <strong>{getMsg('MatchingPage.castResultsHeading')}</strong>
            <span>{getMsg('MatchingPage.castResultsDescription')}</span>
          </div>
          <GuideSampleAction label={getMsg('MatchingPage.exportPng')} tone="export" />
        </header>
        <div className={styles.guideFlowResultTableWrap}>
          <table className={styles.guideFlowResultTable}>
            <thead>
              <tr>
                <th scope="col">{getMsg('GuidePage.label.cast')}</th>
                <th scope="col">{getMsg('GuidePage.feature.matching.rotation1')}</th>
                <th scope="col">{getMsg('GuidePage.feature.matching.rotation2')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{getMsg('GuidePage.sample.castA')}</th>
                <td><GuideAssignment name={getMsg('GuidePage.flow.applicantData.sampleUser1')} xId={getMsg('GuidePage.flow.applicantData.sampleXId1')} preference={getMsg('matchingResultView.firstChoice')} tone="first" /></td>
                <td><GuideAssignment name={getMsg('GuidePage.flow.applicantData.sampleUser3')} xId={getMsg('GuidePage.flow.applicantData.sampleXId3')} preference={getMsg('matchingResultView.secondChoice')} tone="second" /></td>
              </tr>
              <tr>
                <th scope="row">{getMsg('GuidePage.sample.castB')}</th>
                <td><GuideAssignment name={getMsg('GuidePage.flow.matching.sampleUser')} xId={getMsg('GuidePage.flow.applicantData.sampleXId2')} preference={getMsg('matchingResultView.thirdChoice')} tone="third" /></td>
                <td><GuideAssignment name={getMsg('GuidePage.flow.applicantData.sampleUser1')} xId={getMsg('GuidePage.flow.applicantData.sampleXId1')} preference={getMsg('matchingResultView.firstChoice')} tone="first" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </ScreenSample>
);

const GuideOutputScreenSample: React.FC = () => (
  <ScreenSample title={getMsg('GuidePage.flow.output.sampleTitle')}>
    <div className={styles.guideFlowSample}>
      <section className={styles.guideFlowOutputPanel}>
        <header className={styles.guideFlowOutputHeader}>
          <strong>{getMsg('LotteryPage.winnerListHeading')}</strong>
          <span>{getMsg('LotteryPage.winnerListDescription')}</span>
        </header>
        <div className={styles.guideFlowOutputControls}>
          <div className={styles.guideFlowSavedResultControl}>
            <span className={styles.guideFlowFieldLabel}>{getMsg('LotteryPage.savedResults')}</span>
            <span className={styles.guideFlowSelectMock}>{getMsg('LotteryPage.selectSavedResult')}</span>
          </div>
          <div className={styles.guideFlowOutputActions}>
            <GuideSampleAction label={getMsg('LotteryPage.saveResult')} tone="primary" />
            <GuideSampleAction label={getMsg('LotteryPage.goToMatching')} tone="primary" />
          </div>
        </div>
      </section>

      <section className={styles.guideFlowOutputPanel}>
        <div className={styles.guideFlowExportRow}>
          <strong>{getMsg('MatchingPage.castResultsHeading')}</strong>
          <GuideSampleAction label={getMsg('MatchingPage.exportPng')} tone="export" />
        </div>
        <div className={styles.guideFlowExportRow}>
          <strong>{getMsg('MatchingPage.tableResultsHeading')}</strong>
          <GuideSampleAction label={getMsg('MatchingPage.exportPng')} tone="export" />
        </div>
        <div className={styles.guideFlowTsvBar}>
          <div>
            <span className={styles.guideFlowFieldLabel}>{getMsg('MatchingPage.backupFileName')}</span>
            <span className={styles.guideFlowFileName}>{getMsg('MatchingPage.defaultBackupFileName')}</span>
          </div>
          <GuideSampleAction label={getMsg('MatchingPage.saveTsv')} tone="success" />
        </div>
      </section>
    </div>
  </ScreenSample>
);

/** 初回取込から結果出力までの各画面の操作手順を表示する。 */
export const GuideWorkflowDetails: React.FC = () => (
  <section className={styles.guideSection} style={{ marginBottom: 40 }}>
    <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><FileText size={22} />{getMsg('GuidePage.flow.stepDetailsTitle')}</h2>
    <div className={styles.guideStackVertical}>

      {/* 手順1 */}
      <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
        <FlowStepHeader
          number={1}
          icon={<FileText size={18} color="#fff" />}
          title={getMsg('GuidePage.flow.import.title')}
          accent="var(--guide-accent-import)"
          accentSoft="var(--guide-accent-import-soft)"
        />
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              getMsg('GuidePage.flow.import.step1'),
              getMsg('GuidePage.flow.import.step2'),
              getMsg('GuidePage.flow.import.step3'),
              getMsg('GuidePage.flow.import.step4'),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-import)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <GuideImportScreenSample />
        </div>
      </div>

      {/* 手順2 */}
      <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
        <FlowStepHeader
          number={2}
          icon={<Database size={18} color="#fff" />}
          title={getMsg('GuidePage.flow.applicantData.title')}
          accent="var(--guide-accent-primary)"
          accentSoft="var(--guide-accent-primary-soft)"
        />
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              getMsg('GuidePage.flow.applicantData.step1'),
              getMsg('GuidePage.flow.applicantData.step2'),
              getMsg('GuidePage.flow.applicantData.step3'),
              getMsg('GuidePage.flow.applicantData.step4'),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-primary)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <ScreenSample title={getMsg('GuidePage.nav.applicantData')}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {[
                    getMsg('GuidePage.label.name'),
                    getMsg('GuidePage.label.xId'),
                    getMsg('GuidePage.label.preference1'),
                  ].map(h => <th key={h} scope="col" style={{ padding: '3px 6px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{getMsg('GuidePage.flow.applicantData.sampleUser1')}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-link, #00b0f4)' }}>{getMsg('GuidePage.flow.applicantData.sampleXId1')}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{getMsg('GuidePage.sample.castA')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(237,66,69,0.08)' }}>
                  <td style={{ padding: '4px 6px', color: '#ed4245', fontWeight: 600 }}>{getMsg('GuidePage.flow.applicantData.sampleUser2')}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{getMsg('GuidePage.flow.applicantData.sampleXId2')}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{getMsg('GuidePage.sample.castB')}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{getMsg('GuidePage.flow.applicantData.sampleUser3')}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-link, #00b0f4)' }}>{getMsg('GuidePage.flow.applicantData.sampleXId3')}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{getMsg('GuidePage.sample.castA')}</td>
                </tr>
              </tbody>
            </table>
          </ScreenSample>
        </div>
      </div>

      {/* 手順3 */}
      <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
        <FlowStepHeader
          number={3}
          icon={<Users size={18} color="#fff" />}
          title={getMsg('GuidePage.flow.attendance.title')}
          accent="var(--guide-accent-cast)"
          accentSoft="var(--guide-accent-cast-soft)"
        />
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              getMsg('GuidePage.flow.attendance.step1'),
              getMsg('GuidePage.flow.attendance.step2'),
              getMsg('GuidePage.flow.attendance.step3'),
              getMsg('GuidePage.flow.attendance.step4'),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-cast)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <GuideAttendanceScreenSample />
        </div>
      </div>

      {/* 手順4 */}
      <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
        <FlowStepHeader
          number={4}
          icon={<Settings size={18} color="#fff" />}
          title={getMsg('GuidePage.flow.lottery.title')}
          accent="var(--guide-accent-lottery)"
          accentSoft="var(--guide-accent-lottery-soft)"
        />
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              getMsg('GuidePage.flow.lottery.step1'),
              getMsg('GuidePage.flow.lottery.step2'),
              getMsg('GuidePage.flow.lottery.step3'),
              getMsg('GuidePage.flow.lottery.step4'),
              getMsg('GuidePage.flow.lottery.step5'),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-lottery)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <GuideLotteryScreenSample />
        </div>
      </div>

      {/* 手順5 */}
      <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
        <FlowStepHeader
          number={5}
          icon={<CheckCircle size={18} color="#fff" />}
          title={getMsg('GuidePage.flow.matching.title')}
          accent="var(--guide-accent-matching)"
          accentSoft="var(--guide-accent-matching-soft)"
        />
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              getMsg('GuidePage.flow.matching.step1'),
              getMsg('GuidePage.flow.matching.step2'),
              getMsg('GuidePage.flow.matching.step3'),
              getMsg('GuidePage.flow.matching.step4'),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-matching)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <GuideMatchingScreenSample />
        </div>
      </div>

      {/* 手順6 */}
      <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
        <FlowStepHeader
          number={6}
          icon={<BarChart3 size={18} color="#fff" />}
          title={getMsg('GuidePage.flow.output.title')}
          accent="var(--guide-accent-output)"
          accentSoft="var(--guide-accent-output-soft)"
        />
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              getMsg('GuidePage.flow.output.step1'),
              getMsg('GuidePage.flow.output.step2'),
              getMsg('GuidePage.flow.output.step3'),
              getMsg('GuidePage.flow.output.step4'),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-output)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <GuideOutputScreenSample />
        </div>
      </div>

    </div>
  </section>
);
