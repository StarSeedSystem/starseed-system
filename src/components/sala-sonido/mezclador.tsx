"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LucideIcon,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Users,
  User,
  Lock,
  Eye,
  EyeOff,
  Music,
  Mic,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Settings,
  ListMusic,
  Fade,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  formatoTiempo,
  etiquetaNivel,
  etiquetaEcualizador,
  esControladora,
  obtenerNeuronasUnicas,
} from "@/lib/sala-sonido/utils";

export type ModoControl = "una" | "elegidas" | "todas";
export type VisibilidadSala = "publica" | "contactos" | "sala" | "nada";

export interface FuenteAudio {
  id: string;
  nombre: string;
  tipo: "archivo" | "biblioteca" | "app" | "microfono" | "spotify";
  neuronaId: string;
  neuronaNombre: string;
  nivel: number;
  ecualizador: { graves: number; medios: number; agudos: number };
  limitador: number;
  muted: boolean;
  solo: boolean;
  reproduciendo: boolean;
  duracion?: number;
  posicion?: number;
}

export interface ColaItem {
  id: string;
  titulo: string;
  artista?: string;
  fuenteId: string;
  duracion: number;
  añadidoPor: string;
  orden: number;
}

export interface EstadoSala {
  fuentes: FuenteAudio[];
  cola: ColaItem[];
  reproduciendo: ColaItem | null;
  modoControl: ModoControl;
  neuronasControladoras: string[];
  visibilidad: VisibilidadSala;
  neuronaActual: string;
}

export interface MezcladorProps {
  estado: EstadoSala;
  onCambiarNivel: (fuenteId: string, nivel: number) => void;
  onCambiarEcualizador: (fuenteId: string, banda: "graves" | "medios" | "agudos", valor: number) => void;
  onCambiarLimitador: (fuenteId: string, valor: number) => void;
  onToggleMuted: (fuenteId: string) => void;
  onToggleSolo: (fuenteId: string) => void;
  onCambiarModoControl: (modo: ModoControl, neuronas?: string[]) => void;
  onCambiarVisibilidad: (visibilidad: VisibilidadSala) => void;
  onAñadirACola: (item: Omit<ColaItem, "id" | "orden">) => void;
  onQuitarDeCola: (itemId: string) => void;
  onReordenarCola: (itemId: string, nuevoOrden: number) => void;
  onReproducirSiguiente: () => void;
  onDetener: () => void;
  className?: string;
}

const MODOS_CONTROL: { value: ModoControl; label: string; icon: LucideIcon; descripcion: string }[] = [
  { value: "una", label: "Una sola", icon: User, descripcion: "Solo una neurona controla la reproducción" },
  { value: "elegidas", label: "Elegidas", icon: Users, descripcion: "Varias neuronas seleccionadas controlan juntas" },
  { value: "todas", label: "Todas", icon: Users, descripcion: "Todas las neuronas de la sala controlan" },
];

const VISIBILIDADES: { value: VisibilidadSala; label: string; icon: LucideIcon; descripcion: string }[] = [
  { value: "publica", label: "Pública", icon: Eye, descripcion: "Visible para cualquiera en la red" },
  { value: "contactos", label: "Contactos", icon: Users, descripcion: "Solo tus contactos ven lo que suena" },
  { value: "sala", label: "Solo la sala", icon: Lock, descripcion: "Solo las neuronas unidas a esta sala" },
  { value: "nada", label: "Nada", icon: EyeOff, descripcion: "Lo que suena es privado" },
];

const ICONOS_TIPO_FUENTE: Record<FuenteAudio["tipo"], LucideIcon> = {
  archivo: Music,
  biblioteca: ListMusic,
  app: Settings,
  microfono: Mic,
  spotify: Music,
};

function FuenteCanal({
  fuente,
  esControladora,
  onCambiarNivel,
  onCambiarEcualizador,
  onCambiarLimitador,
  onToggleMuted,
  onToggleSolo,
}: {
  fuente: FuenteAudio;
  esControladora: boolean;
  onCambiarNivel: (nivel: number) => void;
  onCambiarEcualizador: (banda: "graves" | "medios" | "agudos", valor: number) => void;
  onCambiarLimitador: (valor: number) => void;
  onToggleMuted: () => void;
  onToggleSolo: () => void;
}) {
  const [ecualizadorAbierto, setEcualizadorAbierto] = React.useState(false);

  return (
    <Card className={cn("flex flex-col gap-4", !esControladora && "opacity-60")}>
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 p-2 rounded-xl bg-primary/10">
            {(() => {
              const Icono = ICONOS_TIPO_FUENTE[fuente.tipo];
              return <Icono className="h-5 w-5 text-primary" aria-hidden="true" />;
            })()}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{fuente.nombre}</p>
            <p className="text-xs text-foreground/60 truncate">
              {fuente.neuronaNombre} · {fuente.tipo}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={fuente.muted ? "default" : "ghost"}
            size="icon"
            onClick={onToggleMuted}
            aria-label={fuente.muted ? "Activar sonido" : "Silenciar"}
            aria-pressed={fuente.muted}
            className={fuente.muted ? "text-destructive" : ""}
          >
            {fuente.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Button
            variant={fuente.solo ? "default" : "ghost"}
            size="icon"
            onClick={onToggleSolo}
            aria-label={fuente.solo ? "Quitar solo" : "Solo esta fuente"}
            aria-pressed={fuente.solo}
            className={fuente.solo ? "text-primary" : ""}
          >
            <Fade className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEcualizadorAbierto(!ecualizadorAbierto)}
            aria-label={ecualizadorAbierto ? "Ocultar ecualizador" : "Mostrar ecualizador"}
            aria-expanded={ecualizadorAbierto}
          >
            <SlidersHorizontal className={cn("h-4 w-4", ecualizadorAbierto && "text-primary")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4 pt-0">
        <div className="flex items-center gap-3">
          <label htmlFor={`nivel-${fuente.id}`} className="text-xs text-foreground/60 shrink-0 w-16">
            Nivel
          </label>
          <Slider
            id={`nivel-${fuente.id}`}
            value={[fuente.nivel]}
            onValueChange={([v]) => onCambiarNivel(v)}
            max={1}
            step={0.01}
            showTooltip
            tooltipContent={(v) => `${Math.round(v * 100)}%`}
            getAriaValueText={etiquetaNivel}
            disabled={!esControladora}
            className="flex-1"
            aria-label={`Nivel de ${fuente.nombre}`}
          />
          <span className="text-xs text-foreground/60 shrink-0 w-14 text-right">
            {Math.round(fuente.nivel * 100)}%
          </span>
        </div>

        {ecualizadorAbierto && (
          <div className="space-y-3 pt-2 border-t border-border/50" role="group" aria-label={`Ecualizador de ${fuente.nombre}`}>
            {(["graves", "medios", "agudos"] as const).map((banda) => (
              <div key={banda} className="flex items-center gap-3">
                <label
                  htmlFor={`eq-${banda}-${fuente.id}`}
                  className="text-xs text-foreground/60 shrink-0 w-16 capitalize"
                >
                  {banda}
                </label>
<Slider
                  id={`eq-${banda}-${fuente.id}`}
                  value={[fuente.ecualizador[banda]]}
                  onValueChange={([v]) => onCambiarEcualizador(banda, v)}
                  min={-1}
                  max={1}
                  step={0.05}
                  showTooltip
                  tooltipContent={etiquetaEcualizador}
                  getAriaValueText={etiquetaEcualizador}
                  disabled={!esControladora}
                  className="flex-1"
                  aria-label={`${banda.charAt(0).toUpperCase() + banda.slice(1)} de ${fuente.nombre}`}
                />
                <span className="text-xs text-foreground/60 shrink-0 w-20 text-right">
                  {etiquetaEcualizador(fuente.ecualizador[banda])}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <label htmlFor={`limitador-${fuente.id}`} className="text-xs text-foreground/60 shrink-0 w-16">
            Limitador
          </label>
          <Slider
            id={`limitador-${fuente.id}`}
            value={[fuente.limitador]}
            onValueChange={([v]) => onCambiarLimitador(v)}
            max={1}
            step={0.01}
            showTooltip
            tooltipContent={(v) => `${Math.round(v * 100)}%`}
            getAriaValueText={(v) => v === 0 ? "Desactivado" : v === 1 ? "Máximo" : `${Math.round(v * 100)}%`}
            disabled={!esControladora}
            className="flex-1"
            aria-label={`Limitador de ${fuente.nombre}`}
          />
          <span className="text-xs text-foreground/60 shrink-0 w-14 text-right">
            {fuente.limitador === 0 ? "Off" : `${Math.round(fuente.limitador * 100)}%`}
          </span>
        </div>

        {fuente.reproduciendo && fuente.duracion && (
          <div className="flex items-center gap-3 pt-2 border-t border-border/50">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-100"
                style={{ width: `${((fuente.posicion || 0) / fuente.duracion) * 100}%` }}
              />
            </div>
            <span className="text-xs text-foreground/60 font-mono shrink-0">
              {formatoTiempo(fuente.posicion || 0)} / {formatoTiempo(fuente.duracion)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelCola({
  cola,
  reproduciendo,
  neuronaActual,
  onQuitarDeCola,
  onReordenarCola,
  onReproducirSiguiente,
  onDetener,
}: {
  cola: ColaItem[];
  reproduciendo: ColaItem | null;
  neuronaActual: string;
  onQuitarDeCola: (itemId: string) => void;
  onReordenarCola: (itemId: string, nuevoOrden: number) => void;
  onReproducirSiguiente: () => void;
  onDetener: () => void;
}) {
  const [itemArrastrando, setItemArrastrando] = React.useState<string | null>(null);

  const manejarArrastrarInicio = (e: React.DragEvent, itemId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
    setItemArrastrando(itemId);
  };

  const manejarArrastrarSobre = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const manejarSoltar = (e: React.DragEvent, itemIdObjetivo: string) => {
    e.preventDefault();
    const itemIdOrigen = e.dataTransfer.getData("text/plain");
    if (itemIdOrigen && itemIdOrigen !== itemIdObjetivo) {
      const indiceObjetivo = cola.findIndex((c) => c.id === itemIdObjetivo);
      if (indiceObjetivo >= 0) {
        onReordenarCola(itemIdOrigen, indiceObjetivo);
      }
    }
    setItemArrastrando(null);
  };

  const manejarArrastrarFin = () => {
    setItemArrastrando(null);
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ListMusic className="h-5 w-5" aria-hidden="true" />
          Cola común
        </CardTitle>
        <div className="flex items-center gap-2">
          {reproduciendo && (
            <Button variant="ghost" size="sm" onClick={onDetener} aria-label="Detener reproducción">
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Detener</span>
            </Button>
          )}
          {cola.length > 0 && (
            <Button variant="default" size="sm" onClick={onReproducirSiguiente} aria-label="Reproducir siguiente">
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Siguiente</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-4 pt-0">
        {cola.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-foreground/40 gap-3">
            <Music className="h-12 w-12" aria-hidden="true" />
            <p className="text-center">La cola está vacía</p>
            <p className="text-xs">Añade audio desde archivos, la Biblioteca o apps</p>
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Cola de reproducción">
            {cola.map((item, indice) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => manejarArrastrarInicio(e, item.id)}
                onDragOver={manejarArrastrarSobre}
                onDrop={(e) => manejarSoltar(e, item.id)}
                onDragEnd={manejarArrastrarFin}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-colors",
                  "bg-card border border-border/50",
                  itemArrastrando === item.id && "opacity-50 ring-2 ring-primary",
                  reproduciendo?.id === item.id && "bg-primary/10 border-primary/30"
                )}
                role="listitem"
                aria-current={reproduciendo?.id === item.id ? "true" : "false"}
              >
                <div className="shrink-0 w-8 text-center text-foreground/40 text-sm font-mono">
                  {indice + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.titulo}</p>
                  <p className="text-xs text-foreground/60 truncate flex items-center gap-1">
                    {item.artista && <span>{item.artista} · </span>}
                    <span>Añadido por {item.añadidoPor}</span>
                  </p>
                </div>
                {item.añadidoPor === neuronaActual && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onQuitarDeCola(item.id)}
                    aria-label={`Quitar "${item.titulo}" de la cola`}
                    className="text-foreground/40 hover:text-destructive"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelControles({
  modoControl,
  neuronasControladoras,
  visibilidad,
  todasLasNeuronas,
  onCambiarModoControl,
  onCambiarVisibilidad,
}: {
  modoControl: ModoControl;
  neuronasControladoras: string[];
  visibilidad: VisibilidadSala;
  todasLasNeuronas: { id: string; nombre: string }[];
  onCambiarModoControl: (modo: ModoControl, neuronas?: string[]) => void;
  onCambiarVisibilidad: (visibilidad: VisibilidadSala) => void;
}) {
  const [modoAbierto, setModoAbierto] = React.useState(false);
  const [visibilidadAbierta, setVisibilidadAbierta] = React.useState(false);
  const [neuronasSeleccionadas, setNeuronasSeleccionadas] = React.useState<string[]>(neuronasControladoras);

  const manejarCambioModo = (modo: ModoControl) => {
    if (modo === "elegidas") {
      onCambiarModoControl(modo, neuronasSeleccionadas);
    } else {
      onCambiarModoControl(modo);
    }
    setModoAbierto(false);
  };

  const alternarNeurona = (neuronaId: string) => {
    setNeuronasSeleccionadas((prev) =>
      prev.includes(neuronaId) ? prev.filter((id) => id !== neuronaId) : [...prev, neuronaId]
    );
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" aria-hidden="true" />
          Quién controla
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-0">
        <div>
          <label className="text-xs text-foreground/60 block mb-2">Modo de control</label>
          <Select
            value={modoControl}
            onValueChange={manejarCambioModo}
            open={modoAbierto}
            onOpenChange={setModoAbierto}
          >
            <SelectTrigger className="w-full" aria-label="Modo de control de la sala">
              <SelectValue placeholder="Selecciona modo" />
            </SelectTrigger>
            <SelectContent>
              {MODOS_CONTROL.map((modo) => (
                <SelectItem key={modo.value} value={modo.value}>
                  <div className="flex items-center gap-2">
                    <modo.icon className="h-4 w-4" aria-hidden="true" />
                    <div>
                      <p className="font-medium">{modo.label}</p>
                      <p className="text-xs text-foreground/60">{modo.descripcion}</p>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {modoControl === "elegidas" && (
          <div>
            <label className="text-xs text-foreground/60 block mb-2">Neuronas que controlan</label>
            <div className="flex flex-wrap gap-2">
              {todasLasNeuronas.map((neurona) => (
                <Button
                  key={neurona.id}
                  variant={neuronasSeleccionadas.includes(neurona.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => alternarNeurona(neurona.id)}
                  aria-pressed={neuronasSeleccionadas.includes(neurona.id)}
                  className="gap-1"
                >
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{neurona.nombre}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <Separator className="my-2" />

        <div>
          <label className="text-xs text-foreground/60 block mb-2">Visibilidad de lo que suena</label>
          <Select
            value={visibilidad}
            onValueChange={onCambiarVisibilidad}
            open={visibilidadAbierta}
            onOpenChange={setVisibilidadAbierta}
          >
            <SelectTrigger className="w-full" aria-label="Visibilidad de la sala">
              <SelectValue placeholder="Selecciona visibilidad" />
            </SelectTrigger>
            <SelectContent>
              {VISIBILIDADES.map((vis) => (
                <SelectItem key={vis.value} value={vis.value}>
                  <div className="flex items-center gap-2">
                    <vis.icon className="h-4 w-4" aria-hidden="true" />
                    <div>
                      <p className="font-medium">{vis.label}</p>
                      <p className="text-xs text-foreground/60">{vis.descripcion}</p>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export function MezcladorSalaSonido({
  estado,
  onCambiarNivel,
  onCambiarEcualizador,
  onCambiarLimitador,
  onToggleMuted,
  onToggleSolo,
  onCambiarModoControl,
  onCambiarVisibilidad,
  onAñadirACola,
  onQuitarDeCola,
  onReordenarCola,
  onReproducirSiguiente,
  onDetener,
  className,
}: MezcladorProps) {
  const todasLasNeuronas = obtenerNeuronasUnicas(estado.fuentes);

  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        "lg:grid lg:grid-cols-[1fr_320px] lg:gap-4",
        className
      )}
      role="region"
      aria-label="Mezclador de la sala de sonido"
    >
      <div className="flex flex-col gap-4 min-w-0">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {estado.fuentes.map((fuente) => (
            <FuenteCanal
              key={fuente.id}
              fuente={fuente}
              esControladora={esControladora(fuente.neuronaId, estado.modoControl, estado.neuronasControladoras)}
              onCambiarNivel={(nivel) => onCambiarNivel(fuente.id, nivel)}
              onCambiarEcualizador={(banda, valor) => onCambiarEcualizador(fuente.id, banda, valor)}
              onCambiarLimitador={(valor) => onCambiarLimitador(fuente.id, valor)}
              onToggleMuted={() => onToggleMuted(fuente.id)}
              onToggleSolo={() => onToggleSolo(fuente.id)}
            />
          ))}
          {estado.fuentes.length === 0 && (
            <Card className="lg:col-span-2 flex flex-col items-center justify-center h-64">
              <CardContent className="flex flex-col items-center justify-center h-full text-foreground/40 gap-3">
                <Music className="h-16 w-16" aria-hidden="true" />
                <p className="text-center">No hay fuentes de audio en la sala</p>
                <p className="text-xs">Une neuronas por NFC o desde Señales para añadir fuentes</p>
              </CardContent>
            </Card>
          )}
        </div>

        <PanelCola
          cola={estado.cola}
          reproduciendo={estado.reproduciendo}
          neuronaActual={estado.neuronaActual}
          onQuitarDeCola={onQuitarDeCola}
          onReordenarCola={onReordenarCola}
          onReproducirSiguiente={onReproducirSiguiente}
          onDetener={onDetener}
        />
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <PanelControles
          modoControl={estado.modoControl}
          neuronasControladoras={estado.neuronasControladoras}
          visibilidad={estado.visibilidad}
          todasLasNeuronas={todasLasNeuronas}
          onCambiarModoControl={onCambiarModoControl}
          onCambiarVisibilidad={onCambiarVisibilidad}
        />
      </aside>
    </div>
  );
}

export type { MezcladorProps as MezcladorSalaSonidoProps };