import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db/init";

type RuntimeEnv = {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
};

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

const stopWords = new Set([
  "aber", "auch", "dass", "eine", "einem", "einen", "einer", "eines", "für", "oder", "sind",
  "über", "und", "unsere", "werden", "wird", "with", "your", "the", "eine", "kenntnisse", "erfahrung",
  "aufgaben", "anforderungen", "sowie", "mehr", "durch", "sehr", "gute", "guten", "bereits",
]);

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function tokens(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9äöüß+#.-]+/gi, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^[.+-]+|[.+-]+$/g, ""))
      .filter((token) => token.length >= 4 && !stopWords.has(token)),
  ));
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function buildAnalysis(candidateName: string, targetRole: string, company: string, jobText: string, resumeText: string) {
  const jobTokens = tokens(jobText).slice(0, 60);
  const resumeSet = new Set(tokens(resumeText));
  const matches = jobTokens.filter((token) => resumeSet.has(token)).slice(0, 7);
  const gaps = jobTokens.filter((token) => !resumeSet.has(token)).slice(0, 6);
  const ratio = jobTokens.length ? matches.length / Math.min(jobTokens.length, 12) : 0;
  const score = Math.max(38, Math.min(92, Math.round(46 + ratio * 46)));
  const matchText = matches.length ? matches.map(titleCase) : ["Noch keine eindeutige Textübereinstimmung"];
  const gapText = gaps.length ? gaps.map(titleCase) : ["Keine weiteren Schlüsselbegriffe erkannt"];

  const evidenceSentence = matches.length
    ? `Besonders anschlussfähig sind meine in den Unterlagen genannten Kenntnisse in ${matches.slice(0, 4).join(", ")}.`
    : "Gern erläutere ich im Gespräch, welche meiner belegten Erfahrungen zu Ihren Anforderungen passen.";

  return {
    score,
    matches: matchText.map((item) => `Im bereitgestellten Lebenslauftext erwähnt: ${item}`),
    gaps: gapText.map((item) => `Anforderung prüfen und nur mit Beleg ergänzen: ${item}`),
    cvSuggestions: [
      matches.length ? `Die belegten Begriffe ${matches.slice(0, 3).join(", ")} in der Profilzusammenfassung sichtbar machen.` : "Profilzusammenfassung enger auf die Zielrolle ausrichten.",
      "Pro Station Ergebnis, verwendete Methode und Zeitraum getrennt und konkret beschreiben.",
      "Nicht belegte Anforderungen nicht ergänzen; stattdessen Lernbereitschaft oder übertragbare Erfahrung kenntlich machen.",
    ],
    coverLetter: `Sehr geehrte Damen und Herren,\n\nmit Interesse bewerbe ich mich als ${targetRole} bei ${company}. ${evidenceSentence}\n\nIhre Stellenbeschreibung spricht mich besonders an, weil sie fachliche Verantwortung mit einer strukturierten Zusammenarbeit verbindet. Meine Unterlagen zeigen die oben ausgewiesenen Berührungspunkte. Punkte, die daraus noch nicht eindeutig hervorgehen, möchte ich transparent im persönlichen Gespräch einordnen.\n\nGern überzeuge ich Sie davon, wie ich meine belegten Erfahrungen in Ihr Team einbringen und mich gezielt in weitere Anforderungen einarbeiten kann.\n\nMit freundlichen Grüßen\n${candidateName}`,
    interviewQuestions: [
      matches[0] ? `An welchem konkreten Beispiel kannst du deine Erfahrung mit „${titleCase(matches[0])}“ belegen?` : "Welche deiner bisherigen Aufgaben ist für die Zielrolle am relevantesten?",
      gaps[0] ? `Wie gehst du transparent damit um, dass „${titleCase(gaps[0])}“ in deinen Unterlagen noch nicht belegt ist?` : "Welche neue Anforderung möchtest du zuerst vertiefen?",
      `Warum möchtest du gerade als ${targetRole} bei ${company} arbeiten?`,
      "Welche Rückfrage stellst du, um Aufgaben, Erfolgskriterien und Einarbeitung besser zu verstehen?",
    ],
    disclaimer: "Regelbasierter POC-Abgleich, keine Eignungsentscheidung. Ergebnisse müssen vom Nutzer geprüft und bearbeitet werden.",
  };
}

export async function GET() {
  const runtime = env as unknown as RuntimeEnv;
  await ensureDatabase(runtime.DB);
  const rows = await runtime.DB.prepare(
    "SELECT id, target_role AS targetRole, company, status, created_at AS createdAt FROM applications ORDER BY created_at DESC LIMIT 10",
  ).all();
  return Response.json({ applications: rows.results });
}

export async function POST(request: Request) {
  const runtime = env as unknown as RuntimeEnv;
  const storedKeys: string[] = [];

  try {
    const form = await request.formData();
    const candidateName = field(form, "candidateName");
    const targetRole = field(form, "targetRole");
    const company = field(form, "company");
    const jobLink = field(form, "jobLink");
    const jobText = field(form, "jobText");
    const resumeText = field(form, "resumeText");

    if (!candidateName || !targetRole || !company || jobText.length < 80 || resumeText.length < 80) {
      return Response.json({ error: "Bitte alle Pflichtfelder vollständig ausfüllen (Texte jeweils mindestens 80 Zeichen)." }, { status: 400 });
    }

    const documents = form.getAll("documents").filter((item): item is File => item instanceof File && item.size > 0);
    if (documents.length > 3) return Response.json({ error: "Maximal drei Dateien sind erlaubt." }, { status: 400 });
    for (const document of documents) {
      if (!allowedTypes.has(document.type)) return Response.json({ error: `Nicht unterstützter Dateityp: ${document.name}` }, { status: 400 });
      if (document.size > 5 * 1024 * 1024) return Response.json({ error: `Datei ist größer als 5 MB: ${document.name}` }, { status: 400 });
    }

    await ensureDatabase(runtime.DB);
    const applicationId = crypto.randomUUID();
    const analysis = buildAnalysis(candidateName, targetRole, company, jobText, resumeText);
    const documentRows: Array<{ id: string; key: string; file: File }> = [];

    for (const document of documents) {
      const safeName = document.name.replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_").slice(0, 120);
      const key = `applications/${applicationId}/${crypto.randomUUID()}-${safeName}`;
      await runtime.DOCUMENTS.put(key, await document.arrayBuffer(), {
        httpMetadata: { contentType: document.type },
        customMetadata: { applicationId, originalName: document.name.slice(0, 200) },
      });
      storedKeys.push(key);
      documentRows.push({ id: crypto.randomUUID(), key, file: document });
    }

    const statements = [
      runtime.DB.prepare(
        "INSERT INTO applications (id, candidate_name, target_role, company, job_link, job_text, resume_text, status, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(applicationId, candidateName, targetRole, company, jobLink || null, jobText, resumeText, "review", JSON.stringify(analysis)),
      ...documentRows.map(({ id, key, file }) => runtime.DB.prepare(
        "INSERT INTO documents (id, application_id, filename, content_type, size_bytes, object_key) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, applicationId, file.name.slice(0, 200), file.type, file.size, key)),
    ];
    await runtime.DB.batch(statements);

    return Response.json({ applicationId, ...analysis }, { status: 201 });
  } catch (cause) {
    if (storedKeys.length) await Promise.all(storedKeys.map((key) => runtime.DOCUMENTS.delete(key)));
    const message = cause instanceof Error ? cause.message : "Unerwarteter Fehler";
    return Response.json({ error: `Vorgang konnte nicht gespeichert werden: ${message}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const runtime = env as unknown as RuntimeEnv;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Vorgangs-ID fehlt." }, { status: 400 });

  await ensureDatabase(runtime.DB);
  const documents = await runtime.DB.prepare("SELECT object_key AS objectKey FROM documents WHERE application_id = ?").bind(id).all<{ objectKey: string }>();
  await Promise.all((documents.results ?? []).map((document) => runtime.DOCUMENTS.delete(document.objectKey)));
  await runtime.DB.prepare("DELETE FROM applications WHERE id = ?").bind(id).run();
  return Response.json({ deleted: true });
}
