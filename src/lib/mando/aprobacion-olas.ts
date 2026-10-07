import type { AmbitoMando, CapacidadAmbito } from "./ambito";
import type { TareaOla } from "./tipos";
import { proposalForChange } from "@/lib/governance/propuestas";
import type { ChangeRequest, ProposalDraft } from "@/lib/governance/propuestas";

export function necesitaVotacion(ambito: AmbitoMando, capacidad: CapacidadAmbito): boolean {
  if (ambito.modo_gobierno !== "democratico") {
    return false;
  }
  const requiereVoto: CapacidadAmbito[] = ["lanzar-olas", "publicar", "gestionar-motores", "usar-apis"];
  return requiereVoto.includes(capacidad);
}

export function propuestaDeOla(
  ambito: AmbitoMando,
  ola: { nombre: string; tareas: TareaOla[] },
  autor: string
): ProposalDraft {
  const totalTareas = ola.tareas.length;
  const archivosSet = new Set<string>();
  let usaProveedoresPago = false;

  for (const t of ola.tareas) {
    if (t.archivos) {
      for (const a of t.archivos) archivosSet.add(a);
    }
    if (t.descripcion) {
      const d = t.descripcion.toLowerCase();
      if (d.includes("pago") || d.includes("paid") || d.includes("premium")) {
        usaProveedoresPago = true;
      }
    }
  }

  const archivos = Array.from(archivosSet);
  const resumenArchivos = archivos.length ? `${archivos.length} archivos` : "sin archivos";

  const scope = ambito.tipo === "persona" ? "account" : "group";
  const scopeRef = ambito.entidad_ref ?? ambito.perfil_id ?? ambito.id;

  const change: ChangeRequest = {
    kind: "set_config",
    key: "lanzar_ola",
    value: ola.nombre,
    label: `Lanzar ola ${ola.nombre}`,
    note: `Ola: ${ola.nombre}. Tareas: ${totalTareas}. ${resumenArchivos}. Archivos: ${archivos.join(", ")}. Proveedores de pago: ${usaProveedoresPago ? "sí" : "no"}. Autor: ${autor}.`,
  };

  const draft = proposalForChange(scope, scopeRef, change);
  return draft;
}

export function capacidadesAprobadas(
  propuestas: { capacidad: CapacidadAmbito; estado: string; vence?: string }[],
  ahora: Date
): CapacidadAmbito[] {
  const aprobadas: CapacidadAmbito[] = [];
  for (const p of propuestas) {
    if (p.estado !== "aprobada") continue;
    if (p.vence) {
      const vencimiento = new Date(p.vence);
      if (isNaN(vencimiento.getTime())) continue;
      if (vencimiento.getTime() <= ahora.getTime()) continue;
    }
    aprobadas.push(p.capacidad);
  }
  return aprobadas;
}
