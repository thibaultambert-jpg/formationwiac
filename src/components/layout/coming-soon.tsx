import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ComingSoon({ lot }: { lot: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bientôt disponible</CardTitle>
        <CardDescription>Cet écran sera livré au lot {lot}.</CardDescription>
      </CardHeader>
    </Card>
  );
}
