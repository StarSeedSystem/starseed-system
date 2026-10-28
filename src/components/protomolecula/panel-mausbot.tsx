"use client";

/**
 * Protomolécula · PANEL DEL ÁTOMO MAUSBOT (MBT1027L). La Chapa que aplica el átomo con las
 * piezas que ya existían: compone el diseño con los valores vivos de la molécula
 * (`construirDiseno`), lo guarda con origen «protomolecula» (`guardarDisenoMausbot`) y lo
 * fija a la personalidad activa con «Usar como mi Mausbot» (`guardarConfigMausbot`,
 * architecture/mausbot-astraura.md §6). La vista previa usa MausbotAvatar (el host ligero).
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Save, Sparkles } from "lucide-react";

import { useAurora } from "@/components/aurora/aurora-provider";
import { MausbotAvatar, type EstadoMausbot } from "@/components/mausbot/mausbot-avatar";
import { guardarConfigMausbot, leerConfigMausbot, type ParcheMausbot } from "@/lib/mausbot/config";
import { CUERPO_MAUSBOT_POR_DEFECTO, IDS_CUERPO_MAUSBOT, type CuerpoId } from "@/lib/mausbot/cuerpos";
import { DISENO_POR_DEFECTO, type DisenoMausbot } from "@/lib/mausbot/disenos";
import { valorActual } from "@/lib/protomolecula/parametros";
import {
  construirDiseno, guardarDisenoMausbot, gradienteDeId, MAUSBOT, PALETAS_GRADIENTE, type ControlesMausbot,
} from "@/lib/protomolecula/atomos/mausbot";
import type { CandidatoParametro, Molecula } from "@/lib/protomolecula/tipos";

export interface PanelMausbotProps {
  molecula: Molecula;
  candidatos: CandidatoParametro[];
}

/** Los controles del átomo con los valores de la molécula; lo raro cae al resto de saber. */
function controlesDe(m: Molecula, cs: CandidatoParametro[]): ControlesMausbot {
  const valorDe = (id: string) => {
    const c = cs.find((x) => x.ref.parametroId === id);
    return c ? valorActual(m.valores, c.ref, c.parametro) : undefined;
  };
  const cuerpo = valorDe("cuerpo");
  const gradiente = valorDe("gradiente");
  const tamano = valorDe("tamano");
  return {
    nombre: m.titulo.trim() || "Mausbot",
    cuerpo: typeof cuerpo === "string" && cuerpo !== "svg" && (IDS_CUERPO_MAUSBOT as readonly string[]).includes(cuerpo)
      ? (cuerpo as CuerpoId)
      : CUERPO_MAUSBOT_POR_DEFECTO,
    gradiente: typeof gradiente === "string" && gradienteDeId(gradiente) !== null ? gradiente : PALETAS_GRADIENTE[0].id,
    cara: { ojos: valorDe("ojos") !== false, boca: valorDe("boca") !== false, mirada: valorDe("mirada") !== false },
    tamano: typeof tamano === "number" && Number.isFinite(tamano) && tamano > 0 ? tamano : 1,
  };
}

/** La superficie del átomo «Mausbot»: vista previa desde los valores, guardar y usar. */
export function PanelMausbot({ molecula, candidatos }: PanelMausbotProps): ReactElement | null {
  const aurora = useAurora();
  const [estado, setEstado] = useState<EstadoMausbot>("idle");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pulso, setPulso] = useState(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atomoId = molecula.atomos.find(
    (a) => a.herramientaId === MAUSBOT.herramientaId && a.estado === "activo",
  )?.id;
  const cs = atomoId ? candidatos.filter((c) => c.ref.atomoId === atomoId) : [];

  useEffect(() => {
    if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setPulso((p) => p + 1), 1800);
    return () => window.clearInterval(t);
  }, []);

  if (cs.length === 0) return null;

  const compuesto = construirDiseno(controlesDe(molecula, cs));
  const diseno: DisenoMausbot = compuesto.ok ? compuesto.diseno : DISENO_POR_DEFECTO;

  const avisar = (texto: string, gesto: EstadoMausbot) => {
    setAviso(texto);
    setEstado(gesto);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado("idle"), 1800);
  };

  const guardar = () => {
    const r = guardarDisenoMausbot(controlesDe(molecula, cs));
    avisar(r.ok ? `Diseño guardado: «${compuesto.ok ? compuesto.diseno.nombre : molecula.titulo}». Aparece en Ajustes de cursor → Diseños propios.` : r.motivo, r.ok ? "proud" : "confused");
  };

  const usar = () => {
    if (!compuesto.ok) { avisar(compuesto.motivo, "confused"); return; }
    const r = guardarDisenoMausbot(controlesDe(molecula, cs));
    if (!r.ok) { avisar(r.motivo, "confused"); return; }
    const persona = (aurora?.activePersonality as { id?: string } | undefined)?.id;
    const parche: ParcheMausbot = { encendido: true, disenoPorDefecto: compuesto.diseno.id };
    if (persona) parche.porPersonalidad = { ...leerConfigMausbot().porPersonalidad, [persona]: compuesto.diseno.id };
    const ok = guardarConfigMausbot(parche);
    avisar(ok
      ? `El Mausbot «${compuesto.diseno.nombre}» quedó guardado${persona ? " y asignado a la personalidad activa" : " como diseño por defecto"}.`
      : `Se guardó el diseño, pero la configuración no se pudo escribir en este aparato: «${compuesto.diseno.nombre}».`, ok ? "proud" : "confused");
  };

  return (
    <section aria-label="Mausbot de Astraura" className="flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-start gap-3">
        <div className="size-36 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <MausbotAvatar diseno={diseno} estado={estado} mirada={miradaDe(pulso)} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h3 className="text-sm font-medium">Mausbot de Astraura</h3>
            <p className="text-xs text-muted-foreground">
              Compuesto con los valores de esta molécula: {compuesto.ok ? diseno.cuerpo : "valores inválidos"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={usar}
              title="Guarda el diseño y lo fija a la personalidad activa"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-sky-400/50 bg-sky-400/10 px-3 py-1.5 text-[11px] font-bold text-sky-200 transition-all hover:bg-sky-400/20"
            >
              <Sparkles className="size-3.5" /> Usar como mi Mausbot
            </button>
            <button
              type="button"
              onClick={guardar}
              title="Guarda el diseño con origen «protomolecula» sin cambiar de cursor"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-all hover:bg-white/10"
            >
              <Save className="size-3.5" /> Guardar diseño
            </button>
          </div>
          {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
        </div>
      </div>
    </section>
  );
}

/** La mirada recorre la cara con la esperanza de pulso de la propia vista previa. */
function miradaDe(pulso: number): { x: number; y: number } {
  return { x: Math.sin(pulso * 1.7) * 0.8, y: Math.cos(pulso * 0.9) * 0.45 };
}

export default PanelMausbot;
