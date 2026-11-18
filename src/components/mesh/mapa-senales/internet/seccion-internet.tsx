"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { useAjustesInternet } from "@/lib/malla/internet/use-ajustes-internet";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { Audiencia, EstadoConexion, FuenteLimitada } from "@/lib/malla/internet/tipos";
import { InterruptorModoBanco } from "./interruptor-modo-banco";
import { RacionBanco } from "./racion-banco";
import { InterruptorModoMesh } from "./interruptor-modo-mesh";
import { SugerenciaModoBanco } from "./sugerencia-modo-banco";
import { leerConexion, suscribirConexion } from "@/lib/malla/internet/lector-conexion";
import { clasificarConexion } from "@/lib/malla/internet/conexion-limitada";
import { debeSugerir, registrarNegativa } from "@/lib/malla/internet/sugerencia-banco";

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
  clasificacion?: { estado: EstadoConexion; fuente: FuenteLimitada };
};

const CLAVE_SUGERENCIA = "starseed.malla.internet.sugerencia.v1";
const CLAVE_CONEXION = "starseed.malla.internet.v1";

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

const CLASIFICACION_INICIAL: { estado: EstadoConexion; fuente: FuenteLimitada } = {
  estado: "desconocida",
  fuente: "ninguna",
};

function leerDeclarada(): boolean | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_CONEXION);
    if (!crudo) return null;
    const parsed = JSON.parse(crudo) as { declaraLimitada?: boolean | null };
    return parsed.declaraLimitada ?? null;
  } catch {
    return null;
  }
}

function leerNegativa(): { en: number; conexion: string } | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_SUGERENCIA);
    if (!crudo) return null;
    return JSON.parse(crudo) as { en: number; conexion: string };
  } catch {
    return null;
  }
}

function escribirNegativa(negativa: { en: number; conexion: string }): void {
  try {
    window.localStorage.setItem(CLAVE_SUGERENCIA, JSON.stringify(negativa));
  } catch {
    // noop
  }
}

function claveConexionActual(tipo?: string, saveData?: boolean): string {
  const partes: string[] = [];
  if (tipo) partes.push(tipo);
  if (saveData) partes.push("saveData");
  return partes.join("|") || "desconocida";
}

export function SeccionInternet({ textos, extra, clasificacion: clasificacionProp }: Props) {
  const { ajustes, cambiar, restanteHoyMb } = useAjustesInternet();
  const [clasificacionInterna, setClasificacionInterna] = React.useState<{ estado: EstadoConexion; fuente: FuenteLimitada }>(CLASIFICACION_INICIAL);
  const [sugerir, setSugerir] = React.useState(false);

  const usaCalculoInterno = !clasificacionProp;

  React.useEffect(() => {
    if (!usaCalculoInterno) return;
    const actualizar = () => {
      const declarada = leerDeclarada();
      const conexion = leerConexion({ navigator: { connection: (window.navigator as any).connection } });
      const resultado = clasificarConexion({
        declarada,
        nativaMedida: conexion.nativaMedida,
        tipo: conexion.tipo,
        saveData: conexion.saveData,
        effectiveType: conexion.effectiveType,
      });
      setClasificacionInterna({ estado: resultado.estado, fuente: resultado.fuente });
    };

    actualizar();
    const desuscribir = suscribirConexion({ navigator: { connection: (window.navigator as any).connection } }, actualizar);
    return desuscribir;
  }, [usaCalculoInterno]);

  const clasificacion = clasificacionProp ?? clasificacionInterna;

  React.useEffect(() => {
    if (!usaCalculoInterno) return;
    const declarada = ajustes.declaraLimitada;
    if (declarada === false) {
      setSugerir(false);
      return;
    }

    const clave = claveConexionActual(
      (window.navigator as any).connection?.type,
      (window.navigator as any).connection?.saveData
    );

    const resultado = debeSugerir({
      estado: clasificacion.estado,
      fuente: clasificacion.fuente,
      bancoActivo: ajustes.banco.activo,
      compartirConOtros: ajustes.compartirConOtros,
      negativa: leerNegativa(),
      ahora: Date.now(),
      clave,
    });
    setSugerir(resultado.sugerir);
  }, [clasificacion, ajustes.banco.activo, ajustes.compartirConOtros, ajustes.declaraLimitada, usaCalculoInterno]);

  const onActivar = () => {
    cambiar({ banco: { ...ajustes.banco, activo: true } });
  };

  const onAhoraNo = () => {
    const clave = claveConexionActual(
      (window.navigator as any).connection?.type,
      (window.navigator as any).connection?.saveData
    );
    const negativa = registrarNegativa(Date.now(), clave);
    if (negativa) escribirNegativa(negativa);
    setSugerir(false);
  };

  const textoEstado = textos[TEXTO_ESTADO[clasificacion.estado]];
  const textoFuente =
    clasificacion.fuente === "ninguna" ? null : textos[TEXTO_FUENTE[clasificacion.fuente]];

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
      {sugerir && (
        <SugerenciaModoBanco
          visible={true}
          onActivar={onActivar}
          onAhoraNo={onAhoraNo}
          textos={{
            sugerirTitulo: textos.sugerirTitulo,
            sugerirCuerpo: textos.sugerirCuerpo,
            sugerirActivar: textos.sugerirActivar,
            sugerirAhoraNo: textos.sugerirAhoraNo,
          }}
        />
      )}
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
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/90 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25 hover:bg-emerald-500/10"
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
    </section>
  );
}
