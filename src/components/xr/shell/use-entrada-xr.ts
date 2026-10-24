"use client";
/**
 * StarSeed XR · `useEntradaXR` (XR1010L). Lleva mandos, manos, mirada+pellizco, táctil, teclado y voz a las 11
 * acciones del núcleo. Recorre `session.inputSources` por `targetRayMode` (sin índices fijos: en Vision Pro cambian),
 * crea un motor por `EntradaXR` con `usePrefsXR().vinculos` o `MAPAS_DEFECTO` y expone `disparar` y `frase` para la voz.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { EntradaXR, Mano, Vec3 } from "../../../lib/xr/tipos";
import { claveGatillo, MAPAS_DEFECTO, type AccionXR, type MapaEntrada } from "../../../lib/xr/vinculos-xr";
import { crearDetector, type Articulaciones } from "../../../lib/xr/gestos";
import { ejecutarAccion, leerFuentes, type ContextoAcciones, type LecturaMandoXR } from "./acciones-xr";
import { usePrefsXR } from "./use-prefs-xr";

const ENTRADAS: EntradaXR[] = ["mandos", "manos", "mirada-pellizco", "tactil", "teclado-raton", "gamepad", "voz"];
const GESTOS_MANO = ["pellizco", "puno-cerrado", "palma-a-la-cara", "tocar-muneca"] as const;

interface MotorEntrada {
  mando(mano: Mano, lectura: LecturaMandoXR, ahora: number): AccionXR[];
  tecla(codigo: string): AccionXR[]; frase(texto: string): AccionXR[];
  gesto(gesto: string, mano: Mano | "cualquiera"): AccionXR[];
}

export function useEntradaXR(ctx: ContextoAcciones): { disparar(accion: AccionXR): void; frase(texto: string): void } {
  const { vinculos } = usePrefsXR();
  const gl = useThree((estado) => estado.gl);
  const refCtx = useRef(ctx);
  refCtx.current = ctx;
  const motores = useMemo(() => new Map(ENTRADAS.map((e) => [e, crearMotorEntrada(vinculos[e] ?? MAPAS_DEFECTO[e])] as
    [EntradaXR, MotorEntrada])), [vinculos]);
  const ejecutar = useCallback((acciones: AccionXR[]) => acciones.forEach((accion) => ejecutarAccion(accion, refCtx.current)), []);
  const detectores = useRef(new Map<string, ReturnType<typeof crearDetector>>());
  const ultimoPellizco = useRef<Record<string, number>>({});
  useFrame((estado) => {
    const sesion = gl.xr.getSession();
    if (!sesion) return;
    const frame = gl.xr.getFrame(), referencia = gl.xr.getReferenceSpace();
    const ahora = performance.now();
    const cabeza = { x: estado.camera.position.x, y: estado.camera.position.y, z: estado.camera.position.z };
    const lecturas = leerFuentes(sesion, (junta) => {
      const pose = frame && referencia ? frame.getJointPose?.(junta as XRJointSpace, referencia) : undefined;
      return pose ? [pose.transform.position.x, pose.transform.position.y, pose.transform.position.z] : null;
    });
    const mando = motores.get("mandos") ?? motores.get("gamepad");
    if (mando) for (const lectura of lecturas) {
      if (lectura.esMano || lectura.modo !== "tracked-pointer" || (!lectura.botones.length && !lectura.ejes.length)) continue;
      ejecutar(mando.mando(lectura.mano === "cualquiera" ? "derecha" : lectura.mano, lectura, ahora));
    }
    const manos = motores.get("manos") ?? motores.get("mirada-pellizco");
    if (!manos) return;
    for (const lectura of lecturas) {
      if (!lectura.esMano || lectura.mano === "cualquiera") continue;
      const art = aArticulaciones(lectura.articulaciones);
      const otra = lecturas.find((l) => l.esMano && l.mano !== lectura.mano && l.mano !== "cualquiera");
      const contexto = { cabeza, otraMano: otra && aArticulaciones(otra.articulaciones) };
      for (const gesto of GESTOS_MANO) {
        const clave = `${gesto}:${lectura.mano}`;
        const detector = detectores.current.get(clave) ?? crearDetector(gesto);
        detectores.current.set(clave, detector);
        if (detector.actualizar(art, contexto, ahora).flanco !== "sube") continue;
        ejecutar(manos.gesto(gesto, lectura.mano));
        if (gesto !== "pellizco") continue;
        const previo = ultimoPellizco.current[lectura.mano] ?? -Infinity;
        if (ahora - previo < 350) ejecutar(manos.gesto("pellizco-doble", lectura.mano));
        ultimoPellizco.current[lectura.mano] = ahora;
      }
    }
  });

  useEffect(() => {
    const motor = motores.get("teclado-raton");
    if (!motor) return;
    const alPulsar = (evento: KeyboardEvent) => { if (!evento.repeat) ejecutar(motor.tecla(evento.code)); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [motores, ejecutar]);

  const disparar = useCallback((accion: AccionXR) => ejecutarAccion(accion, refCtx.current), []);
  const frase = useCallback((texto: string) => {
    const motor = motores.get("voz");
    if (motor) ejecutar(motor.frase(texto));
    else ejecutarAccion("hablar", refCtx.current);
  }, [motores, ejecutar]);
  return { disparar, frase };
}

function accionesDe(mapa: MapaEntrada, claves: string[]): AccionXR[] {
  const salida = new Set<AccionXR>();
  for (const accion of Object.keys(mapa) as AccionXR[])
    for (const gatillo of mapa[accion] ?? []) if (claves.includes(claveGatillo(gatillo))) salida.add(accion);
  return [...salida];
}

function crearMotorEntrada(mapa: MapaEntrada): MotorEntrada {
  const previos: Record<Mano, boolean[]> = { izquierda: [], derecha: [] }, ejes: Record<string, number> = {}, ultimo: Record<string, number> = {};
  return {
    mando(mano, lectura, ahora) {
      const claves: string[] = [];
      lectura.botones.forEach((pulsado, indice) => { if (pulsado && !previos[mano][indice]) claves.push(`boton:${mano}:${indice}`); });
      previos[mano] = lectura.botones.slice();
      lectura.ejes.forEach((valor, indice) => {
        const clave = `eje:${mano}:${indice}`;
        const direccion = valor > 0.6 ? "+" : valor < -0.6 ? "-" : null;
        if (direccion && (ejes[clave] ?? 0) === 0 && ahora - (ultimo[clave] ?? -Infinity) >= 250) {
          claves.push(`${clave}${direccion}`);
          ultimo[clave] = ahora;
        }
        ejes[clave] = valor > 0.3 ? 1 : valor < -0.3 ? -1 : 0;
      });
      return accionesDe(mapa, claves);
    },
    tecla: (codigo) => accionesDe(mapa, [`tecla:${codigo}`]),
    frase: (texto) => accionesDe(mapa, [`frase:${texto.trim().toLowerCase()}`]),
    gesto: (gesto, mano) => accionesDe(mapa, [`gesto:${mano}:${gesto}`, `gesto:cualquiera:${gesto}`]),
  };
}

const aArticulaciones = (art: Record<string, Vec3>): Articulaciones =>
  Object.fromEntries(Object.entries(art).map(([nombre, [x, y, z]]) => [nombre, { x, y, z }]));
