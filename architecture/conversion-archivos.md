# Conversión de archivos con Filee (SOP · 2026-10-23)

> Alex (2026-10-23): «instala también este para todo el OS y la Biblioteca, usado desde cualquier
> medio con clic derecho a cada archivo o pidiéndoselo a Astraura o en la Protomolécula»
> — https://github.com/KnifeLemon/Filee

## 1. Qué es Filee

Conversor libre (MIT, .NET 10, autor KnifeLemon) que trabaja **sin conexión**: 255 formatos
(imágenes con HEIC/RAW/PSD/AVIF, PDF, Word, Excel, PowerPoint, HWP, libros, vídeo, audio,
subtítulos, comprimidos, CAD, tipografías, 3D y datos geoespaciales) sin Office ni LibreOffice.
Motores opcionales que amplían destinos: LibreOffice, Pandoc, Ghostscript, calibre y FFmpeg (este
último ya está en la Mac por Homebrew). Trae la orden `filee`:

```
filee convert <archivo> --to <formato> -o <carpeta> --json [--quality N] [--overwrite]
filee formats [<formato>]      # a qué convierte cada formato (con y sin motores opcionales)
filee version
```

Plataformas: Windows 10/11, Linux x64/ARM64 (Ubuntu 22.04+, necesita Python 3) y macOS 13+
(versión preliminar del autor: firma ad hoc, **sin notarizar**).

## 2. Dónde está instalado

| Neurona | Versión | Cómo |
|---|---|---|
| Mac de Alex (M1, macOS 26.3) | 2.0.0 | `Filee-2.0.0-osx-arm64.tar.gz` de la release oficial, SHA-256 `107150d2…6188132` comprobado contra la release; `install.sh` → `~/Applications/Filee.app` + `~/.local/bin/filee`. Descarga guardada en `~/.starseed/descargas/filee/`. |

Desinstalar: `~/.starseed/descargas/filee/x/Filee-2.0.0-osx-arm64/uninstall.sh`.
Medido: Markdown → DOCX o PDF en 2,7 s; PDF → PNG por página; md → odt sin LibreOffice falla con
«No engine can do this conversion» (se le dice así a la persona).

## 3. Piezas en el OS

| Archivo | Qué hace |
|---|---|
| `src/lib/conversion/formatos.ts` | PURO: lee `filee formats`, ordena destinos (los habituales primero), nombres de salida, elegir un archivo por su nombre |
| `src/lib/conversion/filee-servidor.ts` | SOLO SERVIDOR: encuentra `filee` (`FILEE_BIN`, `~/.local/bin`, Homebrew, la app), `execFile` con lista de argumentos (nunca shell), carpeta temporal propia que se borra siempre, 500 MB, 15 min, 2 a la vez; varias salidas → ZIP |
| `src/app/api/conversion/route.ts` | `GET ?de=` estado + destinos · `POST` multipart {archivo, a, calidad} → el archivo convertido. Puerta: el guardián de Genesis (la propia máquina sin sesión; fuera, sesión de MetaGenesis; 404 en un despliegue sin neurona) |
| `src/lib/conversion/cliente.ts` | navegador: `consultarDestinos`, `convertirBlob`, `convertirDesdeUrl`, `enlaceConversor` |
| `src/components/conversion/*` | `useConversionMenu` + `SubmenuConvertir` (clic derecho) y la página `/convertir` (`Conversor`) |
| `src/lib/protomolecula/conv-filee.ts` | Filee en el grafo de conversores de la Protomolécula (pasos «servicio», el servicio se inyecta) |

## 4. Superficies

- **Clic derecho** sobre cualquier archivo de la Biblioteca (Explorador): «Convertir a…» con los
  8 destinos más útiles para ESE archivo (preguntados a Filee) y «Más formatos…». El resultado se
  sube a los archivos de la persona y se guarda **junto al original**, en la misma carpeta.
- **Página `/convertir`** (app «Convertir archivos» del lanzador): soltar o elegir, todos los
  formatos, calidad para imágenes, descargar o guardar en «Conversiones». Con `?url=&a=` convierte
  sola (la petición ya la hizo la persona).
- **Astraura**: acción `[[ACCION: convertir_archivo {"archivo":"informe.pdf","a":"docx"}]]`; busca el
  archivo por su nombre entre los de la persona y abre el conversor con todo puesto.
- **Protomolécula**: `[[ACCION: protomolecula {"accion":"convertir","url":"…","a":"pdf"}]]`, la
  herramienta «Filee» en su catálogo (conversión de formatos) y sus pasos en el grafo de conversores.
- **Biblioteca**: ficha `repo-filee` (proyecto; abrir lleva a `/convertir`) con comprobación de
  versión por releases.

## 5. Reglas

- Nada sale de la neurona: no hay servicios de conversión externos. Filee no carga recursos externos
  al convertir libros, SVG, 3D o correos (2.0.0).
- Argumentos en lista y formato validado (`^[a-z0-9][a-z0-9+_-]{0,15}$`); el nombre del archivo se
  limpia (sin rutas ni caracteres de control); solo se aceptan salidas dentro de su carpeta.
- Honestidad: si en este medio no hay neurona con Filee (p. ej. el OS abierto desde la web pública),
  el menú y la página lo dicen; nunca fingen convertir.

## 6. Lo que sigue (cola del enjambre)

Ver `starseed_memory_root/olas/cola-conversion-filee-1023.json` (CNV1023A–…): conversor por la malla
(una neurona sin Filee pide a la que lo tiene, con token), Filee en el A1 (Linux ARM64), «Convertir
a…» en los adjuntos de Mensajes, en la vista previa de archivos y en los iconos del escritorio,
carpetas vigiladas de la Biblioteca (`filee watch`) y motores opcionales bajo demanda.
