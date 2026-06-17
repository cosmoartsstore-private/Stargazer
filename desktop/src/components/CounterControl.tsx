import React, { useCallback } from 'react';
import styles from './CounterControl.module.css';

interface CounterControlProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

function clampCounterValue(value: number, min?: number, max?: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : (min ?? 0);
  const aboveMin = min === undefined ? normalized : Math.max(min, normalized);
  return max === undefined ? aboveMin : Math.min(max, aboveMin);
}

export const CounterControl: React.FC<CounterControlProps> = ({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  disabled = false,
  className,
}) => {
  const normalizedValue = clampCounterValue(value, min, max);
  const setNextValue = useCallback((nextValue: number) => {
    onChange(clampCounterValue(nextValue, min, max));
  }, [max, min, onChange]);

  const decrement = useCallback(() => {
    if (disabled) return;
    setNextValue(normalizedValue - step);
  }, [disabled, normalizedValue, setNextValue, step]);

  const increment = useCallback(() => {
    if (disabled) return;
    setNextValue(normalizedValue + step);
  }, [disabled, normalizedValue, setNextValue, step]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      increment();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      decrement();
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      setNextValue(normalizedValue + step * 10);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      setNextValue(normalizedValue - step * 10);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setNextValue(normalizedValue + (event.deltaY < 0 ? step : -step));
  };

  const rootClassName = [
    styles.counterControl,
    disabled ? styles.counterControlDisabled : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} onKeyDown={handleKeyDown} onWheel={handleWheel}>
      <button
        type="button"
        className={styles.counterButton}
        onClick={decrement}
        disabled={disabled || (min !== undefined && normalizedValue <= min)}
        aria-label={`${label}を減らす`}
      >
        -
      </button>
      <div
        className={styles.counterValue}
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={normalizedValue}
        aria-valuemin={min}
        aria-valuemax={max}
        title="矢印キーまたはマウスホイールで増減"
      >
        {normalizedValue}
      </div>
      <button
        type="button"
        className={styles.counterButton}
        onClick={increment}
        disabled={disabled || (max !== undefined && normalizedValue >= max)}
        aria-label={`${label}を増やす`}
      >
        +
      </button>
    </div>
  );
};
