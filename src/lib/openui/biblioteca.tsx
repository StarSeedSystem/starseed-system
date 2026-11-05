import { createLibrary, defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { GlassCard } from "@/components/ui/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
const tono = z.enum(["neutro", "informacion", "exito", "aviso"]).optional();
export const Tarjeta = defineComponent({
  name: "Tarjeta",
  description: "Tarjeta Trinity para un dato o una idea breve.",
  props: z.object({ titulo: z.string(), texto: z.string(), etiqueta: z.string().optional(), tono }),
  component: ({ props }) => (
    <GlassCard className="p-5" intensity="medium">
      {props.etiqueta ? <span className="text-xs uppercase tracking-wide text-muted-foreground">{props.etiqueta}</span> : null}
      <h3 className="mt-1 font-headline text-lg text-foreground">{props.titulo}</h3><p className="mt-2 text-sm text-muted-foreground">{props.texto}</p>
    </GlassCard>
  ),
});

export const Tabla = defineComponent({
  name: "Tabla",
  description: "Tabla Trinity de columnas y filas de texto.",
  props: z.object({ titulo: z.string().optional(), columnas: z.array(z.string()).min(1), filas: z.array(z.array(z.string())) }),
  component: ({ props }) => (
    <GlassCard className="p-4" intensity="low">
      {props.titulo ? <h3 className="mb-3 font-headline text-base text-foreground">{props.titulo}</h3> : null}
      <Table>
        <TableHeader><TableRow>{props.columnas.map((columna, i) => <TableHead key={i}>{columna}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{props.filas.map((fila, i) => <TableRow key={i}>{fila.map((celda, j) => <TableCell key={j}>{celda}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </GlassCard>
  ),
});

export const Pasos = defineComponent({
  name: "Pasos",
  description: "Lista ordenada de pasos con detalle opcional.",
  props: z.object({ pasos: z.array(z.object({ titulo: z.string(), detalle: z.string().optional() })).min(1) }),
  component: ({ props }) => (
    <GlassCard className="p-5" intensity="low">
      <ol className="grid gap-3">
        {props.pasos.map((paso, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">{i + 1}</span>
            <span><strong className="text-foreground">{paso.titulo}</strong>{paso.detalle ? <span className="block text-muted-foreground">{paso.detalle}</span> : null}</span>
          </li>
        ))}
      </ol>
    </GlassCard>
  ),
});

export const Comparacion = defineComponent({
  name: "Comparacion",
  description: "Dos opciones frente a frente con sus puntos.",
  props: z.object({ izquierda: z.object({ titulo: z.string(), puntos: z.array(z.string()) }), derecha: z.object({ titulo: z.string(), puntos: z.array(z.string()) }) }),
  component: ({ props }) => (
    <GlassCard className="grid gap-4 p-5 sm:grid-cols-2" intensity="low">
      {[props.izquierda, props.derecha].map((lado, i) => (
        <div key={i} className="rounded-xl border border-white/10 p-4">
          <h3 className="font-headline text-base text-foreground">{lado.titulo}</h3>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{lado.puntos.map((punto, j) => <li key={j}>· {punto}</li>)}</ul>
        </div>
      ))}
    </GlassCard>
  ),
});

export const LineaDeTiempo = defineComponent({
  name: "LineaDeTiempo",
  description: "Recorrido cronológico de eventos.",
  props: z.object({ eventos: z.array(z.object({ fecha: z.string(), titulo: z.string(), detalle: z.string().optional() })).min(1) }),
  component: ({ props }) => (
    <GlassCard className="p-5" intensity="low">
      <ol className="grid gap-4 border-l border-primary/30 pl-4">
        {props.eventos.map((evento, i) => (
          <li key={i} className="relative text-sm">
            <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" aria-hidden="true" />
            <time className="text-xs uppercase tracking-wide text-muted-foreground">{evento.fecha}</time>
            <strong className="block text-foreground">{evento.titulo}</strong>
            {evento.detalle ? <span className="block text-muted-foreground">{evento.detalle}</span> : null}
          </li>
        ))}
      </ol>
    </GlassCard>
  ),
});

export const Lista = defineComponent({
  name: "Lista",
  description: "Lista simple de elementos, ordenada si se pide.",
  props: z.object({ elementos: z.array(z.string()).min(1), ordenada: z.boolean().optional() }),
  component: ({ props }) => (
    <GlassCard className="p-5" intensity="low">
      {props.ordenada ? <ol className="grid list-inside gap-1 text-sm text-foreground">{props.elementos.map((elemento, i) => <li key={i}>{elemento}</li>)}</ol> : <ul className="grid list-inside gap-1 text-sm text-foreground">{props.elementos.map((elemento, i) => <li key={i}>{elemento}</li>)}</ul>}
    </GlassCard>
  ),
});

export const Accion = defineComponent({
  name: "Accion",
  description: "Botón que emite un evento con el id de una acción; nunca ejecuta nada por sí mismo.",
  props: z.object({ etiqueta: z.string(), id: z.string(), tono }),
  component: ({ props }) => {
    const triggerAction = useTriggerAction();
    return <button type="button" onClick={() => triggerAction(props.etiqueta, undefined, { type: "starseed.accion", params: { id: props.id } })} className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{props.etiqueta}</button>;
  },
});

export const biblioteca = createLibrary({
  id: "starseed-trinity",
  root: "Tarjeta",
  components: [Tarjeta, Tabla, Pasos, Comparacion, LineaDeTiempo, Lista, Accion],
});
const PREAMBULO = "Eres el intérprete de interfaz viva de StarSeed OS. Respondes con OpenUI Lang usando solo la biblioteca Trinity.";
const REGLAS = ["Escribe una interfaz breve y legible; los textos van en español con acentos.", "Accion solo emite un evento con su id: no prometas que la acción ya se ejecutó.", "El centro es sagrado: una tarjeta o un dato protagonista, sin ruido decorativo."];
export function promptDeSistema(): string {
  return biblioteca.prompt({ preamble: PREAMBULO, additionalRules: REGLAS });
}
