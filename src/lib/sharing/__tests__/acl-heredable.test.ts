import { describe, it, expect } from "vitest";
import {
    computeEffectiveAccess,
    type EffectiveAccess,
    type ResourceRef,
    AccessScope,
    AccessRole,
    libraryResourceRef,
} from "../access";
import type { EntityLibraryDoc, LibraryFolder, SavedItem, ItemACL, AclGrant } from "@/lib/library/entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";

function makeDoc(overrides: Partial<EntityLibraryDoc> = {}): EntityLibraryDoc {
    return {
        items: [],
        folders: [],
        rev: 1,
        updatedAt: new Date().toISOString(),
        version: 3,
        deletedItems: {},
        deletedFolders: {},
        ...overrides,
    };
}

function makeFolder(id: string, name: string, parentId: string | null = null, acl?: ItemACL): LibraryFolder {
    return { id, name, parentId, createdAt: new Date().toISOString(), createdBy: "test", acl };
}

function makeItem(id: string, title: string, folderId: string | null = null, acl?: ItemACL): SavedItem {
    return {
        id,
        type: "file",
        title,
        note: "",
        tags: [],
        folderId,
        addedAt: new Date().toISOString(),
        addedBy: "test",
        acl,
    };
}

function makeAcl(scope: AccessScope, grants: AclGrant[] = []): ItemACL {
    return {
        read: [],
        write: [],
        scope,
        grants,
        updatedAt: new Date().toISOString(),
    };
}

function makeGrant(granteeKind: "profile" | "account" | "group" | "page" | "link", granteeId: string, role: AccessRole): AclGrant {
    return { granteeKind, granteeId, role };
}

const testEntityRef: EntityRef = { kind: "user", id: "account-123" };
const defaultAcc = { scope: "account" as AccessScope, grants: [] as any[], spaceId: null as string | null, updatedAt: "" };

describe("computeEffectiveAccess — resolvedor puro de ACL heredable", () => {
    it("nodo sin biblioteca (desktop/dashboard/brain) devuelve default con own:true", () => {
        const ref: ResourceRef = { type: "desktop", id: "desk-1" };
        const doc = makeDoc();
        const result = computeEffectiveAccess(doc, ref);
        expect(result.own).toBe(true);
        expect(result.inheritedFrom).toBeNull();
        expect(result.scope).toBe("account");
    });

    it("biblioteca con ACL propia la devuelve con own:true", () => {
        const libRef = libraryResourceRef(testEntityRef, "Mi Biblioteca");
        const acl = makeAcl("profiles", [makeGrant("profile", "profile-1", "edit")]);
        const doc = makeDoc({ acl });
        const result = computeEffectiveAccess(doc, libRef);
        expect(result.own).toBe(true);
        expect(result.inheritedFrom).toBeNull();
        expect(result.scope).toBe("profiles");
        expect(result.grants).toHaveLength(1);
        expect(result.grants[0].granteeId).toBe("profile-1");
    });

    it("folder con ACL propia la devuelve con own:true", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const folderAcl = makeAcl("groups", [makeGrant("group", "grupo-1", "view")]);
        const doc = makeDoc({ folders: [makeFolder("folder-1", "Folder A", null, folderAcl)] });
        const folderRef: ResourceRef = { type: "folder", id: "folder-1", libraryRef: libRef.libraryRef, title: "Folder A" };
        const result = computeEffectiveAccess(doc, folderRef);
        expect(result.own).toBe(true);
        expect(result.inheritedFrom).toBeNull();
        expect(result.scope).toBe("groups");
    });

    it("archivo con ACL propia la devuelve con own:true", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const fileAcl = makeAcl("public", [makeGrant("link", "public", "view")]);
        const doc = makeDoc({ items: [makeItem("file-1", "Archivo.txt", null, fileAcl)] });
        const fileRef: ResourceRef = { type: "file", id: "file-1", libraryRef: libRef.libraryRef, title: "Archivo.txt" };
        const result = computeEffectiveAccess(doc, fileRef);
        expect(result.own).toBe(true);
        expect(result.inheritedFrom).toBeNull();
        expect(result.scope).toBe("public");
    });

    it("archivo sin ACL hereda del folder padre", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const folderAcl = makeAcl("account", [makeGrant("account", "account-123", "admin")]);
        const doc = makeDoc({
            folders: [makeFolder("folder-1", "Padre", null, folderAcl)],
            items: [makeItem("file-1", "Archivo.txt", "folder-1")],
        });
        const fileRef: ResourceRef = { type: "file", id: "file-1", libraryRef: libRef.libraryRef, title: "Archivo.txt" };
        const result = computeEffectiveAccess(doc, fileRef);
        expect(result.own).toBe(false);
        expect(result.inheritedFrom).not.toBeNull();
        expect(result.inheritedFrom?.id).toBe("folder-1");
        expect(result.inheritedFromLabel).toBe("Padre");
        expect(result.scope).toBe("account");
    });

    it("folder sin ACL hereda de la biblioteca raíz", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const libAcl = makeAcl("profiles", [makeGrant("profile", "profile-1", "edit")]);
        const doc = makeDoc({ acl: libAcl, folders: [makeFolder("folder-1", "Folder A", null)] });
        const folderRef: ResourceRef = { type: "folder", id: "folder-1", libraryRef: libRef.libraryRef, title: "Folder A" };
        const result = computeEffectiveAccess(doc, folderRef);
        expect(result.own).toBe(false);
        expect(result.inheritedFrom).not.toBeNull();
        expect(result.inheritedFrom?.type).toBe("library");
        expect(result.inheritedFromLabel).toBe("Biblioteca");
        expect(result.scope).toBe("profiles");
    });

    it("archivo → folder padre → abuelo folder → biblioteca (cadena completa)", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const libAcl = makeAcl("private");
        const abueloAcl = makeAcl("public", [makeGrant("link", "public", "view")]);
        const doc = makeDoc({
            acl: libAcl,
            folders: [
                makeFolder("abuelo", "Abuelo", null, abueloAcl),
                makeFolder("padre", "Padre", "abuelo"),
            ],
            items: [makeItem("file-1", "Archivo.txt", "padre")],
        });
        const fileRef: ResourceRef = { type: "file", id: "file-1", libraryRef: libRef.libraryRef, title: "Archivo.txt" };
        const result = computeEffectiveAccess(doc, fileRef);
        expect(result.own).toBe(false);
        expect(result.inheritedFrom?.id).toBe("abuelo");
        expect(result.inheritedFromLabel).toBe("Abuelo");
        expect(result.scope).toBe("public");
    });

    it("sin ACL en toda la cadena devuelve default (account) con own:false", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const doc = makeDoc({
            folders: [makeFolder("folder-1", "Folder A", null)],
            items: [makeItem("file-1", "Archivo.txt", "folder-1")],
        });
        const fileRef: ResourceRef = { type: "file", id: "file-1", libraryRef: libRef.libraryRef, title: "Archivo.txt" };
        const result = computeEffectiveAccess(doc, fileRef);
        expect(result.own).toBe(false);
        expect(result.inheritedFrom).toBeNull();
        expect(result.scope).toBe("account");
        expect(result.grants).toHaveLength(0);
    });

    it("protección contra ciclos: no entra en bucle infinito", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const folderAcl = makeAcl("custom", [makeGrant("account", "account-123", "view")]);
        const doc = makeDoc({
            folders: [
                makeFolder("folder-1", "Folder A", "folder-2", folderAcl),
                makeFolder("folder-2", "Folder B", "folder-1"),
            ],
        });
        const folderRef: ResourceRef = { type: "folder", id: "folder-1", libraryRef: libRef.libraryRef, title: "Folder A" };
        const result = computeEffectiveAccess(doc, folderRef);
        expect(result.own).toBe(true);
        expect(result.scope).toBe("custom");
    });

    it("folder con ACL vacía (read/write vacíos, sin scope) NO cuenta como propia → hereda", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const libAcl = makeAcl("account", [makeGrant("account", "account-123", "admin")]);
        const emptyAcl: ItemACL = { read: [], write: [] };
        const doc = makeDoc({
            acl: libAcl,
            folders: [makeFolder("folder-1", "Folder A", null, emptyAcl)],
        });
        const folderRef: ResourceRef = { type: "folder", id: "folder-1", libraryRef: libRef.libraryRef, title: "Folder A" };
        const result = computeEffectiveAccess(doc, folderRef);
        expect(result.own).toBe(false);
        expect(result.inheritedFrom?.type).toBe("library");
        expect(result.scope).toBe("account");
    });

    it("ACL v2 legacy (solo read/write) con scope undefined se trata como propia si tiene entradas", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const legacyAcl: ItemACL = {
            read: [{ kind: "user", id: "account-123" }],
            write: [{ kind: "user", id: "account-123" }],
            updatedAt: new Date().toISOString(),
        };
        const doc = makeDoc({ folders: [makeFolder("folder-1", "Folder A", null, legacyAcl)] });
        const folderRef: ResourceRef = { type: "folder", id: "folder-1", libraryRef: libRef.libraryRef, title: "Folder A" };
        const result = computeEffectiveAccess(doc, folderRef);
        expect(result.own).toBe(true);
        expect(result.scope).toBe("custom");
    });

    it("spaceId del resultado es null para nodos heredados", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const folderAcl = makeAcl("profiles", [makeGrant("profile", "profile-1", "edit")]);
        const doc = makeDoc({
            folders: [makeFolder("folder-1", "Padre", null, folderAcl)],
            items: [makeItem("file-1", "Archivo.txt", "folder-1")],
        });
        const fileRef: ResourceRef = { type: "file", id: "file-1", libraryRef: libRef.libraryRef, title: "Archivo.txt" };
        const result = computeEffectiveAccess(doc, fileRef);
        expect(result.spaceId).toBeNull();
    });

    it("grants con sections se preservan en la herencia", () => {
        const libRef = libraryResourceRef(testEntityRef);
        const folderAcl = makeAcl("profiles", [
            makeGrant("profile", "profile-1", "edit"),
            { granteeKind: "profile", granteeId: "profile-2", role: "view", sections: ["tab-1", "tab-2"] },
        ]);
        const doc = makeDoc({
            folders: [makeFolder("folder-1", "Padre", null, folderAcl)],
            items: [makeItem("file-1", "Archivo.txt", "folder-1")],
        });
        const fileRef: ResourceRef = { type: "file", id: "file-1", libraryRef: libRef.libraryRef, title: "Archivo.txt" };
        const result = computeEffectiveAccess(doc, fileRef);
        expect(result.grants).toHaveLength(2);
        expect(result.grants[1].sections).toEqual(["tab-1", "tab-2"]);
    });
});