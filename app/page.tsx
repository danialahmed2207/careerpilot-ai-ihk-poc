"use client";

import Image from "next/image";
import { FormEvent, useMemo, useRef, useState } from "react";
import { suggestRoles } from "./lib/role-suggestions";

type AnalysisResult = {
  applicationId: string;
  score: number;
  matches: string[];
  gaps: string[];
  profileHighlights: string[];
  cvSuggestions: string[];
  coverLetter: string;
  interviewQuestions: string[];
  sourceSummary: string[];
  disclaimer: string;
  provider: "rules" | "bedrock-claude" | "bedrock-nova";
  model: string;
  fallbackUsed: boolean;
  resolvedTargetRole?: string;
  resolvedCompany?: string;
};

const steps = ["Unterlagen", "Abgleich", "Bewerbungspaket", "Export"];

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [company, setCompany] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jobText, setJobText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNotice, setLinkNotice] = useState("");
  const linkRequestActive = useRef(false);
  const lastImportedLink = useRef("");

  const activeStep = result ? 2 : busy ? 1 : 0;
  const fileSummary = useMemo(
    () => files.map((file) => `${file.name} · ${(file.size / 1024).toFixed(0)} KB`),
    [files],
  );
  const roleSuggestions = useMemo(() => suggestRoles(targetRole), [targetRole]);

  async function importJobLink(force = false) {
    const normalizedLink = jobLink.trim();
    if (!normalizedLink || linkRequestActive.current || (!force && lastImportedLink.current === normalizedLink)) return;
    linkRequestActive.current = true;
    setLinkBusy(true);
    setLinkNotice("");
    setError("");
    try {
      const response = await fetch("/api/job-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalizedLink }),
      });
      const payload = await response.json() as {
        error?: string;
        text?: string;
        targetRole?: string;
        company?: string;
        warnings?: string[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Stellenanzeige konnte nicht eingelesen werden.");
      if (payload.text) setJobText(payload.text);
      if (!targetRole && payload.targetRole) setTargetRole(payload.targetRole);
      if (!company && payload.company) setCompany(payload.company);
      lastImportedLink.current = normalizedLink;
      setLinkNotice(payload.warnings?.[0] ?? "Stellenanzeige erkannt und übernommen. Bitte kurz prüfen.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stellenanzeige konnte nicht eingelesen werden.");
    } finally {
      linkRequestActive.current = false;
      setLinkBusy(false);
    }
  }

  function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadCoverLetter() {
    const safeRole = (result?.resolvedTargetRole || "Zielposition").replace(/[^a-z0-9äöüß-]+/gi, "_");
    downloadText(`Anschreiben_${safeRole}.txt`, coverLetter);
  }

  function downloadPackage() {
    if (!result) return;
    const packageText = [
      "CAREERPILOT AI – GEPRÜFTES BEWERBUNGSPAKET",
      `Zielposition: ${result.resolvedTargetRole ?? "laut Stellenanzeige"}`,
      `Unternehmen: ${result.resolvedCompany ?? "laut Stellenanzeige"}`,
      `Textabgleich: ${result.score}% (keine Eignungsbewertung)`,
      "",
      "PROFIL-HIGHLIGHTS",
      ...result.profileHighlights.map((item) => `- ${item}`),
      "",
      "BELEGTE ÜBEREINSTIMMUNGEN",
      ...result.matches.map((item) => `- ${item}`),
      "",
      "OFFENE PRÜFPOSITIONEN",
      ...result.gaps.map((item) => `- ${item}`),
      "",
      "LEBENSLAUF-VORSCHLÄGE",
      ...result.cvSuggestions.map((item) => `- ${item}`),
      "",
      "ANSCHREIBENENTWURF",
      coverLetter,
      "",
      "INTERVIEWVORBEREITUNG",
      ...result.interviewQuestions.map((item, index) => `${index + 1}. ${item}`),
      "",
      "QUELLEN UND HINWEIS",
      ...result.sourceSummary.map((item) => `- ${item}`),
      result.disclaimer,
    ].join("\n");
    downloadText("CareerPilot_Bewerbungspaket.txt", packageText);
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const formData = new FormData(event.currentTarget);
    files.forEach((file) => formData.append("documents", file));

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as AnalysisResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Die Analyse ist fehlgeschlagen.");
      setResult(payload);
      setCoverLetter(payload.coverLetter);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unerwarteter Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAndReset() {
    if (result?.applicationId) {
      await fetch(`/api/applications?id=${encodeURIComponent(result.applicationId)}`, {
        method: "DELETE",
      });
    }
    setResult(null);
    setCoverLetter("");
    setFiles([]);
    setError("");
    setTargetRole("");
    setCompany("");
    setJobLink("");
    setJobText("");
    setResumeText("");
    setLinkNotice("");
    lastImportedLink.current = "";
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareerPilot AI Startseite">
          <span className="brandMark" aria-hidden="true">
            <Image src="/careerpilot-logo.png" alt="" width={68} height={68} priority />
          </span>
          <span>CareerPilot <b>AI</b></span>
        </a>
        <div className="topbarActions">
          <span className="demoPill">IHK Proof of Concept</span>
          <button className="quietButton" type="button" onClick={() => window.print()}>
            Projektansicht drucken
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Bewerbungsunterlagen mit Kontrolle statt Blindflug</div>
        <h1>Von der Stellenanzeige zum prüfbaren Bewerbungspaket.</h1>
        <p>
          CareerPilot AI gleicht deine belegten Erfahrungen mit einer konkreten Stelle ab,
          markiert Lücken und erstellt bearbeitbare Entwürfe. Du entscheidest, was übernommen wird.
        </p>
        <div className="trustRow" aria-label="Produktprinzipien">
          <span>✓ Keine erfundenen Qualifikationen</span>
          <span>✓ Menschliche Freigabe</span>
          <span>✓ Löschbarer Vorgang</span>
        </div>
      </section>

      <nav className="stepper" aria-label="Bewerbungsprozess">
        {steps.map((step, index) => (
          <div className={`step ${index <= activeStep ? "active" : ""}`} key={step}>
            <span>{index + 1}</span>
            <b>{step}</b>
          </div>
        ))}
      </nav>

      {!result ? (
        <section className="workspace inputWorkspace">
          <form className="card formCard" onSubmit={submitApplication}>
            <div className="sectionHeading">
              <div>
                <span className="kicker">Schritt 1</span>
                <h2>Zielstelle und Nachweise</h2>
              </div>
              <span className="requiredHint">* Pflichtfeld</span>
            </div>

            <div className="fieldGrid twoCols">
              <label>
                Dein Name *
                <input name="candidateName" required placeholder="z. B. Alex Mustermann" />
              </label>
              <label>
                Zielposition
                <input
                  name="targetRole"
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value)}
                  autoComplete="organization-title"
                  placeholder="Tippe z. B. IT oder Cloud"
                />
                {roleSuggestions.length > 0 && (
                  <span className="suggestionList" aria-label="Vorschläge für Zielpositionen">
                    {roleSuggestions.map((role) => (
                      <button key={role} type="button" onClick={() => setTargetRole(role)}>{role}</button>
                    ))}
                  </span>
                )}
              </label>
            </div>

            <div className="fieldGrid twoCols">
              <label>
                Unternehmen
                <input name="company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Wird nach Möglichkeit aus dem Link erkannt" />
              </label>
              <label>
                Stellenlink
                <span className="linkInputRow">
                  <input
                    name="jobLink"
                    type="url"
                    value={jobLink}
                    onChange={(event) => {
                      setJobLink(event.target.value);
                      setLinkNotice("");
                    }}
                    onBlur={() => { if (!jobText && jobLink) void importJobLink(); }}
                    placeholder="https://…"
                  />
                  <button type="button" className="inlineButton" onClick={() => void importJobLink(true)} disabled={!jobLink || linkBusy}>
                    {linkBusy ? "Lese…" : "Übernehmen"}
                  </button>
                </span>
                {linkNotice && <small className="successText">✓ {linkNotice}</small>}
              </label>
            </div>

            <label>
              Stellenbeschreibung
              <textarea
                name="jobText"
                value={jobText}
                onChange={(event) => setJobText(event.target.value)}
                rows={7}
                placeholder="Optional, wenn der Stellenlink automatisch gelesen werden kann. Auch ein kurzer relevanter Ausschnitt genügt."
              />
              <small className="fieldHelp">Stellenlink oder Text genügt – keine starre Mindestzeichenzahl.</small>
            </label>

            <label>
              Lebenslauftext oder belegte Erfahrungen
              <textarea
                name="resumeText"
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                rows={7}
                placeholder="Optional bei einem lesbaren PDF-, DOCX- oder Text-Upload. Ergänze hier nur Informationen, die wirklich belegt sind."
              />
              <small className="fieldHelp">Datei oder Text genügt. Inhalte aus PDF, DOCX und TXT werden automatisch extrahiert.</small>
            </label>

            <div className="uploadBlock">
              <label className="uploadLabel" htmlFor="documents">
                <span className="uploadIcon">＋</span>
                <span>
                  <b>Lebenslauf, Zeugnisse oder Screenshot ergänzen</b>
                  <small>PDF, DOCX, TXT, PNG oder JPG · maximal 3 Dateien · je 5 MB</small>
                </span>
                <span className="uploadAction">Dateien wählen</span>
              </label>
              <input
                id="documents"
                className="srOnly"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))}
              />
              {fileSummary.length > 0 && (
                <ul className="fileList">
                  {fileSummary.map((file) => <li key={file}>{file}</li>)}
                </ul>
              )}
            </div>

            <label className="consentRow">
              <input type="checkbox" required />
              <span>Ich verwende für diese Demo nur fiktive oder ausdrücklich freigegebene Daten.</span>
            </label>

            {error && <div className="errorBox" role="alert">{error}</div>}

            <button className="primaryButton" disabled={busy} type="submit">
              {busy ? "Vorgang wird geprüft …" : "Bewerbung analysieren →"}
            </button>
          </form>

          <aside className="sideColumn">
            <div className="card processCard">
              <span className="kicker">Was passiert?</span>
              <ol>
                <li><b>Eingaben validieren</b><span>Dateityp, Größe und Pflichtfelder</span></li>
                <li><b>Dokumente verstehen</b><span>Text aus PDF, DOCX und TXT extrahieren</span></li>
                <li><b>Entwürfe erzeugen</b><span>Anschreiben, CV-Hinweise, Interviewfragen</span></li>
                <li><b>Du prüfst alles</b><span>Keine automatische Bewerbung</span></li>
              </ol>
            </div>
            <div className="card privacyCard">
              <span className="shield">◈</span>
              <div>
                <h3>Privacy by Design</h3>
                <p>Uploads werden analysiert, in der portablen Demo nicht dauerhaft gespeichert und der Vorgang bleibt löschbar.</p>
              </div>
            </div>
            <div className="card demoNote">
              <b>Demo-Modus</b>
              <p>Die App unterstützt Amazon Nova oder Claude über Bedrock. Ist kein Modell freigegeben, arbeitet ein sichtbar gekennzeichneter, verbesserter Regel-Fallback weiter.</p>
            </div>
          </aside>
        </section>
      ) : (
        <section className="resultsShell">
          <div className="resultHeader card">
            <div>
              <span className="kicker">Analyse abgeschlossen</span>
              <h2>Dein prüfbares Bewerbungspaket</h2>
              <p>{result.disclaimer}</p>
              <p className="providerLine">
                Analysemodus: <b>{result.provider === "bedrock-claude" ? "Claude über Amazon Bedrock" : result.provider === "bedrock-nova" ? "Amazon Nova über Amazon Bedrock" : result.fallbackUsed ? "Regel-Fallback" : "Nachvollziehbarer Regelabgleich"}</b>
              </p>
            </div>
            <div
              className="scoreRing"
              aria-label={`Demo-Übereinstimmung ${result.score} Prozent`}
              style={{ "--score": `${result.score}%` } as React.CSSProperties}
            >
              <strong>{result.score}%</strong>
              <span>Textabgleich</span>
            </div>
          </div>

          <article className="card resultCard profileCard">
            <div className="resultTitle"><span>◎</span><h3>Erkannte Profil-Highlights</h3></div>
            <ul>{result.profileHighlights.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>

          <div className="resultGrid">
            <article className="card resultCard matchesCard">
              <div className="resultTitle"><span>✓</span><h3>Belegte Übereinstimmungen</h3></div>
              <ul>{result.matches.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article className="card resultCard gapsCard">
              <div className="resultTitle"><span>!</span><h3>Offene Anforderungen</h3></div>
              <ul>{result.gaps.map((item) => <li key={item}>{item}</li>)}</ul>
              <small>Nicht automatisch als fehlende Fähigkeit bewerten – erst mit Nachweisen prüfen.</small>
            </article>
          </div>

          <details className="card sourceDetails">
            <summary>Verwendete Quellen und Verarbeitung</summary>
            <ul>{result.sourceSummary.map((item) => <li key={item}>{item}</li>)}</ul>
            <small>Originalunterlagen bleiben maßgeblich. Hochgeladene Dateien werden in der portablen Demo nicht dauerhaft gespeichert.</small>
          </details>

          <article className="card editorCard">
            <div className="sectionHeading">
              <div><span className="kicker">Bearbeitbarer Entwurf</span><h2>Anschreiben</h2></div>
              <span className="humanBadge">Human in the loop</span>
            </div>
            <textarea value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} rows={14} />
          </article>

          <div className="resultGrid">
            <article className="card resultCard">
              <div className="resultTitle"><span>↗</span><h3>Lebenslauf verbessern</h3></div>
              <ul>{result.cvSuggestions.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article className="card resultCard">
              <div className="resultTitle"><span>?</span><h3>Interview vorbereiten</h3></div>
              <ol>{result.interviewQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
            </article>
          </div>

          <div className="resultActions">
            <button className="quietButton" type="button" onClick={deleteAndReset}>Vorgang löschen & neu starten</button>
            <button className="quietButton" type="button" onClick={downloadCoverLetter}>Anschreiben herunterladen</button>
            <button className="quietButton" type="button" onClick={downloadPackage}>Gesamtpaket herunterladen</button>
            <button className="primaryButton compact" type="button" onClick={() => window.print()}>Als PDF drucken</button>
          </div>
        </section>
      )}

      <footer>
        <span>CareerPilot AI · IHK Cloud Business Expert Proof of Concept</span>
        <span>Demo mit fiktiven Daten · keine automatische Personalentscheidung</span>
      </footer>
    </main>
  );
}
