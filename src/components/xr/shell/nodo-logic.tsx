"use client";

/**
 * StarSeed XR · NODO LOGIC (XR1010AG · contrato §3 d, e, j y k). Panel de control de la Trinity:
 * calidad, comodidad, entrada (`PanelVinculos`), privacidad y conexiones. Todo escribe con
 * `usePrefsXR` (XR1010C) y se ve al instante; lo que aún no tiene efecto se dice «próximamente».
 * La entrada del visor la cablea XR1010AS.
 */
import { useState, type ReactNode } from "react";
import { Container, Text } from "@react-three/uikit";
import { ANGULOS_SALTO, aplicarMovimientoReducido, type PreferenciasConfort } from "../../../lib/xr/confort";
import { CLASES_DATO, POLITICA, type ClaseDato, type Consentimiento } from "../../../lib/xr/privacidad";
import { NIVELES_CALIDAD, acotar, type EntradaXR } from "../../../lib/xr/tipos";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import { elegirTransporte, type Alcanzabilidad, type Sala } from "../../../lib/salas/sala";
import type { Gatillo } from "../../../lib/xr/vinculos-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { useCalidadDinamica } from "./use-calidad-dinamica";
import { PanelVinculos } from "./panel-vinculos";
const ACENTO = COLORES_NODO.logic, SEC = CRISTAL.textoSecundario;
const PESTANAS = [["calidad", "Calidad"], ["comodidad", "Comodidad"], ["entrada", "Entrada"], ["privacidad", "Privacidad"], ["conexiones", "Conexiones"]] as const;
type Pestana = (typeof PESTANAS)[number][0];
const ENTRADAS: EntradaXR[] = ["mandos", "manos", "mirada-pellizco", "teclado-raton", "gamepad", "tactil", "voz"];
const NOMBRE_NIVEL = { minima: "Mínima", baja: "Baja", media: "Media", alta: "Alta", maxima: "Máxima" } as const;
const NOMBRE_DATO: Record<ClaseDato, string> = {
  "camara-passthrough": "Cámara del passthrough", "mapa-sala": "Mapa de la habitación", mirada: "Mirada",
  "manos-articulaciones": "Articulaciones de las manos", biometria: "Biometría", "ubicacion-fisica": "Ubicación física",
  "voz-audio": "Voz (audio)", "voz-texto": "Voz (texto dictado)", "pose-avatar": "Pose del avatar", avatar: "Avatar", "mundo-spec": "Mundo (MundoSpec)",
};
const Opcion = ({ activa, alPulsar, children }: { activa?: boolean; alPulsar: () => void; children: ReactNode }) => (
  <Container cursor="pointer" padding={3} borderRadius={6} backgroundColor={activa ? ACENTO.base : undefined} onClick={alPulsar}>
    <Text color={CRISTAL.texto} fontSize={9}>{children}</Text></Container>);
const Grupo = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <Container flexDirection="column" gap={2}><Text color={SEC} fontSize={9}>{titulo}</Text>
    <Container flexDirection="row" gap={4}>{children}</Container></Container>);
export interface PropiedadesNodoLogic {
  entradaInicial?: EntradaXR;
  entradas?: EntradaXR[];
  sala?: Sala | null;
  alcanzabilidad?: Alcanzabilidad;
  consentimientos?: Consentimiento[];
  capturado?: Gatillo | null;
  alAvisar?: (texto: string) => void;
  alQuitarConsentimiento?: (dato: ClaseDato) => void;
  alAbrir2D?: (ruta: string) => void;
  ahora?: () => number;
}
export function NodoLogic({
  entradaInicial = "mandos", entradas = ENTRADAS, sala = null,
  alcanzabilidad = { internet: false, servidorPrivado: false, malla: false },
  consentimientos = [], capturado = null, alAvisar, alQuitarConsentimiento, alAbrir2D, ahora = Date.now,
}: PropiedadesNodoLogic) {
  const { confort, calidad, vinculos, avisos, setConfort, setCalidad, setVinculo } = usePrefsXR();
  const { nivel, cambio } = useCalidadDinamica();
  const [pestana, setPestana] = useState<Pestana>("calidad");
  const [entrada, setEntrada] = useState<EntradaXR>(entradaInicial);
  const [consents, setConsents] = useState<Consentimiento[]>(consentimientos);
  const cambiar = (c: Partial<PreferenciasConfort>) => setConfort({ ...confort, ...c });
  const quitar = (dato: ClaseDato) => { setConsents((v) => v.filter((c) => c.dato !== dato)); alQuitarConsentimiento?.(dato); };
  const vigentes = consents.filter((c) => c.vence > ahora());
  const decision = sala ? elegirTransporte(sala, alcanzabilidad) : null;
  return (
    <Container flexDirection="column" gap={8}>
      <Container flexDirection="row" gap={4}>
        {PESTANAS.map(([id, nombre]) => <Opcion key={id} activa={pestana === id} alPulsar={() => setPestana(id)}>{nombre}</Opcion>)}
      </Container>
      {pestana === "calidad" && (<>
        <Grupo titulo="Modo de calidad"><Opcion activa={calidad.modo === "auto"} alPulsar={() => setCalidad({ modo: "auto" })}>Auto</Opcion>
          {NIVELES_CALIDAD.map((n) => <Opcion key={n} activa={calidad.modo === n} alPulsar={() => setCalidad({ modo: n })}>{NOMBRE_NIVEL[n]}</Opcion>)}</Grupo>
        <Text color={CRISTAL.texto} fontSize={10}>Nivel actual: {NOMBRE_NIVEL[calidad.modo === "auto" ? nivel : calidad.modo]}</Text>
        <Text color={SEC} fontSize={9}>Último cambio: {calidad.modo === "auto" ? (cambio?.motivo ?? "sin cambios todavía") : "nivel fijado por ti"}</Text>
        {avisos.length > 0 && <Text color={SEC} fontSize={8}>{avisos.join(" · ")}</Text>}
      </>)}
      {pestana === "comodidad" && (<>
        <Grupo titulo="Giro"><Opcion activa={confort.giro === "saltos"} alPulsar={() => cambiar({ giro: "saltos" })}>Saltos</Opcion><Opcion activa={confort.giro === "continuo"} alPulsar={() => cambiar({ giro: "continuo" })}>Continuo</Opcion></Grupo>
        <Grupo titulo="Ángulo de giro">{ANGULOS_SALTO.map((a) => <Opcion key={a} activa={confort.anguloSalto === a} alPulsar={() => cambiar({ anguloSalto: a })}>{a}°</Opcion>)}</Grupo>
        <Grupo titulo="Viñeta"><Opcion activa={confort.vineta === "auto"} alPulsar={() => cambiar({ vineta: "auto" })}>Auto</Opcion><Opcion activa={confort.vineta === "siempre"} alPulsar={() => cambiar({ vineta: "siempre" })}>Siempre</Opcion><Opcion activa={confort.vineta === "nunca"} alPulsar={() => cambiar({ vineta: "nunca" })}>Nunca</Opcion></Grupo>
        <Grupo titulo="Accesibilidad">
          <Opcion activa={confort.subtitulos} alPulsar={() => cambiar({ subtitulos: !confort.subtitulos })}>Subtítulos: {confort.subtitulos ? "sí" : "no"}</Opcion>
          <Opcion activa={confort.movimientoReducido} alPulsar={() => setConfort(confort.movimientoReducido ? { ...confort, movimientoReducido: false } : aplicarMovimientoReducido({ ...confort, movimientoReducido: true }))}>Movimiento reducido: {confort.movimientoReducido ? "sí" : "no"}</Opcion>
          <Opcion activa={confort.contrasteAlto} alPulsar={() => cambiar({ contrasteAlto: !confort.contrasteAlto })}>Contraste alto: {confort.contrasteAlto ? "sí" : "no"}</Opcion>
          <Opcion activa={confort.reducirTransparencia} alPulsar={() => cambiar({ reducirTransparencia: !confort.reducirTransparencia })}>Reducir transparencias: {confort.reducirTransparencia ? "sí" : "no"}</Opcion>
        </Grupo>
        <Grupo titulo="Postura"><Opcion activa={confort.postura === "de-pie"} alPulsar={() => cambiar({ postura: "de-pie" })}>De pie</Opcion><Opcion activa={confort.postura === "sentado"} alPulsar={() => cambiar({ postura: "sentado" })}>Sentado</Opcion><Opcion activa={confort.postura === "una-mano"} alPulsar={() => cambiar({ postura: "una-mano" })}>Una mano</Opcion></Grupo>
        <Grupo titulo="Mano dominante"><Opcion activa={confort.manoDominante === "izquierda"} alPulsar={() => cambiar({ manoDominante: "izquierda" })}>Izquierda</Opcion><Opcion activa={confort.manoDominante === "derecha"} alPulsar={() => cambiar({ manoDominante: "derecha" })}>Derecha</Opcion></Grupo>
        <Grupo titulo="Escala"><Opcion alPulsar={() => cambiar({ escala: acotar(Number((confort.escala - 0.1).toFixed(1)), 0.8, 1.5) })}>−</Opcion><Text color={CRISTAL.texto} fontSize={9}>{confort.escala.toFixed(1)}×</Text><Opcion alPulsar={() => cambiar({ escala: acotar(Number((confort.escala + 0.1).toFixed(1)), 0.8, 1.5) })}>+</Opcion></Grupo>
        <Grupo titulo="Altura de ojos"><Opcion activa={confort.alturaOjos === null} alPulsar={() => cambiar({ alturaOjos: null })}>Automática</Opcion><Opcion alPulsar={() => cambiar({ alturaOjos: acotar(Number(((confort.alturaOjos ?? 1.6) - 0.05).toFixed(2)), 0.8, 2.1) })}>−</Opcion><Text color={CRISTAL.texto} fontSize={9}>{confort.alturaOjos === null ? "la que mide el visor" : `${confort.alturaOjos.toFixed(2)} m`}</Text><Opcion alPulsar={() => cambiar({ alturaOjos: acotar(Number(((confort.alturaOjos ?? 1.6) + 0.05).toFixed(2)), 0.8, 2.1) })}>+</Opcion></Grupo>
      </>)}
      {pestana === "entrada" && (<>
        <Grupo titulo="Forma de entrada presente">{entradas.map((e) => <Opcion key={e} activa={entrada === e} alPulsar={() => setEntrada(e)}>{e}</Opcion>)}</Grupo>
        <PanelVinculos entrada={entrada} mapas={vinculos} alGuardar={(e, m) => setVinculo({ ...vinculos, [e]: m })} capturado={capturado} alAvisar={alAvisar} />
      </>)}
      {pestana === "privacidad" && (<>
        <Grupo titulo="Qué sale del aparato">
          {CLASES_DATO.map((d) => {
            const p = POLITICA[d], nunca = p.libre === "dispositivo" && p.conConsentimiento === null;
            return (<Container key={d} flexDirection="column" padding={2}>
              <Text color={CRISTAL.texto} fontSize={9}>{NOMBRE_DATO[d]} · {nunca ? "nunca sale del aparato" : `hasta ${p.libre}${p.conConsentimiento ? `; con permiso, hasta ${p.conConsentimiento}` : ""}`}</Text>
              <Text color={SEC} fontSize={8}>{p.motivo}</Text></Container>);
          })}
        </Grupo>
        <Grupo titulo="Consentimientos vigentes">
          {vigentes.length === 0 ? <Text color={SEC} fontSize={9}>Ninguno vigente.</Text> : vigentes.map((c) => (
            <Container key={c.dato} flexDirection="row" gap={6} alignItems="center">
              <Text color={CRISTAL.texto} fontSize={9}>{NOMBRE_DATO[c.dato]} hasta {c.hasta} · caduca {new Date(c.vence).toLocaleString("es-ES")}</Text>
              <Opcion alPulsar={() => quitar(c.dato)}>Quitar</Opcion>
            </Container>))}
        </Grupo>
      </>)}
      {pestana === "conexiones" && (<>
        <Text color={CRISTAL.texto} fontSize={10}>Transporte actual: {decision?.transporte ?? "sin sala abierta"}</Text>
        <Text color={SEC} fontSize={9}>{decision?.motivo ?? "Abre una sala para ver por dónde viajan sus cambios."}</Text>
        {alAbrir2D ? <Opcion alPulsar={() => alAbrir2D("/servidores")}>Abrir /servidores</Opcion> : <Text color={SEC} fontSize={8}>Ir a /servidores: próximamente, lo cablea XR1010AS.</Text>}
      </>)}
    </Container>
  );
}
export default NodoLogic;