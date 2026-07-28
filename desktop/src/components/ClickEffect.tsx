// クリック位置から装飾用の破片を生成し、短時間の拡散アニメーションを表示する。

import { useEffect, useCallback } from 'react';

// 破片数と移動距離は、クリック位置が分かりつつ操作を遮らない範囲に固定する。
const SHARD_COUNT = 10;
const MIN_SHARD_DISTANCE_PX = 24;
const SHARD_DISTANCE_VARIANCE_PX = 22;
const SHARD_ANGLE_VARIANCE_DEG = 25;
const SHARD_TRANSITION_MS = 400;
const SHARD_REMOVAL_DELAY_MS = 450;

export const ClickEffect: React.FC = () => {
  const spawn = useCallback((e: MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    for (let i = 0; i < SHARD_COUNT; i++) {
      const angle = (360 / SHARD_COUNT) * i + Math.random() * SHARD_ANGLE_VARIANCE_DEG;
      const dist = MIN_SHARD_DISTANCE_PX + Math.random() * SHARD_DISTANCE_VARIANCE_PX;
      const shard = document.createElement('div');
      shard.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 6px;
        height: 10px;
        pointer-events: none;
        z-index: 99999;
        background: hsl(${200 + Math.random() * 60}, 75%, 68%);
        clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
        box-shadow: 0 0 4px hsl(${220 + Math.random() * 40}, 80%, 65%);
        transform: translate(-50%, -50%) rotate(45deg) scale(1);
        opacity: 1;
        transition: transform ${SHARD_TRANSITION_MS}ms ease-out, opacity ${SHARD_TRANSITION_MS}ms ease-out;
      `;
      document.body.appendChild(shard);

      requestAnimationFrame(() => {
        const tx = Math.cos((angle * Math.PI) / 180) * dist;
        const ty = Math.sin((angle * Math.PI) / 180) * dist;
        shard.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${angle}deg) scale(0.15)`;
        shard.style.opacity = '0';
      });

      setTimeout(() => shard.remove(), SHARD_REMOVAL_DELAY_MS);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('click', spawn);
    return () => document.removeEventListener('click', spawn);
  }, [spawn]);

  return null;
};
