// 機能別ガイドの静的説明で共有する見出しと一覧の表示部品。

import React from 'react';
import type { FeatureId } from '@/features/guide/guideSampleContext';
import { getMsg } from '@/messages/getMsg';

const STEP_NUMBER_STYLE: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--accent-primary)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 1,
};

export function getGuideFeatureHeadingId(feature: FeatureId): string {
  return `guide-feature-${feature}-heading`;
}

export const FeatureHeader: React.FC<{
  icon: React.ReactNode;
  headingId: string;
  title: string;
  description: string;
}> = ({ icon, headingId, title, description }) => {
  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 22px',
    marginBottom: 24,
    marginLeft: -24, marginRight: -24, marginTop: -20,
    background: 'var(--guide-feature-header)',
    borderRadius: '10px 10px 0 0',
  };
  const iconStyle: React.CSSProperties = {
    width: 52, height: 52, flexShrink: 0,
    background: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff',
  };

  return (
    <header style={headerStyle}>
      <div style={iconStyle} aria-hidden="true">{icon}</div>
      <div>
        <h2 id={headingId} style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{title}</h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '5px 0 0', lineHeight: 1.5 }}>{description}</p>
      </div>
    </header>
  );
};

// 注意枠の判定に使用する共通ラベル。
export const NOTICE_SECTION_TITLE = getMsg('GuidePage.section.notice');

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const headingId = React.useId();
  const isNotice = title === NOTICE_SECTION_TITLE;
  const sectionColor = isNotice ? 'var(--guide-notice)' : 'var(--border-default)';
  const headerBackground = isNotice ? 'var(--guide-notice)' : 'var(--surface-hover)';
  const headingWeight = isNotice ? 900 : 700;
  const headingColor = isNotice ? '#1a1000' : 'var(--text-muted)';

  return (
    <section style={{ marginBottom: 12 }} aria-labelledby={headingId}>
      <div style={{ border: `1px solid ${sectionColor}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', background: headerBackground, borderBottom: `1px solid ${sectionColor}` }}>
          <h3 id={headingId} style={{ fontSize: 11, fontWeight: headingWeight, color: headingColor, margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</h3>
        </div>
        <div style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-default)', lineHeight: 1.8, background: 'var(--surface-panel-muted)' }}>
          {children}
        </div>
      </div>
    </section>
  );
};

export const FeatureList: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 10px',
            borderRadius: 6, background: 'var(--surface-panel)', border: '1px solid var(--border-default)',
          }}
        >
          <span style={{ color: 'var(--accent-primary)', flexShrink: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.5 }} aria-hidden="true">›</span>
          <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
};

export const StepList: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={STEP_NUMBER_STYLE} aria-hidden="true">{i + 1}</span>
          <span style={{ fontSize: 14, color: 'var(--text-default)', lineHeight: 1.6, paddingTop: 4 }}>{item}</span>
        </li>
      ))}
    </ol>
  );
};

export const NoteList: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--guide-notice)', flexShrink: 0, fontWeight: 700 }} aria-hidden="true">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
};
