/**
 * fichas — cada valor de la ficha de una señal, con SU fuente (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════
 * Convierte una `DetectedSignal` en lo que enseña el mapa al tocarla: qué es, qué calidad tiene y
 * de dónde sale, el enlace real contigo, dónde está y con qué incertidumbre, los medios abiertos
 * (si es un aparato) y cada medida cruda con el instrumento que la dio. Lo que el instrumento no
 * dio aparece como «no medido» con su motivo. Las cuentas AJENAS no se identifican nunca.
 *
 * NO incluye la barra de calidad ni las acciones: la tarjeta (`signal-detail.tsx`) ya las pinta.
 * Puro: sin React, sin red, sin `node:*`.
 */

import { ANTENNA_LABEL, type DetectedSignal, type SignalMetric } from "@/ai/astraura/mesh/signals";
import { etiquetaRuta } from "@/lib/network/estadisticas-enlace";
import { TEXTO_ESTADO } from "./aparatos";
import { ESCALA_FAMILIA, factorError, formatoMetros } from "./escalas";
import { enlaceDeSenal } from "./enlaces";
import { bytesTexto, dato, haceTexto, noMedido, porcentaje } from "./fichas-base";
import type {
  Cuenta, Dato, EnlaceMapa, EstadoDato, FichaMapa, SeccionFicha, VivoMapa,
} from "./tipos-vivo";

export { bytesTexto, dato, haceTexto, noMedido, porcentaje };

/* ── Fuente de cada métrica cruda ───────────────────────────────────────────── */

interface FuenteMetrica { fuente: string; estado: EstadoDato }

const WIFI_RADIO = /^(Canal|Banda y ancho|Estándar|Seguridad|Señal|Ruido|Relación señal\/ruido|Velocidad|MCS|País)$/;

/** «Rosa» de «… · la oye Rosa» (señales que oye otra neurona de tu cuenta). */
export function quienLaOye(s: DetectedSignal): string | null {
  const m = /· la oye (.+)$/.exec(s.signalType);
  return m ? m[1] : null;
}

/**
 * De dónde sale una métrica cruda. Las etiquetas las fijan las fuentes de `signals.ts`,
 * `senales-radio-local.ts`, `senales-enlace-malla.ts` y `radar-por-malla.ts`; lo que no se
 * reconoce cae en la familia de antena (nunca se inventa un instrumento).
 */
export function fuenteDeMetrica(s: DetectedSignal, etiqueta: string): FuenteMetrica {
  if (s.id.startsWith("remoto:")) {
    return { fuente: `medido por ${quienLaOye(s) ?? "otra de tus neuronas"} y compartido por la malla P2P cifrada`, estado: "declarado" };
  }
  switch (s.antenna) {
    case "lora":
      if (/^(SNR|RSSI)$/.test(etiqueta)) return { fuente: "radio Meshtastic: lo mide el chip LoRa en el último paquete de ese nodo", estado: "medido" };
      if (etiqueta === "Saltos") return { fuente: "cabecera del paquete (saltos recorridos)", estado: "medido" };
      if (/^(Batería|Voltaje|Uso de canal|Airtime TX)$/.test(etiqueta)) return { fuente: "telemetría que emite el propio nodo", estado: "declarado" };
      if (/^(Hardware|Rol|ID de nodo)$/.test(etiqueta)) return { fuente: "NodeInfo que emite el propio nodo", estado: "declarado" };
      if (etiqueta === "Posición") return { fuente: "la comparte el propio nodo (su GPS)", estado: "declarado" };
      break;
    case "relay":
      if (etiqueta === "Último faro") return { fuente: "hora del faro firmado en el relé", estado: "medido" };
      return { fuente: "faro firmado que esa neurona publica en el relé", estado: "declarado" };
    case "account":
      if (/^(Enlace P2P|Ruta|Tráfico P2P)$/.test(etiqueta)) return { fuente: "malla P2P: latido y RTCPeerConnection.getStats()", estado: "medido" };
      if (/^(Versión del OS|RAM|Backend local|Sirve Astraura 1\.58|Capas 1\.58 activas)$/.test(etiqueta)) return { fuente: "ficha que esa neurona envió por la malla", estado: "declarado" };
      if (/^(Faro en el relé|Nodos que ve)$/.test(etiqueta)) return { fuente: "su faro en el relé cifrado de tu cuenta", estado: "declarado" };
      if (s.id.startsWith("federated:")) return { fuente: "topología que esa neurona federó a tu cuenta", estado: "declarado" };
      if (s.id.startsWith("local:")) return { fuente: "el canal directo emparejado sin internet", estado: /^(Latencia|Abierto desde)$/.test(etiqueta) ? "medido" : "declarado" };
      return { fuente: "registro de neuronas de tu cuenta (su latido)", estado: "declarado" };
    case "ip":
      if (s.id === "ip:external") return { fuente: "Network Information API del navegador", estado: "medido" };
      if (WIFI_RADIO.test(etiqueta)) return { fuente: "radio Wi-Fi de la Mac (la lee Genesis local)", estado: "medido" };
      break;
    case "ble":
      if (s.id.startsWith("bt:")) return { fuente: "Bluetooth del sistema (Genesis local)", estado: etiqueta === "Señal" ? "medido" : "declarado" };
      if (etiqueta === "RSSI" || etiqueta === "Oído") return { fuente: "anuncio BLE oído con Web Bluetooth", estado: "medido" };
      if (etiqueta === "Id del anuncio") return { fuente: "id opaco que da el navegador (no es la MAC)", estado: "declarado" };
      return { fuente: "campo que el dispositivo incluye en su anuncio BLE", estado: "declarado" };
    case "serial":
      if (/^USB /.test(etiqueta)) return { fuente: "Web Serial: getInfo() del puerto", estado: "declarado" };
      return { fuente: "permiso que diste a este origen en el navegador", estado: "declarado" };
  }
  return { fuente: ANTENNA_LABEL[s.antenna], estado: "medido" };
}

/** Lo que cada tipo de señal DEBERÍA traer y, si no lo trae, se dice «no medido» con su motivo. */
function esperadas(s: DetectedSignal): Dato[] {
  const tiene = (e: string) => s.metrics.some((m) => m.label === e);
  const out: Dato[] = [];
  if (s.antenna === "lora" && !s.id.startsWith("remoto:")) {
    const radio = "radio Meshtastic conectado";
    if (!tiene("SNR")) out.push(noMedido("SNR", radio, "el radio aún no ha medido el SNR de este nodo (llega con sus paquetes)"));
    if (!tiene("RSSI")) out.push(noMedido("RSSI", radio, "el radio no reportó RSSI para este nodo"));
    if (!tiene("Saltos")) out.push(noMedido("Saltos", radio, "el último paquete no traía la cuenta de saltos"));
    if (!tiene("Posición")) out.push(noMedido("Posición", "el propio nodo", "este nodo no comparte su posición (privacidad del nodo)"));
    if (!tiene("Batería")) out.push(noMedido("Batería", "el propio nodo", "el nodo no emite telemetría de batería"));
  }
  if (s.antenna === "ble" && s.id.startsWith("ble:")) {
    if (!tiene("RSSI")) {
      out.push(noMedido("RSSI", "Web Bluetooth", /selector/i.test(s.signalType)
        ? "el selector de dispositivos del navegador no expone RSSI: sin él no hay distancia"
        : "este anuncio no trajo RSSI"));
    }
    if (!tiene("Potencia TX declarada")) out.push(noMedido("Potencia TX declarada", "anuncio BLE", "el dispositivo no la incluye en su anuncio"));
  }
  return out;
}

/* ── Posición ───────────────────────────────────────────────────────────────── */

const FUENTE_DISTANCIA: Record<string, string> = {
  lora: "modelo log-distancia sobre el SNR del nodo",
  ble: "modelo de trayecto libre a 2,4 GHz sobre el RSSI del anuncio BLE",
  ip: "modelo log-distancia sobre el RSSI del radio",
};

/** Sección «Dónde está y qué tan seguro»: cada número con su fuente y su margen de error. */
export function seccionPosicion(s: DetectedSignal): SeccionFicha {
  const p = s.placement;
  const datos: Dato[] = [];
  const escala = ESCALA_FAMILIA[s.antenna];
  switch (p.mode) {
    case "gps":
      datos.push(
        dato("Cómo se colocó", "Posición GPS real", "reglas del mapa", "medido", p.detail),
        dato("Distancia", p.distanceM == null ? "no medida" : formatoMetros(p.distanceM), "GPS de ambos extremos: el nodo comparte su posición y el radio local la suya", "medido"),
        dato("Rumbo", "real (arriba es el norte)", "GPS de ambos extremos", "medido"),
        dato("Precisión", p.accuracyM == null ? "no expresable" : `± ${formatoMetros(p.accuracyM)}`, "valor de referencia de un GPS de nodo", "estimado",
          "El nodo no informa su precisión: es el margen de referencia, no una medida."),
      );
      break;
    case "rf": {
      const f = factorError(s.antenna, s.quality);
      const m = p.distanceM ?? 0;
      datos.push(
        dato("Cómo se colocó", "Distancia estimada por radiofrecuencia", "reglas del mapa", "estimado", p.detail),
        dato("Distancia", p.distanceM == null ? "no medida" : `≈ ${formatoMetros(m)} (estimada)`, FUENTE_DISTANCIA[s.antenna] ?? "modelo de propagación", "estimado"),
        dato("Rango de precisión", m > 0 ? `entre ${formatoMetros(m / f)} y ${formatoMetros(m * f)}` : "no expresable", "error declarado del modelo", "estimado",
          `El modelo se equivoca hasta ×${f.toFixed(1).replace(".", ",")} con esta calidad de señal. El halo del mapa es ese rango.`),
        noMedido("Rumbo", "radiofrecuencia", "el RSSI/SNR da distancia, no dirección: se sitúa dentro del sector de su antena"),
      );
      if (escala) datos.push(dato("Regla del mapa", escala === "largo" ? "escala larga (30 m–6 km)" : "escala corta (1–300 m)", "reglas del mapa", "declarado"));
      break;
    }
    default:
      datos.push(
        dato("Cómo se colocó", s.quality == null ? "Sin posición ni métrica: radio fijo" : "Sin posición: colocada por calidad", "reglas del mapa", "declarado", p.detail),
        noMedido("Distancia", "ninguna", s.antenna === "account"
          ? "un aparato de tu cuenta no tiene posición medida: no hay GPS ni radio entre vosotros"
          : "no hay GPS ni métrica de radio de la que sacar metros"),
        noMedido("Rumbo", "ninguna", "sin posición: se sitúa dentro del sector de su antena"),
        s.quality == null
          ? dato("Qué significa el radio", "nada: es un radio fijo", "reglas del mapa", "declarado", "Ni distancia ni calidad: solo evita que se tape con otras marcas.")
          : dato("Qué significa el radio", "solo la calidad (más cerca = mejor)", "reglas del mapa", "declarado", s.qualityDetail),
        dato("Rango de precisión", "máximo (no expresable en metros)", "reglas del mapa", "no-medido", "El halo es la duda máxima y crece cuando la calidad cae."),
      );
  }
  return { id: "posicion", titulo: "Dónde está y qué tan seguro", datos };
}

/* ── Enlace ─────────────────────────────────────────────────────────────────── */

/** Los datos del «Enlace real contigo». `medioEnlazado` = el medio cuyo id de sync es el del canal. */
export function datosDeEnlace(enlace: EnlaceMapa, medioEnlazado: string | null | undefined, conCanal: boolean): Dato[] {
  const out: Dato[] = [
    dato("Camino hasta ti", enlace.etiqueta, enlace.clase === "rf-lora" ? "radio Meshtastic conectado a esta neurona" : "malla P2P (WebRTC) y relé cifrado", enlace.clase === "sin-enlace" ? "no-medido" : "medido",
      enlace.clase === "sin-enlace" ? "No hay ningún camino medido hasta este aparato ahora mismo." : undefined),
  ];
  if (enlace.motivo) out.push(dato("Motivo", enlace.motivo, "estado del canal P2P", "medido"));
  if (enlace.detalle) out.push(dato("Lo que mide el radio", enlace.detalle, "último paquete de ese nodo", "medido"));
  if (enlace.clase === "rf-lora") {
    out.push(noMedido("Latencia", "radio Meshtastic", "LoRa no mide ida y vuelta: el SNR y el RSSI son de recepción"));
  } else {
    out.push(enlace.latenciaMs == null
      ? noMedido("Latencia", "latido del canal P2P", enlace.clase === "sin-enlace" || enlace.clase === "rele" ? "no hay canal abierto del que medirla" : "el canal aún no ha medido ninguna ida y vuelta")
      : dato("Latencia", `${Math.round(enlace.latenciaMs)} ms`, "latido del canal (ida y vuelta)", "medido"));
  }
  if (enlace.ruta) {
    const r = enlace.ruta;
    out.push(dato("Ruta del canal", `${etiquetaRuta(r.clase)} · ${r.tipoLocal ?? "?"} ↔ ${r.tipoRemoto ?? "?"}${r.protocolo ? ` · ${r.protocolo}` : ""}`, "ICE: par de candidatos seleccionado (getStats)", "medido"));
    out.push(r.bytesEnviados == null && r.bytesRecibidos == null
      ? noMedido("Tráfico", "getStats", "la ruta aún no midió bytes")
      : dato("Tráfico", `${bytesTexto(r.bytesEnviados)} enviados · ${bytesTexto(r.bytesRecibidos)} recibidos`, "RTCPeerConnection.getStats", "medido"));
  } else if (enlace.claseRuta) {
    out.push(dato("Ruta del canal", etiquetaRuta(enlace.claseRuta), "estadísticas WebRTC del canal", "medido"));
  }
  if (conCanal) {
    out.push(medioEnlazado
      ? dato("Enlace medido con", medioEnlazado, "presencia en vivo: el medio cuyo id de sincronización es el del canal", "medido")
      : noMedido("Enlace medido con", "presencia en vivo", "ningún medio abierto coincide con el canal: puede ser con un medio ya cerrado"));
  }
  return out;
}

/* ── Ficha de una señal ─────────────────────────────────────────────────────── */

export interface ContextoFicha {
  ahora: number;
  cuenta: Cuenta;
  vivo: VivoMapa | null;
}

const TEXTO_CUENTA: Record<Cuenta, string> = {
  propia: "tu cuenta",
  otra: "otra cuenta (anónima)",
  ninguna: "no declara cuenta StarSeed",
};

/** Métricas que la sección de enlace ya cubre (no se repiten en «Datos medidos»). */
const DEL_ENLACE = /^(Enlace P2P|Ruta|Tráfico P2P)$/;

export function fichaDeSenal(s: DetectedSignal, ctx: ContextoFicha): FichaMapa {
  const { ahora, cuenta, vivo } = ctx;
  const directo = s.starseed?.via === "direct-link";
  const ajena = cuenta === "otra" && !directo;
  const esAparato = s.id.startsWith("neuron:") || s.id.startsWith("local:");
  const enlace = enlaceDeSenal(s, vivo);

  const quees: Dato[] = [
    dato("Tipo de señal", s.signalType, ANTENNA_LABEL[s.antenna], "declarado"),
    dato("Antena por la que llega", s.antennaLabel, "familia de antena del mapa", "declarado"),
    dato("Cuenta", directo ? (cuenta === "propia" ? "tu cuenta (coincide el id declarado)" : "otra cuenta o sin verificar") : TEXTO_CUENTA[cuenta], ajena ? "faro anónimo: la red no revela quién es"
      : directo ? "id de cuenta que declara el otro lado al emparejar" : "vínculo verificado por el registro o la federación",
      cuenta === "ninguna" || directo ? "declarado" : "medido",
      directo ? "Sirve para enrutar, nunca para dar permisos: lo declara el otro lado y no se verifica." : undefined),
    dato("Compatible con la malla", s.compatible ? "sí" : "no", "protocolo que habla", "declarado", s.compatDetail),
  ];
  if (esAparato && vivo?.estados.get(s.id)) {
    const e = vivo.estados.get(s.id)!;
    quees.unshift(dato("Estado ahora", TEXTO_ESTADO[e],
      s.id.startsWith("local:") ? "el canal directo está abierto ahora"
        : vivo.presenciaConectada ? "presencia en vivo de tu cuenta" : "latido de la cuenta (cada 5 min; sin presencia en vivo)",
      "medido", e === "en-linea" && !s.id.startsWith("local:") ? "Sin medio abierto en vivo: solo se sabe que latió hace poco." : undefined));
  }
  if (s.starseed && s.starseed.capabilities.length > 0) {
    quees.push(dato("Capacidades públicas", s.starseed.capabilities.join(" · "), "lo declara esa neurona (solo datos públicos)", "declarado",
      "Nada privado (memorias, archivos, claves) viaja por aquí."));
  }
  if (s.simulated) quees.push(dato("Simulador", "sí: este nodo NO existe en el aire", "motor de la malla", "declarado"));

  const sinRadio = s.antenna === "relay" || s.antenna === "account";
  const calidad: Dato[] = [
    s.quality == null
      ? noMedido("Calidad", "la fuente de la señal", s.qualityDetail)
      : dato("Calidad", porcentaje(s.quality), s.qualityDetail, sinRadio && !/latencia REAL/i.test(s.qualityDetail) ? "estimado" : "medido",
          sinRadio && !/latencia REAL/i.test(s.qualityDetail) ? "No es radio: se deriva de lo reciente que es el último aviso." : undefined),
  ];

  const medidas: Dato[] = [];
  for (const m of s.metrics as SignalMetric[]) {
    if (ajena && /^(ID de|Id del)/i.test(m.label)) continue;
    if (esAparato && /^ID de sync$/i.test(m.label) && cuenta !== "propia") continue;
    if (enlace && DEL_ENLACE.test(m.label)) continue;
    const f = fuenteDeMetrica(s, m.label);
    medidas.push(dato(m.label, m.value, f.fuente, f.estado));
  }
  medidas.push(...esperadas(s));
  const sinEventoDeRadio = s.antenna === "serial" || s.id === "ip:external" || s.id === "wifi-actual";
  if (sinEventoDeRadio) {
    medidas.push(dato("Última vez oída", "no aplica", "estado actual del navegador", "no-medido", "No es una señal de radio recibida: es el estado de la conexión o del puerto."));
  } else if (s.lastHeard != null) {
    medidas.push(dato("Última vez oída", haceTexto(s.lastHeard, ahora), "hora del último paquete o anuncio", "medido"));
  }

  const secciones: SeccionFicha[] = [{ id: "quees", titulo: "Qué es", datos: quees }, { id: "calidad", titulo: "Calidad de la señal", datos: calidad }];
  if (enlace) {
    const medioEnlazado = vivo?.medios.find((m) => m.padreId === s.id && m.enlazado)?.etiqueta ?? null;
    secciones.push({ id: "enlace", titulo: "Enlace real contigo", datos: datosDeEnlace(enlace, medioEnlazado, esAparato && /^p2p/.test(enlace.clase)) });
  }
  secciones.push(seccionPosicion(s));
  if (esAparato && vivo) {
    const abiertos = vivo.medios.filter((m) => m.padreId === s.id);
    secciones.push({
      id: "medios", titulo: "Medios abiertos",
      datos: abiertos.length
        ? abiertos.map((m) => dato(m.etiqueta, `${m.visible ? "a la vista" : "en segundo plano"} · abierto ${haceTexto(Date.parse(m.desde), ahora)}`, "presencia en vivo de tu cuenta", "medido"))
        : [noMedido("Medios abiertos ahora", "presencia en vivo", vivo.presenciaConectada ? "ningún medio de este aparato está abierto ahora" : "la presencia en vivo no está conectada (sin sesión o sin Realtime)")],
    });
    const oidas = vivo.oidas.get(s.id);
    secciones.push({
      id: "oye", titulo: "Lo que oye",
      datos: [oidas
        ? dato("Señales que oye", `${oidas}`, "radar que comparte por la malla P2P (cada 60 s)", "declarado", "Aparecen en el mapa con el nombre de este aparato en su tipo.")
        : noMedido("Señales que oye", "radar compartido por la malla", "solo llega con un canal P2P abierto, y puede que no oiga nada")],
    });
  }
  secciones.push({ id: "medidas", titulo: "Datos medidos", datos: medidas });

  return {
    titulo: s.label,
    subtitulo: s.signalType,
    resumen: ajena
      ? "Neurona de otra cuenta vista en el relé. El faro es anónimo por diseño: solo se enseñan sus datos públicos."
      : enlace && enlace.clase !== "sin-enlace" && esAparato
        ? `${s.detail} Te llega por «${enlace.etiqueta}»${enlace.latenciaMs == null ? "" : ` con ${Math.round(enlace.latenciaMs)} ms`}.`
        : enlace?.clase === "sin-enlace" ? `${s.detail} Sin enlace: ${enlace.motivo ?? "sin dato"}.` : s.detail,
    secciones,
  };
}
