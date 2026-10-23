import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { EMAIL_TYPE_LABELS } from "@/server/email/default-templates";

export type EmailRow = {
  id: string;
  type: string;
  recipientEmail: string | null;
  subject: string | null;
  sentAt: Date | null;
  createdAt: Date;
  error: string | null;
  context?: string;
};

export function EmailHistory({ rows }: { rows: EmailRow[] }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">Aucun email envoyé pour le moment.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Destinataire</TableHead>
          <TableHead>Objet</TableHead>
          <TableHead>État</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.sentAt ?? row.createdAt)}</TableCell>
            <TableCell>
              {EMAIL_TYPE_LABELS[row.type] ?? row.type}
              {row.context ? <span className="text-muted-foreground block text-xs">{row.context}</span> : null}
            </TableCell>
            <TableCell>{row.recipientEmail ?? "Anonymisé"}</TableCell>
            <TableCell>
              <Link href={`/admin/emails/${row.id}`} className="hover:underline">
                {row.subject ?? "—"}
              </Link>
            </TableCell>
            <TableCell>
              {row.error ? (
                <Badge variant="destructive" title={row.error}>
                  Échec
                </Badge>
              ) : (
                <Badge variant="success">Envoyé</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
