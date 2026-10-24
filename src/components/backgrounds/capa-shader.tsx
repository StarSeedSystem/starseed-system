"use client";

/**
 * capa-shader — PINTA UNA CAPA SHADER de la pila de fondos (Ola 1018F · E).
 * WebGPU del paquete `shaders` (MIT): solo `shaders/js`, SIEMPRE en cliente con
 * import dinámico y SIEMPRE `disableTelemetry: true`; nunca presets de
 * shaders.com. El modo lo decide `modoDeCapa` (politica-shader.ts). En «fijo»
 * (sin WebGPU, «reducir movimiento» o GPU caída) pinta la `vistaPrevia` del set
 * o NADA, dejando ver el motor base; sin WebGPU ni siquiera se carga el paquete.
 * Un ÚNICO dispositivo WebGPU compartido para todas las capas (contrato §5).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PresetConfig, ShaderInstance } from "shaders/js";
import {
  modoDeCapa, estiloDeCapa, mascaraCss, firmaEstructura, type ModoCapaShader,
} from "@/lib/appearance/politica-shader";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

type Dispositivo = Awaited<ReturnType<typeof import("shaders/js")["createSharedDevice"]>>;

/** UN dispositivo GPU para todas las capas shader de la pantalla (lazy). */
let dispositivo: Promise<Dispositivo> | null = null;
function dispositivoCompartido(): Promise<Dispositivo> {
  dispositivo ??= import("shaders/js").then((m) => m.createSharedDevice());
  return dispositivo;
}

export interface CapaShaderProps {
  capa: BackgroundLayer; // kind = "shader"
  /** Vista previa fija del set (PNG): única imagen del modo «fijo». */
  vistaPrevia?: string;
  /** Ahorro de batería encendido (Ajustes), o batería baja por Battery API. */
  ahorroBateria?: boolean;
}

interface Componente { type?: unknown; id?: unknown; props?: Record<string, unknown> }
type Señales = { listo: boolean; webgpu: boolean; reducir: boolean; bateria: number | null; visible: boolean };
const INICIAL: Señales = { listo: false, webgpu: false, reducir: false, bateria: null, visible: true };

export function CapaShader({ capa, vistaPrevia, ahorroBateria = false }: CapaShaderProps) {
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const [instancia, setInstancia] = useState<ShaderInstance | null>(null);
  const [fallo, setFallo] = useState(false);
  const [señales, setSeñales] = useState<Señales>(INICIAL);

  // Señales reales del aparato: WebGPU, prefers-reduced-motion, batería y pestaña.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    let cancelado = false;
    const n = navigator as Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (t: "levelchange", fn: () => void) => void }> };
    const medio = window.matchMedia("(prefers-reduced-motion: reduce)");
    const recalcular = () => { if (!cancelado) setSeñales((s) => ({ ...s, listo: true, reducir: medio.matches, visible: !document.hidden })); };
    medio.addEventListener("change", recalcular);
    document.addEventListener("visibilitychange", recalcular);
    recalcular();
    setSeñales((s) => ({ ...s, webgpu: "gpu" in navigator }));
    n.getBattery?.call(navigator).then((b) => {
      if (cancelado) return;
      setSeñales((s) => ({ ...s, bateria: Math.round(b.level * 100) }));
      b.addEventListener("levelchange", recalcular);
    }).catch(() => { /* sin Battery API (Firefox/iOS): deciden las demás señales */ });
    return () => {
      cancelado = true;
      medio.removeEventListener("change", recalcular);
      document.removeEventListener("visibilitychange", recalcular);
    };
  }, []);

  // Hasta medir las señales, NADA se anima (pausa defensiva).
  const modo: ModoCapaShader = señales.listo
    ? modoDeCapa({ webgpu: señales.webgpu && !fallo, reducirMovimiento: señales.reducir, ahorroBateria, bateriaPct: señales.bateria, visible: señales.visible })
    : "pausado";
  const firma = useMemo(() => firmaEstructura(capa.preset), [capa.preset]); // ESTRUCTURA (tipos/ids)
  const componentes = useMemo(
    () => (Array.isArray(capa.preset?.components) ? (capa.preset.components as Componente[]) : []),
    [capa.preset],
  );

  // CREACIÓN — cambia la estructura → se re-crea; solo PROPS → `update` en vivo.
  useEffect(() => {
    if (!señales.listo || modo === "fijo" || capa.kind !== "shader") return;
    const dom = lienzo.current;
    if (!dom) return;
    let cancelado = false;
    let crea: ShaderInstance | null = null;
    void (async () => {
      try {
        const gpu = señales.webgpu ? await dispositivoCompartido().catch(() => undefined) : undefined;
        const { createShader } = await import("shaders/js");
        if (cancelado) return;
        const preset = { components: componentes, ...(typeof capa.preset?.structureVersion === "number" ? { structureVersion: capa.preset.structureVersion } : {}) } as unknown as PresetConfig;
        const creada = await createShader(dom, preset, {
          disableTelemetry: true,
          ...(gpu ? { gpu } : {}),
          onError: () => setFallo(true), // GPU terminal: respaldo fijo
        });
        if (cancelado) { creada.destroy(); return; }
        crea = creada;
        setInstancia(creada);
      } catch { setFallo(true); } // import o creación fallidos → «fijo»
    })();
    return () => { cancelado = true; crea?.destroy(); }; // la LIMPIEZA destruye (el estado puede llegar tarde)
  }, [firma, modo, señales.listo, señales.webgpu]);

  // PROPS EN VIVO — misma estructura: `update(id, props)` por componente con id.
  const firmaAntes = useRef(firma);
  useEffect(() => {
    if (instancia && firmaAntes.current === firma) {
      for (const c of componentes) if (typeof c.id === "string" && c.id) instancia.update(c.id, c.props ?? {});
    }
    firmaAntes.current = firma;
  }, [firma, instancia, componentes]);

  // RITMO — vivo a fondo, o 30 fps con batería (el paquete no da tope de fps:
  // alternamos pausa/resumen cada 33 ms para no pasar de ~30; pausado → pause).
  useEffect(() => {
    if (!instancia) return;
    if (modo === "vivo") { instancia.resume(); return; }
    if (modo !== "vivo-30fps") { instancia.pause(); return; }
    const ins = instancia;
    let viva = true;
    let apagar = 0;
    const pulso = window.setInterval(() => {
      if (!viva) return;
      ins.resume();
      apagar = window.setTimeout(() => { if (viva) ins.pause(); }, 15);
    }, 33);
    return () => { viva = false; window.clearInterval(pulso); window.clearTimeout(apagar); ins.pause(); };
  }, [instancia, modo]);

  // RENDER — «fijo»: vista previa del set o NADA (queda visible el motor base).
  const estilo = { ...estiloDeCapa(capa.transform), ...mascaraCss(capa.mascara) };
  if (modo === "fijo" && !vistaPrevia) return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={estilo}>
      {modo === "fijo" && vistaPrevia
        ? <img src={vistaPrevia} alt="Vista previa del fondo" className="size-full object-cover" />
        : <canvas ref={lienzo} className="size-full" />}
    </div>
  );
}
