"use client";

import { useEffect, useState } from "react";
import { getEntityState, setEntityState, type EntityRef } from "@/lib/sync/entity-state";
import { CAMPOS_CAPA, ETIQUETA_CAMPO, type CampoCapa } from "@/lib/astraura/capas-entidad";
import {
  CLAVE_CAPAS_AMBITO,
  leerPerfilCapasAmbito,
  puedeCambiar,
  referenciaCapasAmbito,
  resolverAmbito,
  type AmbitoCambioCapas,
  type GobiernoAmbito,
  type PerfilCapasAmbito,
  type PersonaCapasAmbito,
} from "@/lib/astraura/capas/ambito";

export interface AlmacenCapasAmbito {
  leer: (ref: EntityRef, clave: string) => Promise<{ value: unknown } | null>;
  guardar: (ref: EntityRef, clave: string, valor: PerfilCapasAmbito) => Promise<unknown>;
}

export interface CapasAmbitoProps {
  nombre: string;
  ambito: AmbitoCambioCapas;
  persona: PersonaCapasAmbito;
  gobierno: GobiernoAmbito;
  perfilInicial?: PerfilCapasAmbito;
  almacen?: AlmacenCapasAmbito;
  alRequerirVotacion?: (perfil: PerfilCapasAmbito) => void;
}

const ALMACEN: AlmacenCapasAmbito = {
  leer: getEntityState,
  guardar: setEntityState,
};

const textoPermiso = {
  requiere_votacion: "Este cambio necesita una votación del ámbito.",
  denegado: "Solo quienes administran este ámbito pueden cambiar estos ajustes.",
  permitido: "",
} as const;

export function CapasAmbito(props: CapasAmbitoProps) {
  const { nombre, ambito, persona, gobierno } = props;
  const almacen = props.almacen ?? ALMACEN;
  const ref = referenciaCapasAmbito(ambito.tipo, ambito.id);
  const [perfil, setPerfil] = useState(props.perfilInicial ?? resolverAmbito({}));
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (props.perfilInicial) return;
    let vigente = true;
    void almacen.leer(ref, CLAVE_CAPAS_AMBITO).then((fila) => {
      if (vigente && fila) setPerfil(leerPerfilCapasAmbito(fila.value));
    });
    return () => { vigente = false; };
  }, [almacen, ambito.id, ambito.tipo, props.perfilInicial]);

  const permiso = puedeCambiar(persona, ambito, gobierno);
  const persistir = async (
    siguiente: PerfilCapasAmbito,
    accion?: AmbitoCambioCapas["accion"],
  ) => {
    const decision = puedeCambiar(persona, { ...ambito, accion }, gobierno);
    if (decision === "requiere_votacion") {
      setAviso(textoPermiso[decision]);
      props.alRequerirVotacion?.(siguiente);
      return;
    }
    if (decision === "denegado") { setAviso(textoPermiso[decision]); return; }
    setPerfil(siguiente);
    setAviso("");
    await almacen.guardar(ref, CLAVE_CAPAS_AMBITO, siguiente);
  };
  const fijarCapa = (campo: CampoCapa) => setPerfil((actual) => ({
    ...actual,
    capasPreferidas: { ...actual.capasPreferidas, [campo]: !actual.capasPreferidas[campo] },
  }));
  const puedeApagarPropio = puedeCambiar(persona,
    { ...ambito, accion: "apagar_aprendizaje_propio" }, gobierno) === "permitido";

  return (
    <section className="rounded-xl border border-white/15 bg-black/30 p-4 text-white" data-testid="capas-ambito">
      <h3 className="text-sm font-semibold">Capas de {nombre}</h3>
      <p className="mt-1 text-xs text-white/55">Elige cómo recuerda, aprende y comparte este ámbito.</p>
      {permiso !== "permitido" && <p role="status" className="mt-2 text-xs text-amber-300">{textoPermiso[permiso]}</p>}
      {aviso && aviso !== textoPermiso[permiso] && <p role="alert" className="mt-2 text-xs text-amber-300">{aviso}</p>}
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Capas preferidas">
        {CAMPOS_CAPA.map((campo) => <button key={campo} type="button" disabled={permiso === "denegado"}
          aria-pressed={perfil.capasPreferidas[campo]} onClick={() => fijarCapa(campo)}
          className="min-h-11 cursor-pointer rounded-lg border border-white/15 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40">
          {ETIQUETA_CAMPO[campo].nombre}
        </button>)}
      </div>
      <label className="mt-3 block text-xs">Colección de memoria
        <input value={perfil.coleccionMemoria} disabled={permiso === "denegado"} onChange={(e) => setPerfil({ ...perfil, coleccionMemoria: e.target.value })}
          className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3" />
      </label>
      <label className="mt-3 block text-xs">Adaptador del ámbito
        <input value={perfil.adaptador ?? ""} disabled={permiso === "denegado"} onChange={(e) => setPerfil({ ...perfil, adaptador: e.target.value || undefined })}
          className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3" />
      </label>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 text-xs">
        <input type="checkbox" checked={perfil.aprende} disabled={permiso === "denegado" && !puedeApagarPropio}
          onChange={(e) => { const siguiente = { ...perfil, aprende: e.target.checked }; setPerfil(siguiente);
            if (!e.target.checked && permiso === "denegado") void persistir(siguiente, "apagar_aprendizaje_propio"); }} /> Aprender de las correcciones
      </label>
      <label className="mt-2 block text-xs">Compartir aprendizaje
        <select value={perfil.comparteCon} disabled={permiso === "denegado"} onChange={(e) => setPerfil({ ...perfil, comparteCon: e.target.value as PerfilCapasAmbito["comparteCon"] })}
          className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-white/15 bg-black px-3">
          <option value="nadie">Con nadie</option><option value="ambito">Solo con este ámbito</option><option value="red">Con la red</option>
        </select>
      </label>
      <button type="button" disabled={permiso === "denegado"} onClick={() => void persistir(perfil)}
        className="mt-4 min-h-11 cursor-pointer rounded-lg bg-[#007FFF] px-4 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">Guardar ajustes</button>
    </section>
  );
}
