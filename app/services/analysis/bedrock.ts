import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import type { AnalysisInput, AnalysisProvider, AnalysisResult } from "./types";

const DEFAULT_MODEL = "eu.amazon.nova-2-lite-v1:0";

const systemPrompt = `Du bist die Analyse- und Schreibkomponente von CareerPilot AI. Du unterstützt ausschließlich die bewerbende Person. Du triffst niemals eine Personal-, Ranking- oder Eignungsentscheidung.

Verbindliche Regeln:
- Nutze ausschließlich Informationen aus Stellenanzeige, Lebenslauftext und bereitgestellten Dokumenten/Bildern.
- Erfinde keine Kenntnisse, Berufserfahrungen, Abschlüsse, Zeiträume, Verantwortungen oder Erfolge.
- Trenne belegte Übereinstimmungen von offenen oder unbelegten Anforderungen.
- Wenn ein Beleg fehlt, formuliere eine Rückfrage oder offene Prüfposition statt einer Behauptung.
- Formuliere präzise, professionell, individuell und diskriminierungsfrei auf Deutsch.
- Das Anschreiben muss 250 bis 450 Wörter enthalten, einen konkreten Stellenbezug herstellen und darf keine unbelegten Tatsachen enthalten. Vermeide leere Floskeln.
- Lebenslaufvorschläge müssen konkret sagen, welche belegte Information wo und wie verbessert werden kann.
- Der Score ist nur ein transparenter Textabgleich und keine Eignungsbewertung.
- Antworte ausschließlich als valides JSON-Objekt ohne Markdown.

Schema:
{
  "score": Ganzzahl von 0 bis 100,
  "matches": 3 bis 7 belegbezogene Aussagen,
  "gaps": 2 bis 6 offene Prüfpositionen,
  "profileHighlights": 4 bis 6 belegte Profil-Highlights,
  "cvSuggestions": genau 5 konkrete Vorschläge,
  "coverLetter": vollständiger professioneller Anschreibenentwurf,
  "interviewQuestions": genau 5 individuelle Fragen
}`;

function stringArray(value: unknown, min: number, max: number, name: string) {
  if (!Array.isArray(value)) throw new Error(`${name} ist kein Array.`);
  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (items.length < min || items.length > max) throw new Error(`${name} hat eine ungültige Anzahl Einträge.`);
  return items;
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Die Modellantwort enthält kein JSON-Objekt.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function providerForModel(modelId: string): AnalysisProvider {
  return modelId.includes("amazon.nova") ? "bedrock-nova" : "bedrock-claude";
}

function modelLabel(provider: AnalysisProvider) {
  return provider === "bedrock-nova" ? "Amazon Nova über Amazon Bedrock" : "Claude über Amazon Bedrock";
}

export async function buildBedrockAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const region = process.env.AWS_REGION?.trim() || "eu-central-1";
  const modelId = process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_MODEL;
  const provider = providerForModel(modelId);
  const client = new BedrockRuntimeClient({ region });

  const promptInput = {
    candidateName: input.candidateName,
    targetRole: input.targetRole,
    company: input.company,
    jobLink: input.jobLink,
    jobText: input.jobText,
    resumeText: input.resumeText,
    sourceSummary: input.sourceSummary,
  };
  const content: ContentBlock[] = [{ text: JSON.stringify(promptInput) }];
  for (const attachment of input.attachments ?? []) {
    content.push({
      image: {
        format: attachment.mediaType === "image/png" ? "png" : "jpeg",
        source: { bytes: attachment.bytes },
      },
    });
  }

  const response = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: systemPrompt }],
    messages: [{ role: "user", content }],
    inferenceConfig: {
      maxTokens: 4_500,
      temperature: 0.2,
    },
  }));

  const text = response.output?.message?.content?.find((item) => "text" in item)?.text;
  if (!text) throw new Error("Das Bedrock-Modell hat keine Textantwort geliefert.");
  const data = parseJson(text);
  const score = Number(data.score);
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("Der Modell-Score ist ungültig.");
  if (typeof data.coverLetter !== "string" || data.coverLetter.trim().length < 900) {
    throw new Error("Der Anschreibenentwurf ist zu kurz oder unvollständig.");
  }

  return {
    score,
    matches: stringArray(data.matches, 3, 7, "matches"),
    gaps: stringArray(data.gaps, 2, 6, "gaps"),
    profileHighlights: stringArray(data.profileHighlights, 4, 6, "profileHighlights"),
    cvSuggestions: stringArray(data.cvSuggestions, 5, 5, "cvSuggestions"),
    coverLetter: data.coverLetter.trim(),
    interviewQuestions: stringArray(data.interviewQuestions, 5, 5, "interviewQuestions"),
    sourceSummary: input.sourceSummary ?? [],
    disclaimer: `KI-gestützter Entwurf mit ${modelLabel(provider)}. Keine Eignungsentscheidung; jede Aussage muss anhand der Originalnachweise geprüft werden.`,
    provider,
    model: modelId,
    fallbackUsed: false,
  };
}
