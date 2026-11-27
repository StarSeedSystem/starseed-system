"use client";

/**
 * Panel lateral común de ajustes de un pilar del cerebro (CER1126A, parte 1).
 *
 * Un solo panel para los 7 pilares: botón «Ajustes» en cada pilar, secciones en
 * el mismo orden (General, Privacidad y permisos, Sincronía, Avanzado), búsqueda
 * dentro de los ajustes, «Volver a lo recomendado» por sección y con confirmación,
 * y enlace directo `?tab=<pilar>&ajustes=<seccion>`.
 *
 * Los diálogos actuales (Medios, Seguridad y privacidad, Vinculación y
 * sincronización) se muestran DENTRO del panel sin quitar ninguna opción.
 */

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getBrain, saveBrain, type Brain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import {
  AJUSTES_POR_DEFECTO,
  ajustesEfectivos,
  conAjustes,
  leerAjustes,
  type AjustesCerebro,
  type AjustesObjetivo,
} from "@/lib/cerebros/ajustes";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
import {
  SELECT,
  combinar,
  juntar,
  leerCarpetas,
  objetivoDe,
} from "@/components/cerebro/ajustes-cerebro-dialog";
import { PILARES, type Pilar } from "@/components/cerebro/pilares";

export type Seccion = "general" | "privacidad" | "sincronia" | "avanzado";

export interface SeccionDef {
  id: Seccion;
  etiqueta: string;
  ayuda: string;
  claves: string[];
}

export const SECCIONES: SeccionDef[] = [
  { id: "general", etiqueta: "General", ayuda: "A qué se aplican los ajustes.", claves: ["aplicar", "cerebro", "memoria", "carpeta", "destino"] },
  { id: "privacidad", etiqueta: "Privacidad y permisos", ayuda: "Quién ve y quién escribe.", claves: ["privacidad", "cifrado", "acceso", "permisos", "seguridad"] },
  { id: "sincronia", etiqueta: "Sincronía", ayuda: "Dirección, destinos y vínculos.", claves: ["sync", "direccion", "destinos", "telepatia"] },
  { id: "avanzado", etiqueta: "Avanzado", ayuda: "Capacidades y almacenamiento.", claves: ["medios", "capacidad", "almacenamiento", "servidor", "neurona"] },
];

const sinAcento = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export function seccionDesdeUrl(valor: string | null): Seccion | null {
  const limpio = sinAcento(String(valor ?? "").trim());
  return SECCIONES.find((s) => s.id === limpio)?.id ?? null;
}

export function seccionesVisibles(consulta: string): SeccionDef[] {
  const q = sinAcento(consulta.trim());
  if (!q) return SECCIONES;
  return SECCIONES.filter((s) => sinAcento([s.etiqueta, s.ayuda, ...s.claves].join(" ")).includes(q));
}

export function reinicioDeSeccion(seccion: Seccion): Partial<AjustesObjetivo> {
  switch (seccion) {
    case "privacidad":
      return { privacidad: AJUSTES_POR_DEFECTO.privacidad, cifradoLocal: AJUSTES_POR_DEFECTO.cifradoLocal, acceso: [] };
    case "sincronia":
      return { sync: AJUSTES_POR_DEFECTO.sync };
    case "avanzado":
      return { medios: AJUSTES_POR_DEFECTO.medios };
    default:
      return {};
  }
}

const etiquetaDe = (s: Seccion) => SECCIONES.find((x) => x.id === s)?.etiqueta ?? s;

export interface PanelAjustesPilarProps {
  pilar: Pilar;
  cerebro: Brain;
  seccionInicial?: Seccion | null;
  onOpenChange: (abierto: boolean) => void;
  onHecho?: () => void;
}

export default function PanelAjustesPilar({ pilar, cerebro, seccionInicial, onOpenChange, onHecho }: PanelAjustesPilarProps) {
  const confirm = useConfirm();
  const etiqueta = PILARES.find((p) => p.id === pilar)?.etiqueta ?? pilar;
  const [seccion, setSeccion] = useState<Seccion>(seccionInicial ?? "general");
  const [consulta, setConsulta] = useState("");
  const [destino, setDestino] = useState("cerebro");
  const [ajustes, setAjustes] = useState<AjustesCerebro>(() => leerAjustes(cerebro));
  const [cambios, setCambios] = useState<Record<string, Partial<AjustesObjetivo>>>({});
  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<{ id: string; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setAjustes(leerAjustes(cerebro));
    setCambios({});
    setDestino("cerebro");
    setSeccion(seccionInicial ?? "general");
    setConsulta("");
    setAviso(null);
    setCarpetas(leerCarpetas(cerebro.id));
    let vivo = true;
    void listMemoryFiles(cerebro.id).then((f) => {
      if (vivo) setMemorias(f.map((x) => x.name));
    });
    return () => {
      vivo = false;
    };
  }, [cerebro.id, seccionInicial]);

  const objetivo = objetivoDe(destino);
  const parcial = cambios[destino] ?? {};
  const valor = combinar(ajustesEfectivos(ajustes, objetivo), parcial);
  const nivel = objetivo.tipo;
  const cambiar = (p: Partial<AjustesObjetivo>) =>
    setCambios((prev) => ({ ...prev, [destino]: juntar(prev[destino] ?? {}, p) }));

  const guardar = async () => {
    if (Object.keys(parcial).length === 0) {
      onOpenChange(false);
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const fresco = (await getBrain(cerebro.id)) ?? cerebro;
      const guardado = await saveBrain({ ...fresco, config: conAjustes(fresco.config, objetivo, parcial) });
      if (!guardado) throw new Error("No se pudo guardar el cerebro.");
      onHecho?.();
      onOpenChange(false);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const reiniciar = async (s: Seccion) => {
    const ok = await confirm({
      title: `Volver a lo recomendado en ${etiquetaDe(s)}`,
      description: "Se dejan los ajustes de esta sección como estaban por defecto. No toca las demás secciones.",
      confirmText: "Volver a lo recomendado",
    });
    if (ok) cambiar(reinicioDeSeccion(s));
  };

  const visibles = seccionesVisibles(consulta);

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ajustes · {etiqueta}</SheetTitle>
          <SheetDescription>
            Secciones en el mismo orden para todos los pilares. Busca un ajuste o vuelve una sección a lo recomendado.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
            <Input
              aria-label="Buscar en los ajustes"
              placeholder="Buscar en los ajustes…"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              className="h-9 border-white/15 bg-black/40 pl-8"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones de ajustes">
            {visibles.map((s) => (
              <Button
                key={s.id}
                type="button"
                size="sm"
                variant={seccion === s.id ? "default" : "outline"}
                aria-pressed={seccion === s.id}
                className="h-auto whitespace-normal py-1.5"
                onClick={() => setSeccion(s.id)}
              >
                {s.etiqueta}
              </Button>
            ))}
            {visibles.length === 0 && (
              <p className="text-xs text-white/50">Ningún ajuste coincide con «{consulta}».</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-white">
            {seccion === "general" && (
              <div className="space-y-1.5">
                <label htmlFor="aplicar-a" className="text-sm font-semibold">Aplicar a</label>
                <select id="aplicar-a" className={SELECT} value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="cerebro">Cerebro completo</option>
                  {memorias.length > 0 && (
                    <optgroup label="Una memoria">
                      {memorias.map((m) => (
                        <option key={m} value={`memoria:${m}`}>{m}</option>
                      ))}
                    </optgroup>
                  )}
                  {carpetas.length > 0 && (
                    <optgroup label="Una carpeta">
                      {carpetas.map((c) => (
                        <option key={c.id} value={`carpeta:${c.id}`}>{c.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs leading-relaxed text-white/60">
                  {nivel === "cerebro" ? "El cerebro entero; memorias y carpetas heredan lo que no cambien." : "Solo esta parte; lo que no cambies se hereda del cerebro."}
                </p>
              </div>
            )}
            {seccion === "privacidad" && <AjustesSeguridad valor={valor} onCambio={cambiar} nivel={nivel} />}
            {seccion === "sincronia" && <AjustesSync valor={valor} onCambio={cambiar} cerebro={cerebro} />}
            {seccion === "avanzado" && (
              <AjustesMedios valor={valor} onCambio={cambiar} cerebro={cerebro} privacidad={valor.privacidad} nivel={nivel} />
            )}
            {seccion !== "general" && (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-auto whitespace-normal py-1 text-xs text-amber-200"
                  onClick={() => void reiniciar(seccion)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Volver a lo recomendado
                </Button>
              </div>
            )}
          </div>

          {aviso && <p className="text-sm text-amber-200">{aviso}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-auto whitespace-normal" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="button" className="h-auto whitespace-normal" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}