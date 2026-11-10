"use client";

/**
 * Selector de cámara y «Opciones de cámara» (VID1110A).
 * Lista cada cámara con un nombre claro («Cámara de esta Mac», «Cámara del iPhone (Continuidad)», «Cámara trasera»),
 * marca la del propio aparato como la predeterminada y deja las demás como opción. «Cámara de otra neurona» aparece
 * desactivada con su motivo hasta que el puente de la cámara remota esté conectado (no hay controles muertos).
 * Las opciones salen de `track.getCapabilities()`: lo que esa cámara no admite no se enseña.
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  describirCamaras,
  elegirCamaraPorDefecto,
  guardarPreferencia,
  leerCapacidades,
  leerPreferencias,
  plataformaDe,
  restriccionesDeOpciones,
  type CamaraInfo,
  type Plataforma,
  type OpcionesCamara,
} from "@/lib/llamadas/camaras";

const caja = "rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[12px] text-white/80";
const select = "w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50";

export const MOTIVO_CAMARA_REMOTA = "Llega con la siguiente ola: usar la cámara de otra de tus neuronas. Hoy, el iPhone se elige arriba como Cámara de Continuidad.";

/** La plataforma real del aparato: SOLO aquí, en el borde, se mira el navegador. Todo lo demás la recibe como dato. */
export function plataformaActual(): Plataforma {
  return plataformaDe(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

export function useCamarasDescritas(camaras: ReadonlyArray<{ id: string; nombre: string }>, plataforma: Plataforma = plataformaActual()): CamaraInfo[] {
  return useMemo(() => describirCamaras(camaras, plataforma), [camaras, plataforma]);
}

export function SelectorCamara({
  camaras,
  elegidaId,
  neurona,
  onElegir,
  plataforma,
}: {
  camaras: ReadonlyArray<{ id: string; nombre: string }>;
  elegidaId: string | null;
  neurona: string;
  onElegir?: (id: string) => void;
  /** Explícita en pruebas; por defecto, la detectada en el borde (`plataformaActual`). */
  plataforma?: Plataforma;
}) {
  const lista = useCamarasDescritas(camaras, plataforma);
  const porDefecto = useMemo(() => elegirCamaraPorDefecto(lista, leerPreferencias(neurona).camara).camara?.id ?? null, [lista, neurona]);
  const actual = elegidaId ?? porDefecto;
  return (
    <div className={caja}>
      <label className="mb-1 block text-white/55" htmlFor="camara-llamada">Cámara</label>
      {lista.length === 0 ? (
        <p id="camara-llamada" className="text-white/60">No vemos ninguna cámara en este aparato (o aún no hay permiso para listarlas).</p>
      ) : (
        <div id="camara-llamada" role="radiogroup" aria-label="Cámara" className="flex flex-col gap-1">
          {lista.map((c) => {
            const sel = c.id === actual;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={!onElegir}
                title={c.etiqueta && c.etiqueta !== c.nombre ? c.etiqueta : undefined}
                onClick={() => onElegir?.(c.id)}
                className={cn("flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 disabled:cursor-not-allowed disabled:opacity-50", sel ? "border-violet-300/60 bg-violet-400/20" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]")}
              >
                <span className="min-w-0 break-words text-[12.5px] text-white">{c.nombre}</span>
                {c.id === porDefecto && <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] text-white/70">predeterminada</span>}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={false}
            disabled
            aria-describedby="motivo-camara-remota"
            className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-left opacity-50"
          >
            <span className="text-[12.5px] text-white">Cámara de otra neurona</span>
          </button>
          <p id="motivo-camara-remota" className="px-1 text-[11px] text-white/55">{MOTIVO_CAMARA_REMOTA}</p>
        </div>
      )}
    </div>
  );
}

/** Opciones de la cámara abierta. Cada control solo aparece si la cámara lo admite; el resto, una línea que lo explica. */
export function OpcionesDeCamara({ pista, neurona, espejo, onEspejo }: { pista: MediaStreamTrack | null | undefined; neurona: string; espejo?: boolean; onEspejo?: (v: boolean) => void }) {
  const cap = useMemo(() => leerCapacidades(pista), [pista]);
  const etiqueta = pista?.label ?? "";
  const [o, setO] = useState<OpcionesCamara>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setO(leerPreferencias(neurona).opciones?.[etiqueta] ?? {});
    setError(null);
  }, [neurona, etiqueta]);

  if (!pista) return <p className={caja}>Enciende la cámara para ver sus opciones.</p>;

  const aplicar = (cambio: Partial<OpcionesCamara>) => {
    const siguiente = { ...o, ...cambio };
    setO(siguiente);
    guardarPreferencia(neurona, { opciones: { [etiqueta]: siguiente } });
    const r = restriccionesDeOpciones(siguiente, cap);
    if (!Object.keys(r).length) return;
    void pista
      .applyConstraints(r)
      .then(() => setError(null))
      .catch(() => setError("Esta cámara no aceptó ese ajuste; se queda como estaba."));
  };

  const algo = cap.resoluciones.length > 0 || cap.fps.length > 0 || !!cap.zoom || cap.linterna || cap.enfoque.length > 0 || cap.exposicion.length > 0;
  const ajustes = (() => {
    try {
      return pista.getSettings?.() ?? {};
    } catch {
      return {};
    }
  })();
  return (
    <div className={cn(caja, "space-y-2")} aria-label="Opciones de cámara">
      <p className="text-white/55">Opciones de cámara</p>
      {!algo && <p className="text-white/60">Esta cámara no deja cambiar sus ajustes desde la página (resolución, zoom…): se usan los del sistema.</p>}
      {cap.resoluciones.length > 0 && (
        <label className="block">
          <span className="mb-0.5 block text-white/55">Resolución</span>
          <select className={select} value={o.alto ?? ""} onChange={(e) => aplicar({ alto: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Automática{ajustes.height ? ` (${ajustes.height}p)` : ""}</option>
            {cap.resoluciones.map((h) => <option key={h} value={h}>{h}p</option>)}
          </select>
        </label>
      )}
      {cap.fps.length > 0 && (
        <label className="block">
          <span className="mb-0.5 block text-white/55">Imágenes por segundo</span>
          <select className={select} value={o.fps ?? ""} onChange={(e) => aplicar({ fps: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Automático</option>
            {cap.fps.map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </label>
      )}
      {cap.zoom && (
        <label className="block">
          <span className="mb-0.5 block text-white/55">Zoom {(o.zoom ?? cap.zoom.min).toFixed(1)}×</span>
          <input type="range" className="w-full" min={cap.zoom.min} max={cap.zoom.max} step={cap.zoom.paso} value={o.zoom ?? cap.zoom.min} onChange={(e) => aplicar({ zoom: Number(e.target.value) })} />
        </label>
      )}
      {cap.linterna && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!o.linterna} onChange={(e) => aplicar({ linterna: e.target.checked })} /> Linterna
        </label>
      )}
      {cap.enfoque.length > 0 && (
        <label className="block">
          <span className="mb-0.5 block text-white/55">Enfoque</span>
          <select className={select} value={o.enfoque ?? ""} onChange={(e) => aplicar({ enfoque: (e.target.value || null) as OpcionesCamara["enfoque"] })}>
            <option value="">Automático</option>
            {cap.enfoque.includes("continuous") && <option value="continuous">Continuo</option>}
            {cap.enfoque.includes("manual") && <option value="manual">Manual</option>}
            {cap.enfoque.includes("single-shot") && <option value="single-shot">Una vez</option>}
          </select>
        </label>
      )}
      {cap.exposicion.length > 0 && (
        <label className="block">
          <span className="mb-0.5 block text-white/55">Exposición</span>
          <select className={select} value={o.exposicion ?? ""} onChange={(e) => aplicar({ exposicion: (e.target.value || null) as OpcionesCamara["exposicion"] })}>
            <option value="">Automática</option>
            {cap.exposicion.includes("continuous") && <option value="continuous">Continua</option>}
            {cap.exposicion.includes("manual") && <option value="manual">Manual</option>}
          </select>
        </label>
      )}
      {cap.facing.length > 0 && <p className="text-white/55">Mira hacia: {cap.facing.map((f) => (f === "user" ? "ti" : f === "environment" ? "delante" : f)).join(", ")}.</p>}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={espejo ?? o.espejo ?? true} disabled={!onEspejo} onChange={(e) => { aplicar({ espejo: e.target.checked }); onEspejo?.(e.target.checked); }} /> Ver mi imagen como espejo
      </label>
      {error && <p role="status" className="text-amber-300">{error}</p>}
    </div>
  );
}
