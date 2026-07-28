import type { ChangeEvent, FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { getMsg } from '@/messages/getMsg';
import shared from '@/styles/shared.module.css';
import styles from '../EventManagementPage.module.css';

interface EventListItemProps {
  eventName: string;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: (eventName: string) => void;
}

const EventListItem = ({ eventName, isSelected, isCurrent, onSelect }: EventListItemProps) => {
  const handleClick = () => onSelect(eventName);
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
    <button type="button" className={itemClassName} aria-label={ariaLabel} aria-pressed={isSelected} onClick={handleClick}>
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
  addName,
  onSelect,
  onAddNameChange,
  onCreate,
}: EventListPanelProps) => {
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
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      <div className={shared.managementListPanel__add}>
        <form onSubmit={handleSubmit} className={shared.managementListPanel__addRow}>
          <input type="text" className={shared.managementListPanel__addInput} placeholder={getMsg('EventManagementPage.addPlaceholder')} aria-label={getMsg('EventManagementPage.addPlaceholder')} value={addName} onChange={handleAddNameChange} />
          <button type="submit" className={`${shared.btnPrimary} ${shared.managementListPanel__addBtn}`} disabled={!addName.trim()} aria-label={getMsg('EventManagementPage.createAriaLabel')}><Plus size={14} /></button>
        </form>
      </div>
    </div>
  );
};
