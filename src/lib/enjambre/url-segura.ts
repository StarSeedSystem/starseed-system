/**
 * url-segura — validación SINTÁCTICA de URL de espejo (ENJ1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Primera de las dos capas anti-SSRF del contrato §9 (la segunda es la de la puerta, que resuelve el DNS UNA vez y
 * comprueba la IP ya resuelta: `puerta.cjs` / `resolverSeguro`). Aquí solo se descarta lo que no hace falta ni mirar:
 *  · solo `https:`, sin usuario/contraseña, sin fragmento, puerto 443 (o los permitidos expresamente);
 *  · ninguna dirección IP literal que no sea IPv4 pública (el parser WHATWG ya normaliza `0x7f.1`, `2130706433`,
 *    `0177.0.0.1`… a decimal con puntos, y de ahí se decide); ninguna IPv6 literal;
 *  · ni `localhost`, ni `.local`, `.internal`, `.lan`, `.home`, `.corp`, ni nombres de una sola etiqueta.
 * Nunca lanza: devuelve la URL normalizada o null.
 */

const MAX_URL = 512;
const SUFIJOS_INTERNOS = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".localdomain", ".home.arpa"];

/** ¿IPv4 (decimal con puntos) fuera de lo público? Loopback, privada, CGNAT, enlace local, multicast, reservada. */
export function ipv4NoPublica(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return true;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if ([a, b, c, Number(m[4])].some((n) => n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export interface OpcionesUrlEspejo {
  /** Puertos admitidos además del 443. */
  puertos?: readonly number[];
  /** Solo pruebas: admite `http:`. */
  permitirHttp?: boolean;
}

export function validarUrlEspejo(texto: unknown, o: OpcionesUrlEspejo = {}): string | null {
  if (typeof texto !== "string" || texto.length < 12 || texto.length > MAX_URL) return null;
  // El parser de URL borra en silencio tabuladores y saltos de línea: se rechazan ANTES.
  if (/[\u0000- \u007f-\u009f\\]/.test(texto)) return null;
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && !(o.permitirHttp && u.protocol === "http:")) return null;
  if (u.username || u.password || u.hash) return null;
  const puerto = u.port === "" ? (u.protocol === "https:" ? 443 : 80) : Number(u.port);
  if (puerto !== 443 && !(o.permitirHttp && puerto === 80) && !(o.puertos ?? []).includes(puerto)) return null;
  const host = u.hostname.toLowerCase();
  if (!host || host.length > 253 || host.startsWith("[") || host.includes(":")) return null;
  if (/^[0-9.]+$/.test(host)) {
    if (ipv4NoPublica(host)) return null;
  } else {
    if (host === "localhost" || SUFIJOS_INTERNOS.some((s) => host.endsWith(s))) return null;
    if (!host.includes(".")) return null;
    if (!/^[a-z0-9.\-]+$/.test(host)) return null;
  }
  const href = u.href;
  return href.length <= MAX_URL ? href : null;
}
