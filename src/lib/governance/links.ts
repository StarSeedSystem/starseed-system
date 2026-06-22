// StarSeed · Ontocracia — Deep-links de propuestas PREFILLED.
// Permite que cualquier origen (grupos, Nexus, páginas, comunidades, etc.)
// construya una URL hacia /decisiones con una propuesta ya rellenada y lista
// para enviar. El esquema es estable y reversible:
//
//   ${base}/decisiones?nueva=1&scope=...&scopeRef=...&title=...&cmd=<type>&payload=<base64url(JSON(command.payload))>&desc=...
//
// Es ADITIVO: /decisiones sigue funcionando sin estos parámetros.

import type { CommandSpec } from "@/lib/governance/types";

// ---- base64url (compatible con exocortex.js del Nexus) ----------------------
// Codifica una cadena UTF-8 a base64url sin relleno. Mismo esquema que el JS
// del Nexus: btoa(unescape(encodeURIComponent(str))) + sustituciones.
export function b64urlEncode(input: string): string {
  let b64: string;
  if (typeof btoa === "function") {
    b64 = btoa(unescape(encodeURIComponent(input)));
  } else {
    // Entorno Node/SSR sin btoa.
    b64 = Buffer.from(input, "utf-8").toString("base64");
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Decodifica base64url -> cadena UTF-8 (tolerante: añade relleno, restaura
// caracteres). Devuelve "" ante cualquier error.
export function b64urlDecode(input: string): string {
  try {
    let b64 = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(b64)));
    }
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

export type ProposalLinkInput = {
  scope?: string;
  scopeRef?: string;
  title?: string;
  description?: string;
  command?: CommandSpec;
};

// Borrador parseado desde la URL, con la forma que consume <GovernancePanel/>
// (y, vía éste, el `initial` de <ProposalComposer/>).
export type ParsedProposalInitial = {
  title?: string;
  description?: string;
  command?: CommandSpec;
};

export type ParsedProposalParams = {
  open: boolean;
  initial?: ParsedProposalInitial;
  scope?: string;
  scopeRef?: string;
};

// Construye la URL de propuesta prefilled. `base` puede ser "" para una ruta
// relativa (mismo origen) o un origen completo p.ej. "https://starseed-os.vercel.app".
export function buildProposalLink(base: string, input: ProposalLinkInput): string {
  const { scope, scopeRef, title, description, command } = input || {};
  const qs = new URLSearchParams();
  qs.set("nueva", "1");
  if (scope) qs.set("scope", scope);
  if (scopeRef) qs.set("scopeRef", scopeRef);
  if (title) qs.set("title", title);
  if (description) qs.set("desc", description);
  if (command && command.type) {
    qs.set("cmd", command.type);
    const payloadJson = JSON.stringify(command.payload ?? {});
    qs.set("payload", b64urlEncode(payloadJson));
  }
  const cleanBase = (base || "").replace(/\/+$/, "");
  return `${cleanBase}/decisiones?${qs.toString()}`;
}

// Lee un objeto similar a URLSearchParams (admite el ReadonlyURLSearchParams de
// Next, o cualquier objeto con .get). Es tolerante: nunca lanza.
type SearchLike = { get(key: string): string | null };

export function parseProposalParams(
  searchParams: SearchLike | null | undefined,
): ParsedProposalParams {
  if (!searchParams || typeof searchParams.get !== "function") {
    return { open: false };
  }
  const get = (k: string): string | undefined => {
    const v = searchParams.get(k);
    return v == null ? undefined : v;
  };

  // Activadores de apertura aceptados (tolerante a variantes).
  const flag = get("nueva") ?? get("new") ?? get("autoOpen");
  const open = flag === "1" || flag === "true" || flag === "yes";

  const scope = get("scope");
  const scopeRef = get("scopeRef") ?? get("scoperef") ?? get("ref");
  const title = get("title");
  const description = get("desc") ?? get("description");
  const cmdType = get("cmd") ?? get("command");
  const payloadRaw = get("payload");

  let command: CommandSpec | undefined;
  if (cmdType) {
    let payload: Record<string, unknown> = {};
    if (payloadRaw) {
      const decoded = b64urlDecode(payloadRaw);
      if (decoded) {
        try {
          const parsed = JSON.parse(decoded);
          if (parsed && typeof parsed === "object") {
            payload = parsed as Record<string, unknown>;
          }
        } catch {
          /* payload corrupto: lo ignoramos pero conservamos el tipo de comando */
        }
      }
    }
    command = { type: cmdType, payload };
  }

  const hasInitial = Boolean(title || description || command);
  const initial: ParsedProposalInitial | undefined = hasInitial
    ? { title, description, command }
    : undefined;

  return {
    open,
    initial,
    scope: scope || undefined,
    scopeRef: scopeRef || undefined,
  };
}
