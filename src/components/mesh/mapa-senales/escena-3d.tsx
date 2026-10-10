"use client";

/**
 * Escena 3D del mapa de señales reales (React Three Fiber + OrbitControls).
 * ============================================================================
 * Este es el ÚNICO archivo del mapa que importa three/R3F: se carga perezoso
 * (`next/dynamic`, sin SSR) para que nada de WebGL entre en el paquete común.
 *
 * Es presentacional: recibe el modelo ya calculado (`mapa-3d.ts`) y devuelve
 * eventos (seleccionar, apuntar). Rendimiento: el bucle de render solo corre
 * "siempre" cuando hay algo que se mueve de verdad (giro elegido, pulso de una
 * señal recién oída o un vuelo de cámara); en reposo pinta bajo demanda, y con la
 * pestaña oculta NO pinta nada. Con `prefers-reduced-motion` no hay giro, pulsos
 * ni vuelos suaves. En modo `ligero` (móvil y tablet) baja la resolución y quita
 * el suavizado de bordes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FOV_VERTICAL, encuadreCamara, type AntenaPropia, type MarcadorEscena, type MedioEscena, type SectorEscena } from "@/lib/senales/mapa-3d";
import type { AnilloAlcance } from "@/lib/senales/tipos-vivo";
import type { CentroNeurona } from "@/lib/senales/centro";
import { AnillosAlcance, AntenaPropiaMarca, MarcaNorte, SectoresSuelo, Suelo } from "./suelo-3d";
import { Centro3D } from "./centro-3d";
import { Marcador3D } from "./marcador-3d";
import { Medio3D } from "./medio-3d";
import { FACTOR_ETIQUETA } from "./etiqueta-3d";

export type VistaCamara = "inclinada" | "cenital";
export interface OrdenCamara { vista: VistaCamara; n: number }

const FOV_V = FOV_VERTICAL;

/** Encuadre de `mapa-3d.ts` (puro y probado) convertido a vectores de three. */
function encuadre(ancho: number, alto: number, vista: VistaCamara) {
  const e = encuadreCamara(ancho, alto, vista);
  return { posicion: new THREE.Vector3(...e.posicion), objetivo: new THREE.Vector3(...e.objetivo) };
}

export interface EscenaProps {
  marcadores: MarcadorEscena[];
  medios: MedioEscena[];
  sectores: SectorEscena[];
  anillos: AnilloAlcance[];
  antenas: AntenaPropia[];
  seleccionId: string | null;
  apuntadaId: string | null;
  conEtiqueta: ReadonlySet<string>;
  hayGps: boolean;
  girar: boolean;
  reducido: boolean;
  /** Móvil o tablet: menos píxeles y sin suavizado de bordes. */
  ligero?: boolean;
  orden: OrdenCamara | null;
  /** ESTA neurona: nombre, foto o avatar 3D y datos (el centro del radar). */
  centro: CentroNeurona;
  descripcion: string;
  onSeleccionar: (id: string | null) => void;
  onApuntar: (id: string | null) => void;
  /** El contexto WebGL se perdió: el contenedor decide qué enseñar en su lugar. */
  onPerdido?: () => void;
}

interface ControlesOrbita {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (tipo: string, f: () => void) => void;
  removeEventListener: (tipo: string, f: () => void) => void;
}

/** Vuelos de cámara: a un preset (cenital/inclinada) o a la señal elegida. */
function Camara({ orden, seleccionId, foco, reducido }: {
  orden: OrdenCamara | null;
  seleccionId: string | null;
  foco: [number, number, number] | null;
  reducido: boolean;
}) {
  const controles = useThree((s) => s.controls) as unknown as ControlesOrbita | null;
  const camara = useThree((s) => s.camera);
  const invalidar = useThree((s) => s.invalidate);
  const tamano = useThree((s) => s.size);
  const tamanoRef = useRef(tamano);
  tamanoRef.current = tamano;
  const destino = useRef<{ objetivo: THREE.Vector3; posicion: THREE.Vector3 } | null>(null);
  // La posición de la señal elegida se lee al ELEGIRLA, no cada vez que los datos
  // se refrescan: si no, la cámara pelearía con la persona que ya la movió.
  const focoRef = useRef(foco);
  focoRef.current = foco;

  // Encuadre inicial: el disco entero a la vista, según la forma del lienzo.
  useEffect(() => {
    if (!controles) return;
    const e = encuadre(tamanoRef.current.width, tamanoRef.current.height, "inclinada");
    controles.target.copy(e.objetivo);
    camara.position.copy(e.posicion);
    controles.update();
    invalidar();
  }, [controles, camara, invalidar]);

  useEffect(() => {
    if (!orden) return;
    const e = encuadre(tamanoRef.current.width, tamanoRef.current.height, orden.vista);
    destino.current = { objetivo: e.objetivo, posicion: e.posicion };
    invalidar();
  }, [orden, invalidar]);

  useEffect(() => {
    const f = focoRef.current;
    if (!seleccionId || !f || !controles) return;
    const objetivo = new THREE.Vector3(f[0], f[1], f[2]);
    const delta = objetivo.clone().sub(controles.target);
    destino.current = { objetivo, posicion: camara.position.clone().add(delta) };
    invalidar();
  }, [seleccionId, controles, camara, invalidar]);

  // Si la persona toma el control, el vuelo se cancela al instante.
  useEffect(() => {
    if (!controles) return;
    const cancelar = () => { destino.current = null; };
    controles.addEventListener("start", cancelar);
    return () => controles.removeEventListener("start", cancelar);
  }, [controles]);

  useFrame((_, dt) => {
    const d = destino.current;
    if (!d || !controles) return;
    const k = reducido ? 1 : 1 - Math.exp(-6 * Math.min(dt, 0.1));
    controles.target.lerp(d.objetivo, k);
    camara.position.lerp(d.posicion, k);
    controles.update();
    const llegado = controles.target.distanceTo(d.objetivo) < 0.02 && camara.position.distanceTo(d.posicion) < 0.05;
    if (llegado) destino.current = null;
    else invalidar();
  });
  return null;
}

/** ¿La pestaña se ve? Oculta, el lienzo no pinta (ahorra batería, sobre todo en tablet y móvil). */
function usePestanaVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const alCambiar = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);
  return visible;
}

/* ── Etiquetas sin pisarse ────────────────────────────────────────────────── */

interface Caja { x0: number; y0: number; x1: number; y1: number }
const choca = (a: Caja, b: Caja) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Del conjunto de candidatas, deja visibles solo las que CABEN en pantalla sin
 * taparse entre sí, en orden de prioridad (elegida, apuntada y luego por calidad).
 * Se recalcula cuando se mueve la cámara. Así «Etiquetas: todas» significa «todas
 * las que se pueden leer», y al acercarte aparecen más.
 */
function GestorEtiquetas({ marcadores, candidatas, prioritarias, onVisibles }: {
  marcadores: MarcadorEscena[];
  candidatas: ReadonlySet<string>;
  prioritarias: readonly (string | null)[];
  onVisibles: (ids: Set<string>) => void;
}) {
  const camara = useThree((s) => s.camera);
  const tamano = useThree((s) => s.size);
  const controles = useThree((s) => s.controls) as unknown as ControlesOrbita | null;
  const ultimo = useRef("");
  const pendiente = useRef(0);

  const calcular = useCallback(() => {
    const escala = (m: MarcadorEscena) => {
      const d = camara.position.distanceTo(new THREE.Vector3(m.x, m.y, m.z));
      return Math.min(2.6, Math.max(0.5, (FACTOR_ETIQUETA / 15) * (21.4 / Math.max(d, 1))));
    };
    const orden = [
      ...prioritarias.filter((id): id is string => !!id).map((id) => marcadores.find((m) => m.id === id)).filter((m): m is MarcadorEscena => !!m),
      ...marcadores.filter((m) => candidatas.has(m.id) && !prioritarias.includes(m.id)),
    ];
    const v = new THREE.Vector3();
    // El rótulo del centro (esta neurona) también ocupa sitio.
    v.set(0, 1.4, 0).project(camara);
    const kc = Math.min(2.6, Math.max(0.5, (FACTOR_ETIQUETA / 15) * (21.4 / Math.max(camara.position.length(), 1))));
    const ccx = (v.x * 0.5 + 0.5) * tamano.width;
    const ccy = (-v.y * 0.5 + 0.5) * tamano.height;
    const ocupadas: Caja[] = [{ x0: ccx - 100 * kc, x1: ccx + 100 * kc, y0: ccy - 44 * kc, y1: ccy + 34 * kc }];
    const visibles = new Set<string>();
    for (const m of orden) {
      const fuerte = prioritarias.includes(m.id);
      v.set(m.x, m.y + m.radio * 2.6 + 0.35, m.z).project(camara);
      if (v.z > 1) continue;
      const cx = (v.x * 0.5 + 0.5) * tamano.width;
      const cy = (-v.y * 0.5 + 0.5) * tamano.height;
      const k = escala(m);
      const largo = Math.min(m.senal.label.length, 28) + (m.simulada ? 10 : 0);
      const w = (largo * 5.6 + 18) * k;
      const h = (fuerte || m.esAparato ? 34 : 19) * k;
      const caja = { x0: cx - w / 2 - 3, x1: cx + w / 2 + 3, y0: cy - h / 2 - 2, y1: cy + h / 2 + 2 };
      // Margen arriba (chips de estado) y abajo (leyenda de altura) del lienzo.
      const dentro = caja.x0 >= 0 && caja.x1 <= tamano.width && caja.y0 >= 40 && caja.y1 <= tamano.height - 46;
      if (!fuerte && (!dentro || ocupadas.some((o) => choca(o, caja)))) continue;
      ocupadas.push(caja);
      visibles.add(m.id);
    }
    const firma = [...visibles].sort().join("|");
    if (firma !== ultimo.current) { ultimo.current = firma; onVisibles(visibles); }
  }, [camara, tamano.width, tamano.height, marcadores, candidatas, prioritarias, onVisibles]);

  useEffect(() => { calcular(); }, [calcular]);

  useEffect(() => {
    if (!controles) return;
    const alMover = () => {
      if (pendiente.current) return;
      pendiente.current = requestAnimationFrame(() => { pendiente.current = 0; calcular(); });
    };
    controles.addEventListener("change", alMover);
    return () => {
      controles.removeEventListener("change", alMover);
      if (pendiente.current) cancelAnimationFrame(pendiente.current);
      pendiente.current = 0;
    };
  }, [controles, calcular]);
  return null;
}

export default function Escena3D(p: EscenaProps) {
  const sel = p.marcadores.find((m) => m.id === p.seleccionId) ?? null;
  const selMedio = p.medios.find((m) => m.id === p.seleccionId) ?? null;
  const foco: [number, number, number] | null = sel
    ? [sel.x, sel.y * 0.6, sel.z]
    : selMedio ? [selMedio.x, selMedio.y * 0.6, selMedio.z] : p.seleccionId === "yo" ? [0, 0, 0] : null;
  const visible = usePestanaVisible();
  // Solo se pinta sin parar si algo se mueve de verdad Y la pestaña se ve.
  const animado = visible && !p.reducido && (p.girar || p.marcadores.some((m) => m.reciente && !m.tenue));
  const [conEtiqueta, setConEtiqueta] = useState<ReadonlySet<string>>(() => new Set(p.seleccionId ? [p.seleccionId] : []));
  const prioritarias = useMemo(() => [p.seleccionId, p.apuntadaId], [p.seleccionId, p.apuntadaId]);

  useEffect(() => {
    document.body.style.cursor = p.apuntadaId ? "pointer" : "";
    return () => { document.body.style.cursor = ""; };
  }, [p.apuntadaId]);

  return (
    <Canvas
      role="img"
      aria-label={p.descripcion}
      camera={{ position: [0, 13.2, 18.2], fov: FOV_V, near: 0.1, far: 220 }}
      dpr={p.ligero ? [1, 1.25] : [1, 1.5]}
      frameloop={animado ? "always" : "demand"}
      gl={{ antialias: !p.ligero, alpha: true, powerPreference: "low-power" }}
      onPointerMissed={() => p.onSeleccionar(null)}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          p.onPerdido?.();
        });
      }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 12, 8]} intensity={1.6} />
      <Suelo />
      <SectoresSuelo sectores={p.sectores} />
      <AnillosAlcance anillos={p.anillos} />
      {p.hayGps && <MarcaNorte />}
      <Centro3D
        centro={p.centro}
        seleccionado={p.seleccionId === "yo"}
        apuntado={p.apuntadaId === "yo"}
        onSeleccionar={() => p.onSeleccionar("yo")}
        onApuntar={(sobre) => p.onApuntar(sobre ? "yo" : null)}
      />
      {p.antenas.map((a) => <AntenaPropiaMarca key={a.kind} antena={a} />)}
      {p.marcadores.map((m) => (
        <Marcador3D
          key={m.id}
          m={m}
          seleccionada={m.id === p.seleccionId}
          apuntada={m.id === p.apuntadaId}
          conEtiqueta={conEtiqueta.has(m.id)}
          reducido={p.reducido}
          onSeleccionar={p.onSeleccionar}
          onApuntar={p.onApuntar}
        />
      ))}
      {p.medios.map((m) => (
        <Medio3D
          key={m.id}
          m={m}
          seleccionado={m.id === p.seleccionId}
          apuntado={m.id === p.apuntadaId}
          onSeleccionar={p.onSeleccionar}
          onApuntar={p.onApuntar}
        />
      ))}
      <GestorEtiquetas marcadores={p.marcadores} candidatas={p.conEtiqueta} prioritarias={prioritarias} onVisibles={setConEtiqueta} />
      <Camara orden={p.orden} seleccionId={p.seleccionId} foco={foco} reducido={p.reducido} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.09}
        minDistance={4}
        maxDistance={42}
        maxPolarAngle={Math.PI / 2 - 0.03}
        autoRotate={p.girar && !p.reducido}
        autoRotateSpeed={0.7}
      />
    </Canvas>
  );
}
