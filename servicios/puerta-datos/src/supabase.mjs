// Lo poco que la puerta le pide a Supabase, siempre con la clave PÚBLICA (anon) y, cuando la
// pregunta es de una cuenta, con la sesión de esa misma cuenta (la RLS decide igual que si
// preguntara su navegador). En el A1 no hay clave de servicio (regla de OPA1011).
// Cada petición se cuenta en las métricas (`a_supabase`) para que el ahorro sea honesto.

export function crearSupabase({ url, anon, fetch: pedir = globalThis.fetch, metricas = null, timeoutMs = 8_000 }) {
  const base = String(url || "").replace(/\/+$/, "");
  const listo = Boolean(base && anon);

  async function llamar(metodo, ruta, { jwt = null, cuerpo = undefined, grupo = "cache", cabeceras = {} } = {}) {
    if (!listo) return { ok: false, estado: 0, datos: null, error: "sin proyecto configurado" };
    metricas?.aSupabase(grupo);
    try {
      const r = await pedir(`${base}${ruta}`, {
        method: metodo,
        headers: {
          apikey: anon,
          authorization: `Bearer ${jwt || anon}`,
          accept: "application/json",
          ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}),
          ...cabeceras,
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const texto = await r.text();
      let datos = null;
      try {
        datos = texto ? JSON.parse(texto) : null;
      } catch {
        datos = null;
      }
      return { ok: r.ok, estado: r.status, datos, error: r.ok ? null : (datos?.message || datos?.code || `HTTP ${r.status}`) };
    } catch (e) {
      return { ok: false, estado: 0, datos: null, error: e instanceof Error ? e.name : "red" };
    }
  }

  return {
    listo,
    get: (ruta, op) => llamar("GET", ruta, op),
    rpc: (nombre, cuerpo, op = {}) => llamar("POST", `/rest/v1/rpc/${nombre}`, { ...op, cuerpo }),
  };
}

/**
 * ¿Es miembro de MetaGenesis? Se pregunta con la sesión de la cuenta (`rpc/es_metagenesis`, la
 * misma RLS) y se guarda 10 min si es sí y 2 min si es no. Un fallo de red no concede nada.
 */
export function crearCacheMetagenesis(supabase, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());
  const SI_MS = op.siMs ?? 10 * 60_000;
  const NO_MS = op.noMs ?? 2 * 60_000;
  /** @type {Map<string, {valor: boolean, hasta: number}>} */
  const memo = new Map();
  /** @type {Map<string, Promise<boolean>>} */
  const enVuelo = new Map();

  return async function esMetagenesis(cuenta, jwt) {
    const m = memo.get(cuenta);
    if (m && m.hasta > ahora()) return m.valor;
    const v = enVuelo.get(cuenta);
    if (v) return v;
    const p = (async () => {
      const r = await supabase.rpc("es_metagenesis", { _uid: cuenta }, { jwt, grupo: "es_metagenesis" });
      if (!r.ok) {
        // Sin respuesta no se concede; se reintenta pronto (30 s) sin martillear.
        memo.set(cuenta, { valor: false, hasta: ahora() + 30_000 });
        return false;
      }
      const valor = r.datos === true;
      memo.set(cuenta, { valor, hasta: ahora() + (valor ? SI_MS : NO_MS) });
      if (memo.size > 5000) memo.delete(memo.keys().next().value);
      return valor;
    })().finally(() => enVuelo.delete(cuenta));
    enVuelo.set(cuenta, p);
    return p;
  };
}
