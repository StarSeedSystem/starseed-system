"use client";

import { useState } from "react";
import { Link2, Link2Off, Plus, AlertCircle, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  nombreEsteAparato,
  renombrarEsteAparato,
  resolverAliasEsteMedio,
  thisDeviceId,
  cambiarNeuronaDeEsteAparato,
  listNeurons,
  NEURON_EVENT,
  type Neuron,
} from "@/lib/neurons/neurons";
import { neuronasParaElegir, type NeuronaParaElegir } from "@/lib/neurons/aparatos-de-neurona";
import { aparatoDeEsteMedio } from "@/lib/neurons/aparato-este-medio";
import { textoUltimaVez } from "@/lib/neurons/aparatos-de-neurona";

const CLAVE_HUELLA_REVISION = "starseed.neuron.huella-revision.v1";

type Paso = "" | "elegir" | "nueva";
type CaminoNuevo = "" | "unir" | "nueva";

const NOMBRE_SO: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

function tipoAparato(so: unknown): boolean {
  return typeof so === "string" && so.trim().length > 0;
}

function nombrePropuesto(nombreAparato: string | null | undefined): string {
  const t = (nombreAparato ?? "").replace(/\s+/g, " ").trim();
  return t || "Neurona nueva";
}

interface AparatoInfo {
  id: string;
  nombre: string;
  medio?: string;
  so?: string;
  equipo?: string;
  visto: number;
  esActual: boolean;
}

export interface SeccionAparatosProps {
  neurona: Neuron;
  esEsta: boolean;
  onCambio?: () => void;
}

export function SeccionAparatos({ neurona, esEsta, onCambio }: SeccionAparatosProps) {
  const [lista, setLista] = useState<NeuronaParaElegir[]>([]);
  const [nombre, setNombre] = useState("");
  const [paso, setPaso] = useState<Paso>("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const [hayAparatoNuevo, setHayAparatoNuevo] = useState(false);
  const [modelo, setModelo] = useState<string | null>(null);
  const [sistema, setSistema] = useState<string | null>(null);
  const [caminoNuevo, setCaminoNuevo] = useState<CaminoNuevo>("");
  const [elegidaNueva, setElegidaNueva] = useState<string | null>(null);
  const [nombreNuevaNeurona, setNombreNuevaNeurona] = useState("");

  const cargar = async () => {
    try {
      const filas = await listNeurons({ fresco: true });
      const yo = resolverAliasEsteMedio() || thisDeviceId();
      setLista(neuronasParaElegir(filas, yo));
    } catch {
      setLista([]);
    }
  };

  const obtenerAparatos = (): AparatoInfo[] => {
    const caps = neurona.capabilities;
    const aparatosMap = caps.aparatos as Record<string, { n?: string; medio?: string; so?: string; equipo?: string; ts: number }> | undefined;
    if (!aparatosMap) return [];
    return Object.entries(aparatosMap)
      .filter(([, e]) => typeof e.ts === "number" && e.ts > 0 && !(typeof e.fuera === "number" && e.fuera >= e.ts))
      .map(([id, e]) => ({
        id,
        nombre: e.n || e.equipo || [e.medio, e.so].filter(Boolean).join(" · ") || "Aparato",
        medio: e.medio,
        so: e.so,
        equipo: e.equipo,
        visto: e.ts,
        esActual: id === (resolverAliasEsteMedio() || thisDeviceId()),
      }))
      .sort((a, b) => b.visto - a.visto);
  };

  const actual = lista.find((n) => n.esActual) ?? null;
  const otras = lista.filter((n) => !n.esActual);
  const soloUno = !!actual && actual.aparatos.length <= 1;

  const mover = async (destino: string | null, nombreNuevaNeuronaParam?: string) => {
    setOcupado(true);
    setMensaje("");
    try {
      const r = await cambiarNeuronaDeEsteAparato(destino, nombreNuevaNeuronaParam);
      setMensaje(r.ok ? (destino ? "Este aparato ya usa esa neurona." : "Este aparato tiene ahora su propia neurona.") : "No se pudo cambiar la neurona de este aparato. No se tocó nada.");
      if (r.ok) {
        setPaso("");
        setElegida(null);
        setCaminoNuevo("");
        setElegidaNueva(null);
        await cargar();
        onCambio?.();
      }
    } finally {
      setOcupado(false);
    }
  };

  const posponerAparatoNuevo = () => {
    setCaminoNuevo("");
    setElegidaNueva(null);
    setMensaje("Aviso pospuesto: sigue visible y puedes volver a él cuando quieras.");
  };

  const renombrarAparato = async (idAparato: string, nombreActual: string, onClose: () => void) => {
    const nuevo = prompt("Nuevo nombre para este aparato:", nombreActual);
    if (nuevo && nuevo.trim() && nuevo.trim() !== nombreActual) {
      setOcupado(true);
      try {
        await renombrarEsteAparato(nuevo.trim());
        onClose();
        await cargar();
        onCambio?.();
      } finally {
        setOcupado(false);
      }
    }
  };

  return (
    <div className="space-y-3" data-seccion="aparatos">
      {hayAparatoNuevo && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4" aria-labelledby="titulo-aparato-nuevo">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <h4 id="titulo-aparato-nuevo" className="text-sm font-medium">Este aparato es nuevo</h4>
              <p className="text-xs text-muted-foreground mt-1">
                {modelo || sistema
                  ? `Detectamos: ${[modelo, sistema].filter(Boolean).join(" · ")}. Lo recomendado es una neurona por aparato.`
                  : "Lo recomendado es una neurona por aparato. Elige qué hacer con este aparato."}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              size="sm"
              className="cursor-pointer gap-1.5 w-full sm:w-auto"
              disabled={ocupado}
              onClick={() => setCaminoNuevo(caminoNuevo === "nueva" ? "" : "nueva")}
            >
              <Plus className="h-4 w-4" aria-hidden /> Crear una neurona nueva para este aparato
              <Badge className="ml-1" variant="secondary">Recomendado</Badge>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer gap-1.5 w-full sm:w-auto"
              disabled={ocupado || !otras.length}
              onClick={() => setCaminoNuevo(caminoNuevo === "unir" ? "" : "unir")}
            >
              <Link2 className="h-4 w-4" aria-hidden /> Unirlo a una neurona existente
            </Button>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin self-center" aria-label="Cambiando…" />}
          </div>

          {caminoNuevo === "nueva" && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                mover(null, nombreNuevaNeurona);
              }}
            >
              <Input
                value={nombreNuevaNeurona}
                maxLength={60}
                onChange={(e) => setNombreNuevaNeurona(e.target.value)}
                placeholder="Nombre de la neurona nueva (editable)"
                aria-label="Nombre de la neurona nueva"
                className="h-8 max-w-xs"
              />
              <Button type="submit" size="sm" className="cursor-pointer" disabled={ocupado || !nombreNuevaNeurona.trim()}>
                Crear y usar en este aparato
              </Button>
            </form>
          )}

          {caminoNuevo === "unir" && (
            <ul className="space-y-2" aria-label="Neuronas de mi cuenta">
              {otras.map((n) => (
                <li key={n.id} className="rounded-md border border-border/40 p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{n.nombre}</strong>
                      <p className="text-xs text-muted-foreground">
                        {n.aparatos.length
                          ? `Aparatos que ya la usan: ${n.aparatos.map((a) => a.nombre).join(", ")}${n.aparatos[0]?.visto ? ` · ${textoUltimaVez(n.aparatos[0].visto)}` : ""}`
                          : "Ningún aparato la usa ahora."}
                      </p>
                    </div>
                    <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => setElegidaNueva(elegidaNueva === n.id ? null : n.id)}>
                      Elegir esta neurona
                    </Button>
                  </div>
                  {elegidaNueva === n.id && (
                    <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                      {n.variosAparatos || n.aparatos.length === 1 ? (
                        <p className="text-xs text-amber-500">
                          Esa neurona ya la usa {n.aparatos.length === 1 ? "otro aparato" : `${n.aparatos.length} aparatos`}. Lo recomendado es un aparato por neurona: los dos responderán como una sola.
                        </p>
                      ) : null}
                      <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => mover(n.id)}>
                        Vincular este aparato a «{n.nombre}»
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="cursor-pointer text-muted-foreground"
            disabled={ocupado}
            onClick={posponerAparatoNuevo}
          >
            Posponer
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-white/60">Aparatos de esta neurona</h4>
        <ul className="space-y-2" role="list">
          {obtenerAparatos().map((a) => (
            <li key={a.id} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm text-white/90 truncate">{a.nombre}</strong>
                    {a.esActual && (
                      <Badge variant="outline" className="text-[9px] border-emerald-400/30 text-emerald-300 bg-emerald-500/10">Este aparato</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-white/50">
                    {a.so && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">{NOMBRE_SO[a.so] ?? a.so}</span>}
                    {a.medio && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">{a.medio}</span>}
                    {a.equipo && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono">{a.equipo}</span>}
                    <span className="ml-auto">{textoUltimaVez(a.visto)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer h-7 px-2 text-white/50 hover:text-white"
                    onClick={() => renombrarAparato(a.id, a.nombre, () => {})}
                    aria-label={`Renombrar ${a.nombre}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </Button>
                  {esEsta && a.id === (resolverAliasEsteMedio() || thisDeviceId()) && lista.some((n) => n.esActual && n.aparatos.length > 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer h-7 px-2 text-emerald-300/80 hover:text-emerald-200"
                      onClick={() => mover(null)}
                      aria-label="Separar en neurona propia"
                    >
                      <Link2Off className="w-3.5 h-3.5" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {esEsta && (
          <div className="pt-2 border-t border-white/10 space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer gap-1.5 w-full"
              disabled={ocupado || soloUno || !actual}
              title={soloUno ? "Este aparato ya es el único de su neurona." : undefined}
              onClick={() => mover(null)}
            >
              <Link2Off className="h-4 w-4" aria-hidden /> Separar en neurona propia
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer gap-1.5 w-full"
              disabled={ocupado || !otras.length}
              onClick={() => setPaso(paso === "elegir" ? "" : "elegir")}
            >
              <Link2 className="h-4 w-4" aria-hidden /> Unir a otra neurona
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer gap-1.5 w-full"
              disabled={ocupado}
              onClick={() => setPaso(paso === "nueva" ? "" : "nueva")}
            >
              <Plus className="h-4 w-4" aria-hidden /> Crear una neurona nueva para este aparato
            </Button>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin mx-auto" aria-label="Cambiando…" />}
          </div>
        )}

        {soloUno && <p className="text-[11px] text-muted-foreground">Separar solo tiene sentido si la neurona tiene más de un aparato: este es el único.</p>}

        {paso === "elegir" && (
          <div className="space-y-2 border-t border-white/10 pt-2">
            <ul className="space-y-2" aria-label="Neuronas de mi cuenta">
              {otras.map((n) => (
                <li key={n.id} className="rounded-md border border-border/40 p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{n.nombre}</strong>
                      <p className="text-xs text-muted-foreground">
                        {n.aparatos.length ? `Aparatos que ya la usan: ${n.aparatos.map((a) => a.nombre).join(", ")}` : "Ningún aparato la usa ahora."}
                      </p>
                    </div>
                    <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => setElegida(elegida === n.id ? null : n.id)}>
                      Elegir esta neurona
                    </Button>
                  </div>
                  {elegida === n.id && (
                    <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                      {n.variosAparatos || n.aparatos.length === 1 ? (
                        <p className="text-xs text-amber-500">
                          Esa neurona ya la usa {n.aparatos.length === 1 ? "otro aparato" : `${n.aparatos.length} aparatos`}. Lo recomendado es un aparato por neurona: los dos responderán como una sola.
                        </p>
                      ) : null}
                      <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => mover(n.id)}>
                        Vincular este aparato a «{n.nombre}»
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {paso === "nueva" && (
          <form
            className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              mover(null, nombreNueva);
            }}
          >
            <Input value={nombreNueva} maxLength={60} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Nombre de la neurona nueva" aria-label="Nombre de la neurona nueva" className="h-8 max-w-xs" />
            <Button type="submit" size="sm" className="cursor-pointer" disabled={ocupado}>Crear y usar en este aparato</Button>
          </form>
        )}

        {mensaje && <p role="status" className="text-xs text-muted-foreground">{mensaje}</p>}

        {otras.length > 0 && (
          <div className="pt-2 border-t border-white/10">
            <p className="mb-1 text-xs text-muted-foreground">Los demás aparatos de mi cuenta, por neurona</p>
            <ul className="space-y-1 text-sm">
              {otras.map((n) => (
                <li key={n.id}>
                  <strong>{n.nombre}</strong>
                  <span className="text-muted-foreground"> — {n.aparatos.length ? n.aparatos.map((a) => a.nombre).join(", ") : "sin aparatos conocidos"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default SeccionAparatos;