"use client";
/** Panel «Contenido vivo» (CVV1028, tarea H): tres niveles, comparación local/externo y confirmación. */
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { CandidatoRuta, ContextoVivo } from "@/lib/contenido-vivo/rutas";
import { compararRutas, elegirRuta, servicioConectado } from "@/lib/contenido-vivo/rutas";
import type { NivelVivo, TareaViva } from "@/lib/contenido-vivo/tipos";
export interface SeleccionContenidoVivo {
  niveles: NivelVivo[]; elegidas: { tarea: TareaViva; candidato: CandidatoRuta }[]; totalCreditos: number;
}
interface PanelContenidoVivoProps {
  contexto: ContextoVivo; onConfirmar: (seleccion: SeleccionContenidoVivo) => void;
}
const NIVELES: { nivel: NivelVivo; titulo: string; descripcion: string; tareas: TareaViva[] }[] = [
  { nivel: 1, titulo: "3D vivo", descripcion: "Una pieza con la que se juega, sin atrapar el scroll.", tareas: ["escena-3d"] },
  { nivel: 2, titulo: "Película e imágenes", descripcion: "Un solo movimiento de cámara, fotos del mismo mundo y bucles.", tareas: ["fotograma-clave", "foto", "clip-pelicula", "foto-viva"] },
  { nivel: 3, titulo: "Gráficos vivos", descripcion: "Diagramas dibujados en código que se mueven en bucle.", tareas: ["grafico-vivo"] },
];
const ETIQUETAS: Record<TareaViva, string> = {
  "escena-3d": "Escena 3D", "fotograma-clave": "Fotograma clave", foto: "Foto", "clip-pelicula": "Clip de película",
  "foto-viva": "Foto viva", "grafico-vivo": "Gráfico vivo", "revision-texto": "Revisión de texto", comprobacion: "Comprobación",
};
function elegidasIniciales(contexto: ContextoVivo): Record<string, CandidatoRuta> {
  const salida: Record<string, CandidatoRuta> = {};
  for (const nivel of NIVELES) for (const tarea of nivel.tareas) {
    const candidato = elegirRuta(tarea, contexto); if (candidato) salida[tarea] = candidato;
  }
  return salida;
}
export function PanelContenidoVivo({ contexto, onConfirmar }: PanelContenidoVivoProps) {
  const [activos, setActivos] = useState<Record<NivelVivo, boolean>>({ 1: true, 2: true, 3: true });
  const [elegidas, setElegidas] = useState(() => elegidasIniciales(contexto));
  const [confirmando, setConfirmando] = useState(false);
  const activosLista = NIVELES.filter((n) => activos[n.nivel]);
  const tareas = activosLista.flatMap((n) => n.tareas);
  const totalCreditos = tareas.reduce((suma, tarea) => suma + (elegidas[tarea]?.ruta.creditosPorUnidad ?? 0), 0);
  const seleccion = (): SeleccionContenidoVivo => ({
    niveles: activosLista.map((n) => n.nivel),
    elegidas: tareas.flatMap((tarea) => (elegidas[tarea] ? [{ tarea, candidato: elegidas[tarea] }] : [])),
    totalCreditos,
  });
  const generar = () => {
    if (totalCreditos > 0) { setConfirmando(true); return; }
    onConfirmar(seleccion());
  };
  return (
    <section aria-label="Contenido vivo" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Contenido vivo</h2>
        <p className="text-sm text-muted-foreground">Tres niveles. Local primero; externo solo cuando gana con claridad.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {NIVELES.map(({ nivel, titulo, descripcion, tareas: tareasNivel }) => (
          <article key={nivel} className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{titulo}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>
              </div>
              <Switch aria-label={`Activar ${titulo}`} checked={activos[nivel]} onCheckedChange={(valor) => setActivos((previos) => ({ ...previos, [nivel]: valor }))} />
            </div>
            {activos[nivel]
              ? tareasNivel.map((tarea) => <TablaTarea key={tarea} tarea={tarea} contexto={contexto} elegida={elegidas[tarea]} onElegir={(candidato) => setElegidas((previas) => ({ ...previas, [tarea]: candidato }))} />)
              : <p className="mt-3 text-xs text-muted-foreground">Apagado: este nivel no se genera.</p>}
          </article>
        ))}
      </div>
      <footer className="flex flex-col items-center gap-3 border-t border-border/60 pt-4 sm:flex-row sm:justify-between">
        <p className="text-sm">Cotización total: <strong>{totalCreditos} créditos</strong></p>
        <button type="button" onClick={generar} disabled={tareas.length === 0} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
          <Sparkles className="h-4 w-4" /> Generar
        </button>
      </footer>
      {confirmando && (
        <div role="alertdialog" aria-modal="true" aria-label="Confirmar generación" className="mx-auto max-w-md rounded-2xl border border-border bg-card p-4 text-center shadow-lg">
          <p className="text-sm">Total: <strong>{totalCreditos} créditos</strong>. ¿Generar el contenido vivo?</p>
          <div className="mt-3 flex justify-center gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
            <button type="button" onClick={() => { setConfirmando(false); onConfirmar(seleccion()); }} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Sí, generar</button>
          </div>
        </div>
      )}
    </section>
  );
}
function TablaTarea({ tarea, contexto, elegida, onElegir }: { tarea: TareaViva; contexto: ContextoVivo; elegida?: CandidatoRuta; onElegir: (c: CandidatoRuta) => void }) {
  const candidatos = compararRutas(tarea, contexto);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ETIQUETAS[tarea]}</h4>
        <select aria-label={`Ruta para ${ETIQUETAS[tarea]}`} className="cursor-pointer rounded-md border border-border bg-background px-2 py-1 text-xs" value={elegida?.ruta.id ?? ""} onChange={(evento) => { const candidato = candidatos.find((c) => c.ruta.id === evento.target.value); if (candidato) onElegir(candidato); }}>
          <option value="" disabled>Sin ruta disponible</option>
          {candidatos.map((c) => <option key={c.ruta.id} value={c.ruta.id} disabled={!c.disponible}>{c.ruta.nombre}</option>)}
        </select>
      </div>
      <table className="mt-2 w-full text-left text-xs">
        <thead><tr className="text-muted-foreground"><th className="py-1">Ruta</th><th className="py-1">Tipo</th><th className="py-1">Créditos</th><th className="py-1">Por qué</th></tr></thead>
        <tbody>
          {candidatos.map((c) => (
            <tr key={c.ruta.id} className={`border-t border-border/40 align-top ${c.ruta.id === elegida?.ruta.id ? "bg-primary/10" : ""}`}>
              <td className="py-1.5 pr-2 font-medium">
                <span className="inline-flex items-center gap-1">{c.ruta.nombre}{c.ruta.id === elegida?.ruta.id && <Check aria-label="Elegida" className="h-3.5 w-3.5 text-primary" />}</span>
                {c.ruta.tipo === "externo" && !servicioConectado(c.ruta, contexto) && c.ruta.enlaceConectar && (
                  <a href={c.ruta.enlaceConectar} target="_blank" rel="noreferrer" className="ml-1 inline-block cursor-pointer text-primary underline-offset-2 hover:underline">Conectar</a>
                )}
              </td>
              <td className="py-1.5 pr-2">{c.ruta.tipo === "local" ? "Local" : "Externo"}</td>
              <td className="py-1.5 pr-2">{c.ruta.creditosPorUnidad}</td>
              <td className="py-1.5 text-muted-foreground">{c.razon}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
