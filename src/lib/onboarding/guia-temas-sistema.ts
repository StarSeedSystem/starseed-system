/**
 * Temas de la guía de introducción: EL SISTEMA explicado (Ola 1021G · GUI1021A).
 * Fuente de verdad de los textos: `architecture/guias-introduccion.md` §3 — se
 * copian tal cual, sin inventar nada. Módulo puro: sin red, sin disco ni procesos;
 * lo consumen a la vez el tour y las tarjetas de la Guía de la red.
 *
 * Honestidad (§2): lo que aún no existe no se presenta como hecho. La
 * verificación biométrica de «una persona, una voz» no existe: no se menciona.
 */

export interface TemaGuia {
  /** Clave única del tema. */
  key: string;
  /** Título legible en la tarjeta y el paso del tour. */
  titulo: string;
  /** Texto completo que se muestra en la tarjeta. */
  cuerpo: string;
  /** Versión corta que narra Aurora en el tour. */
  voz: string;
  /** Ruta real a la que lleva «Ir» (capas de conciencia lleva a Ajustes). */
  ruta: string;
  /** Orden de ejemplo que la persona puede decir a Aurora. */
  preguntaAurora: string;
  /** Puntos clave, uno por línea. */
  puntos: string[];
}

export const TEMAS_SISTEMA: TemaGuia[] = [
  {
    key: "protomolecula",
    titulo: "Protomolécula",
    cuerpo: "La Protomolécula es la función universal de creación: une programas abiertos de imagen, audio, vídeo, 3D, físicas y realidad extendida bajo un mismo panel de parámetros. Cada creación es una molécula viva hecha de átomos (herramientas), que puedes manejar a mano, dictando o pidiéndoselo a Astraura. Cita en vez de copiar, y su orbe 4D te acompaña: arrástrala al borde izquierdo para apagarla.",
    voz: "La Protomolécula une programas abiertos de imagen, audio, vídeo y 3D en un solo panel. Tus creaciones son moléculas vivas hechas de átomos.",
    ruta: "/protomolecula",
    preguntaAurora: "Aurora, abre la Protomolécula",
    puntos: [
      "moléculas con su ámbito (personal, perfil, grupo, pública)",
      "átomos = herramientas, con su grado de integración",
      "a mano, por dictado o con Astraura",
      "la IA propone y tú aceptas",
      "orbe 4D de geometría sagrada",
    ],
  },
  {
    key: "malla",
    titulo: "Redes mesh",
    cuerpo: "Tus aparatos forman una malla: se vinculan solos entre sí cuando hay dos o más conectados de tu cuenta, y pueden hablar sin internet con un código o un QR, por Wi‑Fi o por radio LoRa (Meshtastic). Por radio viajan mensajes cortos, nunca audio. Con otras cuentas solo hay vínculo si las dos lo aceptan, y nada privado viaja sin cifrar.",
    voz: "La malla une tus aparatos y funciona incluso sin internet, por Wi‑Fi, por código QR o por radio LoRa.",
    ruta: "/red-mesh",
    preguntaAurora: "Aurora, abre la red mesh",
    puntos: [
      "autovínculo de tus neuronas",
      "sin internet: QR o código",
      "LoRa para texto corto",
      "malla y Wi‑Fi a la vez",
      "posición apagada por defecto y tú decides qué retransmites",
    ],
  },
  {
    key: "capas-conciencia",
    titulo: "Capas de conciencia",
    cuerpo: "Astraura piensa en cuatro capas: local (tu aparato), malla (tus otras neuronas), nube y colectiva. Puedes encender o apagar cada una y decir cuánto prefieres lo local; si apagas la malla, nada entra ni sale por ella. Lo pesado lo prestan servidores de la red cuando tu aparato no puede, y tus datos viajan con capas de seguridad: identidad propia, cifrado de extremo a extremo y claves que cambian solas.",
    voz: "Astraura piensa en cuatro capas: local, malla, nube y colectiva. Tú decides cuáles usa.",
    ruta: "/cuenta?section=aurora-ia",
    preguntaAurora: "Aurora, enséñame mis capas de conciencia",
    puntos: [
      "los cuatro puntos de la píldora en el chat",
      "lo local primero",
      "servidores que prestan capacidad",
      "cifrado de extremo a extremo",
      "la capa colectiva está en camino",
    ],
  },
  {
    key: "neuronas-cerebro",
    titulo: "Neuronas y cerebro",
    cuerpo: "Cada aparato donde usas StarSeed es una neurona, y cada forma de abrirlo (navegador, app) es un medio. Tus neuronas alimentan tu cerebro: memorias, baúles, conexiones, IA, permisos y servidores. Tienes un cerebro por cuenta, con su parte privada y la pública de tus grupos y páginas; puedes fusionar cerebros o vincularlos por telepatía sin mezclarlos.",
    voz: "Cada aparato es una neurona de tu cerebro. Tu cerebro guarda memorias, conexiones y permisos.",
    ruta: "/cerebro",
    preguntaAurora: "Aurora, abre mi cerebro",
    puntos: [
      "neurona = aparato, medio = forma de abrirlo",
      "un cerebro por cuenta, privado y público",
      "fusionar o telepatía",
      "privacidad y cifrado por memoria o carpeta",
      "Google Drive como medio de memoria",
    ],
  },
];

/** Devuelve el tema por su clave única, o `undefined` si no existe. */
export function temaPorClave(key: string): TemaGuia | undefined {
  return TEMAS_SISTEMA.find((t) => t.key === key);
}
