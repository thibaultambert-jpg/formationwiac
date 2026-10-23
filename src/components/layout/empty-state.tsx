export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">{children}</p>;
}
