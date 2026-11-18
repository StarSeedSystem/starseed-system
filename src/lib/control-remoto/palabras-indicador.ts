/**
 * CTL1117I · las palabras del indicador de control (el punto de la esquina, su panelito, los ajustes de este aparato y los
 * puntos de color de «quién es quién»), en español llano y en un solo sitio.
 */

export const PALABRAS_INDICADOR = {
    titulo: "Cómo se ve que te controlan",
    indicador: {
        etiqueta: "Indicador en pantalla",
        punto: "Punto en la esquina",
        oculto: "Oculto",
        ayudaPunto: "Un punto pequeño en la esquina, del color de quien controla; tócalo para ver quién es y terminar.",
        ayudaOculto: "No se dibuja nada en la pantalla; lo ves y lo terminas aquí, en este panel.",
    },
    toques: {
        etiqueta: "Ver los toques de quien controla",
        ayuda: "Cada toque o tecla de quien controla se marca en tu pantalla con su color, para saber quién hace qué.",
        mios: "Tus toques",
        si: "sí",
        no: "no",
    },
    siempre: "El aviso en las notificaciones sigue ahí siempre que alguien controla este aparato.",
    sinNativo: "Estos dos ajustes son de la app de Android: este aparato no tiene control de pantalla propio, así que aquí aparecen apagados.",
    guardando: "Guardando…",
    noSePudo: "No se pudo guardar el cambio en este aparato.",
    ahora: {
        nadie: "Ahora nadie controla este aparato.",
        controla: (nombre: string, nivel: string, desde: string) => `${nombre} controla este aparato (nivel ${nivel}) desde las ${desde}.`,
        terminar: "Terminar",
    },
    punto: {
        etiqueta: (nombre: string) => `Controla este aparato: ${nombre}. Pulsa para ver quién es o terminar.`,
        panelTitulo: "Control entre mis neuronas",
        quien: "Controla",
        nivel: "Nivel",
        desde: "Desde",
        color: "Color",
        terminar: "Terminar",
        cerrar: "Cerrar",
    },
    color: {
        titulo: "Color público de esta neurona",
        ayuda: "Es el color con el que te reconocen las demás neuronas: el punto de quien controla, sus toques y lo que escribe. Se publica con el resto de datos de la neurona.",
        paleta: "Colores sugeridos",
        propio: "Otro color (#rrggbb)",
        usar: "Usar este color",
        porDefecto: "Volver al color de siempre",
        invalido: "Escribe el color como #rrggbb, por ejemplo #3c9fdd.",
        elegido: (nombre: string) => `Color ${nombre}`,
    },
    quien: (nombre: string, color: string) => `${nombre} (color ${color})`,
} as const;
