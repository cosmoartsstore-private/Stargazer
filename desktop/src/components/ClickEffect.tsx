import { useEffect, useCallback } from 'react';

export const ClickEffect: React.FC = () => {
  const spawn = useCallback((e: MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    const count = 10;

    for (let i = 0; i < count; i++) {
      const angle = (360 / count) * i + Math.random() * 25;
      const dist = 24 + Math.random() * 22;
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
        transition: transform 0.4s ease-out, opacity 0.4s ease-out;
      `;
      document.body.appendChild(shard);

      requestAnimationFrame(() => {
        const tx = Math.cos((angle * Math.PI) / 180) * dist;
        const ty = Math.sin((angle * Math.PI) / 180) * dist;
        shard.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${angle}deg) scale(0.15)`;
        shard.style.opacity = '0';
      });

      setTimeout(() => shard.remove(), 450);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('click', spawn);
    return () => document.removeEventListener('click', spawn);
  }, [spawn]);

  return null;
};
