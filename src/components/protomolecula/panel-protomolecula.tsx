"use client";

/**
 * Protomolécula · PANEL. `PanelProtomolecula` pinta un controlador ya abierto: título y ámbito, estado
 * de guardado, «Añadir herramienta», pendientes de confirmar, dictado, parámetros e historial con
 * Deshacer y Rehacer. `PanelProtomoleculaAutonomo` lo monta en cualquier superficie: abre la sesión con
 * `useMolecula` (que crea, registra y guarda el controlador). `compacto` es la versión del widget del
 * dashboard: sin título, dictado ni historial, pero con «Añadir herramienta», parámetros y pendientes
 * (un widget vacío sin forma de llenarlo sería un callejón sin salida).
 */
import { useEffect, useState } from "react";

import type { Controlador } from "@/lib/protomolecula/controlador";
import { AVISO_SALUD } from "@/lib/protomolecula/permisos";
import { candidatosDe, obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import type { EstadoGuardado } from "@/lib/protomolecula/sesion-molecula";
import type { Ambito, Autor, Operacion, ValorParametro } from "@/lib/protomolecula/tipos";
import type { EnlaceSesion } from "@/lib/protomolecula/transporte-protomolecula";
import { registrarAtomosPropios } from "@/lib/protomolecula/atomos";

import { BarraDictado } from "./barra-dictado";
import { PanelActividad, hayLecturaSalud } from "./panel-actividad";
import { AnadirHerramienta, ListaPendientes } from "./panel-estructura";
import { PanelMausbot } from "./panel-mausbot";
import { PanelParametros } from "./panel-parametros";
import { MarcoAislado } from "./marco-aislado";
import { useEstadoControl, useMolecula } from "./use-molecula";

const AUTOR_PANEL: Autor = { tipo: "persona", id: "panel" };

const ETIQUETA_AMBITO: Record<Ambito, string> = { personal: "personal", perfil: "perfil", grupo: "grupo", publica: "pública" };
const TEXTO_GUARDADO = { "sin-cambios": "Sin cambios que guardar", guardando: "Guardando…", guardado: "Guardado en este aparato" } as const;
const idSeguroOp = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ahoraOp = (): number => Date.now();

export interface PanelProtomoleculaProps {
  controlador: Controlador;
  /** Quién opera desde este panel; Deshacer solo deshace lo suyo. */
  autor?: Autor;
  compacto?: boolean;
  /** Estado de guardado de la sesión que lo abrió; sin él no se enseña ninguno. */
  guardado?: EstadoGuardado;
  /** Enlace P2P de la sesión: dice por dónde va y, sin enlace, «solo en este aparato». */
  enlace?: EnlaceSesion | null;
}

export function PanelProtomolecula({ controlador: ctl, autor = AUTOR_PANEL, compacto = false, guardado, enlace }: PanelProtomoleculaProps) {
  const estado = useEstadoControl(ctl);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    registrarAtomosPropios();
  }, []);

  if (!estado) return null;

  const descargarBlob = (formato: string, datos: unknown) => {
    try {
      const texto = typeof datos === "string" ? datos : JSON.stringify(datos, null, 2);
      const blob = new Blob([texto], { type: `application/${formato};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `protomolecula.${formato}`;
      a.classList.add("cursor-pointer");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* no bloquear */
    }
  };

  return (
    <div className={`flex h-full w-full flex-col gap-3 overflow-auto ${compacto ? "p-2" : "p-4"}`}>
      {!compacto && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">{estado.molecula.titulo}</h2>
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{ETIQUETA_AMBITO[estado.molecula.ambito]}</span>
          {guardado && guardado.estado !== "error" && <span role="status" className="text-xs text-muted-foreground">{TEXTO_GUARDADO[guardado.estado]}</span>}
          {enlace && (
            <span className="text-xs text-muted-foreground" title={`${enlace.precisionReloj().texto} · ${enlace.latencia().texto}`}>
              {enlace.enlace().descripcion}
            </span>
          )}
        </header>
      )}
      {guardado?.estado === "error" && <p role="alert" className="text-xs text-destructive">No se pudo guardar: {guardado.motivo}</p>}
      <AnadirHerramienta controlador={ctl} estado={estado} />
      <ListaPendientes controlador={ctl} estado={estado} />
      {!compacto && <BarraDictado alDictar={(frase) => ctl.dictar(frase, autor).resultados} />}
      <PanelMausbot molecula={estado.molecula} candidatos={candidatosDe(estado.molecula)} />
      {estado.molecula.atomos.map((atomo) => {
        const def = obtenerAtomo(atomo.herramientaId);
        if (!def?.vista) return null;
        return (
          <div key={atomo.id} className="flex flex-col gap-2 rounded-md border p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{def.nombre}</span>
            </div>
            <div className="min-h-64 w-full">
              <MarcoAislado
                definicion={def}
                atomoId={atomo.id}
                valores={estado.molecula.valores}
                alCambio={(parametroId, valor) => {
                  const op: Operacion = {
                    id: idSeguroOp(),
                    objetivo: { atomoId: atomo.id, parametroId },
                    accion: { tipo: "exacta", valor: valor as ValorParametro },
                    autor,
                    origen: "mano",
                    t: ahoraOp(),
                  };
                  const r = ctl.mover(op);
                  setAviso(r.ok ? null : r.motivo);
                }}
                alExportar={(formato, datos) => {
                  descargarBlob(formato, datos);
                }}
                alDeclarar={() => {
                  /* solo informa */
                }}
              />
            </div>
          </div>
        );
      })}
      <PanelParametros
        candidatos={candidatosDe(estado.molecula)}
        valores={estado.molecula.valores}
        autor={autor}
        alOperar={(op) => { const r = ctl.mover(op); setAviso(r.ok ? null : r.motivo); }}
      />
      {aviso && <p role="status" className="text-xs">{aviso}</p>}
      {hayLecturaSalud(estado) && <p role="note" className="text-xs text-muted-foreground">{AVISO_SALUD}</p>}
      {!compacto && <PanelActividad controlador={ctl} estado={estado} autor={autor} />}
    </div>
  );
}

export interface PanelProtomoleculaAutonomoProps {
  /** Presentación reducida para el widget del dashboard. */
  compacto?: boolean;
  /** Molécula concreta; si se omite, la última abierta, la más reciente guardada o una nueva. */
  moleculaId?: string;
}

export function PanelProtomoleculaAutonomo({ compacto = false, moleculaId }: PanelProtomoleculaAutonomoProps) {
  const { error, controlador, guardado, enlace } = useMolecula({ moleculaId });
  if (error) {
    return <p role="alert" className="p-2 text-sm text-destructive">{error}</p>;
  }
  if (!controlador) {
    return <p className="p-2 text-sm text-muted-foreground" role="status">Abriendo la protomolécula…</p>;
  }
  return <PanelProtomolecula controlador={controlador} compacto={compacto} guardado={guardado} enlace={enlace} />;
}

export default PanelProtomoleculaAutonomo;
