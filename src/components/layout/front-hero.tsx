import { cn } from "@/lib/utils";

/**
 * Full-width violet band under the header (wiacademy.fr page heroes): a
 * turquoise eyebrow, a large white title with an optional turquoise highlight
 * and a short description. Rendered as the first child of a front page.
 */
export function FrontHero({
  eyebrow,
  title,
  highlight,
  description,
  before,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  /** Rendered above the title (back link, category badge). */
  before?: React.ReactNode;
  title: string;
  highlight?: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-primary mx-[calc(50%-50vw)] -mt-8 mb-10 pt-14 pb-14 text-white", className)}>
      <div className="mx-auto max-w-6xl space-y-4 px-4">
        {before}
        {eyebrow ? (
          <p className="text-brand-teal flex items-center gap-3 text-xs font-semibold tracking-[0.2em] uppercase">
            <span aria-hidden="true" className="bg-brand-teal h-0.5 w-7 rounded-full" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">
          {title}
          {highlight ? <span className="text-brand-teal"> {highlight}</span> : null}
        </h1>
        {description ? <div className="max-w-3xl text-white/85">{description}</div> : null}
        {children}
      </div>
    </section>
  );
}
