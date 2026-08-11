import { ensureDatabase } from "../../../db/init";
import { importJobFromUrl } from "../../lib/job-import";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES, MAX_UPLOAD_MB } from "../../lib/upload-policy";
import { extractDocument } from "../../services/documents";
import { analyzeApplication } from "../../services/analysis";

type RuntimeEnv = {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
};

type MemoryApplication = {
  id: string;
  targetRole: string;
  company: string;
  status: string;
  createdAt: string;
};

const memoryApplications = new Map<string, MemoryApplication>();

async function getCloudflareEnv(): Promise<RuntimeEnv | null> {
  if (process.env.CAREERPILOT_RUNTIME === "node") return null;

  try {
    const cloudflare = await import("cloudflare:workers");
    return cloudflare.env as unknown as RuntimeEnv;
  } catch {
    // The portable Docker demonstrator intentionally runs without D1/R2.
    return null;
  }
}

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/markdown",
]);
const allowedExtensions = /\.(pdf|docx|txt|md|png|jpe?g)$/i;

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const runtime = await getCloudflareEnv();
  if (!runtime) {
    return Response.json({
      applications: Array.from(memoryApplications.values())
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 10),
      storageMode: "ephemeral-memory",
    });
  }

  await ensureDatabase(runtime.DB);
  const rows = await runtime.DB.prepare(
    "SELECT id, target_role AS targetRole, company, status, created_at AS createdAt FROM applications ORDER BY created_at DESC LIMIT 10",
  ).all();
  return Response.json({ applications: rows.results });
}

export async function POST(request: Request) {
  const runtime = await getCloudflareEnv();
  const storedKeys: string[] = [];

  try {
    const form = await request.formData();
    const candidateName = field(form, "candidateName");
    const targetRole = field(form, "targetRole");
    const company = field(form, "company");
    const jobLink = field(form, "jobLink");
    let jobText = field(form, "jobText");
    const manualResumeText = field(form, "resumeText");

    if (!candidateName) return Response.json({ error: "Bitte deinen Namen angeben." }, { status: 400 });

    const documents = form.getAll("documents").filter((item): item is File => item instanceof File && item.size > 0);
    if (documents.length > MAX_UPLOAD_FILES) {
      return Response.json({ error: `Maximal ${MAX_UPLOAD_FILES} Dateien sind erlaubt.` }, { status: 400 });
    }
    for (const document of documents) {
      if (!allowedTypes.has(document.type) && !allowedExtensions.test(document.name)) {
        return Response.json({ error: `Nicht unterstützter Dateityp: ${document.name}` }, { status: 400 });
      }
      if (document.size > MAX_UPLOAD_BYTES) {
        return Response.json({ error: `Datei ist größer als ${MAX_UPLOAD_MB} MB: ${document.name}` }, { status: 400 });
      }
    }

    let importedJob: Awaited<ReturnType<typeof importJobFromUrl>> | null = null;
    if (jobLink && jobText.length < 40) {
      try {
        importedJob = await importJobFromUrl(jobLink);
        jobText = importedJob.text;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Stellenlink konnte nicht gelesen werden.";
        return Response.json({ error: `${message} Bitte füge alternativ den Text der Stellenanzeige ein.` }, { status: 422 });
      }
    }
    if (jobText.length < 20) {
      return Response.json({ error: "Bitte einen lesbaren Stellenlink oder einen kurzen Ausschnitt der Stellenbeschreibung angeben." }, { status: 400 });
    }

    const extractedDocuments = [];
    for (const document of documents) {
      try {
        extractedDocuments.push(await extractDocument(document));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Dokument konnte nicht gelesen werden.";
        return Response.json({ error: `${document.name}: ${message}` }, { status: 422 });
      }
    }
    const extractedText = extractedDocuments.map((document) => document.text).filter(Boolean).join("\n\n");
    const resumeText = [manualResumeText, extractedText].filter(Boolean).join("\n\n").trim();
    const imageAttachments: Array<{ name: string; mediaType: "image/png" | "image/jpeg"; bytes: Uint8Array }> = [];
    for (const document of extractedDocuments) {
      if (document.mediaType === "image/png" || document.mediaType === "image/jpeg") {
        imageAttachments.push({ name: document.name, mediaType: document.mediaType, bytes: document.bytes });
      }
    }
    if (resumeText.length < 15 && imageAttachments.length === 0) {
      return Response.json({ error: "Bitte Lebenslauftext eingeben oder ein lesbares PDF-, DOCX- beziehungsweise Textdokument hochladen." }, { status: 400 });
    }

    const resolvedTargetRole = targetRole || importedJob?.targetRole || "Position laut Stellenanzeige";
    const resolvedCompany = company || importedJob?.company || "Zielunternehmen laut Stellenanzeige";
    const sourceSummary = [
      importedJob ? `Stellenanzeige automatisch eingelesen: ${importedJob.sourceUrl}` : "Stellenbeschreibung manuell eingegeben",
      manualResumeText ? "Zusätzlicher Lebenslauftext manuell eingegeben" : "",
      ...extractedDocuments.map((document) => `${document.name}: ${document.text ? `${document.text.length} Zeichen extrahiert` : "für multimodale Analyse beigefügt"}${document.warning ? ` · ${document.warning}` : ""}`),
    ].filter(Boolean);

    const applicationId = crypto.randomUUID();
    const analysis = await analyzeApplication({
      candidateName,
      targetRole: resolvedTargetRole,
      company: resolvedCompany,
      jobLink,
      jobText,
      resumeText,
      attachments: imageAttachments,
      sourceSummary,
    });

    if (!runtime) {
      memoryApplications.set(applicationId, {
        id: applicationId,
        targetRole: resolvedTargetRole,
        company: resolvedCompany,
        status: "review",
        createdAt: new Date().toISOString(),
      });
      return Response.json(
        {
          applicationId,
          ...analysis,
          storageMode: "ephemeral-memory",
          uploadedFilesPersisted: false,
          resolvedTargetRole,
          resolvedCompany,
        },
        { status: 201 },
      );
    }

    await ensureDatabase(runtime.DB);
    const documentRows: Array<{ id: string; key: string; file: File }> = [];

    const persistUploads = process.env.PERSIST_UPLOADS === "true";
    for (const document of persistUploads ? documents : []) {
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
      ).bind(applicationId, candidateName, resolvedTargetRole, resolvedCompany, jobLink || null, jobText, resumeText, "review", JSON.stringify(analysis)),
      ...documentRows.map(({ id, key, file }) => runtime.DB.prepare(
        "INSERT INTO documents (id, application_id, filename, content_type, size_bytes, object_key) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, applicationId, file.name.slice(0, 200), file.type, file.size, key)),
    ];
    await runtime.DB.batch(statements);

    return Response.json({
      applicationId,
      ...analysis,
      uploadedFilesPersisted: persistUploads,
      resolvedTargetRole,
      resolvedCompany,
    }, { status: 201 });
  } catch (cause) {
    if (runtime && storedKeys.length) {
      await Promise.all(storedKeys.map((key) => runtime.DOCUMENTS.delete(key)));
    }
    const message = cause instanceof Error ? cause.message : "Unerwarteter Fehler";
    return Response.json({ error: `Vorgang konnte nicht gespeichert werden: ${message}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const runtime = await getCloudflareEnv();
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Vorgangs-ID fehlt." }, { status: 400 });

  if (!runtime) {
    memoryApplications.delete(id);
    return Response.json({ deleted: true, storageMode: "ephemeral-memory" });
  }

  await ensureDatabase(runtime.DB);
  const documents = await runtime.DB.prepare("SELECT object_key AS objectKey FROM documents WHERE application_id = ?").bind(id).all<{ objectKey: string }>();
  await Promise.all((documents.results ?? []).map((document) => runtime.DOCUMENTS.delete(document.objectKey)));
  await runtime.DB.prepare("DELETE FROM applications WHERE id = ?").bind(id).run();
  return Response.json({ deleted: true });
}
