/*
 * misma-maquina — ¿la petición viene de ESTA misma máquina? (2026-10-09)
 * ─────────────────────────────────────────────────────────────────────────────
 * `esDespliegueLocal()` (puerta de voz) responde «¿este servidor es una neurona local?», y con
 * `STARSEED_LOCAL=1` dice que sí a CUALQUIER petición, venga de la propia Mac, de un móvil en el
 * mismo Wi-Fi o de un túnel. Para lo que solo debe ver quien está sentado delante de la máquina
 * (su huella, MetaGenesis sin sesión) hace falta la pregunta estricta:
 *
 *   · el host pedido es de bucle local (localhost, 127.0.0.1, [::1]) — nunca `*.local` ni una IP
 *     de la red, que es como entra un móvil del Wi-Fi;
 *   · no trae cabeceras de túnel o proxy externo (Cloudflare `cf-connecting-ip`, `cf-ray`,
 *     `x-real-ip` de un proxy, `forwarded` con otra IP);
 *   · si trae `x-forwarded-for` (Next lo rellena con la IP del socket), es de bucle local;
 *   · nunca en Vercel.
 *
 * Puro sobre `Request` (sin Node): lo pueden importar rutas de cualquier runtime.
 */

const BUCLE = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostSinPuerto(h: string | null): string {
  const s = (h ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("[")) {
    const fin = s.indexOf("]");
    return fin === -1 ? s : s.slice(0, fin + 1);
  }
  return s.split(":")[0] ?? "";
}

function ipDeBucle(ip: string): boolean {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return s === "127.0.0.1" || s === "::1" || s === "::ffff:127.0.0.1" || s.startsWith("127.");
}

export function esPeticionDeEstaMaquina(req: Request): boolean {
  if (process.env.VERCEL === "1") return false;
  const h = req.headers;
  if (!BUCLE.has(hostSinPuerto(h.get("host")))) return false;
  const reenviadoHost = h.get("x-forwarded-host");
  if (reenviadoHost && !BUCLE.has(hostSinPuerto(reenviadoHost))) return false;
  if (h.get("cf-connecting-ip") || h.get("cf-ray") || h.get("x-real-ip")) return false;
  const xff = h.get("x-forwarded-for");
  if (xff && !xff.split(",").every((ip) => ipDeBucle(ip))) return false;
  const fwd = h.get("forwarded");
  if (fwd && /for=/i.test(fwd) && !/for="?(\[?::1\]?|127\.[\d.]+)/i.test(fwd)) return false;
  return true;
}
