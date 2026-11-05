import {
  createLibrary,
  defineAction,
  defineComponent,
  useTriggerAction,
} from "@openuidev/react-lang";
import { z } from "zod/v4";
import { GlassCard } from "@/components/ui/glass-card";

const accionStarseed = defineAction({
  name: "accion_starseed",
  description:
    "Emite el evento de una acción del OS con su id; nunca ejecuta nada, el OS confirma si está permitida.",
  params: z.object({
    idAccion: z.string().describe("Id de la acción del OS ya permitida para este perfil"),
  }),
});

const Tarjeta = defineComponent({
  name: "Tarjeta",
  description: "Tarjeta Trinity de cristal líquido para resaltar un dato o una idea con su título.",
  props: z.object({
    titulo: z.string().describe("Título visible de la tarjeta"),
    texto: z.string().optional().describe("Texto de apoyo debajo del título"),
  }),
  component: ({ props }) => (
    <GlassCard className="p-[1.3125rem]">
      <h4 className="text-[1.618rem] leading-snug font-medium">{props.titulo}</h4>
      {props.texto != null && (
        <p className="mt-[0.5rem] text-sm text-muted-foreground">{props.texto}</p>
      )}
    </GlassCard>
  ),
});

const Tabla = defineComponent({
  name: "Tabla",
  description: "Tabla de datos con encabezados y filas de texto.",
  props: z.object({
    titulo: z.string().describe("Título accesible de la tabla"),
    columnas: z.array(z.string()).describe("Encabezados, de izquierda a derecha"),
    filas: z.array(z.array(z.string())).describe("Filas, cada una con una celda por columna"),
  }),
  component: ({ props }) => (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-background/40 backdrop-blur-md">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {props.columnas.map((columna) => (
              <th key={columna} className="px-[0.8125rem] py-[0.5rem] text-left font-medium">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.filas.map((fila, i) => (
            <tr key={i} className="border-t border-white/5">
              {fila.map((celda, j) => (
                <td key={j} className="px-[0.8125rem] py-[0.5rem]">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});

const Pasos = defineComponent({
  name: "Pasos",
  description: "Lista ordenada de pasos; atraviesa la pantalla como una espiral áurea hacia el resultado.",
  props: z.object({
    pasos: z.array(
      z.object({
        titulo: z.string().describe("Texto del paso"),
        detalle: z.string().optional().describe("Detalle opcional del paso"),
      }),
    ),
  }),
  component: ({ props }) => (
    <ol className="space-y-[0.5rem]">
      {props.pasos.map((paso, i) => (
        <li key={i} className="flex gap-[0.8125rem]">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-medium">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium">{paso.titulo}</p>
            {paso.detalle != null && (
              <p className="text-sm text-muted-foreground">{paso.detalle}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  ),
});

const Comparacion = defineComponent({
  name: "Comparacion",
  description: "Dos opciones en rejilla áurea; la principal va en la columna mayor (1 : 1,618).",
  props: z.object({
    tituloPrincipal: z.string().describe("Título de la opción principal"),
    puntosPrincipal: z.array(z.string()).describe("Puntos a favor de la opción principal"),
    tituloAlternativa: z.string().describe("Título de la otra opción"),
    puntosAlternativa: z.array(z.string()).describe("Puntos de la otra opción"),
  }),
  component: ({ props }) => (
    <div className="grid gap-[2.125rem] md:grid-cols-[1fr_1.618fr]">
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">{props.tituloAlternativa}</h4>
        <ul className="mt-[0.5rem] list-disc pl-[1.25rem] text-sm">
          {props.puntosAlternativa.map((punto, i) => (
            <li key={i}>{punto}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-[1.3125rem]">
        <h4 className="text-base font-medium">{props.tituloPrincipal}</h4>
        <ul className="mt-[0.5rem] list-disc pl-[1.25rem] text-sm">
          {props.puntosPrincipal.map((punto, i) => (
            <li key={i}>{punto}</li>
          ))}
        </ul>
      </div>
    </div>
  ),
});

const LineaDeTiempo = defineComponent({
  name: "LineaDeTiempo",
  description: "Hitos en orden cronológico, cada uno con su fecha.",
  props: z.object({
    eventos: z.array(
      z.object({
        fecha: z.string().describe("Fecha o momento del hito"),
        titulo: z.string().describe("Nombre del hito"),
        detalle: z.string().optional().describe("Detalle opcional del hito"),
      }),
    ),
  }),
  component: ({ props }) => (
    <ol className="border-l border-white/10 pl-[1rem]">
      {props.eventos.map((evento, i) => (
        <li key={i} className="relative pb-[0.8125rem]">
          <span className="absolute top-[0.375rem] size-[0.625rem] -left-[1.3125rem] rounded-full bg-primary" />
          <p className="text-xs text-muted-foreground">{evento.fecha}</p>
          <p className="text-sm font-medium">{evento.titulo}</p>
          {evento.detalle != null && (
            <p className="text-sm text-muted-foreground">{evento.detalle}</p>
          )}
        </li>
      ))}
    </ol>
  ),
});

const Lista = defineComponent({
  name: "Lista",
  description: "Lista simple de elementos de texto.",
  props: z.object({
    elementos: z.array(z.string()).describe("Elementos, en el orden de lectura"),
  }),
  component: ({ props }) => (
    <ul className="list-disc pl-[1.25rem] text-sm">
      {props.elementos.map((elemento, i) => (
        <li key={i}>{elemento}</li>
      ))}
    </ul>
  ),
});

const Accion = defineComponent({
  name: "Accion",
  description:
    "Botón de acción del OS: al pulsarlo emite el evento accion_starseed con el id de la acción; nunca ejecuta nada por sí mismo.",
  props: z.object({
    etiqueta: z.string().describe("Texto visible del botón"),
    idAccion: z.string().describe("Id de la acción del OS ya permitida para este perfil"),
  }),
  component: ({ props }) => {
    const disparar = useTriggerAction();
    return (
      <button
        type="button"
        className="cursor-pointer rounded-full border border-white/15 bg-background/40 px-[1.3125rem] py-[0.5rem] text-sm font-medium backdrop-blur-md transition-colors hover:border-white/25 hover:bg-background/60"
        onClick={() =>
          disparar(`Acción ${props.etiqueta}`, undefined, {
            steps: [{ type: "custom_action", name: "accion_starseed", params: { idAccion: props.idAccion } }],
          })
        }
      >
        {props.etiqueta}
      </button>
    );
  },
});

const biblioteca = createLibrary({
  components: [Tarjeta, Tabla, Pasos, Comparacion, LineaDeTiempo, Lista, Accion],
  actions: [accionStarseed],
  root: "Tarjeta",
});

export function promptDeSistema(): string {
  return biblioteca.prompt({
    preamble:
      "Eres la interfaz viva de StarSeed OS. Responde en español usando solo la biblioteca StarSeed. Los botones de acción emiten eventos, no ejecutan nada: envía el id de una acción del OS ya permitida y quien escucha decidirá si la permite.",
  });
}

export {
  Tarjeta,
  Tabla,
  Pasos,
  Comparacion,
  LineaDeTiempo,
  Lista,
  Accion,
  accionStarseed,
  biblioteca,
};
export type BibliotecaStarSeed = typeof biblioteca;
