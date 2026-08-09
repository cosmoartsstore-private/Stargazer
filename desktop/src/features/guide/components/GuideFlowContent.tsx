// 全体の利用手順、よくある質問、TSV連携手順を表示する。

import React from 'react';
import { GuideFaqSection } from './GuideFaqSection';
import { GuideTsvSection } from './GuideTsvSection';
import { GuideWorkflowDetails } from './GuideWorkflowDetails';
import { GuideWorkflowOverview } from './GuideWorkflowOverview';
import styles from '../GuidePage.module.css';

/** 初回取込から結果出力までの全体フローを表示する。 */
export const GuideFlowContent: React.FC = () => (
  <div className={styles.guideFlowContent}>
    <GuideWorkflowOverview />
    <GuideWorkflowDetails />
    <GuideFaqSection />
    <GuideTsvSection />
  </div>
);
