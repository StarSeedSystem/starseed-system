import { useMemo, useState } from 'react';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ReferenciaTarjeta } from './tarjeta-referencia';
import referencias from '../../../../config/referencias-inspiracion.json';

export function ReferenciasPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('todos');

  const filteredReferencias = useMemo(() => {
    return referencias.entradas.filter((entry: any) => {
      const matchesSearch =
        entry.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.que_es.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTab =
        activeTab === 'todos' || entry.tema === activeTab;

      return matchesSearch && matchesTab;
    });
  }, [searchTerm, activeTab, referencias.entradas]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Referencias e inspiración</h2>
      <Input
        placeholder="Buscar referencias..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        type="text"
        className="mb-4"
      />
      <Tabs defaultValue="todos" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-[200px_1fr]">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          {referencias.temas.map((tema: any) => (
            <TabsTrigger key={tema.id} value={tema.id}>
              {tema.nombre}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="todos">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReferencias.map((referencia: any) => (
              <ReferenciaTarjeta key={referencia.id} referencia={referencia} />
            ))}
          </div>
        </TabsContent>
        {referencias.temas.map((tema: any) => (
          <TabsContent key={tema.id} value={tema.id}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReferencias.map((referencia: any) => (
                <ReferenciaTarjeta key={referencia.id} referencia={referencia} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}