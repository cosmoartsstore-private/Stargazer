// キャスト、NG、出欠、投稿の機能別ガイド本文。

import type { CSSProperties, ReactNode } from 'react';
import { Calendar, Settings, Users, UserX } from 'lucide-react';
import type { FeatureId } from '@/features/guide/guideSampleContext';
import { getMsg } from '@/messages/getMsg';
import { FeatureGuideSample } from '../GuideFeatureSample';
import {
  FeatureHeader,
  FeatureList,
  NoteList,
  NOTICE_SECTION_TITLE,
  Section,
  getGuideFeatureHeadingId,
} from './GuideContentPrimitives';

type InternalManagementFeatureId = Extract<FeatureId, 'cast' | 'ng' | 'attendance' | 'tweet'>;

const TWEET_PLACEHOLDER_CODE_STYLE: CSSProperties = {
  fontFamily: 'monospace',
  fontWeight: 700,
  fontSize: 13,
  color: 'var(--accent-primary)',
  background: 'rgba(88,101,242,0.12)',
  padding: '2px 8px',
  borderRadius: 4,
  flexShrink: 0,
};

export const INTERNAL_MANAGEMENT_FEATURE_CONTENT: Record<InternalManagementFeatureId, ReactNode> = {
  'cast': (
    <div>
      <FeatureHeader
        icon={<Users size={26} />}
        headingId={getGuideFeatureHeadingId('cast')}
        title={getMsg('GuidePage.nav.cast')}
        description={getMsg('GuidePage.feature.cast.description')}
      />
      <FeatureGuideSample feature="cast" />

      <Section title={getMsg('GuidePage.section.screenLayout')}>
        <p>{getMsg('GuidePage.feature.cast.layoutDescription')}</p>
      </Section>

      <Section title={getMsg('GuidePage.feature.cast.listTitle')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.cast.list1'), getMsg('GuidePage.feature.cast.list2'),
          getMsg('GuidePage.feature.cast.list3'), getMsg('GuidePage.feature.cast.list4'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.cast.detailTitle')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.cast.detail1'), getMsg('GuidePage.feature.cast.detail2'),
          getMsg('GuidePage.feature.cast.detail3'), getMsg('GuidePage.feature.cast.detail4'),
          getMsg('GuidePage.feature.cast.detail5'), getMsg('GuidePage.feature.cast.detail6'),
          getMsg('GuidePage.feature.cast.detail7'), getMsg('GuidePage.feature.cast.detail8'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.cast.attendanceRelationTitle')}>
        <p>{getMsg('GuidePage.feature.cast.attendanceRelation')}</p>
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[
          getMsg('GuidePage.feature.cast.note1'), getMsg('GuidePage.feature.cast.note2'),
          getMsg('GuidePage.feature.cast.note3'), getMsg('GuidePage.feature.cast.note4'),
          getMsg('GuidePage.feature.cast.note5'), getMsg('GuidePage.feature.cast.note6'),
        ]} />
      </Section>
    </div>
  ),

  'ng': (
    <div>
      <FeatureHeader
        icon={<UserX size={26} />}
        headingId={getGuideFeatureHeadingId('ng')}
        title={getMsg('GuidePage.nav.ng')}
        description={getMsg('GuidePage.feature.ng.description')}
      />
      <FeatureGuideSample feature="ng" />

      <Section title={getMsg('GuidePage.section.tabStructure')}>
        <FeatureList items={[getMsg('GuidePage.feature.ng.tab1'), getMsg('GuidePage.feature.ng.tab2')]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.ng.castTabTitle')}>
        <p>{getMsg('GuidePage.feature.ng.castTabDescription')}</p>
        <FeatureList items={[
          getMsg('GuidePage.feature.ng.castFeature1'), getMsg('GuidePage.feature.ng.castFeature2'),
          getMsg('GuidePage.feature.ng.castFeature3'), getMsg('GuidePage.feature.ng.castFeature4'),
          getMsg('GuidePage.feature.ng.castFeature5'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.ng.cautionTabTitle')}>
        <p>{getMsg('GuidePage.feature.ng.cautionTabDescription')}</p>

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>{getMsg('GuidePage.feature.ng.candidateSection')}</h4>
        <FeatureList items={[
          getMsg('GuidePage.feature.ng.candidate1'), getMsg('GuidePage.feature.ng.candidate2'),
          getMsg('GuidePage.feature.ng.candidate3'), getMsg('GuidePage.feature.ng.candidate4'),
        ]} />

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>{getMsg('GuidePage.feature.ng.registeredSection')}</h4>
        <FeatureList items={[
          getMsg('GuidePage.feature.ng.registered1'), getMsg('GuidePage.feature.ng.registered2'),
          getMsg('GuidePage.feature.ng.registered3'), getMsg('GuidePage.feature.ng.registered4'),
        ]} />
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[getMsg('GuidePage.feature.ng.note1'), getMsg('GuidePage.feature.ng.note2'), getMsg('GuidePage.feature.ng.note3')]} />
      </Section>
    </div>
  ),

  'attendance': (
    <div>
      <FeatureHeader
        icon={<Calendar size={26} />}
        headingId={getGuideFeatureHeadingId('attendance')}
        title={getMsg('GuidePage.nav.attendance')}
        description={getMsg('GuidePage.feature.attendance.description')}
      />
      <FeatureGuideSample feature="attendance" />

      <Section title={getMsg('GuidePage.section.tabStructure')}>
        <FeatureList items={[getMsg('GuidePage.feature.attendance.tab1'), getMsg('GuidePage.feature.attendance.tab2')]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.attendance.settingsTabTitle')}>
        <p>{getMsg('GuidePage.feature.attendance.settingsDescription')}</p>
        <FeatureList items={[
          getMsg('GuidePage.feature.attendance.setting1'), getMsg('GuidePage.feature.attendance.setting2'),
          getMsg('GuidePage.feature.attendance.setting3'), getMsg('GuidePage.feature.attendance.setting4'),
          getMsg('GuidePage.feature.attendance.setting5'),
        ]} />

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>{getMsg('GuidePage.feature.attendance.saveModalTitle')}</h4>
        <FeatureList items={[
          getMsg('GuidePage.feature.attendance.modal1'), getMsg('GuidePage.feature.attendance.modal2'),
          getMsg('GuidePage.feature.attendance.modal3'), getMsg('GuidePage.feature.attendance.modal4'),
          getMsg('GuidePage.feature.attendance.modal5'),
        ]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.attendance.historyTabTitle')}>
        <FeatureList items={[getMsg('GuidePage.feature.attendance.history1'), getMsg('GuidePage.feature.attendance.history2'), getMsg('GuidePage.feature.attendance.history3')]} />
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[
          getMsg('GuidePage.feature.attendance.note1'), getMsg('GuidePage.feature.attendance.note2'),
          getMsg('GuidePage.feature.attendance.note3'), getMsg('GuidePage.feature.attendance.note4'),
        ]} />
      </Section>
    </div>
  ),

  'tweet': (
    <div>
      <FeatureHeader
        icon={<Settings size={26} />}
        headingId={getGuideFeatureHeadingId('tweet')}
        title={getMsg('GuidePage.nav.tweet')}
        description={getMsg('GuidePage.feature.tweet.description')}
      />
      <FeatureGuideSample feature="tweet" />

      <Section title={getMsg('GuidePage.section.screenLayout')}>
        <FeatureList items={[getMsg('GuidePage.feature.tweet.layout1'), getMsg('GuidePage.feature.tweet.layout2')]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.tweet.editorTitle')}>
        <p>{getMsg('GuidePage.feature.tweet.editorDescription')}</p>

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>{getMsg('GuidePage.feature.tweet.placeholderListTitle')}</h4>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0 }}>
          {([
            { ph: getMsg('GuidePage.feature.tweet.castsToken'), desc: getMsg('GuidePage.feature.tweet.castsDescription') },
            { ph: getMsg('GuidePage.feature.tweet.eventNameToken'), desc: getMsg('GuidePage.feature.tweet.eventNameDescription') },
          ] as const).map(({ ph, desc }) => (
            <div
              key={ph}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderRadius: 7, background: 'var(--surface-panel)', border: '1px solid var(--border-default)',
              }}
            >
              <dt><code style={TWEET_PLACEHOLDER_CODE_STYLE}>{ph}</code></dt>
              <dd style={{ margin: 0, fontSize: 13, color: 'var(--text-default)' }}><span aria-hidden="true">→ </span>{desc}</dd>
            </div>
          ))}
        </dl>
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>{getMsg('GuidePage.feature.tweet.placeholderHelp')}</p>
      </Section>

      <Section title={getMsg('GuidePage.section.preview')}>
        <FeatureList items={[
          getMsg('GuidePage.feature.tweet.preview1'), getMsg('GuidePage.feature.tweet.preview2'),
          getMsg('GuidePage.feature.tweet.preview3'), getMsg('GuidePage.feature.tweet.preview4'),
        ]} />
      </Section>

      <Section title={NOTICE_SECTION_TITLE}>
        <NoteList items={[getMsg('GuidePage.feature.tweet.note1'), getMsg('GuidePage.feature.tweet.note2'), getMsg('GuidePage.feature.tweet.note3')]} />
      </Section>
    </div>
  ),
};
