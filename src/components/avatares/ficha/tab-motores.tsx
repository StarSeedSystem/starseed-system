"use client";
/**
 * Pestaña «Motores» de la ficha (Ola 1025U · U2): un motor por papel. Reflejo (Needle), juicio (Jev), palabra
 * (BitNet 1.58, Bonsai, el enrutador económico o heredar) y profundo (opcional, apagado). BitNet y Bonsai están
 * siempre entre las opciones. Lo de pago está apagado y pide permiso; hay un tope de llamadas por hora por agente.
 * Honestidad: el papel «palabra» se APLICA (`setPrimaryChoice` en el ámbito «agente»); el resto queda guardado en la
 * ficha para quien haga hablar al agente.
 */
import { useState } from "react";
import { Cpu, Gauge, ShieldAlert } from "lucide-react";
import { findSource, freeSources, sourcesByTier } from "@/ai/astraura/free-catalog";
import {
  ETIQUETA_ROL, MOTORES, MOTORES_POR_ROL, ROLES_MOTOR, TOPE_POR_HORA_MAX, elegirMotor, permitirPago, ponerTopePorHora,
  type ConfigAgente, type EleccionMotor, type MotorId, type RolMotor,
} from "@/lib/avatares/agente/config-agente";
import { Aviso, Bloque, CLASE_SELECT, Deslizador, FilaInterruptor } from "./ui-ficha";

export interface TabMotoresProps {
  config: ConfigAgente;
  actualizar: (cambio: (c: ConfigAgente) => ConfigAgente) => void;
}

const APAGADO = "__apagado__";

function FilaMotor({ rol, config, actualizar, alError }: { rol: RolMotor; config: ConfigAgente; actualizar: TabMotoresProps["actualizar"]; alError: (m: string | null) => void }) {
  const { motores } = config;
  const eleccion = motores.roles[rol];
  const fuente = eleccion?.fuente ? findSource(eleccion.fuente) : undefined;
  const gratuitas = freeSources();

  const aplicar = (nueva: EleccionMotor | null) => {
    const r = elegirMotor(motores, rol, nueva);
    if (!r.ok) return alError(r.motivo);
    alError(null);
    actualizar((c) => ({ ...c, motores: r.motores }));
  };

  const alCambiarMotor = (valor: string) => {
    if (valor === APAGADO) return aplicar(null);
    const motor = valor as MotorId;
    if (motor === "externo") {
      // Sin fuente elegida todavía no hay nada que guardar: se pide en el selector de fuente (la primera gratuita por defecto).
      return aplicar({ motor, fuente: eleccion?.fuente ?? gratuitas[0]?.id });
    }
    aplicar({ motor });
  };

  const idBase = `motor-${rol}`;
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={idBase} className="text-sm font-medium text-foreground">{ETIQUETA_ROL[rol].nombre}</label>
        {rol === "palabra" ? (
          <span data-estado="aplicado" className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-100" title="El enrutador lee este sistema cuando una petición lleva el id de este agente.">Aplicado</span>
        ) : (
          <span data-estado="ficha" className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Guardado en la ficha</span>
        )}
      </div>
      <p className="mb-2 break-words text-xs text-muted-foreground">{ETIQUETA_ROL[rol].ayuda}</p>
      <select id={idBase} className={CLASE_SELECT} value={eleccion?.motor ?? APAGADO} onChange={(e) => alCambiarMotor(e.target.value)}>
        {rol !== "palabra" && <option value={APAGADO} className="bg-background text-foreground">Apagado (no se usa)</option>}
        {MOTORES_POR_ROL[rol].map((m) => (
          <option key={m} value={m} className="bg-background text-foreground">{MOTORES[m].nombre}</option>
        ))}
      </select>
      {eleccion && <p className="mt-1 break-words text-xs text-muted-foreground">{MOTORES[eleccion.motor].nota}</p>}

      {eleccion?.motor === "externo" && (
        <div className="mt-2 space-y-2">
          <label htmlFor={`${idBase}-fuente`} className="block text-xs text-muted-foreground">Fuente</label>
          <select
            id={`${idBase}-fuente`}
            className={CLASE_SELECT}
            value={eleccion.fuente ?? ""}
            onChange={(e) => aplicar({ motor: "externo", fuente: e.target.value })}
          >
            <optgroup label="Gratuitas">
              {gratuitas.map((s) => (
                <option key={s.id} value={s.id} className="bg-background text-foreground">{s.label}</option>
              ))}
            </optgroup>
            <optgroup label="De pago (apagadas hasta que lo permitas)">
              {sourcesByTier("paid").map((s) => (
                <option key={s.id} value={s.id} disabled={!motores.permitirPago} className="bg-background text-foreground">{s.label}</option>
              ))}
            </optgroup>
          </select>
          {fuente && fuente.models.length > 0 && (
            <>
              <label htmlFor={`${idBase}-modelo`} className="block text-xs text-muted-foreground">Modelo</label>
              <select
                id={`${idBase}-modelo`}
                className={CLASE_SELECT}
                value={eleccion.modelo ?? ""}
                onChange={(e) => aplicar({ motor: "externo", fuente: eleccion.fuente, ...(e.target.value ? { modelo: e.target.value } : {}) })}
              >
                <option value="" className="bg-background text-foreground">Automático</option>
                {fuente.models.map((m) => (
                  <option key={m.id} value={m.id} className="bg-background text-foreground">{m.label}</option>
                ))}
              </select>
              {fuente.limits && <p className="break-words text-xs text-muted-foreground">Límite: {fuente.limits}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TabMotores({ config, actualizar }: TabMotoresProps) {
  const { motores } = config;
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Bloque
        icono={Cpu}
        titulo="Motores por papel"
        ayuda="Lo local y gratis va primero. Cada papel tiene su motor; BitNet 1.58 y Bonsai están siempre entre las opciones. El papel «Palabra» es el sistema que va primero cuando este agente habla."
      >
        <div className="space-y-2">
          {ROLES_MOTOR.map((rol) => (
            <FilaMotor key={rol} rol={rol} config={config} actualizar={actualizar} alError={setError} />
          ))}
        </div>
        {error && <div className="mt-2"><Aviso tono="error">{error}</Aviso></div>}
      </Bloque>

      <Bloque icono={ShieldAlert} titulo="Lo de pago" estado="ficha" ayuda="Nada de pago se usa sin tu permiso. Al quitarlo, cualquier papel que usara una fuente de pago vuelve a lo gratuito.">
        <FilaInterruptor
          id="motores-permitir-pago"
          etiqueta="Permitir fuentes de pago"
          ayuda="Apagado por defecto. Las fuentes de pago cobran por uso en tu cuenta del proveedor."
          marcado={motores.permitirPago}
          alCambiar={(v) => actualizar((c) => ({ ...c, motores: permitirPago(c.motores, v) }))}
        />
      </Bloque>

      <Bloque icono={Gauge} titulo="Tope de llamadas por hora" estado="ficha" ayuda="Ninguna IA se llama en bucle ni sin tope. Se guarda en la ficha para que quien haga hablar a este agente lo respete.">
        <Deslizador
          id="motores-tope"
          etiqueta="Llamadas por hora"
          valor={motores.topePorHora}
          min={1}
          max={TOPE_POR_HORA_MAX}
          paso={1}
          alCambiar={(v) => actualizar((c) => ({ ...c, motores: ponerTopePorHora(c.motores, v) }))}
          formato={(v) => `${v} por hora`}
        />
      </Bloque>
    </div>
  );
}
