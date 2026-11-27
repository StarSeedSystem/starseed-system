"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Link2, Link2Off, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Neuron } from "@/lib/neurons/neurons";
import {
  NEURON_EVENT,
  cambiarNeuronaDeEsteAparato,
  listNeurons,
  nombreEsteAparato,
  renombrarEsteAparato,
  resolverAliasEsteMedio,
  thisDeviceId,
} from "@/lib/neurons/neurons";
import { aparatosDe, neuronasParaElegir, type NeuronaParaElegir } from "@/lib/neurons/aparatos-de-neurona";
import { aparatoDeEsteMedio } from "@/lib/neurons/aparato-este-medio";

const CLAVE_HUELLA_REVISION = "starseed.neuron.huella-revision.v1";

function textoUltimaVez(visto: number | undefined, ahora = Date.now()): string {
  if (typeof visto !== "number" || !Number.isFinite(visto) || visto <= 0 || visto > ahora) return "";
  const min = Math.floor((ahora - visto) / 60_000);
  if (min < 60) return `vista hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vista hace ${h} h`;
  const d = Math.floor(h / 24);
  return `vista hace ${d} d`;
}

export interface SeccionAparatosProps {
  neurona: Neuron;
  alCambiar?: () => void;
}

export function SeccionAparatos({ neurona, alCambiar }: SeccionAparatosProps) {
  const [lista, setLista] = useState<NeuronaParaElegir[]>([]);
  const [nombre, setNombre] = useState("");
  const [paso, setPaso] = useState<"" | "elegir" | "nueva">("");
  const [nombreNueva, setNombreNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [hayNuevo, setHayNuevo] = useState(false);
  const [nombreNuevaNeurona, setNombreNuevaNeurona] = useState("");

  const cargar = useCallback(async () => {
    try {
      const filas = await listNeurons({ fresco: true });
      const yo = resolverAliasEsteMedio() || thisDeviceId();
      setLista(neuronasParaElegir(filas, yo));
    } catch { setLista([]); }
  }, []);

  useEffect(() => {
    setNombre(nombreEsteAparato());
    void cargar();
    try {
      const r = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
      if (r) {
        const p = JSON.parse(r);
        if (p?.v === 1) {
          setHayNuevo(true);
          setNombreNuevaNeurona((nombreEsteAparato() || "Neurona nueva").trim());
        }
      }
    } catch { /* noop */ }
    const al = () => void cargar();
    window.addEventListener(NEURON_EVENT, al);
    return () => window.removeEventListener(NEURON_EVENT, al);
  }, [cargar]);

  const actual = lista.find((n) => n.esActual) ?? null;
  const otras = lista.filter((n) => !n.esActual);
  const aparatos = aparatosDe(neurona.capabilities);
  const soloUno = aparatos.length <= 1;
  const esEsta = neurona.isThisDevice;

  async function mover(destino: string | null, nombrePropuesto?: string) {
    setOcupado(true);
    setMensaje("");
    const r = await cambiarNeuronaDeEsteAparato(destino, nombrePropuesto);
    setOcupado(false);
    setPaso("");
    setMensaje(r.ok ? (destino ? "Este aparato ya usa esa neurona." : "Este aparato tiene ahora su propia neurona.") : "No se pudo cambiar. No se tocó nada.");
    void cargar();
    alCambiar?.();
  }

  return (
    <div className="space-y-4">
      {hayNuevo && esEsta && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" />Este aparato es nuevo</p>
          <p className="text-xs text-white/55">Lo recomendado es una neurona por aparato.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => void mover(null, nombreNuevaNeurona)}>
              <Plus className="h-4 w-4 mr-1" />Crear neurona nueva
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer" disabled={ocupado || !otras.length} onClick={() => setPaso(paso === "elegir" ? "" : "elegir")}>
              <Link2 className="h-4 w-4 mr-1" />Unir a existente
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-white/70">Aparatos en esta neurona</p>
        <ul className="space-y-1.5">
          {aparatos.length ? aparatos.map((a) => (
            <li key={a.id} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white/90 break-words">{a.nombre}</span>
                {a.medio && <Badge variant="outline" className="text-[10px]">{a.medio}</Badge>}
                {a.so && <span className="text-xs text-white/50">{a.so}</span>}
                {textoUltimaVez(a.visto) && <span className="text-xs text-white/40">{textoUltimaVez(a.visto)}</span>}
              </div>
            </li>
          )) : <li className="text-xs text-white/45">Sin aparatos conocidos.</li>}
        </ul>
      </div>

      {esEsta && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60}
              placeholder="Nombre de este aparato" aria-label="Nombre de este aparato" className="h-8 max-w-xs bg-black/20 border-white/10" />
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => void renombrarEsteAparato(nombre).then(() => { void cargar(); alCambiar?.(); })}>Guardar nombre</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="cursor-pointer" disabled={ocupado || soloUno}
              title={soloUno ? "Este aparato ya es el único de su neurona." : undefined}
              onClick={() => void mover(null)}>
              <Link2Off className="h-4 w-4 mr-1" />Separar en neurona propia
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer" disabled={ocupado || !otras.length} onClick={() => setPaso(paso === "elegir" ? "" : "elegir")}>
              <Link2 className="h-4 w-4 mr-1" />Unir a otra neurona
            </Button>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {paso === "elegir" && (
            <ul className="space-y-1.5">
              {otras.map((n) => (
                <li key={n.id} className="rounded-md border border-white/10 p-2 text-sm flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-medium">{n.nombre}</span><p className="text-xs text-white/45">{n.aparatos.length ? n.aparatos.map((a) => a.nombre).join(", ") : "Sin aparatos"}</p></div>
                  <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => void mover(n.id)}>Unir aquí</Button>
                </li>
              ))}
            </ul>
          )}
          {mensaje && <p role="status" className="text-xs text-white/55">{mensaje}</p>}
        </div>
      )}
    </div>
  );
}
