"use client";

import * as React from "react";
import { AstrauraForma } from "./astraura-forma";
import { Rotulo } from "./comun";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";

export function DisenoMinimo({
  estado,
  tam,
  preguntar,
  onAbrirChat,
}: Pick<PropsDiseno, "estado" | "tam" | "preguntar" | "onAbrirChat">) {
  const [ancho, setAncho] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAncho(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setAncho(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const enFila = ancho >= 220;
  const textoEstado = textoDeEstado(estado);

  return (
    <div
      ref={ref}
      className={`
        flex w-full min-w-0 gap-3
        ${enFila ? "flex-row items-center" : "flex-col items-center justify-center"}
      `}
      data-diseno="minimo"
    >
      <AstrauraForma estado={estado} tam={tam} onClick={onAbrirChat} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Rotulo className="truncate text-foreground">
          {textoEstado}
        </Rotulo>
        <div className="min-w-0">{preguntar}</div>
      </div>
    </div>
  );
}