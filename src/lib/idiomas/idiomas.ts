/**
 * IDI1115N · Lista de idiomas elegibles de StarSeed OS (contrato: architecture/idiomas.md).
 * Cada idioma se escribe en su propia escritura; `rotulo` es «Elegir idioma» en ese idioma
 * (lo rota el selector, solo como decoración). El español es la lengua fuente.
 * Módulo PURO: sin React, sin `node:*` ni red.
 */
import { esRtl } from "./tabla-iso";
export const IDIOMA_FUENTE = "es";

export interface Idioma {
    /** Código BCP-47 tal cual se guarda y se pone en `<html lang>`. */
    codigo: string;
    /** Nombre en su propio idioma. */
    nombre: string;
    /** «Elegir idioma» en este idioma. */
    rotulo: string;
    dir: "ltr" | "rtl";
}

const L = (codigo: string, nombre: string, rotulo: string, dir: "ltr" | "rtl" = "ltr"): Idioma => ({ codigo, nombre, rotulo, dir });

export const IDIOMAS: readonly Idioma[] = [
    L("es", "Español", "Elegir idioma"),
    L("en", "English", "Choose language"),
    L("pt", "Português", "Escolher idioma"),
    L("fr", "Français", "Choisir la langue"),
    L("de", "Deutsch", "Sprache wählen"),
    L("it", "Italiano", "Scegli la lingua"),
    L("nl", "Nederlands", "Kies een taal"),
    L("ca", "Català", "Tria l'idioma"),
    L("gl", "Galego", "Escoller idioma"),
    L("eu", "Euskara", "Hautatu hizkuntza"),
    L("ru", "Русский", "Выберите язык"),
    L("uk", "Українська", "Оберіть мову"),
    L("pl", "Polski", "Wybierz język"),
    L("tr", "Türkçe", "Dil seçin"),
    L("ar", "العربية", "اختر اللغة", "rtl"),
    L("he", "עברית", "בחר שפה", "rtl"),
    L("fa", "فارسی", "زبان را انتخاب کنید", "rtl"),
    L("ur", "اردو", "زبان منتخب کریں", "rtl"),
    L("hi", "हिन्दी", "भाषा चुनें"),
    L("bn", "বাংলা", "ভাষা বেছে নিন"),
    L("zh", "简体中文", "选择语言"),
    L("zh-hant", "繁體中文", "選擇語言"),
    L("ja", "日本語", "言語を選択"),
    L("ko", "한국어", "언어 선택"),
    L("th", "ไทย", "เลือกภาษา"),
    L("vi", "Tiếng Việt", "Chọn ngôn ngữ"),
    L("id", "Bahasa Indonesia", "Pilih bahasa"),
    L("sw", "Kiswahili", "Chagua lugha"),
    L("el", "Ελληνικά", "Επιλέξτε γλώσσα"),
    L("sv", "Svenska", "Välj språk"),
    L("cs", "Čeština", "Vyberte jazyk"),
    L("ro", "Română", "Alege limba"),
    L("hu", "Magyar", "Válassz nyelvet"),
    L("fi", "Suomi", "Valitse kieli"),
    L("da", "Dansk", "Vælg sprog"),
    L("nb", "Norsk bokmål", "Velg språk"),
];

/** Idiomas con catálogo en esta entrega (los demás se pueden elegir; el texto sigue en español). */
export const CON_CATALOGO: readonly string[] = ["en", "pt", "fr"];

/** Estado de cada catálogo: «revisado» solo cuando una persona lo comprobó; si no, «automatico». Una prueba lo cruza con el JSON. */
export const ESTADO_CATALOGO: Readonly<Record<string, "revisado" | "automatico">> = { en: "automatico", pt: "automatico", fr: "automatico" };

export const porCodigo = (codigo: string): Idioma | undefined => IDIOMAS.find((i) => i.codigo === codigo);
export const direccionDe = (codigo: string): "ltr" | "rtl" => porCodigo(codigo)?.dir ?? (esRtl(codigo) ? "rtl" : "ltr");

const INTEGRADOS = new Set(["en", "pt", "fr"]);

export function idiomasConCatalogo(
    paquetes: { codigo: string }[] = []
): string[] {
    const codigos = new Set<string>(INTEGRADOS);
    for (const p of paquetes) {
        const base = p.codigo.split("-")[0];
        if (IDIOMAS.some((i) => i.codigo === base) && INTEGRADOS.has(base)) {
            codigos.add(base);
        } else if (IDIOMAS.some((i) => i.codigo === base)) {
            codigos.add(base);
        }
    }
    return Array.from(codigos).sort();
}

/** «pt-BR» → «pt»; «zh-TW» → «zh-hant»; «no»/«nn» → «nb»; null si no hay idioma elegible que lo cubra. */
export function aIdiomaElegible(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase().replace(/_/g, "-");
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(v)) return null;
    if (/^zh-(tw|hk|mo|hant)/.test(v)) return "zh-hant";
    const base = v.split("-")[0];
    const alias = base === "no" || base === "nn" ? "nb" : base === "iw" ? "he" : base === "in" ? "id" : base;
    return IDIOMAS.some((i) => i.codigo === alias) ? alias : null;
}
