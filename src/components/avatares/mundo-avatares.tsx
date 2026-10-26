"use client";

/**
 * MUNDO DE LOS AVATARES (Ola 234; rehecho en la Ola 1025U · U1 con la idea de la oficina de Hermes3D)
 * -----------------------------------------------------------------------------
 * Los agentes de la cuenta —personalidades, bots de los grupos y páginas que gestiona la persona y agentes de
 * grupo— viven en escenarios (tantos como se quiera, privados, de un grupo o públicos), se conocen y se cruzan.
 * La escena 3D vive en `mundo/escena-mundo.tsx`; aquí está el armazón: escenarios, habitantes reales,
 * simulación guardada, controles, ficha de quien se elija y, si el aparato tiene visor, la entrada VR/AR.
 *
 * REGLAS DURAS:
 *  · "use client": R3F/Three no corren en servidor. El consumidor lo carga con `next/dynamic({ ssr: false })`.
 *  · Todos los hooks van ANTES de cualquier ramificación de render. Antes había un `return` temprano por la
 *    degradación y tres hooks después de él: al detectarse el WebGL, React fallaba con «Rendered more hooks».
 *  · Sin WebGL o con `prefers-reduced-motion`: la crónica de texto a pantalla completa, nunca un lienzo en blanco.
 *  · Con la pestaña oculta no hay temporizador ni fotogramas; con la pausa, tampoco temporizador.
 *  · Honestidad: lo que ves es una simulación de juego con agentes reales (todos «Bot de IA»); sin agentes
 *    reales el mundo lo dice y no inventa actividad.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type * as THREE from "three";
import { Compass, Loader2 } from "lucide-react";

import { CronicaMundo } from "./cronica-mundo";
import { FichaAgente } from "./ficha/ficha-agente";
import { EscenaMundo } from "./mundo/escena-mundo";
import { AvisosMundo } from "./mundo/avisos-mundo";
import { ControlesMundo } from "./mundo/controles-mundo";
import { BotonesEntradaXR, EntornoXR, useEntradaXRMundo } from "./mundo/entrada-xr-mundo";
import { fuenteDeAgente } from "./mundo/fuente-avatar";
import { PanelCristal } from "./mundo/panel-cristal";
import { SelectorEscenario } from "./mundo/selector-escenario";
import { useEntornoMundo } from "./mundo/use-entorno-mundo";
import { useEscenarios } from "./mundo/use-escenarios";
import { useHabitantesMundo } from "./mundo/use-habitantes-mundo";
import { useSimulacionMundo } from "./mundo/use-simulacion-mundo";
import { ETIQUETA_BOT_IA, habitantesVisibles, limitarHabitantes } from "@/lib/avatares/mundo/habitantes";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { RADIO_MUNDO, type EstadoMundo, type ZonaSim } from "@/lib/avatares/mundo/simulacion";
import { disponerZonas, ocupantesPorZona, radioDelSuelo, zonasParaSimulacion } from "@/lib/avatares/mundo/zonas";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import type { Alcanzabilidad } from "@/lib/salas/sala";

export interface MundoAvataresProps {
  /** Personalidades con las que poblar el mundo (camino histórico; sin esto se leen las de la cuenta). */
  personalidades?: ReadonlyArray<{ id: string; name: string }>;
  /** Habitantes ya resueltos (salta la lectura de la cuenta). */
  habitantes?: readonly AgenteMundoRef[];
  /** Mundo con el que arrancar la primera vez (tiene prioridad sobre el guardado). */
  estadoInicial?: EstadoMundo;
  /** Si el mundo arranca en pausa (por defecto, corriendo). */
  pausadoInicial?: boolean;
}

const SIN_ZONAS: readonly ZonaSim[] = [];

/** Rasgos de las personalidades de este aparato, para teñir el avatar procedural de quien no trae el suyo. */
function rasgosPorPersonalidad(): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();
  try {
    for (const p of listPersonalityProfiles()) m.set(p.id, p.traits ?? {});
  } catch {
    /* sin perfiles legibles, el avatar sale del nombre */
  }
  return m;
}

function alcanceActual(): Alcanzabilidad {
  // Hoy solo se sabe si hay internet; servidor privado y malla no están cableados a este mundo, y no se fingen.
  const internet = typeof navigator === "undefined" ? false : navigator.onLine !== false;
  return { internet, servidorPrivado: false, malla: false };
}

export function MundoAvatares({ personalidades, habitantes: habitantesProp, estadoInicial, pausadoInicial = false }: MundoAvataresProps) {
  /* ── Todos los hooks, siempre, en este orden ── */
  const entorno = useEntornoMundo();
  const escenarios = useEscenarios();
  const { activo } = escenarios;
  const cuenta = useHabitantesMundo({ habitantes: habitantesProp, personalidades, estadoInicial });
  const modo3D = entorno.listo && entorno.webgl && !entorno.reducido;
  const xr = useEntradaXRMundo(modo3D);

  const [pausado, setPausado] = useState(pausadoInicial);
  const [velocidad, setVelocidad] = useState(1);
  const [centradoId, setCentradoId] = useState<string | null>(null);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const controlsRef = useRef<{ target: THREE.Vector3; update?: () => void } | null>(null);

  // Quién vive en este escenario: lo que su visibilidad permite, recortado al tope visible.
  const elegibles = useMemo(
    () => (cuenta.agentes === null ? null : habitantesVisibles(cuenta.agentes, activo)),
    [cuenta.agentes, activo],
  );
  const { visibles, ocultos } = useMemo(
    () => (elegibles === null ? { visibles: [] as AgenteMundoRef[], ocultos: 0 } : limitarHabitantes(elegibles)),
    [elegibles],
  );
  const entradas = useMemo(
    () => (elegibles === null ? null : visibles.map((r) => ({ id: r.idOrigen, nombre: r.nombre, agenteId: r.id }))),
    [elegibles, visibles],
  );

  // Las zonas y el radio que la simulación lee en cada tick sin reiniciar su temporizador.
  const zonasRef = useRef<readonly ZonaSim[]>(SIN_ZONAS);
  const radioRef = useRef<number>(RADIO_MUNDO);
  const disposicionInicial = useMemo(() => disponerZonas(activo.zonas, new Map()), [activo.zonas]);
  zonasRef.current = zonasParaSimulacion(disposicionInicial);
  radioRef.current = radioDelSuelo(disposicionInicial);

  const { estado, guardado } = useSimulacionMundo({
    escenarioId: activo.id,
    entradas,
    estadoInicial,
    pausado,
    oculta: entorno.oculta,
    velocidad,
    zonas: zonasRef,
    radio: radioRef,
    puedeGuardar: cuenta.completa,
  });

  const disposicion = useMemo(
    () => disponerZonas(activo.zonas, ocupantesPorZona(estado?.habitantes ?? [])),
    [activo.zonas, estado?.habitantes],
  );
  zonasRef.current = zonasParaSimulacion(disposicion);
  radioRef.current = radioDelSuelo(disposicion);

  const refsPorId = useMemo(() => new Map(visibles.map((r) => [r.id, r] as const)), [visibles]);
  const fuentes = useMemo(() => {
    const rasgos = rasgosPorPersonalidad();
    return new Map(visibles.map((r) => [r.id, fuenteDeAgente(r, r.origen === "personalidad" ? rasgos.get(r.idOrigen) : undefined)] as const));
  }, [visibles]);
  const fuenteSinAvatar = useMemo(() => fuenteDeAgente({ id: "sin-avatar", nombre: "Agente", avatarRef: undefined }), []);

  const alcance = useMemo(alcanceActual, []);
  const listaHabitantes = useMemo(
    () => (estado?.habitantes ?? []).map((h) => ({ id: h.id, nombre: h.nombre })),
    [estado?.habitantes],
  );

  // Cambiar de escenario suelta lo elegido: la ficha y la cámara eran de otro mundo.
  useEffect(() => {
    setElegidoId(null);
    setCentradoId(null);
  }, [activo.id]);

  const elegir = useCallback((id: string) => {
    setElegidoId(id);
    setCentradoId(id);
  }, []);
  const cerrarFicha = useCallback(() => setElegidoId(null), []);
  const pausar = useCallback(() => setPausado(true), []);
  const reanudar = useCallback(() => setPausado(false), []);

  /* ── Render (sin hooks de aquí en adelante) ── */
  const agenteElegido = elegidoId ? refsPorId.get(elegidoId) : undefined;
  const total = elegibles?.length ?? 0;

  const avisos = (
    <AvisosMundo
      total={total}
      visibles={visibles.length}
      ocultos={ocultos}
      cargando={cuenta.cargando}
      avisosFuentes={cuenta.avisos}
      guardado={guardado && escenarios.guardado}
      sinSesion={cuenta.sinSesion}
    />
  );

  return (
    <div className="relative flex h-full min-h-[60vh] w-full flex-col overflow-hidden bg-[#05060f] font-body" data-testid="mundo-avatares">
      <header className="relative z-30 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[rgba(8,12,24,0.6)] p-2 backdrop-blur-xl sm:p-3">
        <SelectorEscenario uso={escenarios} entidades={cuenta.entidades} alcance={alcance} />
        <ControlesMundo
          pausado={pausado}
          onPausar={pausar}
          onReanudar={reanudar}
          velocidad={velocidad}
          onVelocidad={setVelocidad}
          conCamara={modo3D}
          habitantes={listaHabitantes}
          centradoId={centradoId}
          onCentrar={(id) => setCentradoId(id)}
        />
        {modo3D && <BotonesEntradaXR xr={xr} />}
      </header>

      <div className="relative min-h-0 flex-1">
        {!entorno.listo ? (
          <div className="flex h-full w-full items-center justify-center text-white/60" role="status">
            <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" /> Poblando el mundo…
          </div>
        ) : modo3D ? (
          <>
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [0, 5, 16], fov: 55 }}
              gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
              frameloop={entorno.oculta && !xr.enXR ? "never" : "always"}
            >
              <Suspense fallback={null}>
                {xr.decidido && estado && (
                  <EntornoXR xr={xr}>
                    <EscenaMundo
                      estado={estado}
                      disposicion={disposicion}
                      radioSuelo={radioDelSuelo(disposicion)}
                      refs={refsPorId}
                      fuentes={fuentes}
                      fuenteSinAvatar={fuenteSinAvatar}
                      reducido={false}
                      enXR={xr.enXR}
                      centradoId={centradoId}
                      onElegir={elegir}
                      controlsRef={controlsRef}
                    />
                  </EntornoXR>
                )}
              </Suspense>
            </Canvas>

            <div className="pointer-events-none absolute bottom-2 left-2 z-10 w-[min(26rem,calc(100%-1rem))]">{avisos}</div>

            {/* Crónica lateral: solo en pantallas anchas y mientras no hay una ficha abierta. */}
            {estado && !agenteElegido && (
              <aside
                className="pointer-events-auto absolute right-3 top-3 z-20 hidden max-h-[calc(100%-1.5rem)] w-[22rem] max-w-[40vw] flex-col gap-2 overflow-hidden rounded-2xl border border-white/15 bg-[rgba(8,12,24,0.66)] p-3 backdrop-blur-xl lg:flex"
                aria-label="Crónica del mundo"
              >
                <header className="flex items-center justify-between px-1">
                  <h2 className="inline-flex items-center gap-2 font-headline text-xs font-bold uppercase tracking-[0.16em] text-white/75">
                    <Compass className="size-3.5 text-cyan-300" aria-hidden="true" /> Crónica del mundo
                  </h2>
                  <span className="text-[10px] font-semibold text-white/45">tick {estado.tick}</span>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <CronicaMundo estado={estado} onCentrar={elegir} />
                </div>
              </aside>
            )}

            <p className="pointer-events-none absolute bottom-2 right-3 z-10 hidden text-right text-[10px] font-bold uppercase tracking-[0.16em] text-white/35 md:block">
              arrastra para orbitar · rueda para zoom · toca un agente para ver su ficha
            </p>
          </>
        ) : (
          <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#05060f] to-[#0a0d1a] p-3 sm:p-6">
            <div className="mb-3 max-w-2xl">{avisos}</div>
            {estado ? (
              <CronicaMundo estado={estado} onCentrar={elegir} />
            ) : (
              <p className="text-sm text-white/60" role="status">Poblando el mundo…</p>
            )}
          </div>
        )}

        {agenteElegido && (
          <PanelCristal titulo={agenteElegido.nombre} subtitulo={ETIQUETA_BOT_IA} alCerrar={cerrarFicha}>
            <FichaAgente agente={agenteElegido} alCerrar={cerrarFicha} />
          </PanelCristal>
        )}
      </div>
    </div>
  );
}

export default MundoAvatares;
