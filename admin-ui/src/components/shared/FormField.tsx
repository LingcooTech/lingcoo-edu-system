import type { ReactNode } from 'react';

/**
 * Labeled wrapper for a single form control. Pairs with the `.form-input` class
 * for the actual <input>/<select>/<textarea>. Keeps create/edit forms terse:
 *
 *   <Field label="课程名称" required>
 *     <input className="form-input" value={...} onChange={...} />
 *   </Field>
 */
export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-3.5 block">
      <span className="form-label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="form-hint">{hint}</span>
      ) : null}
    </label>
  );
}

/** Two-column grid for grouping short fields side by side inside a Drawer. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
