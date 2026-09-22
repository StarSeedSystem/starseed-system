/**
 * Aislamiento de las pruebas respecto al enjambre VIVO (2026-09-22).
 *
 * LO QUE PASÓ, y es grave. `src/lib/mando/__tests__/colas-decidir.test.ts` escribía sus
 * colas de mentira directamente en `starseed_memory_root/olas/` —la carpeta de trabajo del
 * enjambre de verdad— y llamaba a `reintentarTarea`, que deriva una cola nueva con otro
 * nombre; su limpieza borraba las dos que había creado y admitía por escrito que la
 * derivada se quedaba («la cola derivada tendría un nombre tipo…»). El vigilante hacía su
 * trabajo: encontraba esa cola, metía `tReintento` en la ola viva, y un agente de verdad
 * se pasó 86 MINUTOS escribiendo `src/lib/test.ts` para acabar parado esperando el visto
 * bueno de Alex sobre una tarea que nunca existió. En el bus quedaron además eventos de
 * prueba («clave PRUEBA_API_KEY agotada», «cerrojo huérfano: dueño muerto pid 99999999»)
 * que ensucian lo que Alex lee para saber qué está pasando.
 *
 * Cada `npx vitest run` plantaba más. Alex lo vio como «solo hay 1 agente trabajando y no
 * se autocorrige»: el enjambre no estaba roto, estaba ocupado con lo que las pruebas le
 * habían sembrado.
 *
 * EL ARREGLO. Todo lo que lee o escribe el Puente resuelve su raíz con `raizDelProyecto()`,
 * que respeta `STARSEED_ROOT`. Aquí se apunta esa variable a una carpeta temporal propia de
 * la tanda de pruebas, con el mismo esqueleto (`starseed_memory_root/olas`) que espera el
 * código. Una prueba puede escribir lo que quiera: cae en el temporal y el enjambre no se
 * entera. No hace falta tocar ninguna prueba, y las que se escriban mañana quedan
 * protegidas igual.
 */
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll } from "vitest";

/**
 * El temporal del sistema, SIN `os.tmpdir()`: en el entorno jsdom de vitest `node:os`
 * llega shimeado y `os.tmpdir` no es una función — 28 archivos de prueba murieron al
 * montar el entorno por eso, antes de ejecutar nada. `TMPDIR` la trae el sistema y `/tmp`
 * existe en macOS y en Linux, que son las dos máquinas donde corre esto.
 */
const temporal = process.env.TMPDIR || process.env.TEMP || "/tmp";

let raizFalsa = "";
try {
    raizFalsa = mkdtempSync(path.join(temporal, "starseed-pruebas-"));
    mkdirSync(path.join(raizFalsa, "starseed_memory_root", "olas"), { recursive: true });
    mkdirSync(path.join(raizFalsa, "starseed_memory_root", "mando"), { recursive: true });
    mkdirSync(path.join(raizFalsa, "enjambre", "colas"), { recursive: true });
    process.env.STARSEED_ROOT = raizFalsa;
} catch {
    // Si ni siquiera se puede crear un temporal, es preferible que la suite siga a que
    // todo muera al arrancar; el aislamiento se pierde, pero se pierde ruidosamente.
    console.warn("[pruebas] no pude aislar STARSEED_ROOT: las pruebas verán el repo real");
}

afterAll(() => {
    // Best-effort: si no se puede borrar, es un temporal del sistema y se irá solo.
    try {
        if (raizFalsa) rmSync(raizFalsa, { recursive: true, force: true });
    } catch {
        /* da igual: está en /tmp */
    }
});
