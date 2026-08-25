/**
 * mundo-layout.ts — Funciones PURAS de colocación y agrupamiento del mundo.
 *
 * Nada aquí toca React, three.js ni el DOM: solo datos de entrada (seres,
 * vínculos, comunidades, espacios) y datos de salida (posiciones). Eso es
 * deliberado — es la parte que de verdad puede estar mal sin que se note a
 * simple vista (dos comunidades que en realidad no se agrupan, un vínculo
 * que no atrae), así que es la parte que se puede probar con vitest sin
 * levantar WebGL. Ver mundo-layout.test.ts.
 *
 * MOTOR DE FUERZAS: se reutiliza `HarmonicForceEngine`
 * (`hermes-integration/05-force-graph-engine.ts`), no se escribe uno nuevo.
 * Sirve tal cual porque sus tipos (`GraphNode3D`/`GraphEdge3D`) ya son
 * genéricos — `type: string`, `data: Record<string, unknown>` — no están
 * atados al grafo de memoria para el que se escribió originalmente. Aplica
 * Hooke armónico entre nodos conectados + repulsión de Coulomb + gravedad
 * central + amortiguamiento; exactamente lo que pide la tarea ("grafo de
 * fuerzas honesto"), ya escrito, ya usado en este mismo repo
 * (`components/network/harmonic-graph-3d.tsx`) y determinista (sin
 * `Math.random` en su interior).
 *
 * QUÉ SE LE AÑADE ENCIMA
 *  1. Nodos "hub" sintéticos para comunidades y espacios (no existen en el
 *     contrato como nodos de grafo, pero convertirlos en uno es la forma
 *     honesta de que "pertenecer" tire de verdad en vez de ser un adorno):
 *     cada ser gana una arista débil hacia el hub de su comunidad y otra
 *     hacia el de su espacio. Tres capas de tirón con pesos distintos
 *     (vínculo > comunidad > espacio) — ver mundo-constantes.ts.
 *  2. Posiciones iniciales deterministas (espiral áurea + hash FNV-1a de
 *     genesis-dna.ts, cero `Math.random`): mismos datos, mismo resultado,
 *     siempre — igual que `derivarAdn`. Sin esto el motor no rompe, pero
 *     dos ejecuciones podrían converger a rotaciones/reflejos distintos del
 *     mismo grafo, y las pruebas tendrían que comparar con tolerancia en
 *     vez de con igualdad exacta.
 *  3. Convergencia-y-congelado en vez de física perpetua: se ejecutan N
 *     pasos y se lee el resultado UNA vez, no se deja el motor corriendo
 *     para siempre dentro de un `useFrame` (a diferencia de
 *     `harmonic-graph-3d.tsx`, que hace `tick()` en cada fotograma sin
 *     parar). Con decenas de nodos la física converge en submilisegundos
 *     (ver el test de rendimiento), así que pagar ese coste una vez al
 *     cambiar los datos, no 60 veces por segundo para siempre, es la
 *     diferencia entre un mundo fluido y uno que gasta fotogramas en física
 *     que nadie ve cambiar.
 *  4. Frecuencia real por nodo: la de un ser es `adn.frecuencia` (432–963 Hz,
 *     la misma tabla armónica que ya usa el resto del OS —
 *     `FRECUENCIA_POR_SOLIDO` en genesis-dna.ts, que a su vez documenta que
 *     viene de `hermes-integration/02-layers.ts`); los hubs usan un tono
 *     representativo de su función (cubo/639 "Conexión" para comunidad,
 *     esfera/432 "Unidad" para espacio). Así `harmonicModulation()` dentro
 *     del motor — "frecuencias cercanas se atraen más" — compara tonos que
 *     de verdad significan algo, no una constante repetida en cada arista.
 */

import { HarmonicForceEngine } from "@/hermes-integration/05-force-graph-engine";
import type { GraphNode3D, GraphEdge3D, HarmonicConfig } from "@/hermes-integration/01-types";
import { fnv1a32, GOLDEN_ANGLE_DEG, FRECUENCIA_POR_SOLIDO } from "@/lib/astraura/genesis-dna";
import type { SerListado, Vinculo, Comunidad, Espacio } from "@/lib/astraura/genesis-types";
import {
  PESO_ARISTA_COMUNIDAD,
  PESO_ARISTA_ESPACIO,
  ITERACIONES_DISPOSICION_DEFECTO,
  RADIO_ESPIRAL_INICIAL,
  ALTURA_INICIAL,
  RELLENO_REGION,
  RADIO_REGION_VACIA,
} from "./mundo-constantes";
import type { PosicionMundo, RegionDispuesta, DisposicionMundo, AristaVisible } from "./mundo-tipos";

// ─────────────────────────────────────────────────────────── Agrupamiento

/**
 * ser → comunidades, resuelto como la UNIÓN de las dos direcciones del dato
 * (denormalizado a propósito en el contrato: `Comunidad.miembros` y
 * `SerListado.comunidades`). Si un lado no se actualizó, el otro basta —
 * perder una pertenencia real por una desincronización es peor que
 * mostrarla de más.
 */
export function agruparPorComunidad(
  seres: readonly SerListado[],
  comunidades: readonly Comunidad[],
): ReadonlyMap<string, readonly string[]> {
  const idsSeres = new Set(seres.map((s) => s.id));
  const bolsas = new Map<string, Set<string>>();
  for (const comunidad of comunidades) bolsas.set(comunidad.id, new Set());

  for (const comunidad of comunidades) {
    const bolsa = bolsas.get(comunidad.id);
    if (!bolsa) continue;
    for (const serId of comunidad.miembros) {
      if (idsSeres.has(serId)) bolsa.add(serId);
    }
  }
  for (const ser of seres) {
    for (const comunidadId of ser.comunidades) {
      bolsas.get(comunidadId)?.add(ser.id);
    }
  }

  const resultado = new Map<string, readonly string[]>();
  for (const [id, bolsa] of bolsas) resultado.set(id, Array.from(bolsa));
  return resultado;
}

/** espacio → habitantes, filtrado a seres que existen de verdad y sin
 * duplicados. A diferencia de comunidad, el contrato solo declara esta
 * pertenencia en un sentido (`Espacio.habitantes`) — `SerListado` no trae
 * `espacioHogarId` (ese campo vive en `Ser`, el tipo completo, no en el
 * listado ligero que recibe este componente). */
export function agruparPorEspacio(
  seres: readonly SerListado[],
  espacios: readonly Espacio[],
): ReadonlyMap<string, readonly string[]> {
  const idsSeres = new Set(seres.map((s) => s.id));
  const resultado = new Map<string, readonly string[]>();
  for (const espacio of espacios) {
    const habitantes = Array.from(new Set(espacio.habitantes.filter((id) => idsSeres.has(id))));
    resultado.set(espacio.id, habitantes);
  }
  return resultado;
}

// ────────────────────────────────────────────────────── Grafo de fuerzas

const PREFIJO_SER = "ser:";
const PREFIJO_COMUNIDAD = "comunidad:";
const PREFIJO_ESPACIO = "espacio:";

/** Flotante 0..1 determinista a partir de una cadena — sin `Math.random`,
 * reutilizando el mismo hash FNV-1a que ya usa `derivarAdn` para lo mismo. */
function pseudoAleatorio(clave: string): number {
  return fnv1a32(clave) / 4294967296;
}

/**
 * Posición inicial en espiral áurea (mismo ángulo que reparte los tonos de
 * un ser en `genesis-dna.ts` — filotaxis: nunca dos puntos se apilan, nunca
 * se agrupan por casualidad). Determinista por `indice` + `clave`, así que
 * el orden de entrada decide el punto de partida y nada más depende del
 * azar. El radio crece en raíz cuadrada del índice (espiral de Fermat),
 * así la densidad de puntos por área queda pareja en vez de amontonarse en
 * el borde.
 */
function posicionInicial(indice: number, clave: string): PosicionMundo {
  const angulo = indice * GOLDEN_ANGLE_DEG * (Math.PI / 180);
  const radio = RADIO_ESPIRAL_INICIAL * Math.sqrt(indice + 1);
  const alturaJitter = (pseudoAleatorio(`${clave}#y`) - 0.5) * ALTURA_INICIAL;
  return {
    x: Math.cos(angulo) * radio,
    y: alturaJitter,
    z: Math.sin(angulo) * radio,
  };
}

function colorSerNodo(ser: SerListado): string | undefined {
  return ser.adn?.paleta.primario ?? (ser.color ?? undefined);
}

/** Media de dos frecuencias conocidas por id de nodo (con respaldo si algún
 * extremo no está en el mapa — no debería pasar, pero un grafo no se cae
 * por un dato que falte). */
function frecuenciaArista(
  frecuencias: ReadonlyMap<string, number>,
  origen: string,
  destino: string,
  porDefecto: number,
): number {
  const fa = frecuencias.get(origen) ?? porDefecto;
  const fb = frecuencias.get(destino) ?? porDefecto;
  return (fa + fb) / 2;
}

/**
 * Construye el grafo de fuerzas (nodos + aristas) a partir de los datos del
 * mundo. Pura y determinista. Expuesta por separado de
 * `calcularDisposicionMundo` para poder inspeccionar/probar el grafo en sí
 * (cuántos nodos, cuántas aristas, con qué pesos) sin pagar el coste de
 * converger la física.
 */
export function construirGrafoMundo(
  seres: readonly SerListado[],
  vinculos: readonly Vinculo[],
  comunidades: readonly Comunidad[],
  espacios: readonly Espacio[],
): { nodos: GraphNode3D[]; aristas: GraphEdge3D[] } {
  const nodos: GraphNode3D[] = [];
  const idsNodos = new Set<string>();
  const frecuenciaPorNodo = new Map<string, number>();
  let indice = 0;

  const agregarNodo = (nodo: GraphNode3D): void => {
    nodos.push(nodo);
    idsNodos.add(nodo.id);
    frecuenciaPorNodo.set(nodo.id, nodo.frequency);
  };

  for (const ser of seres) {
    const id = PREFIJO_SER + ser.id;
    const evolucion = ser.adn?.evolucion ?? 0;
    agregarNodo({
      id,
      type: "ser",
      position: posicionInicial(indice++, id),
      velocity: { x: 0, y: 0, z: 0 },
      size: 3 + evolucion * 2,
      frequency: ser.adn?.frecuencia ?? FRECUENCIA_POR_SOLIDO.tetraedro,
      mass: 1 + evolucion * 1.5,
      label: ser.nombre,
      color: colorSerNodo(ser),
      data: { kind: "ser", id: ser.id },
    });
  }

  for (const comunidad of comunidades) {
    const id = PREFIJO_COMUNIDAD + comunidad.id;
    const tamano = comunidad.miembros.length;
    agregarNodo({
      id,
      type: "comunidad",
      position: posicionInicial(indice++, id),
      velocity: { x: 0, y: 0, z: 0 },
      size: 6 + tamano * 0.3,
      frequency: FRECUENCIA_POR_SOLIDO.cubo,
      mass: 8 + tamano * 0.5,
      label: comunidad.nombre,
      color: comunidad.color ?? undefined,
      data: { kind: "comunidad", id: comunidad.id },
    });
  }

  for (const espacio of espacios) {
    const id = PREFIJO_ESPACIO + espacio.id;
    const tamano = espacio.habitantes.length;
    agregarNodo({
      id,
      type: "espacio",
      position: posicionInicial(indice++, id),
      velocity: { x: 0, y: 0, z: 0 },
      size: 10 + tamano * 0.2,
      frequency: FRECUENCIA_POR_SOLIDO.esfera,
      mass: 14 + tamano * 0.5,
      label: espacio.nombre,
      data: { kind: "espacio", id: espacio.id },
    });
  }

  const aristas: GraphEdge3D[] = [];

  for (const vinculo of vinculos) {
    const origen = PREFIJO_SER + vinculo.origenId;
    const destino = PREFIJO_SER + vinculo.destinoId;
    // Defensivo: vínculo hacia un ser que no está en la lista recibida, o
    // un auto-vínculo (origen === destino) — ninguno de los dos es una
    // arista de atracción válida.
    if (origen === destino || !idsNodos.has(origen) || !idsNodos.has(destino)) continue;
    aristas.push({
      source: origen,
      target: destino,
      weight: Math.min(1, Math.max(0, vinculo.fuerza)),
      frequency: frecuenciaArista(frecuenciaPorNodo, origen, destino, FRECUENCIA_POR_SOLIDO.tetraedro),
      type: `vinculo:${vinculo.tipo}`,
    });
  }

  const porComunidad = agruparPorComunidad(seres, comunidades);
  for (const comunidad of comunidades) {
    const destino = PREFIJO_COMUNIDAD + comunidad.id;
    for (const serId of porComunidad.get(comunidad.id) ?? []) {
      const origen = PREFIJO_SER + serId;
      aristas.push({
        source: origen,
        target: destino,
        weight: PESO_ARISTA_COMUNIDAD,
        frequency: frecuenciaArista(frecuenciaPorNodo, origen, destino, FRECUENCIA_POR_SOLIDO.cubo),
        type: "comunidad",
      });
    }
  }

  const porEspacio = agruparPorEspacio(seres, espacios);
  for (const espacio of espacios) {
    const destino = PREFIJO_ESPACIO + espacio.id;
    for (const serId of porEspacio.get(espacio.id) ?? []) {
      const origen = PREFIJO_SER + serId;
      aristas.push({
        source: origen,
        target: destino,
        weight: PESO_ARISTA_ESPACIO,
        frequency: frecuenciaArista(frecuenciaPorNodo, origen, destino, FRECUENCIA_POR_SOLIDO.esfera),
        type: "espacio",
      });
    }
  }

  return { nodos, aristas };
}

// ──────────────────────────────────────────────────────────── Disposición

export interface OpcionesDisposicionMundo {
  /** Pasos de física a ejecutar antes de leer el resultado. */
  readonly iteraciones?: number;
  /** Ajustes opcionales al motor (para pruebas; en producción se usan los
   * valores por defecto del motor tal cual — reutilizarlo también significa
   * confiar en su calibración). */
  readonly config?: Partial<HarmonicConfig>;
}

function distanciaEntre(a: PosicionMundo, b: PosicionMundo): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function disponerRegiones(
  ids: readonly string[],
  prefijo: string,
  miembrosPorId: ReadonlyMap<string, readonly string[]>,
  posicionPorIdNodo: ReadonlyMap<string, PosicionMundo>,
  posicionesSeres: ReadonlyMap<string, PosicionMundo>,
): Map<string, RegionDispuesta> {
  const resultado = new Map<string, RegionDispuesta>();
  for (const id of ids) {
    const centro = posicionPorIdNodo.get(prefijo + id) ?? { x: 0, y: 0, z: 0 };
    const miembros = miembrosPorId.get(id) ?? [];
    let radio = RADIO_REGION_VACIA;
    for (const serId of miembros) {
      const posicionSer = posicionesSeres.get(serId);
      if (!posicionSer) continue;
      const candidato = distanciaEntre(centro, posicionSer) + RELLENO_REGION;
      if (candidato > radio) radio = candidato;
    }
    resultado.set(id, { id, centro, radio, miembros });
  }
  return resultado;
}

/**
 * LA función de colocación: dónde va cada ser, y el contorno real de cada
 * comunidad/espacio. Determinista — mismos seres/vínculos/comunidades/
 * espacios (y mismas `opciones`) producen siempre la misma disposición,
 * bit a bit.
 *
 * Lista de seres vacía → mundo vacío digno: mapas vacíos, cero iteraciones,
 * sin lanzar ni fabricar una posición de la nada.
 */
export function calcularDisposicionMundo(
  seres: readonly SerListado[],
  vinculos: readonly Vinculo[],
  comunidades: readonly Comunidad[],
  espacios: readonly Espacio[],
  opciones: OpcionesDisposicionMundo = {},
): DisposicionMundo {
  if (seres.length === 0) {
    return { seres: new Map(), comunidades: new Map(), espacios: new Map(), iteraciones: 0 };
  }

  const { nodos, aristas } = construirGrafoMundo(seres, vinculos, comunidades, espacios);
  const motor = new HarmonicForceEngine(opciones.config);
  motor.load(nodos, aristas);

  const pasos = Math.max(0, Math.floor(opciones.iteraciones ?? ITERACIONES_DISPOSICION_DEFECTO));
  for (let i = 0; i < pasos; i++) motor.tick();

  const { nodes: nodosFinales } = motor.getRenderState();

  const posicionesSeres = new Map<string, PosicionMundo>();
  const posicionPorIdNodo = new Map<string, PosicionMundo>();
  for (const nodo of nodosFinales) {
    posicionPorIdNodo.set(nodo.id, nodo.position);
    if (nodo.type === "ser" && nodo.id.startsWith(PREFIJO_SER)) {
      posicionesSeres.set(nodo.id.slice(PREFIJO_SER.length), nodo.position);
    }
  }

  const comunidadesDispuestas = disponerRegiones(
    comunidades.map((c) => c.id),
    PREFIJO_COMUNIDAD,
    agruparPorComunidad(seres, comunidades),
    posicionPorIdNodo,
    posicionesSeres,
  );
  const espaciosDispuestos = disponerRegiones(
    espacios.map((e) => e.id),
    PREFIJO_ESPACIO,
    agruparPorEspacio(seres, espacios),
    posicionPorIdNodo,
    posicionesSeres,
  );

  return {
    seres: posicionesSeres,
    comunidades: comunidadesDispuestas,
    espacios: espaciosDispuestos,
    iteraciones: pasos,
  };
}

// ──────────────────────────────────────────────────────── Aristas visibles

/**
 * Vínculos → aristas dibujables. A propósito NO incluye las aristas
 * sintéticas ser→comunidad/espacio que sí usa la física (arriba): esas
 * existen solo para que la posición signifique algo, pero dibujar una línea
 * de cada ser a cada hub de comunidad/espacio ensuciaría la escena sin
 * añadir información — la pertenencia ya se lee en el contorno de la
 * región (`RegionDispuesta`), no hace falta repetirla como línea.
 */
export function vinculosAAristasVisibles(
  vinculos: readonly Vinculo[],
  posicionesSeres: ReadonlyMap<string, PosicionMundo>,
): AristaVisible[] {
  const aristas: AristaVisible[] = [];
  for (const vinculo of vinculos) {
    if (vinculo.origenId === vinculo.destinoId) continue;
    if (!posicionesSeres.has(vinculo.origenId) || !posicionesSeres.has(vinculo.destinoId)) continue;
    aristas.push({
      id: vinculo.id,
      origenId: vinculo.origenId,
      destinoId: vinculo.destinoId,
      intensidad: Math.min(1, Math.max(0, vinculo.fuerza)),
      tipo: `vinculo:${vinculo.tipo}`,
      bidireccional: vinculo.bidireccional,
    });
  }
  return aristas;
}
