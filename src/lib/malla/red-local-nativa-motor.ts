"use client";

/**
 * red-local-nativa-motor — el enlace `nativo:<ip>` y la señalización WebRTC por el canal local (2026-11-07 · MLT1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/datos-por-la-malla.md` §6. Lo puro (saludo, ligaduras, tramas, ritmo,
 * máquina de estados) está en `red-local-nativa.ts` y `senal-nativa.ts`; aquí se envía, se recibe y
 * se recuerda, con TODO lo del mundo inyectado (las pruebas montan dos apps en memoria).
 *
 *   · Cada 15 s mira el canal (`malla_local_estado`) y SALUDA (`nl.hola` firmado) a las neuronas
 *     vinculadas que su faro oye; quien recibe un saludo válido contesta y las dos quedan LIGADAS.
 *   · Una cola por IP con dos clases: `control` (mensajes del transporte universal, saludos, señales)
 *     pasa delante de `datos` (archivos, en orden estricto). Cada trama espera el acuse de la otra app;
 *     6 fallos seguidos → ese aparato se da por caído 30 s (y se dice).
 *   · Lo que llega de una IP ligada va a sus oyentes de siempre: `tu.*` al transporte universal,
 *     `archivo.*` al motor de archivos (que SIEMPRE pregunta). De una IP sin ligadura, nada.
 *   · Cada 5 s, por cada ligadura con WebRTC en los dos lados y sin enlace local abierto, la máquina de
 *     `senal-nativa.ts` decide: la neurona de id menor ofrece (`nl.sen` firmado), la otra responde, y
 *     el enlace WebRTC de siempre (`emparejar-sin-internet.ts`) queda en el registro: por él van
 *     llamadas, pantalla y flujos. A cada SDP recibido se le añaden candidatos con la IP real.
 *   · (MLL1107A) Con la clave de faro de la cuenta, el saludo lleva la prueba de cuenta y se saluda
 *     también a las neuronas de la cuenta que el faro reconoce: tus aparatos se ligan sin «Sincronizar
 *     ahora». Antes de mandar a una neurona que el faro oye, `asegurarLigadura` saluda YA y espera un
 *     momento (una vez por saludo) en vez de irse al servidor por llegar antes del siguiente ciclo.
 */

import {
  CAIDA_MS,
  FALLOS_PARA_CAIDA,
  LIMITES_CANAL_ANTERIOR,
  PREFIJO_SESION_NATIVA,
  PUERTO_CANAL_NATIVO,
  ESPERA_LIGADURA_MS,
  ENTRE_HOLAS_MS,
  aceptarHola,
  armarTrama,
  candidatosConIp,
  claseDeTexto,
  desempaquetarLote,
  destinosHola,
  diagnosticoHacia,
  enlacesNativos,
  esperaTrasFallo,
  holaNativa,
  esPruebaCuenta,
  idEnlaceNativo,
  ipLocal,
  ipsDeNeurona,
  leerHola,
  leerLimites,
  ligaduraDeIp,
  ligaduraDeNeurona,
  ligar,
  maxTextoPorTrama,
  mismaPrueba,
  nuevaCubeta,
  podarLigaduras,
  textoPruebaCuenta,
  tomarFicha,
  trozoArchivoParaTrama,
  type Cubeta,
  type EstadoHaciaNeurona,
  type LimitesCanal,
  type Ligadura,
  type QuienNativo,
  type VecinoMinimo,
  type VinculoMinimo,
} from "./red-local-nativa";
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
import { SENAL_INICIAL, leerSenal, pasoSenal, quienOfrece, type AccionSenal, type EstadoSenal, type EventoSenal, type SenalNativa } from "./senal-nativa";
import type { EnlaceDisponible } from "./eleccion-enlace";
import type { CanalArchivos } from "@/lib/network/archivos-malla";

/* ══════════════════════════ Dependencias (inyectables) ══════════════════════════ */

export interface EstadoCanalNativo {
  escuchando: boolean;
  vecinos: VecinoMinimo[];
  /** Lo que admite el oyente de ESTA app (null: app anterior, no lo dice → se anuncia nada). */
  limites: LimitesCanal | null;
}

/** Una conexión WebRTC en curso (la de `ofrecerPorCanal` / `responderPorCanal`). */
export interface ConexionSenal {
  sdp: string;
  /** Solo quien ofrece: aplica la respuesta. */
  completar?(sdp: string): Promise<{ ok: boolean; motivo?: string }>;
  cancelar(): void;
  alCambiar(cb: (e: "abierta" | "cerrada" | "fallida", motivo?: string) => void): () => void;
}

export type ResultadoConexion = ({ ok: true } & ConexionSenal) | { ok: false; motivo: string };

export interface DepsRedNativa {
  ahora(): number;
  dormir(ms: number): Promise<void>;
  /** «nativo-xxxxxxxxxxxx». */
  nuevaSesion(): string;
  estado(): Promise<EstadoCanalNativo | null>;
  enviar(ip: string, puerto: number, json: string): Promise<{ ok: true; ms: number } | { ok: false; motivo: string }>;
  yo(): Promise<QuienNativo | null>;
  vinculos(): VinculoMinimo[];
  firmar(cuerpo: unknown): Promise<unknown | null>;
  verificar(sobre: unknown): Promise<{ cuerpo: unknown; huella?: string; valido: boolean }>;
  webrtc(): boolean;
  /** ¿Hay ya un enlace local WebRTC abierto con esa neurona (por QR o por este canal)? */
  enlaceLocalCon(neurona: string): boolean;
  ofrecer(o: { sesion: string; nombre: string; nombreRemoto?: string }): Promise<ResultadoConexion>;
  responder(o: { sesion: string; sdp: string; nombre: string; nombreRemoto?: string }): Promise<ResultadoConexion>;
  /** Un `tu.*` de una IP ligada → transporte universal (sin acuse propio: ya acusó la app). */
  entregarTransporte(texto: string, origen: { enlaceId: string; etiqueta: string; syncDeviceId?: string }): void;
  /**
   * Un `archivo.*` de una IP ligada → motor de archivos (que siempre pregunta). (ARC1108A) `quien`: la
   * huella con la que esa neurona firmó su saludo, para que la ventana del envío diga quién lo manda.
   */
  entregarArchivo(canal: CanalArchivos, texto: string, etiquetaOrigen: string, quien?: { huella: string; porCuenta?: boolean }): void;
  /**
   * (MLL1107A) Prueba de cuenta de un texto: HMAC-SHA256 con la clave de faro de la cuenta, 32 hex.
   * Null si esta app no tiene la clave. Nunca devuelve ni registra la clave.
   */
  pruebaCuenta?(texto: string): Promise<string | null>;
  /** (MLL1107A) Huella de la identidad de malla con la que firma esta app (la del sobre). */
  huellaPropia?(): Promise<string | null>;
  /**
   * (CIF1108A) Sesiones cifradas de punta a punta (`sesion-cifrada.ts`). Ausente: esta app no cifra (como
   * antes) y no anuncia `cif` en el saludo.
   */
  sesiones?: SesionesCifradas;
  /** (CIF1108A) Ajuste «Exigir cifrado en la red local»: con él, una neurona que no cifra queda bloqueada. */
  exigirCifrado?(): boolean;
  /** (CIF1108A) Gancho: certificado cuenta→neurona propio para el saludo (IDN1108A). Null/ausente: ninguno. */
  certificadoPropio?(): Promise<CertificadoNeurona | null>;
  /** (CIF1108A) Gancho: comprueba el certificado de un saludo. Por defecto no exige nada (comportamiento de antes). */
  verificarCertificado?: VerificadorCertificado;
  /** (IDN1108A) Gancho: ¿el certificado prueba que esa neurona es de MI cuenta? Si sí, se acepta sin vínculo previo (sin internet). */
  certificadoMismaCuenta?: VerificadorCertificado;
}

export interface ResultadoEnvioNativo {
  ok: boolean;
  /** Ida y vuelta medida (conectar + trama + acuse de la otra app). */
  ms?: number;
  motivo?: string;
}

export interface InstantaneaRedNativa {
  escuchando: boolean;
  ligaduras: Ligadura[];
  senales: Record<string, EstadoSenal>;
  caidas: Record<string, number>;
  /** Por qué se rechazó el último saludo (para el panel; null si ninguno). */
  ultimoRechazo: string | null;
  /** (CIF1108A) Estado del cifrado por neurona ligada (cabecera del chat y acuses). */
  cifrado: Record<string, EtiquetaCifrado>;
}

/** (MLL1107A) Lo que `asegurarLigadura` sabe tras intentarlo. */
export type ResultadoAsegurar = EstadoHaciaNeurona & { esperadoMs: number };

export interface RedNativa {
  /** Mira el canal, saluda a las vinculadas y da un paso a la señalización. */
  refrescar(): Promise<void>;
  /**
   * (MLL1107A) Antes de mandar a esa neurona: si el faro la oye y no hay ligadura, la saluda YA y espera
   * hasta `esperaMs` a que conteste. Si ya se la saludó hace poco y no contestó, no espera. Nunca lanza.
   */
  asegurarLigadura(neurona: string, esperaMs?: number): Promise<ResultadoAsegurar>;
  ticSenales(): Promise<void>;
  /**
   * (LLA1108A) Una llamada necesita el enlace WebRTC con esa neurona YA: se olvida la espera del último
   * fallo y se da un paso a la señalización ahora (si me toca ofrecer, ofrezco; si no, el otro lo urge
   * igual al recibir el timbre). Nunca lanza.
   */
  urgirEnlace?(neurona: string): void;
  enlaces(): EnlaceDisponible[];
  /** Manda un texto (objeto JSON) a esa IP por su cola; se resuelve con el acuse de la otra app. */
  enviarTexto(ip: string, texto: string, puerto?: number): Promise<ResultadoEnvioNativo>;
  /** Canal del motor de archivos hacia esa IP (cola `datos`, con su ocupación como freno). */
  canalArchivos(ip: string): CanalArchivos;
  /** Entrada de lo que llegó por el canal local desde `ip` (lo no ligado se ignora). */
  recibir(cuerpo: string, ip: string): Promise<void>;
  colaBytes(ip: string): number;
  /**
   * (WFD1108A) «Esa neurona está en esa IP»: la dio el enlace Wi-Fi directo (negociado y firmado). Se la
   * saluda aunque su faro aún no se oiga. Una pista equivocada no hace nada: el saludo va firmado.
   */
  pista?(neurona: string, ip: string | null, puerto?: number): void;
  /** (CIF1108A) «cifrado» / «sin-cifrar» / «pendiente» (null: no hay ligadura con esa neurona). */
  cifradoDe?(neurona: string): EtiquetaCifrado | null;
  instantanea(): InstantaneaRedNativa;
  suscribir(cb: () => void): () => void;
}

/* ══════════════════════════ Motor ══════════════════════════ */

/** Tope de lo encolado en `datos` por IP: el motor de archivos ve la cola ×4 y frena a ~256 KiB. */
export const MAX_COLA_DATOS = 4 * 1024 * 1024;
export const FACTOR_FRENO_ARCHIVOS = 4;
/** (CIF1108A) Cuánto se espera a que el acuerdo de sesión se cierre antes de devolver el envío como «aún no listo». */
export const ESPERA_SESION_MS = 2_500;

interface Item {
  texto: string;
  fin(r: ResultadoEnvioNativo): void;
}

interface Cola {
  puerto: number;
  control: Item[];
  datos: Item[];
  bytesDatos: number;
  bombeando: boolean;
  cubeta: Cubeta | null;
  claveLimites: string;
  fallos: number;
}

const nadaQueHacer = () => undefined;

export function crearRedNativa(deps: DepsRedNativa): RedNativa {
  let ligaduras: Ligadura[] = [];
  let escuchando = false;
  let vecinos: VecinoMinimo[] = [];
  let misLimites: LimitesCanal | null = null;
  let ultimoRechazo: string | null = null;
  const ultimoHola: Record<string, number> = {};
  const caidas: Record<string, number> = {};
  const rtt: Record<string, number> = {};
  const colas = new Map<string, Cola>();
  const canales = new Map<string, CanalArchivos>();
  const senales = new Map<string, EstadoSenal>();
  const conexiones = new Map<string, { neurona: string; conx: ConexionSenal; baja: () => void }>();
  const ofertas = new Map<string, string>();
  const respuestas = new Map<string, string>();
  const oyentes = new Set<() => void>();
  /** (MLL1107A) Envíos que esperan a que se ligue una neurona. */
  const esperas = new Map<string, Array<() => void>>();
  /** (MLL1107A) Esta app tiene la clave de faro de la cuenta (su saludo lleva la prueba). */
  let conClaveCuenta = false;
  /** (WFD1108A) Pistas «neurona → IP» del enlace Wi-Fi directo, con caducidad. */
  const pistas = new Map<string, { ip: string; puerto: number; hasta: number }>();
  const conPistas = (lista: VecinoMinimo[]): VecinoMinimo[] => {
    const ahora = deps.ahora();
    let out = [...lista];
    for (const [neurona, p] of Array.from(pistas)) {
      if (p.hasta < ahora) {
        pistas.delete(neurona);
        continue;
      }
      // Mientras dure la pista, esa neurona se busca SOLO en la red directa (no por el router de casa).
      out = out.filter((x) => x.neurona !== neurona || x.ip === p.ip);
      if (!out.some((x) => x.ip === p.ip)) out.push({ ip: p.ip, neurona, puerto: p.puerto, canal: true });
    }
    return out;
  };

  const avisar = () => {
    for (const f of Array.from(oyentes)) {
      try {
        f();
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  const puertoDe = (ip: string): number => {
    const l = ligaduraDeIp(ligaduras, ip, deps.ahora());
    if (l) return l.puerto;
    const v = vecinos.find((x) => x.ip === ip);
    return v && v.puerto >= 1024 ? v.puerto : PUERTO_CANAL_NATIVO;
  };

  const cola = (ip: string, puerto?: number): Cola => {
    let c = colas.get(ip);
    if (!c) {
      c = { puerto: puerto ?? puertoDe(ip), control: [], datos: [], bytesDatos: 0, bombeando: false, cubeta: null, claveLimites: "", fallos: 0 };
      colas.set(ip, c);
    } else if (puerto) {
      c.puerto = puerto;
    }
    return c;
  };

  const caido = (ip: string) => (caidas[ip] ?? 0) > deps.ahora();

  /* ─────────────── Cifrado de punta a punta (CIF1108A) ─────────────── */

  /** Esperas a que una sesión quede activa (por neurona). */
  const esperasSesion = new Map<string, Array<() => void>>();
  /** Esta app cifra (hay motor de sesiones). */
  const propio = (): boolean => !!deps.sesiones;
  const exigir = (): boolean => {
    try {
      return !!deps.exigirCifrado?.();
    } catch {
      return false;
    }
  };
  /** Cómo se habla con esa ligadura: cifrado (obligatorio), en claro (app anterior) o bloqueado (ajuste). */
  const modoDe = (lig: Ligadura): ModoEnlace => decidirModo({ propio: propio(), cifPar: lig.cif, exigir: exigir() });
  /** Los límites de lo que se arma en claro hacia esa ligadura (más estrechos si luego se cifra). */
  /**
   * (CIF1108A) Tope negociado: lo que admite el otro (su saludo) y lo que admite el Rust de ESTA app
   * (`malla_local_estado`; una app anterior no lo dice → 64 KiB). Se manda con el menor de los dos.
   */
  const limitesHacia = (lig: Ligadura | null): LimitesCanal => {
    const base = lig?.limites ?? LIMITES_CANAL_ANTERIOR;
    const propio = (misLimites ?? LIMITES_CANAL_ANTERIOR).maxCuerpo;
    return propio < base.maxCuerpo ? { ...base, maxCuerpo: propio } : base;
  };
  const limitesEfectivos = (lig: Ligadura | null): LimitesCanal => {
    const lim = limitesHacia(lig);
    return lig && modoDe(lig) === "cifrado" ? limitesParaCifrado(lim) : lim;
  };

  function despertarSesion(neurona: string): void {
    const l = esperasSesion.get(neurona);
    if (!l) return;
    esperasSesion.delete(neurona);
    for (const f of l) f();
  }

  /** Abre (si no hay uno en marcha) el acuerdo de sesión con esa neurona: manda el `nl.cs/ini` firmado, en claro. */
  async function abrirAcuerdo(lig: Ligadura): Promise<void> {
    if (!deps.sesiones) return;
    try {
      const yo = await deps.yo();
      if (!yo) return;
      const sobre = await deps.sesiones.iniciar(yo.neurona, lig.neurona);
      // Directo, sin pasar por la cola: quien espera la sesión es la propia cola (si no, se bloquearía).
      if (sobre) await deps.enviar(lig.ip, lig.puerto, JSON.stringify({ t: "nl.cs", s: sobre }));
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

  /** Cifra una trama hacia esa ligadura; abre el acuerdo y espera un momento si aún no hay sesión. Null + motivo si no se pudo. */
  async function cifrarHacia(lig: Ligadura, texto: string): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
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
        if (!(await esperarSesion(lig.neurona, ESPERA_SESION_MS))) break;
      }
    }
    return { ok: false, motivo: "el cifrado del enlace aún no está listo; se reintenta" };
  }

  /** Un fallo de autenticación, repetición o forma cierra el enlace: se olvida la ligadura y la sesión. */
  function cerrarEnlace(lig: Ligadura, motivo: string): void {
    ligaduras = ligaduras.filter((l) => l.neurona !== lig.neurona);
    deps.sesiones?.olvidar(lig.neurona);
    ultimoRechazo = `Enlace con ${lig.nombre} cerrado: ${motivo}`;
    avisar();
  }

  function etiquetaDe(lig: Ligadura): EtiquetaCifrado {
    return etiquetaCifrado(modoDe(lig), deps.sesiones?.estado(lig.neurona) ?? "sin");
  }

  async function bombear(ip: string): Promise<void> {
    const c = colas.get(ip);
    if (!c || c.bombeando) return;
    c.bombeando = true;
    try {
      while (c.control.length || c.datos.length) {
        const fuente = c.control.length ? c.control : c.datos;
        const lig = ligaduraDeIp(ligaduras, ip, deps.ahora());
        const lim = limitesHacia(lig);
        // (CIF1108A) Solo se arma un grupo homogéneo: o todo «siempre en claro» (saludo, acuerdo) o todo lo demás.
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
          maxTextoPorTrama(cifrando && lig ? limitesParaCifrado(lim) : lim),
        );
        if (!trama.cuerpo) {
          for (const i of fuente.splice(0, Math.max(1, trama.usados))) {
            if (fuente === c.datos) c.bytesDatos -= i.texto.length;
            i.fin({ ok: false, motivo: trama.motivo ?? "no se pudo armar la trama" });
          }
          continue;
        }
        // Ritmo: nunca más del 90 % de lo que el limitador del otro deja pasar.
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
            // No es un fallo de red: el cifrado aún no está listo. Se devuelve el error sin contar caída.
            const hechos = fuente.splice(0, n);
            if (fuente === c.datos) for (const i of hechos) c.bytesDatos -= i.texto.length;
            for (const i of hechos) i.fin({ ok: false, motivo: cf.motivo });
            continue;
          }
          cuerpoAire = cf.texto;
        }
        let r: Awaited<ReturnType<DepsRedNativa["enviar"]>>;
        try {
          r = await deps.enviar(ip, lig?.puerto ?? c.puerto, cuerpoAire);
        } catch {
          r = { ok: false, motivo: "la app nativa no respondió" };
        }
        if (r.ok) {
          const hechos = fuente.splice(0, n);
          if (fuente === c.datos) for (const i of hechos) c.bytesDatos -= i.texto.length;
          rtt[ip] = r.ms;
          c.fallos = 0;
          for (const i of hechos) i.fin({ ok: true, ms: r.ms });
          continue;
        }
        c.fallos += 1;
        if (c.fallos >= FALLOS_PARA_CAIDA) {
          caidas[ip] = deps.ahora() + CAIDA_MS;
          c.fallos = 0;
          c.bytesDatos = 0;
          const motivo = `La app de ${ip} no acusa recibo (${r.motivo}); se reintenta en ${Math.round(CAIDA_MS / 1000)} s.`;
          for (const i of [...c.control.splice(0), ...c.datos.splice(0)]) i.fin({ ok: false, motivo });
          avisar();
          break;
        }
        await deps.dormir(esperaTrasFallo(c.fallos));
      }
    } finally {
      c.bombeando = false;
    }
  }

  function encolar(ip: string, texto: string, puerto?: number): Promise<ResultadoEnvioNativo> {
    const ipOk = ipLocal(ip);
    if (!ipOk) return Promise.resolve({ ok: false, motivo: `«${ip}» no es de esta red local.` });
    if (caido(ipOk)) return Promise.resolve({ ok: false, motivo: "Ese aparato no acusa recibo ahora; se reintenta en unos segundos." });
    const c = cola(ipOk, puerto);
    return new Promise((fin) => {
      const item: Item = { texto, fin };
      if (claseDeTexto(texto) === "datos") {
        c.datos.push(item);
        c.bytesDatos += texto.length;
      } else {
        c.control.push(item);
      }
      // La bomba arranca en la siguiente microtarea: lo encolado seguido (trozos de un archivo) sale junto.
      void Promise.resolve().then(() => bombear(ipOk));
    });
  }

  function canalArchivos(ip: string): CanalArchivos {
    let canal = canales.get(ip);
    if (!canal) {
      canal = {
        enviar: (t) => {
          const c = cola(ip);
          if (caido(ip) || c.bytesDatos + t.length > MAX_COLA_DATOS) return false;
          void encolar(ip, t);
          return true;
        },
        bufferedAmount: () => (colas.get(ip)?.bytesDatos ?? 0) * FACTOR_FRENO_ARCHIVOS,
        // (ARC1108B) El trozo que cabe solo en una trama hacia esa app (46 KiB con el tope de 64 KiB).
        // (CIF1108A) Con cifrado, el trozo se achica lo justo para que la trama CIFRADA siga cabiendo en una.
        tamanoTrozo: () => trozoArchivoParaTrama(limitesEfectivos(ligaduraDeIp(ligaduras, ip, deps.ahora()))),
        alMensaje: () => nadaQueHacer,
      };
      canales.set(ip, canal);
    }
    return canal;
  }

  async function firmarYEnviar(ip: string, puerto: number | undefined, t: "nl.hola" | "nl.sen", cuerpo: unknown): Promise<ResultadoEnvioNativo> {
    const s = await deps.firmar(cuerpo);
    if (!s) return { ok: false, motivo: "no se pudo firmar con la identidad de malla" };
    return encolar(ip, JSON.stringify({ t, s }), puerto);
  }

  /** (MLL1107A) ¿Tiene esta app la clave de faro de la cuenta? Nunca lanza. */
  async function hayClaveCuenta(): Promise<boolean> {
    if (!deps.pruebaCuenta) return false;
    try {
      return esPruebaCuenta(await deps.pruebaCuenta("ss-nl-cuenta-v1|comprobar"));
    } catch {
      return false;
    }
  }

  /** (MLL1107A) Prueba de cuenta para un saludo propio (null sin clave o sin huella). Nunca lanza. */
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

  async function saludar(ip: string, puerto: number, neurona: string, resp: boolean): Promise<void> {
    const yo = await deps.yo();
    if (!yo) return;
    const ts = deps.ahora();
    ultimoHola[ip] = ts;
    const cta = await pruebaPara(yo.neurona, neurona, ts);
    let certificado: CertificadoNeurona | null = null;
    try {
      certificado = (await deps.certificadoPropio?.()) ?? null;
    } catch {
      certificado = null;
    }
    await firmarYEnviar(
      ip,
      puerto,
      "nl.hola",
      holaNativa({ de: yo, para: neurona, limites: misLimites, webrtc: deps.webrtc(), resp, ts, cta, ...(propio() ? { cif: VERSION_CIFRADO } : {}), certificado }),
    );
  }

  function despertar(neurona: string): void {
    const l = esperas.get(neurona);
    if (!l) return;
    esperas.delete(neurona);
    for (const f of l) {
      try {
        f();
      } catch {
        /* */
      }
    }
  }

  /** Se resuelve en cuanto esa neurona queda ligada (true) o al pasar `ms` (lo que haya entonces). */
  function esperarLigadura(neurona: string, ms: number): Promise<boolean> {
    if (ligaduraDeNeurona(ligaduras, neurona, deps.ahora())) return Promise.resolve(true);
    return new Promise((fin) => {
      let hecho = false;
      const cb = () => {
        if (hecho) return;
        hecho = true;
        fin(true);
      };
      esperas.set(neurona, [...(esperas.get(neurona) ?? []), cb]);
      void deps.dormir(ms).then(() => {
        const l = (esperas.get(neurona) ?? []).filter((f) => f !== cb);
        if (l.length) esperas.set(neurona, l);
        else esperas.delete(neurona);
        if (hecho) return;
        hecho = true;
        fin(!!ligaduraDeNeurona(ligaduras, neurona, deps.ahora()));
      });
    });
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

  async function recibirHola(cuerpo: string, ip: string): Promise<void> {
    const v = await verificarSobre(cuerpo);
    if (!v) return;
    const h = leerHola(v.cuerpo);
    const yo = await deps.yo();
    if (!h || !yo) return;
    // (MLL1107A) La prueba de cuenta se comprueba con LA huella que firmó el sobre.
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
      ultimoRechazo = ac.motivo;
      avisar();
      return;
    }
    // (CIF1108A) Gancho de identidad: si trae certificado y hay verificador, tiene que cuadrar. Sin verificador, se ignora.
    if (h.certificado) {
      try {
        const bien = await (deps.verificarCertificado ?? verificadorCertificadoPorDefecto)(h.certificado, { neurona: h.de.neurona, huella: v.huella ?? "" });
        if (!bien) {
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
    const nueva = !ligaduraDeNeurona(ligaduras, h.de.neurona, deps.ahora());
    // (CIF1108A) Si esa neurona vuelve con otra identidad, la sesión que se acordó con la anterior no vale.
    if (ligaduras.some((l) => l.neurona === h.de.neurona && l.huella !== v.huella)) deps.sesiones?.olvidar(h.de.neurona);
    const puerto = vecinos.find((x) => x.ip === ip)?.puerto ?? colas.get(ip)?.puerto ?? PUERTO_CANAL_NATIVO;
    ligaduras = ligar(ligaduras, {
      ip,
      puerto: puerto >= 1024 ? puerto : PUERTO_CANAL_NATIVO,
      neurona: h.de.neurona,
      huella: v.huella as string,
      nombre: ac.vinculo.nombre || h.de.nombre,
      ...((ac.vinculo.sync ?? h.de.sync) ? { sync: ac.vinculo.sync ?? h.de.sync } : {}),
      ...((ac.vinculo.cuenta ?? h.de.cuenta) ? { cuenta: ac.vinculo.cuenta ?? h.de.cuenta } : {}),
      limites: h.lim ? leerLimites(h.lim) : { ...LIMITES_CANAL_ANTERIOR },
      webrtc: h.webrtc,
      at: deps.ahora(),
      ...(ac.porCuenta ? { porCuenta: true } : {}),
      ...(h.cif ? { cif: h.cif } : {}),
    });
    delete caidas[ip];
    ultimoRechazo = null;
    despertar(h.de.neurona);
    avisar();
    if (!h.resp && deps.ahora() - (ultimoHola[ip] ?? -Infinity) >= 1000) await saludar(ip, puerto, h.de.neurona, true);
    if (nueva) await ticSenales();
  }

  /* ─────────────── Señalización ─────────────── */

  function evento(neurona: string, ev: EventoSenal): void {
    const r = pasoSenal(senales.get(neurona) ?? SENAL_INICIAL, ev);
    senales.set(neurona, r.estado);
    for (const a of r.acciones) void ejecutar(neurona, a);
    avisar();
  }

  async function mandarSenal(lig: Ligadura, p: Pick<SenalNativa, "k" | "s" | "sdp">): Promise<ResultadoEnvioNativo> {
    const yo = await deps.yo();
    if (!yo) return { ok: false, motivo: "sin identidad de esta neurona" };
    const s: SenalNativa = { t: "nl.sen", v: 1, k: p.k, s: p.s, de: yo.neurona, para: lig.neurona, ...(p.sdp ? { sdp: p.sdp } : {}), n: yo.nombre, ts: deps.ahora() };
    return firmarYEnviar(lig.ip, lig.puerto, "nl.sen", s);
  }

  function guardarConexion(sesion: string, neurona: string, conx: ConexionSenal): void {
    const baja = conx.alCambiar((e, motivo) => {
      if (e === "abierta") {
        evento(neurona, { t: "abierta", sesion, ahora: deps.ahora() });
        return;
      }
      // En curso → fallo (la máquina reintenta); ya abierta → el siguiente tic ve que no hay enlace.
      evento(neurona, { t: "fallo", sesion, ahora: deps.ahora(), motivo: motivo ?? (e === "cerrada" ? "la conexión se cerró" : "la conexión falló") });
      soltarConexion(sesion);
    });
    conexiones.set(sesion, { neurona, conx, baja });
  }

  function soltarConexion(sesion: string): void {
    const c = conexiones.get(sesion);
    if (!c) return;
    conexiones.delete(sesion);
    try {
      c.baja();
    } catch {
      /* noop */
    }
    try {
      c.conx.cancelar();
    } catch {
      /* noop */
    }
  }

  async function ejecutar(neurona: string, a: AccionSenal): Promise<void> {
    const lig = ligaduraDeNeurona(ligaduras, neurona, deps.ahora());
    const fallo = (motivo: string) => evento(neurona, { t: "fallo", sesion: a.sesion, ahora: deps.ahora(), motivo });
    if (a.a === "cancelar") {
      soltarConexion(a.sesion);
      ofertas.delete(a.sesion);
      respuestas.delete(a.sesion);
      if (a.avisar && lig) await mandarSenal(lig, { k: "cierre", s: a.sesion });
      return;
    }
    if (!lig) return fallo("ya no hay ligadura con esa neurona");
    const yo = await deps.yo();
    if (!yo) return fallo("sin identidad de esta neurona");
    if (a.a === "ofrecer") {
      const r = await deps.ofrecer({ sesion: a.sesion, nombre: yo.nombre, nombreRemoto: lig.nombre });
      if (!r.ok) return fallo(r.motivo);
      guardarConexion(a.sesion, neurona, r);
      const env = await mandarSenal(lig, { k: "oferta", s: a.sesion, sdp: r.sdp });
      if (!env.ok) return fallo(env.motivo ?? "la oferta no salió");
      evento(neurona, { t: "oferta-enviada", sesion: a.sesion, ahora: deps.ahora() });
      return;
    }
    if (a.a === "responder") {
      const sdp = ofertas.get(a.sesion);
      ofertas.delete(a.sesion);
      if (!sdp) return fallo("la oferta ya no está");
      const r = await deps.responder({ sesion: a.sesion, sdp: candidatosConIp(sdp, lig.ip), nombre: yo.nombre, nombreRemoto: lig.nombre });
      if (!r.ok) return fallo(r.motivo);
      guardarConexion(a.sesion, neurona, r);
      const env = await mandarSenal(lig, { k: "respuesta", s: a.sesion, sdp: r.sdp });
      if (!env.ok) return fallo(env.motivo ?? "la respuesta no salió");
      evento(neurona, { t: "respuesta-enviada", sesion: a.sesion, ahora: deps.ahora() });
      return;
    }
    // completar
    const sdp = respuestas.get(a.sesion);
    respuestas.delete(a.sesion);
    const c = conexiones.get(a.sesion);
    if (!sdp || !c?.conx.completar) return fallo("no hay oferta propia a la que aplicar la respuesta");
    const r = await c.conx.completar(candidatosConIp(sdp, lig.ip));
    if (!r.ok) fallo(r.motivo ?? "la respuesta no encaja");
  }

  async function recibirSenal(cuerpo: string, ip: string): Promise<void> {
    const v = await verificarSobre(cuerpo);
    if (!v) return;
    const s = leerSenal(v.cuerpo);
    const lig = ligaduraDeIp(ligaduras, ip, deps.ahora());
    // Solo de la neurona LIGADA a esa IP y firmada por la misma identidad que la ligó.
    if (!s || !lig || lig.neurona !== s.de || lig.huella !== v.huella) return;
    const yo = await deps.yo();
    if (!yo || s.para !== yo.neurona) return;
    const ahora = deps.ahora();
    // Lo que la máquina no adopta (oferta ignorada, respuesta vieja) no se guarda.
    if (s.k === "oferta" && s.sdp) {
      ofertas.set(s.s, s.sdp);
      evento(lig.neurona, { t: "oferta-recibida", sesion: s.s, ahora, ofrezco: quienOfrece(yo.neurona, lig.neurona) });
      if (senales.get(lig.neurona)?.sesion !== s.s) ofertas.delete(s.s);
    } else if (s.k === "respuesta" && s.sdp) {
      respuestas.set(s.s, s.sdp);
      evento(lig.neurona, { t: "respuesta-recibida", sesion: s.s, ahora });
      if (senales.get(lig.neurona)?.sesion !== s.s) respuestas.delete(s.s);
    } else if (s.k === "cierre") {
      evento(lig.neurona, { t: "cierre-recibido", sesion: s.s, ahora });
    }
  }

  async function ticSenales(): Promise<void> {
    const yo = await deps.yo();
    if (!yo) return;
    const ahora = deps.ahora();
    const vistas = new Set<string>();
    for (const l of ligaduras) {
      if (ahora - l.at > 5 * 60_000) continue;
      vistas.add(l.neurona);
      evento(l.neurona, {
        t: "tic",
        ahora,
        posible: escuchando && deps.webrtc() && l.webrtc,
        ofrezco: quienOfrece(yo.neurona, l.neurona),
        enlaceAbierto: deps.enlaceLocalCon(l.neurona),
        sesionNueva: deps.nuevaSesion(),
      });
    }
    for (const n of Array.from(senales.keys())) {
      if (vistas.has(n)) continue;
      evento(n, { t: "tic", ahora, posible: false, ofrezco: false, enlaceAbierto: deps.enlaceLocalCon(n), sesionNueva: deps.nuevaSesion() });
    }
  }

  /* ─────────────── Entrada ─────────────── */

  /** (CIF1108A) `nl.cs`: acuerdo de sesión firmado por la neurona LIGADA a esa IP (misma huella que su saludo). */
  async function recibirAcuerdo(cuerpo: string, ip: string): Promise<void> {
    if (!deps.sesiones) return;
    const lig = ligaduraDeIp(ligaduras, ip, deps.ahora());
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
    // Primero la contestación, luego se despierta a quien espera: así el otro lado ya tiene la sesión cuando llegue lo cifrado.
    if (r.respuesta) await deps.enviar(lig.ip, lig.puerto, JSON.stringify({ t: "nl.cs", s: r.respuesta }));
    if (r.activa) despertarSesion(lig.neurona);
    avisar();
  }

  /** `descifrado`: el texto salió de una trama `nl.cif` autenticada (único modo de llevar datos hacia un aparato que cifra). */
  async function recibir(cuerpo: string, ip: string, descifrado = false): Promise<void> {
    const ipOk = ipLocal(ip);
    if (!ipOk || typeof cuerpo !== "string") return;
    if (cuerpo.startsWith('{"t":"nl.lote"')) {
      for (const t of desempaquetarLote(cuerpo) ?? []) await recibir(t, ipOk, descifrado);
      return;
    }
    // El saludo y el acuerdo solo valen en claro: dentro de una trama cifrada no tienen sentido.
    if (cuerpo.startsWith('{"t":"nl.hola"')) return descifrado ? undefined : recibirHola(cuerpo, ipOk);
    if (esAcuerdo(cuerpo)) return descifrado ? undefined : recibirAcuerdo(cuerpo, ipOk);
    const lig = ligaduraDeIp(ligaduras, ipOk, deps.ahora());
    if (esTramaCifrada(cuerpo)) {
      if (descifrado || !lig || !deps.sesiones) return;
      const r = await deps.sesiones.descifrar(lig.neurona, cuerpo);
      if (r.ok) return recibir(r.texto, ipOk, true);
      if (r.motivo === "desconocida") {
        // Sesión perdida (reinicio de uno de los dos): se vuelve a acordar; lo que iba en esa trama no se puede leer.
        ultimoRechazo = `Trama cifrada de ${lig.nombre} con una sesión desconocida; se acuerda otra.`;
        avisar();
        void abrirAcuerdo(lig);
        return;
      }
      cerrarEnlace(lig, r.detalle);
      return;
    }
    if (!lig) return; // sin vínculo y saludo firmado, ni mensajes ni archivos
    // (CIF1108A) Hacia un aparato que cifra (o con «exigir cifrado»), lo que llega en claro se descarta.
    if (!descifrado && modoDe(lig) !== "claro") {
      ultimoRechazo = `Trama sin cifrar de ${lig.nombre}, que cifra o debe cifrar: descartada.`;
      avisar();
      return;
    }
    if (cuerpo.startsWith('{"t":"nl.sen"')) return recibirSenal(cuerpo, ipOk);
    try {
      if (cuerpo.startsWith('{"t":"tu.')) {
        deps.entregarTransporte(cuerpo, { enlaceId: idEnlaceNativo(ipOk), etiqueta: `${lig.nombre} · red local`, ...(lig.sync ? { syncDeviceId: lig.sync } : {}) });
      } else if (cuerpo.startsWith('{"t":"archivo.')) {
        deps.entregarArchivo(canalArchivos(ipOk), cuerpo, `${lig.nombre} (red local · app nativa)`, { huella: lig.huella, ...(lig.porCuenta ? { porCuenta: true } : {}) });
      }
    } catch {
      /* un oyente roto no tumba el canal */
    }
  }

  async function refrescar(): Promise<void> {
    let st: EstadoCanalNativo | null = null;
    try {
      st = await deps.estado();
    } catch {
      st = null;
    }
    escuchando = !!st?.escuchando;
    vecinos = conPistas(st?.vecinos ?? []);
    misLimites = st?.limites ?? null;
    const ahora = deps.ahora();
    ligaduras = podarLigaduras(ligaduras, ahora);
    conClaveCuenta = await hayClaveCuenta();
    if (escuchando) {
      const destinos = destinosHola({ vecinos, vinculos: deps.vinculos(), ligaduras, ultimoHola, ahora, cuenta: conClaveCuenta });
      await Promise.all(destinos.map((d) => saludar(d.ip, d.puerto, d.neurona, false)));
    }
    await ticSenales();
    avisar();
  }

  async function asegurarLigadura(neurona: string, esperaMs: number = ESPERA_LIGADURA_MS): Promise<ResultadoAsegurar> {
    const t0 = deps.ahora();
    const diag = (): ResultadoAsegurar => ({
      ...diagnosticoHacia({ neurona, escuchando, vecinos, vinculos: deps.vinculos(), ligaduras, caidas, ultimoHola, ahora: deps.ahora(), cuenta: conClaveCuenta }),
      esperadoMs: Math.max(0, deps.ahora() - t0),
    });
    try {
      if (ligaduraDeNeurona(ligaduras, neurona, t0)) return diag();
      let st: EstadoCanalNativo | null = null;
      try {
        st = await deps.estado();
      } catch {
        st = null;
      }
      if (st) {
        escuchando = !!st.escuchando;
        vecinos = conPistas(st.vecinos ?? []);
        misLimites = st.limites ?? null;
      }
      conClaveCuenta = await hayClaveCuenta();
      const d0 = diag();
      if (d0.estado !== "sin-respuesta") return d0;
      const destino = ipsDeNeurona(neurona, vecinos, deps.vinculos().find((v) => v.neurona === neurona))[0];
      if (!destino) return d0;
      const hace = deps.ahora() - (ultimoHola[destino.ip] ?? -Infinity);
      let espera = esperaMs;
      if (hace >= ENTRE_HOLAS_MS) {
        // No se espera al acuse del propio saludo (puede tardar segundos si la otra app no está): solo a la ligadura.
        void saludar(destino.ip, destino.puerto, neurona, false).catch(nadaQueHacer);
      } else {
        // Ya hay un saludo reciente: lo que le quede de espera (si hace rato que no contesta, nada).
        espera = Math.max(0, esperaMs - hace);
      }
      if (espera > 0) await esperarLigadura(neurona, espera);
      return diag();
    } catch {
      return diag();
    }
  }

  return {
    refrescar,
    asegurarLigadura,
    ticSenales,
    urgirEnlace: (neurona) => {
      try {
        if (!neurona) return;
        evento(neurona, { t: "urgir", ahora: deps.ahora() });
        void ticSenales().catch(nadaQueHacer);
      } catch {
        /* el siguiente tic lo intenta igual */
      }
    },
    enlaces: () => enlacesNativos({ ligaduras, ahora: deps.ahora(), escuchando, caidas, rtt, ...(propio() ? { cifrado: Object.fromEntries(ligaduras.map((l) => [l.ip, etiquetaDe(l)])) } : {}) }),
    cifradoDe: (neurona) => {
      const l = ligaduraDeNeurona(ligaduras, neurona, deps.ahora());
      return l ? etiquetaDe(l) : null;
    },
    enviarTexto: (ip, texto, puerto) => encolar(ip, texto, puerto),
    canalArchivos: (ip) => canalArchivos(ipLocal(ip) ?? ip),
    recibir,
    colaBytes: (ip) => colas.get(ip)?.bytesDatos ?? 0,
    pista: (neurona, ip, puerto) => {
      if (!neurona) return;
      if (ip === null) {
        // El enlace directo se cerró: la neurona se vuelve a buscar por donde la oiga el faro.
        pistas.delete(neurona);
        return;
      }
      const ipOk = ipLocal(ip);
      if (!ipOk) return;
      pistas.set(neurona, { ip: ipOk, puerto: puerto && puerto >= 1024 ? puerto : PUERTO_CANAL_NATIVO, hasta: deps.ahora() + 30 * 60_000 });
      vecinos = conPistas(vecinos.filter((x) => x.ip !== ipOk));
      // Una ligadura con esa neurona en otra IP (la red de casa) cede: se la vuelve a saludar en la nueva.
      ligaduras = ligaduras.filter((l) => l.neurona !== neurona || l.ip === ipOk);
      avisar();
    },
    instantanea: () => ({
      escuchando,
      ligaduras: [...ligaduras],
      senales: Object.fromEntries(senales),
      caidas: { ...caidas },
      ultimoRechazo,
      cifrado: Object.fromEntries(ligaduras.map((l) => [l.neurona, etiquetaDe(l)])),
    }),
    suscribir: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
  };
}

/* ══════════════════════════ Prueba de cuenta: HMAC con la clave de faro (MLL1107A) ══════════════════════════ */

/**
 * HMAC-SHA256(clave de faro, texto) → los primeros 16 bytes en hex. Null si la clave no es de 64 hex o
 * no hay WebCrypto. La clave nunca sale de aquí (ni a la consola ni al resultado).
 */
export async function hmacPruebaCuenta(claveHex: string | null | undefined, texto: string): Promise<string | null> {
  if (typeof claveHex !== "string" || !/^[0-9a-fA-F]{64}$/.test(claveHex)) return null;
  try {
    const sutil = globalThis.crypto?.subtle;
    if (!sutil) return null;
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(claveHex.slice(i * 2, i * 2 + 2), 16);
    const k = await sutil.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const firma = new Uint8Array(await sutil.sign("HMAC", k, new TextEncoder().encode(texto)));
    return Array.from(firma.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/* ══════════════════════════ Instancia real (solo en la app nativa) ══════════════════════════ */

let red: RedNativa | null = null;

/** Clave del ajuste «Exigir cifrado en la red local» (localStorage de la app; por aparato). */
export const CLAVE_EXIGIR_CIFRADO = "ss.redLocal.exigirCifrado";

/**
 * Ajuste «Exigir cifrado en la red local». Por defecto APAGADO hasta el siguiente lanzamiento oficial
 * (las apps anteriores no cifran y, con el ajuste, quedarían sin red local). Nunca lanza.
 */
export function exigirCifradoRedLocal(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_EXIGIR_CIFRADO) === "1";
  } catch {
    return false;
  }
}

export function fijarExigirCifradoRedLocal(valor: boolean): void {
  try {
    if (valor) globalThis.localStorage?.setItem(CLAVE_EXIGIR_CIFRADO, "1");
    else globalThis.localStorage?.removeItem(CLAVE_EXIGIR_CIFRADO);
    red?.refrescar?.();
  } catch {
    /* sin almacenamiento: el ajuste no se guarda */
  }
}

/** La red nativa de esta página, si arrancó (solo en la app nativa). */
export function redLocalNativaActiva(): RedNativa | null {
  return red;
}

function sesionNueva(): string {
  try {
    const a = crypto.getRandomValues(new Uint8Array(9));
    return PREFIJO_SESION_NATIVA + Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
  } catch {
    return `${PREFIJO_SESION_NATIVA}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

function aConexion(
  emp: { estado(): string; motivo(): string | null; alCambiar(cb: () => void): () => void; cancelar(): void },
  sdp: string,
  completar?: (sdp: string) => Promise<{ ok: boolean; motivo?: string }>,
): ConexionSenal {
  return {
    sdp,
    ...(completar ? { completar } : {}),
    cancelar: () => emp.cancelar(),
    alCambiar: (cb) =>
      emp.alCambiar(() => {
        const e = emp.estado();
        if (e === "abierto") cb("abierta");
        else if (e === "fallido") cb("fallida", emp.motivo() ?? undefined);
        else if (e === "cerrado") cb("cerrada", emp.motivo() ?? undefined);
      }),
  };
}

async function depsReales(): Promise<DepsRedNativa> {
  const [{ puenteNativo }, sync, { enlacesLocalesVivos }, { identidadDispositivo }] = await Promise.all([
    import("@/lib/nativa/puente"),
    import("./sincronizacion-neuronas-motor"),
    import("./registro-enlaces-locales"),
    import("@/lib/network/identidad-dispositivo"),
  ]);
  const motor = sync.motorSync();
  motor.cargar();
  // (OFF1108A) Espejo de la instantánea de la cuenta (huellas probadas) antes del primer saludo, máx. 3 s.
  const espejo = await import("@/lib/sin-internet/huellas-cuenta-vivas");
  await Promise.race([espejo.cargarEspejo().catch(() => undefined), new Promise((r) => setTimeout(r, 3_000))]);
  // (MLL1107A) La clave de faro la guarda la app (antenas.json, la reparte VIN1107A): se relee cada minuto.
  let clave: { hex: string | null; leida: number } = { hex: null, leida: -Infinity };
  const claveFaro = async (): Promise<string | null> => {
    if (Date.now() - clave.leida < 60_000) return clave.hex;
    const r = await puenteNativo().antenasConfig();
    clave = { hex: r.ok && typeof r.valor?.clave_faro === "string" ? r.valor.clave_faro : null, leida: Date.now() };
    return clave.hex;
  };
  const firmar = async (cuerpo: unknown): Promise<unknown | null> => {
    const { wrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
    const s = await wrapSigned(cuerpo);
    return (s as { v?: unknown }).v === 2 ? s : null;
  };
  return {
    ahora: () => Date.now(),
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    nuevaSesion: sesionNueva,
    estado: async () => {
      const r = await puenteNativo().llamar<{ escuchando: boolean; vecinos: VecinoMinimo[]; max_cuerpo?: number; limite_mensajes?: number; limite_ventana_ms?: number }>("malla_local_estado");
      if (!r.ok || !r.valor) return null;
      const v = r.valor;
      return {
        escuchando: !!v.escuchando,
        vecinos: Array.isArray(v.vecinos) ? v.vecinos : [],
        limites: typeof v.max_cuerpo === "number" ? leerLimites(v) : null,
      };
    },
    enviar: async (ip, puerto, json) => {
      const r = await puenteNativo().llamar<{ ms: number }>("malla_local_enviar", { ip, puerto, json });
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
    // (OFF1108A) Los vínculos del aparato + las neuronas de la cuenta ya probadas (huella guardada): sin servidor.
    vinculos: () => {
      const reales = motor.instantanea().vinculos;
      const guardados = espejo.vinculosDeCuentaCacheados();
      if (!guardados.length) return reales;
      const vistos = new Set(reales.map((v) => v.neurona));
      return [...reales, ...guardados.filter((v) => !vistos.has(v.neurona))];
    },
    firmar,
    sesiones: crearSesionesCifradas({ ahora: () => Date.now(), firmar }),
    exigirCifrado: exigirCifradoRedLocal,
    verificar: async (sobre) => {
      const [{ unwrapSigned }, { acceptFreshness }] = await Promise.all([import("@/ai/astraura/mesh/mesh-identity"), import("@/ai/astraura/mesh/replay-guard")]);
      const r = await unwrapSigned(sobre);
      const b = r.body as { t?: unknown; ts?: unknown; s?: unknown } | null;
      const clave = b && typeof b.t === "string" ? `${b.t}:${String(b.s ?? b.ts ?? "")}` : undefined;
      const fresco = r.verified && typeof r.ts === "number" && !!r.nonce && acceptFreshness(r.fp, r.ts, r.nonce, clave);
      return { cuerpo: r.body, huella: r.fp, valido: r.verified && fresco };
    },
    webrtc: () => typeof RTCPeerConnection === "function",
    enlaceLocalCon: (neurona) => enlacesLocalesVivos().some((e) => e.par.neuronDeviceId === neurona),
    ofrecer: async (o) => {
      const em = await import("./emparejar-sin-internet");
      const r = await em.ofrecerPorCanal({ sesion: o.sesion, nombre: o.nombre, nombreRemoto: o.nombreRemoto });
      return r.ok ? { ok: true, ...aConexion(r.emp, r.sdp, r.completar) } : r;
    },
    responder: async (o) => {
      const em = await import("./emparejar-sin-internet");
      const r = await em.responderPorCanal({ sesion: o.sesion, sdp: o.sdp, nombre: o.nombre, nombreRemoto: o.nombreRemoto });
      return r.ok ? { ok: true, ...aConexion(r.emp, r.sdp) } : r;
    },
    entregarTransporte: (texto, origen) => {
      void import("./transporte-universal")
        .then((tu) => tu.despacharTextoTransporte(texto, { tipo: "nativo", ...origen }, nadaQueHacer))
        .catch(nadaQueHacer);
    },
    entregarArchivo: (canal, texto, etiquetaOrigen, quien) => {
      void import("@/lib/network/archivos-malla")
        .then((am) =>
          am.motorArchivosCompartido().manejarMensaje(canal, texto, {
            mismaCuenta: false,
            etiquetaOrigen,
            verificarPermiso: () => true,
            via: "Red local (app nativa) · canal TCP 47071",
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
        .catch(nadaQueHacer);
    },
    pruebaCuenta: async (texto) => {
      try {
        return await hmacPruebaCuenta(await claveFaro(), texto);
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
 * iniciarRedLocalNativa — arranca el enlace `nativo:<ip>` y la señalización WebRTC por el canal local
 * (solo en la app nativa; en el navegador no hace nada). Lo arranca `iniciarSincronizacionNeuronas`.
 */
export function iniciarRedLocalNativa(): () => void {
  let vivo = true;
  const relojes: Array<ReturnType<typeof setInterval>> = [];
  void depsReales()
    .then((deps) => {
      if (!vivo) return;
      const r = crearRedNativa(deps);
      red = r;
      void r.refrescar();
      relojes.push(setInterval(() => void r.refrescar(), 15_000));
      relojes.push(setInterval(() => void r.ticSenales(), 5_000));
    })
    .catch(nadaQueHacer);
  return () => {
    vivo = false;
    for (const t of relojes.splice(0)) clearInterval(t);
    red = null;
  };
}

/** Solo pruebas: fija (o quita) la instancia de la página. */
export function __fijarRedNativaParaPruebas(r: RedNativa | null): void {
  red = r;
}
