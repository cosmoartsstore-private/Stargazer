import { useId, type AnimationEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { AppSelect } from '@/components/AppSelect';
import type { ColumnMapping } from '@/common/importFormat';
import { getMsg } from '@/messages/getMsg';
import {
  getSelectedImportColumnValue,
  type ImportColumnOption,
} from '../importPreviewModel';
import styles from '../ImportPage.module.css';
import shared from '@/styles/shared.module.css';

export type ImportColumnKey = 'name' | 'x_id' | 'vrc_url' | 'cast1' | 'cast2' | 'cast3';

interface MappingSelectProps {
  columnKey: ImportColumnKey;
  columnIndex: number;
  label: string;
  options: ImportColumnOption[];
  onChange: (key: ImportColumnKey, value: string) => void;
}

const MappingSelect: React.FC<MappingSelectProps> = ({ columnKey, columnIndex, label, options, onChange }) => {
  const handleValueChange = (value: string) => onChange(columnKey, value);

  return <AppSelect value={getSelectedImportColumnValue(columnIndex, options)} onValueChange={handleValueChange} options={options} placeholder={getMsg('ImportPage.selectColumn')} ariaLabel={label} />;
};

interface CastFormatButtonProps {
  inputType: ColumnMapping['castInputType'];
  selected: boolean;
  children: React.ReactNode;
  onSelect: (inputType: ColumnMapping['castInputType']) => void;
}

const CastFormatButton: React.FC<CastFormatButtonProps> = ({ inputType, selected, children, onSelect }) => {
  const handleClick = () => onSelect(inputType);
  const className = `${styles.importCastSegment}${selected ? ` ${styles.importCastSegmentSelected}` : ''}`;
  return <button type="button" className={className} aria-pressed={selected} onClick={handleClick}>{children}</button>;
};

interface ImportMappingPanelProps {
  open: boolean;
  mapping: ColumnMapping;
  columnOptions: ImportColumnOption[];
  hasSourceRows: boolean;
  xIdShake: boolean;
  onOpenChange: (open: boolean) => void;
  onColumnChange: (key: ImportColumnKey, value: string) => void;
  onCastInputTypeChange: (inputType: ColumnMapping['castInputType']) => void;
  onXIdAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
}

/** TSVの各列を応募者項目へ割り当てる操作だけを表示する。 */
export const ImportMappingPanel: React.FC<ImportMappingPanelProps> = ({
  open,
  mapping,
  columnOptions,
  hasSourceRows,
  xIdShake,
  onOpenChange,
  onColumnChange,
  onCastInputTypeChange,
  onXIdAnimationEnd,
}) => {
  const contentId = useId();
  const xIdMappingClassName = `${styles.importMappingRow}${xIdShake ? ` ${shared.shake}` : ''}`;
  const chevronClassName = `${styles.importDisclosureChevron}${open ? ` ${styles.importDisclosureChevronOpen}` : ''}`;
  const handleToggle = () => onOpenChange(!open);

  return (
    <div className={styles.importMappingSection}>
      <div className={styles.importSectionHeader}>
        <button type="button" className={styles.importDisclosureToggle} aria-expanded={open} aria-controls={contentId} onClick={handleToggle}>
          <ChevronDown size={14} className={chevronClassName} aria-hidden="true" />
          <span>{getMsg('ImportPage.mappingSettings')}</span>
        </button>
      </div>

      <div id={contentId} className={styles.importMappingTable} hidden={!open}>
        <div className={styles.importMappingRow}>
          <span className={styles.importMappingLabel}>{getMsg('ImportPage.userNameLabel')}</span>
          <div className={styles.importMappingControl}><MappingSelect columnKey="name" columnIndex={mapping.name} label={getMsg('ImportPage.userNameLabel')} options={columnOptions} onChange={onColumnChange} /></div>
        </div>

        <div className={xIdMappingClassName} onAnimationEnd={onXIdAnimationEnd}>
          <span className={styles.importMappingLabel}>{getMsg('ImportPage.xIdLabel')} <span className={styles.importRequired}>*</span></span>
          <div className={styles.importMappingControl}>
            <MappingSelect columnKey="x_id" columnIndex={mapping.x_id} label={getMsg('ImportPage.xIdLabel')} options={columnOptions} onChange={onColumnChange} />
            {hasSourceRows && mapping.x_id < 0 && <span className={styles.importMappingError}>{getMsg('ImportPage.xIdColumnNotDetected')}</span>}
          </div>
        </div>

        <div className={styles.importMappingRow}>
          <span className={styles.importMappingLabel}>{getMsg('ImportPage.vrchatLinkLabel')}</span>
          <div className={styles.importMappingControl}><MappingSelect columnKey="vrc_url" columnIndex={mapping.vrc_url} label={getMsg('ImportPage.vrchatLinkLabel')} options={columnOptions} onChange={onColumnChange} /></div>
        </div>

        <div className={styles.importCastMappingSlot}>
          {mapping.castInputType === 'single' ? (
            /* 希望順位ごとに個別の列を割り当てる。 */
            <>
              <div className={styles.importMappingRow}>
                <span className={styles.importMappingLabel}>{getMsg('ImportPage.preferredCastColumn', { rank: 1 })}</span>
                <div className={styles.importMappingControl}><MappingSelect columnKey="cast1" columnIndex={mapping.cast1} label={getMsg('ImportPage.preferredCastColumn', { rank: 1 })} options={columnOptions} onChange={onColumnChange} /></div>
              </div>
              <div className={styles.importMappingRow}>
                <span className={styles.importMappingLabel}>{getMsg('ImportPage.preferredCastColumn', { rank: 2 })}</span>
                <div className={styles.importMappingControl}><MappingSelect columnKey="cast2" columnIndex={mapping.cast2} label={getMsg('ImportPage.preferredCastColumn', { rank: 2 })} options={columnOptions} onChange={onColumnChange} /></div>
              </div>
              <div className={styles.importMappingRow}>
                <span className={styles.importMappingLabel}>{getMsg('ImportPage.preferredCastColumn', { rank: 3 })}</span>
                <div className={styles.importMappingControl}><MappingSelect columnKey="cast3" columnIndex={mapping.cast3} label={getMsg('ImportPage.preferredCastColumn', { rank: 3 })} options={columnOptions} onChange={onColumnChange} /></div>
              </div>
            </>
          ) : (
            /* すべての希望キャストを含む1列を割り当てる。 */
            <div className={styles.importMappingRow}>
              <span className={styles.importMappingLabel}>{getMsg('ImportPage.preferredCasts')}</span>
              <div className={styles.importMappingControl}><MappingSelect columnKey="cast1" columnIndex={mapping.cast1} label={getMsg('ImportPage.preferredCasts')} options={columnOptions} onChange={onColumnChange} /></div>
            </div>
          )}
        </div>

        <div className={styles.importCastFormatRow}>
          <span className={styles.importCastFormatLabel}>{getMsg('ImportPage.castFormatLabel')}</span>
          <div className={styles.importCastSegmented} role="group" aria-label={getMsg('ImportPage.castFormatAriaLabel')}>
            <CastFormatButton inputType="single" selected={mapping.castInputType === 'single'} onSelect={onCastInputTypeChange}>{getMsg('ImportPage.rankedColumns')}</CastFormatButton>
            <CastFormatButton inputType="multiple" selected={mapping.castInputType === 'multiple'} onSelect={onCastInputTypeChange}>{getMsg('ImportPage.unrankedCommaSeparated')}</CastFormatButton>
          </div>
        </div>
      </div>
    </div>
  );
};
