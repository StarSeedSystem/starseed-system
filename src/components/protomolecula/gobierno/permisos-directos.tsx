"use client";

/**
 * Permisos directos de una entidad (Ola 1026P · P2): quién puede saltarse la propuesta o la votación para ciertos
 * tipos de cambio, desde cuándo y hasta cuándo. Edita el borrador de reglas que le pasa la sección; no guarda nada
 * por sí mismo (guardar o proponer sigue la regla de «permisos»). Nunca cubre reglas ni permisos.
 */
import { useEffect, useId, useState } from "react";
import { Clock, KeyRound, Trash2, UserPlus } from "lucide-react";
import {
  ETIQUETA_ROL_MINIMO, ETIQUETA_TIPO, ROLES_MINIMOS_PERMISO, TIPOS_DELEGABLES, conPermiso, crearPermiso, etiquetaSujeto, permisoVigente, sinPermiso,
  type PermisoDirecto, type ReglasProtomolecula, type RolMinimoPermiso,
} from "@/lib/protomolecula/gobierno/reglas";
import type { TipoCambioProto } from "@/lib/protomolecula/peticion/contrato";
import { CLASE_BOTON, CLASE_CONTROL } from "./etiquetas-gobierno";

const VIGENCIAS: { valor: string; dias: number; etiqueta: string }[] = [
  { valor: "0", dias: 0, etiqueta: "Sin caducidad" },
  { valor: "7", dias: 7, etiqueta: "7 días" },
  { valor: "30", dias: 30, etiqueta: "30 días" },
  { valor: "90", dias: 90, etiqueta: "90 días" },
];

export interface PropsPermisosDirectos {
  reglas: ReglasProtomolecula;
  onCambiar: (nuevas: ReglasProtomolecula) => void;
  /** Quién concede (para anotarlo). */
  concedidoPor: string | null;
  /** Personas de la entidad para elegir; `null` mientras se leen, `[]` si no se pudieron leer. */
  cargarPersonas: () => Promise<{ id: string; nombre: string }[]>;
  editable: boolean;
  ahora?: number;
}

function fecha(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function PermisosDirectos({ reglas, onCambiar, concedidoPor, cargarPersonas, editable, ahora = Date.now() }: PropsPermisosDirectos) {
  const id = useId();
  const [sujeto, setSujeto] = useState<"rol" | "persona">("rol");
  const [desde, setDesde] = useState<RolMinimoPermiso>("colaboracion");
  const [personaId, setPersonaId] = useState("");
  const [personaNombre, setPersonaNombre] = useState("");
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[] | null>(null);
  const [tipos, setTipos] = useState<TipoCambioProto[]>([]);
  const [vigencia, setVigencia] = useState("30");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sujeto !== "persona" || personas !== null) return;
    let vivo = true;
    void cargarPersonas().then((l) => vivo && setPersonas(l)).catch(() => vivo && setPersonas([]));
    return () => {
      vivo = false;
    };
  }, [sujeto, personas, cargarPersonas]);

  const alternarTipo = (t: TipoCambioProto) => setTipos((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  const añadir = () => {
    setError(null);
    if (tipos.length === 0) return setError("Elige para qué tipos de cambio vale el permiso.");
    if (sujeto === "persona" && !personaId.trim()) return setError("Elige a qué persona se lo das.");
    const nombre = sujeto === "persona" ? (personas?.find((p) => p.id === personaId)?.nombre ?? personaNombre.trim()) : undefined;
    const p = crearPermiso({
      sujeto: sujeto === "rol" ? { tipo: "rol", desde } : { tipo: "persona", usuarioId: personaId.trim(), ...(nombre ? { nombre } : {}) },
      tipos, concedidoPor, motivo: motivo.trim() || undefined, dias: VIGENCIAS.find((v) => v.valor === vigencia)?.dias || undefined,
    }, ahora);
    if (!p) return setError("Ese permiso no vale: no se puede cubrir reglas ni permisos, y hace falta una persona o un rol.");
    onCambiar(conPermiso(reglas, p));
    setTipos([]);
    setMotivo("");
    setPersonaId("");
    setPersonaNombre("");
  };

  return (
    <section aria-label="Permisos directos" className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3" data-testid="permisos-directos">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <KeyRound className="h-4 w-4 text-amber-300" aria-hidden /> Permisos directos
        </h4>
        <p className="mt-1 text-xs text-white/60">
          Quien tenga uno cambia ciertos tipos de cosa sin pasar por la propuesta ni la votación. Cada uso queda anotado y a la vista. Nunca cubren las reglas ni los permisos:
          eso sigue su propia regla.
        </p>
      </div>

      {reglas.permisosDirectos.length === 0 ? (
        <p className="text-xs text-white/55" data-testid="permisos-vacio">Ahora mismo nadie tiene un permiso directo.</p>
      ) : (
        <ul className="space-y-2">
          {reglas.permisosDirectos.map((p: PermisoDirecto) => {
            const vigente = permisoVigente(p, ahora);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2" data-testid={`permiso-${p.id}`}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm text-white/90">{etiquetaSujeto(p.sujeto)}</p>
                  <p className="text-[11px] text-white/55">
                    {p.tipos.map((t) => ETIQUETA_TIPO[t]).join(" · ")}
                  </p>
                  <p className={`flex items-center gap-1 text-[11px] ${vigente ? "text-white/55" : "text-amber-200"}`}>
                    <Clock className="h-3 w-3" aria-hidden />
                    {p.caduca === undefined ? "sin caducidad" : vigente ? `hasta el ${fecha(p.caduca)}` : `caducó el ${fecha(p.caduca)}`}
                    {p.motivo ? ` · ${p.motivo}` : ""}
                  </p>
                </div>
                {editable ? (
                  <button type="button" className={CLASE_BOTON} aria-label={`Quitar el permiso de ${etiquetaSujeto(p.sujeto)}`} onClick={() => onCambiar(sinPermiso(reglas, p.id))}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Quitar
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {editable ? (
        <fieldset className="space-y-3 rounded-lg border border-white/10 p-3">
          <legend className="px-1 text-xs font-medium text-white/75">Dar un permiso directo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-white/70" htmlFor={`${id}-sujeto`}>
              A quién
              <select id={`${id}-sujeto`} className={`${CLASE_CONTROL} w-full`} value={sujeto} onChange={(e) => setSujeto(e.target.value as "rol" | "persona")}>
                <option value="rol">A un rol</option>
                <option value="persona">A una persona</option>
              </select>
            </label>
            {sujeto === "rol" ? (
              <label className="space-y-1 text-xs text-white/70" htmlFor={`${id}-rol`}>
                Desde el rol
                <select id={`${id}-rol`} className={`${CLASE_CONTROL} w-full`} value={desde} onChange={(e) => setDesde(e.target.value as RolMinimoPermiso)}>
                  {ROLES_MINIMOS_PERMISO.map((r) => (
                    <option key={r} value={r}>{ETIQUETA_ROL_MINIMO[r]}</option>
                  ))}
                </select>
              </label>
            ) : personas && personas.length > 0 ? (
              <label className="space-y-1 text-xs text-white/70" htmlFor={`${id}-persona`}>
                Persona
                <select id={`${id}-persona`} className={`${CLASE_CONTROL} w-full`} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                  <option value="">Elige a quién…</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="space-y-1 text-xs text-white/70">
                <label htmlFor={`${id}-pid`} className="block">Identificador de la cuenta</label>
                <input id={`${id}-pid`} className={`${CLASE_CONTROL} w-full`} value={personaId} onChange={(e) => setPersonaId(e.target.value)} placeholder="el de su cuenta" />
                <label htmlFor={`${id}-pnom`} className="block">Su nombre (para reconocerla)</label>
                <input id={`${id}-pnom`} className={`${CLASE_CONTROL} w-full`} value={personaNombre} onChange={(e) => setPersonaNombre(e.target.value)} />
                <p className="text-[11px] text-white/45">{personas === null ? "Leyendo las personas de la entidad…" : "No pude leer las personas de la entidad: escribe el identificador de su cuenta."}</p>
              </div>
            )}
          </div>
          <div role="group" aria-label="Para qué tipos de cambio" className="flex flex-wrap gap-2">
            {TIPOS_DELEGABLES.map((t) => {
              const puesto = tipos.includes(t);
              return (
                <button key={t} type="button" role="checkbox" aria-checked={puesto} onClick={() => alternarTipo(t)}
                  className={`${CLASE_BOTON} ${puesto ? "border-amber-400/50 bg-amber-500/15 text-amber-100" : ""}`}>
                  {ETIQUETA_TIPO[t]}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-white/70" htmlFor={`${id}-vig`}>
              Vigencia
              <select id={`${id}-vig`} className={`${CLASE_CONTROL} w-full`} value={vigencia} onChange={(e) => setVigencia(e.target.value)}>
                {VIGENCIAS.map((v) => (
                  <option key={v.valor} value={v.valor}>{v.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-white/70" htmlFor={`${id}-mot`}>
              Motivo (opcional)
              <input id={`${id}-mot`} className={`${CLASE_CONTROL} w-full`} value={motivo} maxLength={240} onChange={(e) => setMotivo(e.target.value)} />
            </label>
          </div>
          {error ? <p role="alert" className="text-xs text-amber-200">{error}</p> : null}
          <button type="button" className={CLASE_BOTON} onClick={añadir}>
            <UserPlus className="h-4 w-4" aria-hidden /> Añadir permiso
          </button>
          <p className="text-[11px] text-white/45">Añadirlo prepara el cambio; se guarda (o se propone) con el botón de abajo, según la regla de «permisos».</p>
        </fieldset>
      ) : null}
    </section>
  );
}
