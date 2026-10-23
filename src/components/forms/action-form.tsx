"use client";

import { createContext, useActionState, useEffect, useRef, use } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IDLE, type ActionState } from "@/server/forms";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<{ state: ActionState; pending: boolean }>({ state: IDLE, pending: false });

export function useActionFormState() {
  return use(FormStateContext);
}

type ActionFormProps = {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (state: ActionState) => void;
  /** Hides the success message (e.g. when the dialog closes on success). */
  hideSuccess?: boolean;
  encType?: "multipart/form-data";
};

export function ActionForm({ action, children, className, onSuccess, hideSuccess, encType }: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const lastHandled = useRef<ActionState>(IDLE);

  useEffect(() => {
    if (state.status === "success" && lastHandled.current !== state) {
      lastHandled.current = state;
      onSuccess?.(state);
    }
  }, [state, onSuccess]);

  return (
    <FormStateContext value={{ state, pending }}>
      <form action={formAction} encType={encType} className={cn("space-y-4", className)} noValidate={false}>
        <FormFeedback hideSuccess={hideSuccess} />
        {children}
      </form>
    </FormStateContext>
  );
}

function FormFeedback({ hideSuccess }: { hideSuccess?: boolean }) {
  const { state, pending } = useActionFormState();

  if (state.status === "error" && state.message) {
    return (
      <Alert variant="destructive" aria-live="assertive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Enregistrement impossible</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  if (state.status === "warning") {
    return (
      <Alert variant="warning" aria-live="assertive">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>À vérifier avant de continuer</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <Button
            type="submit"
            name="confirm"
            value="1"
            size="sm"
            variant="outline"
            disabled={pending}
            className="mt-2"
          >
            Confirmer malgré tout
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === "success" && state.message && !hideSuccess) {
    return (
      <Alert variant="success" aria-live="polite">
        <CheckCircle2 aria-hidden="true" />
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return null;
}

/** Previously submitted value (after an error), falling back to the initial value. */
export function useFieldValue(name: string, fallback?: string | null): string | undefined {
  const { state } = useActionFormState();
  if ((state.status === "error" || state.status === "warning") && state.values && name in state.values) {
    return state.values[name];
  }
  return fallback ?? undefined;
}

export function useFieldError(name: string): string | undefined {
  const { state } = useActionFormState();
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

export function SubmitButton({
  children,
  className,
  variant,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  const { pending } = useActionFormState();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending ? "Enregistrement…" : children}
    </Button>
  );
}
