"use client";

/**
 * SuperficieMotor (LLA1108G) — la superficie de llamada común conectada al motor de verdad (`MotorLlamada`).
 * Crea el adaptador de la llamada activa, lo suscribe a la vista y pasa a la superficie las rutas de audio y el
 * sensor de proximidad del teléfono (LLA1108D). Al cerrar el resumen, quita la ventana de la llamada.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LlamadaActiva } from "@/lib/llamadas/store";
import { cerrarVentanaLlamada } from "@/lib/llamadas/acciones";
import { AdaptadorMotor } from "@/lib/llamadas/superficie/adaptador-motor";
import type { AccionesLlamada, InfoNativaLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";
import type { Invitable } from "@/lib/llamadas/superficie/grupo-invitar";
import { useLlamadaNativa } from "@/lib/llamadas/nativa/use-llamada-nativa";
import { SuperficieLlamada } from "./superficie-llamada";
import { ContextoNativoLlamada } from "./contexto-nativo";
import { depsParaLlamada, invitablesDeChats } from "./deps-motor";

const ETIQUETA_RUTA: Record<string, string> = { auricular: "Auricular", altavoz: "Altavoz", cableado: "Auriculares con cable", bluetooth: "Bluetooth" };
const VISTA_VACIA: VistaLlamada = { estado: "inactiva", tipo: "voz", nombre: "", yo: "", desde: null, local: null, remoto: null, micro: false, camara: false, compartiendoPantalla: false };
const sinBaja = () => () => undefined;

export function SuperficieMotor({ activa, alInvitarConEnlace }: { activa: LlamadaActiva; alInvitarConEnlace?: () => void }) {
  const nat = useLlamadaNativa();
  const [invitables, setInvitables] = useState<Invitable[]>([]);
  const invRef = useRef<Invitable[]>([]);
  invRef.current = invitables;
  const natRef = useRef(nat);
  natRef.current = nat;
  const [adaptador, setAdaptador] = useState<AdaptadorMotor | null>(null);

  useEffect(() => {
    const ad = new AdaptadorMotor(activa.motor, depsParaLlamada(activa, { rutasNativas: natRef.current.rutas.length, invitables: () => invRef.current }));
    setAdaptador(ad);
    return () => ad.destruir();
    // La llamada es la misma mientras sea el mismo motor.
  }, [activa.motor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true;
    void invitablesDeChats().then((l) => {
      if (vivo) setInvitables(l);
    });
    return () => {
      vivo = false;
    };
  }, [activa.sesionId]);
  useEffect(() => {
    adaptador?.refrescar();
  }, [adaptador, invitables]);

  const vista = useSyncExternalStore(adaptador ? adaptador.suscribir : sinBaja, adaptador ? adaptador.vista : () => VISTA_VACIA, () => VISTA_VACIA);

  const acciones = useMemo<AccionesLlamada>(() => ({ ...(adaptador?.acciones ?? {}), descartar: () => cerrarVentanaLlamada(), invitarConEnlace: alInvitarConEnlace }), [adaptador, alInvitarConEnlace]);

  // El sensor de proximidad solo apaga la pantalla con la llamada junto a la oreja: sin cámara y sin altavoz.
  const { permitirProximidad } = nat;
  const permitirProximidadRef = useRef(permitirProximidad);
  permitirProximidadRef.current = permitirProximidad;
  const sinImagen = !vista.camara && !vista.compartiendoPantalla && vista.tipo === "voz";
  const porAltavoz = nat.ruta === "altavoz";
  useEffect(() => {
    if (nat.disponible) void permitirProximidadRef.current(sinImagen && !porAltavoz);
  }, [nat.disponible, sinImagen, porAltavoz]);

  const info = useMemo<InfoNativaLlamada>(
    () => ({
      rutasAudio: nat.rutas.map((r) => ({ id: r, etiqueta: ETIQUETA_RUTA[r] ?? r })),
      rutaActiva: nat.ruta || null,
      elegirRuta: (id) => void nat.fijarRuta(id as never),
      cercaDeLaOreja: nat.proximidad,
    }),
    [nat.rutas, nat.ruta, nat.proximidad, nat.fijarRuta],
  );

  return (
    <ContextoNativoLlamada.Provider value={info}>
      <SuperficieLlamada vista={vista} acciones={acciones} tamanoInicial="panel" />
    </ContextoNativoLlamada.Provider>
  );
}
