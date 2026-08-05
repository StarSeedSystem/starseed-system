import { NextRequest, NextResponse } from "next/server";

// ════════════════════════════════════════════════════════════════
// POST /api/csp-report — receptor de violaciones de Content-Security-Policy
// (hoy solo "-Report-Only", ver next.config.ts § headers(); Adenda 139).
//
// PÚBLICO por diseño y a propósito: quien llama a este endpoint es el
// NAVEGADOR del visitante (fetch/beacon interno disparado al violar la
// política), nunca el propio usuario, y ocurre en páginas públicas
// (/login, /comunidad…) donde puede no haber sesión. Exigir auth aquí no
// protegería nada (no hay datos sensibles que leer ni escribir en el
// sistema) y solo perdería reportes. Solo acepta POST: cualquier otro
// verbo recibe el 405 automático de Next.js por no estar exportado aquí.
//
// FORMATOS QUE PUEDE MANDAR EL NAVEGADOR (según cuál soporte cada uno; ver
// las cabeceras `report-uri`/`report-to`/`Report-To`/`Reporting-Endpoints`
// en next.config.ts, todas apuntando aquí):
//   1. Legacy `application/csp-report` (CSP Level 2 — Firefox, Safari, y
//      Chrome vía `report-uri`): un objeto con TODO bajo la clave
//      "csp-report", en claves kebab-case ("document-uri", "blocked-uri"…).
//   2. Reporting API v1 `application/reports+json` (Chrome moderno vía
//      `report-to`/`Reporting-Endpoints`): un ARRAY que puede traer varios
//      reportes de una vez (incluso de otros orígenes de reporte, no solo
//      CSP), cada uno con { type, url, body:{...} } en claves camelCase.
// Se aceptan ambos y cualquier variante razonable de JSON; lo que no
// encaje se normaliza igualmente en la forma que logueamos, sin descartar
// la señal solo porque la forma exacta no coincide.
//
// DEFENSIVO end-to-end: nunca lanza. Content-Type ausente/raro, cuerpo no
// JSON, JSON con forma inesperada, stream que se corta a medias… todo cae
// en un log best-effort y un 204 (el navegador no hace nada con la
// respuesta de un endpoint de reportes; no tiene sentido devolver un error
// que nadie va a leer). Tope de tamaño en dos capas — por `Content-Length`
// ANTES de leer el cuerpo, y por longitud real DESPUÉS — para que un POST
// hostil a este endpoint público (sin auth, en internet) no pueda usarlo
// para hinchar los logs sin límite; un reporte CSP real pesa, como mucho,
// unos pocos KB.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tope de bytes del cuerpo que procesamos. Un reporte real pesa unos cientos
 *  de bytes (o unos pocos KB si el array trae varios); por encima de esto ya
 *  no es un reporte legítimo del navegador. */
const MAX_BODY_BYTES = 20_000;
/** Tope adicional sobre cuánto texto de muestra entra en un log individual
 *  (por si el cuerpo, ya dentro del tope de arriba, trae un `sample`/script
 *  larguísimo — no queremos una sola línea de log gigante). */
const MAX_SAMPLE_CHARS = 2_000;

/** Forma normalizada y única en la que logueamos, sea cual sea el formato
 *  de entrada. Todo opcional a propósito: nunca falla por falta de un campo. */
interface NormalizedCspReport {
  format: "csp-report" | "reports+json";
  documentUri?: string;
  referrer?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  statusCode?: number;
  disposition?: string;
  sample?: string;
  originalPolicy?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, maxLen = 2000): string | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Normaliza un objeto "csp-report" legacy (claves kebab-case, CSP Level 2). */
function normalizeLegacy(raw: Record<string, unknown>): NormalizedCspReport {
  return {
    format: "csp-report",
    documentUri: asString(raw["document-uri"]),
    referrer: asString(raw["referrer"]),
    violatedDirective: asString(raw["violated-directive"]),
    effectiveDirective: asString(raw["effective-directive"]),
    blockedUri: asString(raw["blocked-uri"]),
    sourceFile: asString(raw["source-file"]),
    lineNumber: asNumber(raw["line-number"]),
    columnNumber: asNumber(raw["column-number"]),
    statusCode: asNumber(raw["status-code"]),
    disposition: asString(raw["disposition"]),
    sample: asString(raw["script-sample"], MAX_SAMPLE_CHARS),
    originalPolicy: asString(raw["original-policy"]),
  };
}

/** Normaliza UN elemento del array de la Reporting API v1 (claves camelCase,
 *  anidadas bajo `body`; `url`/`user_agent` van en el nivel superior). */
function normalizeReportsJson(raw: Record<string, unknown>): NormalizedCspReport {
  const body = isRecord(raw["body"]) ? raw["body"] : {};
  return {
    format: "reports+json",
    documentUri: asString(body["documentURL"]) ?? asString(raw["url"]),
    referrer: asString(body["referrer"]),
    violatedDirective: asString(body["effectiveDirective"]),
    effectiveDirective: asString(body["effectiveDirective"]),
    blockedUri: asString(body["blockedURL"]),
    sourceFile: asString(body["sourceFile"]),
    lineNumber: asNumber(body["lineNumber"]),
    columnNumber: asNumber(body["columnNumber"]),
    statusCode: asNumber(body["statusCode"]),
    disposition: asString(body["disposition"]),
    sample: asString(body["sample"], MAX_SAMPLE_CHARS),
    originalPolicy: asString(body["originalPolicy"]),
  };
}

/**
 * Extrae de `parsed` (forma desconocida a priori) los reportes normalizados
 * que contiene, sea cual sea el formato de entrada. Nunca lanza: ante una
 * forma no reconocida, hace lo posible por no perder la señal en vez de
 * descartarla en silencio.
 */
function extractReports(parsed: unknown): NormalizedCspReport[] {
  try {
    if (Array.isArray(parsed)) {
      // Reporting API v1: el array puede traer otros tipos de reporte además
      // de "csp-violation" (deprecation, intervention…). Nos quedamos solo
      // con los de CSP si hay alguno etiquetado; si no, procesamos todo el
      // array igualmente (mejor loguear de más que perder la señal).
      const records = parsed.filter(isRecord);
      const cspOnly = records.filter((r) => r["type"] === "csp-violation");
      const source = cspOnly.length > 0 ? cspOnly : records;
      return source.map(normalizeReportsJson);
    }
    if (isRecord(parsed)) {
      const cspReport = parsed["csp-report"];
      if (isRecord(cspReport)) return [normalizeLegacy(cspReport)];
      // Objeto sin el envoltorio "csp-report": lo tratamos igual como legacy
      // "plano" por si algún navegador/proxy antiguo manda las claves sueltas.
      return [normalizeLegacy(parsed)];
    }
  } catch {
    /* cae al array vacío de abajo: nunca lanzamos desde aquí */
  }
  return [];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Corte barato ANTES de leer el cuerpo si el navegador declaró un tamaño
  // desproporcionado — evita bufferizar de más en un endpoint público sin auth.
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    console.warn("[CSP-REPORT] cuerpo descartado por Content-Length excesivo", {
      declaredLength,
      capBytes: MAX_BODY_BYTES,
    });
    return new NextResponse(null, { status: 204 });
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    // Stream ilegible/roto (encoding raro, conexión cortada a medias…): no
    // hay nada más que hacer, pero seguimos respondiendo 204 igualmente.
    return new NextResponse(null, { status: 204 });
  }

  // Segundo tope, DESPUÉS de leer, por si no venía Content-Length (p.ej.
  // chunked transfer-encoding) — nunca dejamos que lo leído crudo se use tal
  // cual sin pasar antes por este límite.
  const truncated = rawText.length > MAX_BODY_BYTES;
  const text = truncated ? rawText.slice(0, MAX_BODY_BYTES) : rawText;

  if (!text.trim()) {
    return new NextResponse(null, { status: 204 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Cuerpo no-JSON: dejamos una muestra corta para poder diagnosticar sin
    // arriesgarnos a loguear un cuerpo enorme o binario.
    console.warn("[CSP-REPORT] cuerpo no-JSON recibido", {
      contentType: req.headers.get("content-type") ?? undefined,
      sample: text.slice(0, MAX_SAMPLE_CHARS),
      truncated,
    });
    return new NextResponse(null, { status: 204 });
  }

  const reports = extractReports(parsed);
  if (reports.length === 0) {
    console.warn("[CSP-REPORT] cuerpo JSON con forma no reconocida", {
      contentType: req.headers.get("content-type") ?? undefined,
      truncated,
    });
    return new NextResponse(null, { status: 204 });
  }

  const contentType = req.headers.get("content-type") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const receivedAt = new Date().toISOString();

  for (const report of reports) {
    console.warn("[CSP-REPORT]", {
      ...report,
      contentType,
      userAgent,
      truncated: truncated || undefined,
      receivedAt,
    });
  }

  // 204 No Content: es una respuesta a un beacon del navegador, no a un
  // usuario ni a un cliente que vaya a leer un cuerpo — no hay nada que devolver.
  return new NextResponse(null, { status: 204 });
}
