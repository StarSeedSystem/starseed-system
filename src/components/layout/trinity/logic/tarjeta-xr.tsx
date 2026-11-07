"use client";

/**
 * Tarjeta «Realidad aumentada / virtual» del Centro de Control (XR1107A). SIEMPRE presente:
 *  - si el aparato confirma VR o AR (`isSessionSupported`), entra a `/xr/os?modo=vr|ar` (un botón por modo);
 *  - si no, dice por qué (sin WebXR, sin https, sin AR…) y lleva al diagnóstico del visor.
 * El botón flotante de la esquina solo se sugiere con soporte real; aquí la entrada nunca desaparece.
 */
import { Glasses, Stethoscope } from "lucide-react";
import { FilaAcceso } from "./fila-acceso";
import { useIrCerrando } from "./use-ir-cerrando";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { textoEntrada, type ModoBotonXR } from "@/components/xr/shell/texto-entrada";
import { porQueNoHayXR } from "@/components/xr/shell/sugerencia-entrada";

/** Del modo inmersivo al parámetro que entiende `/xr/os`. */
function paramDe(modo: ModoBotonXR): "vr" | "ar" {
  return modo === "vr-inmersivo" ? "vr" : "ar";
}

export function TarjetaXR() {
  const ir = useIrCerrando();
  const { estado, datos, capacidades, plan } = useCapacidadesXR();
  const sondeando = estado === "sondeando";
  const texto = textoEntrada(capacidades, plan, sondeando, !datos.seguro);
  const botones = texto.botones;

  if (botones.length === 0) {
    const motivo = porQueNoHayXR({
      soporte: { tieneXR: datos.tieneXR, vr: datos.vr, ar: datos.ar },
      seguro: datos.seguro,
      sondeando,
    });
    return (
      <div className="space-y-1.5" data-testid="tarjeta-xr">
        <FilaAcceso
          icono={Stethoscope}
          titulo="Realidad aumentada / virtual"
          sub={motivo}
          onClick={() => ir("/xr/diagnostico")}
          etiqueta={`Realidad aumentada o virtual no disponible: ${motivo} Abrir el diagnóstico del visor`}
          titleAttr="Ver por qué no está disponible y qué se puede hacer"
          testId="fila-xr-diagnostico"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="tarjeta-xr">
      {botones.map((b) => (
        <FilaAcceso
          key={b.modo}
          icono={Glasses}
          titulo={b.etiqueta}
          sub={b.descripcion}
          onClick={() => ir(`/xr/os?modo=${paramDe(b.modo)}`)}
          testId={`fila-xr-${paramDe(b.modo)}`}
        />
      ))}
    </div>
  );
}
