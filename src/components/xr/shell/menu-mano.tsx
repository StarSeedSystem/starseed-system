"use client";
/**
 * StarSeed XR · MENÚ DE MANO (muñeca) — CASCARÓN R3F (XR1010N · contrato §3 a y e). La lógica vive en
 * `menu-mano-items.ts`. <MenuMano> aparece con la palma a la cara de la mano NO dominante (detector
 * `palma-a-la-cara` del núcleo; nunca el pellizco de palma, que es del sistema del visor) o con el
 * botón `menu-mano` del mapa de mando (por defecto el A/X izquierdo). La muñeca se lee de la
 * articulación `wrist` (o del `gripSpace` del mando de respaldo); los items llaman a `ejecutarAccion`.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Group } from "three";
import type { Mano, Postura } from "../../../lib/xr/tipos";
import { MAPAS_DEFECTO } from "../../../lib/xr/vinculos-xr";
import { crearDetector, type Articulaciones } from "../../../lib/xr/gestos";
import { ejecutarAccion, type ContextoAcciones } from "./acciones-xr";
import { Animado } from "./animado";
import { usePrefsXR } from "./use-prefs-xr";
import { disponerTrinity } from "../../../lib/xr/espacio-trinity";
import { gatillosBotonMenuMano, itemsMenuMano, posicionMenu, type ItemMenuMano, type PoseMuneca } from "./menu-mano-items";

export interface PropsMenuMano {
  postura: Postura;
  manoDominante: Mano;
  /** La voz de Astraura escucha: el item «hablar» pasa a «Detener voz». */
  hablando: boolean;
  /** La calidad la fija el aparato (auto) o la persona (manual); cambia la etiqueta. */
  calidadAuto: boolean;
  enCalidad(): void;
  enAjustes(): void;
  acciones: ContextoAcciones;
}

/** Pose de la muñeca: articulación `wrist` de la mano, o `gripSpace` del mando como respaldo. */
interface TipoPose { transform: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } } }
const poseMuneca = (fuente: XRInputSource | undefined, frame: XRFrame | null | undefined, referencia: XRReferenceSpace | null | undefined): PoseMuneca | null => {
  if (!fuente || !frame || !referencia) return null;
  const espacio: XRSpace | undefined | null = fuente.hand ? fuente.hand.get("wrist") : fuente.gripSpace;
  if (!espacio) return null;
  const pose: TipoPose | null | undefined = frame.getPose(espacio, referencia);
  if (!pose) return null;
  const p = pose.transform.position, q = pose.transform.orientation;
  return { pos: [p.x, p.y, p.z], rot: [q.x, q.y, q.z, q.w] };
};

export function MenuMano({ postura, manoDominante, hablando, calidadAuto, enCalidad, enAjustes, acciones }: PropsMenuMano) {
  const { vinculos } = usePrefsXR();
  const gl = useThree((estado) => estado.gl);
  const manoMenu: Mano = manoDominante === "derecha" ? "izquierda" : "derecha";
  const nodo = useMemo(() => disponerTrinity({ alturaOjos: 1.6, postura, manoDominante, modo: "vr-inmersivo" }).nodos.menuMano, [postura, manoDominante]);
  const items = useMemo(() => itemsMenuMano({ postura, hablando, calidadAuto }), [postura, hablando, calidadAuto]);
  const gatillos = useMemo(() => gatillosBotonMenuMano(vinculos.mandos ?? MAPAS_DEFECTO.mandos), [vinculos.mandos]);
  const [visible, setVisible] = useState(false);
  const [montado, setMontado] = useState(false);
  const visibleRef = useRef(false);
  const detector = useRef<ReturnType<typeof crearDetector> | null>(null);
  const pulsado = useRef<Record<Mano, boolean[]>>({ izquierda: [], derecha: [] });
  const grupo = useRef<Group>(null);
  const abrir = useCallback((v: boolean) => { visibleRef.current = v; setVisible(v); if (v) setMontado(true); }, []);

  useFrame((estado) => {
    const ref = grupo.current;
    const sesion = gl.xr.getSession();
    if (!sesion) { if (visibleRef.current) abrir(false); return; }
    const frame = gl.xr.getFrame(), referencia = gl.xr.getReferenceSpace();
    const ahora = performance.now();
    const textoMano = manoMenu === "izquierda" ? "left" : "right";
    const fuente = Array.from(sesion.inputSources).find((f) => f.handedness === textoMano);
    // 1) Mano no dominante: el detector del núcleo decide; sube y se abrirá el menú.
    if (fuente?.hand && frame && referencia) {
      const articulaciones: Articulaciones = {};
      fuente.hand.forEach((espacio, nombre) => {
        const pose = frame.getJointPose?.(espacio, referencia);
        if (pose) articulaciones[nombre] = { x: pose.transform.position.x, y: pose.transform.position.y, z: pose.transform.position.z };
      });
      const cabeza = estado.camera.position;
      detector.current ??= crearDetector("palma-a-la-cara");
      const flanco = detector.current
        .actualizar(articulaciones, { cabeza: { x: cabeza.x, y: cabeza.y, z: cabeza.z } }, ahora)
        .flanco;
      if (flanco === "sube") abrir(true);
      if (flanco === "baja") abrir(false);
    }
    // 2) Mando: los gatillos de BOTÓN del mapa de `menu-mano` (A/X izquierdo por defecto); flanco → alterna.
    for (const g of gatillos) {
      const suFuente = Array.from(sesion.inputSources).find((f) => f.handedness === (g.mano === "izquierda" ? "left" : "right"));
      const botones = suFuente?.gamepad?.buttons;
      const esta = !!botones?.[g.indice] && (botones[g.indice].pressed === true || (botones[g.indice].value ?? 0) > 0.5);
      if (esta && !(pulsado.current[g.mano][g.indice])) abrir(!visibleRef.current);
      pulsado.current[g.mano][g.indice] = esta;
    }
    // 3) Pose: el panel viaja pegado a la muñeca, con el desplazamiento del nodo y mirando a la cabeza.
    const pose = poseMuneca(fuente, frame, referencia);
    if (ref && pose) {
      const c = estado.camera.position;
      const { posicion, rotacion } = posicionMenu(pose, manoMenu, nodo, [c.x, c.y, c.z]);
      ref.position.set(posicion[0], posicion[1], posicion[2]);
      ref.quaternion.set(rotacion[0], rotacion[1], rotacion[2], rotacion[3]);
    }
  });

  /** Un item tocado ejecuta su acción real y cierra el menú: un botón sin efecto no se pinta. */
  const tacto = (item: ItemMenuMano): void => {
    if (item.accion === "calidad") enCalidad();
    else if (item.accion === "ajustes") enAjustes();
    else ejecutarAccion(item.accion, acciones);
    abrir(false);
  };

  if (!montado) return null;
  return (
    <group ref={grupo}>
      <Animado evento="foco" salir={!visible} alTerminar={() => setMontado(false)}>
        {items.map((item, i) => (
          <group key={item.id} position={[0, -i * 0.033, 0.006]} onClick={() => tacto(item)}>
            <mesh>
              <planeGeometry args={[0.048, 0.028]} />
              <meshBasicMaterial color="#0E101E" transparent opacity={0.86} />
            </mesh>
            <Text fontSize={0.0086} color="#F5F7FF" anchorX="center" anchorY="middle" position={[0, 0, 0.001]}>{item.etiqueta}</Text>
          </group>
        ))}
      </Animado>
    </group>
  );
}
