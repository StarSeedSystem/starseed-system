/**
 * perfil-centro — la cara de ESTA neurona en el centro del radar (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════
 * El centro del mapa ya no es «un punto azul»: es la neurona con su nombre, la foto (o el avatar 3D si
 * es ligero) del perfil activo y sus datos reales. Aquí vive lo PURO de esa decisión:
 *
 *   · `avatarUrlSegura`  — qué direcciones de foto se aceptan (https, sin IP privada ni `javascript:`);
 *   · `decidirAvatar`    — foto, avatar 3D o iniciales, y POR QUÉ (el avatar 3D solo si pesa poco y se
 *                          midió su peso; si no, la foto como cartel);
 *   · `perfilDesdeCuenta`— del perfil de la cuenta (`profiles`/`os_profiles`) y de la faceta activa
 *                          (`os_account_profiles`) a lo que el mapa necesita;
 *   · `avatarDeCache`    — la foto del perfil guardada en el navegador (la usa el faro del radar).
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

/** Un avatar 3D por encima de este peso no se carga en el mapa: en móvil y en la web gasta batería. */
export const LIMITE_AVATAR_3D_BYTES = 1_500_000;

/** Clave donde el contexto de cuenta guarda el último perfil (hidratación instantánea). */
export const CLAVE_PERFIL_CACHE = "starseed.account.profile.cache.v1";

const MAX_URL = 300;

function esHostPrivado(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return h.includes(":");
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Una foto solo se acepta si es https hacia un host público (o una ruta del propio sitio). Nunca
 * `javascript:`, `data:` ni direcciones de la red local: la foto de OTRA cuenta la carga tu navegador y
 * una dirección a medida sería una forma de sondear tu red.
 */
export function avatarUrlSegura(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const t = url.trim();
  if (!t || t.length > MAX_URL) return null;
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (esHostPrivado(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "SS";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

/** Lo que se sabe del perfil activo de la cuenta. */
export interface PerfilCentro {
  /** Nombre visible del perfil activo. */
  nombre: string;
  /** @usuario si lo tiene. */
  usuario: string | null;
  /** Foto del perfil (ya validada) o null. */
  fotoUrl: string | null;
  /** Dirección del avatar 3D (GLB/glTF) o null. */
  avatar3dUrl: string | null;
  /** Peso medido del avatar 3D en bytes; null = no se midió. */
  avatar3dBytes: number | null;
}

export type ModoAvatar = "avatar3d" | "foto" | "iniciales";

export interface DecisionAvatar {
  modo: ModoAvatar;
  /** Dirección a cargar (foto o modelo); null con «iniciales». */
  url: string | null;
  /** Una frase que dice por qué se eligió eso (se enseña en la ficha). */
  motivo: string;
}

const kb = (b: number) => (b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1000)} KB`);

export function esModelo3d(url: string): boolean {
  return /\.(glb|gltf)(\?|#|$)/i.test(url);
}

/**
 * Foto o avatar 3D. El modelo 3D se usa SOLO si: es GLB/glTF, su peso se midió y cabe en el límite, y
 * el mapa no está en modo ligero ni con movimiento reducido. En cualquier otro caso, la foto (cartel) y,
 * sin foto, las iniciales. Nunca se asume que un modelo «debe de ser ligero».
 */
export function decidirAvatar(perfil: PerfilCentro | null, opciones: { ligero: boolean; reducido: boolean }): DecisionAvatar {
  const foto = perfil?.fotoUrl ?? null;
  const modelo = perfil?.avatar3dUrl ?? null;
  const respaldo = (porque: string): DecisionAvatar =>
    foto ? { modo: "foto", url: foto, motivo: `${porque}: se usa la foto del perfil como cartel` }
         : { modo: "iniciales", url: null, motivo: `${porque}; el perfil tampoco tiene foto: se usan las iniciales` };

  if (!perfil) return { modo: "iniciales", url: null, motivo: "no hay perfil cargado (sin sesión o aún cargando)" };
  if (!modelo) return foto
    ? { modo: "foto", url: foto, motivo: "foto del perfil activo, como cartel" }
    : { modo: "iniciales", url: null, motivo: "el perfil no tiene foto ni avatar 3D: se usan las iniciales" };
  if (!esModelo3d(modelo)) return respaldo("el avatar 3D no es GLB/glTF");
  if (opciones.ligero) return respaldo("modo ligero (pantalla estrecha o equipo modesto)");
  if (opciones.reducido) return respaldo("movimiento reducido activado");
  if (perfil.avatar3dBytes === null) return respaldo("el peso del avatar 3D no se pudo medir");
  if (perfil.avatar3dBytes > LIMITE_AVATAR_3D_BYTES) {
    return respaldo(`el avatar 3D pesa ${kb(perfil.avatar3dBytes)} (límite ${kb(LIMITE_AVATAR_3D_BYTES)})`);
  }
  return { modo: "avatar3d", url: modelo, motivo: `avatar 3D de ${kb(perfil.avatar3dBytes)}, dentro del límite de ${kb(LIMITE_AVATAR_3D_BYTES)}` };
}

type Fila = Record<string, unknown> | null | undefined;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Del perfil de la cuenta (fila `os_profiles`/`profiles`/`cafe_profiles`) y de la faceta activa
 * (`os_account_profiles`) a lo que necesita el centro. La faceta manda en nombre y foto si tiene; el
 * avatar 3D solo existe en el perfil de la cuenta. Sin ninguna de las dos, null.
 */
export function perfilDesdeCuenta(
  cuenta: Fila,
  faceta?: { name?: string | null; handle?: string | null; avatarUrl?: string | null } | null,
  bytes3d: number | null = null,
): PerfilCentro | null {
  const nombre = texto(faceta?.name) ?? texto(cuenta?.display_name) ?? texto(cuenta?.full_name) ?? texto(cuenta?.handle) ?? texto(cuenta?.username);
  if (!nombre && !faceta && !cuenta) return null;
  const usuario = texto(faceta?.handle) ?? texto(cuenta?.handle) ?? texto(cuenta?.username);
  const foto = avatarUrlSegura(faceta?.avatarUrl) ?? avatarUrlSegura(cuenta?.avatar_url);
  const a3 = (cuenta?.avatar_3d && typeof cuenta.avatar_3d === "object" ? (cuenta.avatar_3d as { url?: unknown }).url : null);
  const url3d = typeof a3 === "string" && a3.trim() ? avatarUrlSegura(a3) : null;
  return { nombre: nombre ?? "Mi perfil", usuario, fotoUrl: foto, avatar3dUrl: url3d, avatar3dBytes: url3d ? bytes3d : null };
}

/** La foto del perfil que el contexto de cuenta dejó en el navegador (para el faro del radar). */
export function avatarDeCache(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { profile?: { avatar_url?: unknown } | null };
    return avatarUrlSegura(j?.profile?.avatar_url);
  } catch {
    return null;
  }
}
