import { createLibrary, defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { z } from "zod/v4";

import { GlassCard } from "@/components/ui/glass-card";

export const NOMBRES_COMPONENTES = [
  "Tarjeta", "Tabla", "Pasos", "Comparacion", "LineaDeTiempo", "Lista", "Accion",
] as const;

export type NombreComponente = (typeof NOMBRES_COMPONENTES)[number];

export const ETIQUETAS_COMPONENTES: Record<NombreComponente, string> = {
  Tarjeta: "Tarjeta", Tabla: "Tabla", Pasos: "Pasos", Comparacion: "Comparación",
  LineaDeTiempo: "LíneaDeTiempo", Lista: "Lista", Accion: "Acción",
};
const P = "rounded-xl border border-white/10 bg-background/40 p-4 text-foreground backdrop-blur-lg";
const T = "text-sm font-semibold";
const M = "text-sm text-muted-foreground";
const Tarjeta = defineComponent({
  name: "Tarjeta", description: "Tarjeta Trinity para un dato, una idea o una respuesta breve.",
  props: z.object({ titulo: z.string(), descripcion: z.string().optional(), insignia: z.string().optional() }),
  component: ({ props }) => (
    <GlassCard className="p-4 text-foreground">
      <div className="flex items-start justify-between gap-3">
        <h3 className={T}>{props.titulo}</h3>
        {props.insignia ? <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{props.insignia}</span> : null}
      </div>
      {props.descripcion ? <p className={`mt-2 ${M}`}>{props.descripcion}</p> : null}
    </GlassCard>
  ),
});
const Tabla = defineComponent({
  name: "Tabla", description: "Tabla de columnas y filas.",
  props: z.object({ columnas: z.array(z.string()), filas: z.array(z.array(z.string())) }),
  component: ({ props }) => (
    <div className={P}>
      <table className="w-full border-collapse text-left text-sm">
        <thead><tr>{props.columnas.map((c) => <th key={c} className="border-b border-white/10 p-2 font-semibold">{c}</th>)}</tr></thead>
        <tbody>{props.filas.map((f, i) => <tr key={i}>{f.map((d, j) => <td key={j} className="border-b border-white/5 p-2">{d}</td>)}</tr>)}</tbody>
      </table>
    </div>
  ),
});
const Pasos = defineComponent({
  name: "Pasos", description: "Pasos ordenados con título y detalle.",
  props: z.object({ pasos: z.array(z.object({ titulo: z.string(), detalle: z.string().optional() })) }),
  component: ({ props }) => (
    <ol className={`${P} list-decimal space-y-2 pl-8`}>
      {props.pasos.map((p) => <li key={p.titulo}><span className={T}>{p.titulo}</span>{p.detalle ? <span className={M}> · {p.detalle}</span> : null}</li>)}
    </ol>
  ),
});
const Comparacion = defineComponent({
  name: "Comparacion", description: "Comparación entre dos opciones por criterio.",
  props: z.object({ izquierda: z.string(), derecha: z.string(), criterios: z.array(z.object({ nombre: z.string(), izquierda: z.string(), derecha: z.string() })) }),
  component: ({ props }) => (
    <div className={P}>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <span />
        <span className={T}>{props.izquierda}</span>
        <span className={T}>{props.derecha}</span>
        {props.criterios.map((c) => (
          <div key={c.nombre} className="contents">
            <span className={M}>{c.nombre}</span><span>{c.izquierda}</span><span>{c.derecha}</span>
          </div>
        ))}
      </div>
    </div>
  ),
});
const LineaDeTiempo = defineComponent({
  name: "LineaDeTiempo", description: "Línea de tiempo de eventos con fecha, título y detalle.",
  props: z.object({ eventos: z.array(z.object({ cuando: z.string(), titulo: z.string(), detalle: z.string().optional() })) }),
  component: ({ props }) => (
    <ol className={`${P} space-y-3 border-l-2 border-primary/40`}>
      {props.eventos.map((e) => <li key={`${e.cuando}-${e.titulo}`} className="pl-3"><span className="text-xs text-muted-foreground">{e.cuando}</span><p className={T}>{e.titulo}</p>{e.detalle ? <p className={M}>{e.detalle}</p> : null}</li>)}
    </ol>
  ),
});
const Lista = defineComponent({
  name: "Lista", description: "Lista breve de elementos.",
  props: z.object({ elementos: z.array(z.string()), titulo: z.string().optional() }),
  component: ({ props }) => (
    <div className={P}>
      {props.titulo ? <p className={T}>{props.titulo}</p> : null}
      <ul className="list-disc space-y-1 pl-5 text-sm">{props.elementos.map((e) => <li key={e}>{e}</li>)}</ul>
    </div>
  ),
});
const Accion = defineComponent({
  name: "Accion", description: "Botón que emite un evento con el id de la acción; nunca la ejecuta.",
  props: z.object({ id: z.string(), etiqueta: z.string(), variante: z.enum(["primaria", "secundaria", "sutil"]).optional() }),
  component: ({ props }) => {
    const triggerAction = useTriggerAction();
    const clase = props.variante === "sutil" ? "bg-transparent" : props.variante === "secundaria" ? "bg-white/10" : "bg-primary/15";
    return <button type="button" className={`cursor-pointer rounded-full border border-primary/40 px-4 py-2 text-sm font-medium transition hover:bg-primary/25 ${clase}`} onClick={() => triggerAction(props.etiqueta, undefined, { type: "accion", params: { id: props.id } })}>{props.etiqueta}</button>;
  },
});

export const biblioteca = createLibrary({
  id: "starseed-trinity",
  root: "Tarjeta",
  components: [Tarjeta, Tabla, Pasos, Comparacion, LineaDeTiempo, Lista, Accion],
});

export function promptDeSistema(): string {
  const nombres = NOMBRES_COMPONENTES.map((n) => ETIQUETAS_COMPONENTES[n]).join(" · ");
  return biblioteca.prompt({
    preamble: `Eres la interfaz viva de StarSeed OS. Responde con la biblioteca Trinity: ${nombres}. Elige solo los componentes que aporten datos, pasos o comparaciones; si no, responde en texto.`,
    additionalRules: [
      "Textos de la interfaz en español, con acentos.",
      "Accion solo emite un evento con su id: nunca prometas que la acción ya se ejecutó.",
      "No inventes componentes fuera de esta biblioteca.",
    ],
  });
}
