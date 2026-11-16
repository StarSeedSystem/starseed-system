export type ResultadoImportacion = {
  entradas: Record<string, string>;
  descartadas: string[];
  avisos: string[];
};

export function desdePo(texto: string): ResultadoImportacion {
  const entradas: Record<string, string> = {};
  const descartadas: string[] = [];
  const avisos: string[] = [];

  const lineas = texto.split(/\r?\n/);
  let contextoActual = "";
  let msgidActual = "";
  let msgstrActual = "";
  let modo: "msgid" | "msgstr" | "otro" = "otro";

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea || linea.startsWith("#")) continue;

    if (linea.startsWith("msgctxt")) {
      contextoActual = linea.replace(/^msgctxt\s+/, "").replace(/"/g, "");
    } else if (linea.startsWith("msgid_plural")) {
      avisos.push("plural simplificado en línea " + (i + 1));
      modo = "otro";
    } else if (linea.startsWith("msgid")) {
      msgidActual = linea.replace(/^msgid\s+/, "").replace(/"/g, "");
      if (!msgidActual) modo = "otro";
      else modo = "msgid";
    } else if (linea.startsWith("msgstr")) {
      msgstrActual = linea.replace(/^msgstr\s+/, "").replace(/"/g, "");
      modo = "msgstr";
    } else if (linea.startsWith('"')) {
      const parte = linea.replace(/"/g, "");
      if (modo === "msgid") msgidActual += parte;
      else if (modo === "msgstr") msgstrActual += parte;
    } else {
      if (msgidActual && msgstrActual) {
        const clave = contextoActual ? `${contextoActual}|${msgidActual}` : msgidActual;
        entradas[clave] = msgstrActual;
      } else if (msgidActual && !msgstrActual) {
        descartadas.push(msgidActual);
      }
      contextoActual = "";
      msgidActual = "";
      msgstrActual = "";
      modo = "otro";
    }
  }

  return { entradas, descartadas, avisos };
}

export function desdeProperties(texto: string): ResultadoImportacion {
  const entradas: Record<string, string> = {};
  const descartadas: string[] = [];
  const avisos: string[] = [];

  const lineas = texto.split(/\r?\n/);
  for (const linea of lineas) {
    const trimmed = linea.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;

    const separador = trimmed.indexOf("=") !== -1 ? "=" : ":";
    const partes = trimmed.split(separador);
    if (partes.length >= 2) {
      const clave = partes[0].trim();
      const valor = partes.slice(1).join(separador).trim();
      entradas[clave] = valor.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    } else {
      descartadas.push(trimmed);
    }
  }

  return { entradas, descartadas, avisos };
}
