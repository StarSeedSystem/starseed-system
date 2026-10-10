// Métricas de la puerta: cuántas operaciones sirvió SIN tocar Supabase y cuántas peticiones hizo
// ella a Supabase (JWKS, es_metagenesis, cachés, réplica), por día UTC y por grupo. El ahorro que
// enseña Genesis es la resta, medida aquí: nunca una estimación.

export const GRUPOS = Object.freeze([
  "bus", "latidos", "neuronas", "presencia", "metagenesis", "malla", "astraura", "freno", "cache",
  "jwks", "es_metagenesis", "replica",
]);

function diaUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function crearMetricas(db, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());
  /** @type {Map<string, {servidas: number, a_supabase: number}>} */
  const pendientes = new Map();

  function sumar(grupo, campo, n = 1) {
    if (!GRUPOS.includes(grupo)) return;
    const k = `${diaUtc(ahora())}|${grupo}`;
    const v = pendientes.get(k) ?? { servidas: 0, a_supabase: 0 };
    v[campo] += n;
    pendientes.set(k, v);
  }

  function volcar() {
    if (pendientes.size === 0) return;
    const st = db.prepare(
      "INSERT INTO metricas (dia, grupo, servidas, a_supabase) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(dia, grupo) DO UPDATE SET servidas = servidas + excluded.servidas, a_supabase = a_supabase + excluded.a_supabase",
    );
    for (const [k, v] of pendientes) {
      const [dia, grupo] = k.split("|");
      st.run(dia, grupo, v.servidas, v.a_supabase);
    }
    pendientes.clear();
  }

  function delDia(dia = diaUtc(ahora())) {
    volcar();
    const filas = db.prepare("SELECT grupo, servidas, a_supabase FROM metricas WHERE dia = ?").all(dia);
    const grupos = {};
    let servidas = 0;
    let aSupabase = 0;
    for (const f of filas) {
      grupos[f.grupo] = { servidas: Number(f.servidas), a_supabase: Number(f.a_supabase) };
      servidas += Number(f.servidas);
      aSupabase += Number(f.a_supabase);
    }
    return { dia, servidas, a_supabase: aSupabase, ahorradas: Math.max(0, servidas - aSupabase), grupos };
  }

  function historial(dias = 14) {
    volcar();
    const filas = db.prepare(
      "SELECT dia, sum(servidas) AS s, sum(a_supabase) AS a FROM metricas GROUP BY dia ORDER BY dia DESC LIMIT ?",
    ).all(dias);
    return filas.map((f) => ({ dia: f.dia, servidas: Number(f.s), a_supabase: Number(f.a), ahorradas: Math.max(0, Number(f.s) - Number(f.a)) }));
  }

  return {
    servida: (grupo, n = 1) => sumar(grupo, "servidas", n),
    aSupabase: (grupo, n = 1) => sumar(grupo, "a_supabase", n),
    volcar,
    delDia,
    historial,
    peticionesHoyASupabase(grupo) {
      return delDia().grupos[grupo]?.a_supabase ?? 0;
    },
  };
}
