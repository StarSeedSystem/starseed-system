import type { TareaEntrada, TareaSalida } from "../tipos";

export async function leerRedditAsyncPatterns(entrada: TareaEntrada): Promise<TareaSalida> {
  const { url } = entrada.payload as { url: string };

  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "www.reddit.com") {
      return { ok: false, error: "Solo URLs https de www.reddit.com son válidas." };
    }
  } catch {
    return { ok: false, error: "URL inválida." };
  }

  const resp = await fetch("/api/agent-reach/read-web", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${entrada.token}` },
    body: JSON.stringify({ url })
  });

  const datos = await resp.json();

  if (datos.ok) {
    const patrones = extraerPatronesAsync(datos.content);
    return { ok: true, data: { patrones, fuente: url } };
  }

  switch (datos.codigo) {
    case "NEED_LOGIN_BLOQUEADO":
      return {
        ok: false,
        error: "Reddit requiere login (canal apagado R1).",
        sugerencia: "Usa búsqueda web: web-search con 'rust async patterns'"
      };
    case "NEED_SETUP":
      return { ok: false, error: "Agent Reach no instalado.", hint: datos.hint };
    case "RATE_LIMITED":
      return { ok: false, error: "Rate limited.", reintentarEn: 60 };
    case "PLATFORM_BLOCKED":
      return { ok: false, error: "Reddit bloquea la lectura (captcha)." };
    case "BUSY":
      return { ok: false, error: "Agent Reach ocupado.", reintentarEn: 120 };
    case "NOT_FOUND":
      return { ok: false, error: "Hilo no encontrado." };
    case "BAD_INPUT":
      return { ok: false, error: "URL inválida para Agent Reach." };
    default:
      return { ok: false, error: datos.error || "Error desconocido", codigo: datos.codigo };
  }
}

function extraerPatronesAsync(texto: string): string[] {
  return texto
    .split("\n")
    .filter((l) => /^(Patrón|\d+\.)/i.test(l.trim()))
    .map((l) => l.replace(/^(Patrón\s*\d+[:.]?\s*|\d+\.\s*)/i, "").trim())
    .slice(0, 5);
}