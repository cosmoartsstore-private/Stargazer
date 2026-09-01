// 機能別ガイドへ固定の実画面画像と注釈一覧を埋め込む。

import React from 'react';
import type { FeatureId } from '@/features/guide/guideFeature';
import { getMsg } from '@/messages/getMsg';
import styles from '../GuidePage.module.css';

type AnnotationPoint = {
  number: number;
  title: string;
  description: string;
  x: number;
  y: number;
};

type FeatureSampleMeta = {
  title: string;
  summary: string;
  points: AnnotationPoint[];
};

type FeatureSampleScene = {
  key: string;
  title?: string;
  points: AnnotationPoint[];
  initialScrollTop?: number;
  initialNgTab?: 'cast-ng' | 'caution';
};

// 実画面プレビュー上へ重ねる注釈と、表示中ナビゲーションの定義。
const FEATURE_SAMPLE_META: Record<FeatureId, FeatureSampleMeta> = {
  'applicant-data': {
    title: getMsg('GuidePage.meta.applicantData.title'),
    summary: getMsg('GuidePage.meta.applicantData.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.applicantData.point1.title'), description: getMsg('GuidePage.meta.applicantData.point1.description'), x: 30, y: 14 },
      { number: 2, title: getMsg('GuidePage.meta.applicantData.point2.title'), description: getMsg('GuidePage.meta.applicantData.point2.description'), x: 66, y: 14 },
      { number: 3, title: getMsg('GuidePage.meta.applicantData.point3.title'), description: getMsg('GuidePage.meta.applicantData.point3.description'), x: 51, y: 31 },
      { number: 4, title: getMsg('GuidePage.meta.applicantData.point4.title'), description: getMsg('GuidePage.meta.applicantData.point4.description'), x: 70, y: 23 },
      { number: 5, title: getMsg('GuidePage.meta.applicantData.point5.title'), description: getMsg('GuidePage.meta.applicantData.point5.description'), x: 79, y: 23 },
    ],
  },
  import: {
    title: getMsg('GuidePage.meta.import.title'),
    summary: getMsg('GuidePage.meta.import.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.import.point1.title'), description: getMsg('GuidePage.meta.import.point1.description'), x: 26, y: 22 },
      { number: 2, title: getMsg('GuidePage.meta.import.point2.title'), description: getMsg('GuidePage.meta.import.point2.description'), x: 30, y: 33 },
      { number: 3, title: getMsg('GuidePage.meta.import.point3.title'), description: getMsg('GuidePage.meta.import.point3.description'), x: 30, y: 76 },
      { number: 4, title: getMsg('GuidePage.meta.import.point4.title'), description: getMsg('GuidePage.meta.import.point4.description'), x: 69, y: 95 },
      { number: 5, title: getMsg('GuidePage.meta.import.point5.title'), description: getMsg('GuidePage.meta.import.point5.description'), x: 82, y: 95 },
    ],
  },
  lottery: {
    title: getMsg('GuidePage.meta.lottery.title'),
    summary: getMsg('GuidePage.meta.lottery.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.lottery.point1.title'), description: getMsg('GuidePage.meta.lottery.point1.description'), x: 32, y: 38 },
      { number: 2, title: getMsg('GuidePage.meta.lottery.point2.title'), description: getMsg('GuidePage.meta.lottery.point2.description'), x: 41, y: 54 },
      { number: 3, title: getMsg('GuidePage.meta.lottery.point3.title'), description: getMsg('GuidePage.meta.lottery.point3.description'), x: 41, y: 83 },
      { number: 4, title: getMsg('GuidePage.meta.lottery.point4.title'), description: getMsg('GuidePage.meta.lottery.point4.description'), x: 73, y: 36 },
      { number: 5, title: getMsg('GuidePage.meta.lottery.point5.title'), description: getMsg('GuidePage.meta.lottery.point5.description'), x: 73, y: 91 },
    ],
  },
  matching: {
    title: getMsg('GuidePage.meta.matching.title'),
    summary: getMsg('GuidePage.meta.matching.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.matching.point1.title'), description: getMsg('GuidePage.meta.matching.point1.description'), x: 29, y: 28 },
      { number: 2, title: getMsg('GuidePage.meta.matching.point2.title'), description: getMsg('GuidePage.meta.matching.point2.description'), x: 42, y: 71 },
      { number: 3, title: getMsg('GuidePage.meta.matching.point3.title'), description: getMsg('GuidePage.meta.matching.point3.description'), x: 73, y: 43 },
      { number: 4, title: getMsg('GuidePage.meta.matching.point4.title'), description: getMsg('GuidePage.meta.matching.point4.description'), x: 55, y: 37 },
      { number: 5, title: getMsg('GuidePage.meta.matching.point5.title'), description: getMsg('GuidePage.meta.matching.point5.description'), x: 83, y: 22 },
    ],
  },
  cast: {
    title: getMsg('GuidePage.meta.cast.title'),
    summary: getMsg('GuidePage.meta.cast.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.cast.point1.title'), description: getMsg('GuidePage.meta.cast.point1.description'), x: 29, y: 29 },
      { number: 2, title: getMsg('GuidePage.meta.cast.point2.title'), description: getMsg('GuidePage.meta.cast.point2.description'), x: 31, y: 82 },
      { number: 3, title: getMsg('GuidePage.meta.cast.point3.title'), description: getMsg('GuidePage.meta.cast.point3.description'), x: 57, y: 39 },
      { number: 4, title: getMsg('GuidePage.meta.cast.point4.title'), description: getMsg('GuidePage.meta.cast.point4.description'), x: 48, y: 17 },
      { number: 5, title: getMsg('common.delete'), description: getMsg('GuidePage.meta.cast.point5.description'), x: 46, y: 68 },
    ],
  },
  ng: {
    title: getMsg('GuidePage.meta.ng.title'),
    summary: getMsg('GuidePage.meta.ng.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.ng.point1.title'), description: getMsg('GuidePage.meta.ng.point1.description'), x: 31, y: 13 },
      { number: 2, title: getMsg('GuidePage.meta.ng.point2.title'), description: getMsg('GuidePage.meta.ng.point2.description'), x: 36, y: 26 },
      { number: 3, title: getMsg('GuidePage.meta.ng.point3.title'), description: getMsg('GuidePage.meta.ng.point3.description'), x: 62, y: 36 },
      { number: 4, title: getMsg('GuidePage.meta.ng.point4.title'), description: getMsg('GuidePage.meta.ng.point4.description'), x: 58, y: 27 },
      { number: 5, title: getMsg('GuidePage.meta.ng.point5.title'), description: getMsg('GuidePage.meta.ng.point5.description'), x: 78, y: 54 },
    ],
  },
  attendance: {
    title: getMsg('GuidePage.meta.attendance.title'),
    summary: getMsg('GuidePage.meta.attendance.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.attendance.point1.title'), description: getMsg('GuidePage.meta.attendance.point1.description'), x: 26, y: 13 },
      { number: 2, title: getMsg('GuidePage.meta.attendance.point2.title'), description: getMsg('GuidePage.meta.attendance.point2.description'), x: 38, y: 38 },
      { number: 3, title: getMsg('GuidePage.meta.attendance.point3.title'), description: getMsg('GuidePage.meta.attendance.point3.description'), x: 68, y: 38 },
      { number: 4, title: getMsg('GuidePage.meta.attendance.point4.title'), description: getMsg('GuidePage.meta.attendance.point4.description'), x: 83, y: 20 },
      { number: 5, title: getMsg('GuidePage.meta.attendance.point5.title'), description: getMsg('GuidePage.meta.attendance.point5.description'), x: 36, y: 13 },
    ],
  },
  tweet: {
    title: getMsg('GuidePage.meta.tweet.title'),
    summary: getMsg('GuidePage.meta.tweet.summary'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.tweet.point1.title'), description: getMsg('GuidePage.meta.tweet.point1.description'), x: 40, y: 30 },
      { number: 2, title: getMsg('GuidePage.meta.tweet.point2.title'), description: getMsg('GuidePage.meta.tweet.point2.description'), x: 40, y: 44 },
      { number: 3, title: getMsg('GuidePage.meta.tweet.point3.title'), description: getMsg('GuidePage.meta.tweet.point3.description'), x: 70, y: 27 },
      { number: 4, title: getMsg('GuidePage.meta.tweet.point4.title'), description: getMsg('GuidePage.meta.tweet.point4.description'), x: 86, y: 35 },
      { number: 5, title: getMsg('GuidePage.meta.tweet.point5.title'), description: getMsg('GuidePage.meta.tweet.point5.description'), x: 70, y: 38 },
    ],
  },
};

const GUIDE_FEATURE_SCREENSHOT_PATHS: Record<FeatureId, string> = {
  'applicant-data': '/guide-screenshots/applicant-data.png',
  import: '/guide-screenshots/import.png',
  lottery: '/guide-screenshots/lottery.png',
  matching: '/guide-screenshots/matching.png',
  cast: '/guide-screenshots/cast.png',
  ng: '/guide-screenshots/ng-cast.png',
  attendance: '/guide-screenshots/attendance.png',
  tweet: '/guide-screenshots/tweet.png',
};

function resolveGuideFeatureScreenshot(
  feature: FeatureId,
  initialNgTab?: 'cast-ng' | 'caution',
): string {
  if (feature === 'ng' && initialNgTab === 'caution') {
    return '/guide-screenshots/ng-caution.png';
  }
  return GUIDE_FEATURE_SCREENSHOT_PATHS[feature];
}

interface GuideActualFeaturePreviewProps {
  feature: FeatureId;
  initialScrollTop?: number;
  initialNgTab?: 'cast-ng' | 'caution';
  points?: AnnotationPoint[];
}

/** 保存済みの実画面画像を表示し、操作箇所の注釈だけを画像上へ重ねる。 */
export const GuideActualFeaturePreview: React.FC<GuideActualFeaturePreviewProps> = ({
  feature,
  initialNgTab,
  points = [],
}) => {
  const imagePath = resolveGuideFeatureScreenshot(feature, initialNgTab);
  const featureTitle = FEATURE_SAMPLE_META[feature].title;

  return (
    <div className={styles.guidePreviewAppFrame}>
      <img
        className={styles.guidePreviewImage}
        src={imagePath}
        alt={getMsg('GuidePage.sampleScreen.imageAlt', { feature: featureTitle })}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div className={styles.guidePreviewMarkerLayer} aria-hidden="true">
        {points.map(point => (
          <span key={point.number} className={styles.guidePreviewMarker} style={{ left: `${point.x}%`, top: `${point.y}%` }}>
            {point.number}
          </span>
        ))}
      </div>
    </div>
  );
};

export const FeatureGuideSample: React.FC<{ feature: FeatureId }> = ({ feature }) => {
  const meta = FEATURE_SAMPLE_META[feature];
  const scenes: FeatureSampleScene[] = feature === 'matching'
    ? [
        {
          key: 'conditions',
          title: getMsg('GuidePage.sampleScreen.matchingConditions'),
          points: meta.points.filter((point) => point.number <= 3),
        },
        {
          key: 'results',
          title: getMsg('GuidePage.sampleScreen.matchingResults'),
          points: meta.points.filter((point) => point.number >= 4),
          initialScrollTop: 700,
        },
      ]
    : feature === 'ng'
      ? [
          {
            key: 'cast-ng',
            title: getMsg('GuidePage.sampleScreen.castNg'),
            points: meta.points.filter((point) => point.number <= 3),
            initialNgTab: 'cast-ng',
          },
          {
            key: 'caution',
            title: getMsg('GuidePage.sampleScreen.caution'),
            points: meta.points.filter((point) => point.number >= 4),
            initialNgTab: 'caution',
          },
        ]
      : [{ key: 'default', points: meta.points }];

  return (
    <section className={styles.featureGuideSample}>
      <div className={styles.featureGuideSampleHeader}>
        <div>
          <span className={styles.featureGuideSampleEyebrow}>{getMsg('GuidePage.sampleScreen.eyebrow')}</span>
          <h3>{meta.title}</h3>
        </div>
        <p>{meta.summary}</p>
      </div>

      <div className={styles.featureGuideSampleLayout}>
        <div className={styles.guidePreviewScenes}>
          {scenes.map((scene) => (
            <div key={scene.key} className={styles.guidePreviewScene}>
              {scene.title && <h4 className={styles.guidePreviewSceneTitle}>{scene.title}</h4>}
              <GuideActualFeaturePreview
                feature={feature}
                initialScrollTop={scene.initialScrollTop}
                initialNgTab={scene.initialNgTab}
                points={scene.points}
              />
            </div>
          ))}
        </div>

        <ol className={styles.featureGuideLegend}>
          {meta.points.map(point => (
            <li key={point.number} className={styles.featureGuideLegendItem}>
              <span>{point.number}</span>
              <div>
                <strong>{point.title}</strong>
                <p>{point.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
