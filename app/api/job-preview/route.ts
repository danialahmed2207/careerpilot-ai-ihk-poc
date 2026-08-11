import { importJobFromUrl } from "../../lib/job-import";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return Response.json({ error: "Bitte einen Stellenlink eingeben." }, { status: 400 });
    return Response.json(await importJobFromUrl(url));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Die Stellenanzeige konnte nicht eingelesen werden.";
    return Response.json({ error: message }, { status: 422 });
  }
}
