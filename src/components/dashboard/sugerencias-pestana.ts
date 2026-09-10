// ════════════════════════════════════════════════════════════════
// Sugerencias por pestaña — qué widget tiene sentido en cada panel
// ----------------------------------------------------------------
// Hoy el catálogo de «añadir widget» ofrece los 104 tipos por igual,
// sin mirar de qué va la pestaña ni qué hay ya dentro. Este módulo
// puntúa cada tipo del manifiesto con tres criterios y devuelve un
// puñado de sugerencias, cada una con su motivo escrito en español:
//   1. el TÍTULO de la pestaña empuja su categoría (sin acentos ni
//      mayúsculas, y aceptando sinónimos razonables);
//   2. lo que YA ESTÁ dentro no se repite, y su categoría pesa un
//      poco menos para que la pestaña no acabe siendo siete variantes
//      de lo mismo;
//   3. la `relevance` del manifiesto como base.
// Una pestaña vacía recibe una mezcla equilibrada de categorías, no
// las seis de mayor `relevance` (que serían todas de gobernanza).
//
// Módulo PURO: sin red, sin disco, sin efectos. Solo lee el manifiesto.
// ════════════════════════════════════════════════════════════════

import type { WidgetType } from "./dashboard-types";
import { WIDGET_MANIFEST, type WidgetManifestEntry } from "./widget-manifest";

/** Lo que sabemos de la pestaña en la que el usuario va a añadir algo. */
export interface ContextoPestana {
    /** Título que el usuario le puso al panel («Mi Economía», «Clima»…). */
    titulo: string;
    /** Widgets que ya viven en esa pestaña. */
    widgetsPresentes: WidgetType[];
    /** Categorías que la pestaña ya declara (id de widget-categories.ts). */
    categoriasPresentes: string[];
}

/** Una recomendación concreta, siempre con el porqué visible para la persona. */
export interface Sugerencia {
    tipo: WidgetType;
    /** Explicación en español de POR QUÉ se sugiere este widget aquí. */
    motivo: string;
    /** Mayor es mejor. Escala interna, solo sirve para ordenar. */
    puntuacion: number;
}

// ── Pesos del criterio ───────────────────────────────────────────
/** Cuánto empuja que el título de la pestaña nombre esa categoría. */
const PESO_TITULO = 2;
/** La categoría ya presente sigue valiendo, pero pesa menos. */
const FACTOR_CATEGORIA_PRESENTE = 0.75;
/** Repetir categoría dentro de la misma tanda: castigo fuerte… */
const DECAIMIENTO_NEUTRO = 0.5;
/** …salvo si el título pide esa categoría, donde repetir es lo correcto. */
const DECAIMIENTO_AFIN = 0.72;
/** Relevancia supuesta cuando el manifiesto no declara ninguna. */
const RELEVANCIA_POR_DEFECTO = 50;

// ── Nombres legibles ─────────────────────────────────────────────
// Espejo de `widget-categories.ts` (mismos ids) más las dos categorías
// que solo existen dentro del manifiesto: `ontocracia` y `comunicacion`.
// Se copia el rótulo en vez de importar WIDGET_CATEGORIES porque aquel
// módulo arrastra iconos de lucide-react y este debe seguir siendo puro.
const NOMBRE_CATEGORIA: Record<string, string> = {
    ontocracia: "Política",
    comunicacion: "Comunicación",
    politica: "Política",
    parlamento: "Parlamento",
    economia: "Economía",
    educacion: "Educación",
    cultura: "Cultura",
    social: "Social",
    clima: "Clima",
    productividad: "Productividad",
    ubicacion: "Ubicación",
    utilidades: "Utilidades",
    arte: "Arte",
    astronomia: "Astronomía",
    astrologia: "Astrología",
    sistema: "Sistema",
    personalizacion: "Personalización",
    archivos: "Archivos",
    entretenimiento: "Entretenimiento",
    ia: "IA",
    ayudantia: "Ayudantía",
    red: "Red",
    ciberdelia: "Ciberdelia",
    descubrimientos: "Descubrimientos",
    explorador: "Explorador",
    privacidad: "Privacidad",
    dispositivos: "Dispositivos",
    creatividad: "Creatividad",
    perfil: "Perfil",
    sociedad: "Sociedad",
    aplicaciones: "Aplicaciones",
};

// Categorías que la gente nombra igual pero el manifiesto agrupa aparte.
const ALIAS_CATEGORIA: Record<string, string> = {
    politica: "ontocracia",
    parlamento: "ontocracia",
    arte: "cultura",
    explorador: "descubrimientos",
    personalizacion: "ciberdelia",
};

/** Devuelve la categoría canónica del manifiesto para un id cualquiera. */
function canonica(categoria: string): string {
    const limpia = normalizar(categoria);
    return ALIAS_CATEGORIA[limpia] ?? limpia;
}

/** Rótulo humano de una categoría; si es desconocida, se devuelve tal cual. */
function rotulo(categoria: string): string {
    return NOMBRE_CATEGORIA[categoria] ?? categoria;
}

// ── Sinónimos: cómo llama la gente a cada categoría ──────────────
// Todo en minúsculas y sin acentos (el título se normaliza igual).
// Las entradas con espacio se buscan como fragmento del título entero;
// las de una palabra, como palabra suelta, para no confundir «sol» con
// «solidaridad». Amplía esta tabla antes que tocar la puntuación.
const SINONIMOS_CATEGORIA: Record<string, string[]> = {
    ontocracia: ["politica", "politicas", "politico", "ontocracia", "gobierno", "gobernanza",
        "democracia", "voto", "votos", "votacion", "propuesta", "propuestas", "legislacion",
        "ley", "leyes", "parlamento", "asamblea", "civica", "civico", "justicia", "decisiones"],
    economia: ["economia", "economico", "economicos", "finanzas", "financiero", "dinero",
        "cartera", "seeds", "semillas", "karma", "recursos", "mercado", "oikos", "abundancia",
        "trueque", "presupuesto", "comercio", "ingresos", "gastos"],
    educacion: ["educacion", "educativo", "aprendizaje", "aprender", "estudio", "estudios",
        "curso", "cursos", "escuela", "universidad", "habilidades", "conocimiento", "mentoria",
        "biblioteca", "formacion"],
    cultura: ["cultura", "cultural", "arte", "artes", "artistico", "creacion", "manifiesto",
        "multiverso", "galeria creativa"],
    social: ["social", "sociales", "amigos", "amistades", "comunidad", "comunidades", "grupos",
        "grupo", "eventos", "evento", "gente", "personas", "encuentros", "red social"],
    clima: ["clima", "meteorologia", "meteorologico", "temperatura", "viento", "lluvia",
        "humedad", "uv", "aire", "atmosfera", "pronostico", "el tiempo"],
    productividad: ["productividad", "productivo", "tarea", "tareas", "proyecto", "proyectos",
        "trabajo", "agenda", "foco", "notas", "organizacion", "sprint", "pendientes"],
    ubicacion: ["ubicacion", "mapa", "mapas", "lugar", "lugares", "cerca", "geografia", "gps",
        "ciudad", "barrio", "transito", "viaje", "territorio"],
    utilidades: ["utilidades", "utilidad", "herramientas", "reloj", "hora", "calculadora",
        "conversor", "cronometro"],
    astronomia: ["astronomia", "astronomico", "espacio", "espacial", "cosmos", "cosmico",
        "estrellas", "sol", "solar", "planetas", "telescopio", "cielo", "universo", "kp"],
    astrologia: ["astrologia", "astrologico", "natal", "zodiaco", "signos", "transitos",
        "horoscopo", "carta natal", "sincronia"],
    sistema: ["sistema", "hardware", "cpu", "memoria", "monitor", "nodo", "nodos", "rendimiento",
        "identidad", "baules", "soberano"],
    archivos: ["archivos", "archivo", "ficheros", "documentos", "carpetas", "almacenamiento",
        "nube", "galeria", "memorias", "codice", "fotos"],
    entretenimiento: ["entretenimiento", "ocio", "musica", "media", "medios", "video", "videos",
        "juegos", "juego", "radio", "peliculas", "sonido", "audio", "reproductor"],
    ia: ["ia", "astraura", "aurora", "nexus", "exocortex", "chatbot", "agente", "agentes",
        "oraculo", "cerebros", "inteligencia artificial"],
    ayudantia: ["ayuda", "ayudantia", "soporte", "tutorial", "tutoriales", "guia", "guias",
        "bienestar", "salud", "cuidado"],
    red: ["red", "redes", "conectividad", "conexion", "internet", "mesh", "topologia",
        "telemetria", "federacion", "federativas"],
    ciberdelia: ["ciberdelia", "psicodelia", "psicodelico", "inmersivo", "inmersion", "visual",
        "visuales", "fractal", "conciencia", "tema", "temas", "apariencia", "vr", "ar", "xr"],
    descubrimientos: ["descubrimientos", "descubrir", "ciencia", "cientifico", "noticias",
        "hallazgos", "investigacion", "innovacion", "explorar", "exploracion", "actualidad",
        "oficiales"],
    privacidad: ["privacidad", "privado", "cifrado", "criptografia", "seguridad", "soberania",
        "datos", "escudo"],
    dispositivos: ["dispositivos", "dispositivo", "domotica", "hogar", "casa", "habitat", "iot",
        "robots", "robotica"],
    creatividad: ["creatividad", "creativo", "idea", "ideas", "invencion", "ideacion",
        "imaginacion", "quimeras"],
    perfil: ["perfil", "merito", "reputacion", "legado", "avatar", "insignias", "logros",
        "actividad", "mis paginas"],
    sociedad: ["sociedad", "cohesion", "armonia", "biorregiones", "colectivo", "humanidad"],
    aplicaciones: ["aplicaciones", "apps", "app", "programas", "lanzadera", "inicio", "accesos",
        "escritorio", "camara"],
    comunicacion: ["comunicacion", "mensaje", "mensajes", "mensajeria", "chat", "notificaciones",
        "correo", "avisos", "buzon"],
};

// ── Utilidades de texto ──────────────────────────────────────────
/** Minúsculas y sin acentos: «Mi Economía» y «mi economia» son lo mismo. */
function normalizar(texto: string): string {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Palabras sueltas del título, ya normalizadas. */
function palabrasDe(titulo: string): string[] {
    const limpio = normalizar(titulo);
    const trozos = limpio.split(/[^a-z0-9]+/);
    return trozos.filter((t) => t.length > 0);
}

/**
 * Cuánto empuja el título hacia una categoría: 0 si no la nombra,
 * y hasta 1.5 si la nombra con varias palabras distintas.
 */
function afinidadTitulo(titulo: string, categoria: string): number {
    const sinonimos = SINONIMOS_CATEGORIA[categoria];
    if (!sinonimos) return 0;
    const limpio = normalizar(titulo);
    if (limpio.length === 0) return 0;
    const palabras = palabrasDe(titulo);
    let aciertos = 0;
    for (const sinonimo of sinonimos) {
        const esCompuesto = sinonimo.indexOf(" ") >= 0;
        const acierta = esCompuesto ? limpio.indexOf(sinonimo) >= 0 : palabras.indexOf(sinonimo) >= 0;
        if (acierta) aciertos += 1;
    }
    if (aciertos === 0) return 0;
    return Math.min(1.5, aciertos);
}

/** Todos los tipos declarados en el manifiesto (los que sí sabemos medir). */
function tiposDelManifiesto(): WidgetType[] {
    return Object.keys(WIDGET_MANIFEST) as WidgetType[];
}

/** Categoría canónica de un widget del manifiesto. */
function categoriaDe(entrada: WidgetManifestEntry): string {
    return canonica(entrada.category);
}

/** Categorías que la pestaña ya toca: las declaradas y las de sus widgets. */
function categoriasCubiertas(ctx: ContextoPestana): string[] {
    const cubiertas: string[] = [];
    for (const categoria of ctx.categoriasPresentes) {
        const id = canonica(categoria);
        if (cubiertas.indexOf(id) < 0) cubiertas.push(id);
    }
    for (const tipo of ctx.widgetsPresentes) {
        const entrada = WIDGET_MANIFEST[tipo];
        if (!entrada) continue;
        const id = categoriaDe(entrada);
        if (cubiertas.indexOf(id) < 0) cubiertas.push(id);
    }
    return cubiertas;
}

// ── Candidatos ───────────────────────────────────────────────────
interface Candidato {
    tipo: WidgetType;
    etiqueta: string;
    categoria: string;
    relevancia: number;
    afinidad: number;
    categoriaYaPresente: boolean;
    puntuacionBase: number;
}

/** Redondeo a dos decimales para que la puntuación sea legible en la UI. */
function redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
}

/** Frase en español que explica por qué este widget encaja aquí. */
function motivoDe(candidato: Candidato): string {
    const nombre = rotulo(candidato.categoria);
    let frase: string;
    if (candidato.afinidad > 0) {
        frase = `El título de la pestaña habla de ${nombre}, y «${candidato.etiqueta}» es justo de eso.`;
    } else if (!candidato.categoriaYaPresente) {
        frase = `Abre una categoría que esta pestaña todavía no toca: ${nombre}.`;
    } else {
        frase = `Acompaña a lo que ya hay de ${nombre} sin repetir ningún widget.`;
    }
    if (candidato.relevancia >= 85) {
        frase += ` Además es de los más usados del catálogo (relevancia ${candidato.relevancia}).`;
    }
    return frase;
}

/** Arma la lista de candidatos: todo el manifiesto menos lo ya presente. */
function candidatosDe(ctx: ContextoPestana, cubiertas: string[]): Candidato[] {
    const candidatos: Candidato[] = [];
    for (const tipo of tiposDelManifiesto()) {
        // Lo que ya está en la pestaña puntúa 0: no se sugiere repetir.
        if (ctx.widgetsPresentes.indexOf(tipo) >= 0) continue;
        const entrada = WIDGET_MANIFEST[tipo];
        if (!entrada) continue;
        const categoria = categoriaDe(entrada);
        const relevancia = typeof entrada.relevance === "number" ? entrada.relevance : RELEVANCIA_POR_DEFECTO;
        const afinidad = afinidadTitulo(ctx.titulo, categoria);
        const categoriaYaPresente = cubiertas.indexOf(categoria) >= 0;
        let puntuacion = relevancia / 100 + PESO_TITULO * afinidad;
        if (categoriaYaPresente) puntuacion = puntuacion * FACTOR_CATEGORIA_PRESENTE;
        candidatos.push({
            tipo,
            etiqueta: entrada.label,
            categoria,
            relevancia,
            afinidad,
            categoriaYaPresente,
            puntuacionBase: puntuacion,
        });
    }
    return candidatos;
}

// ── API pública ──────────────────────────────────────────────────
/**
 * Sugiere widgets para una pestaña concreta, ya ordenados y con motivo.
 * La elección es golosa con castigo por repetir categoría: así una
 * pestaña vacía sale variada, y una titulada sigue mandando en su tema.
 */
export function sugerenciasPara(ctx: ContextoPestana, limite: number = 6): Sugerencia[] {
    if (!Number.isFinite(limite) || limite <= 0) return [];
    const tope = Math.floor(limite);
    const cubiertas = categoriasCubiertas(ctx);
    const pendientes = candidatosDe(ctx, cubiertas);
    const elegidas: Sugerencia[] = [];
    const vecesPorCategoria: Record<string, number> = {};

    while (elegidas.length < tope && pendientes.length > 0) {
        let mejorIndice = -1;
        let mejorValor = -1;
        for (let i = 0; i < pendientes.length; i++) {
            const candidato = pendientes[i];
            const repeticiones = vecesPorCategoria[candidato.categoria] ?? 0;
            const decaimiento = candidato.afinidad > 0 ? DECAIMIENTO_AFIN : DECAIMIENTO_NEUTRO;
            const valor = candidato.puntuacionBase * Math.pow(decaimiento, repeticiones);
            if (valor > mejorValor) {
                mejorValor = valor;
                mejorIndice = i;
            }
        }
        if (mejorIndice < 0) break;
        const ganador = pendientes[mejorIndice];
        pendientes.splice(mejorIndice, 1);
        vecesPorCategoria[ganador.categoria] = (vecesPorCategoria[ganador.categoria] ?? 0) + 1;
        elegidas.push({
            tipo: ganador.tipo,
            motivo: motivoDe(ganador),
            puntuacion: redondear(mejorValor),
        });
    }
    return elegidas;
}

/**
 * Categorías útiles (con al menos un widget en el manifiesto) que esta
 * pestaña todavía no toca. Primero las que el título pide y, dentro de
 * ellas, las que tienen widgets más relevantes que ofrecer.
 */
export function categoriasInfrarrepresentadas(ctx: ContextoPestana): string[] {
    const cubiertas = categoriasCubiertas(ctx);
    const mejorRelevancia: Record<string, number> = {};
    for (const tipo of tiposDelManifiesto()) {
        const entrada = WIDGET_MANIFEST[tipo];
        if (!entrada) continue;
        const categoria = categoriaDe(entrada);
        if (cubiertas.indexOf(categoria) >= 0) continue;
        const relevancia = typeof entrada.relevance === "number" ? entrada.relevance : RELEVANCIA_POR_DEFECTO;
        const previa = mejorRelevancia[categoria] ?? 0;
        if (relevancia > previa) mejorRelevancia[categoria] = relevancia;
    }
    const ausentes = Object.keys(mejorRelevancia);
    ausentes.sort((a, b) => {
        const afinidadA = afinidadTitulo(ctx.titulo, a);
        const afinidadB = afinidadTitulo(ctx.titulo, b);
        if (afinidadA !== afinidadB) return afinidadB - afinidadA;
        const relevanciaA = mejorRelevancia[a] ?? 0;
        const relevanciaB = mejorRelevancia[b] ?? 0;
        if (relevanciaA !== relevanciaB) return relevanciaB - relevanciaA;
        return a.localeCompare(b);
    });
    return ausentes;
}
