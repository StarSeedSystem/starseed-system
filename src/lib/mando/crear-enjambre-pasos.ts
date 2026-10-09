export type TipoMotor = "local" | "nube-propia" | "servidor-propio";
export type PlantillaOla = "" | "vacía" | "ejemplo";
export type AlcanceMemoria = "perfil" | "grupo" | "publica";
export type Horario = "24/7" | string;

export interface DatosAsistente {
  ambitoId?: string;
  ambitoTipo?: "persona" | "entidad";
  motor?: { tipo: TipoMotor };
  proveedores?: string[];
  directores?: Partial<Record<"chat" | "optimizador" | "diseño" | "producción" | "nube" | "medidores", boolean>>;
  plantilla?: PlantillaOla;
  limites?: {
    presupuestoTokensDia?: number;
    pagoPermitido?: boolean;
    horario?: Horario;
    visibilidad?: "privado" | "miembros" | "publico";
    alcanceMemoria?: AlcanceMemoria;
  };
}

export interface ResultadoPaso {
  valido: boolean;
  errores?: string[];
}

export function validarPaso(paso: number, datos: DatosAsistente): ResultadoPaso {
  const errores: string[] = [];
  switch (paso) {
    case 1: {
      if (!datos.ambitoId || datos.ambitoId.trim().length === 0) errores.push("selecciona un ámbito");
      if (!datos.ambitoTipo) errores.push("falta el tipo de ámbito");
      break;
    }
    case 2: {
      const t = datos.motor?.tipo;
      if (!t || !["local", "nube-propia", "servidor-propio"].includes(t)) errores.push("elige un motor");
      break;
    }
    case 3: {
      const prov = datos.proveedores ?? [];
      if (prov.length === 0) errores.push("selecciona al menos un proveedor");
      break;
    }
    case 4: {
      const dirs = datos.directores ?? {};
      const activos = Object.values(dirs).filter(Boolean).length;
      if (activos === 0) errores.push("activa al menos un director");
      if (!datos.plantilla || (datos.plantilla as string).trim().length === 0) errores.push("elige una plantilla de ola");
      break;
    }
    case 5: {
      const l = datos.limites ?? {};
      if (l.pagoPermitido === undefined) errores.push("falta Permitir pago");
      if (!l.horario || l.horario.trim().length === 0) errores.push("falta el horario");
      if (!l.presupuestoTokensDia || l.presupuestoTokensDia <= 0) errores.push("presupuesto debe ser mayor que 0");
      if (!l.alcanceMemoria) errores.push("falta el alcance de memoria");
      if (l.alcanceMemoria) {
        if (datos.ambitoTipo === "persona" && l.alcanceMemoria === "grupo") errores.push("una persona no puede elegir alcance 'grupo'");
        if (datos.ambitoTipo === "entidad" && l.alcanceMemoria === "perfil") errores.push("un grupo no puede elegir alcance 'perfil'");
        const validos: AlcanceMemoria[] = ["perfil", "grupo", "publica"];
        if (!validos.includes(l.alcanceMemoria)) errores.push("alcance de memoria inválido");
      }
      if (!l.visibilidad) errores.push("falta la visibilidad");
      break;
    }
    default:
      break;
  }
  return errores.length === 0 ? { valido: true } : { valido: false, errores };
}

export function resumenEnjambre(datos: DatosAsistente): string {
  const motor = datos.motor?.tipo ?? "—";
  const provs = (datos.proveedores ?? []).join(", ") || "—";
  const dirs = datos.directores ?? {};
  const directoresActivos = Object.entries(dirs)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ") || "ninguno";
  const plantilla = datos.plantilla || "—";
  const l = datos.limites ?? {};
  const presupuesto = l.presupuestoTokensDia ?? 0;
  const pago = l.pagoPermitido ? "sí" : "no";
  const horario = l.horario || "—";
  const alcance = l.alcanceMemoria || "—";
  const visibilidad = l.visibilidad || "—";
  return `Genesis · motor: ${motor} · proveedores: ${provs} · directores: ${directoresActivos} · plantilla: ${plantilla} · presupuesto: ${presupuesto} tokens/día · pago: ${pago} · horario: ${horario} · memoria: ${alcance} · visibilidad: ${visibilidad}`;
}
