import type { ActorMemoria, FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import { alcanceVisiblePara, detectarFuga, filtrarParaAlcance } from "@/lib/nucleo/alcance-memoria";
import { capsulasParaContexto, type ContextoCapsulas } from "@/lib/memorias/capsulas";
import { buscar } from "@/lib/memorias/memvid-cliente";

const TOPE_MS = 800;
const MAX_FRAG = 6;
const MAX_CHARS = 1500;
const K = 4;

export interface RecuerdoContexto extends ContextoCapsulas {
  actor: ActorMemoria;
  isCloud?: boolean;
}

export async function recordarDeCapsulas(
  contexto: RecuerdoContexto,
  consulta: string,
  opciones?: { fetch?: typeof fetch; base?: string; token?: string }
): Promise<string> {
  if (!consulta?.trim()) return "";
  try {
    const capsulas = capsulasParaContexto(contexto, contexto.actor);
    const permitidos = alcanceVisiblePara(contexto.actor);
    const fragmentos: string[] = [];
    const personales: FragmentoMemoria[] = [];
    let chars = 0;

    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TOPE_MS));

    for (const c of capsulas) {
      if (fragmentos.length >= MAX_FRAG) break;
      const sujeto = { tipo: c.sujeto.tipo as any, id: c.sujeto.id };
      try {
        const aciertos = await Promise.race([
          buscar(sujeto, consulta, K, new Date(), opciones ?? {}),
          timeout,
        ]);
        if (!aciertos) continue;
        const items = aciertos.map((a, i) => ({
          id: `${c.nombre}-${i}`,
          alcance: c.alcance,
          texto: a.texto,
          origen: a.uri ?? c.nombre,
          at: a.ts ?? Date.now(),
          titulo: a.titulo,
        }));
        const frags: FragmentoMemoria[] = items.map(({ id, alcance, texto, origen, at }) => ({ id, alcance, texto, origen, at }));
        const visibles = filtrarParaAlcance(frags, permitidos);
        for (let i = 0; i < visibles.length; i++) {
          if (fragmentos.length >= MAX_FRAG) break;
          const f = visibles[i];
          const item = items[i];
          const texto = item.titulo ? `${item.titulo}: ${f.texto}` : f.texto;
          if (chars + texto.length > MAX_CHARS) break;
          fragmentos.push(texto);
          chars += texto.length;
          if (f.alcance === "personal") personales.push(f);
        }
      } catch {
        continue;
      }
    }

    if (!fragmentos.length) return "";
    let bloque = `RECUERDOS (cápsulas Memvid):\n${fragmentos.map((f, i) => `${i + 1}. ${f}`).join("\n\n")}`;
    if (contexto.isCloud) {
      const fugas = detectarFuga(bloque, personales);
      if (fugas.length) return "";
    }
    return bloque;
  } catch {
    return "";
  }
}
