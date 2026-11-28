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
 *
 * (NEU1125B-d2) Al detectar «aparato nuevo» (huella distinta) aparece la sección «Este aparato es nuevo»
 * con el modelo y el sistema detectados y dos caminos: «Crear una neurona nueva para este aparato»
 * (recomendado, con nombre propuesto editable) o «Unirlo a una neurona existente» (lista de las de la
 * cuenta, con su aparato y última vez vista). No se cierra sola ni elige por la persona; se puede
 * posponer y queda el aviso.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Link2Off, Loader2, Plus, AlertCircle } from "lucide-react";
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
import { PALETA_COLOR_PUBLICO, colorPorDefecto, normalizarColor } from "@/lib/neurons/color-publico";
import { colorAparatoDe, estadoSyncAparato, idUnicoPorDefecto, neuronasParaElegir, type NeuronaParaElegir } from "@/lib/neurons/aparatos-de-neurona";
import { aparatoDeEsteMedio } from "@/lib/neurons/aparato-este-medio";

const CLAVE_HUELLA_REVISION = "starseed.neuron.huella-revision.v1";
const CLAVE_ID_UNICO_APARATO = "starseed.aparato.id-unico.v1";
const CLAVE_COLOR_APARATO = "starseed.aparato.color.v1";

type Paso = "" | "elegir" | "nueva";
type CaminoNuevo = "" | "unir" | "nueva";

/** Nombres legibles de los sistemas conocidos (solo para texto de UI). */
const NOMBRE_SO: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

/** ¿El valor es un sistema reconocido? Pura. */
function tipoAparato(so: unknown): boolean {
  return typeof so === "string" && so.trim().length > 0;
}

/** «hace X» con la última vez vista de un aparato, sin fechas inventadas. Pura. */
function textoUltimaVez(visto: number | undefined, ahora: number = Date.now()): string {
  if (typeof visto !== "number" || !Number.isFinite(visto) || visto <= 0 || visto > ahora) return "";
  const min = Math.floor((ahora - visto) / 60_000);
  if (min === 0) return "vista hace 0 min";
  if (min < 60) return `vista hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vista hace ${h} h`;
  const d = Math.floor(h / 24);
  return `vista hace ${d} d`;
}

/** Propuesta de nombre para la neurona nueva: el nombre del aparato si se conoce. Pura. */
function nombrePropuesto(nombreAparato: string | null | undefined): string {
  const t = (nombreAparato ?? "").replace(/\s+/g, " ").trim();
  return t || "Neurona nueva";
}

export function AparatoEnNeurona() {
  const [lista, setLista] = useState<NeuronaParaElegir[]>([]);
  const [nombre, setNombre] = useState("");
  const [idUnico, setIdUnico] = useState("");
  const [colorAparato, setColorAparato] = useState("");
  const [paso, setPaso] = useState<Paso>("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // NEU1125B-d2: estado para la ventana «Este aparato es nuevo»
  const [hayAparatoNuevo, setHayAparatoNuevo] = useState(false);
  const [modelo, setModelo] = useState<string | null>(null);
  const [sistema, setSistema] = useState<string | null>(null);
  const [caminoNuevo, setCaminoNuevo] = useState<CaminoNuevo>("");
  const [elegidaNueva, setElegidaNueva] = useState<string | null>(null);
  const [nombreNuevaNeurona, setNombreNuevaNeurona] = useState("");

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
    let leerIdUnico = "";
    let leerColor = colorPorDefecto(thisDeviceId() || "aparato");
    try {
      leerIdUnico = window.localStorage.getItem(CLAVE_ID_UNICO_APARATO) ?? "";
      leerColor = normalizarColor(window.localStorage.getItem(CLAVE_COLOR_APARATO)) || leerColor;
    } catch {
      // Sin acceso a localStorage
    }
    setIdUnico(leerIdUnico);
    setColorAparato(leerColor);
    void cargar();

    // NEU1125B-d2: detectar si hay un aparato nuevo (huella distinta)
    try {
      const revision = window.localStorage.getItem(CLAVE_HUELLA_REVISION);
      if (revision) {
        const parsed = JSON.parse(revision);
        if (parsed?.v === 1 && typeof parsed.ts === "number") {
          setHayAparatoNuevo(true);
          setNombreNuevaNeurona(nombrePropuesto(nombreEsteAparato()));
          // Obtener modelo y sistema del aparato actual
          void aparatoDeEsteMedio({}).then((a) => {
            setModelo(a?.equipo ?? null);
            if (!a) {
              setSistema(null);
              return;
            }
            setSistema(
              tipoAparato(a.so)
                ? `${a.so ? NOMBRE_SO[a.so as keyof typeof NOMBRE_SO] ?? a.so : ""}${a.soV ? ` ${a.soV}` : ""}`
                : null
            );
          });
        }
      }
    } catch {
      /* sin almacenamiento o JSON inválido */
    }

    const alCambiar = () => void cargar();
    window.addEventListener(NEURON_EVENT, alCambiar);
    return () => window.removeEventListener(NEURON_EVENT, alCambiar);
  }, [cargar]);

  const actual = lista.find((n) => n.esActual) ?? null;
  const otras = lista.filter((n) => !n.esActual);
  const soloUno = !!actual && actual.aparatos.length <= 1;

  async function mover(destino: string | null, nombreNuevaNeuronaParam?: string) {
    setOcupado(true);
    setMensaje("");
    const r = await cambiarNeuronaDeEsteAparato(destino, nombreNuevaNeuronaParam);
    setOcupado(false);
    setPaso("");
    setElegida(null);
    setCaminoNuevo("");
    setElegidaNueva(null);
    setMensaje(r.ok ? (destino ? "Este aparato ya usa esa neurona." : "Este aparato tiene ahora su propia neurona.") : "No se pudo cambiar la neurona de este aparato. No se tocó nada.");
    void cargar();
  }

  function posponerAparatoNuevo() {
    setCaminoNuevo("");
    setElegidaNueva(null);
    setMensaje("Aviso pospuesto: sigue visible y puedes volver a él cuando quieras.");
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
        {/* NEU1125B-d2: Sección «Este aparato es nuevo» */}
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
                  void mover(null, nombreNuevaNeurona);
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
                        <Button size="sm" className="cursor-pointer" disabled={ocupado} onClick={() => void mover(n.id)}>
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

        <form
          className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const idLimpio = idUnico.trim().slice(0, 40);
              if (idLimpio) window.localStorage.setItem(CLAVE_ID_UNICO_APARATO, idLimpio);
              else window.localStorage.removeItem(CLAVE_ID_UNICO_APARATO);
              const colorNorm = normalizarColor(colorAparato);
              if (colorNorm) window.localStorage.setItem(CLAVE_COLOR_APARATO, colorNorm);
            } catch {
              // Sin acceso a localStorage
            }
            void renombrarEsteAparato(nombre).then(() => cargar());
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="size-3 shrink-0 rounded-full ring-1 ring-white/40" style={{ backgroundColor: colorAparato || colorPorDefecto(thisDeviceId() || "aparato") }} aria-hidden />
            <label htmlFor="nombre-aparato" className="text-xs text-muted-foreground">Nombre de este aparato</label>
            <Input id="nombre-aparato" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Móvil de bolsillo" className="h-8 max-w-xs" />
            <label htmlFor="id-unico-aparato-panel" className="text-xs text-muted-foreground">ID único</label>
            <Input id="id-unico-aparato-panel" value={idUnico} maxLength={40} onChange={(e) => setIdUnico(e.target.value)} placeholder="ej. maggapixel-01" className="h-8 max-w-[11rem] font-mono text-xs" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Color diferenciador de este aparato">
              {PALETA_COLOR_PUBLICO.slice(0, 8).map((c) => (
                <button
                  key={c.color}
                  type="button"
                  title={c.nombre}
                  onClick={() => setColorAparato(c.color)}
                  aria-pressed={colorAparato === c.color}
                  className={`h-4 w-4 cursor-pointer rounded-full border ${colorAparato === c.color ? "border-white ring-2 ring-white/50" : "border-white/25"}`}
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
            <Button type="submit" size="sm" variant="outline" className="cursor-pointer">Guardar nombre</Button>
          </div>
        </form>

        <p className="text-sm">
          Neurona de este aparato (apellido): <strong>{actual?.nombre ?? "…"}</strong>
          {actual && actual.aparatos.length > 1 && (
            <Badge variant="outline" className="ml-2">{actual.aparatos.length} aparatos: lo normal es uno</Badge>
          )}
        </p>

        {actual && actual.aparatos.length > 0 && (
          <ul className="space-y-1" aria-label="Aparatos en esta neurona">
            {actual.aparatos.map((a) => {
              const sync = estadoSyncAparato(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorAparatoDe(a) }} aria-hidden />
                  <span className="font-medium text-foreground">{a.nombre}</span>
                  <span className="rounded border border-white/15 px-1 font-mono text-[10px]">@{a.idUnico || idUnicoPorDefecto(a)}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{sync.etiqueta}</Badge>
                </li>
              );
            })}
          </ul>
        )}

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
