import type { NeuronCapabilities } from "@/lib/neurons/neurons";

export function scoutModelsFallback(caps: NeuronCapabilities): { summary: string } {
  return { summary: `Tu equipo puede con mejores modelos. Revisa la pestaña Astraura.` };
}