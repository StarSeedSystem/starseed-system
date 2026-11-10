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

import { recibirArchivo } from "@/lib/malla/recepcion-sellada";
import { esTextoVoz } from "@/lib/llamadas/voz-datos/paquete";
import { datosHolaArchivoYa, registrarHolaArchivo } from "@/lib/malla/archivo-seguro-real";
import { datosHolaLanas, refrescarLanasSiViejas, registrarLanasVecina } from "@/lib/malla/lanas-propias"; // MTZ1109A
import {
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
  COMANDO_CANAL_RAPIDO_BLE,
  COMANDO_ENVIAR_BLE,
  COMANDO_ESTADO_BLE,
  COMANDO_LIGADO_BLE,
  COMANDO_RECIBIDOS_BLE,
  COMANDO_REGISTRO_ANEXAR_BLE,
  COMANDO_REGISTRO_BLE,
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
import {
  acotarBytes,
  colapsarRepetidas,
  crearRegistroEnlaces,
  lineasPosteriores,
  marcaDeLinea,
  tocaEspejoContinuo,
  unirRegistros,
  type RegistroEnlaces,
  type RegistroNativoBle,
} from "./registro-enlace-ble";
import {
  CLAVE_CANAL_RAPIDO_BLE,
  ESPERA_ESPEJO_REGISTRO_BLE_MS,
  MAX_LINEAS_ESPEJO_BLE,
  T_ESPEJO_REGISTRO_BLE,
  leerEspejoRegistro,
  recortarEspejoRegistro,
  sincronizarCanalRapido,
  textoEspejoRegistro,
} from "./canal-rapido-ajuste"; // BLE1109B
import type { EnlaceDisponible } from "./eleccion-enlace";
import type { CanalArchivos } from "@/lib/network/archivos-malla";

/** (BLE1110A) Espejo continuo del registro: cada tanto, lo nuevo, acotado en bytes y a prioridad mínima. */
const ESPERA_ESPEJO_CONTINUO_BLE_MS = 25_000;
const MAX_BYTES_ESPEJO_BLE = 3_500;
const MAX_DATOS_PARA_ESPEJO_BLE = 4_096;

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
  /** (BLE1108B) Copia líneas del registro del enlace al archivo `enlaces.log` de la app nativa (ausente: solo memoria). */
  anexarRegistro?(lineas: string[]): void;
  /** (LLA1108E) Un `voz.*` de un enlace ligado → la voz por enlace de datos (ya acusó la app y, si cifra, ya viene descifrado). */
  entregarVoz?(texto: string, origen: { neurona: string; enlaceId: string; cifrada: boolean }): void;
  /** (BLE1109B) Avisa a la app nativa de que el enlace quedó ligado por GATT: solo desde ahí puede abrir el canal rápido. */
  marcarLigado?(enlace: string): void;
  /** (BLE1109B) Últimas líneas del registro propio (web + app nativa) para espejarlas al otro lado; ausente: las de la web. */
  registroPropio?(max: number): Promise<string[]> | string[];
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
  /**
   * (LLA1108E) Voz por enlace de datos: encola un `voz.*` en la cola PROPIA de la voz y vuelve al instante (sin
   * esperar el acuse). Si la cola de voz pasa de `MAX_COLA_VOZ_BLE` se tira lo más viejo. «cerrado»: sin enlace.
   */
  enviarVoz(enlace: string, texto: string): "ok" | "descartado" | "cerrado";
  /** (LLA1108E) Bytes de voz esperando salir por ese enlace (la sesión de voz retiene sus tramas mientras haya). */
  colaVozBytes(enlace: string): number;
  /**
   * (LLA1108H) Vídeo ligero de la llamada: cola PROPIA, siempre por detrás de la voz y del control; con tope, lo
   * más viejo se tira (un fotograma viejo no sirve). Sin acuse por fragmento.
   */
  enviarVideo(enlace: string, texto: string): "ok" | "descartado" | "cerrado";
  /** (LLA1108H) Bytes de vídeo esperando salir por ese enlace. */
  colaVideoBytes(enlace: string): number;
  canalArchivos(enlace: string): CanalArchivos;
  /** Lo que llegó por ese enlace (lo no ligado, salvo el saludo, se ignora). */
  recibir(cuerpo: string, enlace: string): Promise<void>;
  /** (WFD1108A) Manda una oferta o respuesta de enlace Wi-Fi a esa neurona, firmada, por Bluetooth. */
  enviarControlEnlace(neurona: string, cuerpo: CuerpoControl): Promise<ResultadoEnvioBle>;
  /** (WFD1108A) Ofertas y respuestas de enlace Wi-Fi que llegan (verificadas) de neuronas ligadas. */
  alControlEnlace(cb: (c: ControlEnlaceWifi, origen: OrigenControl) => void): () => void;
  colaBytes(enlace: string): number;
  /** (BLE1108B) «Registro del enlace»: qué le pasó al enlace con cada neurona y por qué. */
  registro(): RegistroEnlaces;
  instantanea(): InstantaneaBle;
  suscribir(cb: () => void): () => void;
}

/* ══════════════════════════ Motor ══════════════════════════ */

/** Tope de lo encolado en `datos` por enlace: el motor de archivos ve la cola ×4 y frena antes. */
export const MAX_COLA_DATOS_BLE = 1024 * 1024;
/**
 * (LLA1108E) Tope de la cola de VOZ por enlace: ≈ 250 ms de audio ADPCM empaquetado en texto. Más allá se tira lo más
 * viejo (la voz que llega tarde no sirve) y la sesión de voz retiene en su propia cola mientras haya algo aquí.
 */
export const MAX_COLA_VOZ_BLE = 6 * 1024;
/** (LLA1108E) La sesión de voz se considera «ocupada» (retiene tramas) cuando la cola de voz pasa de esto. */
export const UMBRAL_VOZ_OCUPADA_BLE = 2 * 1024;
/** (LLA1108H) Tope de la cola de VÍDEO por enlace (≈ 1,5 s de vídeo ligero). Más allá se tira lo más viejo. */
export const MAX_COLA_VIDEO_BLE = 24 * 1024;
export const FACTOR_FRENO_ARCHIVOS_BLE = 4;
/** (CIF1108A) Espera al acuerdo de sesión antes de devolver el envío como «aún no listo» (el aire BLE es más lento). */
export const ESPERA_SESION_BLE_MS = 4_000;

/** (BLE1108B) Cuánto queda caído un enlace que no acusa recibo, según la racha: 2 s, 5 s y luego 15 s (antes 30 s fijos). */
export const ESCALA_CAIDA_BLE_MS = [2_000, 5_000, 15_000] as const;
export function esperaCaidaBle(racha: number): number {
  return ESCALA_CAIDA_BLE_MS[Math.min(Math.max(1, Math.floor(racha)), ESCALA_CAIDA_BLE_MS.length) - 1];
}
/** (BLE1108B) Si un enlace abierto no se liga, se vuelve a saludar a los 2 s, 5 s y luego cada 15 s (antes: hasta 45 s). */
export const ESCALA_HOLA_BLE_MS = [2_000, 5_000, 15_000, 15_000, 15_000, 15_000] as const;
/** (BLE1108B) El canal de archivos espera «listo» mientras en la cola de datos haya más que esto (contrapresión). */
export const UMBRAL_COLA_LISTA_BLE = 32 * 1024;
/** (BLE1108B) Cuánto espera el canal de archivos a que vuelva un enlace caído antes de devolver el fallo. */
export const ESPERA_ENLACE_BLE_MS = 90_000;
/**
 * (BLE1108C) Con el enlace ARRIBA, el canal de archivos no espera «listo» más de esto: pasado el plazo manda igual
 * y lo anota (`listo-tarde`). La contrapresión nunca bloquea un enlace vivo; solo la ausencia de enlace espera.
 */
export const ESPERA_LISTO_BLE_MS = 500;

const oyentesLigadura = new Set<(neurona: string, enlace: string) => void>();

/**
 * (BLE1108B) Se entera de cada enlace Bluetooth que se LIGA a una neurona (también al reconectar tras una
 * caída). El buzón reintenta al instante lo que esperaba «un medio disponible». Devuelve la baja.
 */
export function alLigarBle(cb: (neurona: string, enlace: string) => void): () => void {
  oyentesLigadura.add(cb);
  return () => {
    oyentesLigadura.delete(cb);
  };
}

interface Item {
  texto: string;
  fin(r: ResultadoEnvioBle): void;
}

interface Cola {
  control: Item[];
  datos: Item[];
  /** (LLA1108E) Voz: cola propia, con tope y sin acuse por trama. */
  voz: Item[];
  /** (LLA1108H) Vídeo ligero: cola propia, la última en turno (detrás de control y voz). */
  vid: Item[];
  bytesVid: number;
  bytesDatos: number;
  bytesVoz: number;
  /** (LLA1108E) Reparto entre voz y archivos: si le tocó a la voz, la próxima vez le toca a los archivos. */
  turnoVoz: boolean;
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
  const canalesNeurona = new Map<string, CanalArchivos>();
  const rachaCaidas: Record<string, number> = {};
  const perdidas = new Map<string, { enlace: string; en: number }>();
  const insistiendo = new Set<string>();
  const registro = crearRegistroEnlaces({
    ahora: () => deps.ahora(),
    alAnotar: (linea) => {
      try {
        deps.anexarRegistro?.([linea]);
      } catch {
        /* el archivo de registro no tumba al enlace */
      }
    },
  });
  const ultimoEspejo: Record<string, number> = {}; // BLE1109B: neurona → última vez que se espejó el registro
  const marcaEspejo: Record<string, { ts: string; vistas: Set<string> }> = {}; // BLE1110A: neurona → hora ISO de la última línea espejada y las de esa misma hora
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
  const neuronaDe = (enlace: string): string | null => ligaduras.find((l) => l.enlace === enlace)?.neurona ?? estado?.enlaces.find((e) => e.id === enlace)?.neurona ?? null;
  const marcarRechazo = (texto: string, neurona: string | null = null, enlace: string | null = null): void => {
    ultimoRechazo = texto;
    registro.anotar("rechazo", neurona, texto, enlace);
  };
  const caido = (enlace: string) => (caidas[enlace] ?? 0) > deps.ahora();

  const cola = (enlace: string): Cola => {
    let c = colas.get(enlace);
    if (!c) {
      c = { control: [], datos: [], voz: [], vid: [], bytesVid: 0, bytesDatos: 0, bytesVoz: 0, turnoVoz: true, bombeando: false, cubeta: null, claveLimites: "", fallos: 0 };
      colas.set(enlace, c);
    }
    return c;
  };

  function fallarTodo(c: Cola, motivo: string): void {
    for (const i of [...c.control.splice(0), ...c.datos.splice(0), ...c.voz.splice(0), ...c.vid.splice(0)]) i.fin({ ok: false, motivo });
    c.bytesDatos = 0;
    c.bytesVoz = 0;
    c.bytesVid = 0;
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
    marcarRechazo(`Enlace Bluetooth con ${lig.nombre} cerrado: ${motivo}`, lig.neurona, lig.enlace);
    registro.anotar("cerrado", lig.neurona, `cerrado por la app (se vuelve a ligar con un saludo nuevo): ${motivo}`, lig.enlace);
    avisar();
  }

  async function bombear(enlace: string): Promise<void> {
    const c = colas.get(enlace);
    if (!c || c.bombeando) return;
    c.bombeando = true;
    try {
      while (c.control.length || c.datos.length || c.voz.length || c.vid.length) {
        if (!abierto(enlace)) {
          fallarTodo(c, "El enlace Bluetooth se cerró (el otro aparato se alejó o apagó el Bluetooth).");
          break;
        }
        // Primero lo de control (chat, acuerdos). Entre voz y archivos, por turnos: ninguno deja sin salida al otro.
        let fuente: Item[];
        if (c.control.length) fuente = c.control;
        else if (c.voz.length && c.datos.length) {
          fuente = c.turnoVoz ? c.voz : c.datos;
          c.turnoVoz = !c.turnoVoz;
        } else if (c.voz.length) fuente = c.voz;
        // (LLA1108H) AUDIO > VÍDEO > todo lo demás: el vídeo sale cuando no hay control ni voz esperando.
        else if (c.vid.length) fuente = c.vid;
        else fuente = c.datos;
        const cuentaBytes = (lista: Item[]) => {
          if (fuente === c.datos) for (const i of lista) c.bytesDatos -= i.texto.length;
          else if (fuente === c.voz) for (const i of lista) c.bytesVoz -= i.texto.length;
          else if (fuente === c.vid) for (const i of lista) c.bytesVid -= i.texto.length;
        };
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
            cuentaBytes([i]);
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
            cuentaBytes([i]);
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
            cuentaBytes(hechos);
            registro.anotar("cifrado", lig.neurona, `${cf.motivo} (${hechos.length} mensaje(s) devueltos)`, enlace);
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
          cuentaBytes(hechos);
          c.fallos = 0;
          rachaCaidas[enlace] = 0;
          for (const i of hechos) i.fin({ ok: true, ms: r.ms });
          continue;
        }
        c.fallos += 1;
        if (c.fallos >= FALLOS_PARA_CAIDA || !abierto(enlace)) {
          const racha = (rachaCaidas[enlace] ?? 0) + 1;
          rachaCaidas[enlace] = racha;
          const espera = esperaCaidaBle(racha);
          caidas[enlace] = deps.ahora() + espera;
          c.fallos = 0;
          const perdidos = c.control.length + c.datos.length + c.voz.length + c.vid.length;
          registro.anotar("caida", neuronaDe(enlace), `sin acuse tras ${FALLOS_PARA_CAIDA} intentos (${r.motivo}); racha ${racha}, se reintenta en ${Math.round(espera / 1000)} s; ${perdidos} mensaje(s) devueltos`, enlace);
          fallarTodo(c, `La otra app no acusa recibo por Bluetooth (${r.motivo}); se reintenta en ${Math.round(espera / 1000)} s.`);
          avisar();
          break;
        }
        await deps.dormir(esperaTrasFallo(c.fallos));
      }
    } finally {
      c.bombeando = false;
    }
  }

  /** (LLA1108E) Voz: sin acuse por trama, con tope; lo que no cabe se tira por el principio (lo más viejo). */
  function encolarVoz(enlace: string, texto: string): "ok" | "descartado" | "cerrado" {
    if (!abierto(enlace) || caido(enlace)) return "cerrado";
    const c = cola(enlace);
    let tiro = false;
    c.voz.push({ texto, fin: nada });
    c.bytesVoz += texto.length;
    while (c.bytesVoz > MAX_COLA_VOZ_BLE && c.voz.length > 1) {
      const viejo = c.voz.shift();
      if (!viejo) break;
      c.bytesVoz -= viejo.texto.length;
      tiro = true;
    }
    void Promise.resolve().then(() => bombear(enlace));
    return tiro ? "descartado" : "ok";
  }

  /** (LLA1108H) Vídeo ligero: cola propia, sin acuse por fragmento y con tope; se tira por el principio (lo más viejo). */
  function encolarVideo(enlace: string, texto: string): "ok" | "descartado" | "cerrado" {
    if (!abierto(enlace) || caido(enlace)) return "cerrado";
    const c = cola(enlace);
    let tiro = false;
    c.vid.push({ texto, fin: nada });
    c.bytesVid += texto.length;
    while (c.bytesVid > MAX_COLA_VIDEO_BLE && c.vid.length > 1) {
      const viejo = c.vid.shift();
      if (!viejo) break;
      c.bytesVid -= viejo.texto.length;
      tiro = true;
    }
    void Promise.resolve().then(() => bombear(enlace));
    return tiro ? "descartado" : "ok";
  }

  function encolar(enlace: string, texto: string): Promise<ResultadoEnvioBle> {
    if (!abierto(enlace)) return Promise.resolve({ ok: false, motivo: "Ese enlace Bluetooth ya no está abierto." });
    if (caido(enlace)) return Promise.resolve({ ok: false, motivo: "Ese aparato no acusa recibo por Bluetooth ahora; se reintenta en unos segundos." });
    const c = cola(enlace);
    return new Promise((fin) => {
      const item: Item = { texto, fin };
      if (texto.startsWith('{"t":"voz.v"')) {
        c.vid.push(item);
        c.bytesVid += texto.length;
      } else if (esTextoVoz(texto)) {
        c.voz.push(item);
        c.bytesVoz += texto.length;
      } else if (claseDeTexto(texto) === "datos" || texto.startsWith(`{"t":"${T_ESPEJO_REGISTRO_BLE}"`)) {
        // BLE1109B: el espejo del registro va con los datos: nunca por delante del saludo ni de los acuses (control).
        c.datos.push(item);
        c.bytesDatos += texto.length;
      } else {
        c.control.push(item);
      }
      void Promise.resolve().then(() => bombear(enlace));
    });
  }

  /**
   * (BLE1108B) El canal de archivos de UN destino: `resolver` dice por qué enlace sale AHORA. El de una
   * neurona ligada sigue a la neurona, no al enlace: si el Bluetooth se cae a mitad de un vídeo y vuelve con
   * otro id («b4» en vez de «b3»), el motor de archivos sigue usando el mismo canal y reanuda en el trozo
   * que no se confirmó. Con acuse (cada trozo cuenta cuando el otro lo recibió) y «listo para enviar».
   */
  function construirCanal(resolver: () => string | null): CanalArchivos {
    const actual = (): string | null => {
      const e = resolver();
      return e && abierto(e) ? e : null;
    };
    const ligadura = (): LigaduraBle | null => {
      const e = resolver();
      return e ? ligaduraDeEnlace(ligaduras, e, deps.ahora()) : null;
    };
    const cabe = (enlace: string, t: string): boolean => !caido(enlace) && cola(enlace).bytesDatos + t.length <= MAX_COLA_DATOS_BLE;
    return {
      enviar: (t) => {
        const enlace = actual();
        if (!enlace || !cabe(enlace, t)) return false;
        void encolar(enlace, t);
        return true;
      },
      enviarConAcuse: async (t) => {
        const enlace = actual();
        if (!enlace || !cabe(enlace, t)) return false;
        return (await encolar(enlace, t)).ok;
      },
      esperarListo: async () => {
        const hasta = deps.ahora() + ESPERA_ENLACE_BLE_MS;
        let arribaDesde: number | null = null;
        for (;;) {
          const enlace = actual();
          const ahora = deps.ahora();
          if (enlace && !caido(enlace)) {
            const enCola = colas.get(enlace)?.bytesDatos ?? 0;
            if (enCola <= UMBRAL_COLA_LISTA_BLE) return true;
            arribaDesde ??= ahora;
            if (ahora - arribaDesde >= ESPERA_LISTO_BLE_MS) {
              registro.anotar("listo-tarde", neuronaDe(enlace), `la cola de datos sigue en ${enCola} B tras ${ahora - arribaDesde} ms: se manda igual`, enlace);
              return true;
            }
            await deps.dormir(25);
            continue;
          }
          arribaDesde = null;
          if (ahora >= hasta) return false;
          await deps.dormir(250);
        }
      },
      enlaceArriba: () => {
        const enlace = actual();
        return !!enlace && !caido(enlace);
      },
      bufferedAmount: () => {
        const enlace = actual();
        return enlace ? (colas.get(enlace)?.bytesDatos ?? 0) * FACTOR_FRENO_ARCHIVOS_BLE : 0;
      },
      // Un trozo que cabe solo, en base64, en una trama Bluetooth (10 KiB con el tope de 16 KiB).
      tamanoTrozo: () => trozoArchivoBle(limitesEfectivos(ligadura())),
      maxTextoBytes: () => maxTextoPorTrama(limitesEfectivos(ligadura())),
      rutaMedida: () => "bluetooth-directo",
      alMensaje: () => nada,
    };
  }

  function canalArchivos(enlace: string): CanalArchivos {
    const lig = ligaduraDeEnlace(ligaduras, enlace, deps.ahora());
    if (lig) {
      let c = canalesNeurona.get(lig.neurona);
      if (!c) {
        const neurona = lig.neurona;
        c = construirCanal(() => ligaduraDeNeuronaBle(ligaduras, neurona, deps.ahora())?.enlace ?? null);
        canalesNeurona.set(neurona, c);
      }
      return c;
    }
    let canal = canales.get(enlace);
    if (!canal) {
      canal = construirCanal(() => enlace);
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
    registro.anotar("hola", para, `saludo firmado ${resp ? "(respuesta)" : "(primero)"}; prueba de cuenta ${cta ? "incluida" : "no disponible"}`, enlace);
    // `webrtc: false`: por Bluetooth no se señaliza WebRTC (sin red IP no conectaría).
    let certificado: CertificadoNeurona | null = null;
    try {
      certificado = (await deps.certificadoPropio?.()) ?? null;
    } catch {
      certificado = null;
    }
    void refrescarLanasSiViejas(); // MTZ1109A: carriles directos propios (órdenes nativas), caché corta; sin esperar: el siguiente saludo ya los lleva
    const arch = datosHolaArchivoYa(); // MPT1108B
    await firmarYEnviar(
      enlace,
      "nl.hola",
      holaNativa({ de: yo, para, limites: limitesPropiosBle(estado), webrtc: false, resp, ts, cta, ...(propio() ? { cif: VERSION_CIFRADO } : {}), certificado, ...arch, ...datosHolaLanas() }),
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
        marcarRechazo(ac.motivo);
        avisar();
      }
      return;
    }
    // (CIF1108A) Gancho de identidad: con certificado y verificador tiene que cuadrar; sin verificador se ignora.
    if (h.certificado) {
      try {
        if (!(await (deps.verificarCertificado ?? verificadorCertificadoPorDefecto)(h.certificado, { neurona: h.de.neurona, huella: v.huella ?? "" }))) {
          marcarRechazo("el certificado de cuenta de esa neurona no es válido");
          avisar();
          return;
        }
      } catch {
        marcarRechazo("no se pudo comprobar el certificado de cuenta");
        avisar();
        return;
      }
    }
    if (ligaduras.some((l) => l.neurona === h.de.neurona && l.huella !== v.huella)) deps.sesiones?.olvidar(h.de.neurona);
    const eraNueva = !ligaduras.some((l) => l.neurona === h.de.neurona && l.enlace === enlace);
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
    registrarHolaArchivo(h.de.neurona, h.ar, h.ep, { certificado: h.certificado, huella: v.huella });
    registrarLanasVecina(h.de.neurona, h.lanas, h.plataforma, { nativo: true }); // MTZ1109A: sus carriles directos (o inferidos si es una app anterior)
    delete caidas[enlace];
    ultimoRechazo = null;
    if (eraNueva) {
      const previa = perdidas.get(h.de.neurona);
      perdidas.delete(h.de.neurona);
      registro.anotar(
        previa ? "reconectado" : "ligado",
        h.de.neurona,
        previa
          ? `enlace nuevo ${enlace} (antes ${previa.enlace}) tras ${Math.round((deps.ahora() - previa.en) / 1000)} s sin enlace${ac.porCuenta ? "; por prueba de cuenta" : ""}`
          : `ligado al saludo firmado${ac.porCuenta ? " (prueba de cuenta)" : " (neurona vinculada)"}${h.cif ? `, cifrado v${h.cif}` : ", sin cifrado"}`,
        enlace,
      );
      for (const f of Array.from(oyentesLigadura)) {
        try {
          f(h.de.neurona, enlace);
        } catch {
          /* un oyente roto no tumba a los demás */
        }
      }
    }
    try {
      deps.marcarLigado?.(enlace); // BLE1109B: el canal rápido solo se abre tras «ligado» por GATT
    } catch {
      /* la marca no tumba al enlace */
    }
    avisar();
    if (!h.resp && deps.ahora() - (ultimoHola[enlace] ?? -Infinity) >= 1000) await saludar(enlace, h.de.neurona, true);
    if (eraNueva) void espejarRegistro(enlace, h.de.neurona);
  }

  /**
   * (BLE1109B) Manda al otro lado las últimas 50 líneas de MI registro, para que el suyo muestre «(nombre) …» y
   * el problema se vea desde cualquiera de los dos aparatos. Va por la cola de datos, como mucho una vez cada
   * 30 s por neurona, y un aparato anterior lo ignora (mensaje desconocido).
   */
  async function espejarRegistro(enlace: string, neurona: string, continuo = false): Promise<void> {
    const ahora = deps.ahora();
    if (ahora - (ultimoEspejo[neurona] ?? -Infinity) < (continuo ? ESPERA_ESPEJO_CONTINUO_BLE_MS : ESPERA_ESPEJO_REGISTRO_BLE_MS)) return;
    if (continuo) {
      // BLE1110A: espejo continuo = prioridad mínima. Nunca con voz o vídeo en cola ni con un montón de datos esperando.
      const c = colas.get(enlace);
      if (!tocaEspejoContinuo({ ahora, ultimo: ultimoEspejo[neurona], cadaMs: ESPERA_ESPEJO_CONTINUO_BLE_MS, bytesVoz: c?.bytesVoz ?? 0, bytesVideo: c?.bytesVid ?? 0, bytesDatos: c?.bytesDatos ?? 0, maxDatos: MAX_DATOS_PARA_ESPEJO_BLE })) return;
    }
    ultimoEspejo[neurona] = ahora;
    try {
      // BLE1110A: solo lo NUEVO desde el último espejo (la primera vez, las últimas 50), con las repetidas colapsadas «… (×N)» y acotado en bytes.
      const crudas = deps.registroPropio ? await deps.registroPropio(continuo ? 200 : MAX_LINEAS_ESPEJO_BLE) : registro.exportar().split("\n");
      const nuevas = lineasPosteriores(crudas.filter((x) => typeof x === "string" && x.trim().length > 0), marcaEspejo[neurona]?.ts ?? null, marcaEspejo[neurona]?.vistas);
      if (!nuevas.length) return;
      const lineas = acotarBytes(recortarEspejoRegistro(colapsarRepetidas(nuevas)), MAX_BYTES_ESPEJO_BLE);
      if (!lineas.length || !abierto(enlace) || caido(enlace)) return;
      const ultimaMarca = marcaDeLinea(nuevas[nuevas.length - 1]);
      if (ultimaMarca) marcaEspejo[neurona] = { ts: ultimaMarca, vistas: new Set(nuevas.filter((x) => marcaDeLinea(x) === ultimaMarca)) };
      void encolar(enlace, textoEspejoRegistro(lineas));
    } catch {
      /* el espejo es un lujo de diagnóstico: nunca molesta al enlace */
    }
  }

  /** (BLE1110A) El espejo sigue mientras el enlace está ligado: cada ~25 s, lo nuevo de cada lado (la web lo llama desde el refresco de 15 s). */
  function espejarLigados(): void {
    for (const lg of ligaduras) void espejarRegistro(lg.enlace, lg.neurona, true);
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
      marcarRechazo(`Acuerdo de cifrado con ${lig.nombre} rechazado: ${r.motivo}`);
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
        marcarRechazo(`Trama cifrada de ${lig.nombre} con una sesión desconocida; se acuerda otra.`);
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
      marcarRechazo(`Trama sin cifrar de ${lig.nombre}, que cifra o debe cifrar: descartada.`);
      avisar();
      return;
    }
    if (cuerpo.startsWith(`{"t":"${T_OFERTA_WIFI}"`) || cuerpo.startsWith(`{"t":"${T_RESPUESTA_WIFI}"`)) return recibirControl(cuerpo, enlace);
    try {
      if (cuerpo.startsWith('{"t":"tu.')) {
        deps.entregarTransporte(cuerpo, { enlaceId: idEnlaceBle(enlace), etiqueta: `${lig.nombre} · Bluetooth`, ...(lig.sync ? { syncDeviceId: lig.sync } : {}) });
      } else if (cuerpo.startsWith('{"t":"archivo.')) {
        deps.entregarArchivo(canalArchivos(enlace), cuerpo, `${lig.nombre} (Bluetooth directo · app nativa)`, { huella: lig.huella, ...(lig.porCuenta ? { porCuenta: true } : {}) });
      } else if (cuerpo.startsWith(`{"t":"${T_ESPEJO_REGISTRO_BLE}"`)) {
        // BLE1109B: el registro del otro aparato, línea a línea, marcado con su nombre; solo de la neurona ligada.
        const l = leerEspejoRegistro(cuerpo);
        if (l) deps.anexarRegistro?.(l.map((x) => `(${lig.nombre}) ${x}`));
      } else if (esTextoVoz(cuerpo)) {
        // (LLA1108E) Voz por enlace de datos: solo de la neurona ligada a este enlace, y cifrada si el enlace cifra.
        deps.entregarVoz?.(cuerpo, { neurona: lig.neurona, enlaceId: idEnlaceBle(enlace), cifrada: modoDe(lig) === "cifrado" });
      }
    } catch {
      /* un oyente roto no tumba el enlace */
    }
  }

  function fijarEstado(e: EstadoBleNativo | null): void {
    const previos = new Map((estado?.enlaces ?? []).map((x) => [x.id, x]));
    estado = e;
    const abiertos = new Set((e?.enlaces ?? []).map((x) => x.id));
    // (BLE1108B) Lo que se fue: apunta por qué hace falta saber (neurona, lo que quedó en cola) y se acuerda
    // para decir «reconectado» cuando vuelva.
    for (const [id, antes] of previos) {
      if (abiertos.has(id)) continue;
      const lig = ligaduras.find((l) => l.enlace === id);
      const c = colas.get(id);
      const enCola = c ? c.control.length + c.datos.length : 0;
      const neurona = lig?.neurona ?? antes.neurona ?? null;
      registro.anotar("perdido", neurona, `el enlace se cerró${lig ? "" : " sin llegar a ligarse"} (abierto ${Math.round(antes.abierto_hace_ms / 1000)} s, rol ${antes.rol}, ${antes.bytes_enviados} B enviados / ${antes.bytes_recibidos} B recibidos${enCola ? `, ${enCola} mensaje(s) sin enviar devueltos` : ""})`, id);
      if (neurona) perdidas.set(neurona, { enlace: id, en: deps.ahora() });
      delete rachaCaidas[id];
    }
    // (BLE1109A) Cambio de carril de un enlace que sigue abierto: solo se apunta; el enlace y la ligadura no se tocan.
    for (const x of e?.enlaces ?? []) {
      const antes = previos.get(x.id);
      if (!antes || (antes.carril ?? "gatt") === (x.carril ?? "gatt")) continue;
      const rapido = x.carril === "rapido";
      registro.anotar("canal-rapido", x.neurona ?? antes.neurona ?? null, rapido ? `canal rápido L2CAP abierto (psm ${x.psm ?? "?"}, ${x.kbps_rapido ?? "sin medir"} kb/s)` : `canal rápido cerrado: sigue por GATT (${x.kbps_gatt ?? "sin medir"} kb/s)`, x.id);
    }
    for (const x of e?.enlaces ?? []) {
      if (previos.has(x.id)) continue;
      registro.anotar("abierto", x.neurona ?? null, `enlace ${x.rol} abierto (paquete ${x.paquete} B, ${x.rssi ?? "?"} dBm); a saludar`, x.id);
      void insistirHola(x.id).catch(nada);
    }
    ligaduras = podarLigadurasBle(ligaduras, abiertos, deps.ahora());
    for (const [enlace, c] of Array.from(colas)) {
      if (!abiertos.has(enlace)) {
        fallarTodo(c, "El enlace Bluetooth se cerró (el otro aparato se alejó o apagó el Bluetooth).");
        colas.delete(enlace);
        canales.delete(enlace);
      }
    }
  }

  /** (BLE1108B) Un enlace abierto que no se liga se vuelve a saludar a los 2 s, 5 s y luego cada 15 s. */
  async function insistirHola(enlace: string): Promise<void> {
    if (insistiendo.has(enlace)) return;
    insistiendo.add(enlace);
    try {
      for (const ms of ESCALA_HOLA_BLE_MS) {
        await deps.dormir(ms);
        if (!abierto(enlace) || ligaduraDeEnlace(ligaduras, enlace, deps.ahora())) return;
        delete ultimoHola[enlace];
        registro.anotar("reintento", estado?.enlaces.find((x) => x.id === enlace)?.neurona ?? null, `el enlace sigue sin ligar tras ${Math.round(ms / 1000)} s: se vuelve a saludar`, enlace);
        await saludarPendientes().catch(nada);
      }
    } finally {
      insistiendo.delete(enlace);
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
    espejarLigados(); // BLE1110A
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
    enviarVoz: (enlace, texto) => encolarVoz(enlace, texto),
    colaVozBytes: (enlace) => colas.get(enlace)?.bytesVoz ?? 0,
    enviarVideo: (enlace, texto) => encolarVideo(enlace, texto),
    colaVideoBytes: (enlace) => colas.get(enlace)?.bytesVid ?? 0,
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
    registro: () => registro,
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
  const pendientesLog: string[] = [];
  let temporizadorLog: ReturnType<typeof setTimeout> | null = null;
  // (OFF1108A) Sin carrera de arranque en frío: antes de saludar se espera (máx. 3 s) a la clave de faro de la
  // app y al espejo de la instantánea (neuronas de la cuenta y huellas ya probadas), que no dependen de internet.
  const espejo = await import("@/lib/sin-internet/huellas-cuenta-vivas");
  await Promise.race([Promise.all([leerConfig().catch(nada), espejo.cargarEspejo().catch(nada)]), new Promise((r) => setTimeout(r, 3_000))]);
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
    // (OFF1108A) Los vínculos del aparato + las neuronas de la cuenta ya probadas (huella guardada): sin servidor.
    vinculos: () => {
      const reales = motor.instantanea().vinculos;
      const guardados = espejo.vinculosDeCuentaCacheados();
      if (!guardados.length) return reales;
      const vistos = new Set(reales.map((v) => v.neurona));
      return [...reales, ...guardados.filter((v) => !vistos.has(v.neurona))];
    },
    neuronasCuenta: () => Array.from(new Set([...config.conocidas, ...espejo.idsNeuronasCuentaCacheados()])),
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
    entregarVoz: (texto, origen) => {
      void import("@/lib/llamadas/voz-datos/hub")
        .then((h) => h.publicarVozEntrante(texto, { tipo: "ble", ...origen }))
        .catch(nada);
    },
    entregarArchivo: (canal, texto, etiquetaOrigen, quien) => {
      void import("@/lib/network/archivos-malla")
        .then((am) =>
          recibirArchivo(am.motorArchivosCompartido(), canal, texto, { // MPT1108B: abre el cifrado de archivo
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
    marcarLigado: (enlace) => {
      void puenteNativo().llamar(COMANDO_LIGADO_BLE, { enlace }).catch(nada); // BLE1109B
    },
    registroPropio: async (max) => {
      // BLE1109B: lo de la web y lo de la app nativa, unido por tiempo; los espejos recibidos «(nombre) …» no se reenvían.
      const web = red?.registro().lista() ?? [];
      let nativos: RegistroNativoBle[] = [];
      try {
        const r = await puenteNativo().llamar<RegistroNativoBle[]>(COMANDO_REGISTRO_BLE);
        if (r.ok && Array.isArray(r.valor)) nativos = r.valor;
      } catch {
        /* solo lo de la web */
      }
      return unirRegistros(web, nativos).filter((x) => !x.startsWith("(")).slice(-max);
    },
    anexarRegistro: (lineas) => {
      pendientesLog.push(...lineas);
      if (temporizadorLog) return;
      temporizadorLog = setTimeout(() => {
        temporizadorLog = null;
        // BLE1110A: líneas idénticas seguidas → una con «… (×N)» (las 68 «autocuración» del 09-11 ya no empujan lo útil fuera).
        const l = colapsarRepetidas(pendientesLog.splice(0, 200)).slice(-60);
        if (l.length) void puenteNativo().llamar(COMANDO_REGISTRO_ANEXAR_BLE, { lineas: l }).catch(nada);
      }, 2_000);
    },
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
      // BLE1109B: migra el ajuste del canal rápido (versiones anteriores: apagado) antes de que el Bluetooth cuente con él.
      void sincronizarCanalRapido({
        leer: () => globalThis.localStorage?.getItem(CLAVE_CANAL_RAPIDO_BLE) ?? null,
        escribir: (v) => globalThis.localStorage?.setItem(CLAVE_CANAL_RAPIDO_BLE, v),
        nativo: async (activo) => {
          const x = await p.llamar<boolean>(COMANDO_CANAL_RAPIDO_BLE, activo === undefined ? {} : { activo });
          return x.ok && typeof x.valor === "boolean" ? x.valor : null;
        },
      }).catch(nada);
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
