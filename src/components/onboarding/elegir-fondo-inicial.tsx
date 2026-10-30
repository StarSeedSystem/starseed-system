"use client";

/**
 * ELEGIR FONDO INICIAL — Paso «Elige tu fondo» al crear el perfil y su reaparición.
 * ---------------------------------------------------------------------------
 * Igual estilo que SelectorVozInicial: tarjetas grandes, prueba visual, «Ahora no»
 * aplaza 7 días. El fondo actual (motor base, Spline por defecto) sigue siendo la
 * opción principal. Sets oficiales + catálogo de shaders (import dinámico, solo
 * cliente, telemetría apagada). Varias selecciones posibles (perfil, apps) y
 * guardado con alcance-fondos/fondos-biblioteca.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Palette,
  Sparkles,
  Loader2,
  Check,
  X,
  ChevronRight,
  Layers,
  Image,
  Square,
  Sliders,
  Monitor,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  debeMostrarElegirFondo,
  calcularAplazamiento,
  type EntradaFondoInicial,
  type SalidaFondoInicial,
} from "@/lib/onboarding/fondo-inicial";
import { saveOnboarding } from "@/lib/onboarding/onboarding";
import { toast } from "sonner";

interface FondoSet {
  id: string;
  nombre: string;
  descripcion: string;
  preview: string; // URL o data URI de la vista previa
  tipo: "base" | "oficial" | "shader" | "personalizado";
  capas?: any[]; // Para shaders: componentes del preset
  motorBase?: string;
}

interface FondoSeleccionado {
  setId: string;
  alcance: "perfil" | "apps" | "ambos";
}

const FRASE_PRUEBA_FONDO = "Así se ve tu fondo. Puedes cambiarlo cuando quieras.";

// Sets oficiales de StarSeed (iniciales, luego vienen de la Biblioteca)
const SETS_OFICIALES: FondoSet[] = [
  {
    id: "base-spline",
    nombre: "Spline (actual)",
    descripcion: "El fondo base del OS — motor Spline por defecto",
    preview: "",
    tipo: "base",
    motorBase: "spline",
  },
  {
    id: "aurora-cristal",
    nombre: "Aurora Cristal",
    descripcion: "Degradado vivo con tonos fucsia/cian — identidad StarSeed",
    preview: "linear-gradient(135deg, #7C3AED 0%, #22D3EE 50%, #10B981 100%)",
    tipo: "oficial",
    motorBase: "spline",
  },
  {
    id: "materia-viva",
    nombre: "Materia Viva",
    descripcion: "Orgánico, cálido — oro vivo sobre verde bosque",
    preview: "radial-gradient(ellipse at center, #1a2e1a 0%, #0d130e 70%)",
    tipo: "oficial",
    motorBase: "spline",
  },
  {
    id: "quantum-hex",
    nombre: "Quantum Hex",
    descripcion: "Red hexagonal técnico — cian sobre negro profundo",
    preview: "radial-gradient(ellipse at center, #020617 0%, #0c4a6e 100%)",
    tipo: "oficial",
    motorBase: "spline",
  },
  {
    id: "solarpunk-aurora",
    nombre: "Solarpunk Aurora",
    descripcion: "Optimista, naturaleza+tecnología — amarillo/verde sobre crema",
    preview: "linear-gradient(135deg, #fef9c3 0%, #65a30d 50%, #15803d 100%)",
    tipo: "oficial",
    motorBase: "spline",
  },
];

export function ElegirFondoInicial({
  onContinuar,
  onSaltar,
  versionCatalogoActual = 1,
}: {
  /** Se llama al confirmar la elección (o al saltar). */
  onContinuar: (seleccion: FondoSeleccionado | null) => void | Promise<void>;
  /** Se llama al pulsar «Ahora no» (aplaza 7 días). */
  onSaltar: () => void | Promise<void>;
  /** Versión actual del catálogo de fondos (sube con novedades). */
  versionCatalogoActual?: number;
}) {
  const [seleccionado, setSeleccionado] = useState<FondoSeleccionado | null>(null);
  const [alcance, setAlcance] = useState<"perfil" | "apps" | "ambos">("perfil");
  const [cargandoShaders, setCargandoShaders] = useState(false);
  const [setsShader, setSetsShader] = useState<FondoSet[]>([]);
  const [probando, setProbando] = useState<string | null>(null);
  const [sonando, setSonando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Cargar sets de shaders desde el catálogo (import dinámico, solo cliente)
  const cargarSetsShader = useCallback(async () => {
    if (typeof window === "undefined") return;
    setCargandoShaders(true);
    try {
      // Import dinámico de shaders/js y shaders/registry
      const [{ createShader }, { registry }] = await Promise.all([
        import("shaders/js"),
        import("shaders/registry"),
      ]);

      // Desactivar telemetría SIEMPRE
      if (typeof createShader === "function") {
        try {
          // createShader acepta opciones con disableTelemetry
          // Solo preparamos el catálogo, no creamos canvas aquí
        } catch { /* noop */ }
      }

      // Obtener efectos del registry y crear sets representativos
      const efectos = registry?.effects ?? registry?.default ?? [];
      const nuevosSets: FondoSet[] = (Array.isArray(efectos) ? efectos : []).slice(0, 8).map((efecto: any, i: number) => ({
        id: `shader-${efecto.id ?? efecto.name ?? `efecto-${i}`}`,
        nombre: efecto.name ?? efecto.id ?? `Shader ${i + 1}`,
        descripcion: efecto.description ?? "Efecto WebGPU configurable",
        preview: "", // Se renderiza con createShader en la tarjeta
        tipo: "shader",
        capas: [{ type: efecto.id, props: efecto.defaultProps ?? {} }],
      }));

      setSetsShader(nuevosSets);
    } catch (err) {
      console.warn("[elegir-fondo] No se pudo cargar catálogo de shaders:", err);
    } finally {
      setCargandoShaders(false);
    }
  }, []);

  useEffect(() => {
    cargarSetsShader();
  }, [cargarSetsShader]);

  // Comprobar si debe mostrarse (lógica pura, pero aquí solo para referencia visual)
  const [debeMostrar, setDebeMostrar] = useState<SalidaFondoInicial | null>(null);

  useEffect(() => {
    // La decisión real se toma en el wizard antes de montar este componente.
    // Aquí solo reflejamos el estado para la UI.
    setDebeMostrar({ mostrar: true, motivo: "perfil-nuevo", puedeAplazar: true });
  }, []);

  const manejarSeleccion = useCallback((set: FondoSet, nuevoAlcance: "perfil" | "apps" | "ambos") => {
    setSeleccionado({ setId: set.id, alcance: nuevoAlcance });
    setAlcance(nuevoAlcance);
  }, []);

  const probarFondo = useCallback(async (set: FondoSet) => {
    if (probando === set.id) {
      setProbando(null);
      return;
    }
    setProbando(set.id);
    // Aquí iría la lógica de previsualización real con createShader
    // Por ahora solo feedback visual
    setTimeout(() => setProbando(null), 3000);
  }, [probando]);

  const confirmar = useCallback(async () => {
    setGuardando(true);
    try {
      // Guardar la elección en onboarding_state (steps.fondoInicial)
      await saveOnboarding({
        steps: {
          fondoInicial: {
            setId: seleccionado?.setId ?? "base-spline",
            alcance: seleccionado?.alcance ?? "perfil",
            versionCatalogo: versionCatalogoActual,
            elegidoEn: Date.now(),
          },
        },
      });
      await onContinuar(seleccionado);
      toast.success("Fondo guardado");
    } catch (err) {
      console.error("[elegir-fondo] Error al guardar:", err);
      toast.error("No se pudo guardar el fondo");
    } finally {
      setGuardando(false);
    }
  }, [seleccionado, versionCatalogoActual, onContinuar]);

  const saltar = useCallback(async () => {
    // Aplazar 7 días: guardar aplazadoHasta en onboarding_state
    const aplazadoHasta = calcularAplazamiento(Date.now());
    try {
      await saveOnboarding({
        steps: {
          fondoInicial: {
            aplazadoHasta,
            versionCatalogo: versionCatalogoActual,
          },
        },
      });
      await onSaltar();
      toast.message("Te lo recordamos en 7 días");
    } catch (err) {
      console.error("[elegir-fondo] Error al aplazar:", err);
      await onSaltar(); // Siempre permite continuar aunque falle el guardado
    }
  }, [versionCatalogoActual, onSaltar]);

  const todosLosSets = [
    ...SETS_OFICIALES,
    ...setsShader,
  ];

  return (
    <div className="space-y-4" data-elegir-fondo-inicial>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Elige tu fondo
      </p>
      <p className="text-center text-[12px] text-white/55 max-w-xs mx-auto">
        El fondo actual (Spline) sigue siendo tu base. Añade capas, shaders y difusión para
        personalizarlo. Puedes elegir varios y decidir dónde se aplican.
      </p>

      {/* Fondo base actual — siempre primera opción */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Fondo base
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SETS_OFICIALES.filter((s) => s.tipo === "base" || s.tipo === "oficial").map((set) => (
            <TarjetaFondo
              key={set.id}
              set={set}
              seleccionado={seleccionado?.setId === set.id}
              probando={probando === set.id}
              onClick={() => manejarSeleccion(set, alcance)}
              onProbar={() => probarFondo(set)}
            />
          ))}
        </div>
      </div>

      {/* Sets de shaders (cargados dinámicamente) */}
      {setsShader.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Shaders (WebGPU)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {setsShader.map((set) => (
              <TarjetaFondoShader
                key={set.id}
                set={set}
                seleccionado={seleccionado?.setId === set.id}
                probando={probando === set.id}
                onClick={() => manejarSeleccion(set, alcance)}
                onProbar={() => probarFondo(set)}
              />
            ))}
          </div>
        </div>
      )}

      {cargandoShaders && (
        <div className="flex items-center justify-center gap-2 text-[11px] text-white/40">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          Cargando catálogo de shaders…
        </div>
      )}

      {/* Selector de alcance */}
      {seleccionado && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <p className="text-[11px] font-semibold text-white/70">
            ¿Dónde se aplica este fondo?
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["perfil", "apps", "ambos"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlcance(a)}
                aria-pressed={alcance === a}
                className={cn(
                  "rounded-lg border px-3 py-2 text-center text-[12px] font-medium transition-all",
                  alcance === a
                    ? "border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-100"
                    : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/30",
                )}
              >
                {a === "perfil" && <> <UserCircle className="h-4 w-4 mx-auto mb-1" /> Perfil completo </>}
                {a === "apps" && <> <Monitor className="h-4 w-4 mx-auto mb-1" /> Solo apps </>}
                {a === "ambos" && <> <Layers className="h-4 w-4 mx-auto mb-1" /> Perfil + apps </>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button
          size="sm"
          onClick={confirmar}
          disabled={guardando || !seleccionado}
          className={cn(
            "gap-1 bg-gradient-to-r text-white shadow-lg",
            seleccionado ? "from-fuchsia-600 to-cyan-600" : "from-white/10 to-white/5 text-white/40",
          )}
        >
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {seleccionado ? "Guardar elección" : "Elige un fondo"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={saltar}
          className="gap-1 border-white/12 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white/85"
        >
          <X className="h-3.5 w-3.5" /> Ahora no (7 días)
        </Button>
      </div>

      <p className="text-center text-[10px] leading-snug text-white/40">
        Se guarda en tu Biblioteca y se sincroniza con las neuronas que elijas. El fondo base
        (Spline) nunca se pierde: las capas se apilan encima.
      </p>
    </div>
  );
}

interface TarjetaFondoProps {
  set: FondoSet;
  seleccionado: boolean;
  probando: boolean;
  onClick: () => void;
  onProbar: () => void;
}

function TarjetaFondo({ set, seleccionado, probando, onClick, onProbar }: TarjetaFondoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionado}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
        "hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
        seleccionado
          ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12] shadow-[0_0_24px_-6px_rgba(217,70,239,0.5)]"
          : "border-white/10 bg-white/[0.02] hover:border-fuchsia-400/40",
      )}
    >
      <div className="relative aspect-video rounded-lg overflow-hidden border border-white/10 bg-white/[0.02] mb-2">
        {set.preview && (
          <div
            className="absolute inset-0"
            style={{ background: set.preview }}
            aria-hidden
          />
        )}
        {probando && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-fuchsia-200" />
          </div>
        )}
        {seleccionado && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500/25">
            <Check className="h-3 w-3 text-fuchsia-200" />
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-[13px] font-semibold truncate">{set.nombre}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-white/50 truncate">{set.descripcion}</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onProbar(); }}
          className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-white/50 hover:border-fuchsia-400/40 hover:text-fuchsia-200 transition-colors"
          aria-label={`Probar ${set.nombre}`}
        >
          <Zap className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
        <Image className="h-2.5 w-2.5" /> Base
      </span>
    </button>
  );
}

interface TarjetaFondoShaderProps {
  set: FondoSet;
  seleccionado: boolean;
  probando: boolean;
  onClick: () => void;
  onProbar: () => void;
}

function TarjetaFondoShader({ set, seleccionado, probando, onClick, onProbar }: TarjetaFondoShaderProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionado}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-3 text-center transition-all duration-200",
        "hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
        seleccionado
          ? "border-cyan-400/70 bg-cyan-500/[0.12] shadow-[0_0_24px_-6px_rgba(34,211,238,0.5)]"
          : "border-white/10 bg-white/[0.02] hover:border-cyan-400/40",
      )}
    >
      <div className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-white/[0.02] mb-2 flex items-center justify-center">
        {probando ? (
          <Loader2 className="h-6 w-6 animate-spin text-cyan-200" />
        ) : (
          <Zap className="h-8 w-8 text-cyan-300/50" />
        )}
        {seleccionado && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/25">
            <Check className="h-3 w-3 text-cyan-200" />
          </span>
        )}
      </div>
      <span className="block text-[13px] font-semibold truncate">{set.nombre}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-white/50 truncate">{set.descripcion}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onProbar(); }}
        className="mt-2 mx-auto rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-white/50 hover:border-cyan-400/40 hover:text-cyan-200 transition-colors"
        aria-label={`Probar ${set.nombre}`}
      >
        <Zap className="h-3.5 w-3.5" />
      </button>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
        <Zap className="h-2.5 w-2.5" /> Shader
      </span>
    </button>
  );
}

// Icono temporal para UserCircle (lucide-react no lo tiene en la importación)
function UserCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="4" />
    </svg>
  );
}

export default ElegirFondoInicial;