import { useRef, useState } from 'react';

interface TemplateNameEditorProps {
  value: string;
  onCommit(name: string): void;
  onCancel(): void;
}

export default function TemplateNameEditor({ value, onCommit, onCancel }: TemplateNameEditorProps) {
  const [draft, setDraft] = useState(value);
  const cancelledRef = useRef(false);

  return (
    <input
      className="layoutpdf-template-name"
      type="text"
      value={draft}
      onChange={event => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          onCancel();
          return;
        }
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) {
          onCommit(trimmed);
        }
        onCancel();
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          cancelledRef.current = true;
          onCancel();
        }
      }}
      autoFocus
    />
  );
}