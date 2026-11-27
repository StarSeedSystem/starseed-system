"use client";

import { Link2, Link2Off, Plus, AlertCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useCallback, useEffect } from "react";
import { aparatosDe, fusionarAparatos, entradaViva, lapida, leerMapaAparatos, nombreAparatoPorDefecto, type EntradaAparato, type MapaAparatos } from "@/lib/neurons/aparatos-de-neurona";
import { renombrarEsteAparato, cambiarNeuronaDeEsteAparato, neuronasParaElegir, type NeuronaParaElegir } from "@/lib/neurons/neurons";
import { AparatoEnNeurona } from "@/components/settings/neurons/aparato-en-neurona";

export interface FilaAparato {
  id: string;
  nombre: string;
  medio?: string;
  so?: string;
  equipo?: string;
  visto: number;
  esActual: boolean;
}

export function textoUltimaVez(visto: number | undefined, ahora: number = Date.now()): string {
  if (typeof visto !== "number" || !Number.isFinite(visto) || visto <= 0 || visto > ahora) return "";
  const min = Math.floor((ahora - visto) / 60_000);
  if (min === 0) return "vista hace 0 min";
  if (min < 60) return `vista hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vista hace ${h} h`;
  const d = Math.floor(h / 24);
  return `vista hace ${d} d`;
}

export function aparatoTieneLapida(e: EntradaAparato): boolean {
  return typeof e.fuera === "number" && e.fuera >= e.ts;
}

export function filasAparatos(params: {
  aparatos: MapaAparatos;
  idActual: string;
}): FilaAparato[] {
  const { aparatos, idActual } = params;
  const mapa = leerMapaAparatos({ aparatos });
  return Object.entries(mapa)
    .filter(([, e]) => !aparatoTieneLapida(e))
    .map(([id, e]) => ({
      id,
      nombre: e.n || nombreAparatoPorDefecto(e),
      medio: e.medio,
      so: e.so,
      equipo: e.equipo,
      visto: e.ts,
      esActual: id === idActual,
    }))
    .sort((x, y) => y.visto - x.visto);
}

interface SeccionAparatosProps {
  neurona: {
    id: string;
    name: string;
    capabilities: {
      aparatos?: MapaAparatos;
      aparato?: { medio?: string; so?: string; equipo?: string };
    };
  };
  settings: {
    // sin ajustes específicos por ahora
  };
  idActual: string;
  busqueda: string;
  estaAbierta: boolean;
  onToggle: () => void;
  onRefrescar: () => void;
}

const NOMBRE_SO: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  ipados: "iPadOS",
};

function formatearSo(so?: string): string {
  if (!so) return "";
  return NOMBRE_SO[so.toLowerCase()] ?? so;
}

function nombrePropuesto(nombreAparato: string | null | undefined): string {
  const t = (nombreAparato ?? "").replace(/\s+/g, " ").trim();
  return t || "Neurona nueva";
}

type Paso = "" | "elegir" | "nueva";
type CaminoNuevo = "" | "unir" | "nueva";

export function SeccionAparatos({
  neurona,
  settings,
  idActual,
  busqueda,
  estaAbierta,
  onToggle,
  onRefrescar,
}: SeccionAparatosProps) {
  const [lista, setLista] = useState<NeuronaParaElegir[]>([]);
  const [paso, setPaso] = useState<Paso>("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    try {
      const { listNeurons } = await import("@/lib/neurons/neurons");
      const { resolverAliasEsteMedio, thisDeviceId } = await import("@/lib/neurons/neurons");
      const filas = await listNeurons({ fresco: true });
      const yo = resolverAliasEsteMedio() || thisDeviceId();
      setLista(neuronasParaElegir(filas, yo));
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aparatos = neurona.capabilities.aparatos ?? {};
  const filas = filasAparatos({ aparatos, idActual }).filter((f) => {
    const texto = `${f.nombre} ${f.medio ?? ""} ${f.so ?? ""} ${f.equipo ?? ""}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  const actual = lista.find((n) => n.esActual) ?? null;
  const otras = lista.filter((n) => !n.esActual);
  const soloUno = !!actual && actual.aparatos.length <= 1;

  async function mover(destino: string | null, nombreNuevaNeuronaParam?: string) {
    setOcupado(true);
    setMensaje("");
    try {
      const { cambiarNeuronaDeEsteAparato } = await import("@/lib/neurons/neurons");
      const r = await cambiarNeuronaDeEsteAparato(destino, nombreNuevaNeuronaParam);
      setOcupado(false);
      setPaso("");
      setElegida(null);
      setMensaje(r.ok ? (destino ? "Este aparato ya usa esa neurona." : "Este aparato tiene ahora su propia neurona.") : "No se pudo cambiar la neurona de este aparato. No se tocó nada.");
      await cargar();
      onRefrescar();
    } catch {
      setOcupado(false);
      setMensaje("Error al cambiar de neurona.");
    }
  }

  const coincideBusqueda = (texto: string) =>
    texto.toLowerCase().includes(busqueda.toLowerCase());

  if (!estaAbierta && filas.length === 0 && busqueda) return null;

  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden" open={estaAbierta}>
      <summary
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80"
      >
        <Link2 className="h-4 w-4 text-emerald-300" aria-hidden /> Aparatos
        {filas.length > 1 && <Badge variant="outline" className="text-[9px] ml-1">{filas.length} aparatos</Badge>}
        <span className="ml-auto text-[10px] font-normal text-white/40 group-open:hidden">ver</span>
        <span className="ml-auto text-[10px] font-normal text-white/40" style={{ transform: estaAbierta ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
      </summary>
      {estaAbierta && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
          {busqueda && (
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar en Aparatos…"
                value={busqueda}
                readOnly
                className="w-full pl-8 pr-3 py-2 text-sm bg-black/30 border border-white/10 rounded-lg"
              />
            </div>
          )}

          <AparatoEnNeurona />

          {filas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/50">Aparatos de esta neurona</p>
              <ul className="space-y-2" role="list" aria-label="Aparatos de esta neurona">
                {filas.map((f) => (
                  <li key={f.id} className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-white/90 truncate">{f.nombre}</strong>
                          {f.esActual && (
                            <Badge variant="outline" className="text-[9px] border-emerald-400/30 text-emerald-300 bg-emerald-500/10">
                              Este aparato
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-white/50">
                          {f.medio && <Badge variant="outline" className="text-[9px] bg-white/5 border-white/10">{f.medio}</Badge>}
                          {f.so && <Badge variant="outline" className="text-[9px] bg-white/5 border-white/10">{formatearSo(f.so)}</Badge>}
                          {f.equipo && <Badge variant="outline" className="text-[9px] bg-white/5 border-white/10">{f.equipo}</Badge>}
                          {f.visto && <span>{textoUltimaVez(f.visto)}</span>}
                        </div>
                      </div>
                      {!f.esActual && (
                        <Button variant="ghost" size="sm" className="cursor-pointer text-red-400/80 hover:text-red-300" onClick={async () => {
                          const ok = window.confirm(`¿Desvincular "${f.nombre}" de esta neurona?`);
                          if (ok) {
                            // TODO: implementar desvincular aparato específico
                            setMensaje("Desvincular aparato: pendiente de implementar");
                          }
                        }}>
                          <Link2Off className="w-3.5 h-3.5" /> Desvincular
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={() => setPaso(paso === "elegir" ? "" : "elegir")}>
                        <Link2 className="h-3.5 w-3.5" /> Vincular a otra neurona
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={() => setPaso(paso === "nueva" ? "" : "nueva")}>
                        <Plus className="h-3.5 w-3.5" /> Crear neurona nueva
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={() => { void renombrarEsteAparato(f.nombre).then(() => onRefrescar()); }}>
                        <Pencil className="h-3.5 w-3.5" /> Renombrar
                      </Button>
                    </div>

                    {paso === "elegir" && (
                      <ul className="space-y-2 border-t border-white/5 pt-2" aria-label="Neuronas de mi cuenta">
                        {otras.map((n) => (
                          <li key={n.id} className="rounded-md border border-white/10 p-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <strong>{n.nombre}</strong>
                                <p className="text-xs text-white/50">
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
                              <div className="mt-2 space-y-2 border-t border-white/5 pt-2">
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
                        className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void mover(null, nombreNueva);
                        }}
                      >
                        <Input value={nombreNueva} maxLength={60} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Nombre de la neurona nueva" aria-label="Nombre de la neurona nueva" className="h-8 max-w-xs" />
                        <Button type="submit" size="sm" className="cursor-pointer" disabled={ocupado || !nombreNueva.trim()}>Crear y usar en este aparato</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mensaje && <p role="status" className="text-xs text-white/60">{mensaje}</p>}
        </div>
      )}
    </details>
  );
}

export default SeccionAparatos;