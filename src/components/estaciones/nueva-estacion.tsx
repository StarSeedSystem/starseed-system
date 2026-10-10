"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ETIQUETA_TIPO, ETIQUETA_LICENCIA, TIPOS_ESTACION, LICENCIAS_LIBRES, normalizarCategorias, type BorradorEstacion, type Estacion } from "@/lib/estaciones/tipos";
import { detectarFormato, tipoSugerido } from "@/lib/estaciones/formato";
import { validarEstacion } from "@/lib/estaciones/tipos";
import { publicarEstacion, editarEstacion } from "@/lib/estaciones/datos";
import { anunciarEnMalla } from "@/lib/estaciones/malla";
import { Link2, Orbit, Waves } from "lucide-react";
import { FuenteEnVivo } from "./en-vivo/fuente-en-vivo";
import type { FuenteTransmision } from "@/lib/estaciones/transmision-parametrica";

/** De dónde sale la estación: un enlace (lo de siempre) o una sesión EN VIVO sincronizada. */
export type ModoNuevaEstacion = "enlace" | FuenteTransmision;

const MODOS: { id: ModoNuevaEstacion; etiqueta: string; Icono: typeof Link2 }[] = [
  { id: "enlace", etiqueta: "Enlace o ruta", Icono: Link2 },
  { id: "omnifrecuencias", etiqueta: "Entonación de Omnifrecuencias en vivo", Icono: Waves },
  { id: "audiomorphic", etiqueta: "Espirales de Audiomorphic en vivo", Icono: Orbit },
];

export interface NuevaEstacionProps {
  abierto: boolean;
  onCerrar: () => void;
  inicial?: Partial<BorradorEstacion> & { id?: string };
  ambitos?: { tipo: "persona" | "entidad"; ref: string | null; nombre: string }[];
  onGuardada?: (e: Estacion) => void;
  /** Fuente con la que se abre (p. ej. «omnifrecuencias» desde la app oficial). */
  modoInicial?: ModoNuevaEstacion;
}

export function NuevaEstacion({ abierto, onCerrar, inicial, ambitos = [], onGuardada, modoInicial = "enlace" }: NuevaEstacionProps) {
  const [modo, setModo] = useState<ModoNuevaEstacion>(modoInicial);
  useEffect(() => { if (abierto) setModo(inicial?.id ? "enlace" : modoInicial); }, [abierto, modoInicial, inicial?.id]);
  const [form, setForm] = useState<BorradorEstacion>({ titulo:"", enlace:"", tipo:"mixto", fuente:"enlace", licencia:"cc-by", idioma:"es", visibilidad:"publica", en_malla:false, ambito_tipo:"persona", entidad_ref:null });
  const [cats, setCats] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tipoTocada, setTipoTocada] = useState(false);
  const [err, setErr] = useState<Record<string,string[]>>({});

  useEffect(() => {
    if (!abierto) return;
    const base: BorradorEstacion = {
      titulo: inicial?.titulo ?? "", descripcion: inicial?.descripcion ?? "", enlace: inicial?.enlace ?? "", tipo: inicial?.tipo ?? "mixto",
      fuente: inicial?.fuente ?? "enlace", licencia: inicial?.licencia ?? "cc-by", categorias: inicial?.categorias ?? [], idioma: inicial?.idioma ?? "es",
      visibilidad: inicial?.visibilidad ?? "publica", empieza_en: inicial?.empieza_en ?? null, termina_en: inicial?.termina_en ?? null,
      en_malla: inicial?.en_malla ?? false, ambito_tipo: inicial?.ambito_tipo ?? "persona", entidad_ref: inicial?.entidad_ref ?? null,
    };
    setForm(base); setCats((base.categorias??[]).join(", ")); setTipoTocada(!!inicial?.tipo); setErr({});
  }, [abierto, inicial]);

  const formato = useMemo(() => detectarFormato(form.enlace ?? "", form.tipo), [form.enlace, form.tipo]);
  useEffect(() => { setMotivo(formato.motivo); if (!tipoTocada && form.enlace) setForm(f => ({...f, tipo: tipoSugerido(formato)})); }, [formato, form.enlace, tipoTocada]);

  const opcionesAmbito = ambitos.length ? ambitos : [{tipo:"persona", ref:null, nombre:"Mi persona"}];

  const guardar = async () => {
    const conCats = {...form, categorias: normalizarCategorias(cats)};
    const v = validarEstacion(conCats);
    if (!v.ok) { const m: Record<string,string[]> = {}; v.errores.forEach(e => { if (/título/i.test(e)) m.titulo=[e]; else if (/enlace/i.test(e)) m.enlace=[e]; else if (/licencia/i.test(e)) m.licencia=[e]; else if (/tipo/i.test(e)) m.tipo=[e]; else if (/categoría/i.test(e)) m.categorias=[e]; else if (/empieza_en|termina_en/i.test(e)) m.horario=[e]; else m.general=[e]; }); setErr(m); return; }
    const res = inicial?.id ? await editarEstacion(inicial.id, conCats) : await publicarEstacion(conCats);
    if (!res.ok) { setErr({general:[res.error]}); return; }
    if (conCats.en_malla) anunciarEnMalla(res.estacion).catch(()=>{});
    onGuardada?.(res.estacion); onCerrar();
  };

  return (
    <Dialog open={abierto} onOpenChange={o=>!o && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{inicial?.id ? "Editar estación" : "Nueva estación"}</DialogTitle></DialogHeader>
        {!inicial?.id && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Fuente de la estación">
            {MODOS.map(({ id, etiqueta, Icono }) => (
              <button key={id} type="button" role="radio" aria-checked={modo === id} onClick={() => setModo(id)}
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs transition-colors duration-200 ${modo === id ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-white/70 hover:border-white/30"}`}>
                <Icono className="h-3.5 w-3.5" aria-hidden /> {etiqueta}
              </button>
            ))}
          </div>
        )}
        {modo !== "enlace" ? (
          <div className="max-h-[70vh] overflow-auto py-2">
            <FuenteEnVivo
              fuente={modo}
              ambito={form.ambito_tipo === "entidad" ? { tipo: "entidad", ref: form.entidad_ref ?? null } : { tipo: "persona", ref: null }}
              onPublicada={(e) => { if (e) onGuardada?.(e); }}
            />
          </div>
        ) : (
        <div className="grid gap-4 py-2 max-h-[70vh] overflow-auto">
          <Label>Enlace</Label>
          <Input value={form.enlace ?? ""} onChange={e=>setForm(f=>({...f,enlace:e.target.value}))} />
          {motivo && <p className="text-xs text-muted-foreground">{motivo}</p>}
          {err.enlace && <p className="text-xs text-red-600">{err.enlace[0]}</p>}
          <Label>Título</Label>
          <Input value={form.titulo ?? ""} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} />
          {err.titulo && <p className="text-xs text-red-600">{err.titulo[0]}</p>}
          <Label>Descripción</Label>
          <Textarea value={form.descripcion ?? ""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))} />
          <Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={v=>{setForm(f=>({...f,tipo:v as any})); setTipoTocada(true);}}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS_ESTACION.map(t=><SelectItem key={t} value={t}>{ETIQUETA_TIPO[t]}</SelectItem>)}</SelectContent>
          </Select>
          <Label>Licencia obligatoria</Label>
          <RadioGroup value={form.licencia} onValueChange={v=>setForm(f=>({...f,licencia:v as any}))}>
            {LICENCIAS_LIBRES.map(l=><div key={l} className="flex items-center gap-2"><RadioGroupItem value={l} id={l}/><Label htmlFor={l} className="cursor-pointer">{ETIQUETA_LICENCIA[l]}</Label></div>)}
          </RadioGroup>
          {err.licencia && <p className="text-xs text-red-600">{err.licencia[0]}</p>}
          <Label>Categorías (separadas por comas)</Label>
          <Input value={cats} onChange={e=>setCats(e.target.value)} />
          <Label>Idioma</Label>
          <Input value={form.idioma ?? "es"} onChange={e=>setForm(f=>({...f,idioma:e.target.value}))} />
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Inicio</Label><Input type="datetime-local" value={form.empieza_en?.slice(0,16)??""} onChange={e=>setForm(f=>({...f,empieza_en:e.target.value?e.target.value+":00":null}))}/></div>
            <div><Label>Fin</Label><Input type="datetime-local" value={form.termina_en?.slice(0,16)??""} onChange={e=>setForm(f=>({...f,termina_en:e.target.value?e.target.value+":00":null}))}/></div>
          </div>
          <Label>Ámbito</Label>
          <Select value={opcionesAmbito.find(a=>a.tipo===form.ambito_tipo && a.ref===form.entidad_ref)?.nombre ?? ""} onValueChange={v=>{const o=opcionesAmbito.find(a=>a.nombre===v); if(o) setForm((f: BorradorEstacion)=>({...f,ambito_tipo:o.tipo as "persona"|"entidad",entidad_ref:o.ref}));}}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{opcionesAmbito.map(a=><SelectItem key={a.nombre} value={a.nombre}>{a.nombre}</SelectItem>)}</SelectContent>
          </Select>
          {form.ambito_tipo==="entidad" && (
            <RadioGroup value={form.visibilidad} onValueChange={v=>setForm(f=>({...f,visibilidad:v as any}))}>
              <div className="flex items-center gap-4"><RadioGroupItem value="publica" id="pub"/><Label htmlFor="pub" className="cursor-pointer">Pública</Label></div>
              <div className="flex items-center gap-4"><RadioGroupItem value="grupo" id="grp"/><Label htmlFor="grp" className="cursor-pointer">Del grupo</Label></div>
            </RadioGroup>
          )}
          <div className="flex items-center gap-2"><input type="checkbox" checked={!!form.en_malla} onChange={e=>setForm(f=>({...f,en_malla:e.target.checked}))} className="cursor-pointer"/><Label className="cursor-pointer">Anunciar también por la malla</Label></div>
          {err.general && <p className="text-xs text-red-600">{err.general[0]}</p>}
        </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onCerrar}>{modo === "enlace" ? "Cancelar" : "Cerrar"}</Button>{modo === "enlace" && <Button onClick={guardar}>Guardar</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
