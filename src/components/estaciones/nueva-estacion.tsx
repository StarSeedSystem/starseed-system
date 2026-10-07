"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { detectarFormato, tipoSugerido } from "@/lib/estaciones/formato";
import { validarEstacion, ETIQUETA_TIPO, ETIQUETA_LICENCIA, normalizarCategorias } from "@/lib/estaciones/tipos";
import { publicarEstacion, editarEstacion } from "@/lib/estaciones/datos";
import { anunciarEnMalla } from "@/lib/estaciones/malla";
import type { Estacion, BorradorEstacion, TipoEstacion, LicenciaEstacion } from "@/lib/estaciones/tipos";

export interface NuevaEstacionProps { abierto: boolean; onCerrar: () => void; inicial?: Partial<BorradorEstacion> & { id?: string }; ambitos?: { tipo: "persona" | "entidad"; ref: string | null; nombre: string }[]; onGuardada?: (e: Estacion) => void; }

export function NuevaEstacion({ abierto, onCerrar, inicial, ambitos, onGuardada }: NuevaEstacionProps) {
  const [enlace, setEnlace] = useState(inicial?.enlace ?? "");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [tipo, setTipo] = useState<TipoEstacion>((inicial?.tipo as TipoEstacion) ?? "audio");
  const [licencia, setLicencia] = useState<LicenciaEstacion>((inicial?.licencia as LicenciaEstacion) ?? "cc0");
  const [categorias, setCategorias] = useState(inicial?.categorias ? inicial.categorias.join(", ") : "");
  const [idioma, setIdioma] = useState(inicial?.idioma ?? "es");
  const [empiezaEn, setEmpiezaEn] = useState(inicial?.empieza_en ?? "");
  const [terminaEn, setTerminaEn] = useState(inicial?.termina_en ?? "");
  const [visibilidad, setVisibilidad] = useState((inicial?.visibilidad as "publica" | "grupo") ?? "publica");
  const [ambitoTipo, setAmbitoTipo] = useState<"persona" | "entidad">(inicial?.ambito_tipo ?? "persona");
  const [entidadRef, setEntidadRef] = useState(inicial?.entidad_ref ?? "");
  const [enMalla, setEnMalla] = useState(inicial?.en_malla ?? false);
  const [errores, setErrores] = useState<Record<string, string[]>>({});
  const [guardando, setGuardando] = useState(false);
  const [formatoInfo, setFormatoInfo] = useState<{ formato: string; motivo: string; reproductor: string; urlIncrustable: string | null; soloAudio: boolean } | null>(null);

  useEffect(() => { if (!abierto) return; setEnlace(inicial?.enlace ?? ""); setTitulo(inicial?.titulo ?? ""); setDescripcion(inicial?.descripcion ?? ""); }, [abierto, inicial]);

  useEffect(() => { if (!enlace.trim()) { setFormatoInfo(null); return; } const d = detectarFormato(enlace.trim(), tipo); setFormatoInfo({ formato: d.formato, motivo: d.motivo, reproductor: d.reproductor, urlIncrustable: d.urlIncrustable, soloAudio: d.soloAudio }); if (!inicial?.tipo) { setTipo(tipoSugerido(d)); } }, [enlace, tipo, inicial?.tipo]);

  const campoErr = (c: string) => errores[c]?.join(" ") ?? "";

  const guardar = async () => {
    setErrores({});
    const borrador = { titulo, tipo, fuente: "enlace" as const, enlace, licencia, descripcion, imagen: null as string | null, idioma, categorias: normalizarCategorias(categorias), visibilidad, empieza_en: empiezaEn || null, termina_en: terminaEn || null, ambito_tipo: ambitoTipo, entidad_ref: ambitoTipo === "entidad" ? entidadRef || null : null, en_malla: enMalla };
    const v = validarEstacion(borrador);
    if (!v.ok) { const porCampo: Record<string, string[]> = {}; for (const msg of v.errores) { let c = "general"; if (msg.toLowerCase().includes("título")) c = "titulo"; else if (msg.toLowerCase().includes("descripción")) c = "descripcion"; else if (msg.toLowerCase().includes("tipo")) c = "tipo"; else if (msg.toLowerCase().includes("enlace")) c = "enlace"; else if (msg.toLowerCase().includes("licencia")) c = "licencia"; else if (msg.toLowerCase().includes("empieza") || msg.toLowerCase().includes("termina")) c = "horario"; else if (msg.toLowerCase().includes("entidad")) c = "entidad"; else if (msg.toLowerCase().includes("categoría")) c = "categorias"; if (!porCampo[c]) porCampo[c] = []; porCampo[c].push(msg); } setErrores(porCampo); return; }
    const datos = v.estacion;
    setGuardando(true);
    try {
      const res = inicial?.id ? await editarEstacion(inicial.id, datos) : await publicarEstacion(datos);
      if (res.ok) { if (datos.en_malla && (res as { ok: true; estacion: Estacion }).estacion) { try { await anunciarEnMalla((res as { ok: true; estacion: Estacion }).estacion); } catch { /* no bloquea */ } } onGuardada?.((res as { ok: true; estacion: Estacion }).estacion); onCerrar(); }
      else { setErrores({ general: [res.error ?? "Error al guardar."] }); }
    } catch { setErrores({ general: ["Error al guardar."] }); } finally { setGuardando(false); }
  };

  const clsInput = "h-10 rounded-md border border-white/20 bg-black/40 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 cursor-text";
  const clsSelect = clsInput + " cursor-pointer";

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{inicial?.id ? "Editar estación" : "Publicar estación"}</DialogTitle><DialogDescription>Enlaces de transmisión en directo libres.</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Enlace</span><input type="url" value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="https://..." className={clsInput} />{campoErr("enlace") && <span className="text-xs text-red-400">{campoErr("enlace")}</span>}{formatoInfo && <span className="text-xs text-white/60">{formatoInfo.motivo}</span>}</label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Título</span><input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nombre de la transmisión" className={clsInput} />{campoErr("titulo") && <span className="text-xs text-red-400">{campoErr("titulo")}</span>}</label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Descripción</span><textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Qué se emite..." rows={2} className="rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none cursor-text" />{campoErr("descripcion") && <span className="text-xs text-red-400">{campoErr("descripcion")}</span>}</label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Tipo</span><select value={tipo} onChange={e => setTipo(e.target.value as TipoEstacion)} className={clsSelect}>{Object.entries(ETIQUETA_TIPO).map(([k, v]) => <option key={k} value={k} className="bg-black text-white">{v}</option>)}</select>{campoErr("tipo") && <span className="text-xs text-red-400">{campoErr("tipo")}</span>}</label>
          <div className="flex flex-col gap-2"><span className="text-sm font-medium text-white">Licencia (obligatoria)</span><div className="flex flex-wrap gap-3">{(Object.keys(ETIQUETA_LICENCIA) as LicenciaEstacion[]).map(l => <label key={l} className="flex items-center gap-2 text-sm text-white/90 cursor-pointer"><input type="radio" name="licencia" checked={licencia === l} onChange={() => setLicencia(l)} className="cursor-pointer" /><span className="text-xs">{ETIQUETA_LICENCIA[l]}</span></label>)}</div>{campoErr("licencia") && <span className="text-xs text-red-400">{campoErr("licencia")}</span>}</div>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Categorías (separadas por comas)</span><input value={categorias} onChange={e => setCategorias(e.target.value)} placeholder="música, charla" className={clsInput} />{campoErr("categorias") && <span className="text-xs text-red-400">{campoErr("categorias")}</span>}</label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Idioma</span><input value={idioma} onChange={e => setIdioma(e.target.value)} placeholder="es" maxLength={10} className={clsInput} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Empieza</span><input type="datetime-local" value={empiezaEn} onChange={e => setEmpiezaEn(e.target.value)} className={clsInput} /></label><label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Termina</span><input type="datetime-local" value={terminaEn} onChange={e => setTerminaEn(e.target.value)} className={clsInput} /></label></div>{campoErr("horario") && <span className="text-xs text-red-400">{campoErr("horario")}</span>}
          {ambitos && ambitos.length > 0 && <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Ámbito</span><select value={ambitoTipo} onChange={e => { setAmbitoTipo(e.target.value as "persona" | "entidad"); setEntidadRef(""); }} className={clsSelect}><option value="persona">Persona</option>{ambitos.map(a => <option key={a.ref ?? a.nombre} value="entidad">{a.tipo === "entidad" ? `Entidad: ${a.nombre}` : "Persona"}</option>)}</select></label>}
          {ambitoTipo === "entidad" && <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Referencia de entidad</span><input value={entidadRef} onChange={e => setEntidadRef(e.target.value)} placeholder="ref" className={clsInput} />{campoErr("entidad") && <span className="text-xs text-red-400">{campoErr("entidad")}</span>}</label>}
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-white">Visibilidad</span><select value={visibilidad} onChange={e => setVisibilidad(e.target.value as "publica" | "grupo")} className={clsSelect}><option value="publica">Pública</option><option value="grupo">Del grupo (con ámbito entidad)</option></select></label>
          <label className="flex items-center gap-2 text-sm text-white/90 cursor-pointer"><input type="checkbox" checked={enMalla} onChange={e => setEnMalla(e.target.checked)} className="cursor-pointer" /><span>Anunciar también por la malla</span></label>
          {campoErr("general") && <div className="text-xs text-red-400">{campoErr("general")}</div>}
        </div>
        <DialogFooter className="mt-2"><button type="button" onClick={onCerrar} className="h-10 rounded-md border border-white/20 px-4 text-sm text-white hover:bg-white/5 cursor-pointer">Cancelar</button><button type="button" onClick={guardar} disabled={guardando} className="h-10 rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-40 cursor-pointer">{guardando ? (inicial?.id ? "Actualizando..." : "Publicando...") : (inicial?.id ? "Guardar cambios" : "Publicar estación")}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
