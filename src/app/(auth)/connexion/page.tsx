import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { signInWithGoogle } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const { callbackUrl } = await searchParams;
  const target = typeof callbackUrl === "string" ? callbackUrl : "/";

  if (await getCurrentUser()) redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/");

  const { ALLOWED_GOOGLE_DOMAIN } = getEnv();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Connexion</h1>
        </CardTitle>
        <CardDescription>
          Connectez-vous avec votre compte Google professionnel @{ALLOWED_GOOGLE_DOMAIN}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signInWithGoogle}>
          <input type="hidden" name="callbackUrl" value={target} />
          <Button type="submit" size="lg" className="w-full">
            Se connecter avec Google
          </Button>
        </form>
        <p className="text-muted-foreground mt-4 text-xs">
          <Link href="/confidentialite" className="underline underline-offset-4">
            Confidentialité
          </Link>{" "}
          ·{" "}
          <Link href="/mentions-legales" className="underline underline-offset-4">
            Mentions légales
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
