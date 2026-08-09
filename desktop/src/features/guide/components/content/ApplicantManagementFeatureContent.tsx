// 応募者データ、取込、抽選、マッチングの機能別ガイド本文。

import React from 'react';
import { BarChart3, CheckCircle, Database, FileText } from 'lucide-react';
import type { FeatureId } from '@/features/guide/guideSampleContext';
import { getMsg } from '@/messages/getMsg';
import { FeatureGuideSample } from '../GuideFeatureSample';
import {
  FeatureHeader,
  FeatureList,
  NoteList,
  NOTICE_SECTION_TITLE,
  Section,
  StepList,
  getGuideFeatureHeadingId,
} from './GuideContentPrimitives';

type ApplicantManagementFeatureId = Extract<FeatureId, 'applicant-data' | 'import' | 'lottery' | 'matching'>;

export const APPLICANT_MANAGEMENT_FEATURE_CONTENT: Record<ApplicantManagementFeatureId, React.ReactNode> = {
  'applicant-data': (
    <div>
      <FeatureHeader
        icon={<Database size={26} />}
        headingId={getGuideFeatureHeadingId('applicant-data')}
        title={getMsg('GuidePage.nav.applicantData')}
        description={getMsg('GuidePage.feature.applicantData.description')}
      />
      <FeatureGuideSample feature="applicant-data" />

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
      />
      <FeatureGuideSample feature="import" />

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
      />
      <FeatureGuideSample feature="lottery" />

      <Section title={getMsg('GuidePage.feature.lottery.matchingFormatTitle')}>
        <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
          {([
            {
              title: getMsg('GuidePage.feature.lottery.rotationTitle'),
              desc: getMsg('GuidePage.feature.lottery.rotationDescription'),
            },
            {
              title: getMsg('GuidePage.feature.lottery.random'),
              desc: getMsg('GuidePage.feature.lottery.randomDescription'),
            },
            {
              title: getMsg('GuidePage.feature.lottery.groupTitle'),
              desc: getMsg('GuidePage.feature.lottery.groupDescription'),
            },
            {
              title: getMsg('GuidePage.feature.lottery.onlyTitle'),
              desc: getMsg('GuidePage.feature.lottery.onlyDescription'),
            },
          ] as const).map(m => (
              <li
                key={m.title}
                style={{ borderRadius: 8, padding: '12px 14px', background: 'var(--surface-panel)', border: '1px solid var(--border-default)' }}
              >
                <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{m.title}</h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{m.desc}</p>
              </li>
          ))}
        </ul>
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
      />
      <FeatureGuideSample feature="matching" />

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
        <FeatureList items={[
          getMsg('GuidePage.feature.matching.output1'), getMsg('GuidePage.feature.matching.output2'),
          getMsg('GuidePage.feature.matching.output3'),
        ]} />
        <ul style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
          {([
            { label: getMsg('GuidePage.feature.matching.firstChoice'), bg: '#f5c400', text: '#000' },
            { label: getMsg('GuidePage.feature.matching.secondChoice'), bg: '#a8a8a8', text: '#000' },
            { label: getMsg('GuidePage.feature.matching.thirdChoice'), bg: '#ad6f2d', text: '#fff' },
            { label: getMsg('GuidePage.feature.matching.laterChoice'), bg: '#4a4a4a', text: '#bbb' },
          ] as const).map(b => (
            <li
              key={b.label}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                background: b.bg,
                color: b.text,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {b.label}
            </li>
          ))}
        </ul>
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
