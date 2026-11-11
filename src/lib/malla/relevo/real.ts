"use client";

/**
 * relevo/real — el motor de relevo de ESTA neurona, enchufado a los carriles reales (REL1111I · 2026-11-11).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §14. Lo carga perezoso el transporte universal (`iniciarTransporteUniversal`,
 * y el primer envío que no encuentra carril directo). Nada de aquí se carga si nunca hace falta un relevo… salvo el anuncio,
 * que sale en cuanto arranca el transporte (≈ 200 B cada 10 s por vecina de la cuenta).
 *
 *   · Carriles: los de `enlacesDisponibles()` (Bluetooth directo, red local nativa, enlace local, malla de la cuenta) que
 *     llegan a una neurona de MI cuenta, releídos cada 2 s y al cambiar.
 *   · Sello: `recipient-crypto` v:3 (la clave de cifrado de cada neurona; la del destino por vivo → instantánea → certificado
 *     → servidor) y la firma de la identidad de malla. La huella del firmante debe ser la que esta neurona conoce para esa
 *     neurona de la cuenta (espejo de huellas, OFF1108A) o, si nunca la vio, la que le anuncian sus vecinas de la cuenta.
 *   · Topes de relevo: los de «Relés · mis neuronas» de Envíos de archivos (`topesSalto`: interruptor, batería mínima y datos
 *     del día), los mismos que ya valían para el salto de archivos.
 *   · Registro: cada línea va a `enlaces.log` como `… web relevo - - <texto>` (grep ' relevo ').
 * Nunca lanza.
 */

import { crearMotorRelevo, type CarrilRelevo, type MotorRelevo } from "./motor";
import { CARRILES_RELEVO } from "./tabla";
import type { CriptoRelevo, FirmaRelevo } from "./sobre";
import type { DestinoTransporte, EnlaceDisponible, ResultadoRelevoEnvio, SobreMensaje, TipoEnlace } from "@/lib/malla/transporte-universal";
import type { CanalArchivoElegido } from "@/lib/malla/transporte-universal";

type ModTU = typeof import("@/lib/malla/transporte-universal");

let motor: MotorRelevo | null = null;
let tu: ModTU | null = null;
let cache: EnlaceDisponible[] = [];
let firmaCache = "";
let uid: string | null = null;
let propias = new Set<string>();
let huellas = new Map<string, string>();
let reloj: ReturnType<typeof setInterval> | null = null;
let usos = 0;

function registrar(texto: string): void {
  try {
    const linea = `${new Date().toISOString()} web relevo - - ${texto}`;
    void import("@/lib/nativa/puente").then(({ puenteNativo }) => puenteNativo().llamar("ble_registro_anexar", { lineas: [linea] })).catch(() => undefined);
    if (typeof console !== "undefined") console.debug?.(`[relevo] ${texto}`);
  } catch {
    /* sin registro */
  }
}

function neuronaDe(e: EnlaceDisponible): string | null {
  if (e.alcanza.neuronDeviceId) return e.alcanza.neuronDeviceId;
  return null;
}

function carriles(): CarrilRelevo[] {
  const out: CarrilRelevo[] = [];
  for (const e of cache) {
    if (!e.abierto || !CARRILES_RELEVO.has(e.tipo) || e.protocolo === "localsend") continue;
    const n = neuronaDe(e);
    if (!n) continue;
    const misma = e.tipo === "cuenta" || (!!uid && e.alcanza.uid === uid) || propias.has(n);
    out.push({ id: e.id, tipo: e.tipo, vecina: n, mismaCuenta: misma, nombre: e.etiqueta, kbps: e.capacidadKbps ?? null, rttMs: e.rttMs ?? null, huella: huellas.get(n) ?? null });
  }
  return out;
}

async function refrescarCache(): Promise<void> {
  try {
    tu ??= await import("@/lib/malla/transporte-universal");
    const [lista, cuenta] = await Promise.all([
      tu.enlacesDisponibles(),
      import("@/lib/sin-internet/huellas-cuenta-vivas").then(async (h) => {
        await h.cargarEspejo();
        return { uid: h.cuentaDelEspejo(), vinculos: h.vinculosDeCuentaCacheados(), ids: h.idsNeuronasCuentaCacheados() };
      }).catch(() => null),
    ]);
    cache = lista;
    if (cuenta) {
      uid = cuenta.uid ?? uid;
      propias = new Set(cuenta.ids);
      huellas = new Map(cuenta.vinculos.map((v) => [v.neurona, v.huella]));
    }
    try {
      const { snapshotMallaNeuronas } = await import("@/lib/network/malla-neuronas");
      for (const f of snapshotMallaNeuronas().misDispositivos) if (f.neuronId) propias.add(f.neuronId);
    } catch {
      /* sin malla de la cuenta */
    }
    const firma = carriles()
      .map((c) => `${c.id}:${c.vecina}:${c.mismaCuenta ? 1 : 0}`)
      .sort()
      .join(",");
    if (firma !== firmaCache) {
      firmaCache = firma;
      motor?.refrescar();
    }
  } catch {
    /* se reintenta en el siguiente tic */
  }
}

/**
 * El sello real de esta neurona: `recipient-crypto` v:3 con su clave persistida y la firma de su identidad de malla. `conocida`
 * dice qué huella espera para una neurona (la del espejo de la cuenta o la anunciada por las vecinas). Lo usa también el banco.
 */
export function crearCriptoReal(conocida: (neurona: string) => string | null): CriptoRelevo {
  return {
    async cifrar(pub, obj) {
      const { encryptEnvelopeFor } = await import("@/ai/astraura/mesh/recipient-crypto");
      return encryptEnvelopeFor(pub, obj);
    },
    async abrir(sobre) {
      const { decryptEnvelopeFor } = await import("@/ai/astraura/mesh/recipient-crypto");
      return decryptEnvelopeFor(sobre as Parameters<typeof decryptEnvelopeFor>[0]);
    },
    async firmar(cuerpo) {
      const { signContent } = await import("@/ai/astraura/mesh/mesh-identity");
      return (await signContent(cuerpo)) as FirmaRelevo | null;
    },
    async verificar(cuerpo, firma, neurona) {
      const { verifyContent, fpOf } = await import("@/ai/astraura/mesh/mesh-identity");
      if (!(await verifyContent(cuerpo, firma.s, firma.k))) return false;
      const fp = await fpOf(firma.k);
      const esperada = conocida(neurona);
      return !!fp && fp === esperada;
    },
  };
}

const cripto = crearCriptoReal((n) => huellas.get(n) ?? motor?.huellaDe(n) ?? null);

function crear(): MotorRelevo {
  if (motor) return motor;
  motor = crearMotorRelevo({
    yo: () => {
      try {
        const neurona = idPropia;
        return neurona ? { neurona, uid, nombre: nombrePropio, clave: clavePropia } : null;
      } catch {
        return null;
      }
    },
    carriles,
    enviarPorCarril: async (id, texto) => {
      const e = cache.find((x) => x.id === id);
      if (!e || !tu) return false;
      return tu.enviarTextoPorEnlace(e, texto);
    },
    clavePublica: async (n) => {
      try {
        const { resolverClavesReales } = await import("@/lib/malla/archivo-seguro-real");
        return (await resolverClavesReales([n])).destinatarios[0]?.pub ?? null;
      } catch {
        return null;
      }
    },
    cripto,
    puedoRelevar: (bytes) => {
      try {
        return topes(bytes);
      } catch {
        return { ok: false, motivo: "sin ajustes" };
      }
    },
    sumarRelevado: (bytes) => sumarHoy(bytes),
    entregar: (m) => {
      tu?.entregarDesdeRelevo({
        id: m.sobre.id,
        canal: m.sobre.c,
        cuerpo: m.sobre.b,
        origen: {
          tipo: m.carril.tipo as TipoEnlace,
          enlaceId: `relevo:${m.relevo ?? m.origen}`,
          etiqueta: m.relevo ? `por relevo de ${m.nombreRelevo ?? "otra neurona"}` : m.carril.nombre ?? "Neurona de tu cuenta",
          ...(m.sobre.de?.s ? { syncDeviceId: m.sobre.de.s } : {}),
        },
        at: Date.now(),
      });
    },
    alArchivo: (origen, texto, canal, info) => {
      void Promise.all([import("@/lib/malla/recepcion-sellada"), import("@/lib/network/archivos-malla")])
        .then(([rs, am]) =>
          rs.recibirArchivo(am.motorArchivosCompartido(), canal, texto, {
            mismaCuenta: true,
            via: info.relevo ? `por relevo de ${info.nombreRelevo ?? "otra neurona de tu cuenta"}` : "Neurona de tu cuenta",
            etiquetaOrigen: motor?.nombreDe(origen) ?? "Neurona de tu cuenta",
            nodoId: origen,
          }),
        )
        .catch(() => undefined);
    },
    anotar: registrar,
  });
  return motor;
}

let idPropia: string | null = null;
let nombrePropio: string | null = null;
let clavePropia: JsonWebKey | null = null;
let topes: (bytes: number) => { ok: boolean; motivo?: string } = () => ({ ok: false, motivo: "cargando ajustes" });
let sumarHoy: (bytes: number) => void = () => undefined;

const K_RELEVO_DIA = "starseed.malla.relevo.dia.v1";

async function prepararIdentidad(): Promise<void> {
  const [{ identidadDispositivo }, sinc, av] = await Promise.all([
    import("@/lib/network/identidad-dispositivo"),
    import("@/lib/malla/sincronizacion-neuronas-motor"),
    import("@/lib/malla/ajustes-vias-archivo"),
  ]);
  idPropia = identidadDispositivo().neuronDeviceId ?? null;
  nombrePropio = idPropia ? sinc.nombreDeEstaNeurona(idPropia) : null;
  try {
    clavePropia = await (await import("@/ai/astraura/mesh/recipient-crypto")).myEncryptionPublicKey();
  } catch {
    clavePropia = null;
  }
  let bateria: { nivel: number | null; cargando: boolean } = { nivel: null, cargando: true };
  try {
    void (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery?.().then((b) => {
      bateria = { nivel: b.level, cargando: b.charging };
    });
  } catch {
    /* sin batería */
  }
  const usadoHoy = (): number => {
    try {
      const x = JSON.parse(localStorage.getItem(K_RELEVO_DIA) ?? "null") as { dia: string; bytes: number } | null;
      return x && x.dia === new Date().toISOString().slice(0, 10) ? x.bytes : 0;
    } catch {
      return 0;
    }
  };
  topes = (bytes) => av.topesSalto(av.leerAjustesVias(), { bateria: bateria.nivel, cargando: bateria.cargando, usadoHoy: usadoHoy(), bytes });
  sumarHoy = (bytes) => {
    try {
      localStorage.setItem(K_RELEVO_DIA, JSON.stringify({ dia: new Date().toISOString().slice(0, 10), bytes: usadoHoy() + bytes }));
    } catch {
      /* solo informativo */
    }
  };
}

/** Arranca el relevo de esta neurona (anuncio, escucha, tic). Devuelve la parada. Idempotente por recuento. */
export function iniciarRelevo(): () => void {
  usos += 1;
  if (usos === 1) {
    void (async () => {
      await prepararIdentidad().catch(() => undefined);
      tu ??= await import("@/lib/malla/transporte-universal");
      const m = crear();
      tu.fijarReceptorRelevo((texto, origen) => {
        m.recibir(texto, origen.enlaceId);
      });
      await refrescarCache();
      m.refrescar();
      reloj = setInterval(() => {
        void refrescarCache().then(() => m.tic());
      }, 2_000);
    })();
  }
  return () => {
    usos = Math.max(0, usos - 1);
    if (usos === 0) {
      if (reloj) clearInterval(reloj);
      reloj = null;
      tu?.fijarReceptorRelevo(null);
      motor?.parar();
      motor = null;
    }
  };
}

function neuronaDestino(destino: DestinoTransporte): string | null {
  if (destino.neuronDeviceId) return destino.neuronDeviceId;
  if (destino.syncDeviceId) {
    const e = cache.find((x) => x.alcanza.syncDeviceId === destino.syncDeviceId && x.alcanza.neuronDeviceId);
    return e?.alcanza.neuronDeviceId ?? null;
  }
  return null;
}

/** Envío de un `tu.msg` por relevo (lo llama `crearEnviador`). null = no aplica ahora. */
export async function enviarPorRelevo(destino: DestinoTransporte, sobre: SobreMensaje, o: { esperarRuta: boolean }): Promise<ResultadoRelevoEnvio | null> {
  if (!motor) return null;
  const n = neuronaDestino(destino);
  if (!n || n === idPropia) return null;
  if (!motor.alcanza(n)) {
    // Sin ruta ahora: solo se espera (el plazo entero, 20 s) si hubo ruta hace poco (un relevo que se reconecta);
    // a una neurona que nadie anunció nunca no se le hace esperar a quien llama.
    const hace = motor.alcanzableHace(n);
    if (!o.esperarRuta || hace === null || hace > ESPERA_SI_HUBO_RUTA_MS) return null;
  }
  return aResultado(await motor.enviarMensaje(n, sobre));
}

/** Si hubo ruta hacia la neurona en este tiempo, un envío sin ruta espera a que vuelva. */
const ESPERA_SI_HUBO_RUTA_MS = 120_000;

function aResultado(r: Awaited<ReturnType<MotorRelevo["enviarMensaje"]>>): ResultadoRelevoEnvio {
  const etiqueta = r.relevo ? `por relevo de ${r.nombreRelevo ?? "otra neurona"}` : "Neurona de tu cuenta";
  return {
    ok: r.ok,
    confirmado: r.confirmado,
    enlace: r.ok ? { id: `relevo:${r.relevo ?? "directo"}`, tipo: (r.carril ?? "cuenta") as TipoEnlace, etiqueta } : null,
    relevo: r.ok && r.relevo ? { neurona: r.relevo, nombre: r.nombreRelevo } : null,
    detalle: r.ok ? `${etiqueta}: acuse sellado del destino (${r.ms} ms, ${r.intentos.length} intento${r.intentos.length === 1 ? "" : "s"})` : (r.motivo ?? "no salió por relevo"),
  };
}

/** Canal de archivo por relevo, sellado de punta a punta para la neurona destino. null = no hay ruta. */
export async function canalArchivoPorRelevo(destino: DestinoTransporte): Promise<Omit<CanalArchivoElegido, "descartados"> | null> {
  if (!motor) return null;
  const n = neuronaDestino(destino);
  if (!n || n === idPropia) return null;
  const ruta = motor.alcanza(n);
  if (!ruta) return null;
  const [{ crearCanalSellado }, real] = await Promise.all([import("@/lib/malla/canal-sellado"), import("@/lib/malla/archivo-seguro-real")]);
  const destinatarios = await real.destinatariosReales([n]);
  if (!destinatarios.length) return null; // sin clave del destino: no se manda en claro
  const sellado = crearCanalSellado(motor.canalHacia(n), { destinatarios: () => destinatarios, parCifra: () => true });
  const etiqueta = ruta.relevo ? `por relevo de ${ruta.nombreRelevo ?? "otra neurona"}` : "Neurona de tu cuenta";
  const enlace: EnlaceDisponible = {
    id: `relevo:${ruta.relevo ?? "directo"}`,
    tipo: ruta.carril as TipoEnlace,
    etiqueta,
    alcanza: { neuronDeviceId: n },
    abierto: true,
    sinInternet: true,
    admite: { mensaje: true, archivo: true, flujo: false },
  };
  return {
    canal: sellado,
    enlaces: [enlace],
    multi: null,
    modoCifrado: "archivo",
    sellado,
    vias: [{ id: enlace.id, tipo: "rele-neurona", etiqueta }],
    excluidas: [],
    copias: 1,
  };
}

/** Para la interfaz y el diagnóstico: a quién llego por relevo ahora. */
export function estadoRelevo(): { destinos: Array<{ neurona: string; por: string | null }>; estadisticas: ReturnType<MotorRelevo["estadisticas"]> | null } {
  if (!motor) return { destinos: [], estadisticas: null };
  const m = motor;
  return {
    destinos: m.destinos().map((d) => ({ neurona: d, por: m.alcanza(d)?.nombreRelevo ?? null })),
    estadisticas: m.estadisticas(),
  };
}
