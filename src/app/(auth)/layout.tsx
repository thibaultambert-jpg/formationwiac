import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="contenu" className="bg-brand-dark flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center text-white">
          <Logo className="h-14" />
        </div>
        {children}
      </div>
    </main>
  );
}
