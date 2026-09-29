// @vitest-environment jsdom
/**
 * Auditoría de claves `starseed.*` (2026-09-29, persistencia entre medios).
 *
 * «Asegura que todos los datos sean recordados en los dispositivos desde cualquier medio»: cada
 * medio (localhost, Vercel, PWA, Tauri) tiene su propio localStorage, así que lo que no viaja con la
 * cuenta se olvida al cambiar de medio. Estas pruebas fijan la política:
 *   · las preferencias de usuario auditadas SÍ viajan;
 *   · los secretos, el bloqueo/biometría y los ids de dispositivo NUNCA viajan;
 *   · ninguna clave sincronizada parece un secreto;
 *   · el documento de política nombra cada clave que esta auditoría tocó.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEVER_SYNCED_KEYS, SYNCED_KEYS, esClaveFusionable, isNeverSyncedKey } from "@/lib/settings-sync";
import { isSyncedKey } from "@/lib/sync/realtime-sync";
import { AVISOS_KEY } from "@/lib/sync/avisos-cuenta";

/** Preferencias de usuario que esta auditoría añadió a la cuenta. */
const AÑADIDAS = [
    "starseed.astraura.chime.v1",
    "starseed.voz.modo.v1",
    "starseed.voz.timbre.v1",
    "starseed.voz.timbres-propios.v1",
    "starseed.inicio.pantalla.v1",
    "starseed.theme.favorites.v1",
    "starseed.privacy.telemetry",
    "starseed.privacy.ghost",
] as const;

/** Lo que jamás debe viajar: secretos, bloqueo, identidad y ids de este medio, cachés y colas. */
const NUNCA = [
    "starseed.ai.providers",
    "starseed.connectors.creds.v1",
    "starseed.aurora.wake.porcupine.key",
    "starseed.media.prefs.v1",
    "starseed.nvidia.apikey",
    "starseed.voicebox.key.v1",
    "starseed.almacenamiento.tokens.v1",
    "starseed.almacenamiento.clientids.v1",
    "starseed.bloqueo.v1",
    "starseed.bloqueo.sesion.v1",
    "starseed.bloqueo.intentos.v1",
    "starseed.device.id",
    "starseed.device.id.v1",
    "starseed.device.self",
    "starseed.device.alias.v1",
    "starseed.neuron.device-id",
    "starseed.mesh.device-id.v1",
    "starseed.mesh.identity.v1",
    "starseed.mesh.master-identity.v1",
    "starseed.mesh.enc-identity.v1",
    "starseed.mesh.relay-key.v1",
    "starseed.mesh.relay-keyring.v1",
    "starseed.mesh.revocation-cert.v1",
    "starseed.brain.abc.memory-mirror.v1",
    "starseed.brain.abc.offline-queue.v1",
];

/**
 * Claves sincronizadas cuyo NOMBRE contiene una palabra «sensible» pero que NO son secretos
 * (cada excepción con su motivo). Cualquier otra coincidencia rompe la prueba.
 */
const NOMBRE_SENSIBLE_PERMITIDO: Record<string, string> = {
    "starseed.aurora.wake.acoustic": "solo el interruptor; la clave Porcupine va en otra y nunca viaja",
    "starseed.privacy.telemetry": "preferencia de privacidad (booleano)",
};
const NOMBRE_SENSIBLE = /(secret|password|passwd|token|api-?key|credential|porcupine|passkey|verifier|salt|bearer|private)/i;

describe("SYNCED_KEYS · política de persistencia", () => {
    it("no hay claves repetidas", () => {
        const vistas = new Set<string>();
        const repetidas = SYNCED_KEYS.filter((k) => (vistas.has(k) ? true : (vistas.add(k), false)));
        expect(repetidas).toEqual([]);
    });

    it("ninguna clave sincronizada está también en la lista de las que NUNCA viajan", () => {
        expect(SYNCED_KEYS.filter((k) => isNeverSyncedKey(k))).toEqual([]);
    });

    it("las preferencias auditadas viajan con la cuenta", () => {
        for (const k of AÑADIDAS) {
            expect((SYNCED_KEYS as readonly string[]).includes(k), `${k} no está en SYNCED_KEYS`).toBe(true);
            expect(isSyncedKey(k), `${k} no la trata el motor como sincronizada`).toBe(true);
        }
    });

    it("el almacén de avisos viaja y se fusiona (no se pisa)", () => {
        expect(isSyncedKey(AVISOS_KEY)).toBe(true);
        expect(esClaveFusionable(AVISOS_KEY)).toBe(true);
    });

    it("secretos, bloqueo, ids de dispositivo y cachés NUNCA viajan", () => {
        for (const k of NUNCA) {
            expect(isNeverSyncedKey(k), `${k} debería estar prohibida`).toBe(true);
            expect(isSyncedKey(k), `${k} no debería sincronizarse`).toBe(false);
        }
    });

    it("ninguna clave sincronizada tiene nombre de secreto (salvo excepciones justificadas)", () => {
        const sospechosas = (SYNCED_KEYS as readonly string[]).filter((k) => NOMBRE_SENSIBLE.test(k) && !(k in NOMBRE_SENSIBLE_PERMITIDO));
        expect(sospechosas).toEqual([]);
    });
});

describe("documento de política", () => {
    const doc = readFileSync(join(process.cwd(), "architecture", "persistencia-entre-medios.md"), "utf8");

    it("nombra cada clave que la auditoría añadió a la cuenta", () => {
        for (const k of AÑADIDAS) expect(doc, `${k} no está en architecture/persistencia-entre-medios.md`).toContain(k);
    });

    it("nombra el almacén de avisos y las claves que nunca viajan", () => {
        expect(doc).toContain(AVISOS_KEY);
        for (const k of ["starseed.neuron.device-id", "starseed.device.id", "starseed.mesh.device-id.v1", "starseed.bloqueo.v1", "starseed.media.prefs.v1"]) {
            expect(doc, `${k} no está documentada como local`).toContain(k);
        }
    });
});
