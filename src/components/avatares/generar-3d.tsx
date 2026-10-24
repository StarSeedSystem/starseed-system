"use client";
/**
 * Botón y diálogo «Crear en 3D desde una imagen» (G3D1011E). Contrato: architecture/astraura-avatares-3d.md §11.
 * El destino lo pone quien lo monta (Protomolécula, avatar, bot o pieza). Enseña el plan por etapa con su motor
 * o el porqué, qué neurona podría, pide permiso si solo queda el Space remoto y guarda el GLB en la Biblioteca.
 * Basta de ilusiones: el taller local (servicios/taller-3d, AV1011F) aún no existe, así que por defecto no se
 * conecta; el Space va DESDE EL NAVEGADOR de cada persona (adaptador de los
 * Spaces de Pixal3D y TRELLIS.2, cuota ZeroGPU de cada quien; la ruta del
 * servidor /api/avatares/espacio-hf queda solo como respaldo) y la Biblioteca
 * por la subida de archivos del OS. Y lo que el Space no da (malla cerrada y
 * niveles de detalle) queda encargado a la neurona que pueda con
 * `encargoDeCierre` y el reparto de G3D1011D, leído del registro de MetaGenesis.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";
import { encargoDeCierre, espaciosComoDependencia } from "@/lib/avatares/adaptadores/espacios-3d";
import { hierroDeCapacidades, type NeuronaTaller } from "@/lib/avatares/adaptadores/reparto-taller";
import { useGenerar3d, type Contexto3D, type Dependencias3D } from "@/lib/avatares/adaptadores/use-generar-3d";
import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { uploadFile } from "@/lib/files/os-files";
import { saveResource, useSavedLibrary } from "@/lib/library-store";

const ETAPA: Record<string, string> = { generar: "Generar la malla", remallar: "Remallar", riggear: "Esqueleto", detallar: "Mejorar detalle", animar: "Animar" };
const DESTINO: Record<Destino3D, string> = { protomolecula: "Protomolécula", impresion: "Impresión", avatar: "Avatar", bot: "Cuerpo del bot", pieza: "Pieza" };

/**
 * Las neuronas del registro de MetaGenesis (G3D1011D): la parte `taller` que `resumirBus` adjunta a cada
 * `NodoVista`. null si aquí no se leyó el registro (no se dice que no haya ninguna).
 */
function neuronasDelRegistro(): Promise<readonly NeuronaTaller[] | null> {
  return leerEstadoAutonomo().then((e) =>
    e.ok ? e.estado.nodos.map((n) => n.taller).filter((t): t is NeuronaTaller => !!t) : null,
  ).catch(() => null);
}

/** Lo de verdad por defecto: sin taller local (no existe aún), Space desde el navegador de la persona y la Biblioteca. */
function dependenciasDelOs(): Dependencias3D {
  return {
    taller: null,
    // La llamada sale del navegador, con la cuota ZeroGPU de la persona y el
    // token de su aparato; si Pixal3D no puede, respaldo en TRELLIS.2.
    espacio: espaciosComoDependencia(),
    guardar: async (e) => {
      const archivo = new File([e.glb], `${e.titulo || "modelo-3d"}.glb`, { type: "model/gltf-binary" });
      const sub = await uploadFile(archivo, { folder: "biblioteca/modelos-3d", meta: { destino: e.destino, lods: e.lods, procedencia: e.procedencia, atribuciones: e.atribuciones } });
      if (!sub.ok || !sub.file) return { ok: false, motivo: sub.error ?? "la subida no devolvió el archivo" };
      const origen = [`Taller 3D · ${e.destino}`, ...e.procedencia.map((p) => `${p.herramienta} (${p.licencia})`), ...e.atribuciones].join(" · ");
      saveResource({ id: `modelo-3d-${sub.file.id}`, kind: "modelo-3d", title: e.titulo, url: sub.file.url ?? undefined, origin: origen });
      return { ok: true, ref: `biblioteca:modelo-3d-${sub.file.id}`, aviso: sub.warning };
    },
  };
}
export interface Generar3DProps {
  destino: Destino3D;
  contexto?: Partial<Omit<Contexto3D, "destino">>;
  dependencias?: Dependencias3D;
  etiqueta?: string;
  /** Las neuronas del registro de MetaGenesis; por defecto se leen de verdad al abrir el diálogo. */
  leerNeuronas?: () => Promise<readonly NeuronaTaller[] | null>;
}

export function Generar3D({ destino, contexto, dependencias, etiqueta = "Crear en 3D desde una imagen", leerNeuronas }: Generar3DProps) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [img, setImg] = useState<{ blob: Blob; nombre: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [permiso, setPermiso] = useState(false), [personas, setPersonas] = useState(false), [consiente, setConsiente] = useState(false);
  const [neuronas, setNeuronas] = useState<readonly NeuronaTaller[] | null>(null);
  const [cierre, setCierre] = useState<{ encargado: boolean; texto: string } | null>(null);
  const cierreDeRef = useRef<string | null>(null);
  // El encargo de cierre solo se calcula con el registro YA leído: si quien lo monta lo trae, ya está.
  const [neuronasLeidas, setNeuronasLeidas] = useState(contexto?.neuronas !== undefined);
  const leoNeuronas = useMemo(() => leerNeuronas ?? neuronasDelRegistro, [leerNeuronas]);
  const imagenes = useSavedLibrary().items.filter((r) => r.kind === "image" && r.url);
  const c = useMemo<Contexto3D>(() => ({
    destino, region: null, comercial: false, cuenta: null, neuronas,
    hierro: typeof navigator === "undefined" ? null : hierroDeCapacidades({ platform: navigator.platform, memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory }),
    ...contexto,
  }), [destino, contexto, neuronas]);
  const deps = useMemo(() => dependencias ?? dependenciasDelOs(), [dependencias]);
  const { preparado: p, estado, generar, reiniciar } = useGenerar3d(c, deps);
  // Al abrir el diálogo se lee el registro de neuronas de MetaGenesis (una vez, no en cada latido).
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setCierre(null);
    cierreDeRef.current = null;
    void leoNeuronas().then((n) => { if (vivo) { setNeuronas(n); setNeuronasLeidas(true); } });
    return () => { vivo = false; };
  }, [abierto, leoNeuronas]);
  // Guardado el GLB, lo que el Space no da (malla cerrada y LOD) se le encarga a la neurona que pueda (§11.1/§11.2).
  useEffect(() => {
    if (estado.fase !== "hecha" || !neuronasLeidas) return;
    if (cierreDeRef.current === estado.ref) return;
    cierreDeRef.current = estado.ref;
    const encargo = encargoDeCierre(destino, { cuenta: c.cuenta ?? null, grupos: c.grupos, region: c.region, comercial: c.comercial }, c.neuronas);
    setCierre({ encargado: encargo.encargado, texto: encargo.encargado ? `Cierre y niveles de detalle: ${encargo.motivo} (la orden ya está formada para el préstamo de MetaGenesis).` : `Cierre y niveles de detalle pendientes: ${encargo.motivo}` });
  }, [estado, destino, c, neuronasLeidas]);
  const remota = p.via === "remota", ocupado = estado.fase === "generando";
  const puede = !!img && p.via !== "ninguna" && !ocupado && (!remota || (permiso && (!personas || consiente)));
  const deBiblioteca = async (url: string, nombre: string) => {
    setAviso(null);
    try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); setImg({ blob: await r.blob(), nombre }); }
    catch (e) { setAviso(`No se pudo leer esa imagen de la Biblioteca (${e instanceof Error ? e.message : "error"}).`); }
  };
  if (!abierto) return <button type="button" className="cursor-pointer rounded-xl border px-3 py-2 text-sm" onClick={() => setAbierto(true)}>{etiqueta}</button>;
  return (
    <div role="dialog" aria-labelledby={`${id}-t`} className="rounded-2xl border p-4 text-sm" onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) setAbierto(false); }}>
      <h3 id={`${id}-t`} className="text-lg font-semibold">{etiqueta}</h3>
      <p className="text-white/70">Destino: {DESTINO[destino]} · resolución {p.optimizacion.generador.resolucion}{p.optimizacion.generador.pocaMemoria ? " (poca memoria)" : ""} · niveles de detalle {p.optimizacion.lods.join(" · ")}{p.optimizacion.cerrada ? " · malla cerrada" : ""}</p>
      <label className="mt-3 block">Imagen de este aparato (PNG, JPEG o WebP)
        <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImg({ blob: f, nombre: f.name }); }} />
      </label>
      {imagenes.length > 0 && (
        <label className="mt-2 block">O de tu Biblioteca
          <select className="mt-1 block cursor-pointer rounded border bg-transparent" defaultValue="" onChange={(e) => { const r = imagenes.find((x) => x.id === e.target.value); if (r?.url) void deBiblioteca(r.url, r.title); }}>
            <option value="" disabled>Elige una imagen…</option>
            {imagenes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>
      )}
      {img && <p className="mt-1 text-white/70">Elegida: {img.nombre}</p>}
      <ol className="mt-3 space-y-1" aria-label="Plan por etapa">
        {p.plan.pasos.map((s) => (
          <li key={s.etapa}><strong>{ETAPA[s.etapa] ?? s.etapa}:</strong> {s.saltada ? s.motivo : s.motor ? s.motor.nombre : `No hay motor. ${s.motivo}`}
            {!s.saltada && !s.motor && s.descartes.length > 0 && <ul className="ml-4 list-disc text-white/70">{s.descartes.map((d) => <li key={d}>{d}</li>)}</ul>}
          </li>
        ))}
      </ol>
      <p className="mt-2">{p.motivo} <span className="text-white/70">{p.neurona}</span></p>
      {remota && (
        <fieldset className="mt-3 rounded-xl border border-amber-400/60 p-3">
          <legend className="px-1 font-medium">Aviso: tu imagen sale de este aparato</legend>
          <p>Se envía desde tu navegador al Space público de Hugging Face (TencentARC/Pixal3D; si no puede, respaldo en microsoft/TRELLIS.2). Gasta TU cuota gratuita de ZeroGPU y lo que subas deja de estar solo contigo. Un token de Hugging Face, si lo pones, vive solo en este aparato.</p>
          <label className="mt-2 flex cursor-pointer gap-2"><input type="checkbox" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />Doy permiso para enviar esta imagen.</label>
          <label className="mt-1 flex cursor-pointer gap-2"><input type="checkbox" checked={personas} onChange={(e) => setPersonas(e.target.checked)} />La imagen contiene personas.</label>
          {personas && <label className="mt-1 flex cursor-pointer gap-2"><input type="checkbox" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} />Las personas que aparecen han dado su consentimiento.</label>}
        </fieldset>
      )}
      <div role="status" aria-live="polite" className="mt-3">
        {aviso && <p className="text-amber-300">{aviso}</p>}
        {estado.fase === "generando" && <p>Intento {estado.intento}: {estado.etapa}{estado.progreso === null ? "" : ` (${Math.round(estado.progreso)} %)`}
          {estado.progreso !== null && <progress className="block w-full" max={100} value={estado.progreso} />}</p>}
        {estado.fase === "error" && <p className="text-amber-300">{estado.motivo}</p>}
        {estado.fase === "hecha" && <div className="text-emerald-300"><p>Guardado en tu Biblioteca ({estado.ref}){estado.lods.length ? ` con niveles de detalle ${estado.lods.join(" · ")}` : ""}.</p>
          {estado.atribuciones.length > 0 && <p>Atribución obligatoria: {estado.atribuciones.join(" · ")}</p>}
          {estado.avisos.map((a) => <p key={a} className="text-amber-300">{a}</p>)}</div>}
        {cierre && <p className={cierre.encargado ? "text-emerald-300" : "text-amber-300"}>{cierre.texto}</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!puede} className="cursor-pointer rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => img && void generar(img.blob, { titulo: img.nombre.replace(/\.[^.]+$/, ""), permisoRemoto: permiso, esFotoDePersonas: personas, consentimientoPersonas: consiente })}>Generar</button>
        <button type="button" disabled={ocupado} className="cursor-pointer rounded-xl border px-3 py-2" onClick={() => { reiniciar(); setAbierto(false); }}>Cerrar</button>
      </div>
    </div>
  );
}
