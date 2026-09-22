import { describe, it, expect } from "vitest";
import { filesTopic, humanFileSize, fileToAttachment, MAX_UPLOAD_BYTES, type OsFile } from "@/lib/files/os-files";

describe("os-files pure functions", () => {
    it("filesTopic returns topic string", () => {
        expect(filesTopic("user-123")).toBe("files:user-123");
    });

    it("humanFileSize formats sizes correctly", () => {
        expect(humanFileSize(null)).toBe("");
        expect(humanFileSize(0)).toBe("");
        expect(humanFileSize(-100)).toBe("");
        expect(humanFileSize(500)).toBe("500 B");
        expect(humanFileSize(1024)).toBe("1.0 KB");
        expect(humanFileSize(1536)).toBe("1.5 KB");
        expect(humanFileSize(1048576)).toBe("1.0 MB");
        expect(humanFileSize(1073741824)).toBe("1.0 GB");
    });

    it("fileToAttachment converts OsFile to UniversalAttachment", () => {
        const dummyFile: OsFile = {
            id: "file-1",
            owner: "uid-1",
            profileId: null,
            name: "foto.jpg",
            mime: "image/jpeg",
            size: 2048,
            path: "uid-1/general/foto.jpg",
            url: "https://storage/foto.jpg",
            deviceId: "dev-1",
            isPublic: false,
            aclRead: [],
            aclWrite: [],
            groupSlug: null,
            meta: {},
            createdAt: "2026-01-01T00:00:00Z",
        };

        const att = fileToAttachment(dummyFile);
        expect(att.kind).toBe("image");
        expect(att.name).toBe("foto.jpg");
        expect(att.mime).toBe("image/jpeg");
        expect(att.url).toBe("https://storage/foto.jpg");
        expect(att.size).toBe(2048);
        expect(att.fileId).toBe("file-1");
    });

    it("MAX_UPLOAD_BYTES is 50MB", () => {
        expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
    });
});
