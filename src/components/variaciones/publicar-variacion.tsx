"use client";

// PublicarVariacion — «Publicar mi variación» desde el programa del elemento
// (Ola 1019V · tarea Q · contrato: architecture/variaciones-publicas.md §4).
// Captura el estado con el adaptador de la familia (`capturar`), pide título,
// etiquetas, tema y licencia, VALIDA y ofrece: publicar en la Librería
// (`publicarVariacion`, y también como nota con `references.elemento`),
// guardar en la Biblioteca (cadena SaveSharePanel: `saveItem` → `PublishDialog`)
// o compartir (`ShareToDialog`). Lógica pura: `src/lib/variaciones/publicar-campos.ts`.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, Save, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adaptadorDe } from "@/lib/variaciones/familias";
import { crearDatosVariaciones, type ClienteVariaciones } from "@/lib/variaciones/datos";
import { CAMPOS_VACIOS, LICENCIAS_VARIACION, construirNueva, motivosDePublicacion, filaNotaVariacion, recursoDeVariacion, type CamposVariacion } from "@/lib/variaciones/publicar-campos";
import { saveItem, useMyLibraryDestinations, readLibrarySnapshot, type SavedItem } from "@/lib/library/entity-library";
import { PublishDialog } from "@/components/library/finder/publish-dialog";
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import { createClient } from "@/utils/supabase/client";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";

export interface PublicarVariacionProps {
  /** Clave canónica del elemento (`widget:clima`); nombra el TIPO, nunca la instancia. */
  clave: string;
  /** Id de la variación de la que deriva (cadena de origen, si vino de «Ver origen»). */
  deVariacion?: string;
}

export function PublicarVariacion({ clave, deVariacion }: PublicarVariacionProps) {
  const adaptador = useMemo(() => adaptadorDe(clave), [clave]);
  const [campos, setCampos] = useState<CamposVariacion>({ ...CAMPOS_VACIOS, deVariacion: deVariacion ?? "" });
  const [payload, setPayload] = useState<unknown>(null);
  const [capturo, setCapturo] = useState(false);
  const [publicado, setPublicado] = useState<string | null>(null);
  const [itemPublicable, setItemPublicable] = useState<SavedItem | null>(null);
  const [publicarAbierto, setPublicarAbierto] = useState(false);
  const [compartir, setCompartir] = useState(false);

  // Captura del programa propio: una sola vez por clave, sin sondas en bucle.
  useEffect(() => {
    setCapturo(false);
    try {
      setPayload(adaptador?.capturar(clave) ?? null);
    } catch {
      setPayload(null);
    }
    setCapturo(true);
  }, [adaptador, clave]);

  // El tipo real de Supabase es demasiado profundo para TS (TS2589): se elide una única vez.
  const datos = useMemo(() => crearDatosVariaciones(createClient() as unknown as ClienteVariaciones), []);
  const motivos = useMemo(() => motivosDePublicacion(clave, campos, payload), [clave, campos, payload]);
  const { destinations } = useMyLibraryDestinations();
  const destino = destinations[0]?.ref ?? null;
  const nombre = campos.titulo.trim() || `Mi variación de ${clave}`;
  const descripcion = campos.descripcion.trim() || undefined;
  const recurso: ShareResourceRef = recursoDeVariacion({ clave, titulo: nombre, descripcion, id: publicado ?? undefined });
  const partes: string[] = [];
  if (!capturo) partes.push("Capturando el estado del elemento…");
  else if (payload === null) partes.push("Este elemento no expone su estado por su adaptador; describe la variación a mano.");

  // Publicar en la Librería (y, si se quiere, nota pública con `references.elemento`).
  async function publicar() {
    const r = await datos.publicarVariacion(construirNueva(clave, campos, payload));
    if (!r.ok) {
      for (const m of r.motivos) toast.error(m);
      if (!r.disponible) toast.info("Las variaciones públicas aún no están en este proyecto.");
      return;
    }
    setPublicado(r.valor.variacion.id);
    toast.success(`Variación publicada (${campos.licencia}).`);
    if (!campos.tambienPublicacion) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.info("Inicia sesión para que la nota pública lleve tu nombre.");
        return;
      }
      await supabase.from("posts").insert(filaNotaVariacion({ clave, titulo: campos.titulo.trim(), descripcion, autorId: user.id, autorNombre: user.email?.split("@")[0] ?? "anónimo", variacionId: r.valor.variacion.id }));
      toast.success("También publicada como nota que referencia el elemento.");
    } catch {
      toast.info("La nota pública no se pudo crear; la variación sigue publicada.");
    }
  }

  // Guardar en la Biblioteca: la MISMA cadena de SaveSharePanel (`saveItem` → `PublishDialog`).
  async function guardar() {
    if (!destino) {
      toast.error("Inicia sesión para guardar en tu Biblioteca.");
      return;
    }
    const content = JSON.stringify({ kind: "starseed-variacion", v: 1, clave, payload, licencia: campos.licencia });
    const tags = ["starseed-variacion", clave.split(":")[0]];
    const r = await saveItem(destino, { type: "file", title: nombre, mime: "application/json", content, tags }, null);
    if (!r.ok) {
      toast.error("No se pudo guardar en la Biblioteca.");
      return;
    }
    setItemPublicable({ id: r.id, type: "file", title: nombre, tags, folderId: null, addedAt: new Date().toISOString(), addedBy: "", mime: "application/json", content });
    setPublicarAbierto(true);
  }

  return (
    <div className="flex flex-col gap-3" data-ss-publicar-variacion={clave}>
      <p className="font-mono text-xs text-muted-foreground">{clave}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="pv-titulo">Título</Label><Input id="pv-titulo" className="cursor-text" value={campos.titulo} maxLength={200} onChange={(e) => setCampos((c) => ({ ...c,titulo: e.target.value }))} placeholder="Cómo se llamará la variación" /></div>
        <div className="space-y-1"><Label htmlFor="pv-tema">Tema</Label><Input id="pv-tema" className="cursor-text" value={campos.tema} onChange={(e) => setCampos((c) => ({ ...c,tema: e.target.value }))} placeholder="P. ej. «Solarpunk Aurora»" /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="pv-etiquetas">Etiquetas</Label><Input id="pv-etiquetas" className="cursor-text" value={campos.etiquetasTexto} onChange={(e) => setCampos((c) => ({ ...c,etiquetasTexto: e.target.value }))} placeholder="Separadas por comas: cristal, widget, clima" /></div>
        <div className="space-y-1">
          <Label htmlFor="pv-licencia">Licencia</Label>
          <Select value={campos.licencia} onValueChange={(l) => setCampos((c) => ({ ...c,licencia: l }))}>
            <SelectTrigger id="pv-licencia" className="cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>{LICENCIAS_VARIACION.map((l) => (<SelectItem key={l} value={l} className="cursor-pointer">{l}</SelectItem>))}</SelectContent>
          </Select>
        </div>
        <Label className="flex cursor-pointer items-center gap-2 self-end text-xs">
          <Checkbox checked={campos.tambienPublicacion} className="cursor-pointer" onCheckedChange={(v) => setCampos((c) => ({ ...c,tambienPublicacion: v === true }))} />
          También como publicación (nota que referencia el elemento)
        </Label>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="pv-descripcion">Descripción</Label><Textarea id="pv-descripcion" className="min-h-16 cursor-text" value={campos.descripcion} onChange={(e) => setCampos((c) => ({ ...c,descripcion: e.target.value }))} placeholder="Qué cambia y cuándo conviene usarla" /></div>
      </div>
      {motivos.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 text-xs text-destructive">
          {motivos.slice(0, 4).map((m) => (<li key={m}>{m}</li>))}
        </ul>
      )}
      {partes.map((p) => (<p key={p} className="text-xs text-muted-foreground">{p}</p>))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="cursor-pointer gap-1.5 text-xs" disabled={motivos.length > 0 || !capturo || payload === null} onClick={() => void publicar()}>
          <Send className="h-3.5 w-3.5" /> Publicar en la Librería
        </Button>
        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 text-xs" onClick={() => void guardar()}>
          <Save className="h-3.5 w-3.5" /> Guardar en la Biblioteca
        </Button>
        <Button size="sm" variant="ghost" className="cursor-pointer gap-1.5 text-xs" onClick={() => setCompartir(true)}>
          <Share2 className="h-3.5 w-3.5" /> Compartir
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        La captura llega del propio programa del elemento; una variación nunca lleva datos privados ni secretos.
      </p>
      <ShareToDialog open={compartir} onOpenChange={setCompartir} resource={recurso} />
      {destino && itemPublicable && (
        <PublishDialog mode="item" item={itemPublicable} open={publicarAbierto} onOpenChange={setPublicarAbierto} entityRef={destino} doc={readLibrarySnapshot(destino)} />
      )}
    </div>
  );
}

export default PublicarVariacion;
