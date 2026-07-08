"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { EntityEditorDialog, type EntityEditorType } from "@/components/social/entity-editor-dialog";

function EntityCreatorLogic() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [type, setType] = useState<EntityEditorType>("page");

    useEffect(() => {
        const createParam = searchParams.get("createEntity");
        if (createParam === "page" || createParam === "group" || createParam === "event") {
            setType(createParam);
            setOpen(true);
        } else {
            setOpen(false);
        }
    }, [searchParams]);

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) {
            // Remove the query param when closing
            const current = new URLSearchParams(Array.from(searchParams.entries()));
            current.delete("createEntity");
            const search = current.toString();
            const query = search ? `?${search}` : "";
            router.push(`${pathname}${query}`, { scroll: false });
        }
    };

    return (
        <EntityEditorDialog
            open={open}
            onOpenChange={handleOpenChange}
            mode="create"
            defaultType={type}
        />
    );
}

export function GlobalEntityCreator() {
    return (
        <Suspense fallback={null}>
            <EntityCreatorLogic />
        </Suspense>
    );
}
