/**
 * Matriz de caracterización de `elegirEnlaces` (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Ayudante de pruebas (no es una suite: no lleva sufijo `.test`). Construye una matriz amplia y
 * determinista de enlaces × destinos × clases × tamaños × opciones, y la reduce a una forma compacta
 * (ids, rangos y motivos por índice de diccionario) para fijar en un JSON lo que `elegirEnlaces`
 * devolvía ANTES de delegar en el planificador único. La prueba compara esa foto con la de hoy.
 */

import type {
  ClaseEnvio,
  DestinoTransporte,
  Eleccion,
  EnlaceDisponible,
  OpcionesEleccion,
} from "@/lib/malla/eleccion-enlace";

function enlace(p: Partial<EnlaceDisponible> & Pick<EnlaceDisponible, "id" | "tipo">): EnlaceDisponible {
  return {
    etiqueta: p.id,
    alcanza: { syncDeviceId: "B" },
    abierto: true,
    sinInternet: false,
    admite: { mensaje: true, archivo: true, flujo: false },
    ...p,
  };
}

const MB = 1024 * 1024;

/** Todos los tipos de enlace que hay hoy, con y sin medidas, abiertos y cerrados. */
export const POOL: EnlaceDisponible[] = [
  enlace({ id: "local:1", tipo: "local", sinInternet: true, rttMs: 9, capacidadKbps: 20_000, admite: { mensaje: true, archivo: true, flujo: true } }),
  enlace({ id: "local:nativo-x", tipo: "local", sinInternet: true, rttMs: 5, alcanza: { neuronDeviceId: "N-B", syncDeviceId: "B", uid: "u" }, admite: { mensaje: true, archivo: true, flujo: true } }),
  enlace({ id: "local:cerrado", tipo: "local", abierto: false, sinInternet: true, admite: { mensaje: true, archivo: true, flujo: true } }),
  enlace({ id: "local:ls", tipo: "local", protocolo: "localsend", consentido: true, sinInternet: true, alcanza: { syncDeviceId: "B", uid: "u-otro" } }),
  enlace({ id: "local:ls-nc", tipo: "local", protocolo: "localsend", sinInternet: true, alcanza: { syncDeviceId: "B", uid: "u-otro" } }),
  enlace({ id: "nativo:192.168.1.20", tipo: "nativo", sinInternet: true, ruta: "misma-red-local", rttMs: 3, alcanza: { neuronDeviceId: "N-B", syncDeviceId: "B" }, consentido: true }),
  enlace({ id: "nativo:10.0.0.9", tipo: "nativo", sinInternet: true, ruta: "misma-red-local", rttMs: null, alcanza: { neuronDeviceId: "N-C" }, consentido: true }),
  enlace({ id: "ble:b1", tipo: "ble", sinInternet: true, rttMs: 40, capacidadKbps: 300, maxBytes: 20 * MB, alcanza: { neuronDeviceId: "N-B", syncDeviceId: "B", uid: "u" }, consentido: true }),
  enlace({ id: "ble:b2", tipo: "ble", sinInternet: true, rttMs: null, capacidadKbps: null, maxBytes: 20 * MB, alcanza: { neuronDeviceId: "N-C" }, consentido: true }),
  enlace({ id: "cuenta:B", tipo: "cuenta", ruta: "misma-red-local", rttMs: 4 }),
  enlace({ id: "cuenta:B2", tipo: "cuenta", ruta: "internet-directo", rttMs: 40, alcanza: { syncDeviceId: "B", uid: "u" } }),
  enlace({ id: "cuenta:B3", tipo: "cuenta", ruta: "reenviado-turn", rttMs: 90 }),
  enlace({ id: "cuenta:P", tipo: "cuenta", ruta: "misma-red-local", rttMs: 1, alcanza: { syncDeviceId: "P", uid: "u" } }),
  enlace({ id: "cuenta:Q", tipo: "cuenta", ruta: null, rttMs: 40, capacidadKbps: 900, alcanza: { syncDeviceId: "B" } }),
  enlace({ id: "par:v1", tipo: "par", alcanza: { syncDeviceId: "Z", uid: "u9" }, admite: { mensaje: true, archivo: false, flujo: false } }),
  enlace({ id: "par:v2", tipo: "par", rttMs: null, alcanza: { syncDeviceId: "B", uid: "u" } }),
  enlace({ id: "rele", tipo: "rele", alcanza: { difusion: true }, admite: { mensaje: true, archivo: false, flujo: false } }),
  enlace({ id: "lora", tipo: "lora", alcanza: { difusion: true }, sinInternet: true, maxBytes: 200, admite: { mensaje: true, archivo: false, flujo: false } }),
  // Duplicado: el segundo se ignora (se queda el primero que aparece).
  enlace({ id: "local:1", tipo: "local", sinInternet: true, rttMs: 1, admite: { mensaje: true, archivo: false, flujo: false } }),
];

export const POOLS: Array<{ nombre: string; enlaces: EnlaceDisponible[] }> = [
  { nombre: "todos", enlaces: POOL },
  { nombre: "todos-al-reves", enlaces: [...POOL].reverse() },
  { nombre: "sin-locales", enlaces: POOL.filter((e) => e.tipo !== "local") },
  { nombre: "vacio", enlaces: [] },
];

export const DESTINOS: Array<{ nombre: string; destino: DestinoTransporte }> = [
  { nombre: "sync-B", destino: { syncDeviceId: "B" } },
  { nombre: "neurona-N-B", destino: { neuronDeviceId: "N-B" } },
  { nombre: "neurona-N-C", destino: { neuronDeviceId: "N-C" } },
  { nombre: "uid-u", destino: { uid: "u" } },
  { nombre: "uid-u9", destino: { uid: "u9" } },
  { nombre: "enlace-cuenta-B", destino: { enlaceId: "cuenta:B" } },
  { nombre: "enlace-lora", destino: { enlaceId: "lora" } },
  { nombre: "B-rele-lora", destino: { syncDeviceId: "B", identidadRele: "fp", nodoLora: 7 } },
  { nombre: "u-rele", destino: { uid: "u", identidadRele: "fp" } },
  { nombre: "solo-lora", destino: { nodoLora: 3 } },
  { nombre: "nadie", destino: {} },
];

export const CLASES: ClaseEnvio[] = ["mensaje", "archivo", "flujo"];

export const BYTES: number[] = [0, 150, 201, 300 * 1024, 25 * MB];

export const OPCIONES: Array<{ nombre: string; opciones: OpcionesEleccion | undefined }> = [
  { nombre: "sin-opciones", opciones: undefined },
  { nombre: "app-nativa", opciones: { medioEmisor: "app-nativa" } },
  { nombre: "servidor-privado-u", opciones: { medioEmisor: "servidor", clase: "privado", miUid: "u" } },
  { nombre: "publico", opciones: { clase: "publico" } },
  { nombre: "interno", opciones: { clase: "interno" } },
  { nombre: "privado-navegador", opciones: { clase: "privado", medioEmisor: "navegador" } },
  { nombre: "puntuar-largo-id", opciones: { medioEmisor: "app-nativa", puntuar: (e) => -e.id.length } },
];

export interface CasoCaracterizacion {
  clave: string;
  enlaces: EnlaceDisponible[];
  destino: DestinoTransporte;
  clase: ClaseEnvio;
  bytes: number;
  opciones: OpcionesEleccion | undefined;
}

export function casos(): CasoCaracterizacion[] {
  const out: CasoCaracterizacion[] = [];
  for (const p of POOLS)
    for (const d of DESTINOS)
      for (const clase of CLASES)
        for (const bytes of BYTES)
          for (const o of OPCIONES) {
            out.push({
              clave: `${p.nombre}/${d.nombre}/${clase}/${bytes}/${o.nombre}`,
              enlaces: p.enlaces,
              destino: d.destino,
              clase,
              bytes,
              opciones: o.opciones,
            });
          }
  return out;
}

/** Forma compacta de una elección: «id|rango|#motivo» y «id|tipo|#motivo»; los motivos van a un diccionario. */
export function compactar(
  e: Eleccion,
  motivos: Map<string, number>,
  reparto?: string[],
): { e: string[]; d: string[]; r?: string[] } {
  const idx = (m: string): number => {
    let i = motivos.get(m);
    if (i === undefined) {
      i = motivos.size;
      motivos.set(m, i);
    }
    return i;
  };
  return {
    e: e.elegidos.map((x) => `${x.enlace.id}|${x.rango}|${idx(x.motivo)}`),
    d: e.descartados.map((x) => `${x.id}|${x.tipo}|${idx(x.motivo)}`),
    ...(reparto ? { r: reparto } : {}),
  };
}
