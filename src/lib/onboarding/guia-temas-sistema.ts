/**
 * Guías de introducción · textos del sistema (GUI1021A, Ola 1021G).
 * ═══════════════════════════════════════════════════════════════════════════
 * Una sola fuente de textos que usan a la vez el tour de Aurora y las tarjetas de la Guía de la red
 * (`architecture/guias-introduccion.md` §2). Los textos son los de §3, copiados tal cual: si cambian,
 * se cambian allí primero y la prueba de este módulo lo exige.
 *
 * `ruta` es la ruta real a la que llevan «Ir» y «Hazlo por mí». Dos temas no tienen una página propia:
 * las capas de conciencia viven en la configuración de Astraura (sección «Inteligencia»; el panel
 * exacto lo abre `openAstrauraConfig("inteligencia")`), y su ruta es la de esa configuración.
 *
 * Módulo PURO: sin React ni `node:*`; lo importan componentes de cliente.
 */

/** Un tema de la guía. `voz` es la versión corta que narra Aurora. */
export interface TemaGuia {
  key: string;
  titulo: string;
  cuerpo: string;
  voz: string;
  ruta: string;
  preguntaAurora: string;
  puntos: readonly string[];
}

/** Protomolécula, malla, capas de conciencia y neuronas/cerebro, en el orden del tour. */
export const TEMAS_SISTEMA: readonly TemaGuia[] = [
  {
    key: "protomolecula", titulo: "Protomolécula", ruta: "/protomolecula",
    cuerpo: "La Protomolécula es la función universal de creación: une programas abiertos de imagen, audio, vídeo, 3D, físicas y realidad extendida bajo un mismo panel de parámetros. Cada creación es una molécula viva hecha de átomos (herramientas), que puedes manejar a mano, dictando o pidiéndoselo a Astraura. Cita en vez de copiar, y su orbe 4D te acompaña: arrástrala al borde izquierdo para apagarla.",
    voz: "La Protomolécula une programas abiertos de imagen, audio, vídeo y 3D en un solo panel. Tus creaciones son moléculas vivas hechas de átomos.",
    preguntaAurora: "Aurora, abre la Protomolécula",
    puntos: ["moléculas con su ámbito (personal, perfil, grupo, pública)", "átomos = herramientas, con su grado de integración", "a mano, por dictado o con Astraura", "la IA propone y tú aceptas", "orbe 4D de geometría sagrada"],
  },
  {
    key: "malla", titulo: "Redes mesh", ruta: "/red-mesh",
    cuerpo: "Tus aparatos forman una malla: se vinculan solos entre sí cuando hay dos o más conectados de tu cuenta, y pueden hablar sin internet con un código o un QR, por Wi‑Fi o por radio LoRa (Meshtastic). Por radio viajan mensajes cortos, nunca audio. Con otras cuentas solo hay vínculo si las dos lo aceptan, y nada privado viaja sin cifrar.",
    voz: "La malla une tus aparatos y funciona incluso sin internet, por Wi‑Fi, por código QR o por radio LoRa.",
    preguntaAurora: "Aurora, abre la red mesh",
    puntos: ["autovínculo de tus neuronas", "sin internet: QR o código", "LoRa para texto corto", "malla y Wi‑Fi a la vez", "posición apagada por defecto y tú decides qué retransmites"],
  },
  {
    key: "capas-conciencia", titulo: "Capas de conciencia", ruta: "/agent?tab=config-ia",
    cuerpo: "Astraura piensa en cuatro capas: local (tu aparato), malla (tus otras neuronas), nube y colectiva. Puedes encender o apagar cada una y decir cuánto prefieres lo local; si apagas la malla, nada entra ni sale por ella. Lo pesado lo prestan servidores de la red cuando tu aparato no puede, y tus datos viajan con capas de seguridad: identidad propia, cifrado de extremo a extremo y claves que cambian solas.",
    voz: "Astraura piensa en cuatro capas: local, malla, nube y colectiva. Tú decides cuáles usa.",
    preguntaAurora: "Aurora, enséñame mis capas de conciencia",
    puntos: ["los cuatro puntos de la píldora en el chat", "lo local primero", "servidores que prestan capacidad", "cifrado de extremo a extremo", "la capa colectiva está en camino"],
  },
  {
    key: "neuronas-cerebro", titulo: "Neuronas y cerebro", ruta: "/cerebro",
    cuerpo: "Cada aparato donde usas StarSeed es una neurona, y cada forma de abrirlo (navegador, app) es un medio. Tus neuronas alimentan tu cerebro: memorias, baúles, conexiones, IA, permisos y servidores. Tienes un cerebro por cuenta, con su parte privada y la pública de tus grupos y páginas; puedes fusionar cerebros o vincularlos por telepatía sin mezclarlos.",
    voz: "Cada aparato es una neurona de tu cerebro. Tu cerebro guarda memorias, conexiones y permisos.",
    preguntaAurora: "Aurora, abre mi cerebro",
    puntos: ["neurona = aparato, medio = forma de abrirlo", "un cerebro por cuenta, privado y público", "fusionar o telepatía", "privacidad y cifrado por memoria o carpeta", "Google Drive como medio de memoria"],
  },
];
