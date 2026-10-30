/**
 * Ayudantes puros del ajuste «Medios» del cerebro (CB1013S, contrato §8).
 * Sin Supabase, sin `window`, sin `node:*`: entrada → salida, directo a pruebas.
 */

import type { MemoryDestinationsConfig } from "@/lib/brains/memory-destinations";
import type { AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { destinosDe, type Dato, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";

/** Id de la opción «aplica a todo destino activo»: sí es `medios.almacenamiento: ["auto"]` o lista vacía. */
export const ID_AUTO = "auto";

export interface OpcionMedio {
  id: string;
  texto: string;
}

/** Motivos que destinosDe() ya usa, en línea para la interfaz. */
const MOTORES_REALES = ["starseed", "gdrive", "brain-store", "memory-offline", "syncthing"];

/** Clase de dato que va a la malla del cristal, según la privacidad del objetivo. */
export function claseDato(privacidad: AjustesObjetivo["privacidad"]): Dato["clase"] {
  return privacidad === "publico" ? "publico" : privacidad === "perfil" ? "interno" : "privado";
}

/** Opciones de una capacidad: «auto» primero, luego servidores del cerebro y neuronas, sin ids repetidos. */
export function opcionesCapacidad(
  servidores: { id: string; name?: string }[] | undefined,
  neuronas: { id: string; name?: string }[] | undefined,
): OpcionMedio[] {
  const opciones: OpcionMedio[] = [{ id: ID_AUTO, texto: "Automático" }];
  const vistos = new Set<string>([ID_AUTO]);
  for (const [origen, lista] of [["servidor", servidores ?? []], ["neurona", neuronas ?? []]] as const) {
    for (const item of lista) {
      if (!item?.id || vistos.has(item.id)) continue;
      vistos.add(item.id);
      const nombre = item.name?.trim() || item.id;
      opciones.push({ id: item.id, texto: origen === "neurona" ? `${nombre} (neurona)` : nombre });
    }
  }
  return opciones;
}

/** scope que corresponde a la privacidad elegida, para que la pestaña del hub casé con ella (§8: se aplica). */
export function scopeDePrivacidad(
  scopeActual: string | null | undefined,
  privacidad: AjustesObjetivo["privacidad"],
): string {
  const actual = (scopeActual ?? "").trim().toLowerCase();
  const publica = actual === "group" || actual === "community" || actual === "page";
  switch (privacidad) {
    case "perfil":
      return "profile";
    case "grupo":
      return publica ? actual : "group";
    case "publico":
      return publica ? actual : "page";
    case "privado":
    default:
      return publica ? "account" : actual || "account";
  }
}

export interface DestinoPanel {
  id: string;
  texto: string;
  activo: boolean;
  elegido: boolean;
  /** Línea que explica adónde va cada dato, con guardar/descartados de destinosDe() (malla del cristal). */
  linea: string;
}

interface BaseDestino {
  id: string;
  texto: string;
  activo: boolean;
  destino: DestinoAlmacen;
}

/** Une los destinos del cerebro con lo elegido y explica, uno por uno, adónde va cada dato. */
export function panelAlmacenamiento(entrada: {
  destinos: MemoryDestinationsConfig;
  clase: Dato["clase"];
  elegidos: string[];
}): DestinoPanel[] {
  const base: BaseDestino[] = [
    {
      id: "local",
      texto: "Este aparato",
      activo: true,
      destino: { id: "local", tipo: "aparato", motor: "memory-offline", publico: false },
    },
    {
      id: "starseed",
      texto: "StarSeed",
      activo: entrada.destinos.starseed.enabled,
      destino: { id: "starseed", tipo: "cerebro", motor: "starseed", publico: false },
    },
    ...entrada.destinos.external.map((e) => ({
      id: e.id,
      texto: e.label,
      activo: true,
      destino: { id: e.id, tipo: "servidor", motor: "brain-store", publico: false } as DestinoAlmacen,
    })),
    {
      id: "p2p",
      texto: entrada.destinos.p2p.label ? `Syncthing · ${entrada.destinos.p2p.label}` : "Syncthing (P2P)",
      activo: entrada.destinos.p2p.enabled,
      destino: { id: "p2p", tipo: "aparato", motor: "syncthing", publico: false },
    },
  ];
  const esAuto = entrada.elegidos.length === 0 || entrada.elegidos.includes(ID_AUTO);
  const { guardar, descartados } = destinosDe({ clase: entrada.clase }, {
    politicaContexto: base.map((b) => b.id),
    disponibles: base.map((b) => b.destino),
    // Con «Auto» manda la política (los activos); sin auto, manda lo elegido.
    elegidosPorDato: esAuto ? undefined : entrada.elegidos,
    motoresReales: MOTORES_REALES,
  });
  return base.map((b) => {
    const elegido = esAuto ? b.activo : entrada.elegidos.includes(b.id);
    let linea: string;
    if (!b.activo) linea = "Por hoy está apagado en los destinos del cerebro.";
    else if (guardar.some((g) => g.id === b.id)) linea = `Guarda el dato: ${b.destino.tipo}, motor ${b.destino.motor}.`;
    else if (descartados.some((d) => d.id === b.id)) {
      linea = `Lo descarta (malla del cristal): ${descartados.find((d) => d.id === b.id)?.motivo ?? "sin motivo"}.`;
    } else linea = "No elegido ahora para este objetivo.";
    return { id: b.id, texto: b.texto, activo: b.activo, elegido, linea };
  });
}

/**
 * Parche de `memoryDestinations` para que lo elegido se aplique de verdad (§8, cerebro entero):
 * solo StarSeed y Syncthing se pueden encender/apagar por cerebro; local y externos quedan como están.
 * Devuelve null si no hay nada que cambiar (incluido modo auto o lista vacía).
 */
export function patchDestinos(
  destinos: MemoryDestinationsConfig,
  elegidos: string[],
): Partial<MemoryDestinationsConfig> | null {
  if (elegidos.length === 0 || elegidos.includes(ID_AUTO)) return null;
  const starseed = elegidos.includes("starseed");
  const p2p = elegidos.includes("p2p");
  if (destinos.starseed.enabled === starseed && destinos.p2p.enabled === p2p) return null;
  return {
    starseed: { enabled: starseed },
    p2p: {
      enabled: p2p,
      folderId: destinos.p2p.folderId,
      label: destinos.p2p.label,
    },
  };
}
