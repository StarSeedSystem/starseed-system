"use client";

/**
 * bluetooth-directo-motor — el enlace `ble:<id>` («Bluetooth directo») de la app nativa (2026-11-08 · BLE1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/bluetooth-directo.md`. Lo puro está en `bluetooth-directo.ts` (y el saludo, las
 * tramas y el ritmo, en `red-local-nativa.ts`); aquí se envía, se recibe y se recuerda, con TODO lo del
 * mundo inyectado (las pruebas montan dos apps en memoria con un puente Bluetooth de mentira).
 *
 *   · La app nativa (Rust) anuncia, escanea y conecta sola con tus neuronas cercanas; cada 15 s y en cada
 *     `ble://cambio` este motor mira los enlaces abiertos y SALUDA (`nl.hola` firmado, con la prueba de
 *     cuenta) por los que aún no dijeron quién son. Quien recibe un saludo válido contesta y el enlace
 *     queda LIGADO a esa neurona: desde entonces es un enlace más del transporte universal.
 *   · Una cola por enlace: `control` (mensajes, saludos, control Wi-Fi) delante de `datos` (archivos, en
 *     orden estricto). Cada trama espera el ACUSE de la otra app (`ble_enviar`); 6 fallos seguidos → ese
 *     enlace se da por caído 30 s (y se dice). Ritmo: el 60 % del cupo del otro (su saludo lo dice).
 *   · Lo que llega de un enlace ligado va a sus oyentes de siempre: `tu.*` al transporte universal,
 *     `archivo.*` al motor de archivos (que SIEMPRE pregunta), `enlace.wifi.*` a quien negocie el Wi-Fi
 *     directo (WFD1108A). De un enlace sin ligar, solo se escucha el saludo.
 */

import {
  CAIDA_MS,
  FALLOS_PARA_CAIDA,
  aceptarHola,
  armarTrama,
  claseDeTexto,
  desempaquetarLote,
  esperaTrasFallo,
  esPruebaCuenta,
  holaNativa,
  leerHola,
  leerLimites,
  maxTextoPorTrama,
  mismaPrueba,
  nuevaCubeta,
  textoPruebaCuenta,
  tomarFicha,
  type Cubeta,
  type LimitesCanal,
  type QuienNativo,
  type VinculoMinimo,
} from "./red-local-nativa";
import {
  COMANDO_ENVIAR_BLE,
  COMANDO_ESTADO_BLE,
  COMANDO_RECIBIDOS_BLE,
  EVENTO_CAMBIO_BLE,
  EVENTO_MENSAJE_BLE,
  LIMITES_BLE_DEFECTO,
  T_OFERTA_WIFI,
  T_RESPUESTA_WIFI,
  datosAsociadosSecreto,
  enlacesBle,
  idEnlaceBle,
  leerControlEnlace,
  leerEstadoBle,
  ligaduraDeEnlace,
  ligaduraDeNeuronaBle,
  ligarBle,
  limitesPropiosBle,
  podarLigadurasBle,
  saludosBle,
  textoClaveSecreto,
  trozoArchivoBle,
  type ControlEnlaceWifi,
  type EstadoBleNativo,
  type LigaduraBle,
  type MensajeBleNativo,
  type SecretoCifrado,
} from "./bluetooth-directo";
import {
  VERSION_CIFRADO,
  crearSesionesCifradas,
  decidirModo,
  esAcuerdo,
  esTextoSiempreEnClaro,
  esTramaCifrada,
  etiquetaCifrado,
  limitesParaCifrado,
  verificadorCertificadoPorDefecto,
  type CertificadoNeurona,
  type EtiquetaCifrado,
  type ModoEnlace,
  type SesionesCifradas,
  type VerificadorCertificado,
} from "./sesion-cifrada";
import type { EnlaceDisponible } from "./eleccion-enlace";
import type { CanalArchivos } from "@/lib/network/archivos-malla";

/* ══════════════════════════ Dependencias (inyectables) ══════════════════════════ */

export interface DepsBle {
  ahora(): number;
  dormir(ms: number): Promise<void>;
  /** `ble_estado` (null: la app no respondió). */
  estado(): Promise<EstadoBleNativo | null>;
  /** `ble_enviar`: se resuelve con el ACUSE de la otra app (lo guardó). */
  enviar(enlace: string, json: string): Promise<{ ok: true; ms: number } | { ok: false; motivo: string }>;
  yo(): Promise<QuienNativo | null>;
  vinculos(): VinculoMinimo[];
  /** Ids de las neuronas de tu cuenta que conoce la web (para saludar por enlaces sin reconocer). */
  neuronasCuenta?(): string[];
  firmar(cuerpo: unknown): Promise<unknown | null>;
  verificar(sobre: unknown): Promise<{ cuerpo: unknown; huella?: string; valido: boolean }>;
  /** Un `tu.*` de un enlace ligado → transporte universal (ya acusó la app). */
  entregarTransporte(texto: string, origen: { enlaceId: string; etiqueta: string; syncDeviceId?: string }): void;
  /** Un `archivo.*` de un enlace ligado → motor de archivos (que siempre pregunta). */
  entregarArchivo(canal: CanalArchivos, texto: string, etiquetaOrigen: string, quien?: { huella: string; porCuenta?: boolean }): void;
  /** HMAC-SHA256 con la clave de faro de la cuenta (32 hex) o null sin clave. Nunca la devuelve. */
  pruebaCuenta?(texto: string): Promise<string | null>;
  huellaPropia?(): Promise<string | null>;
  /** (CIF1108A) Sesiones cifradas de punta a punta (`sesion-cifrada.ts`); ausente: esta app no cifra. */
  sesiones?: SesionesCifradas;
  /** (CIF1108A) Ajuste «Exigir cifrado en la red local» (vale también para Bluetooth). */
  exigirCifrado?(): boolean;
  /** (CIF1108A) Gancho de identidad: certificado cuenta→neurona propio / verificador (IDN1108A). */
  certificadoPropio?(): Promise<CertificadoNeurona | null>;
  verificarCertificado?: VerificadorCertificado;
  /** (IDN1108A) Gancho: ¿el certificado prueba que esa neurona es de MI cuenta? Si sí, se acepta sin vínculo previo (sin internet). */
  certificadoMismaCuenta?: VerificadorCertificado;
}

export interface ResultadoEnvioBle {
  ok: boolean;
  /** Ida y vuelta medida (de encolar al acuse de la otra app). */
  ms?: number;
  motivo?: string;
}

/** Lo que pone quien manda el control; el motor añade `v`, `de`, `para` y `ts` y lo firma. */
export type CuerpoControl = ControlEnlaceWifi extends infer T ? (T extends ControlEnlaceWifi ? Omit<T, "v" | "de" | "para" | "ts"> : never) : never;

export interface OrigenControl {
  neurona: string;
  /** «ble:b3». */
  enlaceId: string;
  huella: string;
}

export interface InstantaneaBle {
  estado: EstadoBleNativo | null;
  ligaduras: LigaduraBle[];
  caidas: Record<string, number>;
  ultimoRechazo: string | null;
  /** (CIF1108A) Estado del cifrado por neurona ligada. */
  cifrado: Record<string, EtiquetaCifrado>;
}

export interface RedBle {
  /** Lee el estado de la app y saluda por los enlaces sin ligar. */
  refrescar(): Promise<void>;
  /** Un `ble://cambio` de la app (no espera a la siguiente vuelta). */
  aplicarEstado(x: unknown): void;
  enlaces(): EnlaceDisponible[];
  /** Enlace ligado con esa neurona ahora («b3»), o null. */
  enlaceHacia(neurona: string): string | null;
  /** (CIF1108A) «cifrado» / «sin-cifrar» / «pendiente» (null: sin enlace ligado con esa neurona). */
  cifradoDe?(neurona: string): EtiquetaCifrado | null;
  /** Manda un texto (objeto JSON) por ese enlace; se resuelve con el acuse de la otra app. */
  enviarTexto(enlace: string, texto: string): Promise<ResultadoEnvioBle>;
  canalArchivos(enlace: string): CanalArchivos;
  /** Lo que llegó por ese enlace (lo no ligado, salvo el saludo, se ignora). */
  recibir(cuerpo: string, enlace: string): Promise<void>;
  /** (WFD1108A) Manda una oferta o respuesta de enlace Wi-Fi a esa neurona, firmada, por Bluetooth. */
  enviarControlEnlace(neurona: string, cuerpo: CuerpoControl): Promise<ResultadoEnvioBle>;
  /** (WFD1108A) Ofertas y respuestas de enlace Wi-Fi que llegan (verificadas) de neuronas ligadas. */
  alControlEnlace(cb: (c: ControlEnlaceWifi, origen: OrigenControl) => void): () => void;
  colaBytes(enlace: string): number;
  instantanea(): InstantaneaBle;
  suscribir(cb: () => void): () => void;
}

/* ══════════════════════════ Motor ══════════════════════════ */

/** Tope de lo encolado en `datos` por enlace: el motor de archivos ve la cola ×4 y frena antes. */
export const MAX_COLA_DATOS_BLE = 1024 * 1024;
export const FACTOR_FRENO_ARCHIVOS_BLE = 4;
/** (CIF1108A) Espera al acuerdo de sesión antes de devolver el envío como «aún no listo» (el aire BLE es más lento). */
export const ESPERA_SESION_BLE_MS = 4_000;

interface Item {
  texto: string;
  fin(r: ResultadoEnvioBle): void;
}

interface Cola {
  control: Item[];
  datos: Item[];
  bytesDatos: number;
  bombeando: boolean;
  cubeta: Cubeta | null;
  claveLimites: string;
  fallos: number;
}

const nada = () => undefined;

export function crearRedBle(deps: DepsBle): RedBle {
  let estado: EstadoBleNativo | null = null;
  let ligaduras: LigaduraBle[] = [];
  let ultimoRechazo: string | null = null;
  let conClave = false;
  const ultimoHola: Record<string, number> = {};
  const caidas: Record<string, number> = {};
  const colas = new Map<string, Cola>();
  const canales = new Map<string, CanalArchivos>();
  const oyentes = new Set<() => void>();
  const oyentesControl = new Set<(c: ControlEnlaceWifi, o: OrigenControl) => void>();

  const avisar = () => {
    for (const f of Array.from(oyentes)) {
      try {
        f();
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const abierto = (enlace: string) => !!estado?.enlaces.some((e) => e.id === enlace);
  const caido = (enlace: string) => (caidas[enlace] ?? 0) > deps.ahora();

  const cola = (enlace: string): Cola => {
    let c = colas.get(enlace);
    if (!c) {
      c = { control: [], datos: [], bytesDatos: 0, bombeando: false, cubeta: null, claveLimites: "", fallos: 0 };
      colas.set(enlace, c);
    }
    return c;
  };

  function fallarTodo(c: Cola, motivo: string): void {
    for (const i of [...c.control.splice(0), ...c.datos.splice(0)]) i.fin({ ok: false, motivo });
    c.bytesDatos = 0;
  }

  /* ─────────────── Cifrado de punta a punta (CIF1108A) ─────────────── */

  const esperasSesion = new Map<string, Array<() => void>>();
  const propio = (): boolean => !!deps.sesiones;
  const exigir = (): boolean => {
    try {
      return !!deps.exigirCifrado?.();
    } catch {
      return false;
    }
  };
  const modoDe = (lig: LigaduraBle): ModoEnlace => decidirModo({ propio: propio(), cifPar: lig.cif, exigir: exigir() });
  const limitesEfectivos = (lig: LigaduraBle | null): LimitesCanal => {
    const lim = lig?.limites ?? LIMITES_BLE_DEFECTO;
    return lig && modoDe(lig) === "cifrado" ? limitesParaCifrado(lim) : lim;
  };
  const etiquetaDe = (lig: LigaduraBle): EtiquetaCifrado => etiquetaCifrado(modoDe(lig), deps.sesiones?.estado(lig.neurona) ?? "sin");

  function despertarSesion(neurona: string): void {
    const l = esperasSesion.get(neurona);
    if (!l) return;
    esperasSesion.delete(neurona);
    for (const f of l) f();
  }

  /** Manda el `nl.cs/ini` firmado, en claro y SIN pasar por la cola (la cola es quien espera la sesión). */
  async function abrirAcuerdo(lig: LigaduraBle): Promise<void> {
    if (!deps.sesiones) return;
    try {
      const yo = await deps.yo();
      if (!yo) return;
      const sobre = await deps.sesiones.iniciar(yo.neurona, lig.neurona);
      if (sobre) await deps.enviar(lig.enlace, JSON.stringify({ t: "nl.cs", s: sobre }));
    } catch {
      /* el siguiente envío lo reintenta */
    }
  }

  function esperarSesion(neurona: string, ms: number): Promise<boolean> {
    if (deps.sesiones?.estado(neurona) === "activa") return Promise.resolve(true);
    return new Promise((fin) => {
      let hecho = false;
      const cb = () => {
        if (hecho) return;
        hecho = true;
        fin(true);
      };
      esperasSesion.set(neurona, [...(esperasSesion.get(neurona) ?? []), cb]);
      void deps.dormir(ms).then(() => {
        const l = (esperasSesion.get(neurona) ?? []).filter((f) => f !== cb);
        if (l.length) esperasSesion.set(neurona, l);
        else esperasSesion.delete(neurona);
        if (hecho) return;
        hecho = true;
        fin(deps.sesiones?.estado(neurona) === "activa");
      });
    });
  }

  async function cifrarHacia(lig: LigaduraBle, texto: string): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
    const s = deps.sesiones;
    if (!s) return { ok: false, motivo: "esta app no cifra" };
    for (let intento = 0; intento < 2; intento++) {
      const r = await s.cifrar(lig.neurona, texto);
      if (r.ok) {
        if (r.renovar || s.tocaRenovar(lig.neurona)) void abrirAcuerdo(lig);
        return { ok: true, texto: r.texto };
      }
      if (intento === 0) {
        void abrirAcuerdo(lig);
        if (!(await esperarSesion(lig.neurona, ESPERA_SESION_BLE_MS))) break;
      }
    }
    return { ok: false, motivo: "el cifrado del enlace Bluetooth aún no está listo; se reintenta" };
  }

  /** Un fallo de autenticación, repetición o forma cierra el enlace: se olvida la ligadura y la sesión. */
  function cerrarEnlace(lig: LigaduraBle, motivo: string): void {
    ligaduras = ligaduras.filter((l) => l.neurona !== lig.neurona);
    deps.sesiones?.olvidar(lig.neurona);
    ultimoRechazo = `Enlace Bluetooth con ${lig.nombre} cerrado: ${motivo}`;
    avisar();
  }

  async function bombear(enlace: string): Promise<void> {
    const c = colas.get(enlace);
    if (!c || c.bombeando) return;
    c.bombeando = true;
    try {
      while (c.control.length || c.datos.length) {
        if (!abierto(enlace)) {
          fallarTodo(c, "El enlace Bluetooth se cerró (el otro aparato se alejó o apagó el Bluetooth).");
          break;
        }
        const fuente = c.control.length ? c.control : c.datos;
        const lig = ligaduraDeEnlace(ligaduras, enlace, deps.ahora());
        const lim: LimitesCanal = lig?.limites ?? LIMITES_BLE_DEFECTO;
        // (CIF1108A) Grupo homogéneo: o todo «siempre en claro» (saludo, acuerdo) o todo lo demás.
        const claroPrimero = esTextoSiempreEnClaro(fuente[0].texto);
        let largoGrupo = 1;
        while (largoGrupo < fuente.length && esTextoSiempreEnClaro(fuente[largoGrupo].texto) === claroPrimero) largoGrupo++;
        const modo: ModoEnlace = lig && !claroPrimero ? modoDe(lig) : "claro";
        if (modo === "bloqueado" && lig) {
          const motivo = `«Exigir cifrado en la red local» está activo y ${lig.nombre} no cifra (app anterior).`;
          for (const i of fuente.splice(0, largoGrupo)) {
            if (fuente === c.datos) c.bytesDatos -= i.texto.length;
            i.fin({ ok: false, motivo });
          }
          continue;
        }
        const cifrando = modo === "cifrado";
        const trama = armarTrama(
          fuente.slice(0, largoGrupo).map((i) => i.texto),
          maxTextoPorTrama(cifrando ? limitesParaCifrado(lim) : lim),
        );
        if (!trama.cuerpo) {
          for (const i of fuente.splice(0, Math.max(1, trama.usados))) {
            if (fuente === c.datos) c.bytesDatos -= i.texto.length;
            i.fin({ ok: false, motivo: (trama.motivo ?? "no se pudo armar la trama").replace("canal local", "Bluetooth") });
          }
          continue;
        }
        // Ritmo: nunca más del 90 % de lo que deja pasar el limitador del otro.
        const clave = `${lim.porVentana}/${lim.ventanaMs}`;
        if (!c.cubeta || c.claveLimites !== clave) {
          c.cubeta = nuevaCubeta(lim, deps.ahora());
          c.claveLimites = clave;
        }
        for (;;) {
          const f = tomarFicha(c.cubeta, deps.ahora());
          c.cubeta = f.cubeta;
          if (!f.esperaMs) break;
          await deps.dormir(f.esperaMs);
        }
        const n = trama.usados;
        let cuerpoAire = trama.cuerpo;
        if (cifrando && lig) {
          const cf = await cifrarHacia(lig, trama.cuerpo);
          if (!cf.ok) {
            // No es un fallo del aire: el cifrado aún no está listo. Se devuelve el error sin contar caída.
            const hechos = fuente.splice(0, n);
            if (fuente === c.datos) for (const i of hechos) c.bytesDatos -= i.texto.length;
            for (const i of hechos) i.fin({ ok: false, motivo: cf.motivo });
            continue;
          }
          cuerpoAire = cf.texto;
        }
        let r: Awaited<ReturnType<DepsBle["enviar"]>>;
        try {
          r = await deps.enviar(enlace, cuerpoAire);
        } catch {
          r = { ok: false, motivo: "la app nativa no respondió" };
        }
        if (r.ok) {
          const hechos = fuente.splice(0, n);
          if (fuente === c.datos) for (const i of hechos) c.bytesDatos -= i.texto.length;
          c.fallos = 0;
          for (const i of hechos) i.fin({ ok: true, ms: r.ms });
          continue;
        }
        c.fallos += 1;
        if (c.fallos >= FALLOS_PARA_CAIDA || !abierto(enlace)) {
          caidas[enlace] = deps.ahora() + CAIDA_MS;
          c.fallos = 0;
          fallarTodo(c, `La otra app no acusa recibo por Bluetooth (${r.motivo}); se reintenta en ${Math.round(CAIDA_MS / 1000)} s.`);
          avisar();
          break;
        }
        await deps.dormir(esperaTrasFallo(c.fallos));
      }
    } finally {
      c.bombeando = false;
    }
  }

  function encolar(enlace: string, texto: string): Promise<ResultadoEnvioBle> {
    if (!abierto(enlace)) return Promise.resolve({ ok: false, motivo: "Ese enlace Bluetooth ya no está abierto." });
    if (caido(enlace)) return Promise.resolve({ ok: false, motivo: "Ese aparato no acusa recibo por Bluetooth ahora; se reintenta en unos segundos." });
    const c = cola(enlace);
    return new Promise((fin) => {
      const item: Item = { texto, fin };
      if (claseDeTexto(texto) === "datos") {
        c.datos.push(item);
        c.bytesDatos += texto.length;
      } else {
        c.control.push(item);
      }
      void Promise.resolve().then(() => bombear(enlace));
    });
  }

  function canalArchivos(enlace: string): CanalArchivos {
    let canal = canales.get(enlace);
    if (!canal) {
      canal = {
        enviar: (t) => {
          const c = cola(enlace);
          if (caido(enlace) || !abierto(enlace) || c.bytesDatos + t.length > MAX_COLA_DATOS_BLE) return false;
          void encolar(enlace, t);
          return true;
        },
        bufferedAmount: () => (colas.get(enlace)?.bytesDatos ?? 0) * FACTOR_FRENO_ARCHIVOS_BLE,
        // Un trozo que cabe solo, en base64, en una trama Bluetooth (10 KiB con el tope de 16 KiB).
        tamanoTrozo: () => trozoArchivoBle(limitesEfectivos(ligaduraDeEnlace(ligaduras, enlace, deps.ahora()))),
        alMensaje: () => nada,
      };
      canales.set(enlace, canal);
    }
    return canal;
  }

  async function firmarYEnviar(enlace: string, t: string, cuerpo: unknown): Promise<ResultadoEnvioBle> {
    const s = await deps.firmar(cuerpo);
    if (!s) return { ok: false, motivo: "no se pudo firmar con la identidad de malla" };
    return encolar(enlace, JSON.stringify({ t, s }));
  }

  async function hayClave(): Promise<boolean> {
    if (!deps.pruebaCuenta) return false;
    try {
      return esPruebaCuenta(await deps.pruebaCuenta("ss-nl-cuenta-v1|comprobar"));
    } catch {
      return false;
    }
  }

  async function pruebaPara(de: string, para: string, ts: number): Promise<string | null> {
    if (!deps.pruebaCuenta || !deps.huellaPropia) return null;
    try {
      const huella = await deps.huellaPropia();
      if (!huella) return null;
      const p = await deps.pruebaCuenta(textoPruebaCuenta({ huella, de, para, ts }));
      return esPruebaCuenta(p) ? p : null;
    } catch {
      return null;
    }
  }

  async function saludar(enlace: string, para: string, resp: boolean): Promise<void> {
    const yo = await deps.yo();
    if (!yo) return;
    const ts = deps.ahora();
    ultimoHola[enlace] = ts;
    const cta = await pruebaPara(yo.neurona, para, ts);
    // `webrtc: false`: por Bluetooth no se señaliza WebRTC (sin red IP no conectaría).
    let certificado: CertificadoNeurona | null = null;
    try {
      certificado = (await deps.certificadoPropio?.()) ?? null;
    } catch {
      certificado = null;
    }
    await firmarYEnviar(
      enlace,
      "nl.hola",
      holaNativa({ de: yo, para, limites: limitesPropiosBle(estado), webrtc: false, resp, ts, cta, ...(propio() ? { cif: VERSION_CIFRADO } : {}), certificado }),
    );
  }

  async function verificarSobre(cuerpo: string): Promise<{ cuerpo: unknown; huella?: string } | null> {
    let o: unknown;
    try {
      o = JSON.parse(cuerpo);
    } catch {
      return null;
    }
    const sobre = (o as { s?: unknown } | null)?.s;
    if (!sobre) return null;
    try {
      const v = await deps.verificar(sobre);
      return v.valido ? { cuerpo: v.cuerpo, huella: v.huella } : null;
    } catch {
      return null;
    }
  }

  async function recibirHola(cuerpo: string, enlace: string): Promise<void> {
    const v = await verificarSobre(cuerpo);
    if (!v) return;
    const h = leerHola(v.cuerpo);
    const yo = await deps.yo();
    if (!h || !yo) return;
    let cuentaProbada = false;
    if (h.cta && v.huella && deps.pruebaCuenta) {
      try {
        cuentaProbada = mismaPrueba(h.cta, await deps.pruebaCuenta(textoPruebaCuenta({ huella: v.huella, de: h.de.neurona, para: h.para, ts: h.ts })));
      } catch {
        cuentaProbada = false;
      }
    }
    // (IDN1108A) Un certificado válido de MI cuenta vale como prueba de cuenta, aunque nunca nos hayamos vinculado.
    if (!cuentaProbada && h.certificado && v.huella && deps.certificadoMismaCuenta) {
      try {
        cuentaProbada = await deps.certificadoMismaCuenta(h.certificado, { neurona: h.de.neurona, huella: v.huella });
      } catch {
        cuentaProbada = false;
      }
    }
    const ac = aceptarHola(h, v.huella, yo.neurona, deps.vinculos(), { cuentaProbada });
    if (!ac.ok) {
      // A ciegas se saluda a varias neuronas: «es para otra» no es un rechazo que contar.
      if (h.para === yo.neurona) {
        ultimoRechazo = ac.motivo;
        avisar();
      }
      return;
    }
    // (CIF1108A) Gancho de identidad: con certificado y verificador tiene que cuadrar; sin verificador se ignora.
    if (h.certificado) {
      try {
        if (!(await (deps.verificarCertificado ?? verificadorCertificadoPorDefecto)(h.certificado, { neurona: h.de.neurona, huella: v.huella ?? "" }))) {
          ultimoRechazo = "el certificado de cuenta de esa neurona no es válido";
          avisar();
          return;
        }
      } catch {
        ultimoRechazo = "no se pudo comprobar el certificado de cuenta";
        avisar();
        return;
      }
    }
    if (ligaduras.some((l) => l.neurona === h.de.neurona && l.huella !== v.huella)) deps.sesiones?.olvidar(h.de.neurona);
    ligaduras = ligarBle(ligaduras, {
      enlace,
      neurona: h.de.neurona,
      huella: v.huella as string,
      nombre: ac.vinculo.nombre || h.de.nombre,
      ...((ac.vinculo.sync ?? h.de.sync) ? { sync: ac.vinculo.sync ?? h.de.sync } : {}),
      ...((ac.vinculo.cuenta ?? h.de.cuenta) ? { cuenta: ac.vinculo.cuenta ?? h.de.cuenta } : {}),
      limites: h.lim ? leerLimites(h.lim) : { ...LIMITES_BLE_DEFECTO },
      at: deps.ahora(),
      ...(ac.porCuenta ? { porCuenta: true } : {}),
      ...(h.cif ? { cif: h.cif } : {}),
    });
    delete caidas[enlace];
    ultimoRechazo = null;
    avisar();
    if (!h.resp && deps.ahora() - (ultimoHola[enlace] ?? -Infinity) >= 1000) await saludar(enlace, h.de.neurona, true);
  }

  async function recibirControl(cuerpo: string, enlace: string): Promise<void> {
    const v = await verificarSobre(cuerpo);
    const lig = ligaduraDeEnlace(ligaduras, enlace, deps.ahora());
    if (!v || !lig || v.huella !== lig.huella) return; // solo de la neurona ligada, con su misma firma
    const c = leerControlEnlace(v.cuerpo, deps.ahora());
    const yo = await deps.yo();
    if (!c || !yo || c.para !== yo.neurona || c.de !== lig.neurona) return;
    const origen: OrigenControl = { neurona: lig.neurona, enlaceId: idEnlaceBle(enlace), huella: lig.huella };
    for (const f of Array.from(oyentesControl)) {
      try {
        f(c, origen);
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  }

  /** (CIF1108A) `nl.cs`: acuerdo de sesión firmado por la neurona LIGADA a ese enlace (misma huella que su saludo). */
  async function recibirAcuerdo(cuerpo: string, enlace: string): Promise<void> {
    if (!deps.sesiones) return;
    const lig = ligaduraDeEnlace(ligaduras, enlace, deps.ahora());
    if (!lig || modoDe(lig) !== "cifrado") return;
    const v = await verificarSobre(cuerpo);
    if (!v || v.huella !== lig.huella) return;
    const yo = await deps.yo();
    if (!yo) return;
    const r = await deps.sesiones.recibirAcuerdo(yo.neurona, lig.neurona, v.cuerpo);
    if (!r.ok) {
      ultimoRechazo = `Acuerdo de cifrado con ${lig.nombre} rechazado: ${r.motivo}`;
      avisar();
      return;
    }
    if (r.respuesta) await deps.enviar(lig.enlace, JSON.stringify({ t: "nl.cs", s: r.respuesta }));
    if (r.activa) despertarSesion(lig.neurona);
    avisar();
  }

  /** `descifrado`: el texto salió de una trama `nl.cif` autenticada (único modo de llevar datos hacia quien cifra). */
  async function recibir(cuerpo: string, enlace: string, descifrado = false): Promise<void> {
    if (typeof cuerpo !== "string" || typeof enlace !== "string") return;
    if (cuerpo.startsWith('{"t":"nl.lote"')) {
      for (const t of desempaquetarLote(cuerpo) ?? []) await recibir(t, enlace, descifrado);
      return;
    }
    if (cuerpo.startsWith('{"t":"nl.hola"')) return descifrado ? undefined : recibirHola(cuerpo, enlace);
    if (esAcuerdo(cuerpo)) return descifrado ? undefined : recibirAcuerdo(cuerpo, enlace);
    const lig = ligaduraDeEnlace(ligaduras, enlace, deps.ahora());
    if (esTramaCifrada(cuerpo)) {
      if (descifrado || !lig || !deps.sesiones) return;
      const r = await deps.sesiones.descifrar(lig.neurona, cuerpo);
      if (r.ok) return recibir(r.texto, enlace, true);
      if (r.motivo === "desconocida") {
        ultimoRechazo = `Trama cifrada de ${lig.nombre} con una sesión desconocida; se acuerda otra.`;
        avisar();
        void abrirAcuerdo(lig);
        return;
      }
      cerrarEnlace(lig, r.detalle);
      return;
    }
    if (!lig) return; // sin saludo firmado, ni mensajes ni archivos
    // Hacia quien cifra (o con «exigir cifrado»), lo que llega en claro se descarta.
    if (!descifrado && modoDe(lig) !== "claro") {
      ultimoRechazo = `Trama sin cifrar de ${lig.nombre}, que cifra o debe cifrar: descartada.`;
      avisar();
      return;
    }
    if (cuerpo.startsWith(`{"t":"${T_OFERTA_WIFI}"`) || cuerpo.startsWith(`{"t":"${T_RESPUESTA_WIFI}"`)) return recibirControl(cuerpo, enlace);
    try {
      if (cuerpo.startsWith('{"t":"tu.')) {
        deps.entregarTransporte(cuerpo, { enlaceId: idEnlaceBle(enlace), etiqueta: `${lig.nombre} · Bluetooth`, ...(lig.sync ? { syncDeviceId: lig.sync } : {}) });
      } else if (cuerpo.startsWith('{"t":"archivo.')) {
        deps.entregarArchivo(canalArchivos(enlace), cuerpo, `${lig.nombre} (Bluetooth directo · app nativa)`, { huella: lig.huella, ...(lig.porCuenta ? { porCuenta: true } : {}) });
      }
    } catch {
      /* un oyente roto no tumba el enlace */
    }
  }

  function fijarEstado(e: EstadoBleNativo | null): void {
    estado = e;
    const abiertos = new Set((e?.enlaces ?? []).map((x) => x.id));
    ligaduras = podarLigadurasBle(ligaduras, abiertos, deps.ahora());
    for (const [enlace, c] of Array.from(colas)) {
      if (!abiertos.has(enlace)) {
        fallarTodo(c, "El enlace Bluetooth se cerró (el otro aparato se alejó o apagó el Bluetooth).");
        colas.delete(enlace);
        canales.delete(enlace);
      }
    }
  }

  async function saludarPendientes(): Promise<void> {
    if (!estado || estado.radio !== "encendida") return;
    const yo = await deps.yo();
    if (!yo) return;
    conClave = await hayClave();
    const destinos = saludosBle({
      enlaces: estado.enlaces,
      ligaduras,
      vinculos: deps.vinculos(),
      cuenta: deps.neuronasCuenta?.() ?? [],
      conClave,
      yo: yo.neurona,
      ultimoHola,
      ahora: deps.ahora(),
    });
    await Promise.all(destinos.map((d) => saludar(d.enlace, d.para, false)));
  }

  async function refrescar(): Promise<void> {
    let e: EstadoBleNativo | null = null;
    try {
      e = await deps.estado();
    } catch {
      e = null;
    }
    fijarEstado(e);
    await saludarPendientes();
    avisar();
  }

  async function enviarControlEnlace(neurona: string, cuerpo: CuerpoControl): Promise<ResultadoEnvioBle> {
    const lig = ligaduraDeNeuronaBle(ligaduras, neurona, deps.ahora());
    if (!lig) return { ok: false, motivo: "No hay enlace Bluetooth ligado con esa neurona." };
    const yo = await deps.yo();
    if (!yo) return { ok: false, motivo: "sin identidad de esta neurona" };
    const completo = { ...cuerpo, v: 1, de: yo.neurona, para: neurona, ts: deps.ahora() };
    if (!leerControlEnlace(completo, deps.ahora())) return { ok: false, motivo: "control de enlace Wi-Fi mal formado" };
    return firmarYEnviar(lig.enlace, cuerpo.t, completo);
  }

  return {
    refrescar,
    aplicarEstado: (x) => {
      const e = leerEstadoBle(x);
      if (!e) return;
      fijarEstado(e);
      avisar();
      void saludarPendientes().catch(nada);
    },
    enlaces: () => enlacesBle({ estado, ligaduras, ahora: deps.ahora(), caidas, ...(propio() ? { cifrado: Object.fromEntries(ligaduras.map((l) => [l.enlace, etiquetaDe(l)])) } : {}) }),
    cifradoDe: (neurona) => {
      const l = ligaduraDeNeuronaBle(ligaduras, neurona, deps.ahora());
      return l ? etiquetaDe(l) : null;
    },
    enlaceHacia: (neurona) => ligaduraDeNeuronaBle(ligaduras, neurona, deps.ahora())?.enlace ?? null,
    enviarTexto: (enlace, texto) => encolar(enlace, texto),
    canalArchivos,
    recibir,
    enviarControlEnlace,
    alControlEnlace: (cb) => {
      oyentesControl.add(cb);
      return () => {
        oyentesControl.delete(cb);
      };
    },
    colaBytes: (enlace) => colas.get(enlace)?.bytesDatos ?? 0,
    instantanea: () => ({ estado, ligaduras: [...ligaduras], caidas: { ...caidas }, ultimoRechazo, cifrado: Object.fromEntries(ligaduras.map((l) => [l.neurona, etiquetaDe(l)])) }),
    suscribir: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
  };
}

/* ══════════════════════════ Secreto del enlace Wi-Fi (para WFD1108A) ══════════════════════════ */

function aB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function deB64(s: string): Uint8Array<ArrayBuffer> {
  const t = atob(s);
  const b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
}

async function claveSecreto(claveFaroHex: string, sesion: string): Promise<CryptoKey | null> {
  if (!/^[0-9a-fA-F]{64}$/.test(claveFaroHex)) return null;
  const sutil = globalThis.crypto?.subtle;
  if (!sutil) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(claveFaroHex.slice(i * 2, i * 2 + 2), 16);
  const hmac = await sutil.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derivada = new Uint8Array(await sutil.sign("HMAC", hmac, new TextEncoder().encode(textoClaveSecreto(sesion))));
  return sutil.importKey("raw", derivada, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Cifra el secreto de una oferta Wi-Fi (la contraseña del punto de acceso) con AES-GCM 256: clave =
 * HMAC-SHA256(clave de faro de la cuenta, «ss-enlace-wifi-v1|<sesión>»), datos asociados = «de|para|sesión».
 * El aire del Bluetooth sin emparejar no va cifrado: el secreto nunca viaja en claro. Null sin clave o sin
 * WebCrypto. La clave nunca sale de aquí.
 */
export async function cifrarSecretoEnlace(
  claveFaroHex: string | null | undefined,
  p: { de: string; para: string; s: string },
  secreto: string,
): Promise<SecretoCifrado | null> {
  try {
    const k = typeof claveFaroHex === "string" ? await claveSecreto(claveFaroHex, p.s) : null;
    if (!k) return null;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(datosAsociadosSecreto(p)) },
      k,
      new TextEncoder().encode(secreto),
    );
    return { iv: aB64(iv), ct: aB64(new Uint8Array(ct)) };
  } catch {
    return null;
  }
}

/** Descifra el secreto de una oferta Wi-Fi (null si la clave, la sesión o las neuronas no casan). */
export async function descifrarSecretoEnlace(
  claveFaroHex: string | null | undefined,
  p: { de: string; para: string; s: string },
  cifrado: SecretoCifrado,
): Promise<string | null> {
  try {
    const k = typeof claveFaroHex === "string" ? await claveSecreto(claveFaroHex, p.s) : null;
    if (!k) return null;
    const claro = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deB64(cifrado.iv), additionalData: new TextEncoder().encode(datosAsociadosSecreto(p)) },
      k,
      deB64(cifrado.ct),
    );
    return new TextDecoder().decode(claro);
  } catch {
    return null;
  }
}

/* ══════════════════════════ Instancia real (solo en la app nativa) ══════════════════════════ */

let red: RedBle | null = null;

/** El enlace Bluetooth de esta página, si arrancó (solo en la app nativa). */
export function bluetoothDirectoActivo(): RedBle | null {
  return red;
}

async function depsReales(): Promise<DepsBle> {
  const [{ puenteNativo }, sync, { identidadDispositivo }, rn] = await Promise.all([
    import("@/lib/nativa/puente"),
    import("./sincronizacion-neuronas-motor"),
    import("@/lib/network/identidad-dispositivo"),
    import("./red-local-nativa-motor"),
  ]);
  const motor = sync.motorSync();
  motor.cargar();
  const firmar = async (cuerpo: unknown): Promise<unknown | null> => {
    const { wrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
    const s = await wrapSigned(cuerpo);
    return (s as { v?: unknown }).v === 2 ? s : null;
  };
  // La clave de faro y las neuronas de la cuenta las guarda la app (antenas.json): se releen cada minuto.
  let config: { clave: string | null; conocidas: string[]; leida: number } = { clave: null, conocidas: [], leida: -Infinity };
  const leerConfig = async () => {
    if (Date.now() - config.leida < 60_000) return config;
    const r = await puenteNativo().antenasConfig();
    config = {
      clave: r.ok && typeof r.valor?.clave_faro === "string" ? r.valor.clave_faro : null,
      conocidas: r.ok && Array.isArray(r.valor?.conocidas) ? r.valor.conocidas.filter((x): x is string => typeof x === "string") : [],
      leida: Date.now(),
    };
    return config;
  };
  void leerConfig().catch(nada);
  return {
    ahora: () => Date.now(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    estado: async () => {
      const r = await puenteNativo().llamar<unknown>(COMANDO_ESTADO_BLE);
      return r.ok ? leerEstadoBle(r.valor) : null;
    },
    enviar: async (enlace, json) => {
      const r = await puenteNativo().llamar<{ ms: number }>(COMANDO_ENVIAR_BLE, { enlace, json });
      return r.ok ? { ok: true, ms: Number(r.valor?.ms) || 0 } : { ok: false, motivo: r.motivo };
    },
    yo: async () => {
      try {
        const id = identidadDispositivo();
        const cuenta = await sync.cuentaDeEstaNeurona();
        return {
          neurona: id.neuronDeviceId,
          ...(id.syncDeviceId ? { sync: id.syncDeviceId } : {}),
          ...(cuenta ? { cuenta } : {}),
          nombre: sync.nombreDeEstaNeurona(id.neuronDeviceId),
        };
      } catch {
        return null;
      }
    },
    vinculos: () => motor.instantanea().vinculos,
    neuronasCuenta: () => config.conocidas,
    firmar,
    sesiones: crearSesionesCifradas({ ahora: () => Date.now(), firmar }),
    exigirCifrado: rn.exigirCifradoRedLocal,
    verificar: async (sobre) => {
      const [{ unwrapSigned }, { acceptFreshness }] = await Promise.all([import("@/ai/astraura/mesh/mesh-identity"), import("@/ai/astraura/mesh/replay-guard")]);
      const r = await unwrapSigned(sobre);
      const b = r.body as { t?: unknown; ts?: unknown; s?: unknown } | null;
      const clave = b && typeof b.t === "string" ? `ble:${b.t}:${String(b.s ?? b.ts ?? "")}` : undefined;
      const fresco = r.verified && typeof r.ts === "number" && !!r.nonce && acceptFreshness(r.fp, r.ts, r.nonce, clave);
      return { cuerpo: r.body, huella: r.fp, valido: r.verified && fresco };
    },
    entregarTransporte: (texto, origen) => {
      void import("./transporte-universal")
        .then((tu) => tu.despacharTextoTransporte(texto, { tipo: "ble", ...origen }, nada))
        .catch(nada);
    },
    entregarArchivo: (canal, texto, etiquetaOrigen, quien) => {
      void import("@/lib/network/archivos-malla")
        .then((am) =>
          am.motorArchivosCompartido().manejarMensaje(canal, texto, {
            mismaCuenta: false,
            etiquetaOrigen,
            verificarPermiso: () => true,
            via: "Bluetooth directo (app nativa, sin router)",
            ...(quien?.huella
              ? {
                  verificacion: {
                    tipo: "firma" as const,
                    huella: quien.huella,
                    texto: `Saludo firmado con su identidad de malla (huella ${quien.huella.slice(0, 12)}…)${quien.porCuenta ? " · prueba de tu misma cuenta" : " · neurona vinculada"}`,
                  },
                }
              : {}),
          }),
        )
        .catch(nada);
    },
    pruebaCuenta: async (texto) => {
      try {
        return await rn.hmacPruebaCuenta((await leerConfig()).clave, texto);
      } catch {
        return null;
      }
    },
    // (IDN1108A) Identidad de cuenta sin servidor: certificado propio en el saludo y verificadores.
    certificadoPropio: async () => (await import("@/lib/identidad/enlace")).certificadoPropioParaHola(),
    verificarCertificado: async (c, ctx) => (await import("@/lib/identidad/enlace")).verificadorCertificadoNativo(c, ctx),
    certificadoMismaCuenta: async (c, ctx) => (await import("@/lib/identidad/enlace")).certificadoDeMismaCuenta(c, ctx),
    huellaPropia: async () => {
      try {
        const { myFingerprint } = await import("@/ai/astraura/mesh/mesh-identity");
        return await myFingerprint();
      } catch {
        return null;
      }
    },
  };
}

/**
 * iniciarBluetoothDirecto — arranca el enlace `ble:<id>` (solo en la app nativa; en el navegador no hace
 * nada). Escucha `ble://mensaje` (y pide lo que llegó antes con `ble_recibidos`) y `ble://cambio`, y mira
 * el estado cada 15 s. Lo arranca `iniciarSincronizacionNeuronas`.
 */
export function iniciarBluetoothDirecto(): () => void {
  let vivo = true;
  const bajas: Array<() => void> = [];
  void Promise.all([depsReales(), import("@/lib/nativa/puente")])
    .then(([deps, { puenteNativo }]) => {
      if (!vivo) return;
      const r = crearRedBle(deps);
      red = r;
      const p = puenteNativo();
      const vistos = new Set<number>();
      const procesar = (x: unknown) => {
        const m = x as MensajeBleNativo | null;
        if (!m || typeof m.seq !== "number" || typeof m.cuerpo !== "string" || typeof m.enlace !== "string") return;
        if (vistos.has(m.seq)) return;
        vistos.add(m.seq);
        if (vistos.size > 2000) vistos.delete(Math.min(...vistos));
        void r.recibir(m.cuerpo, m.enlace);
      };
      void p.escuchar(EVENTO_MENSAJE_BLE, procesar).then((q) => (vivo ? bajas.push(q) : q()));
      void p.escuchar(EVENTO_CAMBIO_BLE, (x) => r.aplicarEstado(x)).then((q) => (vivo ? bajas.push(q) : q()));
      void r.refrescar().then(() =>
        p.llamar<MensajeBleNativo[]>(COMANDO_RECIBIDOS_BLE, { desde: 0 }).then((x) => {
          if (vivo && x.ok && Array.isArray(x.valor)) [...x.valor].sort((a, b) => a.seq - b.seq).forEach(procesar);
        }),
      );
      const t = setInterval(() => void r.refrescar(), 15_000);
      bajas.push(() => clearInterval(t));
    })
    .catch(nada);
  return () => {
    vivo = false;
    for (const b of bajas.splice(0)) {
      try {
        b();
      } catch {
        /* */
      }
    }
    red = null;
  };
}

/** Solo pruebas: fija (o quita) la instancia de la página. */
export function __fijarBluetoothParaPruebas(r: RedBle | null): void {
  red = r;
}
