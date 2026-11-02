"use client";

/**
 * Protomolécula · VISTA DEL ÁTOMO «Contenido vivo» (CVV1028F).
 * Aplica el átomo igual que `atomo-escena3d` aplica `escena3d`: perezosa por `VISTAS_COMPONENTE`,
 * dentro de la molécula «publicación viva» del contrato (architecture/contenido-vivo.md §2).
 * La vista arma el PLAN con `planContenidoVivo`, muestra las rutas elegidas y su cotización,
 * y pide el «sí» si el plan gasta créditos (§3: nunca se gastan sin cotización y sin un sí).
 * No ejecuta nada externo por sí misma.
 */
import { useEffect, useMemo, useState } from "react";
import { getConfigMap } from "@/lib/connectors/store";
import type { AlcanceVivo } from "@/lib/contenido-vivo/rutas";
import type { TareaViva } from "@/lib/contenido-vivo/tipos";
import { entradaDeVista, planContenidoVivo, type EntradaContenidoVivo } from "@/lib/protomolecula/atomos/contenido-vivo";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";

/** Conectores del catálogo que sirven al contenido vivo (CVV1028J). */
const SERVICIOS_VIVOS = ["spline", "higgsfield"] as const;

const ETIQUETAS: Record<TareaViva, string> = {
  "escena-3d": "Escena 3D",
  "fotograma-clave": "Fotograma clave",
  foto: "Foto",
  "clip-pelicula": "Clip de película",
  "foto-viva": "Foto viva",
  "grafico-vivo": "Gráfico vivo",
  "revision-texto": "Revisión de texto",
  comprobacion: "Comprobación",
};

/** Servicios del catálogo con su conector ya activo («local es la verdad», tienda de conectores). */
export function conectadosAhora(): string[] {
  const mapa = getConfigMap();
  return SERVICIOS_VIVOS.filter((id) => {
    const config = mapa[id];
    return Boolean(config?.enabled && (config.oauthConnected || config.apiKey));
  });
}

/** ¿Puede esta página dibujar lo que la ruta local de escenas pide? Solo en el cliente. */
export function hayWebgl(): boolean {
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface VistaContenidoVivoProps extends VistaProps {
  /** Alcance del contenido que carga la molécula; los conectados se leen de la tienda de conectores. */
  alcance?: AlcanceVivo;
  /** Entrada completa ya armada; si falta, se arma con los valores del átomo y la tienda (inyectable en pruebas). */
  entrada?: EntradaContenidoVivo;
}

export default function VistaContenidoVivo({ valores, alcance = "perfil", entrada }: VistaContenidoVivoProps) {
  const [equipo, setEquipo] = useState<{ conectados: string[]; capaz: boolean } | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  useEffect(() => {
    setEquipo({ conectados: conectadosAhora(), capaz: hayWebgl() });
  }, []);
  const plan = useMemo(
    () => planContenidoVivo(entrada ?? entradaDeVista(valores, alcance, equipo?.conectados ?? [], equipo?.capaz ?? false)),
    [entrada, valores, alcance, equipo],
  );

  if (equipo === null) {
    return <p role="status" className="p-3 text-sm text-muted-foreground">Armando el plan de contenido vivo...</p>;
  }
  return (
    <section aria-label="Plan de contenido vivo" className="space-y-2 rounded-md border bg-background p-3 text-sm">
      <p className="text-muted-foreground">
        {plan.publicacion}: local primero, externo solo cuando gana con claridad y siempre con cotización antes de gastar.
      </p>
      <ul className="space-y-2">
        {plan.pasos.map((paso, indice) => (
          <li key={`${paso.nivel}-${paso.tarea}-${indice}`} className="border-b border-border/40 pb-2 text-xs last:border-0 last:pb-0">
            <p>
              <strong className="text-sm">{ETIQUETAS[paso.tarea]}</strong> · {paso.rutaNombre} · {paso.creditos}{" "}
              {paso.creditos === 1 ? "crédito" : "créditos"} (nivel {paso.nivel})
            </p>
            <p className="text-muted-foreground">{paso.razon}</p>
          </li>
        ))}
      </ul>
      <p>
        Cotización: <strong>{plan.totalCreditos} créditos</strong>
        {plan.cotizacion.length > 0 && <> ({plan.cotizacion.map((c) => `${c.servicio}: ${c.creditos}`).join(", ")})</>}
      </p>
      {plan.necesitaConfirmar && !confirmado && (
        <button
          type="button"
          onClick={() => setConfirmado(true)}
          className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sí, hacerla viva: {plan.totalCreditos} créditos
        </button>
      )}
      {plan.necesitaConfirmar && confirmado && (
        <p role="status" className="text-sm text-primary">
          Confirmado: el plan queda armado con tu sí y no ejecuta nada por sí solo.
        </p>
      )}
      {!plan.necesitaConfirmar && (
        <p role="status" className="text-sm text-muted-foreground">
          El plan no gasta créditos: rutas locales, y lo pendiente de conexión se dice en cada paso.
        </p>
      )}
    </section>
  );
}
