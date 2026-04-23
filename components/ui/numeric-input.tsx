"use client";

import { useState, useEffect, useRef } from 'react';
import { Input } from './input';

interface NumericInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  /** Format the number for display, e.g. v => v.toFixed(1) */
  format?: (v: number) => string;
  /** Parse the string to a number, e.g. parseInt or parseFloat */
  parse?: (s: string) => number;
}

/**
 * A number input that keeps a local draft string while typing.
 * On blur: if the parsed value is valid (within [min,max] and not NaN),
 * it commits and calls onChange. Otherwise it reverts to the last good value.
 * External value changes (e.g. selecting a different element) are synced
 * automatically, but only when the input is not focused.
 */
export function NumericInput({
  value,
  min = -Infinity,
  max = Infinity,
  step,
  onChange,
  className,
  placeholder,
  format = String,
  parse = parseFloat,
}: NumericInputProps) {
  const [draft, setDraft] = useState(format(value));
  const committed = useRef(value);
  const isFocused = useRef(false);

  // Sync display when the external value changes (e.g. different node selected),
  // but don't interrupt the user while they are actively typing.
  useEffect(() => {
    if (!isFocused.current) {
      setDraft(format(value));
      committed.current = value;
    }
  }, [value, format]);

  function handleBlur() {
    isFocused.current = false;
    const parsed = parse(draft);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      // Invalid — revert to last committed value
      setDraft(format(committed.current));
    } else {
      const clamped = Math.min(max, Math.max(min, parsed));
      committed.current = clamped;
      setDraft(format(clamped));
      if (clamped !== value) onChange(clamped);
    }
  }

  return (
    <Input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={className}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => { isFocused.current = true; }}
      onBlur={handleBlur}
    />
  );
}
