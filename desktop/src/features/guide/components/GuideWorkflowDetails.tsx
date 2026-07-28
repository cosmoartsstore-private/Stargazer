// 全体フローに含まれる各画面の操作手順を表示する。

import React from 'react';
import { BarChart3, CheckCircle, Database, FileText, Settings, Users } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import styles from '../GuidePage.module.css';
import shared from '@/styles/shared.module.css';
import { ScreenSample, getPreferenceBadgeColors } from './content/GuideContentPrimitives';

const FLOW_IMPORT_MAPPING_VALUE_STYLE: React.CSSProperties = {
  padding: '2px 7px',
  background: 'var(--surface-panel-muted)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  fontSize: 10,
  color: 'var(--accent-primary)',
};

const FLOW_IMPORT_LOTTERY_ACTION_STYLE: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--button-secondary-bg)',
  color: 'var(--text-default)',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
};

const FLOW_IMPORT_CONFIRM_ACTION_STYLE: React.CSSProperties = {
  padding: '3px 10px',
  background: 'var(--guide-accent-import)',
  color: '#fff',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
};

const FLOW_ATTENDANCE_ACTION_STYLE: React.CSSProperties = {
  padding: '3px 10px',
  background: 'var(--accent-primary)',
  color: '#fff',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
};

const FLOW_LOTTERY_SETTING_VALUE_STYLE: React.CSSProperties = {
  padding: '2px 7px',
  background: 'var(--surface-panel-muted)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  fontSize: 10,
  color: 'var(--text-heading)',
  fontWeight: 600,
};

const FLOW_LOTTERY_STATUS_STYLE: React.CSSProperties = {
  marginTop: 4,
  padding: 5,
  background: 'var(--guide-accent-lottery-bg)',
  border: '1px solid var(--guide-accent-lottery-border)',
  borderRadius: 5,
  fontSize: 10,
  color: 'var(--guide-accent-lottery)',
  fontWeight: 700,
};

const FLOW_LOTTERY_ACTION_STYLE: React.CSSProperties = {
  padding: '3px 10px',
  background: 'var(--guide-accent-lottery)',
  color: '#fff',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
};

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
  background: string;
  border: string;
}

/** 各手順カード内の箇条書き番号を、featureの配色で表示する。 */
const FlowStepBullet: React.FC<FlowStepBulletProps> = ({ number, accent, background, border }) => {
  const style: React.CSSProperties = {
    width: 20, height: 20, borderRadius: '50%', background, border: `1px solid ${border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
    fontWeight: 700, color: accent, flexShrink: 0, marginTop: 1,
  };

  return <div style={style}>{number}</div>;
};

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
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-import)" background="var(--guide-accent-import-bg)" border="var(--guide-accent-import-border)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <ScreenSample title={getMsg('GuidePage.feature.import.mappingTitle')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                [getMsg('GuidePage.label.userName'), getMsg('GuidePage.label.name')],
                [getMsg('GuidePage.feature.import.xIdRequired'), getMsg('GuidePage.feature.import.xTwitterId')],
                [getMsg('GuidePage.feature.import.preferredCast1'), getMsg('GuidePage.feature.import.firstChoice')],
                [getMsg('GuidePage.feature.import.preferredCast2'), getMsg('GuidePage.feature.import.secondChoice')],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 90, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{l}</span>
                  <span style={FLOW_IMPORT_MAPPING_VALUE_STYLE}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 4, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
                <span style={FLOW_IMPORT_LOTTERY_ACTION_STYLE}>{getMsg('GuidePage.flow.import.lotteryOnly')}</span>
                <span style={FLOW_IMPORT_CONFIRM_ACTION_STYLE}>{getMsg('GuidePage.feature.import.importButton')}</span>
              </div>
            </div>
          </ScreenSample>
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
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-primary)" background="var(--guide-accent-primary-bg)" border="var(--guide-accent-primary-border)" />
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
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-cast)" background="var(--guide-accent-cast-bg)" border="var(--guide-accent-cast-border)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <ScreenSample title={getMsg('GuidePage.feature.attendance.settingsTitle')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                {
                  label: getMsg('GuidePage.feature.attendance.present'),
                  color: '#3ba55d',
                  casts: [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')],
                },
                { label: getMsg('GuidePage.feature.attendance.waiting'), color: '#747f8d', casts: [getMsg('GuidePage.sample.castD')] },
              ].map(col => (
                <div key={col.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: col.color, marginBottom: 4 }}>{col.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {col.casts.map(c => (
                      <span key={c} style={{ padding: '3px 7px', borderRadius: 4, background: col.color, color: '#fff', fontSize: 10 }}>{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, textAlign: 'right' }}><span style={FLOW_ATTENDANCE_ACTION_STYLE}>{getMsg('AttendanceSetupView.recordAttendance')}</span></div>
          </ScreenSample>
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
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-lottery)" background="var(--guide-accent-lottery-bg)" border="var(--guide-accent-lottery-border)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <ScreenSample title={getMsg('GuidePage.feature.lottery.sampleTitle')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                [getMsg('GuidePage.feature.lottery.formatLabel'), getMsg('GuidePage.feature.lottery.random')],
                [getMsg('GuidePage.feature.lottery.winnerCountLabel'), getMsg('GuidePage.feature.lottery.sampleWinnerCount')],
                [getMsg('GuidePage.feature.lottery.rotationLabel'), getMsg('GuidePage.feature.lottery.sampleRotationCount')],
                [getMsg('GuidePage.flow.lottery.tableCountLabel'), getMsg('GuidePage.feature.lottery.sampleTableCount')],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 70, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{l}</span>
                  <span style={FLOW_LOTTERY_SETTING_VALUE_STYLE}>{v}</span>
                </div>
              ))}
              <div style={FLOW_LOTTERY_STATUS_STYLE}>{getMsg('GuidePage.flow.lottery.sampleStatus')}</div>
              <div style={{ textAlign: 'right' }}><span style={FLOW_LOTTERY_ACTION_STYLE}>{getMsg('GuidePage.feature.lottery.execute')}</span></div>
            </div>
          </ScreenSample>
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
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-matching)" background="var(--guide-accent-matching-bg)" border="var(--guide-accent-matching-border)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <ScreenSample title={getMsg('GuidePage.flow.matching.sampleTitle')}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {[
                    getMsg('GuidePage.label.cast'),
                    getMsg('GuidePage.feature.matching.rotation1'),
                    getMsg('GuidePage.feature.matching.rotation2'),
                  ].map(h => <th key={h} scope="col" style={{ padding: '3px 6px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.flow.applicantData.sampleUser1'), getMsg('GuidePage.flow.applicantData.sampleUser3'), 1, 2],
                  [getMsg('GuidePage.sample.castB'), getMsg('GuidePage.flow.matching.sampleUser'), getMsg('GuidePage.flow.applicantData.sampleUser1'), 0, 1],
                  [getMsg('GuidePage.sample.castC'), getMsg('GuidePage.flow.applicantData.sampleUser3'), getMsg('GuidePage.sample.notAvailable'), 3, 0],
                ].map(([n, c1, c2, r1, r2], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{n}</td>
                    {[[c1, r1], [c2, r2]].map(function renderRotationResult([candidate, rankValue], j) {
                      const candidateName = candidate as string;
                      const rank = rankValue as number;
                      const badgeStyle: React.CSSProperties = {
                        marginLeft: 3,
                        padding: '1px 4px',
                        borderRadius: 3,
                        ...getPreferenceBadgeColors(rank),
                        fontSize: 9,
                        fontWeight: 700,
                      };

                      return (
                        <td key={j} style={{ padding: '4px 6px' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-default)' }}>{candidateName}</span>
                          {rank > 0 && (
                            <span style={badgeStyle}>{getMsg('GuidePage.feature.matching.preferenceRank', { rank })}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScreenSample>
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
                <FlowStepBullet number={i + 1} accent="var(--guide-accent-output)" background="var(--guide-accent-output-bg)" border="var(--guide-accent-output-border)" />
                <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
          <ScreenSample title={getMsg('GuidePage.flow.output.sampleTitle')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
              {
                label: getMsg('GuidePage.flow.output.saveLottery'),
                color: 'var(--guide-accent-lottery)',
                bg: 'var(--guide-accent-lottery-bg)',
                border: 'var(--guide-accent-lottery-border)',
              },
              {
                label: getMsg('GuidePage.flow.output.castPng'), color: 'var(--guide-accent-primary)',
                bg: 'var(--guide-accent-primary-bg)', border: 'var(--guide-accent-primary-border)',
              },
              {
                label: getMsg('GuidePage.flow.output.tablePng'), color: 'var(--guide-accent-primary)',
                bg: 'var(--guide-accent-primary-bg)', border: 'var(--guide-accent-primary-border)',
              },
              {
                label: getMsg('GuidePage.flow.output.matchingTsv'),
                color: 'var(--guide-accent-lottery)',
                bg: 'var(--guide-accent-lottery-bg)',
                border: 'var(--guide-accent-lottery-border)',
              },
              ].map(({ label, color, bg, border }) => (
              <div
                key={label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  borderRadius: 5, background: bg, border: `1px solid ${border}`,
                  fontSize: 11, color: 'var(--text-default)', fontWeight: 600,
                }}
              >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          </ScreenSample>
        </div>
      </div>

    </div>
  </section>
);
