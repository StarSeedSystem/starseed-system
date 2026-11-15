"use client";

/**
 * AparatoEnNeurona — Ajustes › Neuronas › «Este aparato y su neurona» (NEU1115G · 2026-11-15).
 * Contrato: architecture/neuronas-y-aparatos.md.
 *
 * Para ESTE aparato: renombrarlo (el nombre del aparato es aparte del de la neurona), desvincularlo de su
 * neurona, vincularlo a otra neurona de la cuenta (lista con el nombre y los aparatos que ya la usan) o
 * crear una neurona nueva para él. Para los demás aparatos de la cuenta: en qué neurona está cada uno.
 * Nada de aquí borra nada local: claves, historial y ajustes se quedan, y la clave del aparato para el
 * control entre neuronas no se toca.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Link2Off, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NEURON_EVENT,
  cambiarNeuronaDeEsteAparato,
  listNeurons,
  nombreEsteAparato,
  renombrarEsteAparato,
  resolverAliasEsteMedio,
  thisDeviceId,
} from "@/lib/neurons/neurons";
import { neuronasParaElegir, type NeuronaParaElegir } from "@/lib/neurons/aparatos-de-neurona";

type Paso = "" | "elegir" | "nueva";

export function AparatoEnNeurona() {
  const [lista, setLista] = useState<NeuronaParaElegir[]>([]);
  const [nombre, setNombre] = useState("");
  const [paso, setPaso] = useState<Paso>("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    try {
      const filas = await listNeurons({ fresco: true });
      const yo = resolverAliasEsteMedio() || thisDeviceId();
      setLista(neuronasParaElegir(filas, yo));
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    setNombre(nombreEsteAparato());
    void cargar();
    const alCambiar = () => void cargar();
    window.addEventListener(NEURON_EVENT, alCambiar);
    return () => window.removeEventListener(NEURON_EVENT, alCambiar);
  }, [cargar]);

  const actual = lista.find((n) => n.esActual) ?? null;
  const otras = lista.filter((n) => !n.esActual);
  const soloUno = !!actual && actual.aparatos.length <= 1;

  async function mover(destino: string | null, nombreNuevaNeurona?: string) {
    setOcupado(true);
    setMensaje("");
    const r = await cambiarNeuronaDeEsteAparato(destino, nombreNuevaNeurona);
    setOcupado(false);
    setPaso("");
    setElegida(null);
    setMensaje(r.ok ? (destino ? "Este aparato ya usa esa neurona." : "Este aparato tiene ahora su propia neurona.") : "No se pudo cambiar la neurona de este aparato. No se tocó nada.");
    void cargar();
  }

  return (
    <Card className="bg-background/40 backdrop-blur-sm border-[#39FF14]/20" aria-labelledby="titulo-aparato-neurona">
      <CardHeader className="pb-3">
        <CardTitle id="titulo-aparato-neurona" className="text-base">Este aparato y su neurona</CardTitle>
        <CardDescription>
          Una neurona puede tener varios aparatos, pero lo recomendado es uno por neurona. Aquí eliges en qué neurona va este aparato.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void renombrarEsteAparato(nombre).then(() => cargar());
          }}
        >
          <label htmlFor="nombre-aparato" className="text-xs text-muted-foreground">Nombre de este aparato</label>
          <Input id="nombre-aparato" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Móvil de Alex" className="h-8 max-w-xs" />
          <Button type="submit" size="sm" variant="outline" className="cursor-pointer">Guardar nombre</Button>
        </form>

        <p className="text-sm">
          Neurona de este aparato: <strong>{actual?.nombre ?? "…"}</strong>
          {actual && actual.aparatos.length > 1 && (
            <Badge variant="outline" className="ml-2">{actual.aparatos.length} aparatos: lo normal es uno</Badge>
          )}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer gap-1.5"
            disabled={ocupado || soloUno || !actual}
            title={soloUno ? "Este aparato ya es el único de su neurona." : undefined}
            onClick={() => void mover(null)}
          >
            <Link2Off className="h-4 w-4" aria-hidden /> Desvincular este aparato de esta neurona
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" disabled={ocupado || !otras.length} onClick={() => setPaso(paso === "elegir" ? "" : "elegir")}>
            <Link2 className="h-4 w-4" aria-hidden /> Vincularlo a otra neurona de mi cuenta
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" disabled={ocupado} onClick={() => setPaso(paso === "nueva" ? "" : "nueva")}>
            <Plus className="h-4 w-4" aria-hidden /> Crear una neurona nueva para este aparato
          </Button>
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-label="Cambiando…" />}
        </div>
        {soloUno && <p className="text-[11px] text-muted-foreground">Desvincular solo tiene sentido si la neurona tiene más de un aparato: este es el único.</p>}

        {paso === "elegir" && (
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
                    <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => void mover(n.id)}>
                      Vincular este aparato a «{n.nombre}»
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {paso === "nueva" && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void mover(null, nombreNueva);
            }}
          >
            <Input value={nombreNueva} maxLength={60} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Nombre de la neurona nueva" aria-label="Nombre de la neurona nueva" className="h-8 max-w-xs" />
            <Button type="submit" size="sm" className="cursor-pointer" disabled={ocupado}>Crear y usar en este aparato</Button>
          </form>
        )}

        {mensaje && <p role="status" className="text-xs text-muted-foreground">{mensaje}</p>}

        {otras.length > 0 && (
          <div>
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
      </CardContent>
    </Card>
  );
}
