/**
 * PAQUETES .OVSVOICE — Importar y exportar perfiles de voz de VoiceStudio.
 * Módulo PURO: sin red, disco, reloj ni audio. Entrada/salida: Uint8Array.
 */
import { buildZipBlob, listZipEntries } from "@/lib/files/simple-zip";

export const MAX_OVSVOICE_SIZE = 100 * 1024 * 1024;

export const LICENCIAS_PERMITIDAS = [
    "CC0-1.0",
    "CC-BY-4.0",
    "CC-BY-SA-4.0",
    "CC-BY-NC-4.0",
    "CC-BY-NC-SA-4.0",
    "CC-BY-ND-4.0",
    "MIT",
    "Apache-2.0",
    "LicenseRef-VoiceStudio-Personal",
] as const;

export type LicenciaSpdx = (typeof LICENCIAS_PERMITIDAS)[number];

export const LICENCIA_DEFECTO: LicenciaSpdx = "LicenseRef-VoiceStudio-Personal";

export type ClaseLicenciaOvs = "libre" | "personal" | "condicionada";

export interface OvsPersona {
    name: string;
    kind: "humana" | "sintetica" | "personaje";
    language: string;
    personality?: string;
    instruct?: string;
    ref_text?: string;
    seed?: string;
    is_locked?: boolean;
}

export interface OvsManifest {
    format: "ovsvoice";
    schema_version: 1;
    persona: OvsPersona;
    engine: string;
    license: { spdx: LicenciaSpdx };
    tags: string[];
    preview: string;
    members: string[];
}

export interface OvsConsent {
    titular: string;
    concedido_a: string;
    para: string[];
    desde: number;
    hasta?: number;
    revocado?: boolean;
}

export interface OvsAudioRefs {
    ref_audio?: string;
    locked_audio?: string;
    consent_audio?: string;
    preview: string;
}

export interface OvsvoiceImportResult {
    manifest: OvsManifest;
    consent: OvsConsent | null;
    audios: OvsAudioRefs;
    licenseClass: ClaseLicenciaOvs;
    warnings: string[];
}

export function claseDeLicencia(spdx: string): ClaseLicenciaOvs {
    const noComerciales = ["CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "LicenseRef-VoiceStudio-Personal"];
    const condicionadas = ["CC-BY-SA-4.0", "CC-BY-ND-4.0"];
    if (noComerciales.includes(spdx)) return "personal";
    if (condicionadas.includes(spdx)) return "condicionada";
    return "libre";
}

export function normalizarLicencia(spdx: string): LicenciaSpdx {
    if (LICENCIAS_PERMITIDAS.includes(spdx as LicenciaSpdx)) return spdx as LicenciaSpdx;
    return LICENCIA_DEFECTO;
}

function leerArchivoZip(bytes: Uint8Array, nombre: string): Uint8Array | null {
    const view = new DataView(bytes.buffer);
    const LOCAL_SIG = 0x04034b50;
    let offset = 0;

    while (offset + 30 <= bytes.length) {
        if (view.getUint32(offset, true) !== LOCAL_SIG) {
            offset++;
            continue;
        }
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const headerSize = 30 + nameLen + extraLen;
        const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLen);
        const name = new TextDecoder().decode(nameBytes);
        if (name === nombre) {
            const compressedSize = view.getUint32(offset + 18, true);
            const dataStart = offset + headerSize;
            return bytes.slice(dataStart, dataStart + compressedSize);
        }
        const compressedSize = view.getUint32(offset + 18, true);
        offset += headerSize + compressedSize;
    }
    return null;
}

async function parseJson<T>(bytes: Uint8Array): Promise<T | null> {
    try {
        const text = new TextDecoder().decode(bytes);
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

export async function importarOvsvoice(bytes: Uint8Array): Promise<OvsvoiceImportResult> {
    const warnings: string[] = [];

    if (bytes.length > MAX_OVSVOICE_SIZE) {
        throw new Error(`Paquete .ovsvoice demasiado grande: ${bytes.length} bytes (máx. ${MAX_OVSVOICE_SIZE})`);
    }

    const entries = listZipEntries(bytes.buffer as ArrayBuffer);
    if (!entries.length) {
        throw new Error("Archivo .ovsvoice inválido: ZIP vacío o corrupto");
    }

    const manifestBytes = leerArchivoZip(bytes, "manifest.json");
    if (!manifestBytes) {
        throw new Error("Archivo .ovsvoice inválido: falta manifest.json");
    }
    const manifest = await parseJson<OvsManifest>(manifestBytes);
    if (!manifest) {
        throw new Error("manifest.json inválido: JSON mal formado");
    }

    if (manifest.format !== "ovsvoice") {
        throw new Error(`Formato no soportado: ${manifest.format} (se esperaba "ovsvoice")`);
    }
    if (manifest.schema_version !== 1) {
        warnings.push(`schema_version ${manifest.schema_version} no reconocido; se procesa como v1`);
    }

    const licenciaNormalizada = normalizarLicencia(manifest.license?.spdx);
    const licenseClass = claseDeLicencia(licenciaNormalizada);
    if (licenciaNormalizada !== manifest.license?.spdx) {
        warnings.push(`Licencia "${manifest.license?.spdx}" no está en la lista blanca; se normaliza a "${licenciaNormalizada}" (clase: ${licenseClass})`);
    }

    const consentBytes = leerArchivoZip(bytes, "consent.json");
    const consent = consentBytes ? (await parseJson<OvsConsent>(consentBytes)) : null;
    if (consent && consent.revocado) {
        warnings.push("Consentimiento revocado: el archivo indica que el permiso fue retirado");
    }

    const audios: OvsAudioRefs = {
        preview: manifest.preview,
    };
    if (manifest.members.includes("ref_audio")) audios.ref_audio = "ref_audio";
    if (manifest.members.includes("locked_audio")) audios.locked_audio = "locked_audio";
    if (manifest.members.includes("consent_audio")) audios.consent_audio = "consent_audio";

    return {
        manifest: { ...manifest, license: { spdx: licenciaNormalizada } },
        consent,
        audios,
        licenseClass,
        warnings,
    };
}

export interface PerfilVozOvs {
    manifest: OvsManifest;
    consent: OvsConsent | null;
    audioRefs: OvsAudioRefs;
    audioData: Map<string, Uint8Array>;
}

export async function exportarOvsvoice(perfil: PerfilVozOvs): Promise<Blob> {
    const entries: { path: string; data: Uint8Array | string }[] = [];

    entries.push({
        path: "manifest.json",
        data: JSON.stringify(perfil.manifest, null, 2),
    });

    if (perfil.consent) {
        entries.push({
            path: "consent.json",
            data: JSON.stringify(perfil.consent, null, 2),
        });
    }

    for (const [nombre, data] of perfil.audioData) {
        entries.push({ path: nombre, data });
    }

    return buildZipBlob(entries);
}