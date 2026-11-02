"use client";

import { useEffect, useMemo, useState } from "react";
import { getConfigMap } from "@/lib/connectors/store";
import type { AlcanceVivo, ContextoVivo } from "@/lib/contenido-vivo/rutas";
import type { NivelVivo, TareaViva } from "@/lib/contenido-vivo/tipos";
import {
  CONTENIDO_VIVO, cotizar, nivelDeTarea, planContenidoVivo, servicioDeRuta,
  type EntradaContenidoVivo, type PublicacionViva, type TareaPedidaViva,
} from "@/lib/protomolecula/atomos/contenido-vivo";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";

const SERVICIOS_VIVOS = ["spline", "higgsfield"] as const;
const ETIQUETAS: Record<TareaViva, string> = {
  "escena-3d": "Escena 3D", "fotograma-clave": "Fotograma clave", foto: "Foto", "clip-pelicula": "Clip de película",
  "foto-viva": "Foto viva", "grafico-vivo": "Gráfico vivo", "revision-texto": "Revisión de texto", comprobacion: "Comprobación",
};

const defecto = (id: string): unknown => CONTENIDO_VIVO.parametros.find((p) => p.id === id)?.defecto;
const numero = (valor: unknown, respaldo: number): number => {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : respaldo;
};
const nivelDe = (valor: unknown): NivelVivo => {
  const n = numero(valor, 1);
  return n === 3 ? 3 : n === 2 ? 2 : 1;
};
const tareaDe = (valor: unknown): TareaViva => {
  const opciones = CONTENIDO_VIVO.parametros.find((p) => p.id === "tarea")?.opciones ?? [];
  return typeof valor === "string" && opciones.includes(valor) ? (valor as TareaViva) : "escena-3d";
};

function contextoDe(alcance: AlcanceVivo, conectados: string[], capaz3d: boolean, valores: Record<string, unknown>): ContextoVivo {
  const tope = Math.max(0, numero(valores["tope-creditos"], numero(defecto("tope-creditos"), 0)));
  const disponible = tope > 0 ? tope : 100;
  return {
    alcance, conectados: [...conectados], cupoHoy: {}, creditosDisponibles: disponible, topeMes: disponible, gastadoMes: 0,
    neurona: { gpu: false, capaz3d },
    ajustes: { localPrimero: valores["local-primero"] !== false, externosPermitidos: valores["externos-permitidos"] !== false },
  };
}

function entradaDeVista(valores: Record<string, unknown>, contexto: ContextoVivo): EntradaContenidoVivo {
  const tarea = tareaDe(valores.tarea ?? defecto("tarea"));
  const nivel = valores.nivel === undefined ? nivelDeTarea(tarea) : nivelDe(valores.nivel);
  const publicacion: PublicacionViva = {
    id: typeof valores.publicacionId === "string" ? valores.publicacionId : "publicacion-viva",
    titulo: typeof valores.publicacion === "string" && valores.publicacion.trim() ? valores.publicacion : "Esta publicación",
    tipo: "publicacion",
  };
  const tareas: TareaPedidaViva[] = [{ tarea, nivel, cantidad: Math.max(1, Math.floor(numero(valores.cantidad, 1))) }];
  return { publicacion, niveles: [nivel], tareas, contexto };
}

const conectadosAhora = (): string[] => {
  const mapa = getConfigMap();
  return SERVICIOS_VIVOS.filter((id) => Boolean(mapa[id]?.enabled && (mapa[id]?.oauthConnected || mapa[id]?.apiKey)));
};

const hayWebgl = (): boolean => {
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch { return false; }
};

export interface VistaContenidoVivoProps extends VistaProps {
  alcance?: AlcanceVivo;
  entrada?: EntradaContenidoVivo;
}

export default function VistaContenidoVivo({ valores, alcance = "perfil", entrada }: VistaContenidoVivoProps) {
  const [equipo, setEquipo] = useState<{ conectados: string[]; capaz: boolean } | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  useEffect(() => { setEquipo({ conectados: conectadosAhora(), capaz: hayWebgl() }); }, []);
  const plan = useMemo(
    () => planContenidoVivo(entrada ?? entradaDeVista(valores ?? {}, contextoDe(alcance, equipo?.conectados ?? [], equipo?.capaz ?? false, valores ?? {}))),
    [entrada, valores, alcance, equipo],
  );
  const cotizacion = useMemo(() => cotizar(plan.tareas), [plan]);
  const total = cotizacion.reduce((suma, servicio) => suma + servicio.creditos, 0);

  if (equipo === null) return <p role="status" className="p-3 text-sm text-muted-foreground">Armando el plan de contenido vivo...</p>;
  return (
    <section aria-label="Plan de contenido vivo" className="space-y-2 rounded-md border bg-background p-3 text-sm">
      <p className="text-muted-foreground">
        {plan.publicacion.titulo}: local primero, externo solo cuando gana con claridad y siempre con cotización antes de gastar.
      </p>
      <ul className="space-y-2">
        {plan.tareas.map((tarea, indice) => (
          <li key={`${tarea.nivel}-${tarea.tarea}-${indice}`} className="border-b border-border/40 pb-2 text-xs last:border-0 last:pb-0">
            <p>
              <strong className="text-sm">{ETIQUETAS[tarea.tarea]}</strong> · {tarea.ruta?.ruta.nombre ?? "Sin ruta disponible"} · {tarea.creditos} {tarea.creditos === 1 ? "crédito" : "créditos"} (nivel {tarea.nivel}, {tarea.ruta ? servicioDeRuta(tarea.ruta.ruta) : "sin ruta"})
            </p>
            <p className="text-muted-foreground">{tarea.ruta?.razon ?? tarea.ruta?.motivoNoDisponible ?? "No hay ruta disponible en este ámbito."}</p>
          </li>
        ))}
      </ul>
      {plan.avisos.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-muted-foreground">{plan.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}</ul>
      )}
      <p>
        Cotización: <strong>{total} créditos</strong>
        {cotizacion.length > 0 && <> ({cotizacion.map((servicio) => `${servicio.servicio}: ${servicio.creditos}`).join(", ")})</>}
      </p>
      {plan.necesitaConfirmar && !confirmado && (
        <button type="button" onClick={() => setConfirmado(true)} className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          Sí, hacerla viva: {total} créditos
        </button>
      )}
      {plan.necesitaConfirmar && confirmado && (
        <p role="status" className="text-sm text-primary">Confirmado: el plan queda armado con tu sí y no ejecuta nada por sí solo.</p>
      )}
      {!plan.necesitaConfirmar && (
        <p role="status" className="text-sm text-muted-foreground">El plan no gasta créditos: rutas locales, y lo pendiente de conexión se dice en cada tarea.</p>
      )}
    </section>
  );
}
