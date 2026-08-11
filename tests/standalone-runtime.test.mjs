import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

const port = 3317;
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Standalone server did not become ready.");
}

before(async () => {
  server = spawn(process.execPath, ["dist/standalone/server.js"], {
    env: {
      ...process.env,
      CAREERPILOT_RUNTIME: "node",
      AI_PROVIDER: "rules",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
});

after(() => {
  server?.kill("SIGTERM");
});

test("renders the improved application form", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /keine starre Mindestzeichenzahl/i);
  assert.match(html, /Amazon Nova oder Claude über Bedrock/i);
  assert.match(html, /PDF, DOCX und TXT/i);
  assert.doesNotMatch(html, /Mindestens 80 Zeichen/i);
});

test("rejects private job URLs before fetching", async () => {
  const response = await fetch(`${baseUrl}/api/job-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1/internal" }),
  });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /private Netzwerkadressen/i);
});

test("extracts a text resume and produces a substantial evidence-based package", async () => {
  const form = new FormData();
  form.set("candidateName", "Alex Mustermann");
  form.set("targetRole", "Cloud Support Specialist");
  form.set("company", "Nordlicht Digital GmbH");
  form.set("jobText", "Gesucht sind AWS, Docker, Linux, IT-Support, Terraform und Kundenkommunikation.");
  form.append("documents", new Blob([
    "Cloud-Support-Projekt 2025. Docker-Container auf AWS EC2 getestet. Linux-Systeme administriert, Fehler dokumentiert und technische Rückfragen verständlich beantwortet. GitHub Actions für Build- und Qualitätstests verwendet. Kenntnisse: AWS, Docker, Linux, IT-Support, CI/CD und Kundenkommunikation.",
  ], { type: "text/plain" }), "synthetic-cv.txt");

  const response = await fetch(`${baseUrl}/api/applications`, { method: "POST", body: form });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.provider, "rules");
  assert.equal(result.model, "careerpilot-evidence-rules-v2");
  assert.equal(result.uploadedFilesPersisted, false);
  assert.ok(result.profileHighlights.length >= 4);
  assert.equal(result.cvSuggestions.length, 5);
  assert.equal(result.interviewQuestions.length, 5);
  assert.ok(result.coverLetter.length >= 1_300);
  assert.match(result.coverLetter, /Bewerbung als Cloud Support Specialist/);
  assert.match(result.sourceSummary.join(" "), /synthetic-cv\.txt/);
  assert.equal(new Set(result.matches).size, result.matches.length);
  assert.equal(new Set(result.gaps).size, result.gaps.length);

  const listed = await fetch(`${baseUrl}/api/applications`).then((item) => item.json());
  assert.equal(listed.applications.length, 1);
  const deleted = await fetch(`${baseUrl}/api/applications?id=${encodeURIComponent(result.applicationId)}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const empty = await fetch(`${baseUrl}/api/applications`).then((item) => item.json());
  assert.equal(empty.applications.length, 0);
});

test("accepts concise meaningful text instead of an arbitrary 80-character minimum", async () => {
  const form = new FormData();
  form.set("candidateName", "Alex Mustermann");
  form.set("targetRole", "IT Support Specialist");
  form.set("company", "Beispiel GmbH");
  form.set("jobText", "AWS und Docker im IT-Support.");
  form.set("resumeText", "AWS und Docker praktisch genutzt.");
  const response = await fetch(`${baseUrl}/api/applications`, { method: "POST", body: form });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.ok(result.coverLetter.length > 1_000);
  await fetch(`${baseUrl}/api/applications?id=${encodeURIComponent(result.applicationId)}`, { method: "DELETE" });
});

test("extracts synthetic PDF and DOCX resumes", async () => {
  const fixtures = [
    { filename: "synthetic-cv.pdf", type: "application/pdf" },
    { filename: "synthetic-cv.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ];

  for (const fixture of fixtures) {
    const bytes = await readFile(new URL(`./fixtures/${fixture.filename}`, import.meta.url));
    const form = new FormData();
    form.set("candidateName", "Alex Mustermann");
    form.set("targetRole", "Cloud Support Specialist");
    form.set("company", "Nordlicht Digital GmbH");
    form.set("jobText", "Gesucht sind AWS, Docker, Linux, IT-Support und Kundenkommunikation.");
    form.append("documents", new Blob([bytes], { type: fixture.type }), fixture.filename);

    const response = await fetch(`${baseUrl}/api/applications`, { method: "POST", body: form });
    assert.equal(response.status, 201, `${fixture.filename} sollte lesbar sein`);
    const result = await response.json();
    assert.match(result.sourceSummary.join(" "), new RegExp(fixture.filename.replace(".", "\\.")));
    assert.ok(result.profileHighlights.length >= 4);
    assert.ok(result.coverLetter.length >= 1_300);
    await fetch(`${baseUrl}/api/applications?id=${encodeURIComponent(result.applicationId)}`, { method: "DELETE" });
  }
});
