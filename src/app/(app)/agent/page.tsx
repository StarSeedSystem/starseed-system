"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BrainCircuit, Mic, Send, Sparkles, Image as ImageIcon, FileText, Settings, History, Code } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AgentPage() {
  const [messages, setMessages] = useState([
    { role: 'agent', content: 'Sistemas en línea. Mi núcleo neural está sincronizado con tu perfil. ¿En qué trabajaremos hoy, piloto?', timestamp: 'Ahora' }
  ]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSkills = [
    { name: 'Generación de Código', icon: Code, level: 'Nivel 5' },
    { name: 'Análisis Semántico', icon: FileText, level: 'Nivel 4' },
    { name: 'Creación Visual', icon: ImageIcon, level: 'Nivel 3' },
  ];

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const newMsg = { role: 'user', content: inputValue, timestamp: 'Ahora' };
    setMessages(prev => [...prev, newMsg]);
    setInputValue("");
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'agent', content: 'Procesando tu solicitud en la red neuronal distribuida...', timestamp: 'Ahora' }]);
    }, 600);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages])

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6">
      {/* LEFT: Chat Interface */}
      <div className="flex-1 flex flex-col rounded-xl border bg-background/50 overflow-hidden shadow-sm">

        {/* Header */}
        <div className="p-4 border-b bg-muted/20 flex justify-between items-center backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center relative">
              <BrainCircuit className="w-5 h-5 text-primary animate-pulse" />
              <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></div>
            </div>
            <div>
              <h2 className="font-bold text-sm">Núcleo StarSeed v9.2</h2>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> En línea • Latencia: 12ms
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon"><Settings className="w-4 h-4" /></Button>
        </div>

        {/* Chat Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <Avatar className="w-8 h-8">
                  {msg.role === 'agent' ? (
                    <AvatarFallback className="bg-primary/10 text-primary"><BrainCircuit className="w-4 h-4" /></AvatarFallback>
                  ) : (
                    <AvatarImage src="https://placehold.co/40x40.png" />
                  )}
                </Avatar>
                <div className={`p-3 rounded-2xl max-w-[80%] text-sm shadow-sm ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                    : 'bg-card border rounded-tl-none'
                  }`}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background/40 backdrop-blur-md">
          <div className="flex gap-2 max-w-3xl mx-auto items-center">
            <Button variant="outline" size="icon" className="shrink-0"><Mic className="w-4 h-4" /></Button>
            <Input
              placeholder="Escribe un comando o pregunta..."
              className="flex-1 bg-background/50"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <Button onClick={handleSend} className="shrink-0 gap-2">
              <Send className="w-4 h-4" /> <span className="hidden sm:inline">Ejecutar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* RIGHT: Skills & Context */}
      <div className="w-80 hidden xl:flex flex-col gap-6">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-4 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Habilidades Activas
            </h3>
            <div className="space-y-3">
              {activeSkills.map(skill => (
                <div key={skill.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-background rounded-md shadow-sm">
                      <skill.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{skill.name}</p>
                      <p className="text-[10px] text-muted-foreground">{skill.level}</p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4 text-xs">Administrar Habilidades</Button>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-4 text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-primary" /> Memoria a Corto Plazo
            </h3>
            <div className="space-y-4">
              <div className="flex gap-3 text-xs border-l-2 border-primary/20 pl-3">
                <div className="flex-1">
                  <p className="font-medium">Análisis de Proyecto Beta</p>
                  <p className="text-muted-foreground mt-1">Hace 2 horas</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs border-l-2 border-primary/20 pl-3">
                <div className="flex-1">
                  <p className="font-medium">Generación de Imagen "Bosque"</p>
                  <p className="text-muted-foreground mt-1">Hace 5 horas</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
