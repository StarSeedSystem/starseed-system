'use client';

/**
 * CapaShader — pinta UNA capa `shader` de la pila de fondos (Ola 1018F · FSH1018E · architecture/fondos-shaders.md).
 * Un canvas por capa; `shaders/js` se carga a demanda y SIEMPRE con `disableTelemetry: true`. El modo lo decide
 * `modoDeCapa` (puro): «fijo» pinta la vista previa del set o nada (se ve el motor base, que sigue siendo el
 * principal), «pausado» conserva el último fotograma y «vivo-30fps» limita el ritmo con batería. Si la GPU falla
 * para siempre, la capa pasa a fija. La posición y el tamaño de la capa los pone la pila que la contiene.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ShaderInstance } from "shaders/js";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { intervaloFotogramaMs, modoDeCapa, necesitaMotor } from "@/lib/appearance/politica-shader";
import { OPCIONES_RENDER_SHADER } from "@/lib/protomolecula/atomos/fondo-shader";

type Componente = { type?: string; id?: string; props?: Record<string, unknown>; children?: Componente[] };
type Bateria = EventTarget & { charging: boolean; level: number };
const CAMARA = ["WebcamTexture", "ObjectTracker"];
const aplanar = (cs: Componente[]): Componente[] => cs.flatMap((c) => [c, ...aplanar(c.children ?? [])]);

export interface CapaShaderProps {
  capa: BackgroundLayer;
  /** PNG fijo del set (`SetFondo.vistaPrevia`) para aparatos sin WebGPU, ahorro o «reducir movimiento». */
  vistaPrevia?: string;
  /** La persona pidió ahorrar energía (ajuste del OS); el navegador no lo dice de forma estándar. */
  ahorroBateria?: boolean;
  /** Permiso explícito para `WebcamTexture`/`ObjectTracker`; sin él, la capa se queda fija. Nunca en fondos compartidos. */
  permitirCamara?: boolean;
  className?: string;
}

/** Mide el entorno que pide la política: WebGPU, «reducir movimiento», batería y visibilidad de la pestaña. */
function useEntorno() {
  const [e, setE] = useState({ webgpu: false, reducirMovimiento: false, bateriaPct: null as number | null, visible: true });
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let bat: Bateria | null = null;
    const medir = () => setE({ webgpu: "gpu" in navigator, reducirMovimiento: !!mq?.matches,
      bateriaPct: bat && !bat.charging ? Math.round(bat.level * 100) : null, visible: document.visibilityState !== "hidden" });
    medir();
    mq?.addEventListener?.("change", medir);
    document.addEventListener("visibilitychange", medir);
    const nav = navigator as Navigator & { getBattery?: () => Promise<Bateria> };
    nav.getBattery?.().then((b) => { bat = b; b.addEventListener("chargingchange", medir); b.addEventListener("levelchange", medir); medir(); }).catch(() => {});
    return () => {
      mq?.removeEventListener?.("change", medir);
      document.removeEventListener("visibilitychange", medir);
      bat?.removeEventListener("chargingchange", medir);
      bat?.removeEventListener("levelchange", medir);
    };
  }, []);
  return e;
}

export function CapaShader({ capa, vistaPrevia, ahorroBateria = false, permitirCamara = false, className }: CapaShaderProps) {
  const entorno = useEntorno();
  const canvas = useRef<HTMLCanvasElement>(null);
  const inst = useRef<ShaderInstance | null>(null);
  const previas = useRef(new Map<string, string>());
  const [fallo, setFallo] = useState(false);
  const [listo, setListo] = useState(0); // sube cuando el motor termina de crearse (es asíncrono)
  const componentes = (capa.preset?.components ?? []) as Componente[];
  const usaCamara = aplanar(componentes).some((c) => CAMARA.includes(c.type ?? ""));
  const modo = fallo || (usaCamara && !permitirCamara) || componentes.length === 0 ? "fijo" : modoDeCapa({ ...entorno, ahorroBateria });
  // La estructura (tipos e ids) obliga a recrear; un cambio solo de props se aplica con `update(id, props)`.
  const estructura = JSON.stringify(aplanar(componentes).map((c) => [c.type, c.id]));
  const conMotor = necesitaMotor(modo);

  useEffect(() => {
    const lienzo = canvas.current;
    if (!conMotor || !lienzo) return;
    let vivo = true;
    previas.current = new Map(aplanar(componentes).map((c) => [c.id ?? "", JSON.stringify(c.props ?? {})]));
    let s: ShaderInstance | null = null; // onError puede llegar antes de que createShader resuelva
    import("shaders/js").then(async ({ createShader }) => {
      s = await createShader(lienzo, { components: componentes as never, structureVersion: capa.preset?.structureVersion },
        { ...OPCIONES_RENDER_SHADER, onError: () => { if (s?.getFailureReason()) setFallo(true); } });
      if (!vivo) return s.destroy();
      if (s.getFailureReason()) return setFallo(true); // fallo terminal antes de resolver
      inst.current = s;
      s.resize(lienzo.clientWidth, lienzo.clientHeight);
      setListo((n) => n + 1);
    }).catch(() => { if (vivo) setFallo(true); });
    const ro = new ResizeObserver(() => inst.current?.resize(lienzo.clientWidth, lienzo.clientHeight));
    ro.observe(lienzo);
    return () => { vivo = false; ro.disconnect(); inst.current?.destroy(); inst.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se recrea solo si cambia la estructura del preset
  }, [conMotor, estructura]);

  // Props que cambian sin cambiar la estructura: `update(id, props)` en caliente, sin recrear el canvas.
  useEffect(() => {
    for (const c of aplanar(componentes)) {
      const id = c.id ?? "", nuevas = JSON.stringify(c.props ?? {});
      if (!id || previas.current.get(id) === nuevas) continue;
      previas.current.set(id, nuevas);
      inst.current?.update(id, c.props ?? {});
    }
  });

  // Ritmo: pausado conserva el último fotograma; 30 fps = un fotograma por intervalo y pausa en el siguiente.
  useEffect(() => {
    const s = inst.current, ms = intervaloFotogramaMs(modo);
    if (!s || modo === "fijo") return;
    if (modo === "pausado") { s.pause(); return; }
    if (!ms) { s.resume(); return; }
    s.pause();
    const t = window.setInterval(() => { s.resume(); requestAnimationFrame(() => s.pause()); }, ms);
    return () => window.clearInterval(t);
  }, [modo, listo]);

  if (!capa.visible) return null;
  const estilo = { opacity: capa.opacity, mixBlendMode: capa.blend } as CSSProperties;
  if (!conMotor)
    // eslint-disable-next-line @next/next/no-img-element -- data URL del set: next/image no aporta nada aquí
    return vistaPrevia ? <img src={vistaPrevia} alt="" aria-hidden className={`pointer-events-none h-full w-full object-cover ${className ?? ""}`} style={estilo} /> : null;
  return <canvas ref={canvas} aria-hidden data-modo={modo} className={`pointer-events-none block h-full w-full ${className ?? ""}`} style={estilo} />;
}

export default CapaShader;
