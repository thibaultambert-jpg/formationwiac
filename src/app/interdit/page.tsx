import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Accès interdit" };

export default function ForbiddenPage() {
  return (
    <main id="contenu" className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Accès interdit</h1>
          </CardTitle>
          <CardDescription>Vous n&apos;avez pas les droits nécessaires pour accéder à cette page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Retour au catalogue</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
