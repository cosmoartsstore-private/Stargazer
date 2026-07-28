// Radix Select を基盤に、統一された選択肢入力とポータル表示を提供する。

import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import styles from './AppSelect.module.css';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectBaseProps {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

type AppSelectAccessibleName =
  | { ariaLabel: string; ariaLabelledBy?: never }
  | { ariaLabel?: never; ariaLabelledBy: string };

type AppSelectProps = AppSelectBaseProps & AppSelectAccessibleName;

/**
 * 共通プルダウン。Radix Select ベースでデザイン・a11y を統一。
 */
export const AppSelect: React.FC<AppSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder = getMsg('common.selectPlease'),
  id,
  disabled = false,
  className = '',
  ariaLabel,
  ariaLabelledBy,
}) => {
  // モーダル内でも前面へ表示できるポータル配置先を選ぶ。
  const portalContainer =
    typeof document !== 'undefined'
      ? document.getElementById('modal-root') ?? document.getElementById('root') ?? undefined
      : undefined;

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger id={id} className={`${styles.appSelect__trigger} ${className}`} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <span className={styles.appSelect__icon} aria-hidden><ChevronDown size={16} /></span>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={portalContainer}>
        <SelectPrimitive.Content className={styles.appSelect__content} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className={styles.appSelect__viewport}>
            {options.map((opt) => (
              <SelectPrimitive.Item key={opt.value} value={opt.value} className={styles.appSelect__item}>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
