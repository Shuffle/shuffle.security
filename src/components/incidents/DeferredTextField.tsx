import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TextField, TextFieldProps } from '@mui/material';
import { MentionInput, MentionInputHandle } from '@/components/incidents/MentionInput';

/**
 * Text inputs that keep their own draft state while the user types and only
 * push the value upwards on blur. Used on the incident pages where every
 * keystroke otherwise re-renders the whole (very large) page and feels laggy.
 */

type DeferredTextFieldProps = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DeferredTextField = ({ value, onCommit, onFocus, onBlur, ...props }: DeferredTextFieldProps) => {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  // Accept external updates (reloads, resyncs) only while not being edited.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <TextField
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focused.current = false;
        if (draft !== value) onCommit(draft);
        onBlur?.(event);
      }}
    />
  );
};

type DeferredMentionInputProps = Omit<TextFieldProps, 'value' | 'onChange' | 'onSubmit' | 'ref'> & {
  value: string;
  onCommit: (value: string) => void;
};


export const DeferredMentionInput = ({ value, onCommit, onBlur, ...props }: DeferredMentionInputProps) => {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  return (
    <MentionInput
      {...props}
      value={draft}
      onChange={(next) => {
        dirty.current = true;
        setDraft(next);
      }}
      onBlur={(event) => {
        dirty.current = false;
        if (draft !== value) onCommit(draft);
        onBlur?.(event);
      }}
    />
  );
};

export interface DebouncedMentionInputHandle {
  submit: () => void;
  clear: () => void;
  getValue: () => string;
  focus: () => void;
}

export type DebouncedMentionInputProps = Omit<TextFieldProps, 'value' | 'onChange' | 'onSubmit'> & {
  value: string;
  onChangeDebounced: (value: string) => void;
  onSubmitValue?: (value: string) => void;
  delay?: number;
};

/**
 * Mention input that keeps typing local and pushes the value upwards on a
 * short debounce, so draft saving / send buttons still work without
 * re-rendering the whole page on every keystroke.
 */
export const DebouncedMentionInput = forwardRef<DebouncedMentionInputHandle, DebouncedMentionInputProps>(({
  value,
  onChangeDebounced,
  onSubmitValue,
  delay = 250,
  onBlur,
  ...props
}, ref) => {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionInputRef = useRef<MentionInputHandle>(null);

  // If value is explicitly cleared by parent (e.g. comment sent or reset), immediately reset draft
  useEffect(() => {
    if (value === '') {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      dirty.current = false;
      draftRef.current = '';
      setDraft('');
      return;
    }
    if (!dirty.current && value !== draftRef.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const doClear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dirty.current = false;
    draftRef.current = '';
    setDraft('');
    onChangeDebounced('');
  };

  const doSubmit = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dirty.current = false;
    const submittedText = draftRef.current;
    draftRef.current = '';
    setDraft('');
    onChangeDebounced('');
    onSubmitValue?.(submittedText);
  };

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dirty.current = false;
    if (draftRef.current !== value) onChangeDebounced(draftRef.current);
  };

  useImperativeHandle(ref, () => ({
    submit: doSubmit,
    clear: doClear,
    getValue: () => draftRef.current,
    focus: () => {
      mentionInputRef.current?.focus();
    },
  }));

  return (
    <MentionInput
      ref={mentionInputRef}
      {...props}
      value={draft}
      onChange={(next) => {
        dirty.current = true;
        draftRef.current = next;
        setDraft(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          dirty.current = false;
          onChangeDebounced(draftRef.current);
        }, delay);
      }}
      onSubmit={doSubmit}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
});
DebouncedMentionInput.displayName = 'DebouncedMentionInput';
