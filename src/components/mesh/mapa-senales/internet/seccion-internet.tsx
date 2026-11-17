"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { AjustesAudiencia, Audiencia, EstadoConexion, FuenteLimitada } from "@/lib/malla/internet/tipos";
import { useAjustesInternet } from "@/lib/malla/internet/use-ajustes-internet";
import { InterruptorModoBanco } from "./interruptor-modo-banco";
import { InterruptorModoMesh } from "./interruptor-modo-mesh";
import { RacionBanco } from "./racion-banco";

type Props = {
  textos: typeof TextosInternet;
  extra: {
    desde: string;
    hasta: string;
    limite: string;
    compartirConOtros: string;
    declararDePago: string;
    declararNoDePago: string;
  };
  clasificacion: { estado: EstadoConexion; fuente: FuenteLimitada };
};

const AUDIENCIAS: Audiencia[] = ["mi-cuenta", "entidad", "publico"];

const TEXTO_ESTADO: Record<EstadoConexion, "conexionLimitada" | "conexionNoLimitada" | "conexionDesconocida"> = {
  limitada: "conexionLimitada",
  "no-limitada": "conexionNoLimitada",
  desconocida: "conexionDesconocida",
};

const TEXTO_FUENTE: Record<FuenteLimitada, "fuenteDeclarada" | "fuenteNativa" | "fuenteNavegador" | null> = {
  declarada: "fuenteDeclarada",
  nativa: "fuenteNativa",
  navegador: "fuenteNavegador",
  ninguna: null,
};

const CLASE_FILA = "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25";
const CLASE_BOTON = "flex-1 cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] font-medium text-white/85 transition-colors duration-200 hover:border-emerald-400/25";

export function SeccionInternet({ textos, extra, clasificacion }: Props) {
  const { ajustes, cambiar, restanteHoyMb } = useAjustesInternet();
  const idGeneral = useId();

  const cambiarAudiencia = (audiencia: Audiencia, valor: AjustesAudiencia) => {
    cambiar({ porAudiencia: { ...ajustes.porAudiencia, [audiencia]: valor } });
  };

  const claveFuente = TEXTO_FUENTE[clasificacion.fuente];

  return (
    <section aria-label={extra.compartirConOtros} data-testid="seccion-internet" className="space-y-2.5">
      <p className="text-[11px] leading-snug text-white/70">
        <span className="font-medium text-white/90">{textos[TEXTO_ESTADO[clasificacion.estado]]}</span>
        {claveFuente && <span className="text-white/45"> · {textos[claveFuente]}</span>}
      </p>

      <div role="group" aria-label={textos.conexionLimitada} className="flex gap-2">
        <button
          type="button"
          onClick={() => cambiar({ declaraLimitada: true })}
          className={cn(CLASE_BOTON, ajustes.declaraLimitada === true && "border-emerald-400/40 bg-emerald-500/10 text-emerald-100")}
        >
          {extra.declararDePago}
        </button>
        <button
          type="button"
          onClick={() => cambiar({ declaraLimitada: false })}
          className={cn(CLASE_BOTON, ajustes.declaraLimitada === false && "border-emerald-400/40 bg-emerald-500/10 text-emerald-100")}
        >
          {extra.declararNoDePago}
        </button>
      </div>

      <InterruptorModoBanco
        activo={ajustes.banco.activo}
        onCambiar={(activo) => cambiar({ banco: { ...ajustes.banco, activo } })}
        textos={textos}
        restanteHoyMb={restanteHoyMb}
      />

      {ajustes.banco.activo && (
        <RacionBanco
          banco={ajustes.banco}
          onCambiar={(banco) => cambiar({ banco })}
          textos={textos}
          extra={extra}
        />
      )}

      <div className="space-y-1.5">
        {AUDIENCIAS.map((audiencia) => (
          <InterruptorModoMesh
            key={audiencia}
            audiencia={audiencia}
            valor={ajustes.porAudiencia[audiencia]}
            onCambiar={(valor) => cambiarAudiencia(audiencia, valor)}
            textos={textos}
          />
        ))}
      </div>

      <label htmlFor={idGeneral} className={CLASE_FILA}>
        <span className="text-[11px] font-medium text-white/90">{extra.compartirConOtros}</span>
        <Switch
          id={idGeneral}
          checked={ajustes.compartirConOtros}
          onCheckedChange={(v) => cambiar({ compartirConOtros: v })}
        />
      </label>
    </section>
  );
}
