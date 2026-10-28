import { tokensDe, cssDe, type Interaccion } from "@/lib/design/movimiento";
import { movimientoDe, type RegistroMovimiento, type SeccionMovimiento } from "@/lib/design/registros-movimiento";

export type FaseIcono = "reposo" | "hover" | "pulsado" | "lanzando";

export interface RegistroDock {
  reducido: boolean;
  registro: RegistroMovimiento;
  seccion: SeccionMovimiento;
}

export function estiloIcono(fase: FaseIcono, registro: RegistroDock) {
  const reducido = registro.reducido;
  let tokens = tokensDe("entrar", reducido);
  let transform = "";

  switch (fase) {
    case "reposo":
      tokens = tokensDe("entrar", reducido);
      transform = "translateY(0) scale(1)";
      break;
    case "hover":
      tokens = tokensDe("hover", reducido);
      transform = reducido ? "" : "translateY(-4px) scale(1.08)";
      break;
    case "pulsado":
      tokens = tokensDe("press", reducido);
      transform = reducido ? "" : "scale(0.96)";
      break;
    case "lanzando":
      const mov = movimientoDe(registro.registro, registro.seccion);
      tokens = { duracionMs: mov.entrada.ms, curva: mov.entrada.curva };
      transform = reducido ? "" : "translateY(-2px) scale(1.04)";
      break;
  }

  return {
    transform,
    transition: cssDe(tokens),
  };
}
