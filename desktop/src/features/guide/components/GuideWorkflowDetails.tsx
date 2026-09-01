// 全体フローに含まれる各画面の操作手順を表示する。

import React from 'react';
import { BarChart3, CheckCircle, Database, FileText, Settings, Users } from 'lucide-react';
import type { FeatureId } from '@/features/guide/guideFeature';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../GuidePage.module.css';
import { GuideActualFeaturePreview } from './GuideFeatureSample';

interface WorkflowStep {
  number: number;
  icon: React.ReactNode;
  title: string;
  items: readonly string[];
  preview: {
    feature: FeatureId;
    initialScrollTop?: number;
  };
}

const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    number: 1,
    icon: <FileText size={18} />,
    title: getMsg('GuidePage.flow.import.title'),
    items: [
      getMsg('GuidePage.flow.import.step1'),
      getMsg('GuidePage.flow.import.step2'),
      getMsg('GuidePage.flow.import.step3'),
      getMsg('GuidePage.flow.import.step4'),
    ],
    preview: { feature: 'import' },
  },
  {
    number: 2,
    icon: <Database size={18} />,
    title: getMsg('GuidePage.flow.applicantData.title'),
    items: [
      getMsg('GuidePage.flow.applicantData.step1'),
      getMsg('GuidePage.flow.applicantData.step2'),
      getMsg('GuidePage.flow.applicantData.step3'),
      getMsg('GuidePage.flow.applicantData.step4'),
    ],
    preview: { feature: 'applicant-data' },
  },
  {
    number: 3,
    icon: <Users size={18} />,
    title: getMsg('GuidePage.flow.attendance.title'),
    items: [
      getMsg('GuidePage.flow.attendance.step1'),
      getMsg('GuidePage.flow.attendance.step2'),
      getMsg('GuidePage.flow.attendance.step3'),
      getMsg('GuidePage.flow.attendance.step4'),
    ],
    preview: { feature: 'attendance' },
  },
  {
    number: 4,
    icon: <Settings size={18} />,
    title: getMsg('GuidePage.flow.lottery.title'),
    items: [
      getMsg('GuidePage.flow.lottery.step1'),
      getMsg('GuidePage.flow.lottery.step2'),
      getMsg('GuidePage.flow.lottery.step3'),
      getMsg('GuidePage.flow.lottery.step4'),
      getMsg('GuidePage.flow.lottery.step5'),
    ],
    preview: { feature: 'lottery' },
  },
  {
    number: 5,
    icon: <CheckCircle size={18} />,
    title: getMsg('GuidePage.flow.matching.title'),
    items: [
      getMsg('GuidePage.flow.matching.step1'),
      getMsg('GuidePage.flow.matching.step2'),
      getMsg('GuidePage.flow.matching.step3'),
      getMsg('GuidePage.flow.matching.step4'),
    ],
    preview: { feature: 'matching' },
  },
  {
    number: 6,
    icon: <BarChart3 size={18} />,
    title: getMsg('GuidePage.flow.output.title'),
    items: [
      getMsg('GuidePage.flow.output.step1'),
      getMsg('GuidePage.flow.output.step2'),
      getMsg('GuidePage.flow.output.step3'),
      getMsg('GuidePage.flow.output.step4'),
    ],
    preview: { feature: 'matching', initialScrollTop: 700 },
  },
];

interface FlowStepHeaderProps {
  headingId: string;
  number: number;
  icon: React.ReactNode;
  title: string;
}

/** 基本的な流れで繰り返す、手順番号付きの共通見出し。 */
const FlowStepHeader: React.FC<FlowStepHeaderProps> = ({ headingId, number, icon, title }) => (
  <header className={styles.guideWorkflowStepHeader}>
    <span className={styles.guideWorkflowStepNumber} aria-hidden="true">{number}.</span>
    <span aria-hidden="true">{icon}</span>
    <h3 id={headingId}>{title}</h3>
  </header>
);

/** 工程内の操作を、TSV準備手順と同じ番号形式で表示する。 */
const FlowStepList: React.FC<{ items: readonly string[] }> = ({ items }) => (
  <ol className={styles.guideNumberedSteps}>
    {items.map((item, index) => <li key={index}>{item}</li>)}
  </ol>
);

const WorkflowStepCard: React.FC<{ step: WorkflowStep }> = ({ step }) => {
  const headingId = `guide-workflow-step-${step.number}`;

  return (
    <article className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }} aria-labelledby={headingId}>
      <FlowStepHeader
        headingId={headingId}
        number={step.number}
        icon={step.icon}
        title={step.title}
      />
      <div className={styles.guideWorkflowStepLayout}>
        <FlowStepList items={step.items} />
        <GuideActualFeaturePreview
          feature={step.preview.feature}
          initialScrollTop={step.preview.initialScrollTop}
        />
      </div>
    </article>
  );
};

/** 初回取込から結果出力までの各画面の操作手順を表示する。 */
export const GuideWorkflowDetails: React.FC = () => (
  <section className={styles.guideSection}>
    <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}>
      <FileText size={22} aria-hidden="true" />
      {getMsg('GuidePage.flow.stepDetailsTitle')}
    </h2>
    <div className={styles.guideStackVertical}>
      {WORKFLOW_STEPS.map(step => <WorkflowStepCard key={step.number} step={step} />)}
    </div>
  </section>
);
