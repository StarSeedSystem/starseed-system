"use client";

/*
 * MallaNeuronasMount — punto de montaje ÚNICO de la malla de neuronas (Ola 366).
 * ---------------------------------------------------------------------------
 * Arranca, UNA vez por sesión, el motor `useMallaNeuronas()` (detección +
 * auto-vínculo entre las neuronas de la cuenta + radar de otras cuentas) y,
 * desde la Ola 370, `useVinculosEntreCuentas()` (vínculo ENTRE cuentas con
 * consentimiento — mesh de par dedicado, separado del intra-cuenta).
 * Hermano de `SovereignSyncMount`/`RealtimeSyncProvider` en el layout raíz —
 * mismo patrón: degrada en silencio sin sesión/WebRTC. Desde la Ola 369
 * también pinta las tarjetas flotantes de ofertas de archivo ENTRANTES (ver
 * `TransferenciasArchivoToast`) para que lleguen aunque el panel esté cerrado
 * — es lo único que este montaje dibuja; todo lo demás sigue siendo motor puro.
 *
 * Excluido de las RUTAS_CONSOLA (`/genesis`, `/voces`, ver
 * `solo-fuera-de-consola.tsx`): son herramientas de trabajo en máquinas de
 * 8 GB donde cada suscripción/timer de más le quita sitio a un agente — el
 * mismo motivo por el que esas rutas ya excluyen `AppGlobals`.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { useMallaNeuronas } from "@/lib/network/malla-neuronas";
import { startMeshSubsystem, subscribeNearby, getNearbyBeacons } from "@/ai/astraura/mesh";

/*
 * (2026-09-27) Todo lo que no es detectar/vincular se carga PEREZOSO: relés de IA
 * (`astraura.*`, `ia.*`), archivos (`archivo.*`) y vínculos entre cuentas. Medido: con
 * esos módulos importados de forma estática en este montaje (que va en el layout raíz de
 * TODAS las rutas) y el relé genérico dentro de `providers/index.ts`, la compilación de
 * Vercel pasó de ~3 min a 27,6 min y la de la Mac no terminaba. Cargados después del
 * primer pintado, funcionan igual y no pesan en cada ruta.
 */
const TransferenciasArchivoToast = dynamic(
  () => import("@/components/network/transferencias-archivo-panel").then((m) => m.TransferenciasArchivoToast),
  { ssr: false },
);
const EtiquetaSinInternet = dynamic(() => import("@/components/network/etiqueta-sin-internet").then((m) => m.EtiquetaSinInternet), { ssr: false });
const MallaVinculosMotor = dynamic(() => import("@/components/network/malla-vinculos-motor"), { ssr: false });
// (2026-10-10) Llamada directa sin internet (timbre y llamada en curso), por enlaces emparejados.
const LlamadaDirectaFlotante = dynamic(
  () => import("@/components/network/llamada-directa-flotante").then((m) => m.LlamadaDirectaFlotante),
  { ssr: false },
);
// (2026-11-07 · MSH1107A) Ventana de solicitud de sincronización entre neuronas y aviso «Vinculadas».
const SolicitudSincronizacionFlotante = dynamic(
  () => import("@/components/network/solicitud-sincronizacion").then((m) => m.SolicitudSincronizacionFlotante),
  { ssr: false },
);

/** Arranca un motor cargado a demanda y devuelve su parada (si la tiene). */
function useMotorPerezoso(cargar: () => Promise<() => void | (() => void)>) {
  useEffect(() => {
    let parar: void | (() => void);
    let vivo = true;
    cargar()
      .then((iniciar) => {
        if (vivo) parar = iniciar();
      })
      .catch(() => {
        /* sin el motor, la malla sigue detectando y vinculando */
      });
    return () => {
      vivo = false;
      if (typeof parar === "function") parar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function MallaNeuronasEngine() {
  useMallaNeuronas({
    startBeaconLayer: startMeshSubsystem,
    subscribeNearby,
    getNearbyNow: getNearbyBeacons,
  });
  // (Ola 367) Rol SERVIDOR de Astraura por la malla: atiende `astraura.pedir`
  // de otros peers cuando esta neurona puede relayar (mismo mesh compartido,
  // nunca uno propio). Arranca UNA vez por sesión, junto con el motor.
  useMotorPerezoso(() => import("@/lib/network/astraura-por-malla").then((m) => m.iniciarServidorAstrauraPorMalla));
  // (Ola 368) Rol SERVIDOR del relé GENÉRICO `ia-malla`: atiende `ia.pedir`
  // (namespace `ia.*`, disjunto de `astraura.*`) sobre el MISMO mesh
  // compartido — coexisten sin pisarse.
  useMotorPerezoso(() => import("@/lib/network/ia-por-malla").then((m) => m.iniciarServidorIaPorMalla));
  // (Ola 1018H · I) Rol SERVIDOR del relé `capacidad.video.render`: atiende
  // `capacidad.pedir` tipo `render` sobre el MISMO mesh compartido — el relé
  // de `video-por-malla-relay.ts` aplica las puertas puras de `video-por-malla.ts`,
  // encola en el servicio «hyperframes» de esta neurona y contesta la
  // REFERENCIA por `trabajoId`.
  useMotorPerezoso(() => import("@/lib/network/video-por-malla-relay").then((m) => m.iniciarServidorRenderPorMalla));
  // (Ola 369) Motor de ARCHIVOS por la malla: namespace `archivo.*`, mismo
  // mesh compartido de siempre. Lo que llega se decide aquí (global) para
  // que llegue con el panel cerrado: desde ARC1108A, UNA ventana por envío
  // (`envios-entrantes.tsx`) en vez de una tarjeta por archivo; el resto de
  // la UI (botón «Enviar archivo», lista de transferencias) vive en
  // `MallaNeuronasPanel`.
  useMotorPerezoso(() => import("@/lib/network/archivos-malla").then((m) => m.iniciarMotorArchivosPorMalla));
  // (2026-10-10) Transporte universal: recepción de mensajes `tu.*` por la malla de la cuenta,
  // vínculos, enlaces locales sin internet, relé y LoRa (`architecture/transporte-universal-sin-internet.md`).
  useMotorPerezoso(() => import("@/lib/malla/transporte-universal").then((m) => m.iniciarTransporteUniversal));
  // (2026-11-07 · MSJ1107A) Buzón de Mensajería por la malla: chats con las neuronas de los cerebros
  // (canal «neurona» + canal de la cuenta) y mensajes de chats que viajan solo por la malla.
  useMotorPerezoso(() => import("@/lib/mensajeria/neuronas/buzon").then((m) => m.iniciarBuzonMalla));
  // (2026-11-07 · MSH1107A) Sincronización entre neuronas: solicitud/aceptación firmadas por el canal
  // local nativo (sin internet), el transporte universal o el relé; vínculos recordados y reconexión
  // sola (`architecture/sincronizacion-neuronas.md`).
  useMotorPerezoso(() => import("@/lib/malla/sincronizacion-neuronas-motor").then((m) => m.iniciarSincronizacionNeuronas));
  // (2026-11-07 · VIN1107A) Capas de conciencia que esta neurona anuncia a las vinculadas (el panel del
  // vínculo dice cuáles se comparten) y clave de faro de la cuenta para la app nativa (sin ella el faro
  // es anónimo y las neuronas propias salen en «otras cuentas cerca»). Solo la app nativa toca el faro.
  useMotorPerezoso(() => import("@/lib/malla/anuncio-capas").then((m) => m.iniciarAnuncioCapas));
  useMotorPerezoso(() => import("@/lib/nativa/faro-clave-cuenta").then((m) => m.iniciarClaveFaroNativa));
  // (2026-11-08 · OFF1108A) Arranque sin internet: espejo de la instantánea de la cuenta (huellas probadas
  // de las neuronas propias), aprendizaje de lo que se liga por prueba de cuenta y reintento inmediato del
  // buzón al ligarse una neurona (`architecture/apps-autonomas-sin-internet.md`).
  useMotorPerezoso(() => import("@/lib/sin-internet/arranque-sin-red").then((m) => m.iniciarArranqueSinRed));
  // (Ola 370) Motor de vínculos ENTRE cuentas: sondea mis solicitudes/vínculos
  // y abre (o cierra) el mesh de par dedicado de cada uno ya `aceptado`. Mesh
  // COMPLETAMENTE separado del intra-cuenta de arriba — ver
  // `architecture/vinculos-entre-cuentas.md`.
  return (
    <>
      <MallaVinculosMotor />
      <TransferenciasArchivoToast />
      <LlamadaDirectaFlotante />
      <SolicitudSincronizacionFlotante />
      <EtiquetaSinInternet />
    </>
  );
}

export function MallaNeuronasMount() {
  const ruta = usePathname();
  if (esRutaConsola(ruta)) return null;
  return <MallaNeuronasEngine />;
}
