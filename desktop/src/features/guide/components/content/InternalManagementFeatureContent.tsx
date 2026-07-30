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
  ScreenSample,
  Section,
  getGuideFeatureHeadingId,
} from './GuideContentPrimitives';

type InternalManagementFeatureId = Extract<FeatureId, 'cast' | 'ng' | 'attendance' | 'tweet'>;

const CAST_AVATAR_STYLE: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: 'var(--surface-panel-muted)',
  border: '1px solid var(--border-default)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  color: 'var(--text-muted)',
};

const CAST_DETAIL_VALUE_STYLE: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-default)',
  padding: '3px 6px',
  background: 'var(--surface-panel-muted)',
  borderRadius: 4,
  border: '1px solid var(--border-default)',
};

const TWEET_SAMPLE_TEXT_STYLE: CSSProperties = {
  background: 'var(--surface-panel-muted)',
  border: '1px solid var(--border-default)',
  borderRadius: 5,
  padding: '8px 10px',
  fontSize: 11,
  color: 'var(--text-default)',
  lineHeight: 1.7,
  minHeight: 70,
};

const TWEET_PLACEHOLDER_SAMPLE_STYLE: CSSProperties = {
  padding: '2px 6px',
  background: 'rgba(88,101,242,0.15)',
  border: '1px solid rgba(88,101,242,0.3)',
  borderRadius: 4,
  fontSize: 10,
  color: 'var(--accent-primary)',
  fontFamily: 'monospace',
};

const TWEET_COPY_SAMPLE_STYLE: CSSProperties = {
  padding: '3px 8px',
  background: 'var(--accent-primary)',
  color: '#fff',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
};

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
        color="var(--guide-accent-cast)"
        colorSoft="var(--guide-accent-cast-soft)"
      />
      <FeatureGuideSample feature="cast" />

      <ScreenSample title={getMsg('GuidePage.nav.cast')}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 130, borderRight: '1px solid var(--border-default)', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { name: getMsg('GuidePage.sample.castA'), group: getMsg('GuidePage.sample.group1'), selected: true },
              { name: getMsg('GuidePage.sample.castB'), group: getMsg('GuidePage.sample.group1'), selected: false },
              { name: getMsg('GuidePage.sample.castC'), group: getMsg('GuidePage.sample.group2'), selected: false },
              { name: getMsg('GuidePage.sample.castD'), group: getMsg('GuidePage.sample.group2'), selected: false },
            ].map(function renderCastSample(c) {
              const background = c.selected ? 'var(--surface-selected)' : 'transparent';
              const nameColor = c.selected ? 'var(--text-heading)' : 'var(--text-default)';
              const nameWeight = c.selected ? 600 : 400;

              return (
                <div key={c.name} style={{ padding: '5px 8px', borderRadius: 5, background, fontSize: 11 }}>
                  <div style={{ color: nameColor, fontWeight: nameWeight }}>{c.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{c.group}</div>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={CAST_AVATAR_STYLE}>👤</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{getMsg('GuidePage.sample.castA')}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{getMsg('GuidePage.sample.group1')}</div>
              </div>
            </div>
            {[
              [getMsg('GuidePage.feature.cast.contactLabel'), getMsg('GuidePage.feature.cast.sampleContact')],
              [getMsg('GuidePage.feature.cast.profileLabel'), getMsg('GuidePage.feature.cast.sampleProfile')],
            ].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={CAST_DETAIL_VALUE_STYLE}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </ScreenSample>

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
        color="var(--guide-accent-output)"
        colorSoft="var(--guide-accent-output-soft)"
      />
      <FeatureGuideSample feature="ng" />

      <ScreenSample title={getMsg('GuidePage.feature.ng.sampleTitle')}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 120, borderRight: '1px solid var(--border-default)', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { name: getMsg('GuidePage.sample.castA'), ng: 2, sel: true },
              { name: getMsg('GuidePage.sample.castB'), ng: 0, sel: false },
              { name: getMsg('GuidePage.sample.castC'), ng: 1, sel: false },
            ].map(function renderNgCastSample(c) {
              const background = c.sel ? 'var(--surface-selected)' : 'transparent';
              const nameColor = c.sel ? 'var(--text-heading)' : 'var(--text-default)';
              const nameWeight = c.sel ? 600 : 400;

              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 7px', borderRadius: 5, background, fontSize: 11 }}>
                  <span style={{ color: nameColor, fontWeight: nameWeight }}>{c.name}</span>
                  {c.ng > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{c.ng}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{getMsg('GuidePage.feature.ng.sampleListTitle', { castName: getMsg('GuidePage.sample.castA') })}</div>
            {[
              { name: getMsg('GuidePage.feature.ng.sampleUser'), xid: getMsg('GuidePage.feature.ng.sampleXId1') },
              { name: '', xid: getMsg('GuidePage.feature.ng.sampleXId2') },
            ].map((u, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5,
                  background: 'rgba(237,66,69,0.08)', border: '1px solid rgba(237,66,69,0.2)',
                  marginBottom: 4, fontSize: 11,
                }}
              >
                <span style={{ flex: 1, color: 'var(--text-default)' }}>{u.name || getMsg('common.emptyMarker')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{u.xid}</span>
                <span style={{ color: '#ef4444', fontSize: 12 }}>✕</span>
              </div>
            ))}
          </div>
        </div>
      </ScreenSample>

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
        color="var(--guide-accent-primary)"
        colorSoft="var(--guide-accent-primary-soft)"
      />
      <FeatureGuideSample feature="attendance" />

      <ScreenSample title={getMsg('GuidePage.feature.attendance.settingsTitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {([
              {
                label: getMsg('GuidePage.feature.attendance.present'), color: '#3ba55d',
                casts: [getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')],
              },
            { label: getMsg('GuidePage.feature.attendance.waiting'), color: '#747f8d', casts: [getMsg('GuidePage.sample.castD')] },
          ] as const).map(col => (
            <div key={col.label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col.color, marginBottom: 6 }}>{col.label} ({col.casts.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {col.casts.map(c => (
                  <span key={c} style={{ padding: '4px 9px', borderRadius: 5, background: col.color, color: '#fff', fontSize: 11, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {[
            getMsg('GuidePage.feature.attendance.allWaiting'),
            getMsg('GuidePage.feature.attendance.allPresent'),
          ].map(t => (
            <span key={t} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)', fontSize: 10, color: 'var(--text-muted)' }}>{t}</span>
          ))}
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--accent-primary)', color: '#fff', fontSize: 10, fontWeight: 700 }}>{getMsg('AttendanceSetupView.recordAttendance')}</span>
        </div>
      </ScreenSample>

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
        color="var(--guide-accent-cast)"
        colorSoft="var(--guide-accent-cast-soft)"
      />
      <FeatureGuideSample feature="tweet" />

      <ScreenSample title={getMsg('GuidePage.nav.tweet')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{getMsg('GuidePage.feature.tweet.editorTitle')}</div>
            <div style={TWEET_SAMPLE_TEXT_STYLE}>{getMsg('GuidePage.feature.tweet.sampleTemplate')}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
              {[
                getMsg('GuidePage.feature.tweet.castsPlaceholder'),
                getMsg('GuidePage.feature.tweet.eventNamePlaceholder'),
              ].map(p => (
                <span key={p} style={TWEET_PLACEHOLDER_SAMPLE_STYLE}>{p}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{getMsg('GuidePage.section.preview')}</div>
            <div style={TWEET_SAMPLE_TEXT_STYLE}>{getMsg('GuidePage.feature.tweet.samplePreview')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}><span style={TWEET_COPY_SAMPLE_STYLE}>{getMsg('GuidePage.feature.tweet.copy')}</span></div>
          </div>
        </div>
      </ScreenSample>

      <Section title={getMsg('GuidePage.section.screenLayout')}>
        <FeatureList items={[getMsg('GuidePage.feature.tweet.layout1'), getMsg('GuidePage.feature.tweet.layout2')]} />
      </Section>

      <Section title={getMsg('GuidePage.feature.tweet.editorTitle')}>
        <p>{getMsg('GuidePage.feature.tweet.editorDescription')}</p>

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>{getMsg('GuidePage.feature.tweet.placeholderListTitle')}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              <code style={TWEET_PLACEHOLDER_CODE_STYLE}>{ph}</code>
              <span style={{ fontSize: 13, color: 'var(--text-default)' }}>→ {desc}</span>
            </div>
          ))}
        </div>
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
