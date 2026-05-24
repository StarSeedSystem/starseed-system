import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar as CalendarIcon, MapPin, Navigation, Info, Clock, Users } from "lucide-react";

export function MapPlaceholder() {
    return (
        <div className="relative w-full aspect-[16/9] bg-muted/20 rounded-xl overflow-hidden border border-primary/20 group">
            {/* Abstract Map Visuals */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute top-[20%] left-[30%] w-32 h-32 bg-primary/40 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[40%] right-[20%] w-48 h-48 bg-accent/30 rounded-full blur-3xl animate-pulse delay-1000"></div>

                {/* Grid Lines */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            </div>

            {/* Simulated Pins */}
            <div className="absolute top-[35%] left-[45%] group-hover:scale-110 transition-transform cursor-pointer">
                <div className="relative">
                    <div className="absolute -inset-2 bg-primary/30 rounded-full blur-md animate-ping"></div>
                    <MapPin className="w-8 h-8 text-primary drop-shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)]" />
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur border px-3 py-1 rounded-md shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        E.F. del Valle Central
                    </div>
                </div>
            </div>

            <div className="absolute bottom-[25%] right-[30%] hover:scale-110 transition-transform cursor-pointer">
                <div className="relative">
                    <Navigation className="w-6 h-6 text-accent drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]" />
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur border px-3 py-1 rounded-md shadow-xl text-xs whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity">
                        Evento: Festival de Arte
                    </div>
                </div>
            </div>

            {/* UI Controls Overlay */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
                <Button size="sm" variant="secondary" className="backdrop-blur-md bg-background/50"><Info className="w-4 h-4 mr-2" /> Capas</Button>
                <Button size="sm" variant="secondary" className="backdrop-blur-md bg-background/50"><Navigation className="w-4 h-4 mr-2" /> Mi Ubicación</Button>
            </div>

            <div className="absolute bottom-4 left-4 p-4 bg-background/80 backdrop-blur-md border rounded-lg max-w-xs">
                <h4 className="font-bold text-sm mb-1">Mapa Interactivo StarSeed</h4>
                <p className="text-xs text-muted-foreground">Explora Entidades Federativas, comunidades y eventos en tiempo real. Haz clic en el mapa para sugerir nuevos Lugares.</p>
            </div>
        </div>
    )
}

export function EventCalendarView() {
    const events = [
        { id: 1, day: 12, title: "Taller de Permacultura", time: "10:00 AM", type: "Clase", color: "bg-green-500" },
        { id: 2, day: 15, title: "Asamblea General", time: "18:00 PM", type: "Política", color: "bg-blue-500" },
        { id: 3, day: 18, title: "Festival de Música", time: "20:00 PM", type: "Cultura", color: "bg-purple-500" },
        { id: 4, day: 22, title: "Hackathon de IA", time: "09:00 AM", type: "Tecnología", color: "bg-orange-500" },
    ];

    return (
        <div className="grid lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden shadow-sm">
                    {/* Header Days */}
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                        <div key={d} className="bg-muted/50 p-3 text-center text-sm font-semibold">{d}</div>
                    ))}
                    {/* Days Grid (Mockup for current month) */}
                    {Array.from({ length: 31 }).map((_, i) => {
                        const day = i + 1;
                        const dayEvents = events.filter(e => e.day === day);
                        return (
                            <div key={i} className="bg-card min-h-[100px] p-2 hover:bg-muted/20 transition-colors relative group border-t border-l border-border/20">
                                <span className="text-xs font-medium text-muted-foreground">{day}</span>
                                <div className="mt-1 space-y-1">
                                    {dayEvents.map(e => (
                                        <div key={e.id} className="text-[10px] p-1 rounded bg-secondary/50 border border-border truncate cursor-pointer hover:bg-secondary transition-colors">
                                            <div className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${e.color}`}></div>
                                            {e.title}
                                        </div>
                                    ))}
                                </div>
                                {/* Quick Add Button on Hover */}
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-5 w-5"><Users className="h-3 w-3" /></Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Próximos Eventos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {events.map(e => (
                            <div key={e.id} className="flex gap-3 items-start pb-3 border-b last:border-0">
                                <div className={`w-1 h-full min-h-[40px] rounded-full ${e.color} opacity-70`}></div>
                                <div>
                                    <p className="font-semibold text-sm">{e.title}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                        <Clock className="w-3 h-3" /> {e.time}
                                    </div>
                                    <Badge variant="outline" className="mt-2 text-[10px]">{e.type}</Badge>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
