"use client";

/**
 * Protomolécula · Vista del átomo «Fondo con Shaders» (FSH1018O). Enseña el `SetFondo` que
 * produce `planFondo` con las capas de shader y difusión, y lo aplica al fondo real con el
 * mismo aviso que usa la petición (`EVENTO_APLICAR_FONDO`). El motor base actual (Spline)
 * no se toca: el set lleva `base: null`. Sin WebGPU, `CapaShader` deja la vista fija.
 */
import { useMemo, useState, type CSSProperties } from "react";

import { CapaDifusion } from "@/components/backgrounds/capa-difusion";
import { CapaShader } from "@/components/backgrounds/capa-shader";
import {
  ALCANCES_FONDO, EFECTOS_FONDO, alcanceDe, planFondo, propsDeEfecto, type AlcanceFondo, type EfectoFondoId,
} from "@/lib/protomolecula/atomos/fondo-shader";
import { EVENTO_APLICAR_FONDO } from "@/lib/protomolecula/peticion/fondo-evento";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

const HEX = /^#[0-9a-f]{3,8}$/i;
const NOMBRE_ALCANCE: Record<AlcanceFondo, string> = { perfil: "Perfil", app: "App", pagina: "Página", seccion: "Sección" };

function soloValores(valores: Record<string, unknown>): Record<string, ValorParametro | undefined> {
  const out: Record<string, ValorParametro | undefined> = {};
  for (const [k, v] of Object.entries(valores)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

function estiloDe(capa: BackgroundLayer): CSSProperties {
  const t = capa.transform ?? { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };
  return {
    position: "absolute", left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.ancho * 100}%`, height: `${t.alto * 100}%`,
    transform: `scale(${t.escala}) rotate(${t.rotacion}deg)`, opacity: capa.opacity, mixBlendMode: capa.blend,
  };
}

export default function VistaFondoShader({ atomoId, valores, alCambiar }: VistaProps) {
  const [aviso, setAviso] = useState<string | null>(null);
  const limpios = useMemo(() => soloValores(valores), [valores]);
  const efecto = (Object.keys(EFECTOS_FONDO) as EfectoFondoId[]).find((k) => k === String(valores.efecto)) ?? "aurora";
  const alcance = alcanceDe(limpios);
  const set = useMemo(
    () => planFondo({ id: atomoId, autor: "Protomolécula", nombre: EFECTOS_FONDO[efecto].nombre, creado: new Date().toISOString(), valores: limpios }),
    [atomoId, efecto, limpios],
  );
  const paleta = Object.values(propsDeEfecto(efecto, 1)).filter((v): v is string => typeof v === "string" && HEX.test(v)).slice(0, 4);

  const cambiarAlcance = (a: AlcanceFondo) => {
    alCambiar?.({
      objetivo: { atomoId, parametroId: "alcance" }, accion: { tipo: "exacta", valor: a },
      autor: { tipo: "persona", id: "panel" }, origen: "mano", t: Date.now(),
    });
  };

  const aplicar = () => {
    if (typeof window === "undefined") return;
    const prefijo = `${atomoId}-`;
    const nuevas = set.capas.map((c, i) => ({ ...c, id: `${prefijo}${i + 1}`.slice(0, 64) }));
    const detalle = {
      aplicar: (capas: ReadonlyArray<Record<string, unknown>>) => {
        const otras = capas.filter((c) => !String(c.id ?? "").startsWith(prefijo));
        return [...otras.slice(0, Math.max(0, 8 - nuevas.length)), ...nuevas];
      },
    };
    const atendido = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: detalle, cancelable: true }));
    setAviso(atendido ? "Fondo aplicado; se conserva el motor base que ya tenías." : "No pude aplicar el fondo: la apariencia del sistema no respondió.");
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div role="img" aria-label={`Vista previa del fondo ${EFECTOS_FONDO[efecto].nombre} con ${set.capas.length} capas`}
        className="relative h-64 w-full overflow-hidden rounded-md border bg-black"
        style={paleta.length ? { background: `linear-gradient(135deg, ${paleta.join(", ")})` } : undefined}>
        {set.capas.map((capa) => (
          capa.kind === "shader" ? (
            <div key={capa.id} style={estiloDe(capa)}>
              <CapaShader capa={capa} />
            </div>
          ) : (
            <CapaDifusion key={capa.id} capa={capa} />
          )
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{EFECTOS_FONDO[efecto].nombre}</span>
        {paleta.map((color) => <span key={color} title={color} className="size-3 rounded-full border" style={{ background: color }} />)}
        <span>· {set.capas.length} capas · alcance {NOMBRE_ALCANCE[alcance].toLowerCase()}</span>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Alcance del fondo">
        {ALCANCES_FONDO.map((a) => (
          <button key={a} type="button" onClick={() => cambiarAlcance(a)} aria-pressed={a === alcance}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] ${a === alcance ? "border-violet-400/60 bg-violet-400/15 text-violet-200" : "border-border/60 text-muted-foreground hover:bg-muted"}`}>
            {NOMBRE_ALCANCE[a]}
          </button>
        ))}
      </div>
      <button type="button" onClick={aplicar}
        className="w-full cursor-pointer rounded bg-violet-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600">
        Aplicar al fondo
      </button>
      {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
    </div>
  );
}
