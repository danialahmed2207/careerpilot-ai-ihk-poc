export type JobPreview = {
  sourceUrl: string;
  title: string;
  company: string;
  targetRole: string;
  text: string;
  warnings: string[];
};

const MAX_HTML_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 24_000;

const entityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return entityMap[entity.toLowerCase()] ?? match;
  });
}

function plainText(value: string) {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<(br|\/p|\/li|\/h[1-6]|\/section|\/article|\/div)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1" || host === "metadata.google.internal") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(host)) return true;
  return false;
}

function validateUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Der Stellenlink ist keine gültige URL.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Es sind nur HTTP- oder HTTPS-Stellenlinks erlaubt.");
  if (url.username || url.password) throw new Error("Links mit eingebetteten Zugangsdaten sind nicht erlaubt.");
  if (blockedHost(url.hostname)) throw new Error("Lokale oder private Netzwerkadressen sind nicht erlaubt.");
  if (url.port && !['80', '443'].includes(url.port)) throw new Error("Der Link verwendet einen nicht erlaubten Port.");
  return url;
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const type = object['@type'];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return object;
  for (const child of Object.values(object)) {
    const found = findJobPosting(child);
    if (found) return found;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? plainText(value) : "";
}

function organizationName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return stringValue((value as Record<string, unknown>).name);
}

function extractStructuredJob(html: string) {
  const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(decodeEntities(block[1].trim())) as unknown;
      const job = findJobPosting(parsed);
      if (!job) continue;
      const sections = [job.description, job.responsibilities, job.qualifications, job.skills]
        .map(stringValue)
        .filter(Boolean);
      return {
        title: stringValue(job.title),
        company: organizationName(job.hiringOrganization),
        text: sections.join("\n\n"),
      };
    } catch {
      // Broken JSON-LD is common. The visible page remains the fallback source.
    }
  }
  return { title: "", company: "", text: "" };
}

function htmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? plainText(match[1]).replace(/\s+[|–—-]\s+[^|–—-]+$/, "").trim() : "";
}

async function readLimitedBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_HTML_BYTES) throw new Error("Die Stellenanzeige ist zu groß zum automatischen Einlesen.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_HTML_BYTES) throw new Error("Die Stellenanzeige ist zu groß zum automatischen Einlesen.");
  return text;
}

export async function importJobFromUrl(rawUrl: string): Promise<JobPreview> {
  let url = validateUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "user-agent": "CareerPilotAI-IHK-PoC/1.0 (+synthetic-demo)",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Der Stellenlink enthält eine ungültige Weiterleitung.");
        url = validateUrl(new URL(location, url).toString());
        continue;
      }

      if (!response.ok) throw new Error(`Die Stellenanzeige antwortet mit HTTP ${response.status}.`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
        throw new Error("Der Link liefert keine lesbare HTML- oder Text-Stellenanzeige.");
      }

      const html = await readLimitedBody(response);
      const structured = extractStructuredJob(html);
      const visible = plainText(html);
      const text = (structured.text || visible).slice(0, MAX_TEXT_CHARS).trim();
      if (text.length < 40) throw new Error("Auf der Seite konnte keine ausreichend lesbare Stellenbeschreibung gefunden werden.");

      const companyFallback = url.hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ");
      return {
        sourceUrl: url.toString(),
        title: structured.title || htmlTitle(html),
        targetRole: structured.title || htmlTitle(html),
        company: structured.company || companyFallback.replace(/\b\w/g, (letter) => letter.toUpperCase()),
        text,
        warnings: structured.text ? [] : ["Die Seite enthielt keine vollständigen JobPosting-Strukturdaten; sichtbarer Seitentext wurde übernommen."],
      };
    }
    throw new Error("Der Stellenlink enthält zu viele Weiterleitungen.");
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new Error("Das Einlesen der Stellenanzeige hat zu lange gedauert.");
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}
