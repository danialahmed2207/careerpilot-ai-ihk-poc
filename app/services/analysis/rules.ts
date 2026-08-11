import type { AnalysisInput, AnalysisResult } from "./types";

const stopWords = new Set([
  "aber", "alle", "auch", "dass", "eine", "einem", "einen", "einer", "eines", "für", "oder", "sind",
  "über", "und", "unsere", "werden", "wird", "with", "your", "the", "kenntnisse", "erfahrung", "erfahrungen",
  "aufgaben", "anforderungen", "sowie", "mehr", "durch", "sehr", "gute", "guten", "bereits", "bereich",
  "bringen", "gesucht", "suchen", "teams", "team", "stellenbeschreibung", "position", "unternehmen",
]);

const shortTechTokens = new Set(["ai", "aws", "c#", "go", "it", "ki", "ml", "sap", "sql", "ui", "ux"]);

const competencies = [
  { label: "Amazon Web Services (AWS)", aliases: ["aws", "amazon web services", "ec2", "s3", "bedrock"] },
  { label: "Microsoft Azure", aliases: ["azure", "entra id", "azure devops"] },
  { label: "Google Cloud", aliases: ["gcp", "google cloud"] },
  { label: "Docker und Container", aliases: ["docker", "container", "containerisierung"] },
  { label: "Kubernetes", aliases: ["kubernetes", "k8s", "eks", "aks"] },
  { label: "Linux", aliases: ["linux", "ubuntu", "debian", "amazon linux"] },
  { label: "Netzwerke", aliases: ["netzwerk", "network", "tcp/ip", "dns", "routing", "firewall", "vpn"] },
  { label: "IT-Support", aliases: ["it support", "it-support", "helpdesk", "service desk", "ticketsystem", "störung"] },
  { label: "Microsoft 365", aliases: ["microsoft 365", "m365", "office 365"] },
  { label: "Identity & Access Management", aliases: ["iam", "identity", "berechtigung", "active directory", "entra"] },
  { label: "CI/CD und Automatisierung", aliases: ["ci/cd", "pipeline", "github actions", "gitlab ci", "jenkins", "automatisierung"] },
  { label: "Infrastructure as Code", aliases: ["terraform", "cloudformation", "infrastructure as code", "iac", "ansible"] },
  { label: "Monitoring und Logging", aliases: ["monitoring", "logging", "cloudwatch", "prometheus", "grafana"] },
  { label: "IT-Sicherheit", aliases: ["security", "sicherheit", "isms", "iso 27001", "vulnerability", "zero trust"] },
  { label: "Datenschutz und DSGVO", aliases: ["dsgvo", "gdpr", "datenschutz"] },
  { label: "Projektmanagement", aliases: ["projektmanagement", "scrum", "kanban", "agil", "jira"] },
  { label: "Kundenkommunikation", aliases: ["kundenkommunikation", "kundenservice", "beratung", "stakeholder", "workshop"] },
  { label: "Python", aliases: ["python"] },
  { label: "JavaScript/TypeScript", aliases: ["javascript", "typescript", "node.js", "nodejs", "react", "next.js"] },
  { label: "Datenbanken und SQL", aliases: ["sql", "postgresql", "mysql", "datenbank", "database"] },
];

function normalized(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[–—]/g, "-");
}

function containsAlias(value: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9äöüß+#])${escaped}([^a-z0-9äöüß+#]|$)`, "i").test(value);
}

function detectedCompetencies(value: string) {
  const text = normalized(value);
  return competencies.filter((competency) => competency.aliases.some((alias) => containsAlias(text, alias)));
}

function tokens(value: string) {
  return Array.from(new Set(
    normalized(value)
      .replace(/[^a-z0-9äöüß+#./-]+/gi, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^[./+-]+|[./+-]+$/g, ""))
      .filter((token) => (token.length >= 4 || shortTechTokens.has(token)) && !stopWords.has(token)),
  ));
}

function sentences(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 28 && sentence.length <= 320);
}

function topEvidenceSentences(resumeText: string, jobText: string) {
  const jobSet = new Set(tokens(jobText));
  return sentences(resumeText)
    .map((sentence, index) => {
      const overlap = tokens(sentence).filter((token) => jobSet.has(token)).length;
      const tech = detectedCompetencies(sentence).length;
      const concrete = /\b(19|20)\d{2}\b|\b\d+[.,]?\d*\s*(%|prozent|jahre?|monate?|projekte?|kunden?|tickets?)\b/i.test(sentence) ? 2 : 0;
      const action = /\b(analysiert|administriert|automatisiert|aufgebaut|begleitet|betreut|dokumentiert|erstellt|gelöst|implementiert|koordiniert|migriert|optimiert|umgesetzt|verantwortet)\b/i.test(sentence) ? 4 : 0;
      const keywordListPenalty = /^\s*(kenntnisse|skills|technologien|tools)\s*:/i.test(sentence) ? 18 : 0;
      return { sentence, score: overlap * 3 + tech * 2 + concrete + action - keywordListPenalty, index };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .map((item) => item.sentence);
}

function compactQuote(value: string, max = 190) {
  const cleaned = value.replace(/^[•*-]\s*/, "").replace(/\s+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1).trim()}…`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildProfessionalCoverLetter(
  input: AnalysisInput,
  matchedLabels: string[],
  gapLabels: string[],
  evidence: string[],
) {
  const role = input.targetRole || "die ausgeschriebene Position";
  const salutationCompany = input.company ? `bei ${input.company}` : "in Ihrem Unternehmen";
  const fit = matchedLabels.length
    ? matchedLabels.slice(0, 4).join(", ")
    : "strukturiertem Arbeiten, verlässlicher Zusammenarbeit und schneller Einarbeitung";
  const proofParagraph = evidence.length
    ? `Meine Unterlagen enthalten dazu konkrete Anknüpfungspunkte. Besonders relevant ist folgende Erfahrung: ${evidence.slice(0, 2).map((item) => `„${compactQuote(item).replace(/[.!?]+$/, "")}“`).join(". Ergänzend ist dokumentiert: ")}. Diese Nachweise möchte ich nutzen, um mich zügig in Ihre Abläufe einzuarbeiten und Aufgaben nicht nur auszuführen, sondern nachvollziehbar zu dokumentieren.`
    : "Meine beigefügten Unterlagen zeigen die relevanten Stationen und Kenntnisse. Im persönlichen Gespräch erläutere ich gern anhand konkreter Beispiele, welche Erfahrungen sich direkt auf Ihre Aufgaben übertragen lassen.";
  const transparentGap = gapLabels.length === 1
    ? `Die Anforderung „${gapLabels[0]}“ ist in meinen bisherigen Unterlagen noch nicht eindeutig belegt. Statt hier etwas vorauszusetzen, möchte ich transparent darstellen, welche übertragbaren Erfahrungen vorhanden sind und wie ich mich gezielt in dieses Thema einarbeite.`
    : gapLabels.length > 1
      ? `Die Anforderungen ${gapLabels.slice(0, 2).map((item) => `„${item}“`).join(" und ")} sind in meinen bisherigen Unterlagen noch nicht eindeutig belegt. Statt hier etwas vorauszusetzen, möchte ich transparent darstellen, welche übertragbaren Erfahrungen vorhanden sind und wie ich mich gezielt in diese Themen einarbeite.`
      : "Weitere fachliche Details und Erwartungen an die Rolle würde ich gern im persönlichen Gespräch präzisieren.";

  const jobFocus = matchedLabels.length
    ? `Die in Ihrer Ausschreibung erkennbaren Schwerpunkte ${matchedLabels.slice(0, 3).join(", ")} passen zu meinem fachlichen Profil. Dabei ist mir wichtig, technische Aufgaben strukturiert zu bearbeiten, Entscheidungen verständlich zu dokumentieren und Rückfragen verbindlich zu klären.`
    : "Der beschriebene Aufgabenmix passt zu meiner Motivation, technische Themen strukturiert zu bearbeiten, Entscheidungen nachvollziehbar zu dokumentieren und neue Anforderungen zügig zu erschließen.";

  return `Betreff: Bewerbung als ${role}

Sehr geehrte Damen und Herren,

die ausgeschriebene Position als ${role} ${salutationCompany} interessiert mich, weil sie fachliche Verantwortung mit einer strukturierten und verlässlichen Zusammenarbeit verbindet. Für die beschriebenen Aufgaben bringe ich nachweisbare Berührungspunkte insbesondere in den Bereichen ${fit} mit.

${jobFocus}

${proofParagraph}

Ich möchte meine Erfahrung gezielt in bestehende Abläufe einbringen, Aufgaben nach Wirkung und Dringlichkeit priorisieren und Ergebnisse sauber dokumentieren. Bei technischen Fragestellungen arbeite ich mich systematisch vom Problem über die Ursache bis zu einer überprüfbaren Lösung vor. Gleichzeitig lege ich Wert darauf, Zusammenhänge so zu erklären, dass auch beteiligte Personen ohne denselben technischen Hintergrund Entscheidungen nachvollziehen können.

${transparentGap}

Die Position bietet aus meiner Sicht eine gute Möglichkeit, vorhandene Erfahrung wirksam einzusetzen und mich in den für Ihr Team relevanten Themen gezielt weiterzuentwickeln. Gern erläutere ich Ihnen persönlich, welchen konkreten Beitrag ich leisten kann und welche meiner bisherigen Erfahrungen für Ihre aktuellen Aufgaben besonders relevant sind. Über die Einladung zu einem Gespräch freue ich mich.

Mit freundlichen Grüßen
${input.candidateName}`;
}

export function buildRuleBasedAnalysis(input: AnalysisInput, fallbackUsed = false): AnalysisResult {
  const jobCompetencies = detectedCompetencies(input.jobText);
  const resumeCompetencies = detectedCompetencies(input.resumeText);
  const resumeLabels = new Set(resumeCompetencies.map((item) => item.label));
  const matchedCompetencies = jobCompetencies.filter((item) => resumeLabels.has(item.label));
  const gapCompetencies = jobCompetencies.filter((item) => !resumeLabels.has(item.label));

  const jobTokens = tokens(input.jobText).slice(0, 100);
  const resumeSet = new Set(tokens(input.resumeText));
  const tokenMatches = jobTokens.filter((token) => resumeSet.has(token));
  const evidence = topEvidenceSentences(input.resumeText, input.jobText);

  const matchLabels = unique(matchedCompetencies.map((item) => item.label)).slice(0, 7);
  const gapLabels = unique(gapCompetencies.map((item) => item.label))
    .filter((item) => !matchLabels.includes(item))
    .slice(0, 6);

  const requirements = jobCompetencies.length
    ? unique(jobCompetencies.map((item) => item.label))
    : unique(jobTokens.slice(0, 12));
  const covered = jobCompetencies.length
    ? unique(matchedCompetencies.map((item) => item.label))
    : unique(tokenMatches.slice(0, 12));
  const ratio = requirements.length ? covered.length / requirements.length : 0;
  const score = Math.max(25, Math.min(92, Math.round(30 + ratio * 62)));

  const profileHighlights = unique([
    ...evidence.map((item) => `Konkreter Nachweis: ${compactQuote(item, 150)}`),
    ...resumeCompetencies.map((item) => `${item.label} ist als Kompetenz in den Unterlagen erkennbar.`),
  ]).slice(0, 6);

  const role = input.targetRole || "die Zielposition";
  const company = input.company || "das Zielunternehmen";
  const strongest = matchLabels.slice(0, 3);
  const firstGap = gapLabels[0];

  return {
    score,
    matches: matchLabels.length
      ? matchLabels.map((item) => `Belegter Anknüpfungspunkt: ${item}`)
      : ["Noch keine eindeutige Übereinstimmung erkannt – Unterlagen oder Stellenbeschreibung ergänzen."],
    gaps: gapLabels.length
      ? gapLabels.map((item) => `Offene Prüfposition: ${item} – nur mit einem echten Nachweis ergänzen.`)
      : ["Keine weitere eindeutige Prüfposition erkannt; Detailanforderungen im Gespräch validieren."],
    profileHighlights: profileHighlights.length
      ? profileHighlights
      : ["Aus dem bereitgestellten Text konnten noch keine belastbaren Profil-Highlights extrahiert werden."],
    cvSuggestions: unique([
      strongest.length ? `Profilüberschrift auf „${role} | ${strongest.join(" | ")}“ zuschneiden, sofern diese Begriffe fachlich passen.` : `Profilüberschrift klar auf „${role}“ ausrichten.`,
      evidence[0] ? `Den konkreten Nachweis „${compactQuote(evidence[0], 130)}“ als ergebnisorientierten Bullet unter der passenden Station platzieren.` : "Unter jeder Station Aufgabe, Vorgehen, Werkzeug und nachweisbares Ergebnis getrennt darstellen.",
      strongest.length ? `Die belegten Schwerpunkte ${strongest.join(", ")} im oberen Drittel des Lebenslaufs sichtbar machen.` : "Relevante Kenntnisse im oberen Drittel bündeln und mit Stationen verknüpfen.",
      firstGap ? `Für „${firstGap}“ entweder einen echten Projektbeleg ergänzen oder die Lern- beziehungsweise Transfererfahrung transparent formulieren.` : "Keine Schlagwörter ergänzen, die sich nicht durch Stationen, Projekte oder Zertifikate belegen lassen.",
      `Lebenslauf auf ${company} zuschneiden: weniger relevante Aufgaben kürzen und die für ${role} passenden Ergebnisse priorisieren.`,
    ]).slice(0, 5),
    coverLetter: buildProfessionalCoverLetter(input, matchLabels, gapLabels, evidence),
    interviewQuestions: [
      evidence[0] ? `Welche Situation, Aufgabe, Handlung und welches Ergebnis stecken konkret hinter: „${compactQuote(evidence[0], 120)}“?` : "Welche bisherige Aufgabe belegt deine Eignung für die Zielrolle am besten?",
      strongest[0] ? `Wie hast du ${strongest[0]} praktisch eingesetzt und woran war der Erfolg erkennbar?` : "Welche übertragbare Erfahrung möchtest du im Gespräch zuerst erläutern?",
      firstGap ? `Wie ordnest du transparent ein, dass „${firstGap}“ in den Unterlagen noch nicht eindeutig belegt ist?` : "Welche fachliche Anforderung möchtest du im Gespräch genauer klären?",
      `Warum möchtest du gerade als ${role} bei ${company} arbeiten?`,
      "Welche Rückfrage stellst du zu Aufgaben, Erfolgskriterien, Team und Einarbeitung?",
    ],
    sourceSummary: input.sourceSummary ?? ["Manuell eingegebene Stellenbeschreibung", "Manuell eingegebener Lebenslauftext"],
    disclaimer: fallbackUsed
      ? "Das Bedrock-Modell war nicht verfügbar. Transparenter, lokal nachvollziehbarer Regel-Fallback; keine Eignungsentscheidung. Jede Aussage muss anhand der Originalunterlagen geprüft werden."
      : "Nachvollziehbarer Regelabgleich, keine Eignungsentscheidung. Jede Aussage muss anhand der Originalunterlagen geprüft und bearbeitet werden.",
    provider: "rules",
    model: "careerpilot-evidence-rules-v2",
    fallbackUsed,
  };
}
