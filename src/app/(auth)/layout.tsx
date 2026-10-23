export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="contenu" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
