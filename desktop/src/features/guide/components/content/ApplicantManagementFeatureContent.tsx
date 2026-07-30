// 応募者データ、取込、抽選、マッチングの機能別ガイド本文。

import React from 'react';
import { BarChart3, CheckCircle, Database, FileText } from 'lucide-react';
import type { FeatureId } from '@/features/guide/guideSampleContext';
import { getMsg } from '@/messages/getMsg';
import { FeatureGuideSample } from '../GuideFeatureSample';
import { GuideImportScreenSample } from '../GuideImportScreenSample';
import {
  FeatureHeader,
  FeatureList,
  NoteList,
  NOTICE_SECTION_TITLE,
  SAMPLE_NONE_LABEL,
  ScreenSample,
  Section,
  StepList,
  getGuideFeatureHeadingId,
  getPreferenceBadgeColors,
} from './GuideContentPrimitives';

type ApplicantManagementFeatureId = Extract<FeatureId, 'applicant-data' | 'import' | 'lottery' | 'matching'>;

const LOTTERY_SETTING_VALUE_STYLE: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--surface-panel-muted)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  fontSize: 11,
  color: 'var(--text-heading)',
  fontWeight: 600,
};

const LOTTERY_EXECUTE_SAMPLE_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: '4px 0',
  background: 'var(--guide-accent-lottery)',
  color: '#fff',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 700,
  textAlign: 'center',
};

const MATCHING_LEGEND_BADGE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
};

export const APPLICANT_MANAGEMENT_FEATURE_CONTENT: Record<ApplicantManagementFeatureId, React.ReactNode> = {
  'applicant-data': (
    <div>
      <FeatureHeader
        icon={<Database size={26} />}
        headingId={getGuideFeatureHeadingId('applicant-data')}
        title={getMsg('GuidePage.nav.applicantData')}
        description={getMsg('GuidePage.feature.applicantData.description')}
        color="var(--guide-accent-primary)"
        colorSoft="var(--guide-accent-primary-soft)"
      />
      <FeatureGuideSample feature="applicant-data" />

      <ScreenSample title={getMsg('GuidePage.nav.applicantData')}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-default)', marginBottom: 8 }}>
          {[
            getMsg('GuidePage.feature.applicantData.sampleTabAll'),
            getMsg('GuidePage.feature.applicantData.sampleTabCaution'),
          ].map(function renderApplicantFilterTab(t, i) {
            const isActive = i === 0;
            const borderBottom = isActive
              ? '2px solid var(--accent-primary)'
              : '2px solid transparent';
            const color = isActive ? 'var(--accent-primary)' : 'var(--text-muted)';
            const fontWeight = isActive ? 700 : 400;

            return (
              <span key={t} style={{ padding: '4px 12px', fontSize: 11, borderBottom, color, fontWeight }}>{t}</span>
            );
          })}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              {[
                getMsg('GuidePage.label.userName'),
                getMsg('GuidePage.label.xId'),
                getMsg('GuidePage.label.preference1'),
                getMsg('GuidePage.label.preference2'),
                getMsg('GuidePage.label.preference3'),
              ].map(h => <th key={h} scope="col" style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              {
                name: getMsg('GuidePage.feature.applicantData.sampleUser1'),
                xid: getMsg('GuidePage.feature.applicantData.sampleXId1'),
                c: [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')],
                caution: false,
              },
              {
                name: getMsg('GuidePage.feature.applicantData.sampleUser2'),
                xid: getMsg('GuidePage.feature.applicantData.sampleXId2'),
                c: [getMsg('GuidePage.sample.castA'), '', ''],
                caution: true,
              },
              {
                name: getMsg('GuidePage.feature.applicantData.sampleUser3'),
                xid: getMsg('GuidePage.feature.applicantData.sampleXId3'),
                c: [getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castA'), ''],
                caution: false,
              },
            ].map(function renderApplicantSampleRow(r, i) {
              const background = r.caution ? 'rgba(237,66,69,0.08)' : 'transparent';
              const nameColor = r.caution ? '#ed4245' : 'var(--text-default)';
              const nameWeight = r.caution ? 600 : 400;

              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-default)', background }}>
                  <td style={{ padding: '5px 8px', color: nameColor, fontWeight: nameWeight }}>{r.name}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-link, #00b0f4)' }}>{r.xid}</td>
                  {r.c.map((c, j) => <td key={j} style={{ padding: '5px 8px', color: 'var(--text-default)' }}>{c}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScreenSample>

      <Section title={getMsg('GuidePage.section.overview')}>
        <p>{getMsg('GuidePage.feature.applicantData.overview')}</p>
      </Section>

      <Section title={getMsg('GuidePage.section.mainFeatures')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.applicantData.feature1'), getMsg('GuidePage.feature.applicantData.feature2'),
          getMsg('GuidePage.feature.applicantData.feature3'), getMsg('GuidePage.feature.applicantData.feature4'),
          getMsg('GuidePage.feature.applicantData.feature5'), getMsg('GuidePage.feature.applicantData.feature6'),
          getMsg('GuidePage.feature.applicantData.feature7'), getMsg('GuidePage.feature.applicantData.feature8'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.applicantData.cautionTitle')}>
        <p>
          {getMsg('GuidePage.feature.applicantData.cautionIntro')}
          <br />
          {getMsg('GuidePage.feature.applicantData.cautionDetail')}
        </p>
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[getMsg('GuidePage.feature.applicantData.note1'), getMsg('GuidePage.feature.applicantData.note2'), getMsg('GuidePage.feature.applicantData.note3')]} />
      </Section>
    </div>
  ),

  'import': (
    <div>
      <FeatureHeader
        icon={<FileText size={26} />}
        headingId={getGuideFeatureHeadingId('import')}
        title={getMsg('GuidePage.nav.import')}
        description={getMsg('GuidePage.feature.import.description')}
        color="var(--guide-accent-import)"
        colorSoft="var(--guide-accent-import-soft)"
      />
      <FeatureGuideSample feature="import" />

      <GuideImportScreenSample />

      <Section title={getMsg('GuidePage.feature.import.stepsTitle')}>
        <StepList items={[
          getMsg('GuidePage.feature.import.step1'), getMsg('GuidePage.feature.import.step2'),
          getMsg('GuidePage.feature.import.step3'), getMsg('GuidePage.feature.import.step4'),
          getMsg('GuidePage.feature.import.step5'), getMsg('GuidePage.feature.import.step6'),
          getMsg('GuidePage.feature.import.step7'), getMsg('GuidePage.feature.import.step8'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.import.mappingTitle')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.import.mapping1'), getMsg('GuidePage.feature.import.mapping2'),
          getMsg('GuidePage.feature.import.mapping3'), getMsg('GuidePage.feature.import.mapping4'),
        ]} />
        <p style={{ marginTop: 8 }}>{getMsg('GuidePage.feature.import.mappingHelp')}</p>
      </Section>

      <Section title={getMsg('GuidePage.section.preview')}>
        <p>{getMsg('GuidePage.feature.import.previewDescription')}</p>
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[getMsg('GuidePage.feature.import.note1'), getMsg('GuidePage.feature.import.note2'), getMsg('GuidePage.feature.import.note3')]} />
      </Section>
    </div>
  ),

  'lottery': (
    <div>
      <FeatureHeader
        icon={<CheckCircle size={26} />}
        headingId={getGuideFeatureHeadingId('lottery')}
        title={getMsg('GuidePage.nav.lottery')}
        description={getMsg('GuidePage.feature.lottery.description')}
        color="var(--guide-accent-lottery)"
        colorSoft="var(--guide-accent-lottery-soft)"
      />
      <FeatureGuideSample feature="lottery" />

      <ScreenSample title={getMsg('GuidePage.feature.lottery.sampleTitle')}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: getMsg('GuidePage.feature.lottery.formatLabel'), value: getMsg('GuidePage.feature.lottery.random') },
              { label: getMsg('GuidePage.feature.lottery.winnerCountLabel'), value: getMsg('GuidePage.feature.lottery.sampleWinnerCount') },
              { label: getMsg('GuidePage.feature.lottery.rotationLabel'), value: getMsg('GuidePage.feature.lottery.sampleRotationCount') },
              { label: getMsg('GuidePage.feature.lottery.totalTablesLabel'), value: getMsg('GuidePage.feature.lottery.sampleTableCount') },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 80, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{r.label}</span>
                <span style={LOTTERY_SETTING_VALUE_STYLE}>{r.value}</span>
              </div>
            ))}
          </div>
          <div style={{ width: 130, padding: '10px 12px', background: 'var(--guide-accent-lottery-bg)', border: '1px solid var(--guide-accent-lottery-border)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--guide-accent-lottery)', fontWeight: 700, marginBottom: 4 }}>{getMsg('GuidePage.feature.lottery.info')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{getMsg('GuidePage.feature.lottery.sampleTotalSeats')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{getMsg('GuidePage.feature.lottery.sampleAttendingCasts')}</div>
            <div style={LOTTERY_EXECUTE_SAMPLE_STYLE}>{getMsg('GuidePage.feature.lottery.execute')}</div>
          </div>
        </div>
      </ScreenSample>

      <Section title={getMsg('GuidePage.feature.lottery.matchingFormatTitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {([
            {
              id: getMsg('GuidePage.feature.lottery.onlyId'), color: '#6b7280',
              title: getMsg('GuidePage.feature.lottery.onlyTitle'),
              desc: getMsg('GuidePage.feature.lottery.onlyDescription'),
            },
            {
              id: getMsg('GuidePage.feature.lottery.randomId'), color: '#3b82f6',
              title: getMsg('GuidePage.feature.lottery.random'),
              desc: getMsg('GuidePage.feature.lottery.randomDescription'),
            },
            {
              id: getMsg('GuidePage.feature.lottery.rotationId'),
              color: '#10b981',
              title: getMsg('GuidePage.feature.lottery.rotationTitle'),
              desc: getMsg('GuidePage.feature.lottery.rotationDescription'),
            },
            {
              id: getMsg('GuidePage.feature.lottery.groupId'), color: '#f59e0b',
              title: getMsg('GuidePage.feature.lottery.groupTitle'),
              desc: getMsg('GuidePage.feature.lottery.groupDescription'),
            },
          ] as const).map(m => (
              <div
                key={m.id}
                style={{ borderRadius: 8, padding: '12px 14px', background: 'var(--surface-panel)', border: `1px solid ${m.color}44`, borderLeft: `3px solid ${m.color}` }}
              >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#fff', background: m.color, padding: '2px 7px', borderRadius: 4 }}>{m.id}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}>{m.title}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={getMsg('GuidePage.feature.lottery.settingsTitle')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.lottery.setting1'), getMsg('GuidePage.feature.lottery.setting2'),
          getMsg('GuidePage.feature.lottery.setting3'), getMsg('GuidePage.feature.lottery.setting4'),
          getMsg('GuidePage.feature.lottery.setting5'), getMsg('GuidePage.feature.lottery.setting6'),
          getMsg('GuidePage.feature.lottery.setting7'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.lottery.statusTitle')}>
        <p>{getMsg('GuidePage.feature.lottery.statusDescription')}</p>
      </Section>

      <Section title={getMsg('GuidePage.feature.lottery.afterExecutionTitle')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.lottery.result1'), getMsg('GuidePage.feature.lottery.result2'),
          getMsg('GuidePage.feature.lottery.result3'), getMsg('GuidePage.feature.lottery.result4'),
          getMsg('GuidePage.feature.lottery.result5'),
        ]} />
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[getMsg('GuidePage.feature.lottery.note1'), getMsg('GuidePage.feature.lottery.note2'), getMsg('GuidePage.feature.lottery.note3')]} />
      </Section>
    </div>
  ),

  'matching': (
    <div>
      <FeatureHeader
        icon={<BarChart3 size={26} />}
        headingId={getGuideFeatureHeadingId('matching')}
        title={getMsg('GuidePage.nav.matching')}
        description={getMsg('GuidePage.feature.matching.description')}
        color="var(--guide-accent-matching)"
        colorSoft="var(--guide-accent-matching-soft)"
      />
      <FeatureGuideSample feature="matching" />

      <ScreenSample title={getMsg('GuidePage.feature.matching.sampleTitle')}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              {[
                getMsg('GuidePage.label.cast'),
                getMsg('GuidePage.feature.matching.rotation1'),
                getMsg('GuidePage.feature.matching.rotation2'),
                getMsg('GuidePage.feature.matching.rotation3'),
                getMsg('GuidePage.label.total'),
              ].map(h => <th key={h} scope="col" style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              {
                cast: getMsg('GuidePage.sample.castA'),
                users: [getMsg('GuidePage.feature.matching.sampleUser1'), getMsg('GuidePage.feature.matching.sampleUser2'), SAMPLE_NONE_LABEL],
                ranks: [1, 1, 0],
              },
              {
                cast: getMsg('GuidePage.sample.castB'),
                users: [getMsg('GuidePage.feature.matching.sampleUser3'), getMsg('GuidePage.feature.matching.sampleUser1'), getMsg('GuidePage.feature.matching.sampleUser2')],
                ranks: [0, 2, 3],
              },
              {
                cast: getMsg('GuidePage.sample.castC'),
                users: [getMsg('GuidePage.feature.matching.sampleUser2'), SAMPLE_NONE_LABEL, getMsg('GuidePage.feature.matching.sampleUser1')],
                ranks: [2, 0, 1],
              },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-default)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--text-default)', fontWeight: 700 }}>{r.cast}</td>
                {r.users.map(function renderMatchingUser(user, j) {
                  const rank = r.ranks[j];
                  const userColor = user === SAMPLE_NONE_LABEL
                    ? 'var(--text-muted)'
                    : 'var(--text-default)';
                  const badgeStyle: React.CSSProperties = {
                    marginLeft: 4,
                    padding: '1px 5px',
                    borderRadius: 3,
                    ...getPreferenceBadgeColors(rank),
                    fontSize: 9,
                    fontWeight: 700,
                  };

                  return (
                    <td key={j} style={{ padding: '5px 8px' }}>
                      <span style={{ fontSize: 10, color: userColor }}>{user}</span>
                      {rank > 0 && (
                        <span style={badgeStyle}>{getMsg('GuidePage.feature.matching.preferenceRank', { rank })}</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{r.users.filter((user) => user !== SAMPLE_NONE_LABEL).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScreenSample>

      <Section title={getMsg('GuidePage.section.screenLayout')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.matching.layout1'), getMsg('GuidePage.feature.matching.layout2'),
          getMsg('GuidePage.feature.matching.layout3'), getMsg('GuidePage.feature.matching.layout4'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.matching.ngTitle')}>
        <p>{getMsg('GuidePage.feature.matching.ngDescription')}</p>
        <FeatureList items={[getMsg('GuidePage.feature.matching.ng1'), getMsg('GuidePage.feature.matching.ng2')]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.matching.executeTitle')}>
        <p>{getMsg('GuidePage.feature.matching.executeDescription')}</p>
      </Section>

      <Section title={getMsg('GuidePage.feature.matching.outputTitle')}>
        <FeatureList items={[getMsg('GuidePage.feature.matching.output1'), getMsg('GuidePage.feature.matching.output2')]} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {([
            { label: getMsg('GuidePage.feature.matching.firstChoice'), bg: '#f5c400', text: '#000' },
            { label: getMsg('GuidePage.feature.matching.secondChoice'), bg: '#a8a8a8', text: '#000' },
            { label: getMsg('GuidePage.feature.matching.thirdChoice'), bg: '#ad6f2d', text: '#fff' },
            { label: getMsg('GuidePage.feature.matching.laterChoice'), bg: '#4a4a4a', text: '#bbb' },
          ] as const).map(b => (
            <div key={b.label} style={{ ...MATCHING_LEGEND_BADGE_STYLE, background: b.bg, color: b.text }}>{b.label}</div>
          ))}
        </div>
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[
          getMsg('GuidePage.feature.matching.note1'), getMsg('GuidePage.feature.matching.note2'),
          getMsg('GuidePage.feature.matching.note3'), getMsg('GuidePage.feature.matching.note4'),
        ]} />
      </Section>
    </div>
  ),
};
