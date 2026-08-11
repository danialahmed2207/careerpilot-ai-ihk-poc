# CareerPilot AI – IHK Proof of Concept

CareerPilot AI unterstützt Bewerbende dabei, belegte Erfahrungen mit einer konkreten Stellenanzeige abzugleichen. Die Anwendung liest einen Stellenlink oder eingefügten Text, extrahiert Inhalte aus Lebenslauf und Nachweisen, kennzeichnet Übereinstimmungen und offene Prüfpositionen und erzeugt ein bearbeitbares Bewerbungspaket. Sie trifft keine Personalentscheidung und versendet keine Bewerbung automatisch.

## Funktionsumfang

- Stellenlink automatisch einlesen; strukturierte `JobPosting`-Daten werden bevorzugt
- Vorschläge für Zielpositionen schon bei kurzen Eingaben wie `IT`
- PDF-, DOCX-, TXT-, Markdown-, PNG- und JPG-Upload, maximal drei Dateien à 5 MB
- Textextraktion aus PDF, DOCX und Textdateien
- evidenzbasierter Stellenabgleich ohne erfundene Qualifikationen
- Profil-Highlights, offene Anforderungen und fünf konkrete Lebenslaufhinweise
- professioneller, bearbeitbarer Anschreibenentwurf und fünf Interviewfragen
- Download von Anschreiben und Gesamtpaket sowie PDF-Druckansicht
- löschbarer Vorgang; im portablen Demonstrator werden Uploads standardmäßig nicht persistiert

Es gibt keine starre 80-Zeichen-Grenze. Kurze, inhaltlich verwertbare Eingaben sind zulässig. Ein Lebenslauftext oder ein lesbares Dokument sowie ein Stellenlink oder ein kurzer Ausschnitt der Stellenanzeige bleiben erforderlich.

## Analysemodi

- `rules`: nachvollziehbarer, kostenfreier Standard für lokale Demo und Fallback
- `bedrock-nova`: Amazon Nova 2 Lite über Amazon Bedrock
- `bedrock-claude`: ein freigegebenes Claude-Modell über Amazon Bedrock

Standardmodell für Bedrock ist `eu.amazon.nova-2-lite-v1:0`. Es wird über die Bedrock-Converse-API angesprochen. Ist Bedrock nicht verfügbar, wechselt die Anwendung sichtbar auf den Regelmodus. Mit `AI_STRICT_MODE=true` wird der Aufruf stattdessen abgebrochen. Ein erfolgreicher Modellaufruf ist erst dann nachgewiesen, wenn das verwendete AWS-Konto Modellzugriff und `bedrock:InvokeModel` erlaubt; der vorhandene Student-Sandbox-Test hat nur den Container- und Regelbetrieb nachgewiesen.

Zugangsschlüssel gehören weder in Git noch in den Browser. Im AWS-Zielbetrieb nutzt der Container ausschließlich temporäre Berechtigungen einer ECS Task Role.

## Lokal ausführen

Voraussetzung ist Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Qualitätsprüfung:

```bash
npm run lint
npm test
npm audit --omit=dev
```

## Docker

```bash
docker compose up --build
```

Danach ist die Anwendung unter `http://localhost:8080` erreichbar. Der Container läuft als unprivilegierter Nutzer mit UID `10001`, besitzt einen HTTP-Healthcheck und hält Demo-Vorgänge nur flüchtig im Arbeitsspeicher.

Direkter Start im Regelmodus:

```bash
docker build -t careerpilot-ai:ihk-poc .
docker run --rm -p 8080:3000 \
  -e CAREERPILOT_RUNTIME=node \
  -e AI_PROVIDER=rules \
  careerpilot-ai:ihk-poc
```

## Bedrock mit Amazon Nova

Für einen freigegebenen AWS-Test werden keine statischen Schlüssel in das Image kopiert. Die Laufzeit erhält eine zeitlich und fachlich begrenzte IAM-Rolle:

```bash
AI_PROVIDER=bedrock-nova \
AWS_REGION=eu-central-1 \
BEDROCK_MODEL_ID=eu.amazon.nova-2-lite-v1:0 \
npm run dev
```

Für einen kontrollierten Abnahmetest ohne Fallback zusätzlich:

```bash
AI_STRICT_MODE=true
```

## Datenschutz- und Sicherheitsgrenzen des PoC

- Nur fiktive oder ausdrücklich freigegebene Daten verwenden.
- Rohdateien werden im portablen Demonstrator nicht gespeichert, solange `PERSIST_UPLOADS=false` gesetzt ist.
- Der Stellenlink-Importer blockiert offensichtliche lokale/private Adressen, begrenzt Weiterleitungen, Zeit und Datenmenge. Für Produktion ist zusätzlich kontrollierter ausgehender Netzwerkverkehr beziehungsweise ein gehärteter Fetch-Dienst erforderlich.
- Bildinhalte werden nur im multimodalen Bedrock-Modus ausgewertet; der Regelmodus enthält keine OCR.
- Produktionsreife erfordert unter anderem DSFA-Prüfung, Penetrationstest, Betriebsfreigabe, Monitoring und verifizierte Löschläufe.

## Zielarchitektur und Prüfungsbezug

Die Anwendung ist der fachliche Geschäftstreiber des IHK-Szenarios. Der Schwerpunkt der Projektpräsentation liegt auf der Migration der fiktiven TalentBridge GmbH von einer nicht skalierbaren Bestandsinfrastruktur in eine kontrollierte AWS-Zielarchitektur: Containerbetrieb, private Subnetze, S3/RDS, Bedrock, IAM/KMS, Monitoring, Backup, Kosten und stufenweiser Cutover mit Rollback.

Der lokale PoC beweist die Anwendungslogik und Container-Portabilität. Er beweist nicht automatisch die vollständige Fargate-Zielarchitektur oder eine erfolgreiche Bedrock-Inferenz.
