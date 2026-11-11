/**
 * relevo/motor — una neurona llega a otra a través de una neurona de en medio (REL1111I · 2026-11-11).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §14. Fase 1: neuronas de la MISMA cuenta, un solo relevo.
 *
 * Es un motor por instancia (todas sus dependencias se inyectan): la app crea uno (`relevo/real.ts`) y el banco de
 * pruebas crea tres o cuatro, uno por neurona, sobre carriles simulados. Hace cinco cosas:
 *   1 · anuncia a mis vecinas de la cuenta a quién llego yo (`tu.rva`) y aprende lo que anuncian ellas (`TablaAlcance`);
 *   2 · elige la ruta hacia un destino (`elegirRuta`: directo primero, luego el relevo más barato con histéresis, sin los
 *       vetados) y la vuelve a elegir cuando cambia un carril, llega un anuncio, un relevo dice que no o falta un acuse;
 *   3 · manda un mensaje sellado de punta a punta y espera el acuse sellado del destino; sin acuse, reintenta por otra
 *       ruta; sin ruta, espera a que aparezca (dentro del plazo). El destino entrega cada id una sola vez;
 *   4 · da un `CanalArchivos` hacia un destino para el motor de archivos: cada trama va con acuse de punta a punta, en
 *       orden, y si el relevo cae a mitad se repite por otro (o se espera) sin duplicar nada;
 *   5 · hace de relevo para otras neuronas de la cuenta, con sus topes, y dice que no (`tu.rvn`) cuando no puede.
 * Cada ruta elegida, cada cambio y su motivo, y cada negativa dejan una línea (`anotar`, que la app lleva a `enlaces.log`).
 * Nunca lanza.
 */

import type { CanalArchivos } from "@/lib/network/archivos-malla";
import type { SobreMensaje } from "@/lib/malla/transporte-universal";
import { ANUNCIO_MS, CARRILES_RELEVO, crearAnuncio, leerAnuncio, TablaAlcance, T_ANUNCIO, type VecinaAnunciada } from "./tabla";
import { costeTramo, elegirRuta, type MotivoRuta, type RutaCandidata } from "./ruta";
import {
  abrirAcuse,
  abrirMensaje,
  leerNegativa,
  leerTramaDatos,
  MAX_SALTOS,
  parsear,
  sellarAcuse,
  sellarMensaje,
  T_DATOS,
  T_NEGATIVA,
  VistosAcotados,
  type CriptoRelevo,
  type TramaDatos,
  type TramaNegativa,
} from "./sobre";

/** Un carril DIRECTO de esta neurona con una vecina. */
export interface CarrilRelevo {
  id: string;
  /** `ble`, `nativo`, `local`, `cuenta`… */
  tipo: string;
  /** Neurona al otro lado (la que probó el saludo del carril). */
  vecina: string;
  /** Es de mi cuenta (probado por el carril: faro, certificado o malla de la cuenta). */
  mismaCuenta: boolean;
  nombre?: string | null;
  kbps: number | null;
  rttMs: number | null;
  /** Huella (`id:…`) que probó el saludo de este carril. */
  huella?: string | null;
}

export interface MensajeRelevado {
  sobre: SobreMensaje;
  origen: string;
  /** Neurona que hizo de relevo (null = llegó por un carril directo con el formato del relevo). */
  relevo: string | null;
  nombreRelevo: string | null;
  /** Último carril (el que tengo con el relevo o con el origen). */
  carril: CarrilRelevo;
}

export interface DepsMotorRelevo {
  yo(): { neurona: string; uid?: string | null; nombre?: string | null; clave?: JsonWebKey | null } | null;
  carriles(): CarrilRelevo[];
  /** Manda un texto por un carril directo; true si el carril lo aceptó (o lo acusó). */
  enviarPorCarril(carrilId: string, texto: string): Promise<boolean> | boolean;
  /** Pública ECDH de cifrado de una neurona (vivo → instantánea → certificado → servidor en la app). */
  clavePublica(neurona: string): Promise<JsonWebKey | null>;
  cripto: CriptoRelevo;
  /** ¿Puedo hacer de relevo ahora para `bytes` más? (ajuste «mis neuronas», batería y datos del día). */
  puedoRelevar(bytes: number): { ok: boolean; motivo?: string };
  sumarRelevado?(bytes: number): void;
  entregar(m: MensajeRelevado): void;
  /** Una trama de archivo para mí: el que la recibe la pasa al motor con este canal de vuelta. */
  alArchivo?(origen: string, texto: string, canal: CanalArchivos, info: { relevo: string | null; nombreRelevo: string | null }): void;
  /** Cada trama que reenvío por otra neurona (para auditar qué ve un relevo; solo el banco lo usa). */
  alRelevar?(t: TramaDatos): void;
  anotar?(linea: string): void;
  ahora?(): number;
  esperar?(ms: number): Promise<void>;
}

export interface ResultadoRelevo {
  ok: boolean;
  confirmado: boolean;
  /** null = fue directo con el formato del relevo. */
  relevo: string | null;
  nombreRelevo: string | null;
  /** Tipo del primer carril. */
  carril: string | null;
  carrilId: string | null;
  intentos: Array<{ relevo: string | null; ok: boolean; detalle: string }>;
  ms: number;
  motivo?: string;
}

export interface OpcionesEnvioRelevo {
  /** Tiempo total para entregar (esperando ruta incluida). */
  plazoMs?: number;
  /** Espera del acuse por cada intento. */
  esperaAcuseMs?: number;
}

/** Trozo de archivo por relevo: cabe con holgura en una trama de Bluetooth (16 KiB) una vez en base64 y dentro de otro JSON. */
export const TROZO_RELEVO_BLE = 6 * 1024;
const ESPERA_SIN_RUTA_MS = 150;
const VETO_SIN_ACUSE_MS = 12_000;
const VETO_NEGATIVA_MS = 30_000;
const PLAZO_MENSAJE_MS = 20_000;
const ESPERA_ACUSE_MS = 2_500;
const PLAZO_TRAMA_ARCHIVO_MS = 45_000;
const ESPERA_LISTO_MS = 60_000;

export interface MotorRelevo {
  /** Texto `tu.rv*` que llegó por un carril directo. true si era del relevo. */
  recibir(texto: string, carrilId: string): boolean;
  /** Cambió algún carril: olvidar lo de vecinas caídas, volver a elegir rutas y anunciar si hace falta. */
  refrescar(): void;
  /** Llamar cada segundo o así: caducidad, anuncio periódico, rutas. */
  tic(): void;
  anunciar(): void;
  /** ¿Hay ruta ahora hacia `destino`? (sin anotar nada). */
  alcanza(destino: string): { relevo: string | null; nombreRelevo: string | null; carril: string } | null;
  enviarMensaje(destino: string, sobre: SobreMensaje, opts?: OpcionesEnvioRelevo): Promise<ResultadoRelevo>;
  canalHacia(destino: string): CanalArchivos;
  /** Destinos a los que llego por relevo ahora. */
  destinos(): string[];
  /** Hace cuánto (ms) tuve ruta hacia `destino`; null si nunca en esta sesión. Para decidir si merece esperar a que vuelva. */
  alcanzableHace(destino: string): number | null;
  nombreDe(neurona: string): string | null;
  /** Huella de una neurona: la de mi carril directo con ella o, si no lo hay, la que anuncian mis vecinas de la cuenta. */
  huellaDe(neurona: string): string | null;
  /** Pública ECDH de cifrado de una neurona según los anuncios de mi cuenta (respaldo de `clavePublica`). */
  claveAnunciada(neurona: string): JsonWebKey | null;
  estadisticas(): { relevadas: number; bytesRelevados: number; bucles: number; negativasDadas: number; negativasRecibidas: number; entregados: number; duplicados: number };
  parar(): void;
}

export function crearMotorRelevo(deps: DepsMotorRelevo): MotorRelevo {
  const ahora = deps.ahora ?? (() => Date.now());
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const anotar = (l: string) => {
    try {
      deps.anotar?.(l);
    } catch {
      /* el registro nunca tumba el envío */
    }
  };
  const tabla = new TablaAlcance();
  let seq = 0;
  let ultimoAnuncio = 0;
  let firmaVecinas = "";
  let parado = false;
  const rutas = new Map<string, { relevo: string | null }>();
  const vetos = new Map<string, number>();
  const esperasAcuse = new Map<string, (r: "ok" | "no") => void>();
  const esperasFa = new Map<string, (r: "ok" | "no") => void>();
  const entregados = new VistosAcotados(8192, 30 * 60_000);
  const tramasArchivo = new VistosAcotados(16384, 30 * 60_000);
  const canales = new Map<string, CanalArchivos>();
  const pasoAnotado = new Map<string, number>();
  const conRuta = new Map<string, number>();
  const est = { relevadas: 0, bytesRelevados: 0, bucles: 0, negativasDadas: 0, negativasRecibidas: 0, entregados: 0, duplicados: 0 };

  const nombre = (n: string | null): string => (n ? (tabla.nombreDe(n) ?? deps.carriles().find((c) => c.vecina === n)?.nombre ?? n.slice(0, 8)) : "directo");
  const yoN = () => deps.yo()?.neurona ?? null;
  /** La clave por las fuentes de la neurona (vivo, instantánea, certificado, servidor) y, si no hay, la anunciada por mi cuenta. */
  async function clave(n: string): Promise<JsonWebKey | null> {
    try {
      const k = await deps.clavePublica(n);
      if (k) return k;
    } catch {
      /* se prueba lo anunciado */
    }
    return tabla.claveDe(n, ahora());
  }

  function carrilesUtiles(): CarrilRelevo[] {
    try {
      return deps.carriles().filter((c) => CARRILES_RELEVO.has(c.tipo) && c.mismaCuenta);
    } catch {
      return [];
    }
  }
  function mejorCarrilCon(vecina: string, lista = carrilesUtiles()): CarrilRelevo | null {
    let mejor: CarrilRelevo | null = null;
    for (const c of lista) {
      if (c.vecina !== vecina) continue;
      if (!mejor || costeTramo({ carril: c.tipo, kbps: c.kbps, rttMs: c.rttMs }) < costeTramo({ carril: mejor.tipo, kbps: mejor.kbps, rttMs: mejor.rttMs })) mejor = c;
    }
    return mejor;
  }
  const vetado = (destino: string, relevo: string) => (vetos.get(`${destino}|${relevo}`) ?? 0) > ahora();
  function vetar(destino: string, relevo: string | null, ms: number, motivo: string): void {
    if (!relevo) return;
    vetos.set(`${destino}|${relevo}`, ahora() + ms);
    anotar(`veto destino=${nombre(destino)} relevo=${nombre(relevo)} ${Math.round(ms / 1000)}s motivo=${motivo.replace(/\s+/g, "-")}`);
  }

  interface Ruta {
    relevo: string | null;
    carril: CarrilRelevo;
    costeMs: number;
    tramos: RutaCandidata["tramos"];
  }

  function calcular(destino: string): { ruta: Ruta | null; motivo: MotivoRuta; cambia: boolean } {
    const t = ahora();
    const lista = carrilesUtiles();
    const cands: Array<RutaCandidata & { carril: CarrilRelevo }> = [];
    // Directo: solo con el formato del relevo si el destino lo entiende (una app anterior va por el camino de siempre).
    const directo = mejorCarrilCon(destino, lista);
    if (directo && tabla.hablaRelevo(destino, t)) cands.push({ relevo: null, carril: directo, tramos: [{ carril: directo.tipo, kbps: directo.kbps, rttMs: directo.rttMs }] });
    for (const r of tabla.relevosHacia(destino, t)) {
      if (!r.ofrece) continue;
      const c = mejorCarrilCon(r.relevo, lista);
      if (!c) continue;
      cands.push({ relevo: r.relevo, carril: c, tramos: [{ carril: c.tipo, kbps: c.kbps, rttMs: c.rttMs }, { carril: r.tramo.c, kbps: r.tramo.k, rttMs: r.tramo.l }] });
    }
    const vetados = new Set(cands.filter((c) => c.relevo && vetado(destino, c.relevo)).map((c) => c.relevo as string));
    const d = elegirRuta(cands, rutas.get(destino) ?? null, vetados);
    if (!d.ruta) return { ruta: null, motivo: d.motivo, cambia: d.cambia };
    const elegida = cands.find((c) => c.relevo === d.ruta?.relevo) ?? null;
    return { ruta: elegida ? { relevo: elegida.relevo, carril: elegida.carril, costeMs: d.ruta.costeMs, tramos: elegida.tramos } : null, motivo: d.motivo, cambia: d.cambia };
  }

  /** Ruta hacia `destino`; si cambia, la anota con su motivo. */
  function rutaHacia(destino: string): Ruta | null {
    const antes = rutas.get(destino) ?? null;
    const { ruta, motivo, cambia } = calcular(destino);
    if (cambia) {
      const de = antes ? (antes.relevo ? nombre(antes.relevo) : "directo") : "-";
      const a = ruta ? (ruta.relevo ? nombre(ruta.relevo) : "directo") : "-";
      anotar(
        `ruta destino=${nombre(destino)} de=${de} a=${a} motivo=${motivo}${ruta ? ` carril=${ruta.carril.tipo}${ruta.relevo ? `+${ruta.tramos[1]?.carril ?? "?"}` : ""} coste=${Math.round(ruta.costeMs)}ms` : ""}`,
      );
    }
    if (ruta) {
      rutas.set(destino, { relevo: ruta.relevo });
      conRuta.set(destino, ahora());
    }
    else rutas.delete(destino);
    return ruta;
  }

  async function mandar(t: TramaDatos, carril: CarrilRelevo): Promise<boolean> {
    try {
      return !!(await deps.enviarPorCarril(carril.id, JSON.stringify(t)));
    } catch {
      return false;
    }
  }
  function nuevoId(pref: string): string {
    try {
      return `${pref}${crypto.randomUUID()}`;
    } catch {
      return `${pref}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function anunciar(): void {
    const yo = deps.yo();
    if (!yo || parado) return;
    const lista = carrilesUtiles();
    const t = ahora();
    const vecinas: VecinaAnunciada[] = lista.map((c) => {
      const e = tabla.claveDe(c.vecina, t);
      return { n: c.vecina, c: c.tipo, k: c.kbps, l: c.rttMs, r: tabla.hablaRelevo(c.vecina, t) ? 1 : 0, ...(c.huella ? { h: c.huella } : {}), ...(e ? { e } : {}) };
    });
    const a = crearAnuncio({ yo: yo.neurona, uid: yo.uid ?? null, nombre: yo.nombre ?? null, seq: ++seq, ofrezco: deps.puedoRelevar(0).ok, clave: yo.clave ?? null, vecinas });
    const texto = JSON.stringify(a);
    ultimoAnuncio = t;
    const hechas = new Set<string>();
    for (const c of lista) {
      if (hechas.has(c.vecina)) continue;
      const mejor = mejorCarrilCon(c.vecina, lista);
      if (!mejor) continue;
      hechas.add(c.vecina);
      void Promise.resolve(deps.enviarPorCarril(mejor.id, texto)).catch(() => false);
    }
  }

  function firmaDeVecinas(): string {
    const t = ahora();
    return carrilesUtiles()
      .map((c) => `${c.vecina}:${c.tipo}:${tabla.hablaRelevo(c.vecina, t) ? 1 : 0}`)
      .sort()
      .join(",") + `|${deps.puedoRelevar(0).ok ? 1 : 0}`;
  }

  function reelegirRutas(): void {
    for (const d of Array.from(rutas.keys())) rutaHacia(d);
  }

  function refrescar(): void {
    if (parado) return;
    const presentes = new Set(carrilesUtiles().map((c) => c.vecina));
    for (const v of tabla.vecinas()) {
      if (!presentes.has(v)) {
        tabla.olvidar(v);
        anotar(`vecina-caida ${nombre(v)}: se olvida lo que anunciaba`);
      }
    }
    const f = firmaDeVecinas();
    if (f !== firmaVecinas) {
      firmaVecinas = f;
      anunciar();
    }
    reelegirRutas();
  }

  function tic(): void {
    if (parado) return;
    const t = ahora();
    for (const v of tabla.caducar(t)) anotar(`anuncio-caducado ${nombre(v)}`);
    for (const d of tabla.destinos(t)) conRuta.set(d, t);
    if (t - ultimoAnuncio >= ANUNCIO_MS) {
      firmaVecinas = firmaDeVecinas();
      anunciar();
    } else {
      refrescar();
    }
    reelegirRutas();
  }

  function negar(t: TramaDatos, carril: CarrilRelevo, motivo: string): void {
    const yo = yoN();
    if (!yo) return;
    est.negativasDadas++;
    anotar(`no-relevo o=${nombre(t.o)} d=${nombre(t.d)} motivo=${motivo.replace(/\s+/g, "-")}`);
    const n: TramaNegativa = { t: T_NEGATIVA, v: 1, id: t.id, d: t.d, n: yo, m: motivo };
    void Promise.resolve(deps.enviarPorCarril(carril.id, JSON.stringify(n))).catch(() => false);
  }

  /** Hacer de relevo: comprobaciones en orden y reenvío SOLO por un carril directo con el destino. */
  async function relevar(t: TramaDatos, carril: CarrilRelevo, yo: string): Promise<void> {
    if (!carril.mismaCuenta) return negar(t, carril, "solo hago de relevo entre neuronas de mi cuenta");
    if (t.r.includes(yo)) {
      est.bucles++;
      anotar(`bucle-cortado id=${t.id.slice(0, 12)} r=${t.r.map((n) => nombre(n)).join(">")}`);
      return;
    }
    if (t.r[t.r.length - 1] !== carril.vecina) return; // la ruta no acaba en quien me la da: trama falsa, se tira
    if (t.ttl <= 0 || t.r.length >= MAX_SALTOS) return negar(t, carril, "demasiados saltos");
    const salida = mejorCarrilCon(t.d);
    if (!salida) return negar(t, carril, `no tengo carril directo con ${nombre(t.d)}`);
    const bytes = t.p.length;
    const p = deps.puedoRelevar(bytes);
    if (!p.ok) return negar(t, carril, p.motivo ?? "tope de relevo");
    const fuera: TramaDatos = { ...t, r: [...t.r, yo], ttl: t.ttl - 1 };
    try {
      deps.alRelevar?.(t);
    } catch {
      /* solo auditoría */
    }
    const ok = await mandar(fuera, salida);
    if (!ok) return negar(t, carril, `el carril con ${nombre(t.d)} no aceptó la trama`);
    est.relevadas++;
    est.bytesRelevados += bytes;
    try {
      deps.sumarRelevado?.(bytes);
    } catch {
      /* contador */
    }
    const clave = `${t.o}|${t.d}`;
    if (ahora() - (pasoAnotado.get(clave) ?? 0) > 30_000) {
      pasoAnotado.set(clave, ahora());
      anotar(`relevo-pasa o=${nombre(t.o)} d=${nombre(t.d)} entra=${carril.tipo} sale=${salida.tipo}`);
    }
  }

  /** Respuestas (acuses) recién mandadas: si el relevo dice que no, se repiten por otra ruta. */
  const respuestas = new Map<string, { destino: string; k: "a" | "fa"; p: string; hasta: number }>();

  async function responder(destino: string, k: "a" | "fa", p: string, id: string): Promise<void> {
    const yo = deps.yo();
    if (!yo) return;
    respuestas.set(id, { destino, k, p, hasta: ahora() + 15_000 });
    if (respuestas.size > 512) for (const [x, v] of respuestas) if (v.hasta < ahora()) respuestas.delete(x);
    for (let i = 0; i < 3; i++) {
      const r = rutaHacia(destino);
      if (r) {
        const t: TramaDatos = { t: T_DATOS, v: 1, id, o: yo.neurona, d: destino, ...(yo.uid ? { u: yo.uid } : {}), r: [yo.neurona], ttl: MAX_SALTOS, k, p };
        if (await mandar(t, r.carril)) return;
        vetar(destino, r.relevo, 5_000, "el carril no aceptó la respuesta");
      }
      await esperar(200);
    }
  }

  async function paraMi(t: TramaDatos, carril: CarrilRelevo, yo: string): Promise<void> {
    const relevo = t.r.length > 1 ? t.r[1] : null;
    const nombreRelevo = relevo ? nombre(relevo) : null;
    if (t.k === "m") {
      const repetido = entregados.tiene(t.id, ahora());
      if (!repetido) {
        const sobre = await abrirMensaje(deps.cripto, t, yo);
        if (!sobre || sobre.id !== t.id) {
          anotar(`rechazado id=${t.id.slice(0, 12)} o=${nombre(t.o)}: no abre o la firma no es de esa neurona`);
          return;
        }
        if (!entregados.visto(t.id, ahora())) {
          est.entregados++;
          try {
            deps.entregar({ sobre, origen: t.o, relevo, nombreRelevo, carril });
          } catch {
            /* un oyente roto no tumba el acuse */
          }
        }
      } else {
        est.duplicados++;
      }
      const pub = await clave(t.o);
      if (!pub) return;
      const p = await sellarAcuse(deps.cripto, pub, yo, t.o, t.id);
      if (p) await responder(t.o, "a", p, `a:${t.id}`);
      return;
    }
    if (t.k === "a") {
      const id = await abrirAcuse(deps.cripto, t, yo);
      if (id) esperasAcuse.get(id)?.("ok");
      return;
    }
    if (t.k === "fa") {
      esperasFa.get(t.p)?.("ok");
      return;
    }
    // k === "f"
    void responder(t.o, "fa", t.id, `fa:${t.id}`);
    if (tramasArchivo.visto(t.id, ahora())) {
      est.duplicados++;
      return;
    }
    const canal = canalHacia(t.o) as CanalArchivos & { _entregar(x: string): boolean };
    if (deps.alArchivo) {
      try {
        deps.alArchivo(t.o, t.p, canal, { relevo, nombreRelevo });
      } catch {
        /* el motor de archivos decide */
      }
    } else canal._entregar(t.p);
  }

  function recibir(texto: string, carrilId: string): boolean {
    if (typeof texto !== "string" || !texto.startsWith('{"t":"tu.rv')) return false;
    if (parado) return true;
    const carril = deps.carriles().find((c) => c.id === carrilId);
    if (!carril) return true;
    const yo = yoN();
    if (!yo) return true;
    const x = parsear(texto) as { t?: unknown } | null;
    if (!x) return true;
    if (x.t === T_ANUNCIO) {
      if (!carril.mismaCuenta) return true; // fase 1: solo anuncios de mi cuenta
      const a = leerAnuncio(x);
      if (!a) return true;
      const r = tabla.registrar(carril.vecina, a, ahora());
      if (r === "nuevo" || r === "cambio") {
        // Lo que esta vecina dice ahora es nuevo: sus vetos (dijo que no, o no llegó el acuse por ella) dejan de valer.
        for (const k of Array.from(vetos.keys())) if (k.endsWith(`|${carril.vecina}`)) vetos.delete(k);
        anotar(`tabla ${nombre(carril.vecina)} ${a.rel ? "releva" : "no-releva"} alcanza=${a.vs.filter((v) => v.r === 1).map((v) => `${nombre(v.n)}(${v.c})`).join(",") || "-"}`);
        if (r === "nuevo") {
          // Conocerla cambia lo que yo anuncio (ahora sé que habla relevo).
          const f = firmaDeVecinas();
          if (f !== firmaVecinas) {
            firmaVecinas = f;
            anunciar();
          }
        }
        reelegirRutas();
      }
      return true;
    }
    if (x.t === T_NEGATIVA) {
      const n = leerNegativa(x);
      if (!n || n.n !== carril.vecina) return true;
      est.negativasRecibidas++;
      vetar(n.d, n.n, VETO_NEGATIVA_MS, n.m);
      esperasAcuse.get(n.id)?.("no");
      esperasFa.get(n.id)?.("no");
      const resp = respuestas.get(n.id);
      if (resp && resp.hasta > ahora()) void responder(resp.destino, resp.k, resp.p, n.id); // el acuse, por otra ruta
      reelegirRutas();
      return true;
    }
    if (x.t === T_DATOS) {
      const t = leerTramaDatos(x);
      if (!t) return true;
      if (t.d === yo) void paraMi(t, carril, yo);
      else void relevar(t, carril, yo);
      return true;
    }
    return true;
  }

  function esperarRespuesta(mapa: Map<string, (r: "ok" | "no") => void>, id: string, ms: number): Promise<"ok" | "no" | "tiempo"> {
    return new Promise((res) => {
      const reloj = setTimeout(() => {
        mapa.delete(id);
        res("tiempo");
      }, ms);
      mapa.set(id, (r) => {
        clearTimeout(reloj);
        mapa.delete(id);
        res(r);
      });
    });
  }

  async function enviarMensaje(destino: string, sobre: SobreMensaje, opts: OpcionesEnvioRelevo = {}): Promise<ResultadoRelevo> {
    const inicio = ahora();
    const plazo = opts.plazoMs ?? PLAZO_MENSAJE_MS;
    const espera = opts.esperaAcuseMs ?? ESPERA_ACUSE_MS;
    const intentos: ResultadoRelevo["intentos"] = [];
    const fallo = (motivo: string): ResultadoRelevo => ({ ok: false, confirmado: false, relevo: null, nombreRelevo: null, carril: null, carrilId: null, intentos, ms: ahora() - inicio, motivo });
    const yo = deps.yo();
    if (!yo) return fallo("sin identidad de neurona");
    const pub = await clave(destino);
    if (!pub) return fallo("sin la clave de cifrado de esa neurona: no se manda en claro");
    const p = await sellarMensaje(deps.cripto, pub, yo.neurona, destino, sobre);
    if (!p) return fallo("no se pudo sellar el mensaje");
    let esperando = false;
    while (!parado && ahora() - inicio < plazo) {
      const r = rutaHacia(destino);
      if (!r) {
        if (!esperando) {
          esperando = true;
          anotar(`en-espera destino=${nombre(destino)} id=${sobre.id.slice(0, 12)}: sin ruta, se espera a que aparezca`);
        }
        await esperar(ESPERA_SIN_RUTA_MS);
        continue;
      }
      if (esperando) {
        esperando = false;
        anotar(`reanuda destino=${nombre(destino)} id=${sobre.id.slice(0, 12)} por=${r.relevo ? nombre(r.relevo) : "directo"} tras=${ahora() - inicio}ms`);
      }
      const t: TramaDatos = { t: T_DATOS, v: 1, id: sobre.id, o: yo.neurona, d: destino, ...(yo.uid ? { u: yo.uid } : {}), r: [yo.neurona], ttl: MAX_SALTOS, k: "m", p };
      const salida = esperarRespuesta(esperasAcuse, sobre.id, espera);
      const ok = await mandar(t, r.carril);
      if (!ok) {
        esperasAcuse.get(sobre.id)?.("no");
        await salida;
        intentos.push({ relevo: r.relevo, ok: false, detalle: "el carril no aceptó la trama" });
        vetar(destino, r.relevo, 5_000, "el carril no aceptó la trama");
        await esperar(ESPERA_SIN_RUTA_MS);
        continue;
      }
      const res = await salida;
      if (res === "ok") {
        intentos.push({ relevo: r.relevo, ok: true, detalle: "acuse sellado del destino" });
        anotar(`entregado destino=${nombre(destino)} por=${r.relevo ? nombre(r.relevo) : "directo"} intento=${intentos.length} ms=${ahora() - inicio}`);
        return { ok: true, confirmado: true, relevo: r.relevo, nombreRelevo: r.relevo ? nombre(r.relevo) : null, carril: r.carril.tipo, carrilId: r.carril.id, intentos, ms: ahora() - inicio };
      }
      if (res === "no") {
        intentos.push({ relevo: r.relevo, ok: false, detalle: "el relevo dijo que no" });
        continue;
      }
      intentos.push({ relevo: r.relevo, ok: false, detalle: `sin acuse en ${espera} ms` });
      vetar(destino, r.relevo, VETO_SIN_ACUSE_MS, `sin acuse en ${espera} ms`);
    }
    anotar(`agotado destino=${nombre(destino)} id=${sobre.id.slice(0, 12)} intentos=${intentos.length} ms=${ahora() - inicio}`);
    return fallo(intentos.length ? "ningún relevo entregó a tiempo" : "ninguna neurona de tu cuenta llega a esa neurona ahora");
  }

  function canalHacia(destino: string): CanalArchivos {
    const hecho = canales.get(destino);
    if (hecho) return hecho;
    const oyentes = new Set<(d: string | ArrayBuffer) => void>();
    let pendientes = 0;
    let cola: Promise<unknown> = Promise.resolve();

    async function fiable(texto: string): Promise<boolean> {
      const yo = deps.yo();
      if (!yo) return false;
      const id = nuevoId("f:");
      const inicio = ahora();
      while (!parado && ahora() - inicio < PLAZO_TRAMA_ARCHIVO_MS) {
        const r = rutaHacia(destino);
        if (!r) {
          await esperar(ESPERA_SIN_RUTA_MS);
          continue;
        }
        const t: TramaDatos = { t: T_DATOS, v: 1, id, o: yo.neurona, d: destino, ...(yo.uid ? { u: yo.uid } : {}), r: [yo.neurona], ttl: MAX_SALTOS, k: "f", p: texto };
        const espera = Math.max(1500, Math.min(8000, Math.round(r.costeMs * 6)));
        const salida = esperarRespuesta(esperasFa, id, espera);
        if (!(await mandar(t, r.carril))) {
          esperasFa.get(id)?.("no");
          await salida;
          vetar(destino, r.relevo, 5_000, "el carril no aceptó la trama");
          await esperar(ESPERA_SIN_RUTA_MS);
          continue;
        }
        const res = await salida;
        if (res === "ok") return true;
        if (res === "tiempo") vetar(destino, r.relevo, VETO_SIN_ACUSE_MS, "trama de archivo sin acuse");
      }
      return false;
    }
    function enCola(texto: string): Promise<boolean> {
      pendientes += texto.length;
      const p = cola.then(() => fiable(texto)).catch(() => false);
      cola = p.finally(() => {
        pendientes -= texto.length;
      });
      return p;
    }
    const canal: CanalArchivos & { _entregar(x: string): boolean } = {
      enviar(texto) {
        // Sin ruta ahora se encola igual: espera a que aparezca, como un enlace que se está reconectando.
        void enCola(texto);
        return true;
      },
      enviarConAcuse: (texto) => enCola(texto),
      bufferedAmount: () => pendientes,
      // El trozo se fija en la oferta y la ruta puede cambiar a mitad (de la red local al Bluetooth): siempre el que cabe en una
      // trama de Bluetooth (16 KiB) una vez en base64, sellado y dentro de la trama del relevo.
      tamanoTrozo: () => TROZO_RELEVO_BLE,
      maxTextoBytes: () => 12 * 1024,
      enlaceArriba: () => !!calcular(destino).ruta,
      async esperarListo() {
        const fin = ahora() + ESPERA_LISTO_MS;
        while (!parado && ahora() < fin) {
          if (calcular(destino).ruta) return true;
          await esperar(ESPERA_SIN_RUTA_MS);
        }
        return false;
      },
      rutaMedida: () => "relevo",
      resumenVias: () => {
        const r = rutas.get(destino);
        if (!r) return null;
        return { texto: r.relevo ? `por relevo de ${nombre(r.relevo)}` : "directo", bps: 0 };
      },
      alMensaje(cb) {
        oyentes.add(cb);
        return () => {
          oyentes.delete(cb);
        };
      },
      _entregar(x) {
        for (const cb of Array.from(oyentes)) {
          try {
            cb(x);
          } catch {
            /* un oyente roto no tumba los demás */
          }
        }
        return oyentes.size > 0;
      },
    };
    canales.set(destino, canal);
    return canal;
  }

  return {
    recibir,
    refrescar,
    tic,
    anunciar,
    alcanza(destino) {
      const r = calcular(destino).ruta;
      return r ? { relevo: r.relevo, nombreRelevo: r.relevo ? nombre(r.relevo) : null, carril: r.carril.tipo } : null;
    },
    enviarMensaje,
    canalHacia,
    destinos: () => tabla.destinos(ahora()).filter((d) => d !== yoN()),
    alcanzableHace(destino) {
      if (calcular(destino).ruta) return 0;
      const t = conRuta.get(destino);
      return t === undefined ? null : ahora() - t;
    },
    nombreDe: (n) => tabla.nombreDe(n),
    claveAnunciada: (n) => tabla.claveDe(n, ahora()),
    huellaDe: (n) => carrilesUtiles().find((c) => c.vecina === n && c.huella)?.huella ?? tabla.huellaDe(n, ahora()),
    estadisticas: () => ({ ...est }),
    parar() {
      parado = true;
    },
  };
}
