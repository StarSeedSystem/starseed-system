/* ============================================================
   STARSEED · KNOWLEDGE LINKS (para la Librería Global)
   Corpus de enlaces a TODO el ecosistema StarSeed: documentos
   fundacionales, Documento Maestro del SOSD, carpetas de Drive
   por área, presentaciones y enlaces del ecosistema (Nexus, Café,
   OS, Audiomorphic, Drive Fundación, Linktree).
   Adaptado desde StarSeed Café · app/assets/js/knowledge.js (DOCS).
   Cada item puede abrirse en un visor embebido (iframe) o externo.
   ============================================================ */

export type KnowledgeKind = "doc" | "pdf" | "asset" | "folder" | "web";

export interface KnowledgeItem {
  id: string;
  /** Título visible */
  title: string;
  /** Descripción corta */
  desc: string;
  /** Tipo de recurso (define icono y comportamiento del visor) */
  kind: KnowledgeKind;
  /** URL canónica (enlace externo, target _blank) */
  url: string;
  /**
   * URL para visor embebido (iframe). Para Google Docs/Drive usamos
   * .../preview. Para webs propias usamos la URL directa con fallback.
   * Si es null, el item solo permite "Abrir externo".
   */
  embedUrl: string | null;
  /**
   * true cuando el destino suele bloquear el iframe por X-Frame-Options
   * (sitios web externos). En ese caso mostramos aviso + botón externo.
   */
  embedRisk?: boolean;
}

export interface KnowledgeFolder {
  id: string;
  title: string;
  desc: string;
  items: KnowledgeItem[];
}

/* -------- Helpers de URL -------- */
const docView = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const docEmbed = (id: string) => `https://docs.google.com/document/d/${id}/preview`;
const fileView = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const fileEmbed = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
const folderView = (id: string) =>
  `https://drive.google.com/drive/folders/${id}`;
const folderEmbed = (id: string) =>
  `https://drive.google.com/embeddedfolderview?id=${id}#grid`;

const gdoc = (
  id: string,
  driveId: string,
  title: string,
  desc: string
): KnowledgeItem => ({
  id,
  title,
  desc,
  kind: "doc",
  url: docView(driveId),
  embedUrl: docEmbed(driveId),
});

const gpdf = (
  id: string,
  driveId: string,
  title: string,
  desc: string
): KnowledgeItem => ({
  id,
  title,
  desc,
  kind: "pdf",
  url: fileView(driveId),
  embedUrl: fileEmbed(driveId),
});

const gfolder = (
  id: string,
  driveId: string,
  title: string,
  desc: string
): KnowledgeItem => ({
  id,
  title,
  desc,
  kind: "folder",
  url: folderView(driveId),
  embedUrl: folderEmbed(driveId),
});

const web = (
  id: string,
  url: string,
  title: string,
  desc: string
): KnowledgeItem => ({
  id,
  title,
  desc,
  kind: "web",
  url,
  embedUrl: url,
  embedRisk: true,
});

/* ============================================================
   CARPETAS
   ============================================================ */
export const KNOWLEDGE_FOLDERS: KnowledgeFolder[] = [
  {
    id: "constituciones",
    title: "Constituciones y Fundacionales",
    desc: "La autoridad máxima: Constitución, Manifiesto, Codex y fundamentos de la Sociedad StarSeed.",
    items: [
      gdoc(
        "constitucion",
        "1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I",
        "Constitución de la Sociedad StarSeed",
        "Autoridad máxima · Tríada, derechos, justicia y Formulario de Adhesión (Anexo I)."
      ),
      gdoc(
        "manifiesto",
        "1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0",
        "Manifiesto Fundacional",
        "Visión y propósito de la Sociedad StarSeed."
      ),
      gdoc(
        "codex",
        "1Q7ygZvMlrVD4I7nO36jC4t8ttFezw__2K_w54L6HXNc",
        "Codex StarSeed",
        "Tratado de arquitectura social y hábitat: Sanghas, nodos, Fábricas de Cristal."
      ),
      gdoc(
        "fundamentos",
        "1Mq0A529ZJyff7FaJcUNRNLjIkfodd9MRjWkvezAycjc",
        "Fundamentos de Sociedad StarSeed",
        "Arquitectura dual cuerpo/mente y los 3 sistemas."
      ),
      gdoc(
        "comunidades",
        "1QKFprsQ4mF6YfV8FhPZryq-oETWrCyVaOHUTAvNQXN0",
        "Comunidades StarSeed",
        "Diseño de las Sanghas y la vida comunitaria."
      ),
    ],
  },
  {
    id: "sosd-master",
    title: "Documento Maestro del SOSD",
    desc: "La especificación técnica amplia del Sistema Operativo Social Descentralizado.",
    items: [
      gdoc(
        "sosd-master",
        "1DaX2bl8dIMSKR1yVtOHqh3iVtV_sLARMiSPFGkywa3M",
        "Documento Maestro del SOSD",
        "Especificación técnica amplia del Sistema Operativo Social."
      ),
      gpdf(
        "pdf-system",
        "1a0rclZu6mg2l7hVpc5TlpMng0xsAFVQ7",
        "StarSeed Universal System Design (PDF)",
        "Diseño universal del sistema."
      ),
    ],
  },
  {
    id: "area-sociedad",
    title: "Área · Sociedad",
    desc: "El Cuerpo — dimensión física. Documentos y carpeta de la Sociedad StarSeed.",
    items: [
      gfolder(
        "folder-fundamentos",
        "19HgI_-gnDHBt2fknze6i8_VBWWC7xVl0",
        "Carpeta · Fundamentos de Sociedad StarSeed",
        "Carpeta de Google Drive con los fundamentos de la Sociedad."
      ),
      gpdf(
        "pdf-ingenieria",
        "1eSLV8F59PgB6Rq6igS7WctwVULYzQsOn",
        "StarSeed · Ingeniería de Civilización (PDF)",
        "Presentación de la ingeniería de civilización."
      ),
    ],
  },
  {
    id: "area-os",
    title: "Área · OS (Red / SOSD)",
    desc: "La Mente — sistema nervioso digital. Carpeta de la Red StarSeed (SOSD).",
    items: [
      gfolder(
        "folder-network",
        "1klIZq2ifSH8dOkzpAu7fgFZ8uIlnp3I7",
        "Carpeta · StarSeed Network: SOSD",
        "Carpeta de Google Drive del Sistema Operativo Social."
      ),
    ],
  },
  {
    id: "area-cafe",
    title: "Área · Café",
    desc: "El Corazón — Fase Semilla hecha lugar. Documentos de ejecución y carpeta del Café.",
    items: [
      gfolder(
        "folder-cafe",
        "1jFul8UJFnRgjxfSshBX5BglnSajqrlIO",
        "Carpeta · StarSeed Café",
        "Carpeta de Google Drive del Café."
      ),
      gdoc(
        "fase1",
        "1zrpGdk27bDHYeaWo6FdwQ9mbioj_jdnJZ7TPhepbcpE",
        "Fase Semilla · Documento 1",
        "Plan de ejecución del Centro Social Piloto."
      ),
      gdoc(
        "fase2",
        "1s-AP5hy3IkY1yJmAIHN-ti4flAit6Q3RdQvmTOuNVd0",
        "Fase Semilla · Documento 2 (Zonificación)",
        "Las 5 zonas del centro: del Umbral al Área Creativa."
      ),
      gdoc(
        "fase3",
        "1Fd3WOcX8FDQ_6YAmc9V0StXmSdsxmX4c2wa3TpYW_ZQ",
        "Fase Semilla · Documento 3 (Modelo de negocio)",
        "Escalera de valor, ingresos, membresías y reinversión fractal."
      ),
    ],
  },
  {
    id: "area-estudio",
    title: "Área · Estudio",
    desc: "Las Manos — laboratorio de creación. Catálogo, logo maestro y carpeta del Estudio.",
    items: [
      gfolder(
        "folder-estudio",
        "1VfbI7LTrvPALncjdsXXCQNWjKCmVw5i0",
        "Carpeta · StarSeed Studio",
        "Carpeta de Google Drive del Estudio."
      ),
      gpdf(
        "studio-servicios",
        "1VgXKZBO4lT5xf6Xp1KbMry7MOlXAcBTf",
        "Servicios de StarSeed Studio (PDF)",
        "Catálogo de servicios de diseño del Estudio."
      ),
      gpdf(
        "logo-ai",
        "148RBTjg4OAhlip8scaJewsoZewSI1E4T",
        "Logo maestro vectorial (.ai)",
        "Símbolo StarSeed editable (Illustrator)."
      ),
    ],
  },
  {
    id: "area-fundacion",
    title: "Área · Fundación",
    desc: "Las Raíces — procomún y transición. Raíz del Drive de la Fundación.",
    items: [
      gfolder(
        "folder-fundacion",
        "1oBD-sAhwNo2rgXKk95DBQbEnt4En85TL",
        "Carpeta · Fundación StarSeed (raíz)",
        "Raíz del Google Drive de la Fundación StarSeed."
      ),
      gpdf(
        "pdf-manifesto",
        "1_H637V7AWY5_yU256Nv6Vh5w3-VbjTyx",
        "StarSeed Manifesto (presentación PDF)",
        "Presentación visual del Manifiesto."
      ),
    ],
  },
  {
    id: "presentaciones",
    title: "Presentaciones",
    desc: "Presentaciones e infografías en PDF de todo el ecosistema.",
    items: [
      gpdf(
        "pdf-mycelium",
        "10Ckc-Ip2n7pXg5rszvjQ_vvrqYVsv_Nk",
        "StarSeed Mycelium (presentación PDF)",
        "El micelio social: presentación de red."
      ),
      gpdf(
        "pdf-system-2",
        "1a0rclZu6mg2l7hVpc5TlpMng0xsAFVQ7",
        "StarSeed Universal System Design (PDF)",
        "Diseño universal del sistema."
      ),
      gpdf(
        "pdf-ingenieria-2",
        "1eSLV8F59PgB6Rq6igS7WctwVULYzQsOn",
        "StarSeed · Ingeniería de Civilización (PDF)",
        "Presentación de la ingeniería de civilización."
      ),
      gpdf(
        "pdf-infra",
        "1B6jwKxgp-AZDyJge1Zp_a-qs448J1a96",
        "StarSeed Sovereign Infrastructure (PDF)",
        "Presentación de la infraestructura soberana."
      ),
    ],
  },
  {
    id: "ecosistema",
    title: "Enlaces del Ecosistema",
    desc: "Los programas en línea de StarSeed. Algunos sitios pueden bloquear el visor; usa 'Abrir externo'.",
    items: [
      web(
        "nexus",
        "https://starseed-nexus.vercel.app",
        "StarSeed Nexus · Portal",
        "La página principal del ecosistema."
      ),
      web(
        "cafe-web",
        "https://starseed-nexus.vercel.app/cafe/",
        "StarSeed Café · Experiencia",
        "Menú vivo, Alquimista, Exocórtex y economía."
      ),
      web(
        "os-web",
        "https://starseed-os.vercel.app",
        "StarSeed OS (SOSD)",
        "El Sistema Operativo Social Descentralizado en vivo."
      ),
      web(
        "audiomorphic",
        "https://audiomorphic.vercel.app",
        "Audiomorphic VR (web)",
        "El visualizador de consciencia, versión web en vivo."
      ),
      gfolder(
        "drive-fundacion",
        "1oBD-sAhwNo2rgXKk95DBQbEnt4En85TL",
        "Drive · Fundación StarSeed",
        "Carpeta raíz del Drive de la Fundación."
      ),
      web(
        "linktree",
        "https://linktr.ee/FundacionStarseed",
        "Linktree · Fundación",
        "Enlaces públicos de la Fundación."
      ),
    ],
  },
];
