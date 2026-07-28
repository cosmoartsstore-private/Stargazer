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

// 実画面プレビュー上へ重ねる注釈と、表示中ナビゲーションの定義。
const FEATURE_SAMPLE_META: Record<FeatureId, FeatureSampleMeta> = {
  'applicant-data': {
    title: getMsg('GuidePage.meta.applicantData.title'),
    summary: getMsg('GuidePage.meta.applicantData.summary'),
    activeNav: getMsg('GuidePage.nav.import'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.applicantData.point1.title'), description: getMsg('GuidePage.meta.applicantData.point1.description'), x: 70, y: 17 },
      { number: 2, title: getMsg('GuidePage.meta.applicantData.point2.title'), description: getMsg('GuidePage.meta.applicantData.point2.description'), x: 20, y: 31 },
      { number: 3, title: getMsg('GuidePage.meta.applicantData.point3.title'), description: getMsg('GuidePage.meta.applicantData.point3.description'), x: 48, y: 56 },
      { number: 4, title: getMsg('GuidePage.meta.applicantData.point4.title'), description: getMsg('GuidePage.meta.applicantData.point4.description'), x: 77, y: 61 },
      { number: 5, title: getMsg('GuidePage.meta.applicantData.point5.title'), description: getMsg('GuidePage.meta.applicantData.point5.description'), x: 91, y: 61 },
    ],
  },
  import: {
    title: getMsg('GuidePage.meta.import.title'),
    summary: getMsg('GuidePage.meta.import.summary'),
    activeNav: getMsg('GuidePage.nav.import'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.import.point1.title'), description: getMsg('GuidePage.meta.import.point1.description'), x: 26, y: 22 },
      { number: 2, title: getMsg('GuidePage.meta.import.point2.title'), description: getMsg('GuidePage.meta.import.point2.description'), x: 36, y: 47 },
      { number: 3, title: getMsg('GuidePage.meta.import.point3.title'), description: getMsg('GuidePage.meta.import.point3.description'), x: 73, y: 49 },
      { number: 4, title: getMsg('GuidePage.meta.import.point4.title'), description: getMsg('GuidePage.meta.import.point4.description'), x: 68, y: 85 },
      { number: 5, title: getMsg('GuidePage.meta.import.point5.title'), description: getMsg('GuidePage.meta.import.point5.description'), x: 88, y: 85 },
    ],
  },
  lottery: {
    title: getMsg('GuidePage.meta.lottery.title'),
    summary: getMsg('GuidePage.meta.lottery.summary'),
    activeNav: getMsg('GuidePage.nav.lottery'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.lottery.point1.title'), description: getMsg('GuidePage.meta.lottery.point1.description'), x: 24, y: 28 },
      { number: 2, title: getMsg('GuidePage.meta.lottery.point2.title'), description: getMsg('GuidePage.meta.lottery.point2.description'), x: 40, y: 44 },
      { number: 3, title: getMsg('GuidePage.meta.lottery.point3.title'), description: getMsg('GuidePage.meta.lottery.point3.description'), x: 35, y: 65 },
      { number: 4, title: getMsg('GuidePage.meta.lottery.point4.title'), description: getMsg('GuidePage.meta.lottery.point4.description'), x: 73, y: 36 },
      { number: 5, title: getMsg('GuidePage.meta.lottery.point5.title'), description: getMsg('GuidePage.meta.lottery.point5.description'), x: 75, y: 73 },
    ],
  },
  matching: {
    title: getMsg('GuidePage.meta.matching.title'),
    summary: getMsg('GuidePage.meta.matching.summary'),
    activeNav: getMsg('GuidePage.nav.matching'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.matching.point1.title'), description: getMsg('GuidePage.meta.matching.point1.description'), x: 31, y: 22 },
      { number: 2, title: getMsg('GuidePage.meta.matching.point2.title'), description: getMsg('GuidePage.meta.matching.point2.description'), x: 25, y: 48 },
      { number: 3, title: getMsg('GuidePage.meta.matching.point3.title'), description: getMsg('GuidePage.meta.matching.point3.description'), x: 73, y: 43 },
      { number: 4, title: getMsg('GuidePage.meta.matching.point4.title'), description: getMsg('GuidePage.meta.matching.point4.description'), x: 38, y: 76 },
      { number: 5, title: getMsg('GuidePage.meta.matching.point5.title'), description: getMsg('GuidePage.meta.matching.point5.description'), x: 84, y: 76 },
    ],
  },
  cast: {
    title: getMsg('GuidePage.meta.cast.title'),
    summary: getMsg('GuidePage.meta.cast.summary'),
    activeNav: getMsg('GuidePage.nav.cast'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.cast.point1.title'), description: getMsg('GuidePage.meta.cast.point1.description'), x: 20, y: 37 },
      { number: 2, title: getMsg('GuidePage.meta.cast.point2.title'), description: getMsg('GuidePage.meta.cast.point2.description'), x: 20, y: 77 },
      { number: 3, title: getMsg('GuidePage.meta.cast.point3.title'), description: getMsg('GuidePage.meta.cast.point3.description'), x: 56, y: 35 },
      { number: 4, title: getMsg('GuidePage.meta.cast.point4.title'), description: getMsg('GuidePage.meta.cast.point4.description'), x: 76, y: 55 },
      { number: 5, title: getMsg('common.delete'), description: getMsg('GuidePage.meta.cast.point5.description'), x: 24, y: 79 },
    ],
  },
  ng: {
    title: getMsg('GuidePage.meta.ng.title'),
    summary: getMsg('GuidePage.meta.ng.summary'),
    activeNav: getMsg('GuidePage.nav.ng'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.ng.point1.title'), description: getMsg('GuidePage.meta.ng.point1.description'), x: 25, y: 25 },
      { number: 2, title: getMsg('GuidePage.meta.ng.point2.title'), description: getMsg('GuidePage.meta.ng.point2.description'), x: 22, y: 48 },
      { number: 3, title: getMsg('GuidePage.meta.ng.point3.title'), description: getMsg('GuidePage.meta.ng.point3.description'), x: 58, y: 48 },
      { number: 4, title: getMsg('GuidePage.meta.ng.point4.title'), description: getMsg('GuidePage.meta.ng.point4.description'), x: 55, y: 77 },
      { number: 5, title: getMsg('GuidePage.meta.ng.point5.title'), description: getMsg('GuidePage.meta.ng.point5.description'), x: 83, y: 77 },
    ],
  },
  attendance: {
    title: getMsg('GuidePage.meta.attendance.title'),
    summary: getMsg('GuidePage.meta.attendance.summary'),
    activeNav: getMsg('GuidePage.nav.attendance'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.attendance.point1.title'), description: getMsg('GuidePage.meta.attendance.point1.description'), x: 23, y: 24 },
      { number: 2, title: getMsg('GuidePage.meta.attendance.point2.title'), description: getMsg('GuidePage.meta.attendance.point2.description'), x: 33, y: 48 },
      { number: 3, title: getMsg('GuidePage.meta.attendance.point3.title'), description: getMsg('GuidePage.meta.attendance.point3.description'), x: 62, y: 48 },
      { number: 4, title: getMsg('GuidePage.meta.attendance.point4.title'), description: getMsg('GuidePage.meta.attendance.point4.description'), x: 82, y: 39 },
      { number: 5, title: getMsg('GuidePage.meta.attendance.point5.title'), description: getMsg('GuidePage.meta.attendance.point5.description'), x: 60, y: 79 },
    ],
  },
  tweet: {
    title: getMsg('GuidePage.meta.tweet.title'),
    summary: getMsg('GuidePage.meta.tweet.summary'),
    activeNav: getMsg('GuidePage.nav.tweet'),
    points: [
      { number: 1, title: getMsg('GuidePage.meta.tweet.point1.title'), description: getMsg('GuidePage.meta.tweet.point1.description'), x: 28, y: 42 },
      { number: 2, title: getMsg('GuidePage.meta.tweet.point2.title'), description: getMsg('GuidePage.meta.tweet.point2.description'), x: 32, y: 73 },
      { number: 3, title: getMsg('GuidePage.meta.tweet.point3.title'), description: getMsg('GuidePage.meta.tweet.point3.description'), x: 70, y: 42 },
      { number: 4, title: getMsg('GuidePage.meta.tweet.point4.title'), description: getMsg('GuidePage.meta.tweet.point4.description'), x: 67, y: 72 },
      { number: 5, title: getMsg('GuidePage.meta.tweet.point5.title'), description: getMsg('GuidePage.meta.tweet.point5.description'), x: 86, y: 73 },
    ],
  },
};

const GuideScaledAppFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
    </div>
  );
};

const GuideActualSampleScreen: React.FC<{ feature: FeatureId }> = ({ feature }) => {
  // プレビュー専用Contextとテーマを、表示中featureから組み立てる。
  const context = useMemo(() => createGuideSampleContext(feature), [feature]);
  const themeCssVariables = useMemo(
    () => buildThemeCssVariables('dark', DEFAULT_THEME_CUSTOMIZATION),
    [],
  );
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
      <div className={`${appStyles.appContainer} ${styles.guideActualAppShell}`} data-theme="dark" style={themeCssVariables as React.CSSProperties} inert>
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
          <div className={`${appStyles.mainContentScroll} ${shared.customScrollbar} ${styles.guideActualMainScroll}`}>
            {/* 応募管理系と内部管理系で、プレビューへ埋め込む実画面コンテナを切り替える。 */}
            {isApplicationFeature(feature)
              ? <DataManagementPage onImportUsers={noopGuideSampleAction} />
              : <InternalManagementPage />}
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
};

export const FeatureGuideSample: React.FC<{ feature: FeatureId }> = ({ feature }) => {
  const meta = FEATURE_SAMPLE_META[feature];

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
        <div className={styles.guidePreviewAppFrame}>
          <GuideScaledAppFrame>
            <GuideActualSampleScreen feature={feature} />
          </GuideScaledAppFrame>
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
