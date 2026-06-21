import React, { useState, useCallback } from 'react';
import {
  FileText, Database, Users, Settings, CheckCircle, BarChart3,
  Sheet, Download, Calendar, UserX, HelpCircle,
} from '@/common/icons';
import { invoke, isTauri } from '@/tauri';
import styles from './GuidePage.module.css';
import shared from '@/styles/shared.module.css';


type Tab = 'flow' | 'features';

type FeatureId =
  | 'applicant-data'
  | 'import'
  | 'lottery'
  | 'matching'
  | 'cast'
  | 'ng'
  | 'attendance'
  | 'tweet';

interface NavItem { id: FeatureId; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: '応募管理',
    items: [
      { id: 'applicant-data', label: '応募データ',   icon: <Database size={15} /> },
      { id: 'import',         label: 'データ読取',   icon: <FileText  size={15} /> },
      { id: 'lottery',        label: '抽選',         icon: <CheckCircle size={15} /> },
      { id: 'matching',       label: 'マッチング',   icon: <BarChart3 size={15} /> },
    ],
  },
  {
    label: '内部管理',
    items: [
      { id: 'cast',       label: 'キャスト名簿', icon: <Users   size={15} /> },
      { id: 'ng',         label: 'NG管理',       icon: <UserX   size={15} /> },
      { id: 'attendance', label: '出席管理',     icon: <Calendar size={15} /> },
      { id: 'tweet',      label: '投稿テンプレ', icon: <Settings size={15} /> },
    ],
  },
];

/* ── 補助コンポーネント ── */

const FeatureHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  colorSoft?: string;
}> = ({ icon, title, description, color, colorSoft }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 22px',
    marginBottom: 24,
    marginLeft: -24, marginRight: -24, marginTop: -20,
    background: `linear-gradient(135deg, ${color} 0%, ${colorSoft ?? `${color}aa`} 100%)`,
    borderRadius: '10px 10px 0 0',
  }}>
    <div style={{
      width: 52, height: 52, flexShrink: 0,
      background: 'rgba(255,255,255,0.22)',
      borderRadius: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    }}>
      {icon}
    </div>
    <div>
      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{title}</h2>
      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '5px 0 0', lineHeight: 1.5 }}>{description}</p>
    </div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--surface-hover)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ width: 3, height: 12, background: 'var(--accent-primary)', borderRadius: 2, flexShrink: 0 }} />
        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </h3>
      </div>
      <div style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-default)', lineHeight: 1.8, background: 'var(--surface-panel-muted)' }}>
        {children}
      </div>
    </div>
  </div>
);

const FeatureList: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    {items.map((item, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 10px', borderRadius: 6, background: 'var(--surface-panel)', border: '1px solid var(--border-default)' }}>
        <span style={{ color: 'var(--accent-primary)', flexShrink: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>›</span>
        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>{item}</span>
      </div>
    ))}
  </div>
);

const StepList: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {items.map((item, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {i + 1}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-default)', lineHeight: 1.6, paddingTop: 4 }}>{item}</div>
      </div>
    ))}
  </div>
);

const NoteList: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ background: 'rgba(240, 178, 50, 0.15)', border: '1px solid rgba(240, 178, 50, 0.5)', borderRadius: 8, padding: '12px 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, color: '#c8890e', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      ⚠ 注意事項
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>
          <span style={{ color: '#c8890e', flexShrink: 0, fontWeight: 700 }}>•</span>
          {item}
        </div>
      ))}
    </div>
  </div>
);

const ScreenSample: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
    <div style={{ background: 'var(--surface-hover)', padding: '7px 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{title}</span>
    </div>
    <div style={{ padding: '12px 14px', background: 'var(--surface-panel)', fontSize: 12 }}>
      {children}
    </div>
  </div>
);

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

const FEATURE_SAMPLE_META: Record<FeatureId, FeatureSampleMeta> = {
  'applicant-data': {
    title: '応募データの確認画面',
    summary: '取り込んだ応募者を一覧で確認し、要注意・NGキャスト・詳細・削除の入口を同じ画面で扱います。',
    activeNav: '応募データ',
    points: [
      { number: 1, title: 'データ状態と操作', description: '読み込んだファイル名、件数、再取り込み、元ログ削除を確認します。', x: 70, y: 17 },
      { number: 2, title: '表示切り替え', description: '全件と要注意を切り替えて、確認対象を絞り込みます。', x: 20, y: 31 },
      { number: 3, title: '応募者一覧', description: 'ユーザー名、X ID、希望キャスト、NGキャストを行単位で確認します。', x: 48, y: 56 },
      { number: 4, title: 'NGキャスト欄', description: '1件なら名前、複数なら件数表示にして、詳細は応募者詳細で確認します。', x: 77, y: 61 },
      { number: 5, title: '個別操作', description: '行クリックで詳細を開き、右端の赤い×で応募者を削除します。', x: 91, y: 61 },
    ],
  },
  import: {
    title: 'TSV読取と列マッピング',
    summary: 'ファイル選択、列の対応付け、プレビュー、取り込み先の選択を一連の流れで確認します。',
    activeNav: 'データ読取',
    points: [
      { number: 1, title: 'ファイル選択', description: 'TSVファイルを選択し、検出行数と有効件数を確認します。', x: 26, y: 22 },
      { number: 2, title: '列マッピング', description: 'ユーザー名、X ID、希望キャストなどを読み込んだ列に対応付けます。', x: 36, y: 47 },
      { number: 3, title: '読取プレビュー', description: '取り込み前に先頭行を確認し、列ずれや空のX IDを見つけます。', x: 73, y: 49 },
      { number: 4, title: '抽選へ進む', description: '読み込んだ内容を使って、すぐ抽選画面へ進みます。', x: 68, y: 85 },
      { number: 5, title: '取り込み確定', description: 'マッピング内容を保存し、応募データ一覧に反映します。', x: 88, y: 85 },
    ],
  },
  lottery: {
    title: '抽選設定と結果保存',
    summary: '当選人数、マッチング方式、席数、確定当選者、設定ステータス、保存済み抽選結果を確認します。',
    activeNav: '抽選',
    points: [
      { number: 1, title: '当選人数', description: '抽選で選ぶ人数と確定当選者を合わせた合計当選者数を確認します。', x: 24, y: 28 },
      { number: 2, title: 'マッチング方式', description: '抽選のみ、ランダム、ローテーション、グループ制マッチングから選びます。', x: 40, y: 44 },
      { number: 3, title: '当日枠を含める', description: 'グループ制マッチングでは当日枠分の席数を追加し、合計席数を確認します。', x: 35, y: 65 },
      { number: 4, title: '設定ステータス', description: '条件設定の一部として、ERROR、WARN、INFO、OKで妥当性と合計席数を表示します。', x: 73, y: 36 },
      { number: 5, title: '抽選結果保存', description: '実行後の結果をDBに保存し、後から選択し直せるようにします。', x: 75, y: 73 },
    ],
  },
  matching: {
    title: 'マッチング設定と結果確認',
    summary: '抽選結果をもとに、条件確認、実行、キャスト別結果、テーブル別結果、出力を扱います。',
    activeNav: 'マッチング',
    points: [
      { number: 1, title: '状態サマリー', description: '方式、当選者数、合計席数、出席キャスト数を確認します。', x: 31, y: 22 },
      { number: 2, title: '条件確認と探索モード', description: '抽選設定で確定した条件を読み取り専用で確認し、探索モードだけを選びます。', x: 25, y: 48 },
      { number: 3, title: '検証と実行', description: '問題がないことを確認してから、マッチングを開始します。', x: 73, y: 43 },
      { number: 4, title: 'キャスト別結果', description: 'キャストごとのローテーション割り当てと希望順位を確認します。', x: 38, y: 76 },
      { number: 5, title: '出力操作', description: 'PNG出力とTSV保存で共有用データを作成します。', x: 84, y: 76 },
    ],
  },
  cast: {
    title: 'キャスト名簿の管理画面',
    summary: 'キャスト一覧、追加、プロフィール、連絡先、外部リンク、削除を同じ画面で管理します。',
    activeNav: 'キャスト名簿',
    points: [
      { number: 1, title: 'キャスト一覧', description: '登録済みキャストをグループ付きで表示し、検索と選択を行います。', x: 20, y: 37 },
      { number: 2, title: 'キャスト追加', description: '一覧下部の入力欄からキャストを1名ずつ追加します。', x: 20, y: 77 },
      { number: 3, title: 'プロフィール', description: '写真、名前、グループ、メモを編集します。', x: 56, y: 35 },
      { number: 4, title: '外部サイトリンク', description: 'Discord、X、VRChatの固定リンクを開ける入口です。', x: 76, y: 55 },
      { number: 5, title: '削除', description: 'プロフィール画像の下にある単色赤背景のボタンから、確認後にキャストを削除します。', x: 24, y: 79 },
    ],
  },
  ng: {
    title: 'NG管理と要注意人物',
    summary: 'キャストごとのNG登録と、複数キャストからNGを受けた要注意人物候補を管理します。',
    activeNav: 'NG管理',
    points: [
      { number: 1, title: '管理タブ', description: 'キャストNGと要注意人物を切り替えます。', x: 25, y: 25 },
      { number: 2, title: 'キャスト別NG件数', description: 'キャスト一覧にNG件数をバッチ型で表示します。', x: 22, y: 48 },
      { number: 3, title: 'NGユーザー一覧', description: '選択中キャストのNGユーザーをX ID付きで確認・削除します。', x: 58, y: 48 },
      { number: 4, title: '要注意候補', description: '閾値以上のキャストからNGを受けたユーザーを候補として表示します。', x: 55, y: 77 },
      { number: 5, title: '登録済み管理', description: '手動登録と自動登録を分けて確認し、必要に応じて解除します。', x: 83, y: 77 },
    ],
  },
  attendance: {
    title: '出席設定と出席履歴',
    summary: '出席中・待機の切り替え、記録モーダル、履歴のチェック表を確認します。',
    activeNav: '出席管理',
    points: [
      { number: 1, title: 'タブ切り替え', description: '出席設定と出席履歴を切り替えます。', x: 23, y: 24 },
      { number: 2, title: '出席中BOX', description: '出席中のキャストを1名ずつ縦に並べます。', x: 33, y: 48 },
      { number: 3, title: '待機BOX', description: '待機側も同じ幅で並べ、選択済みの行は色を立てます。', x: 62, y: 48 },
      { number: 4, title: '出席を記録', description: '記録日と出席人数を横並びにし、その下にキャスト一覧を表示します。', x: 82, y: 39 },
      { number: 5, title: '出席履歴', description: '固定幅の列で、キャスト別・日付別の履歴を確認します。', x: 60, y: 79 },
    ],
  },
  tweet: {
    title: '投稿テンプレの編集画面',
    summary: '投稿文のひな型、プレースホルダー、プレビュー、コピー操作を確認します。',
    activeNav: '投稿テンプレ',
    points: [
      { number: 1, title: 'テンプレート編集', description: '投稿文のひな型を編集します。内容は自動保存されます。', x: 28, y: 42 },
      { number: 2, title: 'プレースホルダー', description: '{casts} や {event_name} を挿入して実データへ置換します。', x: 32, y: 73 },
      { number: 3, title: 'プレビュー', description: '置換後の投稿文を右側で確認します。', x: 70, y: 42 },
      { number: 4, title: '文字数', description: 'X投稿向けに文字数を確認します。', x: 67, y: 72 },
      { number: 5, title: 'コピー', description: '生成した投稿文をクリップボードへコピーします。', x: 86, y: 73 },
    ],
  },
};

const FeatureGuideSample: React.FC<{ feature: FeatureId }> = ({ feature }) => {
  const meta = FEATURE_SAMPLE_META[feature];

  return (
    <section className={styles.featureGuideSample}>
      <div className={styles.featureGuideSampleHeader}>
        <div>
          <span className={styles.featureGuideSampleEyebrow}>画面サンプル</span>
          <h3>{meta.title}</h3>
        </div>
        <p>{meta.summary}</p>
      </div>

      <div className={styles.featureGuideSampleLayout}>
        <div className={styles.guidePreviewAppFrame}>
          <div className={styles.guidePreviewAppTopbar}>
            <div>
              <strong>Manual Test Event</strong>
              <span>Stargazer</span>
            </div>
            <div className={styles.guidePreviewTopbarStatus}>DB接続中</div>
          </div>
          <div className={styles.guidePreviewAppWorkspace}>
            <aside className={styles.guidePreviewAppSidebar} aria-label="サンプル画面ナビゲーション">
              {['応募データ', 'データ読取', '抽選', 'マッチング', 'キャスト名簿', 'NG管理', '出席管理', '投稿テンプレ'].map(label => (
                <span
                  key={label}
                  className={`${styles.guidePreviewAppSidebarItem}${meta.activeNav === label ? ` ${styles.guidePreviewAppSidebarItemActive}` : ''}`}
                >
                  {label}
                </span>
              ))}
            </aside>
            <div className={styles.guidePreviewAppContent}>
              {renderFeatureSampleScreen(feature)}
              {meta.points.map(point => (
                <span
                  key={point.number}
                  className={styles.featureGuideMarker}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-label={`${point.number}. ${point.title}`}
                >
                  {point.number}
                </span>
              ))}
            </div>
          </div>
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

function renderFeatureSampleScreen(feature: FeatureId): React.ReactNode {
  switch (feature) {
    case 'applicant-data':
      return <ApplicantDataSampleScreen />;
    case 'import':
      return <ImportSampleScreen />;
    case 'lottery':
      return <LotterySampleScreen />;
    case 'matching':
      return <MatchingSampleScreen />;
    case 'cast':
      return <CastSampleScreen />;
    case 'ng':
      return <NgSampleScreen />;
    case 'attendance':
      return <AttendanceSampleScreen />;
    case 'tweet':
      return <TweetSampleScreen />;
  }
}

const GuidePreviewHeader: React.FC<{ title: string; description?: string; actions?: React.ReactNode }> = ({ title, description, actions }) => (
  <div className={styles.guidePreviewHeader}>
    <div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className={styles.guidePreviewActions}>{actions}</div>}
  </div>
);

const GuidePreviewButton: React.FC<{ children: React.ReactNode; variant?: 'primary' | 'secondary' | 'danger' }> = ({ children, variant = 'secondary' }) => (
  <span className={`${styles.guidePreviewButton} ${styles[`guidePreviewButton${variant[0].toUpperCase()}${variant.slice(1)}`]}`}>{children}</span>
);

const GuidePreviewTabs: React.FC<{ tabs: string[]; activeIndex?: number }> = ({ tabs, activeIndex = 0 }) => (
  <div className={styles.guidePreviewTabs}>
    {tabs.map((tab, index) => (
      <span key={tab} className={`${styles.guidePreviewTab}${activeIndex === index ? ` ${styles.guidePreviewTabActive}` : ''}`}>{tab}</span>
    ))}
  </div>
);

const GuidePreviewBadge: React.FC<{ children: React.ReactNode; tone?: 'blue' | 'green' | 'red' | 'gray' | 'yellow' }> = ({ children, tone = 'blue' }) => (
  <span className={`${styles.guidePreviewBadge} ${styles[`guidePreviewBadge${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>{children}</span>
);

const ApplicantDataSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader
      title="応募データ"
      description="responses_20260617.tsv / 42件"
      actions={<><GuidePreviewButton>再取り込み</GuidePreviewButton><GuidePreviewButton variant="danger">元ログ削除</GuidePreviewButton></>}
    />
    <GuidePreviewTabs tabs={['全件 42', '要注意 2']} />
    <table className={styles.guidePreviewTable}>
      <thead>
        <tr><th>ユーザー名</th><th>X ID</th><th>希望キャスト</th><th>NGキャスト</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr><td>サンプル太郎</td><td>@sample_vrc</td><td><GuidePreviewBadge>キャストA</GuidePreviewBadge><GuidePreviewBadge tone="gray">キャストB</GuidePreviewBadge></td><td>なし</td><td><span className={styles.guidePreviewDeleteMark}>×</span></td></tr>
        <tr className={styles.guidePreviewTableWarning}><td>問題ユーザー</td><td>@problem_123</td><td><GuidePreviewBadge tone="green">キャストC</GuidePreviewBadge></td><td>2名のキャストがNG</td><td><span className={styles.guidePreviewDeleteMark}>×</span></td></tr>
        <tr><td>ゲスト花子</td><td>@guest_hanako</td><td><GuidePreviewBadge>キャストB</GuidePreviewBadge><GuidePreviewBadge tone="gray">キャストD</GuidePreviewBadge></td><td>キャストA</td><td><span className={styles.guidePreviewDeleteMark}>×</span></td></tr>
      </tbody>
    </table>
  </div>
);

const ImportSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader title="データ読取" description="TSVファイルを読み込み、列を対応付けます。" actions={<GuidePreviewButton variant="primary">TSVファイルを選択</GuidePreviewButton>} />
    <div className={styles.guidePreviewImportGrid}>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewFileStrip}>responses_20260617.tsv / 42行 / 有効 41件</div>
        {[
          ['ユーザー名', '名前'],
          ['X ID', 'X/Twitter ID'],
          ['VRC URL', 'VRChat URL'],
          ['希望キャスト', '第一希望, 第二希望, 第三希望'],
        ].map(([label, value]) => (
          <div key={label} className={styles.guidePreviewMappingRow}>
            <span>{label}</span><b>→</b><em>{value}</em>
          </div>
        ))}
      </div>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>プレビュー</div>
        <table className={styles.guidePreviewTable}>
          <tbody>
            <tr><td>サンプル太郎</td><td>@sample_vrc</td><td>キャストA</td></tr>
            <tr><td>ゲスト花子</td><td>@guest_hanako</td><td>キャストB</td></tr>
            <tr><td>問題ユーザー</td><td>@problem_123</td><td>キャストC</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div className={styles.guidePreviewFooterActions}><GuidePreviewButton>抽選へ進む</GuidePreviewButton><GuidePreviewButton variant="primary">41件を取り込む</GuidePreviewButton></div>
  </div>
);

const LotterySampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader title="抽選設定" description="確定当選者と当選人数を設定し、抽選結果を保存できます。" />
    <div className={styles.guidePreviewLotteryGrid}>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewMetricGrid}>
          <div><span>当選人数</span><strong>20</strong></div>
          <div><span>確定当選者</span><strong>3</strong></div>
          <div><span>合計当選者数</span><strong>23</strong></div>
        </div>
        <div className={styles.guidePreviewOptionGrid}>
          {['抽選のみ行う', 'ランダム', 'ローテーション', 'グループ制マッチング'].map((item, index) => (
            <span key={item} className={index === 3 ? styles.guidePreviewOptionSelected : ''}>{item}</span>
          ))}
        </div>
        <div className={styles.guidePreviewSettingLine}><span>当日枠を含める</span><strong>ON / 2席</strong></div>
        <div className={styles.guidePreviewSettingLine}><span>合計席数</span><strong>26席</strong></div>
      </div>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewValidation}><GuidePreviewBadge tone="green">OK</GuidePreviewBadge><p>設定に問題はありません。</p><small>INFO: 合計席数 26席、合計当選者数 23名</small></div>
        <div className={styles.guidePreviewSavedRun}><strong>保存済み抽選結果</strong><span>2026-06-17 グループ制 / 23名</span></div>
        <div className={styles.guidePreviewFooterActions}><GuidePreviewButton variant="primary">抽選実行</GuidePreviewButton><GuidePreviewButton>抽選結果保存</GuidePreviewButton></div>
      </div>
    </div>
  </div>
);

const MatchingSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader title="マッチング" description="抽選結果からキャスト割り当てを作成します。" actions={<GuidePreviewButton variant="primary">マッチング開始</GuidePreviewButton>} />
    <div className={styles.guidePreviewMetricGrid}>
      <div><span>方式</span><strong>グループ制</strong></div>
      <div><span>当選者</span><strong>23名</strong></div>
      <div><span>合計席数</span><strong>26席</strong></div>
      <div><span>出席キャスト</span><strong>8名</strong></div>
    </div>
    <div className={styles.guidePreviewMatchingGrid}>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>実行条件</div>
        <div className={styles.guidePreviewOptionGrid}><span>読み取り専用</span><span className={styles.guidePreviewOptionSelected}>品質モード</span><span>X IDでNG除外</span></div>
      </div>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewValidation}><GuidePreviewBadge tone="green">OK</GuidePreviewBadge><p>マッチング準備が完了しています。</p></div>
      </div>
    </div>
    <table className={styles.guidePreviewTable}>
      <thead><tr><th>キャスト</th><th>R1</th><th>R2</th><th>R3</th><th>合計</th></tr></thead>
      <tbody>
        <tr><td>キャストA</td><td>サンプル太郎 <GuidePreviewBadge tone="yellow">1希</GuidePreviewBadge></td><td>ゲスト花子</td><td>なし</td><td>2</td></tr>
        <tr><td>キャストB</td><td>ゲスト花子 <GuidePreviewBadge tone="yellow">1希</GuidePreviewBadge></td><td>サンプル太郎</td><td>問題ユーザー</td><td>3</td></tr>
      </tbody>
    </table>
    <div className={styles.guidePreviewFooterActions}><GuidePreviewButton>PNG出力</GuidePreviewButton><GuidePreviewButton>マッチング結果をTSVで保存</GuidePreviewButton></div>
  </div>
);

const CastSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewTwoPane}>
    <div className={styles.guidePreviewPanel}>
      <div className={styles.guidePreviewPanelTitle}>キャスト一覧</div>
      {['キャストA / グループ1', 'キャストB / グループ1', 'キャストC / グループ2'].map((cast, index) => (
        <div key={cast} className={`${styles.guidePreviewListRow}${index === 0 ? ` ${styles.guidePreviewListRowActive}` : ''}`}>{cast}</div>
      ))}
      <div className={styles.guidePreviewQuickInput}>キャストD を追加</div>
    </div>
    <div className={styles.guidePreviewPanel}>
      <GuidePreviewHeader title="キャストA" description="グループ1 / 出席対象" />
      <div className={styles.guidePreviewProfileGrid}>
        <div>
          <div className={styles.guidePreviewAvatar}>写真</div>
          <div style={{ marginTop: 8 }}><GuidePreviewButton variant="danger">キャストを削除</GuidePreviewButton></div>
        </div>
        <div className={styles.guidePreviewFieldStack}><span>名前: キャストA</span><span>グループ: グループ1</span><span>メモ: 接客メモを入力</span></div>
      </div>
      <div className={styles.guidePreviewExternalLinks}><GuidePreviewButton>Discord</GuidePreviewButton><GuidePreviewButton>X</GuidePreviewButton><GuidePreviewButton>VRChat</GuidePreviewButton></div>
    </div>
  </div>
);

const NgSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader title="NG管理" description="キャストNGと要注意人物を管理します。" />
    <GuidePreviewTabs tabs={['キャストNG', '要注意人物']} />
    <div className={styles.guidePreviewTwoPane}>
      <div className={styles.guidePreviewPanel}>
        {[
          ['キャストA', '2'],
          ['キャストB', '0'],
          ['キャストC', '1'],
        ].map(([name, count], index) => (
          <div key={name} className={`${styles.guidePreviewListRow}${index === 0 ? ` ${styles.guidePreviewListRowActive}` : ''}`}>
            <span>{name}</span>{count !== '0' && <GuidePreviewBadge tone="red">{count}</GuidePreviewBadge>}
          </div>
        ))}
      </div>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>キャストA のNG一覧</div>
        <table className={styles.guidePreviewTable}><tbody><tr><td>問題ユーザー</td><td>@problem_123</td><td>リンク</td><td><span className={styles.guidePreviewDeleteMark}>×</span></td></tr><tr><td>別名ユーザー</td><td>@bad_user</td><td>リンク</td><td><span className={styles.guidePreviewDeleteMark}>×</span></td></tr></tbody></table>
        <div className={styles.guidePreviewCautionGrid}>
          <div><strong>要注意候補</strong><span>@problem_123 / 2名のキャストがNG</span></div>
          <div><strong>登録済み</strong><span>@manual_user / 手動登録</span></div>
        </div>
      </div>
    </div>
  </div>
);

const AttendanceSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader title="出席管理" description="出席中・待機の切り替えと履歴を保存します。" actions={<GuidePreviewButton variant="primary">出席を記録</GuidePreviewButton>} />
    <GuidePreviewTabs tabs={['出席設定', '出席履歴']} />
    <div className={styles.guidePreviewAttendanceGrid}>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>出席中 3名</div>
        {['キャストA', 'キャストB', 'キャストC'].map(cast => <div key={cast} className={`${styles.guidePreviewAttendanceRow} ${styles.guidePreviewAttendanceRowPresent}`}>{cast}</div>)}
      </div>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>待機 2名</div>
        {['キャストD', 'キャストE'].map(cast => <div key={cast} className={`${styles.guidePreviewAttendanceRow} ${styles.guidePreviewAttendanceRowStandby}`}>{cast}</div>)}
      </div>
      <div className={styles.guidePreviewModalPreview}>
        <div><span>記録日</span><strong>2026-06-17</strong></div>
        <div><span>出席人数</span><strong>3名</strong></div>
        <p>キャストA / キャストB / キャストC</p>
      </div>
    </div>
    <table className={styles.guidePreviewTable}>
      <tbody><tr><th>キャスト名</th><th>出席回数</th><th>06/15</th><th>06/16</th><th>06/17</th></tr><tr><td>キャストA</td><td>3</td><td>✓</td><td>✓</td><td>✓</td></tr><tr><td>キャストD</td><td>1</td><td>-</td><td>✓</td><td>-</td></tr></tbody>
    </table>
  </div>
);

const TweetSampleScreen: React.FC = () => (
  <div className={styles.guidePreviewScreenStack}>
    <GuidePreviewHeader title="投稿テンプレ" description="出席キャストを使った投稿文を作成します。" />
    <div className={styles.guidePreviewTwoPane}>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>テンプレート編集</div>
        <div className={styles.guidePreviewTextArea}>【{'{event_name}'}】<br />本日の出演キャスト<br />{'{casts}'}</div>
        <div className={styles.guidePreviewExternalLinks}><GuidePreviewBadge>{'{casts}'}</GuidePreviewBadge><GuidePreviewBadge>{'{event_name}'}</GuidePreviewBadge></div>
      </div>
      <div className={styles.guidePreviewPanel}>
        <div className={styles.guidePreviewPanelTitle}>プレビュー</div>
        <div className={styles.guidePreviewTextArea}>【Manual Test Event】<br />本日の出演キャスト<br />キャストA<br />キャストB<br />キャストC</div>
        <div className={styles.guidePreviewFooterActions}><span className={styles.guidePreviewCharacterCount}>57 / 280</span><GuidePreviewButton variant="primary">コピー</GuidePreviewButton></div>
      </div>
    </div>
  </div>
);

/* ── 各機能の詳細コンテンツ ── */

const FEATURE_CONTENT: Record<FeatureId, React.ReactNode> = {

  'applicant-data': (
    <div>
      <FeatureHeader icon={<Database size={26} />} title="応募データ" description="取り込んだ応募者一覧の確認・管理を行う画面です。" color="var(--guide-accent-primary)" colorSoft="var(--guide-accent-primary-soft)" />
      <FeatureGuideSample feature="applicant-data" />

      <ScreenSample title="応募データ">
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-default)', marginBottom: 8 }}>
          {['全件 (23)', '要注意 (1)'].map((t, i) => (
            <span key={t} style={{ padding: '4px 12px', fontSize: 11, borderBottom: i === 0 ? '2px solid var(--accent-primary)' : '2px solid transparent', color: i === 0 ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: i === 0 ? 700 : 400 }}>{t}</span>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>
            {['ユーザー名', 'X ID', '希望1', '希望2', '希望3'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              { name: 'テストユーザー', xid: '@test_vrc', c: ['キャストA', 'キャストB', 'キャストC'], caution: false },
              { name: '⚠ 問題ユーザー', xid: '@problem_123', c: ['キャストA', '', ''], caution: true },
              { name: 'サンプル太郎',   xid: '@sample_vrc', c: ['キャストC', 'キャストA', ''], caution: false },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-default)', background: r.caution ? 'rgba(237,66,69,0.08)' : 'transparent' }}>
                <td style={{ padding: '5px 8px', color: r.caution ? '#ed4245' : 'var(--text-default)', fontWeight: r.caution ? 600 : 400 }}>{r.name}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-link, #00b0f4)' }}>{r.xid}</td>
                {r.c.map((c, j) => <td key={j} style={{ padding: '5px 8px', color: 'var(--text-default)' }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </ScreenSample>

      <Section title="概要">
        <p>TSVで取り込んだ応募データを一覧表示します。データがない状態ではインポート画面が表示され、取り込み後に一覧が表示されます。</p>
      </Section>

      <Section title="主な機能">
        <FeatureList items={[
          '応募者一覧の表示（ユーザー名・X ID・希望キャスト。カンマ区切りは全件を横展開）',
          '行をクリックすると応募者詳細を表示（VRC URL・カスタムカラム・NGキャスト等）',
          'X ID をクリックすると X（Twitter）のユーザーページをブラウザで開く',
          '要注意ユーザーフィルター：「全件」「要注意」タブで絞り込み',
          'NGキャスト欄は1件ならキャスト名、複数なら「○名のキャストがNG」と表示',
          '「再取り込み」でTSVを再選択して上書き取り込み',
          '「元ログ削除」で応募データを全削除',
          '個別の応募者は行末の赤い×で削除',
        ]} />
      </Section>

      <Section title="要注意ユーザーとは">
        <p>NG管理で設定した「要注意人物」、またはキャストNGに一致するユーザーは一覧で強調表示されます。<br/>
        NGキャスト欄は要注意人物の登録状況とは独立して表示され、複数いる場合は件数、詳細なキャスト名は応募者詳細で確認します。</p>
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          'X ID は必須カラムです。取り込み時に X ID 列が指定されていないと取り込み不可です',
          'イベント単位でデータを管理します。イベントを切り替えると別のデータセットが表示されます',
          '「元ログ削除」は取り消しできません。削除前に確認ダイアログが出ます',
        ]} />
      </Section>
    </div>
  ),

  'import': (
    <div>
      <FeatureHeader icon={<FileText size={26} />} title="データ読取" description="TSVファイルを選択し、列のマッピングを設定して応募データを取り込む画面です。" color="var(--guide-accent-import)" colorSoft="var(--guide-accent-import-soft)" />
      <FeatureGuideSample feature="import" />

      <ScreenSample title="データ読取 — 列マッピング">
        <div style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--guide-accent-import-bg)', border: '1px solid var(--guide-accent-import-border)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          📄 responses.tsv &nbsp;|&nbsp; 42行 検出 &nbsp;|&nbsp; 有効: 41件
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'ユーザー名', value: '名前' },
            { label: 'X ID', value: 'X/Twitter ID', required: true },
            { label: '希望キャスト 1', value: '第一希望' },
            { label: '希望キャスト 2', value: '第二希望' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 110, fontSize: 11, color: 'var(--text-default)', flexShrink: 0 }}>
                {row.label}{row.required && <span style={{ color: '#ed4245', marginLeft: 2 }}>*</span>}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
              <span style={{ padding: '3px 8px', background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 11, color: 'var(--accent-primary)' }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <span style={{ padding: '5px 12px', background: 'var(--button-secondary-bg)', color: 'var(--text-default)', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>抽選へ進む</span>
          <span style={{ padding: '5px 14px', background: 'var(--accent-primary)', color: '#fff', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>取り込む</span>
        </div>
      </ScreenSample>

      <Section title="取り込み手順">
        <StepList items={[
          '「TSVファイルを選択」をクリックしてファイルを選ぶ',
          'ファイル読み込み後、自動でヘッダーを解析・列マッピングを自動入力',
          'マッピングが正しいか確認し、必要に応じて各ドロップダウンで修正',
          '希望キャストの形式（別列 or カンマ区切り1列）を選択',
          'プレビューで取り込み結果を確認',
          '一覧で確認する場合は「○件を取り込む」をクリックして確定',
          '取り込み後すぐ抽選へ進む場合は「抽選へ進む」を選択',
        ]} />
      </Section>

      <Section title="列マッピング">
        <FeatureList items={[
          'ユーザー名：応募者の表示名',
          'X ID：@から始まるアカウント識別子（必須）',
          'VRC URL：VRChat のユーザーページURL（任意）',
          '希望キャスト：1列ずつ複数指定 or カンマ区切り1列を選択。カンマ区切りは全希望キャストを同じ50点で評価',
        ]} />
        <p style={{ marginTop: 8 }}>列の自動解析は日本語キーワード（「名前」「ユーザー名」「X ID」等）に対応しています。同じヘッダー形式のTSVは次回から自動で同じマッピングが復元されます。</p>
      </Section>

      <Section title="プレビュー">
        <p>取り込み前に先頭5行のデータを確認できます。有効件数（X IDがある行数）と、X IDが空の件数も表示されます。</p>
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          'ファイルは .tsv 形式のみ対応しています',
          'X ID 列が特定できない場合は入力欄がアニメーションして警告します',
          'テンプレートは インストール先\\Data\\template に保存されます',
        ]} />
      </Section>
    </div>
  ),

  'lottery': (
    <div>
      <FeatureHeader icon={<CheckCircle size={26} />} title="抽選" description="当選者を決定する抽選の設定・実行を行う画面です。" color="var(--guide-accent-lottery)" colorSoft="var(--guide-accent-lottery-soft)" />
      <FeatureGuideSample feature="lottery" />

      <ScreenSample title="抽選設定">
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: '形式', value: 'ランダム' },
              { label: '当選人数', value: '20 人' },
              { label: 'ローテーション', value: '3 回' },
              { label: '総テーブル数', value: '4' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 80, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{r.label}</span>
                <span style={{ padding: '3px 8px', background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 11, color: 'var(--text-heading)', fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
          </div>
          <div style={{ width: 130, padding: '10px 12px', background: 'var(--guide-accent-lottery-bg)', border: '1px solid var(--guide-accent-lottery-border)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--guide-accent-lottery)', fontWeight: 700, marginBottom: 4 }}>✓ 検証OK</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>合計席数: 12席</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>出席キャスト: 4</div>
            <div style={{ marginTop: 8, padding: '4px 0', background: 'var(--guide-accent-lottery)', color: '#fff', borderRadius: 4, fontSize: 11, fontWeight: 700, textAlign: 'center' }}>抽選実行</div>
          </div>
        </div>
      </ScreenSample>

      <Section title="マッチング形式">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {([
            { id: '抽選のみ', color: '#6b7280', title: '抽選のみ行う', desc: 'キャスト割り当てを行わず、当選者だけを決定します' },
            { id: 'ランダム', color: '#3b82f6', title: 'ランダム',       desc: '希望キャストを優先しつつランダムに割り当てます' },
            { id: 'ローテ', color: '#10b981', title: 'ローテーション', desc: '公平に循環させながら割り当てます' },
            { id: 'グループ', color: '#f59e0b', title: 'グループ制マッチング', desc: 'テーブルあたりゲスト数・担当キャスト数・当日枠を細かく設定します' },
          ] as const).map(m => (
            <div key={m.id} style={{ borderRadius: 8, padding: '12px 14px', background: 'var(--surface-panel)', border: `1px solid ${m.color}44`, borderLeft: `3px solid ${m.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#fff', background: m.color, padding: '2px 7px', borderRadius: 4 }}>{m.id}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}>{m.title}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="設定項目">
        <FeatureList items={[
          '当選人数：抽選で選ぶ総人数',
          'ローテーション回数：何ローテーション分を割り当てるか',
          '総テーブル数：ランダム・ローテーション方式で使用する枠数',
          'テーブルあたりゲスト数：グループ制マッチングで使う1テーブルの最大人数',
          'ローテあたりキャスト数：グループ制マッチングで使う1ローテーションの担当キャスト数',
          '当日枠を含める：グループ制マッチングで当日枠分の席数を合計席数に追加',
          '確定当選者：抽選に関わらず必ず当選とするユーザーを事前指定。抽選人数と合わせた合計当選者数を確認可能',
        ]} />
      </Section>

      <Section title="設定ステータス">
        <p>条件設定内で実行可否を自動チェックします。キャスト出席状況・合計席数・合計当選者数のバランスが合わない場合は警告が表示されます。INFOには合計席数と合計当選者数を表示します。</p>
      </Section>

      <Section title="抽選実行後">
        <FeatureList items={[
          '当選者一覧がテーブル表示されます（ユーザー名・X ID・確定/抽選の区分・希望キャスト・NGキャスト）',
          '「抽選結果保存」で現在の抽選結果をDBに保存できます',
          '保存済み抽選結果は後から選択し直せます',
          '「マッチングへ」でマッチングタブに遷移します',
          '再実行すると上書き確認ダイアログが表示されます',
        ]} />
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          '抽選実行前にキャスト管理で出席状態を設定しておいてください',
          '確定当選者は当選人数にカウントされます',
          '検証エラーがある場合、実行ボタンが無効になります',
        ]} />
      </Section>
    </div>
  ),

  'matching': (
    <div>
      <FeatureHeader icon={<BarChart3 size={26} />} title="マッチング" description="抽選結果を元に、当選者とキャストの割り当てを行い結果を確認・出力する画面です。" color="var(--guide-accent-matching)" colorSoft="var(--guide-accent-matching-soft)" />
      <FeatureGuideSample feature="matching" />

      <ScreenSample title="マッチング結果（キャスト別）">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>
            {['キャスト', 'R1', 'R2', 'R3', '合計'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              { cast: 'キャストA', users: ['テストユーザー', 'サンプル太郎', 'なし'], ranks: [1, 1, 0] },
              { cast: 'キャストB', users: ['ゲスト花子', 'テストユーザー', 'サンプル太郎'], ranks: [0, 2, 3] },
              { cast: 'キャストC', users: ['サンプル太郎', 'なし', 'テストユーザー'], ranks: [2, 0, 1] },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-default)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--text-default)', fontWeight: 700 }}>{r.cast}</td>
                {r.users.map((user, j) => (
                  <td key={j} style={{ padding: '5px 8px' }}>
                    <span style={{ fontSize: 10, color: user === 'なし' ? 'var(--text-muted)' : 'var(--text-default)' }}>{user}</span>
                    {r.ranks[j] > 0 && <span style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 3, background: r.ranks[j] === 1 ? '#f5c400' : r.ranks[j] === 2 ? '#a8a8a8' : '#ad6f2d', color: r.ranks[j] === 2 ? '#000' : '#fff', fontSize: 9, fontWeight: 700 }}>{r.ranks[j]}希</span>}
                  </td>
                ))}
                <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{r.users.filter((user) => user !== 'なし').length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScreenSample>

      <Section title="画面構成">
        <FeatureList items={[
          '【実行セクション】抽選設定で確定した条件、設定ステータス、探索モードを確認',
          '【キャスト別結果】キャストごとに応対する応募者をローテーション別に表示',
          '【テーブル別結果】テーブルごとの座席と担当キャストを表形式で表示',
          '【エクスポートセクション】キャスト別結果をTSVファイル出力',
        ]} />
      </Section>

      <Section title="NG条件">
        <p>NG判定はX IDのみで行い、該当キャストへの割り当てから自動除外します。</p>
        <FeatureList items={[
          '判定基準：応募者のX IDとキャストNG登録のIDが一致するか',
          '当選者リスト：NGキャストがいる当選者は抽選画面でも確認可能',
        ]} />
      </Section>

      <Section title="マッチング実行">
        <p>「マッチングを実行」ボタンで実行します。実行後は結果がロックされ、探索モードは変更できなくなります。条件を変更する場合は抽選設定に戻り、マッチングを再実行します。</p>
      </Section>

      <Section title="結果の出力">
        <FeatureList items={[
          '「PNG出力」：キャスト別結果またはテーブル別結果を画像で保存',
          '「マッチング結果をTSVで保存」：キャスト別に応対する応募者をローテーション列付きで出力',
        ]} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {([
            { label: '第1希望', bg: '#f5c400', text: '#000' },
            { label: '第2希望', bg: '#a8a8a8', text: '#000' },
            { label: '第3希望', bg: '#ad6f2d', text: '#fff' },
            { label: 'それ以降', bg: '#4a4a4a', text: '#bbb' },
          ] as const).map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: b.bg, color: b.text, fontSize: 12, fontWeight: 700 }}>
              {b.label}
            </div>
          ))}
        </div>
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          '抽選設定で条件を変更した場合はマッチングの再実行が必要です',
          'エラーが発生した場合は詳細なエラーメッセージモーダルが表示されます',
          'PNG出力は高解像度（2倍）で生成されます',
        ]} />
      </Section>
    </div>
  ),

  'cast': (
    <div>
      <FeatureHeader icon={<Users size={26} />} title="キャスト名簿" description="キャストの登録・プロフィール・連絡先を管理する画面です。" color="var(--guide-accent-cast)" colorSoft="var(--guide-accent-cast-soft)" />
      <FeatureGuideSample feature="cast" />

      <ScreenSample title="キャスト名簿">
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 130, borderRight: '1px solid var(--border-default)', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { name: 'キャストA', group: 'グループ1', selected: true },
              { name: 'キャストB', group: 'グループ1', selected: false },
              { name: 'キャストC', group: 'グループ2', selected: false },
              { name: 'キャストD', group: 'グループ2', selected: false },
            ].map(c => (
              <div key={c.name} style={{ padding: '5px 8px', borderRadius: 5, background: c.selected ? 'var(--surface-selected)' : 'transparent', fontSize: 11 }}>
                <div style={{ color: c.selected ? 'var(--text-heading)' : 'var(--text-default)', fontWeight: c.selected ? 600 : 400 }}>{c.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{c.group}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--text-muted)' }}>👤</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>キャストA</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>グループ1</div>
              </div>
            </div>
            {[['連絡先', 'https://vrchat.com/...'], ['プロフィール', 'よろしくお願いします']].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 11, color: 'var(--text-default)', padding: '3px 6px', background: 'var(--surface-panel-muted)', borderRadius: 4, border: '1px solid var(--border-default)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </ScreenSample>

      <Section title="画面構成">
        <p>左ペインにキャスト一覧、右ペインに選択したキャストの詳細が表示されます。</p>
      </Section>

      <Section title="キャスト一覧（左ペイン）">
        <FeatureList items={[
          'キャスト名とグループ名を表示',
          '検索バーで名前絞り込み',
          '一覧下部の入力欄でキャストを新規追加',
          '選択中のキャストはハイライト表示',
        ]} />
      </Section>

      <Section title="キャスト詳細（右ペイン）">
        <FeatureList items={[
          '写真：クリックで画像ファイルを選択してアップロード',
          'キャスト名：直接編集可能',
          'グループ名：グループを設定できます（マッチング結果でグループ分けに使用）',
          'プロフィール：自由テキストのメモ欄',
          '連絡先：Discord DM URL、WebプロフィールURL、Xの @username を登録し、リンクボタンで開けます',
          '外部サイト：Discord、X、VRChat の固定リンクを開けます',
          '削除ボタン：プロフィール画像の下にある単色赤背景のボタンから確認ダイアログ後にキャストを削除',
        ]} />
      </Section>

      <Section title="出席設定との関係">
        <p>キャスト名簿は名簿情報の管理画面です。イベント当日の出席中・待機の切り替えと出席履歴の保存は「出席管理」タブで行います。</p>
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          'キャスト名の重複は登録できません',
          '写真はアプリのデータベースに保存されます（外部ファイル参照ではない）',
          '削除したキャストのNGデータ・出席記録も同時に削除されます',
        ]} />
      </Section>
    </div>
  ),

  'ng': (
    <div>
      <FeatureHeader icon={<UserX size={26} />} title="NG管理" description="キャストごとのNGユーザー登録と、要注意人物の管理を行う画面です。" color="var(--guide-accent-output)" colorSoft="var(--guide-accent-output-soft)" />
      <FeatureGuideSample feature="ng" />

      <ScreenSample title="NG管理 — キャストNG">
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 120, borderRight: '1px solid var(--border-default)', paddingRight: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[{ name: 'キャストA', ng: 2, sel: true }, { name: 'キャストB', ng: 0, sel: false }, { name: 'キャストC', ng: 1, sel: false }].map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 7px', borderRadius: 5, background: c.sel ? 'var(--surface-selected)' : 'transparent', fontSize: 11 }}>
                <span style={{ color: c.sel ? 'var(--text-heading)' : 'var(--text-default)', fontWeight: c.sel ? 600 : 400 }}>{c.name}</span>
                {c.ng > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{c.ng}</span>}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>キャストA のNG一覧</div>
            {[{ name: '問題ユーザー', xid: '@problem_123' }, { name: '', xid: '@bad_user' }].map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5, background: 'rgba(237,66,69,0.08)', border: '1px solid rgba(237,66,69,0.2)', marginBottom: 4, fontSize: 11 }}>
                <span style={{ flex: 1, color: 'var(--text-default)' }}>{u.name || '—'}</span>
                <span style={{ color: 'var(--text-muted)' }}>{u.xid}</span>
                <span style={{ color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>✕</span>
              </div>
            ))}
          </div>
        </div>
      </ScreenSample>

      <Section title="タブ構成">
        <FeatureList items={[
          '【キャストNG】キャストごとにNGユーザーを登録・削除',
          '【要注意人物】複数キャストからNGを受けているユーザーを管理',
        ]} />
      </Section>

      <Section title="キャストNG タブ">
        <p>左にキャスト一覧（NG数バッジ付き）、右に選択キャストのNG一覧を表示します。</p>
        <FeatureList items={[
          'ユーザー名（任意）と X ID を入力して「追加」',
          'X IDは @ 付きに自動正規化されます（例：@example → @example）',
          '登録済みNGユーザーはリスト表示。行末の赤い×で削除',
          'NGを受けているキャストが多いユーザーは「要注意人物」タブの候補に自動表示',
        ]} />
      </Section>

      <Section title="要注意人物 タブ">
        <p>「キャストNG」に登録されたデータを元に、複数のキャストからNGを受けているユーザーを自動で候補表示します。</p>

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>候補セクション</h4>
        <FeatureList items={[
          '「○人以上のキャストがNGを出したら候補表示」の閾値を設定',
          '条件を満たすユーザーをカードで一覧表示',
          'カードには X ID・ユーザー名（複数の場合は全て表示）・NGを出しているキャスト数を表示。件数を開くとキャスト名を確認できます',
          '「要注意に追加」ボタンで登録済みセクションに移動',
        ]} />

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>登録済みセクション</h4>
        <FeatureList items={[
          '手動でユーザー名・X IDを入力して追加することもできます',
          '登録種別バッジ：「手動」（青）または「自動＋NG数」（緑）で表示',
          '行末の赤い×で登録解除',
        ]} />
      </Section>

      <Section title="NG例外">
        <p>要注意人物に登録されているユーザーでも、特定のキャストへのNGを解除できます。
        「NG例外を追加」からユーザー名とX IDを入力して設定します。マッチング時にこの例外設定が考慮されます。</p>
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          'X IDが同じで名前が違うユーザーは同一人物として扱います（候補の名前チップに全ユーザー名を表示）',
          '要注意人物に登録されたユーザーは応募データ一覧で「要注意」フラグが立ちます',
          'NGはマッチング実行時に自動的に考慮されます',
        ]} />
      </Section>
    </div>
  ),

  'attendance': (
    <div>
      <FeatureHeader icon={<Calendar size={26} />} title="出席管理" description="イベント当日の出席中・待機の切り替えと、出席履歴の保存を行う画面です。" color="var(--guide-accent-primary)" colorSoft="var(--guide-accent-primary-soft)" />
      <FeatureGuideSample feature="attendance" />

      <ScreenSample title="出席設定">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {([
            { label: '出席中', color: '#3ba55d', casts: ['キャストA', 'キャストB', 'キャストC'] },
            { label: '待機中', color: '#747f8d', casts: ['キャストD'] },
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
          {['全員待機', '全員出席'].map(t => <span key={t} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)', fontSize: 10, color: 'var(--text-muted)' }}>{t}</span>)}
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--accent-primary)', color: '#fff', fontSize: 10, fontWeight: 700 }}>保存</span>
        </div>
      </ScreenSample>

      <Section title="タブ構成">
        <FeatureList items={[
          '【出席設定】当日の出席/待機状態を設定し記録する',
          '【出席履歴】キャスト別・日付別の出席履歴を確認',
        ]} />
      </Section>

      <Section title="出席設定 タブ">
        <p>キャストを「出席中」「待機中」に振り分けます。キャスト名の行をクリックすると、もう一方のリストへ移動します。</p>
        <FeatureList items={[
          '「全員出席」ボタン：全キャストを出席中に移動',
          '「全員待機」ボタン：全キャストを待機中に移動',
          'キャストはグループごとに区切って表示',
          '出席中・待機のBOX内ではキャストを1名ずつ縦に表示',
          '「保存」ボタン：出席記録モーダルを開く',
        ]} />

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>保存モーダル</h4>
        <FeatureList items={[
          '上段左：記録日を手動入力（YYYY-MM-DD形式、デフォルトは今日）',
          '上段右：出席キャスト数を大きく表示',
          '下段：出席キャスト名の一覧',
          '同じ日付に記録済みの場合は「上書きします」警告を表示',
          '「保存」ボタンで確定',
        ]} />
      </Section>

      <Section title="出席履歴 タブ">
        <FeatureList items={[
          'キャスト名を縦軸、記録日を横軸にしたチェック表で表示',
          'キャスト名の隣に累積出席回数を表示',
          '日付列は横スクロールで確認可能',
        ]} />
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          '出席状態（出席中/待機中）はキャスト管理の出欠とは独立した設定です',
          '同一イベント・同一日付で保存すると上書きになります（削除＋再INSERT）',
          'イベントを切り替えると、そのイベントの出席記録が表示されます',
          '抽選やマッチングとは独立した機能です（抽選条件には影響しません）',
        ]} />
      </Section>
    </div>
  ),

  'tweet': (
    <div>
      <FeatureHeader icon={<Settings size={26} />} title="投稿テンプレ" description="X（Twitter）への投稿文テンプレートを作成・管理する画面です。" color="var(--guide-accent-cast)" colorSoft="var(--guide-accent-cast-soft)" />
      <FeatureGuideSample feature="tweet" />

      <ScreenSample title="投稿テンプレ">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>テンプレート編集</div>
            <div style={{ background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '8px 10px', fontSize: 11, color: 'var(--text-default)', lineHeight: 1.7, minHeight: 70 }}>
              {'【{event_name}】\nキャスト出演情報\n{casts}'}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
              {['{casts}', '{event_name}'].map(p => (
                <span key={p} style={{ padding: '2px 6px', background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.3)', borderRadius: 4, fontSize: 10, color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{p}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>プレビュー</div>
            <div style={{ background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '8px 10px', fontSize: 11, color: 'var(--text-default)', lineHeight: 1.7, minHeight: 70 }}>
              {'【サンプルイベント】\nキャスト出演情報\nキャストA\nキャストB\nキャストC'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
              <span style={{ padding: '3px 8px', background: 'var(--accent-primary)', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>コピー</span>
            </div>
          </div>
        </div>
      </ScreenSample>

      <Section title="画面構成">
        <FeatureList items={[
          '【左ペイン】テンプレート編集エリア',
          '【右ペイン】プレビューエリア',
        ]} />
      </Section>

      <Section title="テンプレート編集">
        <p>テキストエリアに投稿文のひな型を入力します。プレースホルダーを使うと、実際の値に自動置換されます。</p>

        <h4 style={{ color: 'var(--text-heading)', fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>プレースホルダー一覧</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            { ph: '{casts}',      desc: '出席中のキャスト名（改行区切り）' },
            { ph: '{event_name}', desc: '現在選択中のイベント名' },
          ] as const).map(({ ph, desc }) => (
            <div key={ph} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 7, background: 'var(--surface-panel)', border: '1px solid var(--border-default)' }}>
              <code style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: 'var(--accent-primary)', background: 'rgba(88,101,242,0.12)', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{ph}</code>
              <span style={{ fontSize: 13, color: 'var(--text-default)' }}>→ {desc}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>ボタンをクリックするとカーソル位置に自動挿入。テンプレートは自動保存されます。</p>
      </Section>

      <Section title="プレビュー">
        <FeatureList items={[
          'プレースホルダーが実際の値に置換された状態でリアルタイムプレビュー表示',
          '文字数カウント表示（280字超過時は赤色で警告）',
          '「クリップボードにコピー」ボタンで投稿文をコピー',
          'コピーした投稿文を任意の投稿先へ貼り付け',
        ]} />
      </Section>

      <Section title="注意事項">
        <NoteList items={[
          '出席中のキャストが0人の場合、警告メッセージが表示されます',
          '{casts} は「出席管理」タブの出席状態とは別に、キャスト名簿の出席フラグを参照します',
          'Xの文字数カウントはURLを含まない本文のみのカウントです',
        ]} />
      </Section>
    </div>
  ),
};

/* ════════════════════════════════════════
   メインコンポーネント
════════════════════════════════════════ */

export const GuidePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('flow');
  const [selectedFeature, setSelectedFeature] = useState<FeatureId>('applicant-data');
  const [stellaStatus, setStellaStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'unavailable'>('idle');
  const [stellaMessage, setStellaMessage] = useState('');

  const handleStellaRegister = useCallback(async () => {
    if (!isTauri()) return;
    setStellaStatus('loading');
    try {
      const available = await invoke<boolean>('check_stellarecord_available');
      if (!available) {
        setStellaStatus('unavailable');
        setStellaMessage('StellaRecord がインストールされていません');
        return;
      }
      const msg = await invoke<string>('register_to_stellarecord');
      setStellaStatus('success');
      setStellaMessage(msg);
    } catch (e) {
      setStellaStatus('error');
      setStellaMessage(String(e));
    }
  }, []);

  return (
    <div className={`${shared.pageWrapper} ${styles.guidePage}`} style={{ maxWidth: 1400, paddingBottom: 60 }}>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* デバッグ通知 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', marginBottom: 20, borderRadius: 8, background: 'rgba(240, 178, 50, 0.18)', border: '1px solid rgba(240, 178, 50, 0.55)', fontSize: 12, color: 'var(--accent-warning, #f0b232)', fontWeight: 600 }}>
        🔧 デバッグ中です。更新は最新化を命令されたときに更新します
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border-default)' }}>
        {([
          { id: 'flow' as Tab,     label: '基本的な流れ' },
          { id: 'features' as Tab, label: '各機能について' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 20px', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent', background: 'none', color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: 14, cursor: 'pointer', borderRadius: '4px 4px 0 0', transition: 'color 0.15s, border-color 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: 基本的な流れ ── */}
      {activeTab === 'flow' && (
        <div style={{ animation: 'fade-in 0.2s ease' }}>

          {/* 概要グリッド */}
          <section className={styles.guideSection} style={{ marginBottom: 32 }}>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}>
              <BarChart3 size={22} /> 基本的な流れ
            </h2>
            <div className={styles.guideFlowBox}>
              <div className={styles.guideFlowGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  { icon: FileText,    text: 'データ読取',     desc: 'TSVで応募データを取り込む' },
                  { icon: Database,    text: '応募データ確認', desc: '取り込んだデータを確認' },
                  { icon: Users,       text: 'キャスト出席設定', desc: '当日の出席状態を設定' },
                  { icon: Settings,    text: '抽選設定・実行', desc: '条件を設定して当選者を決定' },
                  { icon: CheckCircle, text: 'マッチング実行', desc: 'NGを考慮して割り当て' },
                  { icon: BarChart3,   text: '結果を出力',     desc: '抽選結果保存・PNG/TSV出力' },
                ].map((item, idx) => (
                  <div key={idx} className={styles.guideFlowItem}>
                    <item.icon size={24} className={styles.guideFlowItemIcon} />
                    <div className={styles.guideFlowItemTitle}>{idx + 1}. {item.text}</div>
                    <div className={styles.guideFlowItemDesc}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 各ステップの詳細 */}
          <section className={styles.guideSection} style={{ marginBottom: 40 }}>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}>
              <FileText size={22} /> 各ステップの詳細
            </h2>
            <div className={styles.guideStackVertical}>

              {/* Step 1 */}
              <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'linear-gradient(135deg, var(--guide-accent-import) 0%, var(--guide-accent-import-soft) 100%)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>1</div>
                  <FileText size={18} color="#fff" /><span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>データ読取</span>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['Googleフォームの回答をスプレッドシートに連携し、TSV形式でダウンロードする', 'アプリの「データ読取」タブを開き「TSVファイルを選択」からファイルを選ぶ', '自動解析された列マッピングを確認・修正する', '一覧確認は「取り込む」、すぐ抽選へ進む場合は「抽選へ進む」を選択'].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--guide-accent-import-bg)', border: '1px solid var(--guide-accent-import-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--guide-accent-import)', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <ScreenSample title="列マッピング">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[['ユーザー名', '名前'], ['X ID *', 'X/Twitter ID'], ['希望キャスト 1', '第一希望'], ['希望キャスト 2', '第二希望']].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 90, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{l}</span>
                          <span style={{ padding: '2px 7px', background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', borderRadius: 3, fontSize: 10, color: 'var(--accent-primary)' }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 4, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
                        <span style={{ padding: '3px 8px', background: 'var(--button-secondary-bg)', color: 'var(--text-default)', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>抽選だけ</span>
                        <span style={{ padding: '3px 10px', background: 'var(--guide-accent-import)', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>取り込む</span>
                      </div>
                    </div>
                  </ScreenSample>
                </div>
              </div>

              {/* Step 2 */}
              <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'linear-gradient(135deg, var(--guide-accent-primary) 0%, var(--guide-accent-primary-soft) 100%)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>2</div>
                  <Database size={18} color="#fff" /><span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>応募データ確認</span>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['「応募データ」タブで取り込んだ応募者一覧を確認する', 'X IDをクリックするとXのユーザーページをブラウザで開いて本人確認できる', 'NGキャストに一致する応募者は一覧と詳細で確認できる', '問題があれば「再取り込み」または個別削除で対応する'].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--guide-accent-primary-bg)', border: '1px solid var(--guide-accent-primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--guide-accent-primary)', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <ScreenSample title="応募データ">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>{['名前', 'X ID', '希望1'].map(h => <th key={h} style={{ padding: '3px 6px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}><td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>テストさん</td><td style={{ padding: '4px 6px', color: 'var(--text-link, #00b0f4)' }}>@test</td><td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>キャストA</td></tr>
                        <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(237,66,69,0.08)' }}><td style={{ padding: '4px 6px', color: '#ed4245', fontWeight: 600 }}>⚠ 問題さん</td><td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>@bad</td><td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>キャストB</td></tr>
                        <tr><td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>花子さん</td><td style={{ padding: '4px 6px', color: 'var(--text-link, #00b0f4)' }}>@hanako</td><td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>キャストA</td></tr>
                      </tbody>
                    </table>
                  </ScreenSample>
                </div>
              </div>

              {/* Step 3 */}
              <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'linear-gradient(135deg, var(--guide-accent-cast) 0%, var(--guide-accent-cast-soft) 100%)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>3</div>
                  <Users size={18} color="#fff" /><span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>キャスト出席設定</span>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['「出席管理」タブを開き「出席設定」タブを選択する', '当日参加できないキャスト行をクリックして「待機」に移動する', '「全員出席」ボタンで一括設定も可能', '設定完了後「保存」をクリックして出席記録を保存する'].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--guide-accent-cast-bg)', border: '1px solid var(--guide-accent-cast-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--guide-accent-cast)', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <ScreenSample title="出席設定">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[{ label: '出席中', color: '#3ba55d', casts: ['キャストA', 'キャストB', 'キャストC'] }, { label: '待機中', color: '#747f8d', casts: ['キャストD'] }].map(col => (
                        <div key={col.label}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: col.color, marginBottom: 4 }}>{col.label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{col.casts.map(c => <span key={c} style={{ padding: '3px 7px', borderRadius: 4, background: col.color, color: '#fff', fontSize: 10 }}>{c}</span>)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, textAlign: 'right' }}><span style={{ padding: '3px 10px', background: 'var(--accent-primary)', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>保存</span></div>
                  </ScreenSample>
                </div>
              </div>

              {/* Step 4 */}
              <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'linear-gradient(135deg, var(--guide-accent-lottery) 0%, var(--guide-accent-lottery-soft) 100%)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>4</div>
                  <Settings size={18} color="#fff" /><span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>抽選設定・実行</span>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['「抽選」タブでマッチング方式を選ぶ', '当選人数・ローテーション回数・テーブル数などを設定する', '設定ステータスでエラーがないことを確認する', '「抽選実行」をクリックして当選者を決定する', '残したい結果は「抽選結果保存」でDBに保存する'].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--guide-accent-lottery-bg)', border: '1px solid var(--guide-accent-lottery-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--guide-accent-lottery)', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <ScreenSample title="抽選設定">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[['形式', 'ランダム'], ['当選人数', '20 人'], ['ローテーション', '3 回'], ['テーブル数', '4']].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 70, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{l}</span>
                          <span style={{ padding: '2px 7px', background: 'var(--surface-panel-muted)', border: '1px solid var(--border-default)', borderRadius: 3, fontSize: 10, color: 'var(--text-heading)', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 4, padding: '5px', background: 'var(--guide-accent-lottery-bg)', border: '1px solid var(--guide-accent-lottery-border)', borderRadius: 5, fontSize: 10, color: 'var(--guide-accent-lottery)', fontWeight: 700 }}>✓ 検証OK — 合計席数: 12席</div>
                      <div style={{ textAlign: 'right' }}><span style={{ padding: '3px 10px', background: 'var(--guide-accent-lottery)', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>抽選実行</span></div>
                    </div>
                  </ScreenSample>
                </div>
              </div>

              {/* Step 5 */}
              <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'linear-gradient(135deg, var(--guide-accent-matching) 0%, var(--guide-accent-matching-soft) 100%)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>5</div>
                  <CheckCircle size={18} color="#fff" /><span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>マッチング実行</span>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['「マッチング」タブで条件と探索モードを確認する', 'X ID固定のNG条件に該当する割り当ては自動除外される', '「マッチングを実行」をクリックしてキャストを割り当てる', '結果をキャスト別・テーブル別の表で確認する'].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--guide-accent-matching-bg)', border: '1px solid var(--guide-accent-matching-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--guide-accent-matching)', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <ScreenSample title="マッチング結果">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>{['キャスト', 'R1', 'R2'].map(h => <th key={h} style={{ padding: '3px 6px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[['キャストA', 'テストさん', '花子さん', 1, 2], ['キャストB', '太郎さん', 'テストさん', 0, 1], ['キャストC', '花子さん', '---', 3, 0]].map(([n, c1, c2, r1, r2], i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-default)' }}>
                            <td style={{ padding: '4px 6px', color: 'var(--text-default)' }}>{n}</td>
                            {[[c1, r1], [c2, r2]].map(([c, r], j) => (
                              <td key={j} style={{ padding: '4px 6px' }}>
                                <span style={{ fontSize: 10, color: 'var(--text-default)' }}>{c as string}</span>
                                {(r as number) > 0 && <span style={{ marginLeft: 3, padding: '1px 4px', borderRadius: 3, background: (r as number) === 1 ? '#f5c400' : (r as number) === 2 ? '#a8a8a8' : '#ad6f2d', color: (r as number) === 2 ? '#000' : '#fff', fontSize: 9, fontWeight: 700 }}>{r as number}希</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScreenSample>
                </div>
              </div>

              {/* Step 6 */}
              <div className={styles.guideCard} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'linear-gradient(135deg, var(--guide-accent-output) 0%, var(--guide-accent-output-soft) 100%)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>6</div>
                  <BarChart3 size={18} color="#fff" /><span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>結果の出力</span>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['抽選結果は「抽選結果保存」でDBに保存し、保存済み結果から再選択できる', 'キャスト別結果またはテーブル別結果をPNGで保存する', '「マッチング結果をTSVで保存」でキャスト別に応対する応募者を出力する', 'X投稿には「投稿テンプレ」タブでテンプレートを編集してコピーする'].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--guide-accent-output-bg)', border: '1px solid var(--guide-accent-output-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--guide-accent-output)', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.6 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <ScreenSample title="出力ボタン">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        { label: '抽選結果保存', color: 'var(--guide-accent-lottery)', bg: 'var(--guide-accent-lottery-bg)', border: 'var(--guide-accent-lottery-border)' },
                        { label: 'PNG出力（キャスト別）', color: 'var(--guide-accent-primary)', bg: 'var(--guide-accent-primary-bg)', border: 'var(--guide-accent-primary-border)' },
                        { label: 'PNG出力（テーブル別）', color: 'var(--guide-accent-primary)', bg: 'var(--guide-accent-primary-bg)', border: 'var(--guide-accent-primary-border)' },
                        { label: 'マッチング結果をTSVで保存', color: 'var(--guide-accent-lottery)', bg: 'var(--guide-accent-lottery-bg)', border: 'var(--guide-accent-lottery-border)' },
                      ].map(({ label, color, bg, border }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 5, background: bg, border: `1px solid ${border}`, fontSize: 11, color: 'var(--text-default)', fontWeight: 600 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  </ScreenSample>
                </div>
              </div>

            </div>
          </section>

          {/* よくある質問 */}
          <section className={styles.guideSection} style={{ marginBottom: 40 }}>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}>
              <HelpCircle size={22} /> よくある質問
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { q: '抽選をやり直したい',           a: '抽選タブで再度「抽選実行」をクリックします。上書き確認ダイアログが表示されます。マッチングも再実行が必要です。' },
                { q: '前に保存した抽選結果を使いたい', a: '抽選タブの「保存済み抽選結果」から結果を選び、「保存済み結果を開く」をクリックします。' },
                { q: 'NGを追加したい',               a: 'NG管理タブでキャストのNGユーザーを追加します。追加後はマッチングタブで「解除」→再実行してください。' },
                { q: 'キャストの出席状態を変えたい', a: '出席管理タブで変更し「保存」します。抽選・マッチングはすでに実行済みの場合、再実行が必要です。' },
                { q: '前回と同じキャストデータを使いたい', a: 'キャスト名簿は同一イベント内のセッション間で共有されます。別イベントでは、そのイベントのキャスト名簿を使います。' },
                { q: '応募データを複数イベント分管理したい', a: 'アプリ上部のイベントセレクターで切り替えます。イベントごとに応募データ・抽選結果・マッチング結果が分離して管理されます。' },
                { q: '結果ファイルはどこに保存される？',    a: '抽選結果はDBに保存されます。PNG出力やマッチング結果TSVは保存ダイアログで任意の場所を選択できます。' },
              ] as const).map(({ q, a }) => (
                <div key={q} className={styles.guideCard} style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                    <span style={{ background: 'var(--accent-primary)', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 1 }}>Q</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)' }}>{q}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ background: 'var(--accent-success, #3ba55d)', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 1 }}>A</span>
                    <span style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.7 }}>{a}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.guideSection} style={{ marginBottom: 40 }}>
            <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}>
              <Sheet size={22} /> TSVを用意する（事前準備）
            </h2>
            <p className={shared.pageHeaderSubtitle} style={{ marginBottom: 20, color: 'var(--text-muted)' }}>
              応募データがGoogleフォームで集まっている場合の、スプレッドシート化〜TSV出力までの手順です。
            </p>
            <div className={styles.guideStackVertical}>
              <div className={styles.guideCard}>
                <div className={styles.guideSectionGrid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <h3 style={{ color: 'var(--text-heading)', fontSize: 17, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Sheet size={18} /> Step A. Googleフォームの回答をスプレッドシートに連携する
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-default)', fontSize: 14, lineHeight: 1.9 }}>
                      <li>① フォームを開き「回答」タブをクリック</li>
                      <li>② 緑色ボタン「スプレッドシートにリンク」をクリック</li>
                      <li>③「新しいスプレッドシートを作成」→「作成」をクリック</li>
                    </ul>
                  </div>
                  <div className={styles.guideSamplePreview} style={{ backgroundColor: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #dadce0', transform: 'scale(0.95)', transformOrigin: 'top right' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dadce0', padding: 16 }}>
                      <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: '#34a853', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13 }}>
                        ＋ スプレッドシートにリンク
                      </button>
                      <div style={{ fontSize: 10, color: '#5f6368', marginTop: 8 }}>← ② ここをクリック</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.guideCard}>
                <div className={styles.guideSectionGrid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <h3 style={{ color: 'var(--text-heading)', fontSize: 17, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Download size={18} /> Step B. スプレッドシートからTSVをダウンロードする
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-default)', fontSize: 14, lineHeight: 1.9 }}>
                      <li>① 画面上部「ファイル」をクリック</li>
                      <li>②「ダウンロード」にマウスを乗せる</li>
                      <li>③「タブ区切り形式 (.tsv)」をクリック</li>
                    </ul>
                  </div>
                  <div className={styles.guideSamplePreview} style={{ backgroundColor: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #dadce0', transform: 'scale(0.95)', transformOrigin: 'top right' }}>
                    <div style={{ backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: 4, padding: '6px 0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <div style={{ padding: '6px 16px 8px', backgroundColor: '#f8f9fa' }}>
                        <div style={{ fontSize: 10, color: '#5f6368', marginBottom: 4 }}>② ダウンロード</div>
                        <div style={{ paddingLeft: 8, borderLeft: '2px solid #1a73e8' }}>
                          {['Microsoft Excel (.xlsx)', 'カンマ区切り形式 (.csv)'].map(f => (
                            <div key={f} style={{ fontSize: 11, color: '#5f6368', padding: '3px 0' }}>{f}</div>
                          ))}
                          <div style={{ fontSize: 11, color: '#1a73e8', fontWeight: 600, padding: '3px 0', backgroundColor: 'rgba(26,115,232,0.08)', margin: '2px -8px', paddingLeft: 8 }}>③ タブ区切り形式 (.tsv)</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* STELLA RECORD 連携 */}
          {isTauri() && (
            <section className={styles.guideSection} style={{ marginBottom: 40 }}>
              <h2 className={`${shared.pageHeaderTitle} ${shared.pageHeaderTitleMd} ${styles.guideSectionTitle}`}>
                <Settings size={22} /> STELLA RECORD 連携
              </h2>
              <div className={styles.guideCard} style={{ padding: '18px 22px' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.7 }}>
                  StellaRecord のランチャーに Stargazer を登録します。登録すると StellaRecord から直接起動できるようになります。
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={handleStellaRegister}
                    disabled={stellaStatus === 'loading' || stellaStatus === 'success'}
                    style={{
                      padding: '8px 20px',
                      border: 'none',
                      borderRadius: 6,
                      background: stellaStatus === 'success' ? 'var(--accent-success, #3ba55d)' : 'var(--accent-primary)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: stellaStatus === 'loading' || stellaStatus === 'success' ? 'default' : 'pointer',
                      opacity: stellaStatus === 'loading' ? 0.6 : 1,
                      transition: 'background 0.15s, opacity 0.15s',
                    }}
                  >
                    {stellaStatus === 'loading' ? '登録中...'
                      : stellaStatus === 'success' ? '✓ 登録済み'
                      : 'StellaRecord に登録'}
                  </button>
                  {stellaMessage && (
                    <span style={{
                      fontSize: 12,
                      color: stellaStatus === 'success' ? 'var(--accent-success, #3ba55d)'
                        : stellaStatus === 'error' || stellaStatus === 'unavailable' ? '#ed4245'
                        : 'var(--text-muted)',
                    }}>
                      {stellaMessage}
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

        </div>
      )}

      {/* ── TAB 2: 各機能について ── */}
      {activeTab === 'features' && (
        <div style={{ display: 'flex', gap: 0, animation: 'fade-in 0.2s ease', minHeight: 500 }}>

          {/* 左ナビ */}
          <nav style={{ width: 200, flexShrink: 0, background: 'var(--surface-panel)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '12px 8px', marginRight: 16, alignSelf: 'flex-start' }}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 10px 6px' }}>
                  {group.label}
                </div>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedFeature(item.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      border: 'none',
                      borderRadius: 6,
                      background: selectedFeature === item.id ? 'var(--surface-selected)' : 'transparent',
                      color: selectedFeature === item.id ? 'var(--text-heading)' : 'var(--text-default)',
                      fontSize: 13,
                      fontWeight: selectedFeature === item.id ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s, color 0.12s',
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ opacity: 0.7, flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* 右コンテンツ */}
          <main style={{ flex: 1, minWidth: 0, background: 'var(--surface-panel)', borderRadius: 10, padding: '20px 24px', border: '1px solid var(--border-default)' }}>
            {FEATURE_CONTENT[selectedFeature]}
          </main>

        </div>
      )}
    </div>
  );
};
