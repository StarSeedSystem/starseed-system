"use client";

/**
 * avatar-ser.tsx — `<AvatarSer adn={...} />`: el cuerpo de un ser, como
 * fragmento de escena R3F.
 *
 * NO trae su propio `<Canvas>` — A PROPÓSITO. El encargo dice: "en el mundo
 * compartido habrá decenas de estos a la vez". Un contexto WebGL por avatar
 * sería un desastre (los navegadores limitan los contextos WebGL
 * simultáneos POR PÁGINA ENTERA, no por componente — Chrome ronda 16;
 * treinta canvases independientes lo agotarían mucho antes de llegar a
 * treinta seres). Por eso esto es solo un `<group>` con mallas dentro,
 * pensado para vivir DENTRO de un `<Canvas>` ajeno — el del mundo
 * compartido (`genesis/mundo/`), sobre todo.
 *
 * ÚSALO ASÍ (dentro de tu propio `<Canvas>`, con MUCHOS seres a la vez):
 *   <Canvas>
 *     {seres.map((s) => <AvatarSer key={s.id} adn={s.adn} posicion={...} />)}
 *   </Canvas>
 *
 * SI SOLO NECESITAS UN SER SUELTO (una tarjeta, una fila de lista, sin
 * Canvas propio alrededor) NO USES ESTO DIRECTAMENTE — usa `AvatarAutonomo`
 * (`avatar-autonomo.tsx`), que ya trae su Canvas, sus luces, el respaldo
 * SVG sin WebGL y un cupo para no agotar contextos si aparecen muchos a la
 * vez en una lista corriente (así lo usa ya `../ser-avatar-slot.tsx`, la
 * puerta de entrada de Génesis a este módulo). `AvatarAutonomo` es
 * exactamente eso: un `AvatarSer` envuelto con todo lo que hace falta para
 * vivir suelto.
 *
 * QUÉ RASGO MUEVE QUÉ (todo trazable a un campo documentado en
 * `RasgosAdn`, nada inventado sin motivo):
 *   solido            → familia de geometría del núcleo (geometria.ts).
 *   facetas           → subdivisión/segmentos del núcleo (más = más
 *                        evolucionado = más liso y complejo; ver abajo).
 *   rugosidad         → desplazamiento por vértice de la superficie.
 *   simetria          → mezcla simétrica/asimétrica del ruido de arriba,
 *                        Y estiramiento no uniforme por eje (independiente
 *                        de la rugosidad: un cuerpo puede ser liso y
 *                        torcido, o bulboso y recto).
 *   paleta            → color del núcleo/halo/órbitas.
 *   pulso             → frecuencia del latido "lub-dub" del núcleo.
 *   densidad          → opacidad/metalicidad del material Y velocidad de
 *                        rotación del conjunto (más materia, más inercia
 *                        percibida — gira más despacio, no más rápido).
 *   aura              → opacidad del halo.
 *   orbitas/radios    → número y radio de los anillos orbitales.
 *   evolucion         → brillo emisivo base del núcleo.
 *
 * ACCESIBILIDAD: este componente es decorativo por definición — no lleva
 * DOM propio, no puede llevar `aria-label`. El nombre real del ser NO vive
 * aquí: lo pone quien monte el Canvas, como texto de verdad al lado (así
 * lo hace `AvatarAutonomo`, la referencia de cómo componerlo bien).
 */

import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { RasgosAdn } from "@/lib/astraura/genesis-dna";
import {
  construirGeometriaNucleo,
  escalaPorSimetria,
  geometriaAnilloUnidad,
  geometriaHalo,
  inclinacionOrbita,
  liberarGeometriaInstancia,
  materialHalo,
  materialNucleo,
  materialOrbita,
  type NivelDetalle,
} from "./geometria";
import { usePrefiereMovimientoReducido } from "./hooks";

export type { NivelDetalle } from "./geometria";

export interface AvatarSerProps {
  /** Los rasgos derivados del ser — la única fuente de verdad de la forma. */
  adn: RasgosAdn;
  /** Nivel de detalle/coste. Por defecto "alto"; el mundo compartido debe
   * bajarlo cuando hay muchos seres a la vez (ver el informe de coste). */
  detalle?: NivelDetalle;
  /** Fuerza animar sí/no. Sin especificar, seguimos `prefers-reduced-motion`
   * del sistema — no lo pises salvo que tengas una razón concreta (p. ej.
   * el mundo compartido pausando avatares fuera de cámara). */
  animar?: boolean;
  /** Posición del grupo dentro de la escena que lo aloja. */
  posicion?: readonly [number, number, number];
  /** Radio visual del núcleo en unidades de mundo — TODO lo demás (halo,
   * órbitas) está definido relativo a un núcleo de radio 1 y escala junto
   * con este único número. */
  radio?: number;
}

const RADIO_POR_DEFECTO = 0.65;
const ESCALA_HALO = 1.55;

/**
 * `<AvatarSer adn={...} />` — un fragmento de escena R3F, para insertar
 * dentro de cualquier `<Canvas>` que ya exista.
 */
export function AvatarSer({ adn, detalle = "alto", animar, posicion, radio = RADIO_POR_DEFECTO }: AvatarSerProps) {
  const reducidoSistema = usePrefiereMovimientoReducido();
  const animarEfectivo = animar ?? !reducidoSistema;

  const grupoRef = useRef<THREE.Group>(null);
  const nucleoRef = useRef<THREE.Mesh>(null);
  const anillosRef = useRef<(THREE.Mesh | null)[]>([]);

  // Recalculado solo cuando cambia el ADN o el nivel de detalle — no en
  // cada frame ni en cada render ajeno del componente padre.
  const nucleo = useMemo(() => construirGeometriaNucleo(adn, detalle), [adn, detalle]);
  const matNucleo = useMemo(() => materialNucleo(adn, detalle), [adn, detalle]);
  const matOrbita = useMemo(() => materialOrbita(adn), [adn]);
  const matHalo = useMemo(() => materialHalo(adn), [adn]);
  const escalaEjes = useMemo<[number, number, number]>(() => escalaPorSimetria(adn), [adn]);
  // El anillo y el halo NO se memorizan aquí: ya viven cacheados a nivel de
  // módulo (ver geometria.ts) — pedirlos es leer del mapa, no construir.
  const anillo = geometriaAnilloUnidad(detalle);
  const halo = geometriaHalo();

  // Arranque de fase determinista — mismo ser, mismo instante de "lub-dub"
  // al montar, sin usar Math.random() (que rompería la reproducibilidad).
  const faseInicialRef = useRef(((adn.semilla % 1000) / 1000) * Math.PI * 2);

  // Solo se libera lo que es PROPIO de esta instancia: el núcleo clonado (si
  // lo es — en detalle "bajo" no lo es, y liberarlo estaría prohibido
  // porque es la base compartida) y los tres materiales, que sí son
  // siempre propios de este ser (cada uno lleva su color único).
  useEffect(() => {
    return () => {
      liberarGeometriaInstancia(nucleo);
      matNucleo.dispose();
      matOrbita.dispose();
      matHalo.dispose();
    };
  }, [nucleo, matNucleo, matOrbita, matHalo]);

  useFrame((state, delta) => {
    if (!animarEfectivo) return;
    const t = state.clock.elapsedTime;
    const fase = t * adn.pulso * Math.PI * 2 + faseInicialRef.current;
    // Doble latido "lub-dub" — el mismo patrón de dos golpes desiguales que
    // `drawAuroraHeartPetals` en quantum-orb.tsx (dos `pow(sin(...))` de
    // distinta altura/anchura), aquí aplicado a la escala del núcleo entero
    // en vez de a un contorno 2D. Un ser es pariente de la orbe también en
    // CÓMO late, no solo en de qué color es.
    const lub = Math.pow(Math.max(0, Math.sin(fase)), 6) * 0.05;
    const dub = Math.pow(Math.max(0, Math.sin(fase - 0.4)), 10) * 0.03;
    const latido = 1 + lub + dub;
    if (nucleoRef.current) {
      nucleoRef.current.scale.set(latido * escalaEjes[0], latido * escalaEjes[1], latido * escalaEjes[2]);
    }
    // El conjunto entero gira despacio — más materia (`densidad`), más
    // inercia percibida, así que gira más despacio, no más rápido.
    if (grupoRef.current) {
      grupoRef.current.rotation.y += delta * (0.11 - adn.densidad * 0.06);
    }
    // Cada órbita precesa a su propio ritmo (más rápida cuanto más interior
    // — un eco no-literal de Kepler) girando sobre un eje DISTINTO al de su
    // propia simetría: un toro girando sobre su propio agujero se vería
    // inmóvil (es axisimétrico), así que la inclinación fija en X/Z más una
    // rotación en Y compone un bamboleo real y visible, no un giro inútil.
    for (let i = 0; i < adn.radiosOrbitales.length; i++) {
      const anilloMesh = anillosRef.current[i];
      if (!anilloMesh) continue;
      const velocidad = 0.22 / Math.sqrt(adn.radiosOrbitales[i]);
      anilloMesh.rotation.y += delta * velocidad;
    }
  });

  return (
    <group ref={grupoRef} position={posicion as [number, number, number] | undefined} scale={radio}>
      {/* Halo — el más caro de "apagar" por poco: fuera entero en "bajo". */}
      {detalle !== "bajo" && <mesh geometry={halo} material={matHalo} scale={ESCALA_HALO} />}

      {/* Núcleo — geometría propia (clon+desplazada) o compartida, según
          decidió `construirGeometriaNucleo`; aquí no hace falta saberlo. */}
      <mesh ref={nucleoRef} geometry={nucleo.geometria} material={matNucleo} scale={escalaEjes} castShadow={detalle === "alto"} />

      {/* Órbitas — el MISMO anillo unitario para las 2–5, solo cambia su
          escala (radio real) e inclinación (determinista, por índice). */}
      {adn.radiosOrbitales.map((r, i) => (
        <mesh
          key={i}
          ref={(el) => {
            anillosRef.current[i] = el;
          }}
          geometry={anillo}
          material={matOrbita}
          scale={r}
          rotation={[inclinacionOrbita(adn.semilla, i), 0, inclinacionOrbita(adn.semilla, i + 97) * 0.3]}
        />
      ))}
    </group>
  );
}

export default AvatarSer;
