import { describe, expect, it } from "vitest";

import { collectAllOwnGroupSlugs } from "@/lib/social/os-profiles";

describe("collectAllOwnGroupSlugs", () => {
    it("recorre más de 100 membresías propias sin perder grupos", async () => {
        const rows = Array.from({ length: 205 }, (_, index) => ({
            group_slug: `grupo-${String(index).padStart(3, "0")}`,
        }));
        const ranges: Array<[number, number]> = [];

        const slugs = await collectAllOwnGroupSlugs(async (from, to) => {
            ranges.push([from, to]);
            return rows.slice(from, to + 1);
        }, 100);

        expect(slugs).toHaveLength(205);
        expect(slugs[100]).toBe("grupo-100");
        expect(slugs[204]).toBe("grupo-204");
        expect(ranges).toEqual([
            [0, 99],
            [100, 199],
            [200, 299],
        ]);
    });
});
