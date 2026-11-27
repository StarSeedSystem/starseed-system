"use client";

/*
 * AjustesNfc — «NFC y cercanía» en los ajustes de la neurona (NFC1126C, contrato: architecture/nfc-neuronas.md §3 y §6).
 * Componente controlado: recibe las preferencias y avisa de cada cambio; guardar y sincronizar con la cuenta
 * lo hace quien lo monta. Las reglas de seguridad las aplica `sanear` (lo ajeno nunca tiene lo que no debe).
 */

import { useState } from "react";
import { Nfc, RotateCcw, ShieldCheck } from "lucide-react";
import {
  ACCIONES, ACCIONES_SOLO_PROPIAS, RELACIONES, dejarDeIgnorar, esIgnorada, esRecordada, establecerRelacion,
  ignorar, olvidar, preferenciasPorDefecto, quitarExcepcion, recordar, sanear, type Accion, type AvisoEncuentro,
  type PerfilVisible, type PreferenciasNfc, type PreferenciasRelacion, type Relacion, type UbicacionEncuentro,
} from "@/lib/nfc/preferencias";
import { describirCapacidad, type EntornoNfc, type ViaAcercar } from "@/lib/nfc/respaldo";

export interface NeuronaConocida { id: string; nombre: string }

export interface PropsAjustesNfc {
  prefs: PreferenciasNfc;
  onCambiar: (p: PreferenciasNfc) => void;
  /** Lo que puede hacer este aparato (`nfc_capacidad`). */
  entorno: EntornoNfc;
  neuronas?: NeuronaConocida[];
}

const NOMBRE_REL: Record<Relacion, string> = {
  misma_cuenta: "Misma cuenta", cuenta_reconocida: "Cuenta reconocida", cuenta_nueva: "Cuenta nueva",
  nodo_propio: "Nodo propio", nodo_publico: "Nodo público", etiqueta: "Etiqueta pasiva",
};
const NOMBRE_ACCION: Record<Accion, string> = {
  anadir_contacto: "Añadir a contactos", mandar_mensaje: "Mandar mensaje", enviar_archivo: "Enviar archivo o folder",
  enviar_cerebro: "Enviar cerebro", crear_grupo: "Crear grupo con los presentes", invitar_grupo: "Invitar a grupo o comunidad",
  compartir_capacidades: "Compartir capacidades", compartir_almacenamiento: "Compartir almacenamiento",
  compartir_senales: "Compartir señales", compartir_internet: "Compartir internet", vincular_capa: "Vincular capa de conciencia",
  control_remoto: "Control remoto local", acceso_cerebros: "Acceso a cerebros", registrar_entrada_evento: "Registro de entrada a evento",
  abrir_oferta_nodo: "Abrir la oferta del nodo", registrar_ubicacion: "Registrar ubicación en el mapa",
};
const NOMBRE_VIA: Record<ViaAcercar, string> = { nfc: "NFC", ble: "Bluetooth muy cerca", qr: "Código QR" };
const NOMBRE_NFC: Record<EntornoNfc["nfc"], string> = {
  lector: "lee y emite por NFC", emulador: "emite su tarjeta por NFC", lector_usb: "usa un lector USB (PC/SC)",
  web: "solo lee NFC en el navegador", ninguno: "no tiene NFC",
};

type Nivel = "no" | "ofrecida" | "auto";
const BOTON = "min-h-9 cursor-pointer rounded-lg border px-3 text-sm transition-colors duration-200";
const ELIGE = "cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm";

export function AjustesNfc({ prefs, onCambiar, entorno, neuronas = [] }: PropsAjustesNfc) {
  const [rel, setRel] = useState<Relacion>("misma_cuenta");
  const cap = describirCapacidad(entorno);
  const p = prefs.porRelacion[rel];
  const propia = rel === "misma_cuenta" || rel === "nodo_propio";
  const cambiar = (c: Partial<PreferenciasRelacion>) => onCambiar(establecerRelacion(prefs, rel, c));
  const nivel = (a: Accion): Nivel => (p.automaticas.includes(a) ? "auto" : p.ofrecidas.includes(a) ? "ofrecida" : "no");
  const poner = (a: Accion, n: Nivel) => {
    const ofr = p.ofrecidas.filter((x) => x !== a), aut = p.automaticas.filter((x) => x !== a);
    cambiar({ ofrecidas: n === "no" ? ofr : [...ofr, a], automaticas: n === "auto" ? [...aut, a] : aut });
  };
  const puedeAuto = (a: Accion) => sanear(rel, { ...p, ofrecidas: [a], automaticas: [a] }).automaticas.includes(a);
  const conRespaldo = cap.nfc === "ninguno" || cap.nfc === "web";

  return (
    <section className="w-full max-w-full space-y-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl" aria-label="NFC y cercanía">
      <header className="flex items-center gap-2"><Nfc className="h-5 w-5 shrink-0" aria-hidden /><h2 className="text-base font-semibold">NFC y cercanía</h2></header>
      <p className="break-words text-sm opacity-80" data-testid="nfc-capacidad">
        Este aparato {NOMBRE_NFC[entorno.nfc]}.{" "}
        {cap.via ? `Vía principal: ${NOMBRE_VIA[cap.via]}.` : "No tiene ninguna vía para acercar."}
        {conRespaldo ? ` Respaldo: ${cap.respaldo.map((v) => NOMBRE_VIA[v]).join(" o ") || "ninguno"}.` : ""}
      </p>
      <div className="flex flex-wrap gap-2" role="tablist">
        {RELACIONES.map((r) => (
          <button key={r} role="tab" aria-selected={r === rel} onClick={() => setRel(r)}
            className={`${BOTON} ${r === rel ? "border-emerald-400/60 bg-emerald-400/15" : "border-white/15"}`}>{NOMBRE_REL[r]}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">Tu perfil
          <select className={ELIGE} value={p.perfil} onChange={(e) => cambiar({ perfil: e.target.value as PerfilVisible })}>
            <option value="mostrar">Mostrar públicamente</option><option value="pedir">Pedir permiso</option><option value="ocultar">No mostrar</option>
          </select></label>
        <label className="grid gap-1 text-sm">Avisos
          <select className={ELIGE} value={p.aviso} onChange={(e) => cambiar({ aviso: e.target.value as AvisoEncuentro })}>
            <option value="notificar">Notificar</option><option value="silenciar">Silenciar</option>
          </select></label>
        <label className="grid gap-1 text-sm">Ubicación en el mapa
          <select className={ELIGE} value={p.ubicacion} onChange={(e) => cambiar({ ubicacion: e.target.value as UbicacionEncuentro })}>
            <option value="no">No registrar</option><option value="privada">Privada</option><option value="publica">Pública</option>
          </select></label>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ACCIONES.filter((a) => propia || !ACCIONES_SOLO_PROPIAS.includes(a)).map((a) => (
          <li key={a} className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{NOMBRE_ACCION[a]}</span>
            <select aria-label={NOMBRE_ACCION[a]} className={ELIGE} value={nivel(a)} onChange={(e) => poner(a, e.target.value as Nivel)}>
              <option value="no">No</option><option value="ofrecida">Ofrecer</option>
              <option value="auto" disabled={!puedeAuto(a)}>Automática</option>
            </select>
          </li>
        ))}
      </ul>
      {neuronas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Neuronas concretas</h3>
          <ul className="space-y-2">
            {neuronas.map((n) => {
              const ign = esIgnorada(prefs, n.id), rec = esRecordada(prefs, n.id), exc = n.id in prefs.porNeurona;
              return (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{n.nombre}{exc ? " · con excepción" : ""}</span>
                  <span className="flex flex-wrap gap-2">
                    <button className={`${BOTON} border-white/15`} onClick={() => onCambiar(ign ? dejarDeIgnorar(prefs, n.id) : ignorar(prefs, n.id))}>{ign ? "Dejar de ignorar" : "Ignorar"}</button>
                    <button className={`${BOTON} border-white/15`} onClick={() => onCambiar(rec ? olvidar(prefs, n.id) : recordar(prefs, n.id))}>{rec ? "Olvidar" : "Recordar"}</button>
                    {exc && <button className={`${BOTON} border-white/15`} onClick={() => onCambiar(quitarExcepcion(prefs, n.id))}>Quitar excepción</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="flex min-w-0 items-center gap-2 text-xs opacity-70"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />Con otras cuentas nada es automático sin tu permiso.</span>
        <button className={`${BOTON} flex shrink-0 items-center gap-2 border-white/15`} onClick={() => onCambiar(preferenciasPorDefecto())}>
          <RotateCcw className="h-4 w-4" aria-hidden />Volver a lo seguro</button>
      </footer>
    </section>
  );
}
