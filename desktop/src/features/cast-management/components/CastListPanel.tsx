import type { ChangeEvent, KeyboardEvent } from 'react';
import { Search, UserPlus } from 'lucide-react';
import type { CastBean } from '@/common/types/entities';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../CastManagementPage.module.css';
import { filterCasts } from '../castManagementModel';

interface CastListItemProps {
  cast: CastBean;
  isSelected: boolean;
  onSelect: (castId: number) => void;
}

const CastListItem = ({ cast, isSelected, onSelect }: CastListItemProps) => {
  const handleClick = () => onSelect(cast.id);
  const className = `${shared.managementListItem}${
    isSelected ? ` ${shared.managementListItemSelected}` : ''
  }`;

  return (
    <button type="button" className={className} aria-pressed={isSelected} onClick={handleClick}>
      <span className={shared.managementListItem__info}>
        <span className={`${shared.managementListItem__name} ${styles.castListItemName}`}>{cast.name}</span>
        {cast.group_name && <span className={styles.castListItemGroup}>{cast.group_name}</span>}
      </span>
    </button>
  );
};

export interface CastListPanelProps {
  casts: CastBean[];
  selectedCastId: number | null;
  searchQuery: string;
  inputCastName: string;
  onSearchQueryChange: (value: string) => void;
  onInputCastNameChange: (value: string) => void;
  onAddCast: () => void | Promise<void>;
  onSelectCast: (castId: number) => void;
}

export const CastListPanel = ({
  casts,
  selectedCastId,
  searchQuery,
  inputCastName,
  onSearchQueryChange,
  onInputCastNameChange,
  onAddCast,
  onSelectCast,
}: CastListPanelProps) => {
  const filteredCasts = filterCasts(casts, searchQuery);

  const handleSearchQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange(event.currentTarget.value);
  };
  const handleInputCastNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onInputCastNameChange(event.currentTarget.value);
  };
  const handleAddCastKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void onAddCast();
  };
  const handleAddCastClick = () => { void onAddCast(); };

  return (
    <div className={`${shared.managementListPanel} ${styles.castPanelHeight}`}>
      <div className={shared.managementListPanel__search}>
        <Search size={14} className={shared.managementListPanel__searchIcon} />
        <input type="search" className={shared.managementListPanel__searchInput} placeholder={getMsg('common.searchPlaceholder')} aria-label={getMsg('common.searchPlaceholder')} value={searchQuery} onChange={handleSearchQueryChange} />
      </div>

      <div className={`${shared.managementListPanel__items} ${shared.customScrollbar}`}>
        {filteredCasts.length === 0 ? (
          <div className={shared.managementListPanel__empty}>{getMsg('CastManagementPage.noCasts')}</div>
        ) : (
          filteredCasts.map((cast) => (
            <CastListItem key={cast.id} cast={cast} isSelected={cast.id === selectedCastId} onSelect={onSelectCast} />
          ))
        )}
      </div>

      <div className={shared.managementListPanel__add}>
        <div className={shared.managementListPanel__addRow}>
          <input type="text" className={shared.managementListPanel__addInput} placeholder={getMsg('CastManagementPage.addCastPlaceholder')} aria-label={getMsg('CastManagementPage.addCastPlaceholder')} value={inputCastName} onChange={handleInputCastNameChange} onKeyDown={handleAddCastKeyDown} />
          <button type="button" className={`${shared.btnSuccess} ${shared.managementListPanel__addBtn}`} onClick={handleAddCastClick} aria-label={getMsg('CastManagementPage.addCastAriaLabel')}><UserPlus size={14} /></button>
        </div>
      </div>
    </div>
  );
};
