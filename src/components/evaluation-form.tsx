"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton, useFieldError, useFieldValue } from "@/components/forms/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/server/forms";
import { submitEvaluation } from "@/app/(public)/actions";

export type FormQuestion = {
  id: string;
  label: string;
  answerType: "scale_1_5" | "scale_0_10" | "single_choice" | "choice_with_other" | "text";
  options: string[] | null;
  required: boolean;
};

function Choices({ question, values, hints }: { question: FormQuestion; values: string[]; hints?: [string, string] }) {
  const error = useFieldError(question.id);
  // Answers are echoed back when the submission is refused.
  const selected = useFieldValue(question.id);
  const other = useFieldValue(`${question.id}.other`);
  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${question.id}-error` : undefined}>
      <legend className="text-sm font-medium">
        {question.label}
        {question.required ? <span className="text-destructive"> *</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <label
            key={value}
            className="has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring flex min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-2"
          >
            <input
              key={`${value}-${selected === value}`}
              type="radio"
              name={question.id}
              value={value}
              defaultChecked={selected === value}
              required={question.required}
              className="sr-only"
            />
            {value}
          </label>
        ))}
      </div>
      {hints ? (
        <p className="text-muted-foreground flex justify-between text-xs">
          <span>{hints[0]}</span>
          <span>{hints[1]}</span>
        </p>
      ) : null}
      {question.answerType === "choice_with_other" ? (
        <Input
          name={`${question.id}.other`}
          defaultValue={other}
          placeholder="Précisez si besoin"
          aria-label={`Précision : ${question.label}`}
        />
      ) : null}
      {error ? (
        <p id={`${question.id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function EvaluationForm({ token, questions }: { token: string; questions: FormQuestion[] }) {
  const [done, setDone] = useState<string | null>(null);
  if (done) {
    return (
      <p
        className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" className="size-5" />
        {done}
      </p>
    );
  }
  return (
    <ActionForm
      action={submitEvaluation}
      hideSuccess
      onSuccess={(state: ActionState) => setDone(state.status === "success" ? (state.message ?? "Merci !") : null)}
      className="space-y-6"
    >
      <input type="hidden" name="token" value={token} />
      {questions.map((question) =>
        question.answerType === "scale_1_5" ? (
          <Choices
            key={question.id}
            question={question}
            values={["1", "2", "3", "4", "5"]}
            hints={["1 : pas du tout satisfait", "5 : très satisfait"]}
          />
        ) : question.answerType === "scale_0_10" ? (
          <Choices
            key={question.id}
            question={question}
            values={Array.from({ length: 11 }, (_, index) => String(index))}
            hints={["0 : pas du tout", "10 : certainement"]}
          />
        ) : question.answerType === "text" ? (
          <div key={question.id} className="space-y-1.5">
            <label htmlFor={`q-${question.id}`} className="text-sm font-medium">
              {question.label}
            </label>
            <TextAnswer question={question} />
          </div>
        ) : (
          <Choices key={question.id} question={question} values={question.options ?? []} />
        ),
      )}
      <SubmitButton>Envoyer mes réponses</SubmitButton>
    </ActionForm>
  );
}

function TextAnswer({ question }: { question: FormQuestion }) {
  return (
    <Textarea
      id={`q-${question.id}`}
      name={question.id}
      rows={3}
      required={question.required}
      defaultValue={useFieldValue(question.id)}
    />
  );
}
