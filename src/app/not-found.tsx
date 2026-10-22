import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main id="contenu" className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Page introuvable</h1>
          </CardTitle>
          <CardDescription>La page demandée n&apos;existe pas ou a été déplacée.</CardDescription>
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
