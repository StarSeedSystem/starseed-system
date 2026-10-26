"use client";
/**
 * Ventana de la Protomolécula · mandos (MIDI y Gamepad) de la molécula abierta. Une lo que ya existía y estaba
 * suelto: el enrutador de vínculos (`almacen-vinculos.ts`), los adaptadores del navegador y el modo «aprender»
 * (toca el parámetro, mueve el mando, confirma). El permiso del navegador solo se pide al pulsar «Conectar».
 * Honestidad: sin Web MIDI, sin permiso o sin mando a la vista, se dice; no se finge ningún aparato.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conectarGamepad, hayGamepad, SIN_GAMEPAD, type GamepadRaw } from "@/lib/protomolecula/adaptador-gamepad";
import { conectarMidi, pedirAccesoMidi, type NavegadorMidi } from "@/lib/protomolecula/adaptador-midi";
import { almacenNavegador } from "@/lib/protomolecula/almacen-moleculas";
import { cargarVinculos, crearEnrutador, guardarVinculos, type Enrutador } from "@/lib/protomolecula/almacen-vinculos";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";
import type { Autor, ParametroRef } from "@/lib/protomolecula/tipos";
import type { EstadoAprender, Vinculo } from "@/lib/protomolecula/vinculos-control";
import { useMolecula } from "../use-molecula";

const AUTOR: Autor = { tipo: "persona", id: "ventana" };
const TIC_MS = 250;

const idSeguro = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `vn-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface EstadoMandos { midi: string[]; gamepad: string[]; avisoMidi?: string; avisoGamepad?: string }

export function useVinculosVentana(moleculaId?: string) {
  const { controlador, estado, error } = useMolecula({ moleculaId });
  const molecula = estado?.molecula;
  const atomos = molecula?.atomos;
  const candidatos = useMemo(() => (molecula ? candidatosDe(molecula) : []), [molecula?.id, atomos]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidatosRef = useRef(candidatos);
  candidatosRef.current = candidatos;

  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [aprender, setAprender] = useState<EstadoAprender>({ fase: "inactivo" });
  const [mandos, setMandos] = useState<EstadoMandos>({ midi: [], gamepad: [] });
  const [aviso, setAviso] = useState<string | null>(null);
  const enrutador = useRef<Enrutador | null>(null);
  const soltarMidi = useRef<(() => void) | null>(null);
  const soltarGamepad = useRef<(() => void) | null>(null);
  const idMolecula = molecula?.id;

  // El enrutador vive mientras haya controlador; los vínculos viajan con la molécula en este aparato.
  useEffect(() => {
    if (!controlador || !idMolecula) { enrutador.current = null; return; }
    const almacen = almacenNavegador();
    const e = crearEnrutador({
      vinculos: cargarVinculos(almacen, idMolecula),
      parametroDe: (ref) => candidatosRef.current.find((c) => c.ref.atomoId === ref.atomoId && c.ref.parametroId === ref.parametroId)?.parametro,
      controlador,
      autor: AUTOR,
      ahora: Date.now,
      nuevoId: idSeguro,
      alCambiarVinculos: (vs) => {
        setVinculos(vs);
        if (!guardarVinculos(almacen, idMolecula, vs)) setAviso("Los vínculos funcionan, pero este navegador no deja guardarlos: se perderán al cerrar.");
      },
    });
    enrutador.current = e;
    setVinculos(e.vinculos());
    setAprender({ fase: "inactivo" });
    return () => { enrutador.current = null; };
  }, [controlador, idMolecula]);

  // Mientras se escucha, se mira cada cuarto de segundo si ya se detectó un mando o caducó la espera.
  useEffect(() => {
    if (aprender.fase !== "escuchando") return;
    const id = setInterval(() => { const e = enrutador.current; if (e) setAprender(e.tic()); }, TIC_MS);
    return () => clearInterval(id);
  }, [aprender.fase]);

  useEffect(() => () => { soltarMidi.current?.(); soltarGamepad.current?.(); }, []);

  const conectarMidiBoton = useCallback(async () => {
    const nav = typeof navigator !== "undefined" ? (navigator as unknown as NavegadorMidi) : null;
    const r = await pedirAccesoMidi(nav);
    if (!r.ok) { setMandos((m) => ({ ...m, avisoMidi: r.motivo })); return; }
    soltarMidi.current?.();
    soltarMidi.current = conectarMidi(
      r.acceso,
      (msg) => { enrutador.current?.recibir(msg); },
      (nombres) => setMandos((m) => ({ ...m, midi: nombres, avisoMidi: nombres.length ? undefined : "MIDI conectado, pero no hay ningún mando enchufado: conéctalo y se verá solo." })),
    );
  }, []);

  const conectarGamepadBoton = useCallback(() => {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || !hayGamepad(nav as unknown as { getGamepads?: unknown })) { setMandos((m) => ({ ...m, avisoGamepad: SIN_GAMEPAD })); return; }
    soltarGamepad.current?.();
    soltarGamepad.current = conectarGamepad(
      () => (Array.from(nav.getGamepads()).filter(Boolean) as unknown as GamepadRaw[]),
      (cb) => requestAnimationFrame(cb),
      (id) => cancelAnimationFrame(id),
      (msg) => { enrutador.current?.recibir(msg); },
      (ids) => setMandos((m) => ({ ...m, gamepad: ids, avisoGamepad: ids.length ? undefined : "Escuchando: pulsa un botón del mando para que el navegador lo vea." })),
    );
  }, []);

  const aprenderParametro = useCallback((ref: ParametroRef) => { const e = enrutador.current; if (e) setAprender(e.aprender(ref)); }, []);
  const cancelarAprender = useCallback(() => { const e = enrutador.current; if (e) setAprender(e.cancelar()); }, []);
  const confirmarAprender = useCallback(() => {
    const e = enrutador.current;
    if (!e) return;
    const r = e.confirmar();
    setAprender(e.estadoAprender());
    setAviso(r.ok ? "Vínculo creado." : r.motivo);
  }, []);
  const quitarVinculo = useCallback((id: string) => {
    const e = enrutador.current;
    if (e) e.fijarVinculos(e.vinculos().filter((v) => v.id !== id));
  }, []);

  return { cargando: !error && !estado, error, molecula, candidatos, vinculos, aprender, mandos, aviso, conectarMidi: conectarMidiBoton, conectarGamepad: conectarGamepadBoton, aprenderParametro, cancelarAprender, confirmarAprender, quitarVinculo };
}
