# Higgsfield en MetaGenesis, solo con aprobación · contrato y cola HGF1113

**Fecha:** 2026-11-13
**Destino en el repo:** `architecture/higgsfield-aprobado-1113.md`

## 1. Pedido de Maggasukha

Vincular la cuenta de Higgsfield de la Fundación (fundacionstarseed) a todas las herramientas de producción de
StarSeed:
- MetaGenesis, independiente de Claude;
- Claude y cualquier IDE o chat vinculado;
- el sistema de diseño y las memorias;
- la síntesis diaria.

**Usarla SOLO con su aprobación,** porque los créditos son limitados, y solo para proyectos elegidos de producción
oficial de contenido profesional.

## 2. Vías

- **Claude:** el conector `https://mcp.higgsfield.ai/mcp`. Lo reconecta Maggasukha con la cuenta de la Fundación.
- **MetaGenesis sin Claude:** el CLI oficial `@higgsfield/cli` (`higgsfield auth login`), que usa los créditos de la
  misma cuenta.
  - **La INSTALACIÓN y el INICIO DE SESIÓN del CLI en el A1 y en la Mac los hace Maggasukha o Claude con su visto
    bueno.** Ninguna tarea de esta ola instala nada ni inicia sesión.
- **La API de pago por uso** (console.higgsfield.ai) factura aparte y **no se usa**.

## 3. Reglas

1. **Nada se ejecuta en Higgsfield sin aprobación.**
   - Cada propuesta lleva proyecto oficial, pieza, modelo, el comando exacto del CLI, el número de tomas y los
     créditos estimados.
   - La aprobación guarda el hash del comando: si cambia, se aprueba de nuevo.
2. **Presupuesto por proyecto,** aprobado por Maggasukha.
   - Al llegar al 80 % se avisa; al 100 % se para.
3. **Nunca se repite una generación** para reintentar. Un fallo se informa y se vuelve a proponer.
4. **El CLI solo se llama a través de `higgsfield_aprobado.py`.** Ningún otro módulo, agente ni director lo invoca
   directamente.
5. **Marca:** el símbolo nunca se genera con IA; los colores, de los tokens; nada se publica sin su palabra; su
   nombre no aparece en el material oficial.
6. **Registro de gasto** en `starseed_memory_root/produccion/higgsfield/gasto.jsonl` (privado). Nunca en el repo
   público ni en Supabase.

## 3 bis. Estado al cerrar el 2026-11-13

- El bot del A1 (herramienta `peticiones_telegram`) ya **propone** piezas de Higgsfield con los créditos estimados en
  la síntesis (sección 5 quinquies) y nunca las ejecuta.
- **Conectado a la cuenta de la Fundación** (fund…@gmail.com, plan gratuito, 10 créditos): el conector de Claude,
  el CLI del A1 (usuario `starseed`, workspace `cfecc5a9…`) y el CLI de la Mac.
- **Guardia en los dos nodos:**
  - el binario real es `higgsfield-cli`;
  - `higgsfield` solo deja pasar órdenes que no gastan (`account`, `workspace`, `model`, `preset`, `voices`,
    `version`, `auth`, `generate cost`, `list`, `get` y `wait`, `project list`);
  - lo demás exige `HIGGSFIELD_APROBACION=<id>`.
  - `higgsfield_aprobado.py` (HGF1113A) llama a `higgsfield-cli` con esa variable SOLO tras la aprobación, y cotiza
    antes con `generate cost`.

## 4. Cola HGF1113

```json
{
"ola": "HGF1113",
"tareas": [
{
"id": "HGF1113A",
"ola": "HGF1113",
"titulo": "Higgsfield · registro de propuestas, aprobaciones y gasto",
"archivos": [
"scripts/puente/higgsfield_aprobado.py",
"scripts/puente/test_higgsfield_aprobado.py"
],
"depende": [],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. Crea higgsfield_aprobado.py, con núcleo PURO y E/S inyectable. Propuestas en starseed_memory_root/produccion/higgsfield/propuestas.json: id, proyecto, pieza, modelo, comando exacto del CLI `higgsfield`, tomas, créditos estimados y motivo. Aprobar guarda el sha256 del comando, quién y cuándo; rechazar; presupuestos por proyecto, con aviso al 80 % y parada al 100 %. ejecutar(id) SOLO corre si la aprobación existe y el hash coincide; invoca el CLI con subprocess (inyectable), registra el gasto real en gasto.jsonl y nunca reintenta. Si el CLI no está instalado o no hay sesión, devuelve un motivo claro sin fallar. Pruebas sin red: un comando cambiado no hereda la aprobación; sin aprobación no hay ejecución; al 100 % del presupuesto se para. Máximo 120 líneas por archivo."
},
{
"id": "HGF1113B",
"ola": "HGF1113",
"titulo": "Higgsfield · aprobar desde Telegram y Genesis",
"archivos": [
"scripts/puente/peticiones_telegram.py",
"scripts/puente/test_peticiones_telegram.py",
"scripts/puente/acciones-de-alex.py"
],
"depende": [
"HGF1113A"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. En el bot del repo (peticiones_telegram.py, PET1112A) añade: /higgsfield (lista las propuestas pendientes con créditos estimados, el presupuesto del proyecto y el gasto acumulado), /higgsfield aprobar <id>, /higgsfield rechazar <id> y /higgsfield presupuesto <proyecto> <créditos>. Al aprobar, ejecuta con higgsfield_aprobado.ejecutar y envía el resultado al chat y a Drive (carpeta del proyecto, cuenta alex-docs). Cuando un mensaje pida algo de Higgsfield, el bot NO genera: crea una propuesta con su estimación y pide aprobación. Las mismas propuestas aparecen en acciones-de-alex para Genesis. Pruebas sin red."
},
{
"id": "HGF1113C",
"ola": "HGF1113",
"titulo": "Higgsfield · propuestas desde la síntesis y los encargos",
"archivos": [
"scripts/puente/agente_sintesis.py",
"scripts/puente/test_agente_sintesis.py"
],
"depende": [
"HGF1113A"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. En la síntesis diaria añade la sección «Producción con Higgsfield»: como mucho 2 propuestas al día para proyectos oficiales (pieza, modelo, tomas y créditos estimados), registradas con higgsfield_aprobado como pendientes, marcadas REQUIERE APROBACIÓN y con el comando para aprobarlas (/higgsfield aprobar <id>). Nunca se ejecuta nada desde aquí. Respeta las reglas de marca (§3.5). Pruebas sin red."
},
{
"id": "HGF1113D",
"ola": "HGF1113",
"titulo": "Documentar Higgsfield con aprobación en memorias y guías",
"archivos": [
"memory/orquestacion-economica.md",
"memory/workflow-actual.md",
"CLAUDE.md",
"AGENTS.md"
],
"depende": [
"HGF1113B"
],
"prompt": "Lee architecture/higgsfield-aprobado-1113.md. En memory/orquestacion-economica.md añade Higgsfield como proveedor de PAGO con créditos limitados: solo con aprobación de Maggasukha, por presupuesto de proyecto, a través de higgsfield_aprobado.py; nunca para tareas rutinarias ni como respaldo automático de otros modelos. En CLAUDE.md y AGENTS.md añade «Higgsfield (solo con aprobación)» en 3 a 5 líneas: vías (el conector de Claude y el CLI en los nodos), regla de aprobación, presupuesto y marca. Añade también una entrada corta en memory/workflow-actual.md."
}
]
}
```
