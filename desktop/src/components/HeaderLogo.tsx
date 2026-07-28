// 表示領域と配色に応じた STARGAZER のヘッダーロゴ画像を描画する。

import React from 'react';
import styles from './HeaderLogo.module.css';

export const HeaderLogo: React.FC = () => {
  return (
    <div className={styles.headerLogo} data-header-logo>
      {/* サイドバー用フルロゴ */}
      <img src="/logo-white.png" alt="STARGAZER" className={`${styles.headerLogo__img} ${styles.headerLogo__imgDark} ${styles.headerLogo__imgFull}`} />
      <img src="/logo-black.png" alt="STARGAZER" className={`${styles.headerLogo__img} ${styles.headerLogo__imgLight} ${styles.headerLogo__imgFull}`} />
      {/* モバイルヘッダー用タイトルのみ */}
      <img src="/logo-mobile-white.png" alt="STARGAZER" className={`${styles.headerLogo__img} ${styles.headerLogo__imgDark} ${styles.headerLogo__imgMobile}`} />
      <img src="/logo-mobile-black.png" alt="STARGAZER" className={`${styles.headerLogo__img} ${styles.headerLogo__imgLight} ${styles.headerLogo__imgMobile}`} />
    </div>
  );
};
