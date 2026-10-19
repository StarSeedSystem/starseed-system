// Tipos para el catálogo de referencias e inspiración
export type Formato = 'starseed-referencias';
export type Version = 1;
export type Verificado = string; // formato de fecha YYYY-MM-DD
export type Origen = string;

export type TemaReferencia = {
  id: string;
  nombre: string;
  icono: string;
};

export type EntradaReferencia = {
  id: string;
  nombre: string;
  url: string; // debe ser HTTPS
  tema: string; // debe existir en los temas
  subtema: string | null;
  que_es: string;
  tipo: string;
  acceso: 'libre' | 'registro' | 'pago' | 'mixto';
  clase_uso: 'reutilizable' | 'reutilizable-con-condiciones' | 'solo-referencia' | 'solo-enlace';
  condiciones: string;
  canales: Array<string>; // validados contra CANALES_VALIDOS
  prohibido: Array<string>;
  actualizacion: Array<{
    tipo: string;
    ref?: string;
    url?: string;
    nota?: string;
  }>;
  integracion: Array<{
    tipo: string;
    url?: string;
    ref?: string;
    nombre?: string;
    licencia?: string;
    requiere?: string;
  }>;
  terminos: string | null;
  og_imagen: string | null;
  verificado: string; // formato de fecha YYYY-MM-DD
  sin_verificar: Array<string>;
};

export type Catalogo = {
  formato: Formato;
  version: Version;
  verificado: Verificado;
  origen: Origen;
  temas: TemaReferencia[];
  entradas: EntradaReferencia[];
};

// Canales válidos extraídos del JSON de referencia
export const CANALES_VALIDOS: Readonly<Array<string>> = [
  'mcp-oficial',
  'cli-oficial',
  'navegador-de-la-persona',
  'lectura-puntual',
  'oembed',
  'github',
  'skill',
  'script',
  'hash-html',
  'youtube-canal',
  'api-docs-publica',
  'sitemap-respetando-robots',
  'rss',
  'api-oficial',
  'changelog',
  'sitemap',
  'sitemap-lastmod',
  'sitemap-parcial',
  'blog',
  'api',
  'figma-plugin',
  'plugin',
  'extension',
  'descarga-oficial',
  'pagina',
  'css',
] as const;

// Resultado de la validación
export type ResultadoValidacion =
  | { ok: true; catalogo: Catalogo }
  | { ok: false; motivos: string[] };

/**
 * Valida el catálogo de referencias e inspiración.
 * @param json Objeto JSON parseado
 * @returns Resultado de la validación
 */
export function validarCatalogo(json: unknown): ResultadoValidacion {
   // Comprobar que es un objeto
   if (json === null || typeof json !== 'object') {
     return { ok: false, motivos: ['El JSON debe ser un objeto'] };
   }

   const catalogo = json as Catalogo;

   const motivos: string[] = [];

   // Validar formato
   if (!('formato' in catalogo) || catalogo.formato !== 'starseed-referencias') {
     motivos.push('formato');
   }

   // Validar versión
   if (!('version' in catalogo) || catalogo.version !== 1) {
     motivos.push('versión');
   }

   // Validar verificado (formato de fecha)
   if (!('verificado' in catalogo) || typeof catalogo.verificado !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(catalogo.verificado)) {
     motivos.push('fecha de verificación');
   }

   // Validar origen
   if (!('origen' in catalogo) || typeof catalogo.origen !== 'string') {
     motivos.push('origen');
   }

   // Validar temas
   if (!('temas' in catalogo) || !Array.isArray(catalogo.temas)) {
     motivos.push('temas');
   } else {
     // Comprobar que cada tema tiene id, nombre, icono
     for (const tema of catalogo.temas) {
       if (typeof tema.id !== 'string' || tema.id.trim() === '') {
         motivos.push('tema');
         break;
       }
       if (typeof tema.nombre !== 'string' || tema.nombre.trim() === '') {
         motivos.push('tema');
         break;
       }
       if (typeof tema.icono !== 'string' || tema.icono.trim() === '') {
         motivos.push('tema');
         break;
       }
     }
   }

   // Validar entradas
   if (!('entradas' in catalogo) || !Array.isArray(catalogo.entradas)) {
     motivos.push('entradas');
   } else {
     // ids únicos
     const ids = new Set<string>();
     for (const entrada of catalogo.entradas) {
       if (typeof entrada.id !== 'string' || entrada.id.trim() === '') {
         motivos.push('entrada:id');
         break;
       }
       if (ids.has(entrada.id)) {
         motivos.push(`id duplicado:${entrada.id}`);
         break;
       }
       ids.add(entrada.id);

       // Validar que el tema exista
       if (typeof entrada.tema !== 'string' || entrada.tema.trim() === '') {
         motivos.push('tema');
         break;
       }
       if (!catalogo.temas.some(t => t.id === entrada.tema)) {
         motivos.push('tema');
         break;
       }

       // Validar que la URL sea HTTPS
       if (typeof entrada.url !== 'string' || !entrada.url.startsWith('https://')) {
         motivos.push('HTTPS');
         break;
       }

       // Validar clase de uso
       const clasesValidas: EntradaReferencia['clase_uso'][] = [
         'reutilizable',
         'reutilizable-con-condiciones',
         'solo-referencia',
         'solo-enlace'
       ];
       if (!clasesValidas.includes(entrada.clase_uso)) {
         motivos.push('clase de uso');
         break;
       }

       // Validar canales
       if (!Array.isArray(entrada.canales)) {
         motivos.push('canales');
         break;
       }
       for (const canal of entrada.canales) {
         if (typeof canal !== 'string' || !CANALES_VALIDOS.includes(canal)) {
           motivos.push('canal');
           break;
         }
       }

       // Validar acceso
       if (!['libre', 'registro', 'pago', 'mixto'].includes(entrada.acceso)) {
         motivos.push('acceso');
         break;
       }

       // Validar que condiciones sea string
       if (typeof entrada.condiciones !== 'string') {
         motivos.push('condiciones');
         break;
       }

       // Validar que prohibido sea array de strings
       if (!Array.isArray(entrada.prohibido)) {
         motivos.push('prohibido');
         break;
       }
       for (const prohibidoItem of entrada.prohibido) {
         if (typeof prohibidoItem !== 'string') {
           motivos.push('prohibido');
           break;
         }
       }

       // Validar actualizacion (opcional, pero si existe, que tenga la estructura)
       if (Array.isArray(catalogo.entradas)) {
         for (const entrada of catalogo.entradas) {
           if (Array.isArray(entrada.actualizacion)) {
             for (const act of entrada.actualizacion) {
               if (typeof act !== 'object' || act === null) {
                 motivos.push('actualizacion');
                 break;
               }
               // Los campos son opcionales, pero si existen, que sean del tipo correcto
               if ('tipo' in act && typeof act.tipo !== 'string') {
                 motivos.push('actualizacion.tipo');
                 break;
               }
               if ('ref' in act && typeof act.ref !== 'string') {
                 motivos.push('actualizacion.ref');
                 break;
               }
               if ('url' in act && typeof act.url !== 'string') {
                 motivos.push('actualizacion.url');
                 break;
               }
               if ('nota' in act && typeof act.nota !== 'string') {
                 motivos.push('actualizacion.nota');
                 break;
               }
             }
           }
         }
       }

       // Validar integracion (opcional, pero si existe, que tenga la estructura)
       if (Array.isArray(catalogo.entradas)) {
         for (const entrada of catalogo.entradas) {
           if (Array.isArray(entrada.integracion)) {
             for (const integ of entrada.integracion) {
               if (typeof integ !== 'object' || integ === null) {
                 motivos.push('integracion');
                 break;
               }
               if ('tipo' in integ && typeof integ.tipo !== 'string') {
                 motivos.push('integracion.tipo');
                 break;
               }
               if ('url' in integ && typeof integ.url !== 'string') {
                 motivos.push('integracion.url');
                 break;
               }
               if ('ref' in integ && typeof integ.ref !== 'string') {
                 motivos.push('integracion.ref');
                 break;
               }
               if ('nombre' in integ && typeof integ.nombre !== 'string') {
                 motivos.push('integracion.nombre');
                 break;
               }
               if ('licencia' in integ && typeof integ.licencia !== 'string') {
                 motivos.push('integracion.licencia');
                 break;
               }
               if ('requiere' in integ && typeof integ.requiere !== 'string') {
                 motivos.push('integracion.requiere');
                 break;
               }
             }
           }
         }
       }

       // Validar terminos (puede ser null o string)
       if (entrada.terminos !== null && typeof entrada.terminos !== 'string') {
         motivos.push('terminos');
         break;
       }

       // Validar og_imagen (puede ser null o string)
       if (entrada.og_imagen !== null && typeof entrada.og_imagen !== 'string') {
         motivos.push('og_imagen');
         break;
       }

       // Validar verificado de la entrada (formato de fecha)
       if (typeof entrada.verificado !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entrada.verificado)) {
         motivos.push('fecha de verificación de la entrada');
         break;
       }

       // Validar sin_verificar (array de strings)
       if (!Array.isArray(entrada.sin_verificar)) {
         motivos.push('sin_verificar');
         break;
       }
       for (const sinVerificarItem of entrada.sin_verificar) {
         if (typeof sinVerificarItem !== 'string') {
           motivos.push('sin_verificar');
           break;
         }
       }
     }
   }

   if (motivos.length > 0) {
     return { ok: false, motivos };
   }

   return { ok: true, catalogo };
}
