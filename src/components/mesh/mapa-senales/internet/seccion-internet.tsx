"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { useAjustesInternet } from "@/lib/malla/internet/use-ajustes-internet";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { Audiencia, EstadoConexion, FuenteLimitada } from "@/lib/malla/internet/tipos";
import { InterruptorModoBanco } from "./interruptor-modo-banco";
import { RacionBanco } from "./racion-banco";
import { InterruptorModoMesh } from "./interruptor-modo-mesh";
import { leerConexion, suscribirConexion } from "@/lib/malla/internet/lector-conexion";
import { clasificarConexion } from "@/lib/malla/internet/conexion-limitada";
import { leerNegativa, guardarNegativa } from "@/lib/malla/internet/almacen-negativa-sugerencia";
import { debeSugerir, registrarNegativa } from "@/lib/malla/internet/sugerencia-banco";
import { SugerenciaModoBanco } from "./sugerencia-modo-banco";

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

const TEXTO_ESTADO: Record<
  EstadoConexion,
  "conexionLimitada" | "conexionNoLimitada" | "conexionDesconocida"
> = {
  limitada: "conexionLimitada",
  "no-limitada": "conexionNoLimitada",
  desconocida: "conexionDesconocida",
};

const TEXTO_FUENTE: Record<
  Exclude<FuenteLimitada, "ninguna">,
  "fuenteDeclarada" | "fuenteNativa" | "fuenteNavegador"
> = {
  declarada: "fuenteDeclarada",
  nativa: "fuenteNativa",
  navegador: "fuenteNavegador",
};

export function SeccionInternet({ textos, extra, clasificacion: clasificacionProp }: Props) {
  const { ajustes, cambiar, restanteHoyMb } = useAjustesInternet();
  const [clasificacion, setClasificacion] = React.useState(clasificacionProp);
  const [sugerenciaVisible, setSugerenciaVisible] = React.useState(false);
  const [negativa, setNegativa] = React.useState(() => {
    if (typeof window !== "undefined") {
      const almacen = { getItem: (clave: string) => localStorage.getItem(clave), setItem: (clave: string, valor: string) => localStorage.setItem(clave, valor) };
      return leerNegativa(almacen);
    }
    return null;
  });

  React.useEffect(() => {
    const entorno = {} as { navigator?: { connection?: any } | null; nativa?: { medida?: () => boolean | null } | null };
    const clasif = clasificarConexion(leerConexion(entorno));
    setClasificacion(clasif);

    const cleanup = suscribirConexion(entorno, () => {
      const nuevaClasif = clasificarConexion(leerConexion(entorno));
      setClasificacion(nuevaClasif);
    });

    return cleanup;
  }, []);

  React.useEffect(() => {
    const entrada = {
      estado: clasificacion.estado,
      fuente: clasificacion.fuente,
      bancoActivo: ajustes.banco.activo,
      compartirConOtros: ajustes.compartirConOtros,
      negativa,
      ahora: Date.now(),
      clave: "starseed.malla.internet.v1",
    };
    const resultado = debeSugerir(entrada);
    setSugerenciaVisible(resultado.sugerir);
  }, [clasificacion, ajustes.banco.activo, ajustes.compartirConOtros, negativa]);

  const textoEstado = textos[TEXTO_ESTADO[clasificacion.estado]];
  const textoFuente =
    clasificacion.fuente === "ninguna" ? null : textos[TEXTO_FUENTE[clasificacion.fuente]];

  const onActivar = () => {
    cambiar({ banco: { ...ajustes.banco, activo: true } });
    setSugerenciaVisible(false);
  };

  const onAhoraNo = () => {
    const nueva = registrarNegativa(Date.now(), "starseed.malla.internet.v1");
    setNegativa(nueva);
    if (typeof window !== "undefined") {
      const almacen = { getItem: (clave: string) => localStorage.getItem(clave), setItem: (clave: string, valor: string) => localStorage.setItem(clave, valor) };
      guardarNegativa(almacen, nueva);
    }
    setSugerenciaVisible(false);
  };

  return (
    <section aria-label="Internet compartido" className="space-y-3">
      <p role="status" aria-live="polite" className="text-[11px] text-white/80">
        <span>{textoEstado}</span>
        {textoFuente !== null && (
          <>
            <span aria-hidden="true"> · </span>
            <span className="text-white/50">{textoFuente}</span>
          </>
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cambiar({ declaraLimitada: true })}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/90 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25 hover:bg-emerald-500/10"
        >
          {extra.declararDePago}
        </button>
        <button
          type="button"
          onClick={() => cambiar({ declaraLimitada: false })}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/90 transition-colors duration-200 cursor-pointer hover:border-emvtered-400/25 hover:bg-emerald-500/10"
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
      {AUDIENCIAS.map((audiencia) => (
        <InterruptorModoMesh
          key={audiencia}
          audiencia={audiencia}
          valor={ajustes.porAudiencia[audiencia]}
          onCambiar={(valor) =>
            cambiar({ porAudiencia: { ...ajustes.porAudiencia, [audiencia]: valor } })
          }
          textos={textos}
        />
      ))}
      <label
        htmlFor="compartir-con-otros"
        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25"
      >
        <span className="text-[11px] font-medium text-white/90">{extra.compartirConOtros}</span>
        <Switch
          id="compartir-con-otros"
          checked={ajustes.compartirConOtros}
          onCheckedChange={(compartirConOtros) => cambiar({ compartirConOtros })}
        />
      </label>
      <SugerenciaModoBanco
        visible={sugerenciaVisible}
        onActivar={onActivar}
        onAhoraNo={onAhoraNo}
        textos={textos}
      />
    </section>
  );
}
