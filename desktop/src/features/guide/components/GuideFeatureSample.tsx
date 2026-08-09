// 機能別ガイドへ実画面と注釈一覧を埋め込むpreview基盤。

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, HelpCircle, Settings, Users } from 'lucide-react';
import { HeaderLogo } from '@/components/HeaderLogo';
import { ThemeSelector } from '@/components/ThemeSelector';
import { DataManagementPage } from '@/features/data-management/DataManagementPage';
import { InternalManagementPage } from '@/features/internal-management/InternalManagementPage';
import { AppContext } from '@/stores/AppContext';
import type { PageType } from '@/layout/appNavigation';
import { DEFAULT_THEME_CUSTOMIZATION, buildThemeCssVariables } from '@/common/themeCustomization';
import { detectColumnMapping } from '@/common/importFormat';
import type { ImportPageInitialData } from '@/features/import/ImportPage';
import {
  createGuideSampleContext,
  isApplicationFeature,
  noopGuideSampleAction,
  type FeatureId,
} from '@/features/guide/guideSampleContext';
import { getMsg } from '@/messages/getMsg';
import styles from '../GuidePage.module.css';
import shared from '@/styles/shared.module.css';
import appStyles from '@/layout/AppContainer.module.css';

// 実画面previewは基準解像度から表示領域へ等比縮小する。
const GUIDE_PREVIEW_WIDTH = 1920;
const GUIDE_PREVIEW_HEIGHT = 1080;

const GUIDE_IMPORT_HEADERS = [
  getMsg('GuidePage.label.timestamp'),
  getMsg('ImportPage.userNameLabel'),
  getMsg('ImportPage.xIdLabel'),
  getMsg('ImportPage.vrchatLinkLabel'),
  getMsg('ImportPage.preferredCastColumn', { rank: 1 }),
  getMsg('ImportPage.preferredCastColumn', { rank: 2 }),
  getMsg('ImportPage.preferredCastColumn', { rank: 3 }),
];

const GUIDE_IMPORT_INITIAL_DATA: ImportPageInitialData = {
  headers: GUIDE_IMPORT_HEADERS,
  sourceRows: [
    [getMsg('GuidePage.sample.timestamp1'), getMsg('GuidePage.sample.applicant001'), getMsg('GuidePage.sample.xId001'), '', getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC')],
    [getMsg('GuidePage.sample.timestamp2'), getMsg('GuidePage.sample.applicant002'), getMsg('GuidePage.sample.xId002'), '', getMsg('GuidePage.sample.castB'), getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castE')],
    [getMsg('GuidePage.sample.timestamp3'), getMsg('GuidePage.sample.applicant003'), getMsg('GuidePage.sample.xId003'), '', getMsg('GuidePage.sample.castC'), getMsg('GuidePage.sample.castA'), getMsg('GuidePage.sample.castB')],
  ].map((cells, index) => ({ rowNumber: index + 1, cells })),
  fileName: 'responses.tsv',
  mapping: detectColumnMapping(GUIDE_IMPORT_HEADERS),
};

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
  activeNav: string;
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
    activeNav: getMsg('GuidePage.nav.import'),
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
    activeNav: getMsg('GuidePage.nav.import'),
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
    activeNav: getMsg('GuidePage.nav.lottery'),
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
    activeNav: getMsg('GuidePage.nav.matching'),
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
    activeNav: getMsg('GuidePage.nav.cast'),
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
    activeNav: getMsg('GuidePage.nav.ng'),
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
    activeNav: getMsg('GuidePage.nav.attendance'),
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
    activeNav: getMsg('GuidePage.nav.tweet'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.tweet.point1.title'), description: getMsg('GuidePage.meta.tweet.point1.description'), x: 40, y: 30 },
      { number: 2, title: getMsg('GuidePage.meta.tweet.point2.title'), description: getMsg('GuidePage.meta.tweet.point2.description'), x: 40, y: 44 },
      { number: 3, title: getMsg('GuidePage.meta.tweet.point3.title'), description: getMsg('GuidePage.meta.tweet.point3.description'), x: 70, y: 27 },
      { number: 4, title: getMsg('GuidePage.meta.tweet.point4.title'), description: getMsg('GuidePage.meta.tweet.point4.description'), x: 86, y: 35 },
      { number: 5, title: getMsg('GuidePage.meta.tweet.point5.title'), description: getMsg('GuidePage.meta.tweet.point5.description'), x: 70, y: 38 },
    ],
  },
};

const GuideScaledAppFrame: React.FC<{ children: React.ReactNode; points: AnnotationPoint[] }> = ({ children, points }) => {
  // 基準解像度の実画面を、親要素の横幅へ収まる倍率で表示する。
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(function observeGuidePreviewFrame() {
    const frame = frameRef.current;
    if (!frame) return undefined;

    // 実画面を固定サイズで組み立て、表示領域に合わせて縮小する。
    // これによりヘルプ枠の幅でタブや表が再配置されることを防ぐ。
    const updateScale = () => {
      setScale(frame.clientWidth / GUIDE_PREVIEW_WIDTH);
    };
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const viewportStyle: React.CSSProperties = { height: GUIDE_PREVIEW_HEIGHT * scale };
  const canvasStyle: React.CSSProperties = { transform: `scale(${scale})` };

  return (
    <div ref={frameRef} className={styles.guideScaledViewport} style={viewportStyle}>
      <div className={styles.guideScaledCanvas} style={canvasStyle}>
        {children}
      </div>
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

interface GuideActualSampleScreenProps {
  feature: FeatureId;
  initialScrollTop?: number;
  initialNgTab?: 'cast-ng' | 'caution';
}

const GuideActualSampleScreen: React.FC<GuideActualSampleScreenProps> = ({ feature, initialScrollTop = 0, initialNgTab }) => {
  // プレビュー専用Contextとテーマを、表示中featureから組み立てる。
  const context = useMemo(() => createGuideSampleContext(feature), [feature]);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const themeCssVariables = useMemo(
    () => buildThemeCssVariables('dark', DEFAULT_THEME_CUSTOMIZATION),
    [],
  );
  useLayoutEffect(() => {
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = initialScrollTop;
  }, [feature, initialScrollTop]);
  const mainNav = isApplicationFeature(feature)
    ? getMsg('GuidePage.nav.applicantManagement')
    : getMsg('GuidePage.nav.internalManagement');

  const sidebarButtons: { text: string; page: PageType; icon: React.ReactNode }[] = [
    { text: getMsg('GuidePage.nav.applicantManagement'), page: 'dataManagement', icon: <Users size={18} /> },
    { text: getMsg('GuidePage.nav.internalManagement'), page: 'internalManagement', icon: <Settings size={18} /> },
    { text: getMsg('GuidePage.nav.eventManagement'), page: 'eventManagement', icon: <CalendarDays size={18} /> },
    { text: getMsg('GuidePage.nav.guide'), page: 'guide', icon: <HelpCircle size={18} /> },
  ];

  return (
    <AppContext.Provider value={context}>
      <div className={`${appStyles.appContainer} ${styles.guideActualAppShell}`} data-theme="dark" data-guide-theme-preview="dark" style={themeCssVariables as React.CSSProperties} inert>
        <aside className={appStyles.sidebar}>
          <div className={appStyles.sidebarInner}>
            <div className={appStyles.sidebarTitle}><HeaderLogo /></div>
            {sidebarButtons.map(function renderSidebarButton(button) {
              const active = button.text === mainNav;
              return (
                <button key={button.text} type="button" className={`${appStyles.sidebarButton}${active ? ` ${appStyles.active}` : ''}`} tabIndex={-1}>{button.icon}<span className={appStyles.sidebarButtonLabel}>{button.text}</span></button>
              );
            })}
            <div className={`${appStyles.sidebarBlock} ${appStyles.sidebarBlockPush}`} />
            <div className={`${appStyles.sidebarBlock} ${appStyles.sidebarThemeSlider}`}>
              <ThemeSelector themeId="dark" setThemeId={noopGuideSampleAction} customization={DEFAULT_THEME_CUSTOMIZATION} setCustomization={noopGuideSampleAction} />
            </div>
          </div>
        </aside>
        <div className={appStyles.mainContent}>
          <div ref={mainScrollRef} className={`${appStyles.mainContentScroll} ${shared.customScrollbar} ${styles.guideActualMainScroll}`}>
            {/* 応募管理系と内部管理系で、プレビューへ埋め込む実画面コンテナを切り替える。 */}
            {isApplicationFeature(feature)
              ? <DataManagementPage onImportUsers={noopGuideSampleAction} initialImportData={feature === 'import' ? GUIDE_IMPORT_INITIAL_DATA : undefined} />
              : <InternalManagementPage previewMode initialSelectedCastId={feature === 'cast' ? context.casts[0]?.id : undefined} initialNgTab={initialNgTab} />}
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
};

interface GuideActualFeaturePreviewProps extends GuideActualSampleScreenProps {
  points?: AnnotationPoint[];
}

/** サンプルContextで構成した実画面を、ガイド内の表示領域へ縮小して埋め込む。 */
export const GuideActualFeaturePreview: React.FC<GuideActualFeaturePreviewProps> = ({
  feature,
  initialScrollTop,
  initialNgTab,
  points = [],
}) => (
  <div className={styles.guidePreviewAppFrame}>
    <GuideScaledAppFrame points={points}>
      <GuideActualSampleScreen
        feature={feature}
        initialScrollTop={initialScrollTop}
        initialNgTab={initialNgTab}
      />
    </GuideScaledAppFrame>
  </div>
);

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
