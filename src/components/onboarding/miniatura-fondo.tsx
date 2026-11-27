"use client";

/**
 * MiniaturaFondo — vista previa pequeña de un fondo (shader/set) para la rejilla de «Elige tu fondo».
 * Respeta WebGPU, «reducir movimiento», ahorro de batería y modo de vista previa (animada/quieta/imagen).
 * Al pasar el cursor o enfocar, anima si el modo lo permite.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ShaderInstance } from "shaders/js";
import type { BackgroundLayer, SetFondo } from "@/lib/appearance/background-layers";
import { CapaShader } from "@/components/backgrounds/capa-shader";
import { modoVistaPrevia, type ModoVistaPrevia } from "@/lib/onboarding/fondo-inicial";
import { planFondo, EFECTOS_FONDO, type EfectoFondoId } from "@/lib/protomolecula/atomos/fondo-shader";
import { cn } from "@/lib/utils";

type Componente = { type?: string; id?: string; props?: Record<string, unknown>; children?: Componente[] };
const aplanar = (cs: Componente[]): Componente[] => cs.flatMap((c) => [c, ...aplanar(c.children ?? [])]);

interface MiniaturaFondoProps {
  /** El set de fondo completo (con capas shader) */
  set?: SetFondo;
  /** O solo el ID del efecto del catálogo */
  efectoId?: EfectoFondoId;
  /** Tamaño de la miniatura (ancho, alto) */
  size?: { w: number; h: number };
  /** Modo de vista previa calculado por `modoVistaPrevia` */
  modo: ModoVistaPrevia;
  /** Si está activa (cursor encima o foco) */
  activa?: boolean;
  /** className adicional */
  className?: string;
  /** Etiqueta aria para accesibilidad */
  ariaLabel?: string;
}

function MiniaturaShader({ capa, vistaPrevia, modo, className }: {
  capa: BackgroundLayer;
  vistaPrevia?: string;
  modo: ModoVistaPrevia;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<ShaderInstance | null>(null);
  const previasRef = useRef(new Map<string, string>());
  const [fallo, setFallo] = useState(false);
  const [listo, setListo] = useState(false);
  const componentes = (capa.preset?.components ?? []) as Componente[];
  const conMotor = modo !== "imagen" && !fallo && componentes.length > 0;

  const estructura = JSON.stringify(aplanar(componentes).map((c) => [c.type, c.id]));

  useEffect(() => {
    const lienzo = canvasRef.current;
    if (!conMotor || !lienzo) return;
    let vivo = true;
    previasRef.current = new Map(aplanar(componentes).map((c) => [c.id ?? "", JSON.stringify(c.props ?? {})]));
    let s: ShaderInstance | null = null;
    import("shaders/js")
      .then(async ({ createShader }) => {
        s = await createShader(lienzo, { components: componentes as never, structureVersion: capa.preset?.structureVersion }, { disableTelemetry: true, observeElement: false, onError: () => { if (s?.getFailureReason()) setFallo(true); } });
        if (!vivo) return s.destroy();
        if (s.getFailureReason()) return setFallo(true);
        instRef.current = s;
        s.resize(lienzo.clientWidth, lienzo.clientHeight);
        setListo(true);
      })
      .catch(() => { if (vivo) setFallo(true); });
    const ro = new ResizeObserver(() => instRef.current?.resize(lienzo.clientWidth, lienzo.clientHeight));
    ro.observe(lienzo);
    return () => { vivo = false; ro.disconnect(); instRef.current?.destroy(); instRef.current = null; };
  }, [conMotor, estructura]);

  useEffect(() => {
    if (!instRef.current) return;
    for (const c of aplanar(componentes)) {
      const id = c.id ?? "", nuevas = JSON.stringify(c.props ?? {});
      if (!id || previasRef.current.get(id) === nuevas) continue;
      previasRef.current.set(id, nuevas);
      instRef.current.update(id, c.props ?? {});
    }
  });

  useEffect(() => {
    const s = instRef.current;
    if (!s || modo === "imagen") return;
    if (modo === "quieta") { s.pause(); return; }
    s.resume();
  }, [modo, listo]);

  if (!capa.visible) return null;
  const estilo = { opacity: capa.opacity, mixBlendMode: capa.blend } as CSSProperties;

  if (!conMotor)
    return vistaPrevia ? (
      <img src={vistaPrevia} alt="" aria-hidden className={cn("pointer-events-none h-full w-full object-cover", className)} style={estilo} />
    ) : null;

  return <canvas ref={canvasRef} aria-hidden data-modo={modo} className={cn("pointer-events-none block h-full w-full", className)} style={estilo} />;
}

export function MiniaturaFondo({ set, efectoId, size = { w: 80, h: 60 }, modo, activa = false, className, ariaLabel }: MiniaturaFondoProps) {
  const [capa, setCapa] = useState<BackgroundLayer | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | undefined>();

  useEffect(() => {
    let s: SetFondo | undefined;
    if (set) {
      s = set;
    } else if (efectoId) {
      s = planFondo({ id: `miniatura-${efectoId}`, nombre: EFECTOS_FONDO[efectoId].nombre, autor: "StarSeed", creado: new Date().toISOString(), valores: { efecto: efectoId, capas: 1 } });
    }
    if (s) {
      const shaderLayer = s.capas.find((c) => c.kind === "shader");
      if (shaderLayer) {
        setCapa({ ...shaderLayer, opacity: 1, blend: "normal" });
        setVistaPrevia(s.vistaPrevia);
      }
    }
  }, [set, efectoId]);

  const modoEfectivo: ModoVistaPrevia = activa && modo === "animada" ? "animada" : modo;

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? (set?.nombre ?? efectoId ?? "Vista previa del fondo")}
      className={cn("relative overflow-hidden rounded-md border border-white/10 bg-black/20", className)}
      style={{ width: size.w, height: size.h, flexShrink: 0 }}
    >
      {capa ? (
        <MiniaturaShader capa={capa} vistaPrevia={vistaPrevia} modo={modoEfectivo} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-4 w-4 rounded bg-gradient-to-br from-fuchsia-500/30 to-cyan-400/20" aria-hidden />
        </div>
      )}
    </div>
  );
}

export default MiniaturaFondo;