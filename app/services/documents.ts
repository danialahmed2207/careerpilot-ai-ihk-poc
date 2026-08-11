export type ExtractedDocument = {
  name: string;
  mediaType: string;
  text: string;
  bytes: Uint8Array;
  warning?: string;
};

const MAX_EXTRACTED_CHARS_PER_FILE = 18_000;

function normalizeText(value: string) {
  return value
    .split("\u0000").join("")
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS_PER_FILE);
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
    try {
      pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: true });
      const text = normalizeText(result.text);
      return {
        name: file.name,
        mediaType: file.type,
        text,
        bytes,
        warning: text ? undefined : "Das PDF enthält wahrscheinlich nur ein Bild. Im KI-Modus kann eine visuelle Analyse versucht werden.",
      };
    } catch {
      throw new Error("PDF konnte nicht gelesen werden. Bitte prüfe, ob die Datei geöffnet werden kann oder passwortgeschützt ist.");
    } finally {
      await pdf?.cleanup();
    }
  }

  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name)) {
    const mammothModule = await import("mammoth");
    const mammoth = mammothModule.default;
    const { Buffer } = await import("node:buffer");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return {
      name: file.name,
      mediaType: file.type,
      text: normalizeText(result.value),
      bytes,
      warning: result.messages.length ? "Das Word-Dokument wurde mit Formatierungshinweisen eingelesen." : undefined,
    };
  }

  if (file.type === "text/plain" || file.type === "text/markdown" || /\.(txt|md)$/i.test(file.name)) {
    return {
      name: file.name,
      mediaType: "text/plain",
      text: normalizeText(new TextDecoder().decode(bytes)),
      bytes,
    };
  }

  if (file.type === "image/png" || file.type === "image/jpeg" || /\.png$/i.test(file.name) || /\.jpe?g$/i.test(file.name)) {
    const mediaType = file.type === "image/png" || /\.png$/i.test(file.name) ? "image/png" : "image/jpeg";
    return {
      name: file.name,
      mediaType,
      text: "",
      bytes,
      warning: "Bildinhalt wird nur im multimodalen Bedrock-Modus ausgewertet; der Regelmodus nutzt keine OCR.",
    };
  }

  throw new Error(`Nicht unterstützter Dateityp: ${file.name}`);
}
