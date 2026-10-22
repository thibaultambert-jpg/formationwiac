"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldError } from "@/components/forms/action-form";
import type { SearchOption } from "@/server/search";

type SearchPickerProps = {
  /** Name of the hidden input holding the selected id. */
  name: string;
  label: string;
  search: (q: string) => Promise<SearchOption[]>;
  initial?: SearchOption | null;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  onChange?: (option: SearchOption | null) => void;
  /** Extra content shown under the results (e.g. "create a new company"). */
  footer?: (query: string) => React.ReactNode;
};

export function SearchPicker({
  name,
  label,
  search,
  initial = null,
  placeholder,
  hint,
  required,
  onChange,
  footer,
}: SearchPickerProps) {
  const id = useId();
  const error = useFieldError(name);
  const [selected, setSelected] = useState<SearchOption | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchOption[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);
  // Callers may pass an inline function: keep the latest one without re-running the search.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (selected) return;
    const requestId = ++latest.current;
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      startTransition(async () => {
        const options = await searchRef.current(query);
        if (requestId === latest.current) {
          setResults(options);
          setSearched(true);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  function choose(option: SearchOption | null) {
    setSelected(option);
    onChange?.(option);
    if (!option) {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <div className="min-w-0 text-sm">
            <p className="font-medium">{selected.label}</p>
            {selected.description ? <p className="text-muted-foreground truncate">{selected.description}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)}>
            <X aria-hidden="true" />
            Changer
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search aria-hidden="true" className="text-muted-foreground absolute top-2.5 left-3 size-4" />
            <Input
              id={id}
              type="search"
              value={query}
              autoComplete="off"
              placeholder={placeholder ?? "Tapez au moins 2 caractères"}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter must not submit the surrounding form while searching.
                if (event.key === "Enter") event.preventDefault();
              }}
              className="pl-9"
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-status`}
            />
          </div>
          <p id={`${id}-status`} className="sr-only" aria-live="polite">
            {pending ? "Recherche en cours" : searched ? `${results.length} résultat(s)` : ""}
          </p>
          {results.length > 0 ? (
            <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">
              {results.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="hover:bg-accent focus-visible:bg-accent w-full px-3 py-2 text-left text-sm outline-none"
                    onClick={() => choose(option)}
                  >
                    <span className="font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="text-muted-foreground block truncate">{option.description}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : searched && !pending ? (
            <p className="text-muted-foreground text-sm">Aucun résultat.</p>
          ) : null}
          {footer ? footer(query) : null}
        </>
      )}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
