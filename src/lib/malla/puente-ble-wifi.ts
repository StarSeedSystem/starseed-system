/**
 * puente-ble-wifi — el Bluetooth directo negocia el enlace Wi-Fi directo (2026-11-08 · INT1108C).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Une BLE1108A (`architecture/bluetooth-directo.md` §8) y WFD1108A (`architecture/wifi-directo.md` §9):
 *
 *   · Dos apps de StarSeed OS sin router ni internet se encuentran y se ligan solas por Bluetooth; los
 *     mensajes van por `ble:<id>` desde el primer momento.
 *   · Cada neurona ligada por Bluetooth es una VÍA DE CONTROL del enlace Wi-Fi (`registrarViaControlWifi`):
 *     `cercana` (prueba de que está al lado), con el ancho medido del Bluetooth y con su ligadura (saludo
 *     firmado con esa huella + prueba de cuenta o vínculo) como remitente de confianza. Los cuatro mensajes
 *     del protocolo de WFD1108A (`enlace.wifi.oferta/respuesta/listo/cierre`, firmados y con las
 *     credenciales cifradas para el otro) viajan tal cual como `tu.msg` del canal `enlace-wifi` CLAVADO al
 *     enlace `ble:<id>`: el Bluetooth solo entrega `tu.*` de un enlace ligado y, al otro lado, el oyente
 *     del canal de WFD1108A lo recibe con origen `{ tipo: "ble" }`.
 *     (El control propio de BLE1108A §8, `enviarControlEnlace` con `modo/ssid/secreto`, no lo usa WFD1108A:
 *     su protocolo lleva `cap`, `epub`, roles y credenciales ECDH. Queda como estaba, sin uso.)
 *   · Lo pesado (un archivo grande, una llamada, la pantalla, una transmisión) hacia una neurona vecina
 *     avisa al motor Wi-Fi (`avisarEnvioPesado`) y este, según el ajuste, lo abre solo (Automático), lo
 *     propone con un toque (Preguntar, por defecto) o nada (Nunca).
 *   · Con «Preguntar», la propuesta y la pregunta de la otra neurona salen también como aviso global de un
 *     toque (`avisoWifi`): quien recibe la pregunta puede no tener ese chat abierto.
 *   · Una vez activo, el canal TCP 47071 de la red directa (`nativo:<ip>`) y el WebRTC que señaliza son
 *     enlaces de rango 0 que van DELANTE del Bluetooth en `elegirEnlaces`: archivos, llamadas, pantalla y
 *     transmisiones pasan solos por ahí; al cerrarse, vuelve el Bluetooth (mensajes) o el router.
 *
 * Lo de arriba de `iniciarPuenteBleWifi` es PURO (sin red, sin DOM; solo importa módulos puros y tipos).
 */

import { idEnlaceBle } from "./bluetooth-directo";
import { CANAL_CONTROL_WIFI, PLAZOS_WIFI, leerCable, type ClaseNecesidad } from "./enlace-wifi-directo";
import { AVISO_RADIO_UNICA } from "./enlace-wifi-orquestacion";
import type { EnlaceParaAncho, InstantaneaWifi, ViaControlWifi } from "./enlace-wifi-motor";

/* ══════════════════════════ Vía de control por Bluetooth ══════════════════════════ */

export const ID_VIA_BLE = "ble";

/** Lo mínimo del Bluetooth directo (`RedBle` de bluetooth-directo-motor.ts). */
export interface BleParaPuente {
  /** Enlace ligado (y vigente) con esa neurona («b3»), o null. */
  enlaceHacia(neurona: string): string | null;
  enlaces(): ReadonlyArray<{ id: string; capacidadKbps?: number | null }>;
  instantanea(): { ligaduras: ReadonlyArray<{ enlace: string; neurona: string; huella: string }> };
}

/** Manda el cable por ESE enlace del transporte universal (canal `enlace-wifi`); ok = acuse de la otra app. */
export type EnviarPorEnlace = (enlaceId: string, neurona: string, cable: unknown) => Promise<{ ok: boolean }>;

/**
 * viaControlBle — el Bluetooth directo como vía de control del enlace Wi-Fi. Llega a una neurona solo si hay
 * un enlace ligado con ella AHORA; manda el cable de WFD1108A por ese `ble:<id>`. Puro (lo del mundo, inyectado).
 */
export function viaControlBle(p: { ble: () => BleParaPuente | null; enviarPorEnlace: EnviarPorEnlace }): ViaControlWifi {
  const red = (): BleParaPuente | null => {
    try {
      return p.ble();
    } catch {
      return null;
    }
  };
  return {
    id: ID_VIA_BLE,
    cercana: true,
    alcanza: (neurona) => !!red()?.enlaceHacia(neurona),
    enviar: async (neurona, texto) => {
      const cable = leerCable(texto);
      const enlace = red()?.enlaceHacia(neurona);
      if (!cable || !enlace) return false;
      try {
        return (await p.enviarPorEnlace(idEnlaceBle(enlace), neurona, cable)).ok === true;
      } catch {
        return false;
      }
    },
    kbps: (neurona) => {
      const r = red();
      const enlace = r?.enlaceHacia(neurona);
      if (!r || !enlace) return null;
      const k = r.enlaces().find((e) => e.id === idEnlaceBle(enlace))?.capacidadKbps;
      return typeof k === "number" && Number.isFinite(k) && k > 0 ? k : null;
    },
    // Solo las ligaduras vigentes y actuales (el enlace con esa neurona es ESE).
    ligaduras: () => {
      const r = red();
      if (!r) return [];
      return r
        .instantanea()
        .ligaduras.filter((l) => r.enlaceHacia(l.neurona) === l.enlace)
        .map((l) => ({ neurona: l.neurona, huella: l.huella }));
    },
  };
}

/* ══════════════════════════ Lo pesado ══════════════════════════ */

/**
 * El primer paso del plan de medios de un chat, como enlace para decidir (`enlaceActualDe`): el tipo sale del
 * prefijo del id («ble:b3» → ble, «nativo:…» → nativo, «servidor» → internet). Null = no hay camino. Puro.
 */
export function enlaceDePaso(paso: { enlaceId: string; ruta?: string | null } | null | undefined): EnlaceParaAncho | null {
  if (!paso || typeof paso.enlaceId !== "string" || !paso.enlaceId) return null;
  const i = paso.enlaceId.indexOf(":");
  const tipo = i > 0 ? paso.enlaceId.slice(0, i) : paso.enlaceId;
  return { id: paso.enlaceId, tipo, ruta: paso.ruta ?? null };
}

/** Un mismo archivo (reintentos del buzón) no vuelve a proponer el enlace en este tiempo. */
export const VENTANA_AVISO_MS = 15 * 60_000;

/** ¿Es la primera vez (en la ventana) que se avisa por esta clave? Apunta la vez. */
export function primeraVez(memoria: Map<string, number>, clave: string, ahora: number, ventanaMs = VENTANA_AVISO_MS): boolean {
  const antes = memoria.get(clave);
  if (typeof antes === "number" && ahora - antes < ventanaMs) return false;
  memoria.set(clave, ahora);
  if (memoria.size > 500) {
    for (const [k, t] of Array.from(memoria)) if (ahora - t >= ventanaMs) memoria.delete(k);
  }
  return true;
}

/* ══════════════════════════ Aviso de un toque («Preguntar») ══════════════════════════ */

export const CLASE_AVISO: Record<ClaseNecesidad, string> = {
  archivo: "un archivo grande",
  llamada: "una llamada",
  pantalla: "compartir pantalla",
  flujo: "una transmisión en vivo",
  manual: "más ancho de banda",
};

export interface AvisoWifi {
  /** Id estable del aviso (el mismo mientras dure la pregunta o la propuesta). */
  id: string;
  tipo: "pregunta" | "propuesta";
  titulo: string;
  detalle: string;
  si: string;
  no: string;
  duracionMs: number;
}

/**
 * avisoWifi — lo que hay que preguntar a la persona ahora (primero la pregunta de la otra neurona, que tiene
 * plazo), o null. Puro.
 */
export function avisoWifi(i: Pick<InstantaneaWifi, "pregunta" | "propuesta" | "capPropia">): AvisoWifi | null {
  const radio = i.capPropia?.radioUnica ? ` ${AVISO_RADIO_UNICA}` : "";
  if (i.pregunta) {
    const q = i.pregunta;
    return {
      id: `wifi-directo:pregunta:${q.sesion}`,
      tipo: "pregunta",
      titulo: `«${q.nombreOtro || "Otra neurona"}» pide abrir un enlace Wi-Fi directo (sin router) para ${CLASE_AVISO[q.clase]}.`,
      detalle: `Va de antena a antena entre las dos neuronas y se cierra solo al dejar de usarse.${radio}`,
      si: "Aceptar",
      no: "Ahora no",
      duracionMs: PLAZOS_WIFI.persona,
    };
  }
  if (i.propuesta) {
    const p = i.propuesta;
    const aviso = p.aviso ? ` ${p.aviso}` : radio;
    return {
      id: `wifi-directo:propuesta:${p.neurona}:${p.clase}`,
      tipo: "propuesta",
      titulo: `¿Abrir un enlace Wi-Fi directo con «${p.nombre || "esa neurona"}» para ${CLASE_AVISO[p.clase]}?`,
      detalle: `Por Bluetooth va lento; el enlace directo no necesita router ni internet.${aviso}`,
      si: "Abrir",
      no: "Ahora no",
      duracionMs: 60_000,
    };
  }
  return null;
}

/* ══════════════════════════ Con la app (solo en la app nativa) ══════════════════════════ */

const avisados = new Map<string, number>();
const nada = () => undefined;

/**
 * avisarEnvioPesado — lo pesado hacia una neurona: el motor Wi-Fi decide abrir, proponer o nada (sin motor,
 * fuera de la app nativa, no hace nada). `clave` evita repetir la propuesta en los reintentos. Nunca lanza.
 */
export function avisarEnvioPesado(p: {
  clave?: string;
  destino: { neuronDeviceId?: string; syncDeviceId?: string };
  clase: ClaseNecesidad;
  bytes?: number;
  enlace?: EnlaceParaAncho | null;
}): void {
  try {
    if (p.clave && !primeraVez(avisados, p.clave, Date.now())) return;
  } catch {
    /* sin memoria: se avisa */
  }
  void import("./enlace-wifi-motor")
    .then((ew) => ew.alNecesitarAncho({ destino: p.destino, clase: p.clase, bytes: p.bytes, enlace: p.enlace ?? null }))
    .catch(nada);
}

/**
 * iniciarPuenteBleWifi — registra el Bluetooth directo como vía de control del enlace Wi-Fi y enseña el aviso
 * de un toque. Lo arranca `iniciarSincronizacionNeuronas` junto al Bluetooth directo (solo en la app nativa:
 * en el navegador la vía nunca llega a nadie y no hay motor que avise).
 */
export function iniciarPuenteBleWifi(): () => void {
  let vivo = true;
  const bajas: Array<() => void> = [];
  void Promise.all([import("./enlace-wifi-motor"), import("./bluetooth-directo-motor")])
    .then(async ([ew, bd]) => {
      if (!vivo) return;
      const via = viaControlBle({
        ble: () => bd.bluetoothDirectoActivo(),
        enviarPorEnlace: async (enlaceId, neurona, cable) => {
          const tu = await import("./transporte-universal");
          const r = await tu.enviarMensaje({ enlaceId, neuronDeviceId: neurona }, CANAL_CONTROL_WIFI, cable);
          return { ok: r.ok };
        },
      });
      bajas.push(ew.registrarViaControlWifi(via));
      const m = await ew.motorWifi();
      if (!m || !vivo) return;
      const { toast } = await import("sonner");
      let visible: string | null = null;
      const pintar = () => {
        const a = avisoWifi(m.instantanea());
        if (visible && visible !== a?.id) toast.dismiss(visible);
        if (!a || a.id === visible) {
          visible = a?.id ?? null;
          return;
        }
        visible = a.id;
        const decidir = (si: boolean) => void (a.tipo === "pregunta" ? m.decidirPersona(si) : m.resolverPropuesta(si)).catch(nada);
        toast(a.titulo, {
          id: a.id,
          description: a.detalle,
          duration: a.duracionMs,
          action: { label: a.si, onClick: () => decidir(true) },
          cancel: { label: a.no, onClick: () => decidir(false) },
        });
      };
      bajas.push(m.suscribir(pintar));
      bajas.push(() => {
        if (visible) toast.dismiss(visible);
      });
      pintar();
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
  };
}
