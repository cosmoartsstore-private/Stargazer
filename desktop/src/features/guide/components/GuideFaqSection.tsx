import React from 'react';
import { HelpCircle } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../GuidePage.module.css';

const FAQ_MARKER_STYLE: React.CSSProperties = {
  color: '#fff',
  fontWeight: 800,
  fontSize: 11,
  padding: '2px 7px',
  borderRadius: 4,
  flexShrink: 0,
  marginTop: 1,
};

const QUESTION_MARKER_STYLE: React.CSSProperties = {
  ...FAQ_MARKER_STYLE,
  background: 'var(--accent-primary)',
};

const ANSWER_MARKER_STYLE: React.CSSProperties = {
  ...FAQ_MARKER_STYLE,
  background: 'var(--guide-accent-output)',
};

/** 全体フローに関する質問と回答を表示する。 */
export const GuideFaqSection: React.FC = () => (
  <section className={styles.guideSection}>
    <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}><HelpCircle size={22} />{getMsg('GuidePage.faq.title')}</h2>
    <dl style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
      {([
        { q: getMsg('GuidePage.faq.item1.question'), a: getMsg('GuidePage.faq.item1.answer') },
        { q: getMsg('GuidePage.faq.item2.question'), a: getMsg('GuidePage.faq.item2.answer') },
        { q: getMsg('GuidePage.faq.item3.question'), a: getMsg('GuidePage.faq.item3.answer') },
        { q: getMsg('GuidePage.faq.item4.question'), a: getMsg('GuidePage.faq.item4.answer') },
        { q: getMsg('GuidePage.faq.item5.question'), a: getMsg('GuidePage.faq.item5.answer') },
        { q: getMsg('GuidePage.faq.item6.question'), a: getMsg('GuidePage.faq.item6.answer') },
        { q: getMsg('GuidePage.faq.item7.question'), a: getMsg('GuidePage.faq.item7.answer') },
        { q: getMsg('GuidePage.faq.item8.question'), a: getMsg('GuidePage.faq.item8.answer') },
        { q: getMsg('GuidePage.faq.item9.question'), a: getMsg('GuidePage.faq.item9.answer') },
        { q: getMsg('GuidePage.faq.item10.question'), a: getMsg('GuidePage.faq.item10.answer') },
      ] as const).map(({ q, a }) => (
        <div key={q} className={styles.guideCard} style={{ padding: '14px 18px' }}>
          <dt style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
            <span style={QUESTION_MARKER_STYLE}>{getMsg('GuidePage.faq.questionMarker')}</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)' }}>{q}</span>
          </dt>
          <dd style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: 0 }}>
            <span style={ANSWER_MARKER_STYLE}>{getMsg('GuidePage.faq.answerMarker')}</span>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.7 }}>{a}</p>
          </dd>
        </div>
      ))}
    </dl>
  </section>
);
