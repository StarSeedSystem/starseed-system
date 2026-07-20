"use client";

/*
 * cultural/festivos — CALENDARIO FESTIVO INTERCULTURAL (dataset curado real).
 * ---------------------------------------------------------------------------
 * ~50 festividades del mundo con: nombre, regla de fecha, región, sistema
 * cultural (→ color), descripción de una línea e icono Lucide (NO emojis). Las
 * fechas MÓVILES (lunares/litúrgicas) llevan `approx: true` y se muestran con
 * honestidad ("fecha aproximada, varía cada año"). Sin dependencias nuevas.
 *
 * Se combina en la UI con los `os_events` REALES de la red etiquetados como
 * culturales (esos vienen del hook `useOsEvents`, no de aquí).
 */

import { systemColor } from "@/lib/cultural/systems";

export interface Festival {
    id: string;
    /** Nombre de la festividad. */
    name: string;
    /** Mes (1-12) del día representativo. */
    month: number;
    /** Día (1-31) representativo. */
    day: number;
    /** Región geográfica/cultural. */
    region: string;
    /** Sistema cultural (define el color). */
    systemId: string;
    /** Descripción de una línea. */
    description: string;
    /** Nombre de icono Lucide (mapeado en la UI; cae a Sparkles si falta). */
    icon: string;
    /** true si la fecha varía cada año (lunar/litúrgica): se rotula "aprox.". */
    approx?: boolean;
}

/** Dataset curado (representativo, no exhaustivo). */
export const FESTIVALS: Festival[] = [
    // ── Iberoamérica ──
    { id: "reyes", name: "Día de Reyes", month: 1, day: 6, region: "Iberoamérica", systemId: "iberoamerica", description: "La Epifanía: los Reyes Magos traen regalos.", icon: "Gift" },
    { id: "carnaval", name: "Carnaval", month: 2, day: 24, region: "Iberoamérica y Caribe", systemId: "iberoamerica", description: "Comparsas, música y disfraces antes de la cuaresma.", icon: "PartyPopper", approx: true },
    { id: "sanjuan", name: "Noche de San Juan", month: 6, day: 23, region: "España e Iberoamérica", systemId: "iberoamerica", description: "Hogueras en la costa para recibir el solsticio.", icon: "Flame" },
    { id: "muertos", name: "Día de Muertos", month: 11, day: 2, region: "México", systemId: "iberoamerica", description: "Altares y ofrendas para honrar a quienes partieron.", icon: "Skull" },
    { id: "independencia-mx", name: "Grito de Independencia", month: 9, day: 16, region: "México", systemId: "iberoamerica", description: "Conmemoración de la independencia con verbena popular.", icon: "Star" },
    { id: "fallas", name: "Las Fallas", month: 3, day: 19, region: "Valencia", systemId: "iberoamerica", description: "Monumentos de cartón que arden en la noche.", icon: "Flame" },

    // ── Pueblos originarios (Abya Yala) ──
    { id: "inti-raymi", name: "Inti Raymi", month: 6, day: 24, region: "Andes (Perú/Bolivia/Ecuador)", systemId: "originarios", description: "Fiesta del Sol del pueblo inca en el solsticio.", icon: "Sun" },
    { id: "wenu-we-tripantu", name: "We Tripantu", month: 6, day: 24, region: "Nación Mapuche", systemId: "originarios", description: "Año nuevo mapuche, renovación de la naturaleza.", icon: "Sprout" },
    { id: "pachamama", name: "Día de la Pachamama", month: 8, day: 1, region: "Andes", systemId: "originarios", description: "Ofrendas de gratitud a la Madre Tierra.", icon: "Mountain" },
    { id: "powwow", name: "Temporada de Powwow", month: 7, day: 15, region: "Naciones de Norteamérica", systemId: "originarios", description: "Reuniones de danza, tambor y comunidad.", icon: "Drum", approx: true },

    // ── Europa ──
    { id: "santa-lucia", name: "Santa Lucía", month: 12, day: 13, region: "Escandinavia", systemId: "europa", description: "Procesión de luces en la oscuridad del norte.", icon: "Star" },
    { id: "walpurgis", name: "Noche de Walpurgis", month: 4, day: 30, region: "Europa central y norte", systemId: "europa", description: "Hogueras que dan la bienvenida a la primavera.", icon: "Flame" },
    { id: "oktoberfest", name: "Oktoberfest", month: 9, day: 21, region: "Baviera, Alemania", systemId: "europa", description: "Fiesta de la cosecha, música y tradición.", icon: "Music", approx: true },
    { id: "la-tomatina", name: "La Tomatina", month: 8, day: 28, region: "Buñol, España", systemId: "europa", description: "Batalla festiva de tomates en las calles.", icon: "Utensils", approx: true },
    { id: "midsummer", name: "Midsommar", month: 6, day: 21, region: "Suecia y Finlandia", systemId: "europa", description: "Danza alrededor del palo de mayo en el solsticio.", icon: "Flower2", approx: true },

    // ── Mundo eslavo ──
    { id: "maslenitsa", name: "Máslenitsa", month: 3, day: 3, region: "Rusia y Europa del este", systemId: "eslavo", description: "Semana de las crepes que despide al invierno.", icon: "Sun", approx: true },
    { id: "kupala", name: "Ivan Kupala", month: 7, day: 7, region: "Eslavia oriental", systemId: "eslavo", description: "Noche de fuego, agua y coronas de flores.", icon: "Waves" },
    { id: "kolyada", name: "Koliadá", month: 1, day: 7, region: "Europa del este", systemId: "eslavo", description: "Cantos de invierno de casa en casa.", icon: "Snowflake" },

    // ── Anglosajón / Norteamérica ──
    { id: "thanksgiving", name: "Acción de Gracias", month: 11, day: 27, region: "EE. UU. y Canadá", systemId: "anglosajon", description: "Cena de gratitud por la cosecha.", icon: "Wheat", approx: true },
    { id: "halloween", name: "Halloween", month: 10, day: 31, region: "Esfera anglosajona", systemId: "anglosajon", description: "Disfraces y linternas en la víspera de Todos los Santos.", icon: "Ghost" },
    { id: "burns-night", name: "Burns Night", month: 1, day: 25, region: "Escocia", systemId: "anglosajon", description: "Cena en honor al poeta Robert Burns.", icon: "BookOpen" },
    { id: "juneteenth", name: "Juneteenth", month: 6, day: 19, region: "EE. UU.", systemId: "anglosajon", description: "Celebración de la emancipación y la libertad.", icon: "Star" },

    // ── África ──
    { id: "kwanzaa", name: "Kwanzaa", month: 12, day: 26, region: "Diáspora africana", systemId: "africa", description: "Siete días de principios comunitarios (Nguzo Saba).", icon: "Flame" },
    { id: "timkat", name: "Timkat", month: 1, day: 19, region: "Etiopía", systemId: "africa", description: "Epifanía ortodoxa con procesiones acuáticas.", icon: "Waves" },
    { id: "homowo", name: "Homowo", month: 8, day: 15, region: "Pueblo Ga, Ghana", systemId: "africa", description: "Festival de la cosecha que 'se burla del hambre'.", icon: "Wheat", approx: true },
    { id: "fetu-afahye", name: "Fetu Afahye", month: 9, day: 6, region: "Cape Coast, Ghana", systemId: "africa", description: "Purificación y acción de gracias del pueblo Fante.", icon: "Drum", approx: true },
    { id: "enkutatash", name: "Enkutatash", month: 9, day: 11, region: "Etiopía", systemId: "africa", description: "Año nuevo etíope, flores y renovación.", icon: "Flower2" },

    // ── Mundo árabe / Oriente Medio ──
    { id: "eid-fitr", name: "Eid al-Fitr", month: 3, day: 31, region: "Mundo islámico", systemId: "arabe", description: "Fin del ayuno del Ramadán, comunidad y generosidad.", icon: "Moon", approx: true },
    { id: "eid-adha", name: "Eid al-Adha", month: 6, day: 7, region: "Mundo islámico", systemId: "arabe", description: "Fiesta del sacrificio y la peregrinación.", icon: "Moon", approx: true },
    { id: "nowruz", name: "Nowruz", month: 3, day: 20, region: "Persia y Asia central", systemId: "arabe", description: "Año nuevo persa en el equinoccio de primavera.", icon: "Sprout" },
    { id: "hanukkah", name: "Janucá", month: 12, day: 14, region: "Pueblo judío", systemId: "arabe", description: "Fiesta de las luces, ocho velas de la Menorá.", icon: "Flame", approx: true },
    { id: "purim", name: "Purim", month: 3, day: 13, region: "Pueblo judío", systemId: "arabe", description: "Alegría, disfraces y lectura del rollo de Ester.", icon: "PartyPopper", approx: true },
    { id: "mawlid", name: "Mawlid", month: 9, day: 4, region: "Mundo islámico", systemId: "arabe", description: "Nacimiento del profeta Mahoma.", icon: "Star", approx: true },

    // ── Asia oriental ──
    { id: "cny", name: "Año Nuevo Chino", month: 2, day: 17, region: "China y diáspora", systemId: "asia-oriental", description: "Fiesta de la primavera, dragones y reencuentro familiar.", icon: "Sparkles", approx: true },
    { id: "mid-autumn", name: "Festival del Medio Otoño", month: 9, day: 17, region: "China y Vietnam", systemId: "asia-oriental", description: "Pasteles de luna bajo la luna llena.", icon: "Moon", approx: true },
    { id: "qingming", name: "Qingming", month: 4, day: 4, region: "China", systemId: "asia-oriental", description: "Día de barrer las tumbas y honrar a los ancestros.", icon: "Leaf" },
    { id: "hanami", name: "Hanami", month: 4, day: 1, region: "Japón", systemId: "asia-oriental", description: "Contemplación de los cerezos en flor (sakura).", icon: "Flower2", approx: true },
    { id: "tanabata", name: "Tanabata", month: 7, day: 7, region: "Japón", systemId: "asia-oriental", description: "Fiesta de las estrellas y los deseos escritos.", icon: "Star" },
    { id: "obon", name: "Obon", month: 8, day: 15, region: "Japón", systemId: "asia-oriental", description: "Danzas y linternas para recibir a los ancestros.", icon: "Sparkles" },
    { id: "chuseok", name: "Chuseok", month: 9, day: 17, region: "Corea", systemId: "asia-oriental", description: "Acción de gracias por la cosecha coreana.", icon: "Wheat", approx: true },

    // ── Asia del sur ──
    { id: "diwali", name: "Diwali", month: 11, day: 1, region: "India y diáspora", systemId: "asia-sur", description: "Festival de las luces, el triunfo de la luz.", icon: "Flame", approx: true },
    { id: "holi", name: "Holi", month: 3, day: 14, region: "India y Nepal", systemId: "asia-sur", description: "Fiesta de los colores y la primavera.", icon: "Sparkles", approx: true },
    { id: "pongal", name: "Pongal", month: 1, day: 14, region: "Tamil Nadu", systemId: "asia-sur", description: "Acción de gracias de la cosecha al Sol.", icon: "Sun" },
    { id: "vaisakhi", name: "Vaisakhi", month: 4, day: 13, region: "Panyab", systemId: "asia-sur", description: "Cosecha y año nuevo sij.", icon: "Wheat" },
    { id: "onam", name: "Onam", month: 9, day: 5, region: "Kerala", systemId: "asia-sur", description: "Cosecha con barcos-serpiente y flores.", icon: "Flower2", approx: true },

    // ── Sudeste asiático ──
    { id: "songkran", name: "Songkran", month: 4, day: 13, region: "Tailandia", systemId: "sudeste-asiatico", description: "Año nuevo con batallas de agua purificadoras.", icon: "Waves" },
    { id: "loy-krathong", name: "Loy Krathong", month: 11, day: 15, region: "Tailandia", systemId: "sudeste-asiatico", description: "Farolillos flotantes sobre ríos y lagos.", icon: "Sparkles", approx: true },
    { id: "tet", name: "Tết", month: 2, day: 17, region: "Vietnam", systemId: "sudeste-asiatico", description: "Año nuevo lunar vietnamita, flores y familia.", icon: "Flower2", approx: true },
    { id: "nyepi", name: "Nyepi", month: 3, day: 29, region: "Bali", systemId: "sudeste-asiatico", description: "Día del silencio y la introspección balinés.", icon: "Moon", approx: true },
    { id: "sinulog", name: "Sinulog", month: 1, day: 19, region: "Filipinas", systemId: "sudeste-asiatico", description: "Danza y devoción en las calles de Cebú.", icon: "Music", approx: true },

    // ── Oceanía ──
    { id: "matariki", name: "Matariki", month: 6, day: 28, region: "Aotearoa (Nueva Zelanda)", systemId: "oceania", description: "Año nuevo maorí con el orto de las Pléyades.", icon: "Star", approx: true },
    { id: "makahiki", name: "Makahiki", month: 11, day: 17, region: "Hawái", systemId: "oceania", description: "Temporada de paz, cosecha y juegos.", icon: "Waves", approx: true },
    { id: "pasifika", name: "Festival Pasifika", month: 3, day: 8, region: "Pacífico", systemId: "oceania", description: "Celebración de las culturas de las islas del Pacífico.", icon: "Music", approx: true },
];

/** Devuelve la fecha (Date local) de una festividad en un año dado. */
export function festivalDateInYear(fest: Festival, year: number): Date {
    // Día seguro dentro del mes (evita desbordes por 31 en meses cortos).
    const safeDay = Math.min(fest.day, 28 + 3);
    return new Date(year, fest.month - 1, safeDay);
}

/** Festividades de un mes (1-12), ordenadas por día. */
export function festivalsInMonth(month: number): Festival[] {
    return FESTIVALS.filter((f) => f.month === month).sort((a, b) => a.day - b.day);
}

export interface UpcomingFestival {
    festival: Festival;
    /** Próxima ocurrencia (desde `from`). */
    date: Date;
    /** Días que faltan (0 = hoy). */
    daysUntil: number;
}

/** Próximas `count` festividades desde una fecha (cruza el fin de año). */
export function upcomingFestivals(from: Date, count = 5): UpcomingFestival[] {
    const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const year = base.getFullYear();
    const candidates: UpcomingFestival[] = [];
    for (const f of FESTIVALS) {
        for (const y of [year, year + 1]) {
            const date = festivalDateInYear(f, y);
            if (date.getTime() >= base.getTime()) {
                const daysUntil = Math.round((date.getTime() - base.getTime()) / 86_400_000);
                candidates.push({ festival: f, date, daysUntil });
                break;
            }
        }
    }
    candidates.sort((a, b) => a.daysUntil - b.daysUntil);
    return candidates.slice(0, count);
}

/** Color de una festividad (por su sistema cultural). */
export function festivalColor(fest: Festival): string {
    return systemColor(fest.systemId);
}
