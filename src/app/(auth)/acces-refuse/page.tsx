import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Accès refusé" };

function messageFor(reason: string | undefined, error: string | undefined, domain: string): string {
  if (reason === "domaine") {
    return `Seuls les comptes Google du domaine @${domain} peuvent se connecter. Reconnectez-vous avec votre compte professionnel.`;
  }
  if (reason === "inactif") {
    return "Votre compte a été désactivé. Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.";
  }
  if (error === "AccessDenied") {
    return "La connexion a été refusée.";
  }
  return "La connexion a échoué. Réessayez ou contactez un administrateur si le problème persiste.";
}

export default async function AccessDeniedPage({ searchParams }: PageProps<"/acces-refuse">) {
  const { raison, error } = await searchParams;
  const { ALLOWED_GOOGLE_DOMAIN } = getEnv();
  const message = messageFor(
    typeof raison === "string" ? raison : undefined,
    typeof error === "string" ? error : undefined,
    ALLOWED_GOOGLE_DOMAIN,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Accès refusé</h1>
        </CardTitle>
        <CardDescription role="alert">{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/connexion">Retour à la connexion</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
