import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export type FilterField =
  | { type: "search"; name: string; label: string; value: string; placeholder?: string }
  | {
      type: "select";
      name: string;
      label: string;
      value: string;
      options: { value: string; label: string }[];
      allLabel?: string;
    }
  | { type: "date"; name: string; label: string; value: string };

/** GET form: filters live in the URL so that lists can be shared and exported. */
export function FilterBar({
  fields,
  resetHref,
  hidden,
}: {
  fields: FilterField[];
  resetHref: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form role="search" className="mb-6 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => {
        const id = `filter-${field.name}`;
        return (
          <div
            key={field.name}
            className={field.type === "search" ? "flex-1 space-y-1.5 md:min-w-56" : "space-y-1.5 md:w-48"}
          >
            <Label htmlFor={id}>{field.label}</Label>
            {field.type === "select" ? (
              <NativeSelect id={id} name={field.name} defaultValue={field.value}>
                <option value="">{field.allLabel ?? "Tous"}</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={id}
                name={field.name}
                type={field.type === "date" ? "date" : "search"}
                defaultValue={field.value}
                placeholder={field.type === "search" ? field.placeholder : undefined}
              />
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
        <Button asChild variant="ghost">
          <a href={resetHref}>Réinitialiser</a>
        </Button>
      </div>
    </form>
  );
}

export function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
