"use client";

/**
 * PersonalizarFondoDialog — diálogo para editar un fondo en el editor de fondos/Protomolécula.
 * Se abre desde el botón "Personalizar" de cada tarjeta en ElegirFondoInicial.
 */
import { useEffect, useState, useMemo } from "react";
import { X, Check, Loader2, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EFECTOS_FONDO, planFondo, propsDeEfecto, type EfectoFondoId } from "@/lib/protomolecula/atomos/fondo-shader";
import type { SetFondo } from "@/lib/appearance/sets-fondo";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import type { OpcionFondoInicial } from "./elegir-fondo-inicial";
import { MiniaturaFondo } from "./miniatura-fondo";
import { modoVistaPrevia, type ModoVistaPrevia } from "@/lib/onboarding/fondo-inicial";
import { CapaShader } from "@/components/backgrounds/capa-shader";
import { CapaDifusion } from "@/components/backgrounds/capa-difusion";

interface PersonalizarFondoDialogProps {
  opcion: OpcionFondoInicial;
  open: boolean;
  onClose: () => void;
  onGuardar: (opcion: OpcionFondoInicial) => void;
}

const CREADO = "2026-10-18T00:00:00.000Z";

function VistaPreviaFondo({ set, modo, className }: { set: SetFondo; modo: ModoVistaPrevia; className?: string }) {
  return (
    <div role="img" aria-label={`Vista previa de ${set.nombre}`} className={cn("relative h-64 w-full overflow-hidden rounded-md border bg-black", className)}>
      {set.capas.map((capa) =>
        capa.kind === "shader" ? (
          <div key={capa.id} className="absolute inset-0">
            <CapaShader capa={capa} />
          </div>
        ) : (
          <CapaDifusion key={capa.id} capa={capa} />
        ),
      )}
    </div>
  );
}

export function PersonalizarFondoDialog({ opcion, open, onClose, onGuardar }: PersonalizarFondoDialogProps) {
  const [efecto, setEfecto] = useState<EfectoFondoId>(opcion.set?.capas.find((c) => c.kind === "shader")?.preset?.components?.[0]?.type as EfectoFondoId || "aurora");
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [capas, setCapas] = useState<number>(opcion.set?.capas.filter((c) => c.kind === "shader").length || 1);
  const [difusion, setDifusion] = useState<"ninguna" | "transparente" | "desenfoque" | "blanco" | "negro" | "tono">("ninguna");
  const [tonoDifusion, setTonoDifusion] = useState("#ffffff");
  const [guardando, setGuardando] = useState(false);
  const [modoPrevia, setModoPrevia] = useState<ModoVistaPrevia>("quieta");
  const [movimientoReducido, setMovimientoReducido] = useState(false);
  const [webgpu, setWebgpu] = useState(false);
  const [rendimientoBajo, setRendimientoBajo] = useState(false);

  useEffect(() => {
    if (!opcion.set) return;
    const shaderLayer = opcion.set.capas.find((c) => c.kind === "shader");
    if (shaderLayer?.preset?.components?.[0]) {
      const comp = shaderLayer.preset.components[0];
      setEfecto(comp.type as EfectoFondoId);
      setProps(comp.props || {});
    }
    setCapas(opcion.set.capas.filter((c) => c.kind === "shader").length);
    const difLayer = opcion.set.capas.find((c) => c.kind === "difusion");
    if (difLayer?.difusion) {
      setDifusion(difLayer.difusion.modo as typeof difusion);
      if (difLayer.difusion.modo === "tono" && difLayer.difusion.tono) {
        setTonoDifusion(difLayer.difusion.tono);
      }
    }
  }, [opcion]);

  useEffect(() => {
    setMovimientoReducido(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    setWebgpu(typeof navigator !== "undefined" && "gpu" in navigator);
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }> };
    nav.getBattery?.().then((b) => { setRendimientoBajo(!b.charging && b.level < 0.2); });
  }, []);

  useEffect(() => {
    setModoPrevia(modoVistaPrevia({ webgpu, movimientoReducido, rendimientoBajo, activa: true }));
  }, [webgpu, movimientoReducido, rendimientoBajo]);

  const setActual = useMemo(() => {
    if (!opcion.set) return null;
    return planFondo({
      id: opcion.set.id,
      nombre: opcion.set.nombre,
      autor: opcion.set.autor,
      creado: opcion.set.creado,
      valores: {
        efecto,
        props: 100,
        capas,
        difusion,
        alcance: "perfil",
      },
      props,
    });
  }, [opcion.set, efecto, props, capas, difusion, tonoDifusion]);

  const handleGuardar = async () => {
    if (!setActual) return;
    setGuardando(true);
    try {
      const nuevaOpcion: OpcionFondoInicial = {
        ...opcion,
        set: setActual,
        nombre: opcion.nombre,
      };
      onGuardar(nuevaOpcion);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  const efectoActual = EFECTOS_FONDO[efecto];
  const propsEsquema = efectoActual.props;

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">Personalizar {opcion.nombre}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Ajusta colores, velocidad, capas y difusión. La vista previa se actualiza en tiempo real.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-200px)]">
            <VistaPreviaFondo set={setActual!} modo={modoPrevia} />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModoPrevia((m) => m === "animada" ? "quieta" : "animada")}
                aria-pressed={modoPrevia === "animada"}
              >
                {modoPrevia === "animada" ? "Pausar" : "Animar"} vista previa
              </Button>
              <span className="text-xs text-muted-foreground">
                {modoPrevia === "imagen" && "WebGPU no disponible · imagen estática"}
                {modoPrevia === "quieta" && webgpu && "Modo quieta · animación al pasar cursor"}
                {modoPrevia === "animada" && "Animación continua"}
              </span>
            </div>
          </div>

          <div className="space-y-4 border-l border-border pl-4 lg:border-l lg:pl-4">
            <fieldset>
              <legend className="text-sm font-medium mb-2">Efecto</legend>
              <div className="grid gap-2 sm:grid-cols-2 sm:grid-cols-3">
                {(Object.keys(EFECTOS_FONDO) as EfectoFondoId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setEfecto(id); setProps(EFECTOS_FONDO[id].props); }}
                    className={cn(
                      "p-2 rounded-lg border text-xs text-center transition-colors",
                      efecto === id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                    aria-pressed={efecto === id}
                  >
                    <Palette className="h-3 w-3 mx-auto mb-1" aria-hidden />
                    <div>{EFECTOS_FONDO[id].nombre}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium mb-2">Parámetros</legend>
              <div className="space-y-2">
                {Object.entries(propsEsquema).map(([clave, valor]) => {
                  if (typeof valor !== "number") return null;
                  const isColor = typeof props[clave] === "string" && /^#[0-9a-f]{3,8}$/i.test(props[clave] as string);
                  return (
                    <div key={clave} className="space-y-1">
                      <label className="text-xs text-muted-foreground capitalize">{clave.replace(/([A-Z])/g, " $1").trim()}</label>
                      {isColor ? (
                        <input
                          type="color"
                          value={props[clave] as string}
                          onChange={(e) => setProps((p) => ({ ...p, [clave]: e.target.value }))}
                          className="h-8 w-8 rounded border cursor-pointer"
                          aria-label={clave}
                        />
                      ) : (
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={typeof props[clave] === "number" ? Math.round(props[clave] as number * 100) : Math.round(valor * 100)}
                          onChange={(e) => setProps((p) => ({ ...p, [clave]: Number(e.target.value) / 100 }))}
                          className="w-full"
                          aria-label={clave}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium mb-2">Capas de shader</legend>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={capas}
                  onChange={(e) => setCapas(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-mono w-6 text-center">{capas}</span>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium mb-2">Difusión</legend>
              <div className="space-y-2">
                <select
                  value={difusion}
                  onChange={(e) => setDifusion(e.target.value as typeof difusion)}
                  className="w-full rounded border bg-background p-2 text-sm"
                >
                  <option value="ninguna">Ninguna</option>
                  <option value="transparente">Transparente</option>
                  <option value="desenfoque">Desenfoque</option>
                  <option value="blanco">Blanco</option>
                  <option value="negro">Negro</option>
                  <option value="tono">Tono personalizado</option>
                </select>
                {difusion === "tono" && (
                  <input
                    type="color"
                    value={tonoDifusion}
                    onChange={(e) => setTonoDifusion(e.target.value)}
                    className="h-8 w-8 rounded border cursor-pointer"
                    aria-label="Tono de difusión"
                  />
                )}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando || !setActual}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PersonalizarFondoDialog;