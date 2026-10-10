// Bus del enjambre y de los directores (lo que hoy es `relevo_eventos`), en el A1.
//
// Mismo contrato que la tabla (quien ≤ 40, tipo ≤ 40, texto ≤ 4.000, datos ≤ 16 KB) para que
// cualquier publicador cambie de destino sin cambiar lo que manda. Lectura por cursor (`desde` =
// último id visto) y ESPERA LARGA: quien pregunta puede quedarse hasta 25 s esperando lo nuevo, en
// vez de sondear cada pocos segundos o abrir un canal de Realtime.
// A Supabase solo se replica lo que hace falta conservar (todo menos los tipos silenciosos de
// `src/lib/mando/eventos.ts` → TIPOS_SILENCIOSOS_BUS y los `prueba*` de las comprobaciones), por
// lotes (replica.mjs).

import { parsear, tamanoJson } from "./almacen.mjs";

export const SILENCIOSOS = Object.freeze(["latido", "tunel", "mg_latido", "mg_foto", "mg_colas"]);
export const ESPERA_MAX_S = 25;
export const LIMITE_MAX = 500;

export class ErrorValidacion extends Error {
  constructor(mensaje, codigo = 400) {
    super(mensaje);
    this.codigo = codigo;
  }
}

function texto(v, nombre, max, obligatorio = true) {
  if (v == null || v === "") {
    if (obligatorio) throw new ErrorValidacion(`falta «${nombre}»`);
    return null;
  }
  if (typeof v !== "string") throw new ErrorValidacion(`«${nombre}» debe ser texto`);
  if (v.length > max) throw new ErrorValidacion(`«${nombre}» pasa de ${max} caracteres`);
  return v;
}

export function validarEvento(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) throw new ErrorValidacion("evento vacío");
  const ev = {
    quien: texto(e.quien, "quien", 40),
    tipo: texto(e.tipo, "tipo", 40),
    tarea: texto(e.tarea, "tarea", 160, false),
    texto: texto(e.texto ?? "", "texto", 4000, false) ?? "",
    datos: e.datos ?? null,
  };
  if (ev.datos !== null && tamanoJson(ev.datos) > 16_384) throw new ErrorValidacion("«datos» pasa de 16 KB");
  return ev;
}

function aFila(f) {
  return {
    id: Number(f.id),
    t: new Date(Number(f.t)).toISOString(),
    quien: f.quien,
    tipo: f.tipo,
    tarea: f.tarea ?? "",
    texto: f.texto,
    datos: parsear(f.datos),
  };
}

export function crearBus(db, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());
  /** @type {Set<() => void>} */
  const esperando = new Set();
  const insertar = db.prepare(
    "INSERT INTO eventos (t, quien, tipo, tarea, texto, datos, origen, replicar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  function avisar() {
    for (const despertar of [...esperando]) despertar();
  }

  function publicar(e, origen = "") {
    const ev = validarEvento(e);
    const r = insertar.run(
      ahora(), ev.quien, ev.tipo, ev.tarea, ev.texto,
      ev.datos === null ? null : JSON.stringify(ev.datos),
      String(origen).slice(0, 60),
      SILENCIOSOS.includes(ev.tipo) || ev.tipo.startsWith("prueba") ? 0 : 1,
    );
    avisar();
    return Number(r.lastInsertRowid);
  }

  function leer({ desde = 0, tipos = [], excluir = [], limite = 200, horas = 0 } = {}) {
    const lim = Math.max(1, Math.min(LIMITE_MAX, Number(limite) || 200));
    const cond = ["id > ?"];
    const args = [Math.max(0, Number(desde) || 0)];
    const t = tipos.filter((x) => typeof x === "string" && x.length <= 40).slice(0, 20);
    if (t.length) {
      cond.push(`tipo IN (${t.map(() => "?").join(",")})`);
      args.push(...t);
    }
    const x = excluir.filter((v) => typeof v === "string" && v.length <= 40).slice(0, 20);
    if (x.length) {
      cond.push(`tipo NOT IN (${x.map(() => "?").join(",")})`);
      args.push(...x);
    }
    if (horas > 0) {
      cond.push("t >= ?");
      args.push(ahora() - Math.min(24 * 30, Number(horas)) * 3_600_000);
    }
    // Sin cursor: las ÚLTIMAS `lim` (en orden); con cursor: las siguientes.
    const filas = Number(desde) > 0
      ? db.prepare(`SELECT * FROM eventos WHERE ${cond.join(" AND ")} ORDER BY id ASC LIMIT ?`).all(...args, lim)
      : db.prepare(`SELECT * FROM (SELECT * FROM eventos WHERE ${cond.join(" AND ")} ORDER BY id DESC LIMIT ?) ORDER BY id ASC`).all(...args, lim);
    const eventos = filas.map(aFila);
    const ultimo = eventos.length ? eventos[eventos.length - 1].id : Math.max(0, Number(desde) || 0);
    return { eventos, ultimo };
  }

  /** Como `leer`, pero si no hay nada nuevo espera hasta `esperarS` segundos a que llegue algo. */
  async function leerEsperando(filtro, esperarS = 0, senal = null) {
    const primero = leer(filtro);
    const espera = Math.max(0, Math.min(ESPERA_MAX_S, Number(esperarS) || 0));
    if (primero.eventos.length > 0 || espera === 0 || !(Number(filtro.desde) > 0)) return primero;
    await new Promise((resolver) => {
      let hecho = false;
      const fin = () => {
        if (hecho) return;
        hecho = true;
        clearTimeout(t);
        esperando.delete(despertar);
        senal?.removeEventListener?.("abort", fin);
        resolver();
      };
      const despertar = () => {
        if (leer({ ...filtro, limite: 1 }).eventos.length > 0) fin();
      };
      const t = setTimeout(fin, espera * 1000);
      esperando.add(despertar);
      senal?.addEventListener?.("abort", fin);
    });
    return leer(filtro);
  }

  return { publicar, leer, leerEsperando, esperandoAhora: () => esperando.size };
}
