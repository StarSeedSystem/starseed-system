"use client";

/**
 * AparatoNuevoDialogo — Ajustes › Neuronas › ventana «Este aparato es nuevo» (NEU1125B · 2026-11-25).
 * Contrato: architecture/neuronas-un-aparato.md y la petición de Maggasukha del 25-11.
 *
 * Al detectar «aparato nuevo» (NEU1125A: la huella nativa no coincide) aparece esta ventana con el
 * modelo y el sistema detectados y dos caminos: «Crear una neurona nueva para este aparato»
 * (RECOMENDADO: una neurona por aparato, con nombre propuesto editable) o «Unirlo a una neurona
 * existente» (lista de las de la cuenta, con su aparato y última vez vista). No se cierra sola ni
 * elige por la persona; se puede posponer y queda el aviso.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NEURON_EVENT,
  cambiarNeuronaDeEsteAparato,
  listNeurons,
  nombreEsteAparato,
  resolverAliasEsteMedio,
  thisDeviceId,
} from "@/lib/neurons/neurons";
import { neuronasParaElegir, type NeuronaParaElegir } from "@/lib/neurons/aparatos-de-neurona";
import { aparatoDeEsteMedio } from "@/lib/neurons/aparato-este-medio";

type Camino = "" | "unir" | "nueva";

/** Nombres legibles de los sistemas conocidos (solo para texto de UI). */
export const NOMBRE_SO: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

/** ¿El valor es un sistema reconocido? Pura. */
export function tipoAparato(so: unknown): boolean {
  return typeof so === "string" && so.trim().length > 0;
}

/** «hace X» con la última vez vista de una neurona, sin fechas inventadas. Pura. */
export function textoUltimaVez(visto: number | undefined, ahora: number = Date.now()): string {
  if (typeof visto !== "number" || !Number.isFinite(visto) || visto <= 0 || visto > ahora) return "";
  const min = Math.floor((ahora - visto) / 60_000);
  if (min < 1) return "vista ahora";
  if (min < 60) return `vista hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vista hace ${h} h`;
  const d = Math.floor(h / 24);
  return `vista hace ${d} d`;
}

/** Propuesta de nombre para la neurona nueva: el nombre del aparato si se conoce. Pura. */
export function nombrePropuesto(nombreAparato: string | null | undefined): string {
  const t = (nombreAparato ?? "").replace(/\s+/g, " ").trim();
  return t || "Neurona nueva";
}

export function AparatoNuevoDialogo() {
  const [lista, setLista] = useState<NeuronaParaElegir[]>([]);
  const [modelo, setModelo] = useState<string | null>(null);
  const [sistema, setSistema] = useState<string | null>(null);
  const [camino, setCamino] = useState<Camino>("");
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
    setNombreNueva(nombrePropuesto(nombreEsteAparato()));
    void cargar();
    void aparatoDeEsteMedio({}).then((a) => {
      setModelo(a?.equipo ?? null);
      setSistema(tipoAparato(a?.so) ? `${a.so ? NOMBRE_SO[a.so as keyof typeof NOMBRE_SO] ?? a.so : ""}${a?.soV ? ` ${a.soV}` : ""}` : null);
    });
    const alCambiar = () => void cargar();
    window.addEventListener(NEURON_EVENT, alCambiar);
    return () => window.removeEventListener(NEURON_EVENT, alCambiar);
  }, [cargar]);

  const otras = lista.filter((n) => !n.esActual);

  async function mover(destino: string | null, nombreNuevaNeurona?: string) {
    setOcupado(true);
    setMensaje("");
    const r = await cambiarNeuronaDeEsteAparato(destino, nombreNuevaNeurona);
    setOcupado(false);
    setCamino("");
    setElegida(null);
    setMensaje(
      r.ok
        ? destino
          ? "Este aparato ya usa esa neurona."
          : "Este aparato tiene ahora su propia neurona."
        : "No se pudo cambiar la neurona de este aparato. No se tocó nada.",
    );
    void cargar();
  }

  return (
    <Card
      className="bg-background/40 backdrop-blur-sm border-[#39FF14]/20"
      aria-labelledby="titulo-aparato-nuevo"
    >
      <CardHeader className="pb-3">
        <CardTitle id="titulo-aparato-nuevo" className="text-base">Este aparato es nuevo</CardTitle>
        <CardDescription>
          {modelo || sistema
            ? `Detectamos: ${[modelo, sistema].filter(Boolean).join(" · ")}. Lo recomendado es una neurona por aparato.`
            : "Lo recomendado es una neurona por aparato. Elige qué hacer con este aparato."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            size="sm"
            className="cursor-pointer gap-1.5 w-full sm:w-auto"
            disabled={ocupado}
            onClick={() => setCamino(camino === "nueva" ? "" : "nueva")}
          >
            <Plus className="h-4 w-4" aria-hidden /> Crear una neurona nueva para este aparato
            <Badge className="ml-1" variant="secondary">Recomendado</Badge>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer gap-1.5 w-full sm:w-auto"
            disabled={ocupado || !otras.length}
            onClick={() => setCamino(camino === "unir" ? "" : "unir")}
          >
            <Link2 className="h-4 w-4" aria-hidden /> Unirlo a una neurona existente
          </Button>
          {ocupado && <Loader2 className="h-4 w-4 animate-spin self-center" aria-label="Cambiando…" />}
        </div>

        {camino === "nueva" && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void mover(null, nombreNueva);
            }}
          >
            <Input
              value={nombreNueva}
              maxLength={60}
              onChange={(e) => setNombreNueva(e.target.value)}
              placeholder="Nombre de la neurona nueva (editable)"
              aria-label="Nombre de la neurona nueva"
              className="h-8 max-w-xs"
            />
            <Button type="submit" size="sm" className="cursor-pointer" disabled={ocupado || !nombreNueva.trim()}>
              Crear y usar en este aparato
            </Button>
          </form>
        )}

        {camino === "unir" && (
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

        {mensaje && <p role="status" className="text-xs text-muted-foreground">{mensaje}</p>}

        <Button
          size="sm"
          variant="ghost"
          className="cursor-pointer text-muted-foreground"
          disabled={ocupado}
          onClick={() => {
            setCamino("");
            setElegida(null);
            setMensaje("Aviso pospuesto: sigue visible y puedes volver a él cuando quieras.");
          }}
        >
          Posponer
        </Button>
      </CardContent>
    </Card>
  );
}