"use client";

/**
 * enlace-wifi-motor — ejecuta la negociación del enlace Wi-Fi directo (2026-11-08 · WFD1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/wifi-directo.md`. Lo puro (mensajes, roles, máquina de estados, decisiones)
 * está en `enlace-wifi-directo.ts` y `enlace-wifi-orquestacion.ts`; aquí se firma, se cifra, se manda,
 * se recibe y se habla con la parte nativa (`enlace_wifi_*` de `native/src-tauri/src/enlace_wifi.rs`),
 * con TODO lo del mundo inyectado (las pruebas montan dos neuronas en memoria).
 *
 *   · CONTROL por cualquier enlace: primero las vías registradas con `registrarViaControlWifi` (Bluetooth
 *     LE de BLE1108A: la que prueba que la otra neurona está al lado) y, si no, el transporte universal
 *     (canal `enlace-wifi`: red local nativa, malla de la cuenta, vínculo o relé cifrado). Quien entregue
 *     un `enlace.wifi.*` llama a `recibirControlWifi(texto, origen)`.
 *   · Cada mensaje va FIRMADO (sobre v2 con instante y nonce, guarda contra repeticiones) y solo se acepta
 *     de una neurona vinculada con esa huella, ligada por el canal local, o de la malla de la cuenta.
 *   · Las credenciales viajan CIFRADAS para la clave pública del otro (`recipient-crypto.ts`, v3). En el
 *     estado y en la interfaz solo está el SSID; la contraseña vive en memoria lo justo para unirse (y en
 *     la vía guiada del Mac, en pantalla para la persona de ESTE aparato).
 *   · Una vez dentro: pista a la red nativa («esa neurona está en esa IP») para que el saludo firmado y el
 *     canal TCP 47071 se encuentren al instante; el faro (difusión + respuesta directa de MLL1107A) lo
 *     confirma solo. Sin uso en 5 minutos, se cierra y el Mac vuelve a su red.
 */

import { useSyncExternalStore } from "react";
import {
  CANAL_CONTROL_WIFI,
  PUERTO_CANAL_WIFI,
  SIN_CAPACIDADES,
  WIFI_INICIAL,
  claveValida,
  enCable,
  leerCable,
  leerCapacidades,
  leerCredenciales,
  leerMensajeWifi,
  ipPrivada,
  ocupada,
  pasoWifi,
  remitenteDeConfianza,
  soyAp,
  ssidValido,
  type AccionWifi,
  type AjusteWifiDirecto,
  type BandaWifi,
  type CapacidadesWifi,
  type ClaseNecesidad,
  type CredencialesWifi,
  type EstadoWifi,
  type EventoWifi,
  type MensajeWifi,
  type MetodoAp,
  type MetodoCliente,
  type MotivoCierre,
  type Propio,
  type SobreCifradoWifi,
} from "./enlace-wifi-directo";
import {
  AJUSTE_WIFI_POR_DEFECTO,
  CLAVE_AJUSTE_WIFI,
  decidirEnlaceWifi,
  enlaceWifiDe,
  esEnlaceWifiDirecto,
  fijarEnlacesWifi,
  kbpsSupuesto,
  leerAjusteWifi,
  type Decision,
  type TipoEnlaceActual,
} from "./enlace-wifi-orquestacion";

import { CLAVE_DEFECTOS_ANTENAS, ajusteWifiPorDefecto, leerMarca, marcarExplicito, serializarMarca } from "./defectos-antenas";

/* ══════════════════════════ Parte nativa ══════════════════════════ */

export type CodigoNativo = "permiso-denegado" | "sin-soporte" | "fallo-nativo" | "no-encontrada";

/** Lo que dice la parte nativa (`EstadoEnlaceWifi` de enlace_wifi_logica.rs). Nunca lleva la contraseña. */
export interface EstadoNativoWifi {
  sesion: string | null;
  /** inactivo | abriendo | red-lista | uniendo | guiado | unida | cerrando | cerrado | error */
  fase: string;
  rol: string | null;
  metodo: string | null;
  ssid: string | null;
  ip_propia: string | null;
  ip_ap: string | null;
  banda: string | null;
  mbps: number | null;
  codigo: string | null;
  mensaje: string;
  red_anterior: string | null;
  t: number;
}

export interface CredencialesNativas {
  ssid: string;
  clave: string;
  banda: string | null;
  ip: string | null;
}

export interface ResultadoNativo {
  ok: boolean;
  motivo?: string;
  codigo?: CodigoNativo;
  /** El cliente no puede unirse solo: la persona se une a mano (Mac sin permiso de Ubicación…). */
  guiado?: boolean;
}

export interface NativoWifi {
  capacidades(): Promise<CapacidadesWifi | null>;
  pedirPermiso(): Promise<CapacidadesWifi | null>;
  abrirAp(sesion: string, metodo: MetodoAp): Promise<ResultadoNativo>;
  credenciales(sesion: string): Promise<CredencialesNativas | null>;
  unirse(sesion: string, metodo: MetodoCliente, cred: CredencialesWifi): Promise<ResultadoNativo>;
  estado(): Promise<EstadoNativoWifi | null>;
  cerrar(sesion: string): Promise<void>;
  /** ¿Se llega al canal TCP del otro por la red nueva? Con la IP local que usaría esta app. */
  comprobar(ip: string, puerto: number): Promise<{ alcanzable: boolean; ipLocal: string | null }>;
  alCambiar?(cb: () => void): Promise<() => void>;
}

/** Normaliza el código nativo (lo desconocido es un fallo nativo). */
export function codigoNativo(x: unknown): CodigoNativo {
  return x === "permiso-denegado" || x === "sin-soporte" || x === "no-encontrada" ? x : "fallo-nativo";
}

/* ══════════════════════════ Vías de control (Bluetooth LE, BLE1108A) ══════════════════════════ */

export interface ViaControlWifi {
  /** «ble», «nfc»… */
  id: string;
  /** Prueba de proximidad física (Bluetooth LE): con ella se puede proponer o abrir solo. */
  cercana: boolean;
  alcanza(neurona: string): boolean;
  /** Manda el texto del cable a esa neurona; true si salió. */
  enviar(neurona: string, texto: string): Promise<boolean>;
  /** Ancho medido de esa vía hacia esa neurona (kb/s), si se conoce. */
  kbps?(neurona: string): number | null;
  /**
   * (INT1108C) Neuronas que esta vía ya identificó (saludo firmado con esa huella + prueba de cuenta o
   * vínculo, como el canal local): sus mensajes de control son de confianza. Bluetooth directo: sus ligaduras.
   */
  ligaduras?(): Array<{ neurona: string; huella: string }>;
}

/* ══════════════════════════ Dependencias ══════════════════════════ */

export interface OrigenControl {
  /** Tipo del enlace por el que llegó («ble», «nativo», «cuenta», «rele»…). */
  tipo?: string;
  enlaceId?: string;
}

export interface DepsMotorWifi {
  ahora(): number;
  nuevaSesion(): string;
  yo(): Promise<{ neurona: string; nombre: string } | null>;
  epubPropia(): Promise<JsonWebKey | null>;
  ajuste(): AjusteWifiDirecto;
  firmar(cuerpo: unknown): Promise<unknown | null>;
  verificar(sobre: unknown): Promise<{ cuerpo: unknown; huella?: string; valido: boolean }>;
  cifrarPara(epub: JsonWebKey, obj: unknown): Promise<SobreCifradoWifi | null>;
  descifrar(sobre: SobreCifradoWifi): Promise<unknown | null>;
  confiable(de: string, huella: string | undefined, origen: OrigenControl | null): boolean;
  /** Manda el cable por el transporte universal (las vías registradas se prueban antes). */
  enviarTransporte(para: string, cable: unknown): Promise<{ ok: boolean; motivo?: string }>;
  nativo: NativoWifi;
  /** Una vez dentro: «esa neurona está en esa IP» para la red nativa (saludo inmediato). */
  alActivo?(p: { neurona: string; ipOtro: string | null }): void;
  /** El enlace con esa neurona dejó de estar activo (se olvida la pista). */
  alCerrado?(neurona: string): void;
  /** ¿Hay tráfico ahora con esa neurona por la red directa? (cola del canal nativo, archivos…). */
  trafico?(neurona: string, ipOtro: string | null): boolean;
}

/* ══════════════════════════ Instantánea para la interfaz ══════════════════════════ */

export interface InstantaneaWifi {
  estado: EstadoWifi;
  capPropia: CapacidadesWifi | null;
  /** «Preguntar» de ESTE lado: un envío pesado propone abrir el enlace. */
  propuesta: { neurona: string; nombre: string | null; clase: ClaseNecesidad; motivo: string; aviso?: string; bytes?: number } | null;
  /** La otra neurona pide abrirlo (con «Preguntar» aquí). */
  pregunta: { sesion: string; otro: string; nombreOtro: string | null; clase: ClaseNecesidad } | null;
  /** Mac sin unión programática: la persona se une a mano a esta red (solo en ESTE aparato). */
  guiado: { ssid: string; clave: string; ipAp: string | null } | null;
  /** Último «se sigue por el enlace de antes» y por qué. */
  ultimoRespaldo: string | null;
  /** Último fallo por neurona (epoch ms). */
  fallos: Record<string, number>;
  nativo: EstadoNativoWifi | null;
  /** La radio del Mac sale de su red mientras dura (aviso). */
  avisoRadio: string | null;
}

export interface MotorWifi {
  /** Abre (ofrece) el enlace a esa neurona. */
  abrir(otro: string, clase: ClaseNecesidad, nombreOtro?: string | null): Promise<{ ok: boolean; motivo?: string }>;
  recibir(cable: unknown, origen?: OrigenControl | null): Promise<void>;
  decidirPersona(acepta: boolean): Promise<void>;
  /** Acepta o descarta la propuesta de ESTE lado. */
  resolverPropuesta(abrir: boolean): Promise<void>;
  cerrar(motivo?: MotivoCierre): Promise<void>;
  tic(): Promise<void>;
  uso(): void;
  /** Un envío pesado: decide abrir, proponer o nada. */
  necesitaAncho(p: { neurona: string; nombre?: string | null; clase: ClaseNecesidad; bytes?: number; enlaceActual: { tipo: TipoEnlaceActual; kbps: number | null }; cerca: boolean }): Promise<Decision>;
  /** Retiene el enlace mientras el flujo (llamada, pantalla) tenga pistas vivas. */
  retenerFlujo(neurona: string, flujo: { getTracks(): Array<{ readyState: string }> }): void;
  capacidades(refrescar?: boolean): Promise<CapacidadesWifi | null>;
  pedirPermiso(): Promise<CapacidadesWifi | null>;
  instantanea(): InstantaneaWifi;
  suscribir(cb: () => void): () => void;
}

const nada = () => undefined;
/** Las credenciales valen esto como mucho (la red se cierra antes por inactividad). */
const VIDA_CREDENCIALES_MS = 30 * 60_000;

export function crearMotorWifi(deps: DepsMotorWifi, vias: () => ViaControlWifi[] = () => []): MotorWifi {
  let estado: EstadoWifi = { ...WIFI_INICIAL };
  let capPropia: CapacidadesWifi | null = null;
  let capLeida = -Infinity;
  let propuesta: InstantaneaWifi["propuesta"] = null;
  let pregunta: InstantaneaWifi["pregunta"] = null;
  let guiado: InstantaneaWifi["guiado"] = null;
  let ultimoRespaldo: string | null = null;
  let nativo: EstadoNativoWifi | null = null;
  const fallos: Record<string, number> = {};
  const flujos = new Map<string, Array<{ getTracks(): Array<{ readyState: string }> }>>();
  const oyentes = new Set<() => void>();
  let foto: InstantaneaWifi | null = null;
  let cola: Promise<void> = Promise.resolve();
  /** Credenciales que este cliente está usando (en memoria, solo para unirse). */
  let credCliente: CredencialesWifi | null = null;
  let pidiendoCred = false;

  const avisar = () => {
    foto = null;
    for (const f of Array.from(oyentes)) {
      try {
        f();
      } catch {
        /* un oyente roto no tumba a los demás */
      }
    }
  };

  /** Todo pasa en orden: un evento a la vez (las acciones nativas son asíncronas). */
  function enCola<T>(f: () => Promise<T>): Promise<T> {
    const r = cola.then(f, f);
    cola = r.then(nada, nada);
    return r;
  }

  async function capacidades(refrescar = false): Promise<CapacidadesWifi | null> {
    if (!refrescar && deps.ahora() - capLeida < 60_000) return capPropia;
    try {
      capPropia = await deps.nativo.capacidades();
    } catch {
      capPropia = null;
    }
    fijarDefectoWifi(capPropia);
    capLeida = deps.ahora();
    return capPropia;
  }

  async function propio(): Promise<Propio | null> {
    const [yo, epub, cap] = await Promise.all([deps.yo(), deps.epubPropia(), capacidades()]);
    if (!yo || !epub) return null;
    return { neurona: yo.neurona, nombre: yo.nombre, cap: cap ?? SIN_CAPACIDADES, epub };
  }

  let activoCon: string | null = null;

  function publicarRegistro(): void {
    const ahoraCon = estado.fase === "activo" ? estado.otro : null;
    if (activoCon && activoCon !== ahoraCon) {
      try {
        deps.alCerrado?.(activoCon);
      } catch {
        /* la red nativa olvida la pista sola al caducar */
      }
    }
    activoCon = ahoraCon;
    if (estado.fase === "activo" && estado.otro) {
      fijarEnlacesWifi([
        {
          neurona: estado.otro,
          nombre: estado.nombreOtro,
          ipOtro: estado.ipOtro,
          ipPropia: estado.ipPropia,
          ssid: estado.red?.ssid ?? null,
          metodo: estado.red?.metodo ?? estado.roles?.metodoAp ?? null,
          soyAp: soyAp(estado),
          mbps: estado.mbps ?? nativo?.mbps ?? null,
          desde: estado.desde,
        },
      ]);
    } else {
      fijarEnlacesWifi([]);
    }
  }

  async function mandar(msg: MensajeWifi): Promise<{ ok: boolean; motivo?: string }> {
    const sobre = await deps.firmar(msg);
    if (!sobre) return { ok: false, motivo: "no se pudo firmar con la identidad de malla" };
    const cable = enCable(msg.t, sobre);
    const texto = JSON.stringify(cable);
    // Primero una vía registrada que llegue (Bluetooth LE: la más cercana), después el transporte universal.
    const lista = vias().filter((v) => {
      try {
        return v.alcanza(msg.para);
      } catch {
        return false;
      }
    });
    lista.sort((a, b) => Number(b.cercana) - Number(a.cercana));
    for (const v of lista) {
      try {
        if (await v.enviar(msg.para, texto)) return { ok: true };
      } catch {
        /* se prueba la siguiente */
      }
    }
    try {
      return await deps.enviarTransporte(msg.para, cable);
    } catch {
      return { ok: false, motivo: "el transporte no respondió" };
    }
  }

  async function ejecutar(a: AccionWifi): Promise<void> {
    switch (a.a) {
      case "enviar": {
        const r = await mandar(a.msg);
        // Sin camino para la oferta: no se espera 15 s a nadie (nada nativo arrancó todavía).
        if (!r.ok && a.msg.t === "enlace.wifi.oferta" && estado.fase === "ofreciendo") {
          const texto = `no hay ningún camino para hablar con esa neurona (${r.motivo ?? "sin enlace"})`;
          estado = { ...estado, fase: "fallido", vence: null, motivo: texto, codigo: "no-encontrada" };
          ultimoRespaldo = `Enlace Wi-Fi directo: ${texto}. Se sigue por el enlace de antes.`;
          if (estado.otro) fallos[estado.otro] = deps.ahora();
        }
        return;
      }
      case "enviar-credenciales": {
        const sobre = await deps.cifrarPara(a.epub, a.cred);
        if (!sobre) {
          await paso({ t: "error-nativo", ahora: deps.ahora(), codigo: "fallo-nativo", texto: "no se pudieron cifrar las credenciales para la otra neurona" }, true);
          return;
        }
        const r = await mandar({ t: "enlace.wifi.listo", v: 1, sesion: a.sesion, de: estado.yo ?? "", para: a.para, ts: deps.ahora(), fase: "red", cred: sobre });
        if (!r.ok) await paso({ t: "error-nativo", ahora: deps.ahora(), codigo: "no-encontrada", texto: `las credenciales no llegaron a la otra neurona (${r.motivo ?? "sin enlace"})` }, true);
        return;
      }
      case "abrir-ap": {
        let r: ResultadoNativo;
        try {
          r = await deps.nativo.abrirAp(a.sesion, a.metodo);
        } catch {
          r = { ok: false, codigo: "fallo-nativo", motivo: "la app nativa no respondió" };
        }
        if (!r.ok) await paso({ t: "error-nativo", ahora: deps.ahora(), codigo: r.codigo ?? "fallo-nativo", texto: r.motivo ?? "" }, true);
        return;
      }
      case "unirse": {
        credCliente = a.cred;
        let r: ResultadoNativo;
        try {
          r = await deps.nativo.unirse(a.sesion, a.metodo, a.cred);
        } catch {
          r = { ok: false, codigo: "fallo-nativo", motivo: "la app nativa no respondió" };
        }
        if (r.ok && (r.guiado || a.metodo === "guiado")) guiado = { ssid: a.cred.ssid, clave: a.cred.clave, ipAp: a.cred.ipAp };
        if (!r.ok) await paso({ t: "error-nativo", ahora: deps.ahora(), codigo: r.codigo ?? "fallo-nativo", texto: r.motivo ?? "" }, true);
        return;
      }
      case "cerrar-nativo":
        credCliente = null;
        guiado = null;
        try {
          await deps.nativo.cerrar(a.sesion);
        } catch {
          /* la parte nativa cierra sola al caducar */
        }
        return;
      case "preguntar-persona":
        pregunta = { sesion: a.sesion, otro: a.otro, nombreOtro: a.nombreOtro, clase: a.clase };
        return;
      case "activo":
        guiado = null;
        credCliente = null;
        try {
          deps.alActivo?.({ neurona: estado.otro ?? "", ipOtro: estado.ipOtro });
        } catch {
          /* la pista es una ayuda: el faro lo encuentra igual */
        }
        return;
      case "respaldo":
        ultimoRespaldo = a.motivo;
        if (estado.otro) fallos[estado.otro] = deps.ahora();
        return;
    }
  }

  /** Da un paso a la máquina y ejecuta sus acciones. `dentro`: ya se está en la cola. */
  async function paso(ev: EventoWifi, dentro = false): Promise<void> {
    const hacer = async () => {
      const r = pasoWifi(estado, ev);
      const cambio = r.estado !== estado;
      estado = r.estado;
      if (estado.fase !== "decidiendo") pregunta = null;
      for (const a of r.acciones) await ejecutar(a);
      if (cambio || r.acciones.length) {
        publicarRegistro();
        avisar();
      }
    };
    if (dentro) return hacer();
    return enCola(hacer);
  }

  /** Lo que dice la parte nativa, convertido en eventos de la máquina. */
  async function mirarNativo(): Promise<void> {
    const fasesNativas = ["abriendo-red", "esperando-union", "uniendo", "activo"];
    if (!fasesNativas.includes(estado.fase) || !estado.sesion) return;
    let n: EstadoNativoWifi | null = null;
    try {
      n = await deps.nativo.estado();
    } catch {
      n = null;
    }
    const antes = JSON.stringify(nativo);
    nativo = n;
    if (JSON.stringify(n) !== antes) avisar();
    const ahora = deps.ahora();
    const mia = !!n && n.sesion === estado.sesion;
    if (mia && n && n.fase === "error") {
      await paso({ t: "error-nativo", ahora, codigo: codigoNativo(n.codigo), texto: n.mensaje }, true);
      return;
    }
    if (estado.fase === "abriendo-red" && mia && n && n.fase === "red-lista" && !pidiendoCred) {
      pidiendoCred = true;
      try {
        const c = await deps.nativo.credenciales(estado.sesion);
        if (c && ssidValido(c.ssid) && claveValida(c.clave)) {
          const banda: BandaWifi | null = c.banda === "2.4" || c.banda === "5" || c.banda === "6" ? c.banda : null;
          const cred: CredencialesWifi = {
            ssid: c.ssid,
            clave: c.clave,
            banda,
            ipAp: ipPrivada(c.ip) ?? ipPrivada(n.ip_ap),
            puerto: PUERTO_CANAL_WIFI,
            metodo: estado.roles?.metodoAp ?? "hotspot-local",
            caduca: ahora + VIDA_CREDENCIALES_MS,
          };
          await paso({ t: "red-lista", ahora, cred }, true);
        } else {
          await paso({ t: "error-nativo", ahora, codigo: "fallo-nativo", texto: "la red se levantó pero el sistema no dio su nombre o su contraseña" }, true);
        }
      } finally {
        pidiendoCred = false;
      }
      return;
    }
    if (estado.fase === "uniendo") {
      if (mia && n && n.fase === "unida") {
        await paso({ t: "unida", ahora, ipPropia: ipPrivada(n.ip_propia), mbps: n.mbps }, true);
        return;
      }
      // Vía guiada (o el sistema aún no lo dice): si ya se llega al canal del otro, está dentro.
      const ipAp = estado.ipOtro ?? credCliente?.ipAp ?? null;
      if (ipAp && (guiado || (mia && n && (n.fase === "guiado" || n.fase === "uniendo")))) {
        try {
          const c = await deps.nativo.comprobar(ipAp, PUERTO_CANAL_WIFI);
          if (c.alcanzable) await paso({ t: "unida", ahora, ipPropia: ipPrivada(c.ipLocal), mbps: n?.mbps ?? null }, true);
        } catch {
          /* se vuelve a mirar en el siguiente tic */
        }
      }
      return;
    }
    if (estado.fase === "activo" && mia && n && n.fase === "cerrado") {
      await paso({ t: "error-nativo", ahora, codigo: "no-encontrada", texto: "el sistema cerró la red directa" }, true);
      return;
    }
    if (estado.fase === "activo" && n && typeof n.mbps === "number" && n.mbps > 0 && n.mbps !== estado.mbps && mia) {
      estado = { ...estado, mbps: Math.round(n.mbps) };
      publicarRegistro();
      avisar();
    }
  }

  function hayFlujoVivo(neurona: string): boolean {
    const l = (flujos.get(neurona) ?? []).filter((f) => {
      try {
        return f.getTracks().some((t) => t.readyState === "live");
      } catch {
        return false;
      }
    });
    if (l.length) flujos.set(neurona, l);
    else flujos.delete(neurona);
    return l.length > 0;
  }

  async function tic(): Promise<void> {
    return enCola(async () => {
      const ahora = deps.ahora();
      if (estado.fase === "activo" && estado.otro) {
        let usa = hayFlujoVivo(estado.otro);
        try {
          usa = usa || !!deps.trafico?.(estado.otro, estado.ipOtro);
        } catch {
          /* sin medida de tráfico */
        }
        if (usa) estado = { ...estado, ultimoUso: ahora };
      }
      await paso({ t: "tic", ahora }, true);
      await mirarNativo();
    });
  }

  async function recibir(x: unknown, origen: OrigenControl | null = null): Promise<void> {
    const cable = leerCable(x);
    if (!cable) return;
    let v: { cuerpo: unknown; huella?: string; valido: boolean };
    try {
      v = await deps.verificar(cable.s);
    } catch {
      return;
    }
    if (!v.valido || (v.cuerpo as { t?: unknown } | null)?.t !== cable.t) return;
    const msg = leerMensajeWifi(v.cuerpo);
    if (!msg) return;
    const yo = await deps.yo();
    if (!yo || msg.para !== yo.neurona || msg.de === yo.neurona) return;
    if (!deps.confiable(msg.de, v.huella, origen)) return; // sin vínculo ni cuenta: ni se contesta
    await enCola(async () => {
      const ahora = deps.ahora();
      if (msg.t === "enlace.wifi.listo" && msg.fase === "red") {
        if (estado.fase !== "esperando-red" || msg.sesion !== estado.sesion || msg.de !== estado.otro || !msg.cred) return;
        let plano: unknown = null;
        try {
          plano = await deps.descifrar(msg.cred);
        } catch {
          plano = null;
        }
        const cred = leerCredenciales(plano, ahora);
        await paso(cred ? { t: "credenciales", ahora, sesion: msg.sesion, cred } : { t: "credenciales-invalidas", ahora, sesion: msg.sesion }, true);
        return;
      }
      const p = await propio();
      if (!p) return;
      await paso({ t: "recibido", ahora, msg, propio: p, ajuste: deps.ajuste() }, true);
    });
  }

  async function abrir(otro: string, clase: ClaseNecesidad, nombreOtro?: string | null): Promise<{ ok: boolean; motivo?: string }> {
    return enCola(async () => {
      if (ocupada(estado.fase)) return { ok: false, motivo: "ya hay un enlace Wi-Fi directo abierto o en marcha" };
      const p = await propio();
      if (!p) return { ok: false, motivo: "sin identidad de esta neurona o sin clave de cifrado" };
      if (!p.cap.ap.length && !p.cap.cliente.length) return { ok: false, motivo: "esta app no puede abrir ni unirse a una red Wi-Fi directa" };
      propuesta = null;
      ultimoRespaldo = null;
      await paso({ t: "abrir", ahora: deps.ahora(), sesion: deps.nuevaSesion(), otro, nombreOtro: nombreOtro ?? undefined, clase, propio: p }, true);
      return estado.fase === "ofreciendo" ? { ok: true } : { ok: false, motivo: estado.motivo ?? "no se pudo ofrecer" };
    });
  }

  async function decidirPersona(acepta: boolean): Promise<void> {
    await enCola(async () => {
      const p = await propio();
      if (!p) return;
      await paso({ t: "persona", ahora: deps.ahora(), acepta, propio: p }, true);
    });
  }

  async function cerrar(motivo: MotivoCierre = "persona"): Promise<void> {
    await paso({ t: "cerrar", ahora: deps.ahora(), motivo });
  }

  async function necesitaAncho(p: Parameters<MotorWifi["necesitaAncho"]>[0]): Promise<Decision> {
    const cap = await capacidades();
    const ahora = deps.ahora();
    const viaCercana = vias().find((v) => {
      try {
        return v.cercana && v.alcanza(p.neurona);
      } catch {
        return false;
      }
    });
    let kbps = p.enlaceActual.kbps;
    let tipo = p.enlaceActual.tipo;
    if (tipo === "ninguno" && viaCercana) tipo = "ble";
    if (kbps === null && viaCercana?.kbps) {
      try {
        kbps = viaCercana.kbps(p.neurona);
      } catch {
        kbps = null;
      }
    }
    if (kbps === null) kbps = kbpsSupuesto(tipo);
    const d = decidirEnlaceWifi({
      ajuste: deps.ajuste(),
      clase: p.clase,
      bytes: p.bytes,
      capPropia: cap,
      enlaceActual: { tipo, kbps },
      cerca: p.cerca || !!viaCercana,
      fase: estado.fase,
      ultimoFallo: fallos[p.neurona] ?? null,
      ahora,
    });
    if (d.accion === "abrir") {
      void abrir(p.neurona, p.clase, p.nombre ?? null);
    } else if (d.accion === "proponer") {
      propuesta = { neurona: p.neurona, nombre: p.nombre ?? null, clase: p.clase, motivo: d.motivo, ...(d.aviso ? { aviso: d.aviso } : {}), ...(typeof p.bytes === "number" ? { bytes: p.bytes } : {}) };
      avisar();
    }
    return d;
  }

  async function resolverPropuesta(abrirla: boolean): Promise<void> {
    const p = propuesta;
    propuesta = null;
    avisar();
    if (abrirla && p) await abrir(p.neurona, p.clase, p.nombre);
  }

  return {
    abrir,
    recibir,
    decidirPersona,
    resolverPropuesta,
    cerrar,
    tic,
    uso: () => {
      if (estado.fase === "activo") estado = { ...estado, ultimoUso: deps.ahora() };
    },
    necesitaAncho,
    retenerFlujo: (neurona, flujo) => {
      flujos.set(neurona, [...(flujos.get(neurona) ?? []), flujo]);
      if (estado.fase === "activo" && estado.otro === neurona) estado = { ...estado, ultimoUso: deps.ahora() };
    },
    capacidades,
    pedirPermiso: async () => {
      try {
        capPropia = await deps.nativo.pedirPermiso();
        capLeida = deps.ahora();
      } catch {
        /* se queda lo que había */
      }
      avisar();
      return capPropia;
    },
    instantanea: () => {
      foto ??= {
        estado,
        capPropia,
        propuesta,
        pregunta,
        guiado,
        ultimoRespaldo,
        fallos: { ...fallos },
        nativo,
        avisoRadio:
          capPropia?.radioUnica && (estado.fase === "uniendo" || estado.fase === "activo" || estado.fase === "esperando-red") && !soyAp(estado)
            ? "Este Mac salió de su red Wi-Fi para el enlace directo; vuelve a ella al cerrarlo."
            : null,
      };
      return foto;
    },
    suscribir: (cb) => {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
  };
}

/* ══════════════════════════ Tipo del enlace de ahora (para decidir) ══════════════════════════ */

/** Lo mínimo de un `EnlaceDisponible` del transporte universal. */
export interface EnlaceParaAncho {
  id: string;
  tipo: string;
  ruta?: string | null;
  capacidadKbps?: number | null;
}

/** Traduce el enlace por el que iría el envío a lo que `decidirEnlaceWifi` entiende. Puro. */
export function enlaceActualDe(e: EnlaceParaAncho | null | undefined): { tipo: TipoEnlaceActual; kbps: number | null } {
  if (!e) return { tipo: "ninguno", kbps: 0 };
  const kbps = typeof e.capacidadKbps === "number" && Number.isFinite(e.capacidadKbps) && e.capacidadKbps > 0 ? e.capacidadKbps : null;
  if (esEnlaceWifiDirecto(e.id)) return { tipo: "wifi-directo", kbps };
  switch (e.tipo) {
    case "nativo":
      return { tipo: "red-local", kbps };
    case "local":
    case "cuenta":
    case "par":
      return { tipo: e.ruta === "misma-red-local" ? "red-local" : "internet", kbps };
    case "rele":
      return { tipo: "rele", kbps };
    case "lora":
      return { tipo: "lora", kbps };
    case "ble":
      return { tipo: "ble", kbps };
    default:
      return { tipo: "internet", kbps };
  }
}

/* ══════════════════════════ Instancia real (solo en la app nativa) ══════════════════════════ */

let motor: MotorWifi | null = null;
const viasRegistradas = new Set<ViaControlWifi>();
const oyentesMotor = new Set<() => void>();
let bajaMotor: (() => void) | null = null;

/**
 * Registra una vía de control (BLE1108A: Bluetooth LE). Se prueba antes que el transporte universal y,
 * si es `cercana`, cuenta como prueba de proximidad para proponer o abrir solo. Devuelve la baja.
 */
export function registrarViaControlWifi(v: ViaControlWifi): () => void {
  viasRegistradas.add(v);
  return () => {
    viasRegistradas.delete(v);
  };
}

/** (INT1108C) Las neuronas que identificaron las vías registradas (para `remitenteDeConfianza`). */
export function ligadurasDeVias(vias: Iterable<ViaControlWifi> = viasRegistradas): Array<{ neurona: string; huella: string }> {
  const out: Array<{ neurona: string; huella: string }> = [];
  for (const v of Array.from(vias)) {
    try {
      out.push(...(v.ligaduras?.() ?? []));
    } catch {
      /* una vía rota no tumba la confianza de las demás */
    }
  }
  return out;
}

/** Lo que llega de un `enlace.wifi.*` por cualquier vía (BLE1108A lo llama con el texto tal cual). */
export function recibirControlWifi(texto: unknown, origen?: OrigenControl | null): void {
  void motorWifi()
    .then((m) => m?.recibir(texto, origen ?? null))
    .catch(nada);
}

// (PER1108A) Defecto del selector según lo que puede esta neurona (Android sin radio única: «Automático»;
// el resto: «Preguntar»). Solo vale mientras la persona no haya elegido nada.
let defectoWifi: AjusteWifiDirecto = AJUSTE_WIFI_POR_DEFECTO;

/** Lo llama el motor al conocer las capacidades de esta neurona. Avisa si el defecto cambió. */
export function fijarDefectoWifi(cap: { plataforma?: string; radioUnica?: boolean } | null | undefined): void {
  const nuevo = ajusteWifiPorDefecto(cap);
  if (nuevo === defectoWifi) return;
  defectoWifi = nuevo;
  for (const f of Array.from(oyentesMotor)) f();
}

function leerAjusteGuardado(): AjusteWifiDirecto {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CLAVE_AJUSTE_WIFI) : null;
    // Sin elección guardada manda el defecto de esta neurona; con ella, siempre la elección.
    return raw === null ? defectoWifi : leerAjusteWifi(raw);
  } catch {
    return defectoWifi;
  }
}

/** Ajustes › Neuronas › Medios: Automático / Preguntar / Nunca (por aparato). */
export function fijarAjusteWifi(a: AjusteWifiDirecto): void {
  try {
    localStorage.setItem(CLAVE_AJUSTE_WIFI, a);
    // (PER1108A) Tocado a propósito: la migración de defectos no lo cambia nunca.
    localStorage.setItem(CLAVE_DEFECTOS_ANTENAS, serializarMarca(marcarExplicito(leerMarca(localStorage.getItem(CLAVE_DEFECTOS_ANTENAS)), "wifi")));
  } catch {
    /* sin almacenamiento: vale esta sesión */
  }
  ajusteMemoria = a;
  for (const f of Array.from(oyentesMotor)) f();
}

let ajusteMemoria: AjusteWifiDirecto | null = null;

export function ajusteWifi(): AjusteWifiDirecto {
  return ajusteMemoria ?? leerAjusteGuardado();
}

function sesionNueva(): string {
  try {
    const a = crypto.getRandomValues(new Uint8Array(9));
    return "wfd-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `wfd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** La parte nativa por el puente de Tauri (`enlace_wifi_*`). */
async function nativoReal(): Promise<NativoWifi> {
  const { puenteNativo } = await import("@/lib/nativa/puente");
  const p = puenteNativo();
  const res = (r: { ok: boolean; valor?: unknown; motivo?: string }): ResultadoNativo => {
    if (!r.ok) return { ok: false, motivo: r.motivo, codigo: "fallo-nativo" };
    const v = (r.valor ?? {}) as Partial<EstadoNativoWifi>;
    if (v.fase === "error") return { ok: false, motivo: v.mensaje, codigo: codigoNativo(v.codigo) };
    return { ok: true, guiado: v.fase === "guiado" };
  };
  return {
    capacidades: async () => {
      const r = await p.llamar<unknown>("enlace_wifi_capacidades");
      return r.ok ? leerCapacidades(r.valor) : null;
    },
    pedirPermiso: async () => {
      const r = await p.llamar<unknown>("enlace_wifi_permiso");
      return r.ok ? leerCapacidades(r.valor) : null;
    },
    abrirAp: async (sesion, metodo) => res(await p.llamar<EstadoNativoWifi>("enlace_wifi_abrir_ap", { sesion, metodo })),
    credenciales: async (sesion) => {
      const r = await p.llamar<CredencialesNativas | null>("enlace_wifi_credenciales", { sesion });
      return r.ok && r.valor ? r.valor : null;
    },
    unirse: async (sesion, metodo, cred) =>
      res(await p.llamar<EstadoNativoWifi>("enlace_wifi_unirse", { sesion, metodo, ssid: cred.ssid, clave: cred.clave, ipAp: cred.ipAp })),
    estado: async () => {
      const r = await p.llamar<EstadoNativoWifi>("enlace_wifi_estado");
      return r.ok && r.valor ? r.valor : null;
    },
    cerrar: async (sesion) => {
      await p.llamar("enlace_wifi_cerrar", { sesion });
    },
    comprobar: async (ip, puerto) => {
      const r = await p.llamar<{ alcanzable: boolean; ip_local: string | null }>("enlace_wifi_comprobar", { ip, puerto });
      return r.ok && r.valor ? { alcanzable: !!r.valor.alcanzable, ipLocal: r.valor.ip_local ?? null } : { alcanzable: false, ipLocal: null };
    },
    alCambiar: (cb) => p.escuchar("enlace-wifi://estado", () => cb()),
  };
}

async function depsReales(): Promise<DepsMotorWifi> {
  const [sync, { identidadDispositivo }, nativo] = await Promise.all([
    import("./sincronizacion-neuronas-motor"),
    import("@/lib/network/identidad-dispositivo"),
    nativoReal(),
  ]);
  const ms = sync.motorSync();
  return {
    ahora: () => Date.now(),
    nuevaSesion: sesionNueva,
    yo: async () => {
      try {
        const id = identidadDispositivo();
        return { neurona: id.neuronDeviceId, nombre: sync.nombreDeEstaNeurona(id.neuronDeviceId) };
      } catch {
        return null;
      }
    },
    epubPropia: async () => {
      const { myEncryptionPublicKey } = await import("@/ai/astraura/mesh/recipient-crypto");
      return myEncryptionPublicKey();
    },
    ajuste: ajusteWifi,
    firmar: async (cuerpo) => {
      const { wrapSigned } = await import("@/ai/astraura/mesh/mesh-identity");
      const s = await wrapSigned(cuerpo);
      return (s as { v?: unknown }).v === 2 ? s : null;
    },
    verificar: async (sobre) => {
      const [{ unwrapSigned }, { acceptFreshness }] = await Promise.all([import("@/ai/astraura/mesh/mesh-identity"), import("@/ai/astraura/mesh/replay-guard")]);
      const r = await unwrapSigned(sobre);
      const b = r.body as { t?: unknown; sesion?: unknown; ts?: unknown } | null;
      const clave = b && typeof b.t === "string" ? `${b.t}:${String(b.sesion ?? "")}:${String(b.ts ?? "")}` : undefined;
      const fresco = r.verified && typeof r.ts === "number" && !!r.nonce && acceptFreshness(r.fp, r.ts, r.nonce, clave);
      return { cuerpo: r.body, huella: r.fp, valido: r.verified && fresco };
    },
    cifrarPara: async (epub, obj) => {
      const { encryptEnvelopeFor } = await import("@/ai/astraura/mesh/recipient-crypto");
      return (await encryptEnvelopeFor(epub, obj)) as SobreCifradoWifi | null;
    },
    descifrar: async (sobre) => {
      const { decryptEnvelopeFor } = await import("@/ai/astraura/mesh/recipient-crypto");
      return decryptEnvelopeFor(sobre);
    },
    confiable: (de, huella, origen) => {
      let ligaduras: Array<{ neurona: string; huella: string }> = [];
      try {
        ligaduras = redNativa?.redLocalNativaActiva()?.instantanea().ligaduras ?? [];
      } catch {
        ligaduras = [];
      }
      // (INT1108C) Y las ligadas por una vía de control (Bluetooth directo: saludo firmado + cuenta o vínculo).
      ligaduras = [...ligaduras, ...ligadurasDeVias()];
      return remitenteDeConfianza({ de, huella, vinculos: ms.instantanea().vinculos, ligaduras, origen });
    },
    enviarTransporte: async (para, cable) => {
      const { enviarMensaje } = await import("./transporte-universal");
      const v = ms.instantanea().vinculos.find((x) => x.neurona === para);
      const r = await enviarMensaje(
        { neuronDeviceId: para, ...(v?.sync ? { syncDeviceId: v.sync } : {}), ...(v?.huella ? { identidadRele: v.huella } : {}) },
        CANAL_CONTROL_WIFI,
        cable,
      );
      return { ok: r.ok, ...(r.motivo ? { motivo: r.motivo } : {}) };
    },
    nativo,
    alActivo: ({ neurona, ipOtro }) => {
      const red = redNativa?.redLocalNativaActiva();
      if (red && ipOtro) {
        red.pista?.(neurona, ipOtro, PUERTO_CANAL_WIFI);
        void red.refrescar();
      }
    },
    alCerrado: (neurona) => {
      redNativa?.redLocalNativaActiva()?.pista?.(neurona, null);
    },
    trafico: (_neurona, ipOtro) => {
      const red = redNativa?.redLocalNativaActiva();
      return !!ipOtro && !!red && red.colaBytes(ipOtro) > 0;
    },
  };
}

let redNativa: typeof import("./red-local-nativa-motor") | null = null;
let creando: Promise<MotorWifi | null> | null = null;

/** El motor de esta página (lo crea la primera vez; null fuera de la app nativa). */
export function motorWifi(): Promise<MotorWifi | null> {
  if (motor) return Promise.resolve(motor);
  creando ??= (async () => {
    try {
      const { esAppNativa } = await import("@/lib/nativa/puente");
      if (!esAppNativa()) return null;
      redNativa = await import("./red-local-nativa-motor");
      const m = crearMotorWifi(await depsReales(), () => Array.from(viasRegistradas));
      motor = m;
      m.suscribir(() => {
        for (const f of Array.from(oyentesMotor)) f();
      });
      for (const f of Array.from(oyentesMotor)) f();
      return m;
    } catch {
      return null;
    } finally {
      creando = null;
    }
  })();
  return creando;
}

/** El motor ya creado (sin crearlo). */
export function motorWifiActivo(): MotorWifi | null {
  return motor;
}

/**
 * iniciarEnlaceWifi — escucha el canal `enlace-wifi` del transporte universal y da los tics (1 s). Solo
 * en la app nativa; en el navegador no hace nada. Lo arranca `iniciarSincronizacionNeuronas`.
 */
export function iniciarEnlaceWifi(): () => void {
  let vivo = true;
  const bajas: Array<() => void> = [];
  void motorWifi()
    .then(async (m) => {
      if (!m || !vivo) return;
      const tu = await import("./transporte-universal");
      bajas.push(tu.alRecibirMensaje(CANAL_CONTROL_WIFI, (x) => void m.recibir(x.cuerpo, { tipo: x.origen.tipo, enlaceId: x.origen.enlaceId })));
      const t = setInterval(() => void m.tic(), 1_000);
      bajas.push(() => clearInterval(t));
      try {
        const n = await nativoReal();
        const q = await n.alCambiar?.(() => void m.tic());
        if (q) bajas.push(q);
      } catch {
        /* sin eventos: el tic de 1 s basta */
      }
      void m.capacidades(true);
    })
    .catch(nada);
  bajaMotor = () => {
    vivo = false;
    for (const b of bajas.splice(0)) {
      try {
        b();
      } catch {
        /* */
      }
    }
  };
  return bajaMotor;
}

/**
 * alNecesitarAncho — lo llama el transporte universal ante un archivo grande o un flujo. Nunca lanza ni
 * espera a la red: decide y, si toca, ofrece en segundo plano.
 */
export function alNecesitarAncho(p: {
  destino: { neuronDeviceId?: string; syncDeviceId?: string };
  clase: ClaseNecesidad;
  bytes?: number;
  enlace?: EnlaceParaAncho | null;
  flujo?: { getTracks(): Array<{ readyState: string }> } | null;
}): void {
  const m = motor;
  if (!m) return;
  void (async () => {
    let neurona = p.destino.neuronDeviceId ?? null;
    if (!neurona && p.destino.syncDeviceId) {
      try {
        const sync = await import("./sincronizacion-neuronas-motor");
        neurona = sync.motorSync().instantanea().vinculos.find((v) => v.sync === p.destino.syncDeviceId)?.neurona ?? null;
      } catch {
        neurona = null;
      }
    }
    if (!neurona) return;
    if (p.flujo) m.retenerFlujo(neurona, p.flujo);
    if (enlaceWifiDe(neurona)) {
      m.uso();
      return;
    }
    await m.necesitaAncho({ neurona, clase: p.clase, bytes: p.bytes, enlaceActual: enlaceActualDe(p.enlace ?? null), cerca: false });
  })().catch(nada);
}

/* ══════════════════════════ Para la interfaz ══════════════════════════ */

const VACIA: InstantaneaWifi = {
  estado: WIFI_INICIAL,
  capPropia: null,
  propuesta: null,
  pregunta: null,
  guiado: null,
  ultimoRespaldo: null,
  fallos: {},
  nativo: null,
  avisoRadio: null,
};

function suscribirMotor(cb: () => void): () => void {
  oyentesMotor.add(cb);
  return () => {
    oyentesMotor.delete(cb);
  };
}

/** Estado del enlace Wi-Fi directo de esta página (vacío fuera de la app nativa). */
export function useEnlaceWifi(): InstantaneaWifi {
  return useSyncExternalStore(
    suscribirMotor,
    () => motor?.instantanea() ?? VACIA,
    () => VACIA,
  );
}

/** El ajuste de esta neurona, con su cambio. */
export function useAjusteWifi(): AjusteWifiDirecto {
  return useSyncExternalStore(suscribirMotor, ajusteWifi, () => "preguntar" as AjusteWifiDirecto);
}

/** Solo pruebas. */
export function __fijarMotorWifiParaPruebas(m: MotorWifi | null): void {
  motor = m;
  if (!m) bajaMotor?.();
}
