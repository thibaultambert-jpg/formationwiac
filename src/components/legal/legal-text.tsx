import { legalBlocks } from "@/server/domain/legal";

/** Renders a legal text: blank lines separate blocks, short lines without punctuation are headings. */
export function LegalText({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {legalBlocks(text).map((block, index) =>
        block.kind === "heading" ? (
          <h2 key={index} className="text-primary pt-2 text-lg font-semibold">
            {block.text}
          </h2>
        ) : (
          <p key={index} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
