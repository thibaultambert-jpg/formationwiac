/** Parses French-formatted decimals ("1 200,50", "7.5"). Returns null for empty input, NaN when invalid. */
export function parseFrenchDecimal(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const normalized = value.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

const euroFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const decimalFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function formatEuros(value: number | { toString(): string } | null): string {
  if (value === null) return "—";
  return euroFormatter.format(Number(value.toString()));
}

export function formatDecimal(value: number | { toString(): string }): string {
  return decimalFormatter.format(Number(value.toString()));
}

/** Value for a form input, with a decimal comma. */
export function decimalInput(value: number | { toString(): string } | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.toString().replace(".", ",");
}
