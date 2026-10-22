"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useActionFormState, useFieldError, useFieldValue } from "@/components/forms/action-form";

type BaseFieldProps = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextField({
  name,
  label,
  hint,
  required,
  className,
  defaultValue,
  ...inputProps
}: BaseFieldProps & { defaultValue?: string | number | null } & Omit<
    React.ComponentProps<"input">,
    "name" | "defaultValue"
  >) {
  const id = useId();
  const error = useFieldError(name);
  const value = useFieldValue(
    name,
    defaultValue === null || defaultValue === undefined ? undefined : String(defaultValue),
  );
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <Input
        id={id}
        name={name}
        required={required}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...inputProps}
      />
    </FieldShell>
  );
}

export function FileField({ name, label, hint, required, className, accept }: BaseFieldProps & { accept?: string }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <Input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </FieldShell>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  required,
  className,
  defaultValue,
  rows = 3,
}: BaseFieldProps & { defaultValue?: string | null; rows?: number }) {
  const id = useId();
  const error = useFieldError(name);
  const value = useFieldValue(name, defaultValue);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <Textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  required,
  className,
  defaultValue,
  options,
  placeholder,
}: BaseFieldProps & {
  defaultValue?: string | null;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  const value = useFieldValue(name, defaultValue) ?? "";
  // Keyed on the value so that an echoed value is applied after a failed submit.
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <NativeSelect
        key={value}
        id={id}
        name={name}
        required={required}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  className,
}: Omit<BaseFieldProps, "required"> & { defaultChecked?: boolean }) {
  const id = useId();
  const { state } = useActionFormState();
  const echoed =
    (state.status === "error" || state.status === "warning") && state.values ? name in state.values : undefined;
  const checked = echoed ?? defaultChecked;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <Checkbox key={String(checked)} id={id} name={name} defaultChecked={checked} className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}
