/**
 * senales-enlace-malla — ENRIQUECIMIENTO de las señales `account` del radar
 * (Ola 375 · RDV5) con lo que la malla de neuronas sabe de verdad de cada una.
 * ============================================================================
 * En el radar, cada neurona de la cuenta es una señal `antenna: "account"`,
 * `id: neuron:<neuronId>`, `starseed.sourceId = neuronId`, y solo traía
 * plataforma/navegador/capacidades. La malla (`useMallaNeuronasEstado()` en
 * `src/lib/network/malla-neuronas.ts`) sabe mucho más: el ENLACE P2P (estado,
 * motivo de fallo, latencia, ruta ICE con sus bytes) y la FICHA que la neurona
 * intercambió (versión del OS, clase de RAM, backend local, si sirve Astraura
 * 1.58 y con qué latencia, capas activas, plataforma, tipo).
 *
 * Este módulo es PURO: recibe señales ya detectadas y las filas de la malla, y
 * devuelve señales enriquecidas. Jamás inventa un dato: si falta, se dice
 * «sin dato» o la métrica no aparece. Nunca pierde métricas previas y nunca
 * duplica una métrica con la misma etiqueta (la sustituye).
 */

import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import { etiquetaRuta, type RutaEnlace } from "@/lib/network/estadisticas-enlace";
import { qualityFromRtt, type DetectedSignal, type SignalMetric } from "./signals";

/** Texto que se añade a la colocación cuando la ruta ICE es host↔host (LAN). */
const DETALLE_LAN =
  "misma red local (candidatos host): está cerca de ti en la red, no en metros";

/** Bytes → «N KB» / «N MB» (null → «sin dato», honesto). */
function cantidadBytes(bytes: number | null): string {
  if (bytes === null) return "sin dato";
  const mb = bytes >= 1_048_576;
  const valor = mb ? bytes / 1_048_576 : bytes / 1_024;
  return `${Number(valor.toFixed(1))} ${mb ? "MB" : "KB"}`;
}

/** «Enlace P2P»: estado legible, con la latencia real si el canal la tiene. */
function valorEnlace(fila: DispositivoMallaRow, rtt?: number): string {
  const { estado, motivo } = fila.enlace;
  if (estado === "conectado") {
    return rtt === undefined ? "conectado" : `conectado · ${Math.round(rtt)} ms`;
  }
  if (estado === "fallido") return `fallido: ${motivo?.trim() || "sin dato"}`;
  return estado === "conectando" ? "conectando" : "sin vínculo";
}

/** «Tráfico P2P» solo si la ruta midió bytes de verdad; si no, no se muestra. */
function trafico(ruta?: RutaEnlace): string | null {
  if (!ruta || (ruta.bytesEnviados === null && ruta.bytesRecibidos === null)) return null;
  return `${cantidadBytes(ruta.bytesEnviados)} enviados · ${cantidadBytes(ruta.bytesRecibidos)} recibidos`;
}

/** Métricas nuevas que aporta la malla para una neurona (enlace + ficha). */
function metricasDeEnlace(fila: DispositivoMallaRow, rtt?: number): SignalMetric[] {
  const metricas: SignalMetric[] = [{ label: "Enlace P2P", value: valorEnlace(fila, rtt) }];
  const ruta = fila.enlace.ruta;
  if (ruta) metricas.push({ label: "Ruta", value: etiquetaRuta(ruta.clase) });
  const bytes = trafico(ruta);
  if (bytes) metricas.push({ label: "Tráfico P2P", value: bytes });
  const ficha = fila.ficha;
  if (!ficha) return metricas;
  const capasActivas = Object.entries(ficha.capas)
    .filter(([, activa]) => activa)
    .map(([capa]) => capa);
  metricas.push(
    { label: "Versión del OS", value: ficha.versionOS },
    { label: "RAM", value: ficha.ramClase },
    { label: "Backend local", value: ficha.backendLocal ? "sí" : "no" },
    {
      label: "Sirve Astraura 1.58",
      value:
        ficha.sirveAstraura === undefined
          ? "sin dato"
          : ficha.sirveAstraura
            ? `sí${ficha.astrauraLatenciaMs === undefined ? "" : ` · ${Math.round(ficha.astrauraLatenciaMs)} ms`}`
            : "no",
    },
    { label: "Capas 1.58 activas", value: capasActivas.join(", ") || "ninguna" },
  );
  return metricas;
}

/**
 * Funde métricas sin perder las previas ni duplicar etiquetas: una métrica
 * nueva con etiqueta ya presente SUSTITUYE a la vieja en su posición; las
 * demás nuevas se añaden al final. Defensivo ante duplicados ya existentes
 * (se conserva solo la primera aparición).
 */
function sustituirMetricas(actuales: SignalMetric[], nuevas: SignalMetric[]): SignalMetric[] {
  const pendientes = new Map(nuevas.map((m) => [m.label, m]));
  const vistas = new Set<string>();
  const resultado: SignalMetric[] = [];
  for (const metrica of actuales ?? []) {
    if (vistas.has(metrica.label)) continue;
    vistas.add(metrica.label);
    resultado.push(pendientes.get(metrica.label) ?? metrica);
    pendientes.delete(metrica.label);
  }
  return [...resultado, ...pendientes.values()];
}

/**
 * enriquecerConMalla — para cada señal `account` cuyo `starseed.sourceId`
 * tenga fila en la malla, añade las métricas del enlace P2P y de la ficha.
 * Con el enlace CONECTADO además: `starseed.online = true`, la calidad pasa a
 * ser la latencia REAL del canal (`qualityFromRtt`) y, si la ruta es
 * host↔host, la colocación declara que están en la misma red local.
 * Una señal sin fila se devuelve INTACTA (misma referencia).
 */
export function enriquecerConMalla(
  senales: DetectedSignal[],
  filas: DispositivoMallaRow[] | undefined,
): DetectedSignal[] {
  const porNeurona = new Map((filas ?? []).map((fila) => [fila.neuronId, fila]));
  return (senales ?? []).map((senal) => {
    if (senal.antenna !== "account" || !senal.starseed) return senal;
    const fila = porNeurona.get(senal.starseed.sourceId);
    if (!fila) return senal;
    const candidatoRtt = fila.enlace.latenciaMs ?? fila.enlace.ruta?.rttMs ?? undefined;
    const rtt =
      typeof candidatoRtt === "number" && Number.isFinite(candidatoRtt) ? candidatoRtt : undefined;
    const conectada = fila.enlace.estado === "conectado";
    const esLan = conectada && fila.enlace.ruta?.clase === "misma-red-local";
    const detallePrevio = senal.placement?.detail ?? "";
    return {
      ...senal,
      metrics: sustituirMetricas(senal.metrics, metricasDeEnlace(fila, rtt)),
      quality: conectada && rtt !== undefined ? qualityFromRtt(rtt) : senal.quality,
      qualityDetail:
        conectada && rtt !== undefined
          ? `Calidad calculada con la latencia REAL del canal P2P: ${Math.round(rtt)} ms.`
          : senal.qualityDetail,
      starseed: conectada ? { ...senal.starseed, online: true } : senal.starseed,
      placement:
        esLan && !detallePrevio.includes(DETALLE_LAN)
          ? { ...senal.placement, detail: `${detallePrevio} · ${DETALLE_LAN}` }
          : senal.placement,
    };
  });
}
