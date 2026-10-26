"use client";

/** Registro de quién usó un permiso directo (Ola 1026P · P2): la transparencia del poder ejercido sin votación. */
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { leerUsosPermiso, type UsoPermiso } from "@/lib/protomolecula/gobierno/registro";
import { ETIQUETA_TIPO } from "@/lib/protomolecula/gobierno/reglas";
import type { EntidadProto } from "@/lib/protomolecula/peticion/contrato";

const ORIGEN: Record<UsoPermiso["origen"], string> = { humano: "una persona", ia: "una IA, confirmada por la persona", agente: "un agente, confirmado por la persona" };

export function RegistroUsos({ entidad, version = 0, tope = 20 }: { entidad: Pick<EntidadProto, "tipo" | "id">; version?: number; tope?: number }) {
  const [usos, setUsos] = useState<UsoPermiso[]>([]);
  useEffect(() => {
    setUsos(leerUsosPermiso({ tipo: entidad.tipo, id: entidad.id }).slice(0, tope));
  }, [entidad.tipo, entidad.id, version, tope]);

  return (
    <section aria-label="Registro de usos de permisos directos" className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3" data-testid="registro-usos">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-white/90">
        <ScrollText className="h-4 w-4 text-cyan-300" aria-hidden /> Quién usó un permiso directo
      </h4>
      {usos.length === 0 ? (
        <p className="text-xs text-white/55">Todavía nadie ha usado un permiso directo.</p>
      ) : (
        <ul className="space-y-1.5">
          {usos.map((u) => (
            <li key={u.id} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white/80">
              <span className="font-medium text-white/90">{u.nombre || (u.usuarioId ? `Cuenta ${u.usuarioId.slice(0, 8)}` : "Alguien sin sesión")}</span>
              {" · "}
              {ETIQUETA_TIPO[u.tipoCambio].toLowerCase()}
              {" · "}
              <time dateTime={new Date(u.en).toISOString()}>{new Date(u.en).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              <span className="block text-white/60">{u.resumen} (por {ORIGEN[u.origen]})</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-white/45">
        Este registro se guarda en este aparato: que viaje a la cuenta de la entidad, para que todas las personas lo vean, necesita una tabla compartida que aún no existe.
      </p>
    </section>
  );
}
