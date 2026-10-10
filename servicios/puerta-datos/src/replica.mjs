// Réplica a Supabase de lo que hay que conservar, por lotes y con tope diario.
//
// Una sola llamada por lote: `rpc/puerta_datos_replicar(_llave, _lote)` (migración
// 20261011120000_puerta_datos.sql), con la clave PÚBLICA y la llave propia de la puerta, que la
// función comprueba por su sha256. Lo que lleva cada lote (como mucho):
//   · eventos   — 200 del bus que no son silenciosos y aún no se replicaron;
//   · neuronas  — 500 resúmenes {cuenta, neurona, visto} con ≥ 30 min de novedad;
//   · presencia — 500 resúmenes {cuenta, visto} con ≥ 30 min de novedad;
//   · arriendo  — la foto del arriendo de MetaGenesis si cambió (o cada 30 min mientras haya líder).
// Si Supabase responde 402/429/5xx o no hay red, espera 5 → 10 → 20 → 40 → 60 min. Con el freno
// de consumo puesto solo viaja lo esencial (arriendo y presencia). Nada se marca como replicado
// hasta que Supabase dice que sí: un corte no pierde la cola, que vive en SQLite.

import { escribirKv, leerKv, parsear } from "./almacen.mjs";

export const NOVEDAD_MS = 30 * 60_000;
const ESPERAS_MS = [5, 10, 20, 40, 60].map((m) => m * 60_000);

function diaUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function crearReplica(db, supabase, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());
  const llave = String(op.llave || "");
  const topeDia = Number.isFinite(op.topeDia) ? op.topeDia : 1500;
  const frenoActivo = op.frenoActivo ?? (() => false);
  const estado = {
    ultimo: null,
    ultimo_ok: null,
    error: null,
    fallos: 0,
    esperaHasta: 0,
    dia: diaUtc(ahora()),
    hoy: 0,
    sin_migracion: false,
    enviadas: { eventos: 0, neuronas: 0, presencia: 0, arriendo: 0 },
  };

  function pendientes() {
    const e = db.prepare("SELECT count(*) AS n FROM eventos WHERE replicar = 1 AND replicado = 0").get();
    const n = db.prepare("SELECT count(*) AS n FROM neuronas WHERE visto - replicado_visto >= ?").get(NOVEDAD_MS);
    const p = db.prepare("SELECT count(*) AS n FROM presencia WHERE visto - replicado_visto >= ?").get(NOVEDAD_MS);
    return { eventos: Number(e?.n ?? 0), neuronas: Number(n?.n ?? 0), presencia: Number(p?.n ?? 0) };
  }

  function armarLote(esencial) {
    const lote = {};
    const marcas = {};
    if (!esencial) {
      const ev = db.prepare("SELECT id, t, quien, tipo, tarea, texto, datos FROM eventos WHERE replicar = 1 AND replicado = 0 ORDER BY id LIMIT 200").all();
      if (ev.length) {
        lote.eventos = ev.map((x) => ({
          t: new Date(Number(x.t)).toISOString(), quien: x.quien, tipo: x.tipo, tarea: x.tarea, texto: x.texto, datos: parsear(x.datos),
        }));
        marcas.eventos = ev.map((x) => Number(x.id));
      }
      const ne = db.prepare("SELECT cuenta, neurona, visto FROM neuronas WHERE visto - replicado_visto >= ? ORDER BY visto DESC LIMIT 500").all(NOVEDAD_MS);
      if (ne.length) {
        lote.neuronas = ne.map((x) => ({ cuenta: x.cuenta, neurona: x.neurona, visto: new Date(Number(x.visto)).toISOString() }));
        marcas.neuronas = ne.map((x) => [x.cuenta, x.neurona, Number(x.visto)]);
      }
    }
    const pr = db.prepare("SELECT cuenta, visto FROM presencia WHERE visto - replicado_visto >= ? ORDER BY visto DESC LIMIT 500").all(NOVEDAD_MS);
    if (pr.length) {
      lote.presencia = pr.map((x) => ({ cuenta: x.cuenta, visto: new Date(Number(x.visto)).toISOString() }));
      marcas.presencia = pr.map((x) => [x.cuenta, Number(x.visto)]);
    }
    // El arriendo viaja si cambió de líder o de término, si hay foto nueva, o cada 30 min.
    const a = db.prepare("SELECT lider, termino, expira, foto, foto_en FROM arriendo_mg WHERE id = 1").get();
    if (a && a.lider) {
      const previo = leerKv(db, "replica_arriendo")?.valor ?? null;
      const fotoEn = Number(a.foto_en ?? 0);
      const toca = !previo || previo.lider !== a.lider || previo.termino !== Number(a.termino) ||
        fotoEn > Number(previo.foto_en ?? 0) || ahora() - Number(previo.t ?? 0) >= NOVEDAD_MS;
      if (toca) {
        lote.arriendo = {
          lider: a.lider, termino: Number(a.termino), expira: new Date(Number(a.expira)).toISOString(),
          foto: parsear(a.foto), foto_en: fotoEn ? new Date(fotoEn).toISOString() : null,
        };
        marcas.arriendo = { lider: a.lider, termino: Number(a.termino), foto_en: fotoEn, t: ahora() };
      }
    }
    return { lote, marcas };
  }

  function marcar(marcas) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (marcas.eventos?.length) {
        const st = db.prepare("UPDATE eventos SET replicado = 1 WHERE id = ?");
        for (const id of marcas.eventos) st.run(id);
      }
      if (marcas.neuronas?.length) {
        const st = db.prepare("UPDATE neuronas SET replicado_visto = ? WHERE cuenta = ? AND neurona = ?");
        for (const [c, n, v] of marcas.neuronas) st.run(v, c, n);
      }
      if (marcas.presencia?.length) {
        const st = db.prepare("UPDATE presencia SET replicado_visto = ? WHERE cuenta = ?");
        for (const [c, v] of marcas.presencia) st.run(v, c);
      }
      if (marcas.arriendo) escribirKv(db, "replica_arriendo", marcas.arriendo, ahora());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Una pasada. `forzar` ignora la espera tras fallos (no el tope del día). */
  async function pasada({ forzar = false } = {}) {
    const t = ahora();
    if (estado.dia !== diaUtc(t)) {
      estado.dia = diaUtc(t);
      estado.hoy = 0;
    }
    if (!llave) return { hecho: false, motivo: "sin llave de réplica" };
    if (!supabase.listo) return { hecho: false, motivo: "sin proyecto configurado" };
    if (!forzar && t < estado.esperaHasta) return { hecho: false, motivo: "esperando tras un fallo" };
    if (estado.hoy >= topeDia) return { hecho: false, motivo: "tope del día alcanzado" };
    const esencial = frenoActivo();
    const { lote, marcas } = armarLote(esencial);
    if (Object.keys(lote).length === 0) return { hecho: false, motivo: "nada que replicar" };
    estado.ultimo = new Date(t).toISOString();
    estado.hoy += 1;
    const r = await supabase.rpc("puerta_datos_replicar", { _llave: llave, _lote: lote }, { grupo: "replica" });
    if (r.ok) {
      marcar(marcas);
      estado.ultimo_ok = new Date(ahora()).toISOString();
      estado.error = null;
      estado.fallos = 0;
      estado.esperaHasta = 0;
      estado.sin_migracion = false;
      for (const k of Object.keys(estado.enviadas)) {
        if (k === "arriendo") estado.enviadas.arriendo += lote.arriendo ? 1 : 0;
        else estado.enviadas[k] += lote[k]?.length ?? 0;
      }
      return { hecho: true, lote: Object.fromEntries(Object.entries(lote).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])) };
    }
    estado.fallos += 1;
    // La función aún no existe (migración sin aplicar): se mira cada 6 h, sin gastar más.
    const sinFuncion = r.estado === 404 || r.datos?.code === "PGRST202";
    estado.sin_migracion = sinFuncion;
    estado.error = sinFuncion ? "la migración de la puerta aún no está aplicada" : r.estado === 403 ? "llave de réplica rechazada" : `Supabase: ${r.error}`;
    estado.esperaHasta = ahora() + (sinFuncion || r.estado === 403 ? 6 * 3_600_000 : ESPERAS_MS[Math.min(ESPERAS_MS.length - 1, estado.fallos - 1)]);
    return { hecho: false, motivo: estado.error };
  }

  return {
    pasada,
    pendientes,
    estado: () => ({ ...estado, pendientes: pendientes(), activa: Boolean(llave && supabase.listo), tope_dia: topeDia }),
  };
}
