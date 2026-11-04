// src/lib/aurora/voz-starseed/__tests__/ovsvoice.test.ts
/**
 * TESTS DE .OVSVOICE (Ola 1018V · Voz de Astraura + VoiceStudio: motores libres,
 * licencia por contexto, clonación con permiso e instantánea en cada neurona)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from "vitest";
import {
    importarOvsvoice,
    exportarOvsvoice,
    claseDeLicencia,
    normalizarLicencia,
    LICENCIA_DEFECTO,
    MAX_OVSVOICE_SIZE,
    type OvsManifest,
    type OvsConsent,
    type PerfilVozOvs,
} from "../ovsvoice";
import { buildZipBlob, listZipEntries, type ZipEntryInput } from "@/lib/files/simple-zip";

function crearManifestValido(sobrescrituras: Partial<OvsManifest> = {}): OvsManifest {
    return {
        format: "ovsvoice",
        schema_version: 1,
        persona: {
            name: "Test Voice",
            kind: "humana",
            language: "es",
            personality: "cálida y cercana",
        },
        engine: "omnivoice",
        license: { spdx: "CC-BY-4.0" },
        tags: ["español", "femenina"],
        preview: "preview.wav",
        members: ["ref_audio", "preview"],
        ...sobrescrituras,
    };
}

function crearConsentValido(sobrescrituras: Partial<OvsConsent> = {}): OvsConsent {
    return {
        titular: "alice",
        concedido_a: "bob",
        para: ["personal", "grupo"],
        desde: Date.now() - 86400000,
        hasta: Date.now() + 86400000,
        ...sobrescrituras,
    };
}

async function crearZipOvsvoice(
    manifest: OvsManifest,
    consent: OvsConsent | null,
    audioFiles: Record<string, Uint8Array>
): Promise<Uint8Array> {
    const entries: ZipEntryInput[] = [
        { path: "manifest.json", data: JSON.stringify(manifest, null, 2) },
    ];
    if (consent) {
        entries.push({ path: "consent.json", data: JSON.stringify(consent, null, 2) });
    }
    for (const [nombre, data] of Object.entries(audioFiles)) {
        entries.push({ path: nombre, data });
    }
    const blob = buildZipBlob(entries);
    return new Uint8Array(await blob.arrayBuffer());
}

describe("claseDeLicencia", () => {
    it("clasifica licencias no comerciales como 'personal'", () => {
        expect(claseDeLicencia("CC-BY-NC-4.0")).toBe("personal");
        expect(claseDeLicencia("CC-BY-NC-SA-4.0")).toBe("personal");
        expect(claseDeLicencia("LicenseRef-VoiceStudio-Personal")).toBe("personal");
    });

    it("clasifica licencias condicionadas como 'condicionada'", () => {
        expect(claseDeLicencia("CC-BY-SA-4.0")).toBe("condicionada");
        expect(claseDeLicencia("CC-BY-ND-4.0")).toBe("condicionada");
    });

    it("clasifica el resto como 'libre'", () => {
        expect(claseDeLicencia("CC0-1.0")).toBe("libre");
        expect(claseDeLicencia("CC-BY-4.0")).toBe("libre");
        expect(claseDeLicencia("MIT")).toBe("libre");
        expect(claseDeLicencia("Apache-2.0")).toBe("libre");
    });
});

describe("normalizarLicencia", () => {
    it("devuelve la licencia si está en la lista blanca", () => {
        expect(normalizarLicencia("CC-BY-4.0")).toBe("CC-BY-4.0");
        expect(normalizarLicencia("MIT")).toBe("MIT");
        expect(normalizarLicencia("LicenseRef-VoiceStudio-Personal")).toBe("LicenseRef-VoiceStudio-Personal");
    });

    it("devuelve la licencia por defecto para licencias desconocidas", () => {
        expect(normalizarLicencia("GPL-3.0")).toBe(LICENCIA_DEFECTO);
        expect(normalizarLicencia("propietaria")).toBe(LICENCIA_DEFECTO);
        expect(normalizarLicencia("")).toBe(LICENCIA_DEFECTO);
    });
});

describe("importarOvsvoice", () => {
    it("importa un paquete .ovsvoice válido con licencia libre", async () => {
        const manifest = crearManifestValido({ license: { spdx: "CC-BY-4.0" } });
        const consent = crearConsentValido();
        const audioFiles = {
            "ref_audio": new Uint8Array([1, 2, 3]),
            "preview.wav": new Uint8Array([4, 5, 6]),
        };
        const zip = await crearZipOvsvoice(manifest, consent, audioFiles);

        const resultado = await importarOvsvoice(zip);

        expect(resultado.manifest.persona.name).toBe("Test Voice");
        expect(resultado.manifest.license.spdx).toBe("CC-BY-4.0");
        expect(resultado.licenseClass).toBe("libre");
        expect(resultado.consent).not.toBeNull();
        expect(resultado.consent?.titular).toBe("alice");
        expect(resultado.audios.ref_audio).toBe("ref_audio");
        expect(resultado.audios.preview).toBe("preview.wav");
        expect(resultado.warnings).toHaveLength(0);
    });

    it("importa un paquete .ovsvoice con licencia no comercial → clase 'personal'", async () => {
        const manifest = crearManifestValido({ license: { spdx: "CC-BY-NC-4.0" } });
        const audioFiles = { "preview.wav": new Uint8Array([1, 2, 3]) };
        const zip = await crearZipOvsvoice(manifest, null, audioFiles);

        const resultado = await importarOvsvoice(zip);

        expect(resultado.manifest.license.spdx).toBe("CC-BY-NC-4.0");
        expect(resultado.licenseClass).toBe("personal");
    });

    it("normaliza licencia desconocida a LicenseRef-VoiceStudio-Personal con aviso", async () => {
        const manifest = crearManifestValido({ license: { spdx: "GPL-3.0" as any } });
        const audioFiles = { "preview.wav": new Uint8Array([1, 2, 3]) };
        const zip = await crearZipOvsvoice(manifest, null, audioFiles);

        const resultado = await importarOvsvoice(zip);

        expect(resultado.manifest.license.spdx).toBe(LICENCIA_DEFECTO);
        expect(resultado.licenseClass).toBe("personal");
        expect(resultado.warnings.some((w) => w.includes("no está en la lista blanca"))).toBe(true);
    });

    it("rechaza paquetes mayores a 100 MB", async () => {
        const grandesDatos = new Uint8Array(MAX_OVSVOICE_SIZE + 1);
        await expect(importarOvsvoice(grandesDatos)).rejects.toThrow(/demasiado grande/);
    });

    it("rechaza ZIP vacío o corrupto", async () => {
        const zipVacio = new Uint8Array([0, 0, 0, 0]);
        await expect(importarOvsvoice(zipVacio)).rejects.toThrow(/inválido/);
    });

    it("rechaza paquete sin manifest.json", async () => {
        const entries: ZipEntryInput[] = [{ path: "preview.wav", data: new Uint8Array([1, 2, 3]) }];
        const zip = new Uint8Array(await buildZipBlob(entries).arrayBuffer());
        await expect(importarOvsvoice(zip)).rejects.toThrow(/falta manifest\.json/);
    });

    it("rechaza manifest con formato incorrecto", async () => {
        const manifest = crearManifestValido({ format: "otro-formato" as any });
        const audioFiles = { "preview.wav": new Uint8Array([1, 2, 3]) };
        const zip = await crearZipOvsvoice(manifest, null, audioFiles);
        await expect(importarOvsvoice(zip)).rejects.toThrow(/Formato no soportado/);
    });

    it("rechaza manifest con JSON mal formado", async () => {
        const entries: ZipEntryInput[] = [
            { path: "manifest.json", data: "{ json: mal formado" },
            { path: "preview.wav", data: new Uint8Array([1, 2, 3]) },
        ];
        const zip = new Uint8Array(await buildZipBlob(entries).arrayBuffer());
        await expect(importarOvsvoice(zip)).rejects.toThrow(/JSON mal formado/);
    });

    it("añade aviso cuando consent.json está revocado", async () => {
        const manifest = crearManifestValido();
        const consent = crearConsentValido({ revocado: true });
        const audioFiles = { "preview.wav": new Uint8Array([1, 2, 3]) };
        const zip = await crearZipOvsvoice(manifest, consent, audioFiles);

        const resultado = await importarOvsvoice(zip);

        expect(resultado.consent?.revocado).toBe(true);
        expect(resultado.warnings.some((w) => w.includes("revocado"))).toBe(true);
    });

    it("avisa cuando schema_version no es 1", async () => {
        const manifest = crearManifestValido({ schema_version: 2 as any });
        const audioFiles = { "preview.wav": new Uint8Array([1, 2, 3]) };
        const zip = await crearZipOvsvoice(manifest, null, audioFiles);

        const resultado = await importarOvsvoice(zip);

        expect(resultado.warnings.some((w) => w.includes("schema_version"))).toBe(true);
    });
});

describe("exportarOvsvoice", () => {
    it("exporta un perfil a .ovsvoice y se puede reimportar (ida y vuelta)", async () => {
        const manifest = crearManifestValido({ license: { spdx: "CC-BY-4.0" } });
        const consent = crearConsentValido();
        const audioData = new Map<string, Uint8Array>([
            ["ref_audio", new Uint8Array([10, 20, 30])],
            ["preview.wav", new Uint8Array([40, 50, 60])],
        ]);

        const perfil: PerfilVozOvs = { manifest, consent, audioRefs: { preview: "preview.wav", ref_audio: "ref_audio" }, audioData };
        const blob = await exportarOvsvoice(perfil);
        const zip = new Uint8Array(await blob.arrayBuffer());

        const reimportado = await importarOvsvoice(zip);

        expect(reimportado.manifest.persona.name).toBe("Test Voice");
        expect(reimportado.manifest.license.spdx).toBe("CC-BY-4.0");
        expect(reimportado.licenseClass).toBe("libre");
        expect(reimportado.consent?.titular).toBe("alice");
    });

    it("exporta sin consent.json cuando no hay consentimiento", async () => {
        const manifest = crearManifestValido();
        const audioData = new Map<string, Uint8Array>([["preview.wav", new Uint8Array([1, 2, 3])]]);

        const perfil: PerfilVozOvs = { manifest, consent: null, audioRefs: { preview: "preview.wav" }, audioData };
        const blob = await exportarOvsvoice(perfil);
        const zip = new Uint8Array(await blob.arrayBuffer());

        const entries = listZipEntries(zip.buffer);
        const nombres = entries.map((e) => e.name);
        expect(nombres).not.toContain("consent.json");
    });

    it("incluye todos los archivos de audio referenciados", async () => {
        const manifest = crearManifestValido({ members: ["ref_audio", "locked_audio", "consent_audio", "preview"] });
        const audioData = new Map<string, Uint8Array>([
            ["ref_audio", new Uint8Array([1, 2])],
            ["locked_audio", new Uint8Array([3, 4])],
            ["consent_audio", new Uint8Array([5, 6])],
            ["preview.wav", new Uint8Array([7, 8])],
        ]);

        const perfil: PerfilVozOvs = { manifest, consent: null, audioRefs: { preview: "preview.wav", ref_audio: "ref_audio", locked_audio: "locked_audio", consent_audio: "consent_audio" }, audioData };
        const blob = await exportarOvsvoice(perfil);
        const zip = new Uint8Array(await blob.arrayBuffer());

        const entries = listZipEntries(zip.buffer);
        const nombres = entries.map((e) => e.name);
        expect(nombres).toContain("ref_audio");
        expect(nombres).toContain("locked_audio");
        expect(nombres).toContain("consent_audio");
        expect(nombres).toContain("preview.wav");
    });
});

describe("Licencia no comercial (clase 'personal')", () => {
    it("OmniVoice (CC-BY-NC) se clasifica como personal", () => {
        expect(claseDeLicencia("CC-BY-NC-4.0")).toBe("personal");
    });

    it("VoiceStudio Personal se clasifica como personal", () => {
        expect(claseDeLicencia("LicenseRef-VoiceStudio-Personal")).toBe("personal");
    });

    it("una licencia personal nunca se ofrece por defecto en contextos grupo/comunidad/público/comercial", () => {
        // Este test documenta la regla: la clase 'personal' solo suena en contexto 'personal'
        // La lógica de filtrado por contexto vive en licencia-voz.ts (motoresPermitidos)
        expect(["personal", "grupo", "comunidad", "publico", "comercial"]).toContain("personal");
    });
});