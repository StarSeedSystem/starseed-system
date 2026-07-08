import { useEffect, useState } from "react";
import { syncManager, OS_TABLE, SyncPayload } from "./sync-manager";

/**
 * Hook para suscribirse a cambios de una entidad específica de forma optimizada
 * usando el motor unificado (multiplexado).
 */
export function useEntitySync<T>(
  table: OS_TABLE,
  filterColumn: string,
  filterValue: string,
  initialData: T | null = null
) {
  const [data, setData] = useState<T | null>(initialData);
  const [lastEvent, setLastEvent] = useState<'INSERT' | 'UPDATE' | 'DELETE' | null>(null);

  useEffect(() => {
    if (!filterValue) return;
    
    // Inicia con los datos pasados, permitiendo hidratación inicial
    if (initialData) setData(initialData);

    const unsubscribe = syncManager.subscribe<T>(
      table, 
      filterColumn, 
      filterValue, 
      (payload: SyncPayload<T>) => {
        setData(payload.record);
        setLastEvent(payload.eventType);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [table, filterColumn, filterValue, initialData]);

  // Exponemos el método mutate del singleton
  const mutate = async (updateData: Partial<T>) => {
    return syncManager.mutate(table, updateData, { [filterColumn]: filterValue } as any);
  };

  return { data, lastEvent, mutate };
}
