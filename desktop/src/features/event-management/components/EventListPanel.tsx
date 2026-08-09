import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import { EVENT_NAME_MAX_LENGTH } from '../eventNameValidation';
import shared from '@/styles/shared.module.css';
import styles from '../EventManagementPage.module.css';

interface EventListItemProps {
  eventName: string;
  isSelected: boolean;
  isCurrent: boolean;
  isDisabled: boolean;
  onSelect: (eventName: string) => void;
}

const EventListItem = ({ eventName, isSelected, isCurrent, isDisabled, onSelect }: EventListItemProps) => {
  const handleClick = () => onSelect(eventName);
  // 編集欄からのクリックではblur保存より先に選択要求を受け、Page側の明示commitへ委ねる。
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (!isDisabled) event.preventDefault();
  };
  const itemClassName = `${shared.managementListItem} ${
    isSelected ? shared.managementListItemSelected : ''
  }`;
  const statusClassName = `${styles.eventListStatusDot} ${
    isCurrent ? styles.eventListStatusDotPresent : styles.eventListStatusDotAbsent
  }`;
  const ariaLabel = isCurrent
    ? getMsg('EventManagementPage.currentEventAriaLabel', { eventName })
    : eventName;

  return (
    <button type="button" className={itemClassName} aria-label={ariaLabel} aria-pressed={isSelected} disabled={isDisabled} onMouseDown={handleMouseDown} onClick={handleClick}>
      <span className={statusClassName} aria-hidden />
      <span className={`${shared.managementListItem__info} ${shared.managementListItem__name}`}>{eventName}</span>
    </button>
  );
};

export interface EventListPanelProps {
  events: string[];
  selectedName: string | null;
  currentEventName: string | null;
  isLoading: boolean;
  isMutating: boolean;
  addName: string;
  onSelect: (eventName: string) => void;
  onAddNameChange: (value: string) => void;
  onCreate: () => void | Promise<void>;
}

export const EventListPanel = ({
  events,
  selectedName,
  currentEventName,
  isLoading,
  isMutating,
  addName,
  onSelect,
  onAddNameChange,
  onCreate,
}: EventListPanelProps) => {
  const isInteractionDisabled = isLoading || isMutating;
  const handleAddNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAddNameChange(event.currentTarget.value);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCreate();
  };

  return (
    <div className={shared.managementListPanel}>
      <div className={shared.managementListPanel__items}>
        {isLoading ? (
          <div className={shared.managementListPanel__empty}>{getMsg('EventManagementPage.loading')}</div>
        ) : events.length === 0 ? (
          <div className={shared.managementListPanel__empty}>{getMsg('EventManagementPage.noEvents')}</div>
        ) : (
          events.map((eventName) => (
            <EventListItem
              key={eventName}
              eventName={eventName}
              isSelected={eventName === selectedName}
              isCurrent={eventName === currentEventName}
              isDisabled={isInteractionDisabled}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      <div className={shared.managementListPanel__add}>
        <form onSubmit={handleSubmit} className={shared.managementListPanel__addRow}>
          <input type="text" className={shared.managementListPanel__addInput} placeholder={getMsg('EventManagementPage.addPlaceholder')} aria-label={getMsg('EventManagementPage.addPlaceholder')} value={addName} maxLength={EVENT_NAME_MAX_LENGTH} disabled={isInteractionDisabled} onChange={handleAddNameChange} />
          <button type="submit" className={`${shared.btnPrimary} ${shared.managementListPanel__addBtn}`} disabled={isInteractionDisabled || !addName.trim()} aria-label={getMsg('EventManagementPage.createAriaLabel')}><Plus size={14} /></button>
        </form>
      </div>
    </div>
  );
};
