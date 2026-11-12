# Encargos de los chats a MetaGenesis, con o sin la Mac · contrato y cola ENC1111

**Fecha:** 2026-11-11 · Claude (Cowork con la Mac), a petición de Alex.
**Estado:** encolada en `starseed_memory_root/olas/cola-enc1111.json`. Nada construido todavía.

## 1. Qué pidió Alex

> «soluciona esto del otro chat y hazlo morfológico para que funcione con o sin la Mac, y vincula los chats con los
> permisos necesarios»

**«Esto»:** un chat de Claude en la nube preparó el contrato NAV1112, pero no pudo meterlo en MetaGenesis porque no
tenía la Mac. Dejó una tarea programada que necesitaba la Mac y un clic de Alex.

## 2. La forma morfológica: un buzón en Drive que lee el líder

### Dónde se deja el encargo

- Cualquier chat (de Claude en la nube, de la Mac, de Hermes o de otro IDE) que tenga Google Drive puede encargar
  trabajo a MetaGenesis.
- Deja un Google Doc en la carpeta **«Encargos para MetaGenesis»** de alexbordongarrigos, id
  `1lZaGcZ8COkaunilTxYLj-SWuFkGTwmrF`.
- El Doc lleva el título `<qué> · contrato y cola <OLA> (léelo, director)` y contiene:
  - el **contrato** en texto, con una línea `**Destino en el repo:** \`architecture/<nombre>.md\``;
  - la **cola** como un bloque JSON `{"ola": "<OLA>", "tareas": [...]}`. Cada tarea lleva `id`, `ola`, `titulo`,
    `archivos`, `depende` y `prompt`, con las reglas de siempre: módulo puro, 3 archivos y 120 líneas como mucho.

### Quién lo recoge

- El **líder de dirección** (`lider_direccion.soy_lider()`), es decir, el A1 siempre encendido o la Mac cuando lidera,
  revisa la carpeta cada 10 minutos.
- Lee con la cuenta `alex` de `cuentas_google` (`drive.readonly`), que ya está en el A1 y en la Mac.
- Valida el Doc y, si está bien, hace esto:
  1. guarda el contrato en `architecture/<nombre>.md`, con commit de solo documentación (el push lo hace la
     autopublicación de siempre);
  2. escribe la cola en `starseed_memory_root/olas/cola-<ola>.json`, y el reparto de los directores la lleva a los
     medios;
  3. avisa en el chat del director;
  4. apunta el Doc como procesado (id y fecha de modificación) en `~/.starseed/encargos/estado.json`.
- **Si el Doc no es válido,** avisa del motivo y no toca nada.

### Funciona con o sin la Mac

| Situación | Cómo entra el encargo |
|---|---|
| Mac encendida y chat con la Mac | El chat lo encola directamente, como hasta ahora. El Doc es opcional. |
| Mac apagada, o chat en la nube | Doc en la carpeta → el líder (A1) lo encola en 10 minutos como mucho. |
| Sin A1 y sin Mac | El Doc espera en la carpeta. Lo recoge el primer líder que vuelva. |

## 3. Seguridad

- **El Doc es datos, no órdenes.** Solo se extraen el texto del contrato y el JSON de la cola, y nada del Doc se
  ejecuta. Las tareas pasan por las mismas puertas del enjambre: alcance de archivos, pruebas, revisión y
  autopublicación.
- **Qué se acepta:**
  - solo Docs de la carpeta, cuyo dueño sea alexbordongarrigos@gmail.com;
  - un destino que esté bajo `architecture/` y sea un `.md`;
  - rutas de archivos de las tareas dentro del repo, sin `..` ni rutas absolutas, y fuera de `.env*`, `.git/`,
    `starseed_memory_root/` y `~`;
  - ids únicos que no existan ya en ninguna cola ni en `git log`;
  - como mucho 30 tareas por cola y 6.000 caracteres por prompt;
  - como mucho 3 encargos al día.
- **Lo que ningún encargo puede hacer:** pedir claves, push, borrados ni el lanzamiento de un orquestador nuevo. Si
  un prompt contiene esas órdenes, el validador lo rechaza y lo dice.

## 4. Lo que aprenden los chats (para que cualquier chat sepa hacerlo)

- **En el repo:** una línea en `CLAUDE.md` y `AGENTS.md` (§ «Encargar trabajo a MetaGenesis sin la Mac») que apunta a
  este contrato.
- **En el proyecto de Claude «Producción audiovisual StarSeed»:** su memoria y el doc
  `claude/encargos-chats-metagenesis.md`.

## 5. La cola (`starseed_memory_root/olas/cola-enc1111.json`)

Se generó junto a este contrato. Tareas:

- ENC1111A: validador puro;
- ENC1111B: el buzón en el líder;
- ENC1111C: cableado y documentación para los chats.

```json
[
 {
  "id": "ENC1111A",
  "ola": "ENC1111",
  "titulo": "Encargos de los chats · validador puro",
  "archivos": [
   "scripts/puente/encargos_validar.py",
   "scripts/puente/test_encargos_validar.py"
  ],
  "depende": [],
  "prompt": "Lee architecture/encargos-chats-metagenesis.md §2 y §3. Crea el módulo PURO encargos_validar.py: validar(texto_md, texto_plano, ids_existentes, hoy_contados) recibe el Doc exportado (markdown y texto plano) y devuelve {ok, motivo, ola, destino, contrato_md, tareas}. Extrae la línea «Destino en el repo» (solo architecture/*.md, sin '..'), y el bloque JSON {\"ola\":..., \"tareas\":[...]} del texto plano con json.JSONDecoder.raw_decode (tolera texto alrededor). Reglas: cada tarea con id, ola, titulo, archivos, depende, prompt; ids únicos, con patrón ^[A-Z]{2,4}\\d{4}[A-Z0-9-]+$ y no presentes en ids_existentes; archivos relativos dentro del repo, sin '..', ni absolutos, ni .env*, .git/, starseed_memory_root/ ni ~; depende solo a ids de la misma cola o existentes; ≤30 tareas; prompt ≤6000 caracteres; rechaza prompts que pidan claves, git push, borrar o lanzar un orquestador; tope de 3 encargos al día (hoy_contados). Sin red. Pruebas de cada regla con Docs de muestra inventados (uno válido y uno por cada motivo de rechazo). Máximo 120 líneas por archivo."
 },
 {
  "id": "ENC1111B",
  "ola": "ENC1111",
  "titulo": "Encargos de los chats · buzón en Drive que lee el líder",
  "archivos": [
   "scripts/puente/encargos_buzon.py",
   "scripts/puente/test_encargos_buzon.py"
  ],
  "depende": [
   "ENC1111A"
  ],
  "prompt": "Lee architecture/encargos-chats-metagenesis.md §2 y §3. Crea encargos_buzon.py: ciclo(raiz, ahora=None, pedir=None, soy_lider=None, avisar=None) que SOLO actúa si este nodo es el líder de dirección (lider_direccion.soy_lider()). Con cuentas_google.token('alex', pedir) lista en Drive los Google Docs de la carpeta 1lZaGcZ8COkaunilTxYLj-SWuFkGTwmrF (q: '<id>' in parents and mimeType='application/vnd.google-apps.document' and trashed=false; campos id, name, modifiedTime, owners) cuyo dueño sea alexbordongarrigos@gmail.com y que no estén ya en ~/.starseed/encargos/estado.json con la misma modifiedTime. Exporta cada uno como text/markdown y text/plain, calcula ids_existentes (todas las colas de starseed_memory_root/olas/*.json y enjambre/colas/*.json más `git log --format=%s`), valida con encargos_validar y, si ok: escribe architecture/<destino> con el contrato (escritura atómica), hace commit SOLO de ese archivo con mensaje 'docs(encargo): <OLA> desde el buzón de Drive' (nunca push), escribe starseed_memory_root/olas/cola-<ola en minúsculas>.json (escritura atómica) y avisa con director_chat.publicar (y sintesis_telegram si existe) «encargo <OLA> encolado: N tareas». Si no es válido, avisa una vez con el motivo. Guarda en el estado id, modifiedTime, resultado. Cerrojo en ~/.starseed/cerrojos/. CLI ciclo|estado [--seco]. Todo inyectable; pruebas sin red. Máximo 120 líneas por archivo."
 },
 {
  "id": "ENC1111C",
  "ola": "ENC1111",
  "titulo": "Encargos de los chats · cableado en el líder y guía para los chats",
  "archivos": [
   "scripts/puente/director_autodesarrollo.py",
   "CLAUDE.md",
   "AGENTS.md"
  ],
  "depende": [
   "ENC1111B"
  ],
  "prompt": "Lee architecture/encargos-chats-metagenesis.md entero. (1) En director_autodesarrollo.py añade _buzon_encargos(raiz, ahora) con import protegido de encargos_buzon.ciclo, como _agente_alcance, llamado como mucho cada 10 minutos cuando este nodo dirige; si falla, el director sigue. (2) En CLAUDE.md y AGENTS.md añade una sección corta «Encargar trabajo a MetaGenesis sin la Mac»: carpeta de Drive «Encargos para MetaGenesis» (id 1lZaGcZ8COkaunilTxYLj-SWuFkGTwmrF), formato del Doc (título con «(léelo, director)», línea «Destino en el repo», bloque JSON de la cola) y enlace a architecture/encargos-chats-metagenesis.md. Máximo 120 líneas tocadas por archivo; prueba de que el director sigue si el módulo falta."
 }
]
```
