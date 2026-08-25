/**
 * geometria.ts — De RasgosAdn a geometría/material de Three.js.
 *
 * PORQUÉ EXISTE COMO MÓDULO APARTE (sin React, sin JSX)
 * Toda esta lógica es Three.js puro: construye/cachea BufferGeometry y
 * Material a partir de un `RasgosAdn`. Al no depender de React ni de
 * `@react-three/fiber`, se puede ejercitar en un script Node normal (con
 * `tsx`) sin DOM ni WebGL — así es como se midió el coste de 30 avatares
 * (ver el informe de la tarea): el mismo código que monta `<AvatarSer>` es
 * el que se cronometró, no una reimplementación de mentira.
 *
 * REGLA DE ORO: TODO lo que afecte a la FORMA sale de `adn` de manera
 * determinista (semilla, xorshift). Cero `Math.random()` aquí — dos
 * renders del mismo ser deben producir exactamente la misma malla, igual
 * que `derivarAdn()` produce exactamente los mismos rasgos.
 *
 * REUTILIZACIÓN (el encargo pide "reutiliza geometrías y materiales entre
 * instancias en vez de crear uno por avatar"):
 *   · Geometrías base (el sólido sin desplazar), el anillo orbital unitario
 *     y el halo unitario viven en cachés de módulo — hay como mucho 6
 *     sólidos × 4 niveles de detalle + 3 niveles de anillo + 1 halo: un
 *     puñado de objetos, compartidos por TODOS los seres que existan.
 *   · Lo único que se clona por instancia es el núcleo, y solo cuando la
 *     rugosidad necesita desplazar vértices (ver `construirGeometriaNucleo`);
 *     en detalle "bajo" ni eso: se devuelve la base compartida tal cual.
 *   · Los materiales SÍ son un objeto por ser (cada uno tiene un color
 *     único), pero mantienen siempre la misma "forma" (mismas propiedades,
 *     mismos flags) para que el renderer de Three.js reutilice el MISMO
 *     programa de shader compilado entre todos ellos — lo caro de un
 *     material no es el objeto JS, es compilar su shader. Ver el informe:
 *     `renderer.info.programs` se mide y se queda plano al subir a 30 seres.
 */

import * as THREE from "three";
import type { RasgosAdn, SolidoBase } from "@/lib/astraura/genesis-dna";
import { createSimplexNoise2D } from "@/components/aurora/quantum-orb";

/** Nivel de detalle de renderizado — NO confundir con `adn.facetas` (ese es
 * identidad del ser; este es una palanca de coste que el mundo compartido
 * ajusta según cuántos seres hay a la vez en pantalla). */
export type NivelDetalle = "alto" | "medio" | "bajo";

// ═══════════════════════════════════════════════════ Color: hsl() → THREE.Color

/**
 * `derivarAdn()` emite `hsl(H S% L%)` (sintaxis CSS moderna, sin comas) —
 * la misma que usa `applyAlpha()` en `@/lib/utils.ts`. `THREE.Color.set()`
 * NO la entiende (su parser solo reconoce `hsl(H, S%, L%)` con comas y
 * devuelve blanco en silencio si el formato no matchea su regex — se
 * comprobó a mano antes de escribir esto). Por eso aquí se extraen los tres
 * números y se llama a `setHSL()`, que no depende de parseo de string.
 *
 * `THREE.SRGBColorSpace` NO es opcional aquí — se comprobó a mano (y se
 * vio en un render real: la paleta salía apagada/gris en vez de vívida).
 * Con `ColorManagement` activado (por defecto desde hace varias versiones
 * de Three.js), `setHSL()` sin ese cuarto argumento interpreta H/S/L como
 * si YA estuvieran en el espacio de trabajo lineal, no en sRGB — que es el
 * espacio en el que un navegador interpretaría este mismo `hsl(...)` si lo
 * usara como CSS. Sin decirlo explícitamente, el resultado NO es el color
 * que un navegador mostraría para ese mismo string.
 */
export function colorDesdeHsl(hsl: string): THREE.Color {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(hsl);
  const color = new THREE.Color();
  if (!m) return color.setRGB(1, 1, 1); // degradación defensiva, igual que hexToRgb en quantum-orb-theme.ts
  const [, h, s, l] = m;
  return color.setHSL(Number(h) / 360, Number(s) / 100, Number(l) / 100, THREE.SRGBColorSpace);
}

// ═══════════════════════════════════════════════════ Datos del cubo (Three.js no trae uno "detail-subdividible")

/**
 * Three.js da Tetrahedron/Octahedron/Dodecahedron/Icosahedron con parámetro
 * `detail` (subdivide y proyecta cada vértice nuevo sobre la esfera de
 * `radius`) pero no un "Cube" equivalente — así que se define el cubo con
 * la misma API base (`PolyhedronGeometry`) para que los 6 sólidos compartan
 * exactamente el mismo mecanismo de facetas. 8 vértices únicos + 12
 * triángulos con bobinado saliente verificado (todas las normales apuntan
 * hacia afuera del centro — comprobado por cálculo, no a ojo).
 */
const CUBO_VERTICES: number[] = [
  -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
];
const CUBO_INDICES: number[] = [
  0, 2, 1, 0, 3, 2, 4, 6, 7, 4, 5, 6, 0, 5, 4, 0, 1, 5,
  3, 6, 2, 3, 7, 6, 0, 7, 3, 0, 4, 7, 1, 6, 5, 1, 2, 6,
];

// ═══════════════════════════════════════════════════ Niveles de detalle → subdivisión/segmentos

/** Techo de subdivisión por nivel de detalle. `facetas` (1–4, ver genesis-dna.ts)
 * pide `facetas-1` de subdivisión "ideal"; el nivel de detalle la recorta. */
const TECHO_SUBDIVISION: Record<NivelDetalle, number> = { alto: 3, medio: 2, bajo: 1 };

/** Igual que arriba pero para "esfera" (usa segmentos de SphereGeometry, no
 * `detail` de poliedro — una esfera de verdad se ve más limpia que un
 * icosaedro subdividido pasando por "casi esfera"). */
const SEGMENTOS_POR_FACETA: readonly number[] = [10, 14, 20, 28];
const TECHO_SEGMENTOS: Record<NivelDetalle, number> = { alto: 28, medio: 16, bajo: 9 };

function subdivisionEfectiva(facetas: number, detalle: NivelDetalle): number {
  const deseada = Math.max(0, Math.min(3, Math.round(facetas) - 1));
  return Math.min(deseada, TECHO_SUBDIVISION[detalle]);
}

function segmentosEsferaEfectivos(facetas: number, detalle: NivelDetalle): number {
  const idx = Math.max(0, Math.min(SEGMENTOS_POR_FACETA.length - 1, Math.round(facetas) - 1));
  return Math.min(SEGMENTOS_POR_FACETA[idx], TECHO_SEGMENTOS[detalle]);
}

// ═══════════════════════════════════════════════════ Geometría base del núcleo (compartida)

const RADIO_UNIDAD = 1; // todo se construye a radio 1; el tamaño real llega por `scale` en el componente.

const cacheBase = new Map<string, THREE.BufferGeometry>();

function construirBaseSolido(solido: SolidoBase, subdivision: number, segmentosEsfera: number): THREE.BufferGeometry {
  switch (solido) {
    case "tetraedro":
      return new THREE.TetrahedronGeometry(RADIO_UNIDAD, subdivision);
    case "cubo":
      return new THREE.PolyhedronGeometry(CUBO_VERTICES, CUBO_INDICES, RADIO_UNIDAD, subdivision);
    case "octaedro":
      return new THREE.OctahedronGeometry(RADIO_UNIDAD, subdivision);
    case "dodecaedro":
      return new THREE.DodecahedronGeometry(RADIO_UNIDAD, subdivision);
    case "icosaedro":
      return new THREE.IcosahedronGeometry(RADIO_UNIDAD, subdivision);
    case "esfera":
    default:
      // Segmentos ancho/alto ~1.5:1 — proporción estándar de una UV-sphere.
      // Nota comprobada (no es un bug de este módulo): CUALQUIER UV-sphere de
      // Three.js tiene 2 triángulos degenerados en sus polos (varios vértices
      // colapsan al mismo punto), así que tras `computeVertexNormals()` esos
      // 2 vértices —de cientos— quedan con normal de longitud ~0. Se verificó
      // que ocurre igual en una esfera SIN desplazar: es del propio
      // SphereGeometry, no de la rugosidad. Se deja así a propósito: cambiar
      // a un icosaedro subdividido lo evitaría, pero entonces "esfera" se
      // vería igual que "icosaedro" a facetas bajas — la esfera de verdad
      // debe leerse distinta en especie, no solo en pulido.
      return new THREE.SphereGeometry(RADIO_UNIDAD, segmentosEsfera, Math.max(6, Math.round(segmentosEsfera * 0.65)));
  }
}

/**
 * Geometría base SIN desplazar, cacheada por (sólido, nivel de detalle
 * efectivo). Como mucho 6 sólidos × 4 niveles de subdivisión ≈ 24 entradas
 * para TODA la aplicación — cualquier ser que comparta sólido+facetas
 * recorta reutiliza el mismo objeto.
 */
export function geometriaBaseNucleo(adn: Pick<RasgosAdn, "solido" | "facetas">, detalle: NivelDetalle): THREE.BufferGeometry {
  const subdivision = subdivisionEfectiva(adn.facetas, detalle);
  const segEsfera = segmentosEsferaEfectivos(adn.facetas, detalle);
  const clave = adn.solido === "esfera" ? `esfera:${segEsfera}` : `${adn.solido}:${subdivision}`;
  let geo = cacheBase.get(clave);
  if (!geo) {
    geo = construirBaseSolido(adn.solido, subdivision, segEsfera);
    geo.computeBoundingSphere();
    cacheBase.set(clave, geo);
  }
  return geo;
}

// ═══════════════════════════════════════════════════ Rugosidad + simetría → desplazamiento por vértice

/**
 * Desplaza radialmente cada vértice de una copia de la base, mezclando dos
 * ruidos exactamente como `turbulence()` en `quantum-orb.tsx`: uno que solo
 * depende del ÁNGULO (mantiene lóbulos regulares y reconocibles) y otro que
 * depende de la POSICIÓN completa (rompe cualquier eje). `simetria` decide
 * la mezcla, `rugosidad` la amplitud. Reutiliza el MISMO generador de ruido
 * simplex de la orbe (sembrado con `adn.semilla`) — la piel de un ser
 * "emparentada" con la turbulencia de la orbe, no un ruido inventado aparte.
 *
 * Se sabe (comprobado, no supuesto) que TODOS los vértices de las bases de
 * este módulo están exactamente a radio 1 — por eso basta con normalizar la
 * posición para obtener la dirección y reescribir su longitud.
 */
function desplazarRugosidad(geo: THREE.BufferGeometry, semilla: number, simetria: number, rugosidad: number): void {
  if (rugosidad <= 0.001) return;
  const noise = createSimplexNoise2D(semilla || 1);
  const pos = geo.attributes.position;
  const AMPLITUD = 0.32; // fracción del radio; suficiente para notarse sin desgarrar la silueta.
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const r = dir.length() || 1;
    dir.divideScalar(r); // dirección unitaria
    const theta = Math.atan2(dir.z, dir.x);
    const phi = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const simetrico = noise(Math.cos(theta) * 2.1 + Math.cos(phi) * 2.1, Math.sin(theta) * 2.1 + Math.sin(phi) * 2.1);
    const asimetrico = noise(theta * 3.7 + phi * 1.3, phi * 4.1 - theta * 0.6);
    const mezcla = simetrico * simetria + asimetrico * (1 - simetria);
    const nuevoRadio = r * (1 + mezcla * rugosidad * AMPLITUD);
    pos.setXYZ(i, dir.x * nuevoRadio, dir.y * nuevoRadio, dir.z * nuevoRadio);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

/**
 * Geometría del núcleo LISTA para montar en un `<mesh>`.
 *
 * En "bajo" se devuelve la base COMPARTIDA sin clonar ni desplazar — es la
 * palanca de coste más grande del componente (evita 1 clon + 1 recorrido de
 * vértices + 1 recálculo de normales por avatar) y es exactamente lo que
 * pide el encargo: "que en bajo... apague lo caro". Con eso, decenas de
 * seres en detalle bajo pueden compartir literalmente el MISMO objeto de
 * geometría si coinciden en sólido — no solo una base parecida.
 *
 * `dispose` en el resultado indica si quien la use debe liberarla al
 * desmontar (`true` = es un clon propio de esta instancia) o dejarla vivir
 * (`false` = es la base compartida; liberarla rompería a todos los demás).
 */
export function construirGeometriaNucleo(adn: RasgosAdn, detalle: NivelDetalle): { geometria: THREE.BufferGeometry; dispose: boolean } {
  const base = geometriaBaseNucleo(adn, detalle);
  if (detalle === "bajo" || adn.rugosidad <= 0.001) {
    return { geometria: base, dispose: false };
  }
  const propia = base.clone();
  desplazarRugosidad(propia, adn.semilla, adn.simetria, adn.rugosidad);
  return { geometria: propia, dispose: true };
}

/**
 * Estiramiento no uniforme por eje — la otra mitad de cómo se nota la
 * simetría (además de mezclarse en el ruido de la superficie): un ser
 * `simetria=1` queda perfectamente proporcionado; uno bajo en simetría se
 * ve visiblemente ladeado/alargado en un eje, AUNQUE su rugosidad sea 0 (un
 * cuerpo liso pero torcido es una silueta distinta de uno bulboso pero
 * recto). Es una transformación de `scale`, no toca geometría: coste cero.
 */
export function escalaPorSimetria(adn: Pick<RasgosAdn, "semilla" | "simetria">): [number, number, number] {
  const jitter = (indice: number): number => {
    let x = (adn.semilla ^ (0x9e3779b9 * (indice + 11))) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return 0.82 + (x / 4294967296) * 0.36; // 0.82..1.18
  };
  const t = adn.simetria;
  const lerp1 = (v: number): number => 1 + (v - 1) * (1 - t);
  return [lerp1(jitter(0)), lerp1(jitter(1)), lerp1(jitter(2))];
}

// ═══════════════════════════════════════════════════ Órbitas: anillo unitario compartido + inclinación

const ANILLO_SEGMENTOS: Record<NivelDetalle, readonly [radial: number, tubular: number]> = {
  alto: [8, 28],
  medio: [6, 16],
  bajo: [4, 10],
};

const cacheAnillo = new Map<NivelDetalle, THREE.TorusGeometry>();

/** Anillo orbital a radio 1 y tubo fino — se escala por avatar y por radio de
 * órbita vía `mesh.scale`, así TODAS las órbitas de TODOS los seres en un
 * mismo nivel de detalle comparten el mismo objeto de geometría. */
export function geometriaAnilloUnidad(detalle: NivelDetalle): THREE.TorusGeometry {
  let geo = cacheAnillo.get(detalle);
  if (!geo) {
    const [radial, tubular] = ANILLO_SEGMENTOS[detalle];
    geo = new THREE.TorusGeometry(1, 0.028, radial, tubular);
    cacheAnillo.set(detalle, geo);
  }
  return geo;
}

/** Ángulo de inclinación determinista de la órbita `indice` de un ser: mismo
 * ser, misma semilla ⇒ misma inclinación siempre (nada de Math.random()). */
export function inclinacionOrbita(semilla: number, indice: number): number {
  let x = (semilla ^ (0x9e3779b9 * (indice + 41))) >>> 0;
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  return (x / 4294967296) * Math.PI - Math.PI / 2; // -90°..+90°
}

// ═══════════════════════════════════════════════════ Halo: esfera unitaria compartida

let geometriaHaloCompartida: THREE.IcosahedronGeometry | null = null;

/** Halo = una esfera de baja poligonización, cara interna (`BackSide`) y
 * blend aditivo — solo se ve el "borde" al contraluz, el mismo truco barato
 * de rim-light que usar un shader de Fresnel de verdad, sin escribir GLSL. */
export function geometriaHalo(): THREE.IcosahedronGeometry {
  if (!geometriaHaloCompartida) geometriaHaloCompartida = new THREE.IcosahedronGeometry(1, 1);
  return geometriaHaloCompartida;
}

// ═══════════════════════════════════════════════════ Materiales

/**
 * Núcleo. La "forma" del material (qué propiedades trae, transparent,
 * flatShading…) es IDÉNTICA para todos los seres del mismo nivel de
 * detalle — solo cambian color/emissive/opacity, que son uniforms, no
 * defines de shader. Eso es lo que deja que Three.js comparta un único
 * programa compilado entre 30 materiales distintos (ver informe).
 *
 * Mapeo de rasgos → material (todos documentados en RasgosAdn):
 *   · densidad  → opacity ("cuánta materia tiene el cuerpo" — literal).
 *   · rugosidad → un empujón extra a `roughness` PBR (además de deformar
 *                 la malla): una piel irregular también se ve más mate.
 *   · densidad  → metalness (más materia, más "sólido/metálico"; un ser
 *                 etéreo de baja densidad se ve más vítreo).
 *   · evolucion → emissiveIntensity base (un ser más desarrollado, además
 *                 de más aura, brilla un poco más desde dentro).
 * En "bajo" se usa MeshBasicMaterial (sin cálculo de luz: lo más barato que
 * existe) — la paleta se sigue viendo, pero no cuesta nada de sombreado.
 */
export function materialNucleo(adn: RasgosAdn, detalle: NivelDetalle): THREE.Material {
  const color = colorDesdeHsl(adn.paleta.primario);
  if (detalle === "bajo") {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 + adn.densidad * 0.35 });
  }
  const acento = colorDesdeHsl(adn.paleta.acento);
  return new THREE.MeshStandardMaterial({
    color,
    emissive: acento,
    // Deliberadamente BAJO: un metalness alto casi anula la reflexión difusa
    // en PBR (los metales apenas tienen albedo difuso), y eso dejaba que el
    // emissive (acento) se comiera visualmente a `primario` — comprobado en
    // un render real antes de fijar estos rangos, no a ojo.
    emissiveIntensity: 0.08 + adn.evolucion * 0.22,
    roughness: Math.min(0.85, 0.25 + adn.rugosidad * 0.5),
    metalness: 0.05 + adn.densidad * 0.25,
    transparent: true,
    opacity: 0.55 + adn.densidad * 0.45,
  });
}

/** Anillos orbitales — siempre sin luz (una órbita no tiene "sombreado", es
 * una línea de energía) y con blend aditivo para que se vean como trazos de
 * luz superpuestos, no como plástico sólido. */
export function materialOrbita(adn: RasgosAdn): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: colorDesdeHsl(adn.paleta.secundario),
    transparent: true,
    opacity: 0.45 + adn.aura * 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** Halo — aditivo, sin escritura de profundidad (para no tapar lo que hay
 * detrás) y opacidad directamente proporcional a `aura`. */
export function materialHalo(adn: RasgosAdn): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: colorDesdeHsl(adn.paleta.acento),
    transparent: true,
    opacity: adn.aura * 0.55,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ═══════════════════════════════════════════════════ Limpieza

/** Libera un recurso por-instancia (el resultado de `construirGeometriaNucleo`
 * cuando `dispose` es `true`). Nunca se llama sobre geometría compartida. */
export function liberarGeometriaInstancia(resultado: { geometria: THREE.BufferGeometry; dispose: boolean }): void {
  if (resultado.dispose) resultado.geometria.dispose();
}
