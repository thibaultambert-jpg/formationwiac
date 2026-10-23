// Minimal reader for the .eml files of the local outbox (preview in the BO).

export type ParsedEml = { headers: Record<string, string>; text: string; attachments: string[] };

function decodeHeader(value: string): string {
  return value.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, encoded: string) =>
    Buffer.from(encoded, "base64").toString("utf8"),
  );
}

export function parseEml(raw: string): ParsedEml {
  const [head, ...rest] = raw.split("\r\n\r\n");
  const body = rest.join("\r\n\r\n");
  const headers: Record<string, string> = {};
  for (const line of head.split("\r\n")) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).toLowerCase()] = decodeHeader(line.slice(index + 1).trim());
  }

  let text = "";
  const attachments: string[] = [];
  for (const part of body.split(/\r\n--[^\r\n]+/)) {
    const [partHead, ...partBody] = part.replace(/^\r\n/, "").split("\r\n\r\n");
    if (/Content-Type: text\/plain/i.test(partHead) && !text) {
      text = Buffer.from(partBody.join("").replace(/\s/g, ""), "base64").toString("utf8");
    }
    const filename = /filename="([^"]+)"/i.exec(partHead);
    if (filename) attachments.push(decodeHeader(filename[1]));
  }
  return { headers, text, attachments };
}
