// Caché de lecturas SEMIPÚBLICAS con TTL corto y una sola petición en vuelo por recurso.
//
// Solo recursos de una lista cerrada cuya respuesta NO depende de quién pregunta:
//   · estaciones — `os_estaciones` con visibilidad 'publica' (la RLS la deja leer hasta a anon);
//   · versiones  — `os_versiones` de nivel 'meta' (la ve cualquier cuenta con sesión: se pide con
//                  la sesión de quien pregunta y solo se sirve a cuentas con sesión);
//   · freno      — `os_freno` (anon), solo si la vigía no lo ha empujado (malla.mjs → ponerFreno).
// Si Supabase falla se sirve lo último bueno hasta 10 min, marcado `obsoleto`. Con el freno de
// consumo puesto, los TTL se multiplican por 4.

export const RECURSOS = Object.freeze({
  estaciones: {
    rol: "anon",
    ttlMs: 60_000,
    ruta: "/rest/v1/os_estaciones?visibilidad=eq.publica&select=id,titulo,descripcion,tipo,fuente,enlace,formato,imagen,idioma,categorias,licencia,empieza_en,termina_en,ultimo_latido,pausada,en_malla,espectadores&order=ultimo_latido.desc.nullslast&limit=200",
  },
  versiones: {
    rol: "authenticated",
    ttlMs: 300_000,
    ruta: "/rest/v1/os_versiones?nivel=eq.meta&select=*&order=publicado_en.desc&limit=50",
  },
  freno: {
    rol: "anon",
    ttlMs: 300_000,
    ruta: "/rest/v1/os_freno?id=eq.1&select=activo,motivo,hasta,actualizado",
  },
});
const OBSOLETO_MAX_MS = 10 * 60_000;

export function crearCache(supabase, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());
  const frenoActivo = op.frenoActivo ?? (() => false);
  /** @type {Map<string, {datos: unknown, en: number}>} */
  const guardado = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const enVuelo = new Map();
  let aciertos = 0;
  let fallos = 0;

  /**
   * @returns {Promise<{ok: boolean, datos?: unknown, obsoleto?: boolean, desde_cache: boolean, error?: string, codigo?: number}>}
   */
  async function leer(nombre, { jwt = null } = {}) {
    const r = RECURSOS[nombre];
    if (!r) return { ok: false, codigo: 404, error: "recurso no admitido", desde_cache: false };
    if (r.rol === "authenticated" && !jwt) return { ok: false, codigo: 401, error: "hace falta sesión", desde_cache: false };
    const ttl = r.ttlMs * (frenoActivo() ? 4 : 1);
    const g = guardado.get(nombre);
    if (g && ahora() - g.en < ttl) {
      aciertos += 1;
      return { ok: true, datos: g.datos, desde_cache: true };
    }
    let p = enVuelo.get(nombre);
    const compartida = Boolean(p);
    if (!p) {
      p = (async () => {
        const res = await supabase.get(r.ruta, { jwt: r.rol === "authenticated" ? jwt : null, grupo: "cache" });
        if (!res.ok) throw Object.assign(new Error(res.error || "fallo"), { estado: res.estado });
        guardado.set(nombre, { datos: res.datos, en: ahora() });
        return res.datos;
      })().finally(() => enVuelo.delete(nombre));
      enVuelo.set(nombre, p);
    }
    try {
      const datos = await p;
      if (compartida) aciertos += 1;
      else fallos += 1;
      return { ok: true, datos, desde_cache: compartida };
    } catch (e) {
      if (g && ahora() - g.en < OBSOLETO_MAX_MS) return { ok: true, datos: g.datos, obsoleto: true, desde_cache: true };
      return { ok: false, codigo: 502, error: "Supabase no respondió", desde_cache: false };
    }
  }

  return { leer, estado: () => ({ aciertos, fallos, recursos: guardado.size }) };
}
