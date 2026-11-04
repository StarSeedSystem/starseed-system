// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { eventsForKey } from "@/lib/sync/realtime-sync";
import { EVENTO_MAUSBOT } from "@/lib/mausbot/config";

describe("EVENT_BY_KEY · Mausbot", () => {
    it("starseed.mausbot.v1 tiene el evento correcto (mismo que EVENTO_MAUSBOT)", () => {
        const eventos = eventsForKey("starseed.mausbot.v1");
        expect(eventos).toContain(EVENTO_MAUSBOT);
        expect(eventos).toContain("starseed:mausbot");
    });

    it("starseed.mausbot.disenes.v1 tiene el evento correcto (mismo que EVENTO_MAUSBOT)", () => {
        const eventos = eventsForKey("starseed.mausbot.disenes.v1");
        expect(eventos).toContain(EVENTO_MAUSBOT);
        expect(eventos).toContain("starseed:mausbot");
    });
});