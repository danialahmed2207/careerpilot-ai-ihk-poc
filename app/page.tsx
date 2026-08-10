"use client";

import { FormEvent, useMemo, useState } from "react";

type AnalysisResult = {
  applicationId: string;
  score: number;
  matches: string[];
  gaps: string[];
  cvSuggestions: string[];
  coverLetter: string;
  interviewQuestions: string[];
  disclaimer: string;
};

const steps = ["Unterlagen", "Abgleich", "Bewerbungspaket", "Export"];

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeStep = result ? 2 : busy ? 1 : 0;
  const fileSummary = useMemo(
    () => files.map((file) => `${file.name} · ${(file.size / 1024).toFixed(0)} KB`),
    [files],
  );

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
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareerPilot AI Startseite">
          <span className="brandMark">C</span>
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
                Zielposition *
                <input name="targetRole" required placeholder="z. B. Cloud Support Specialist" />
              </label>
            </div>

            <div className="fieldGrid twoCols">
              <label>
                Unternehmen *
                <input name="company" required placeholder="z. B. Nordlicht Digital GmbH" />
              </label>
              <label>
                Stellenlink
                <input name="jobLink" type="url" placeholder="https://…" />
              </label>
            </div>

            <label>
              Stellenbeschreibung *
              <textarea
                name="jobText"
                required
                minLength={80}
                rows={7}
                placeholder="Füge Aufgaben, Anforderungen und gewünschte Kenntnisse ein. Mindestens 80 Zeichen."
              />
            </label>

            <label>
              Lebenslauftext oder belegte Erfahrungen *
              <textarea
                name="resumeText"
                required
                minLength={80}
                rows={7}
                placeholder="Füge ausschließlich nachweisbare Stationen, Kenntnisse und Projekte ein. Im POC wird kein Text aus Dateien ausgelesen."
              />
            </label>

            <div className="uploadBlock">
              <label className="uploadLabel" htmlFor="documents">
                <span className="uploadIcon">＋</span>
                <span>
                  <b>Lebenslauf, Zeugnisse oder Screenshot ergänzen</b>
                  <small>PDF, DOCX, PNG oder JPG · maximal 3 Dateien · je 5 MB</small>
                </span>
                <span className="uploadAction">Dateien wählen</span>
              </label>
              <input
                id="documents"
                className="srOnly"
                type="file"
                multiple
                accept=".pdf,.docx,.png,.jpg,.jpeg"
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
                <li><b>Belege abgleichen</b><span>Nur Begriffe aus deinen Eingaben</span></li>
                <li><b>Entwürfe erzeugen</b><span>Anschreiben, CV-Hinweise, Interviewfragen</span></li>
                <li><b>Du prüfst alles</b><span>Keine automatische Bewerbung</span></li>
              </ol>
            </div>
            <div className="card privacyCard">
              <span className="shield">◈</span>
              <div>
                <h3>Privacy by Design</h3>
                <p>Der Vorgang kann samt hochgeladenen Dateien direkt gelöscht werden.</p>
              </div>
            </div>
            <div className="card demoNote">
              <b>Demo-Modus</b>
              <p>Die erste Version nutzt einen nachvollziehbaren Regelabgleich. Ein echtes Sprachmodell wird erst nach Provider-, Vertrags- und Datenschutzprüfung angeschlossen.</p>
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
            </div>
            <div
              className="scoreRing"
              aria-label={`Demo-Übereinstimmung ${result.score} Prozent`}
              style={{ "--score": `${result.score}%` } as React.CSSProperties}
            >
              <strong>{result.score}%</strong>
              <span>Demo-Match</span>
            </div>
          </div>

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
            <button className="primaryButton compact" type="button" onClick={() => window.print()}>Geprüfte Ansicht exportieren</button>
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
