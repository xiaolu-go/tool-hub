import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface FieldProps {
  name: string;
  label: string;
  shortLabel?: string;
  value: string;
  onChange(value: string): void;
  unit?: string;
  hint?: string;
  error?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
}

export function Field({ name, label, shortLabel, value, onChange, unit, hint, error, inputMode = 'numeric' }: FieldProps) {
  return <div className={styles.field}>
    <label htmlFor={name}>{shortLabel ?? label}</label>
    <div className={`${styles.inputWrap} ${error ? styles.invalid : ''}`}>
      <input id={name} name={name} value={value} type="text" inputMode={inputMode} autoComplete="off" aria-label={shortLabel ? label : undefined}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        onChange={event => onChange(event.target.value)} />
      {unit && <span className={styles.unit}>{unit}</span>}
    </div>
    {error ? <span id={`${name}-error`} className={styles.error}>{error}</span>
      : hint && <span id={`${name}-hint`} className={styles.hint}>{hint}</span>}
  </div>;
}

export function SectionHeading({ number, title, children }: { number?: string; title: string; children?: ReactNode }) {
  return <div className={styles.sectionHeading}><div>{number && <span className={styles.sectionNumber}>{number}</span>}<h2>{title}</h2></div>{children}</div>;
}
