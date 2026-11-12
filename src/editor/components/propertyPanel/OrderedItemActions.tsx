import type { ReactNode } from 'react';
import IconButton from '@/ui/button/IconButton.js';
import Icon from '@/ui/icon/Icon.js';

export default function OrderedItemActions({
  index,
  count,
  disabled,
  previousLabel,
  nextLabel,
  deleteLabel,
  previousDisabled = false,
  nextDisabled = false,
  deleteDisabled = false,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  disabled: boolean;
  previousLabel: string;
  nextLabel: string;
  deleteLabel?: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  deleteDisabled?: boolean;
  onMove(targetIndex: number): void;
  onDelete?(): void;
}): ReactNode {
  return (
    <>
      <IconButton
        size="sm"
        title={previousLabel}
        aria-label={previousLabel}
        disabled={disabled || index === 0 || previousDisabled}
        onClick={() => onMove(index - 1)}
      >
        <Icon name="arrow-left" size={14} />
      </IconButton>
      <IconButton
        size="sm"
        title={nextLabel}
        aria-label={nextLabel}
        disabled={disabled || index === count - 1 || nextDisabled}
        onClick={() => onMove(index + 1)}
      >
        <Icon name="arrow-right" size={14} />
      </IconButton>
      {onDelete && deleteLabel ? (
        <IconButton
          size="sm"
          variant="danger"
          title={deleteLabel}
          aria-label={deleteLabel}
          disabled={disabled || deleteDisabled}
          onClick={onDelete}
        >
          <Icon name="trash" size={14} />
        </IconButton>
      ) : null}
    </>
  );
}
