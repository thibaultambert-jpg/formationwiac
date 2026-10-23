import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="bg-brand-dark text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Logo className="h-7" />
        <p className="text-white/80">Espace formations</p>
      </div>
    </footer>
  );
}
