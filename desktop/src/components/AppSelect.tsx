import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from '@/common/icons';
import styles from './AppSelect.module.css';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  /** フォームラベルと紐付ける id */
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 共通プルダウン。Radix Select ベースでデザイン・a11y を統一。
 */
export const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder = '選択してください',
  id,
  disabled = false,
  className = '',
}) => {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={`${styles.appSelect__trigger} ${className}`}
        aria-label={placeholder}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <span className={styles.appSelect__icon} aria-hidden>
            <ChevronDown size={16} />
          </span>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={typeof document !== 'undefined' ? document.querySelector('.app-container') as HTMLElement : undefined}>
        <SelectPrimitive.Content className={styles.appSelect__content} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className={styles.appSelect__viewport}>
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={styles.appSelect__item}
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
