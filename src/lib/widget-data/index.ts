// StarSeed Widget Data — public barrel
export * from "./types";
export {
    registerAdapter,
    clearAdapter,
    getAdapter,
    fetchWidgetData,
    fetchWidgetDataSync,
    type Adapter,
} from "./adapters";
export {
    useWidgetData,
    type UseWidgetDataOptions,
    type WidgetDataState,
} from "./use-widget-data";

// Side-effect: registra los adaptadores mock de la 4ª y 5ª generación.
import "./gen4-adapters";
import "./gen5-adapters";
