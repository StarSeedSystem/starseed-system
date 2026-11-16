import type { Audiencia, AjustesAudiencia, TextosInternet } from "@/lib/malla/internet/tipos";

export interface InterruptorModoMeshProps {
  audiencia: Audiencia;
  valor: AjustesAudiencia;
  onCambiar: (v: AjustesAudiencia) => void;
  textos: Pick<TextosInternet, "meshTitulo" | "meshAyuda" | "meshSinLimite" | "meshConLimite" | "audMiCuenta" | "audEntidad" | "audPublico" | "mb" | "gb">;
}

export function InterruptorModoMesh({ audiencia, valor, onCambiar, textos }: InterruptorModoMeshProps) {
  const audLabel = audiencia === "mi-cuenta" ? textos.audMiCuenta : audiencia === "entidad" ? textos.audEntidad : textos.audPublico;
  return (
    <section aria-label="Interruptor modo mesh" className="p-2 rounded-2xl border border-sky-400/12 bg-sky-500/[0.05]">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="hidden"
            checked={valor.mesh}
            onChange={(e) => onCambiar({ ...valor, mesh: e.target.checked })}
          />
          <span className="shrink-0 h-4 w-4 rounded-full border border-sky-400 bg-sky-500/[0.3] cursor-pointer"
                aria-label={audLabel}
                role="switch"
                aria-checked={valor.mesh}
          />
          <span className="font-semibold text-white">{audLabel}</span>
        </label>
        <span className="text-xs text-sky-200" title={textos.meshAyuda}>{textos.meshTitulo}</span>
      </div>
      {valor.mesh && (
        <div role="radiogroup" aria-label={textos.meshTitulo} className="mt-2 space-y-1">
          <label className="flex items-center gap-2">
            <input type="radio" name={audiencia} value="sin-limite" checked={valor.limiteMeshMb === null} onChange={() => onCambiar({ ...valor, limiteMeshMb: null })} />
            <span className="text-sky-200">{textos.meshSinLimite}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={audiencia} value="con-limite" checked={valor.limiteMeshMb !== null} onChange={() => onCambiar({ ...valor, limiteMeshMb: 1024 })} />
            <span className="text-sky-200">{valor.limiteMeshMb !== null ? textos.meshConLimite(valor.limiteMeshMb) : textos.meshConLimite(0)}</span>
          </label>
        </div>
      )}
    </section>
  );
}
