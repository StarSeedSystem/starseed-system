// src/app/(main)/settings/page.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle, PlusCircle, Shield, User, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Configuración</h1>
        <p className="text-muted-foreground">
          Gestiona tu cuenta, perfiles, conexiones y más.
        </p>
      </div>

      <Tabs defaultValue="profiles" className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="profiles">Perfiles</TabsTrigger>
          <TabsTrigger value="account">Cuenta</TabsTrigger>
          <TabsTrigger value="connections">Conexiones</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profiles" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><Users className="w-6 h-6" /> Gestionar Perfiles</CardTitle>
              <CardDescription>Crea y cambia entre diferentes perfiles para diferentes contextos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src="https://placehold.co/100x100.png" alt="@starseeduser" data-ai-hint="user avatar" />
                        <AvatarFallback>SU</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold">StarSeedUser <span className="text-xs font-normal text-primary">(Activo)</span></p>
                      <p className="text-sm text-muted-foreground">@starseeduser</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Shield className="w-4 h-4 text-accent" />
                        <span className="text-xs text-accent font-semibold">Perfil Oficial</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline">Editar Perfil</Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src="https://placehold.co/100x100.png" alt="@artist" data-ai-hint="artist avatar" />
                        <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold">Persona Artística</p>
                      <p className="text-sm text-muted-foreground">@artista</p>
                    </div>
                  </div>
                  <Button variant="secondary">Cambiar a este Perfil</Button>
                </div>
              </div>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4"/>
                Crear Nuevo Perfil
              </Button>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><User className="w-6 h-6" /> Editar Perfil: StarSeedUser</CardTitle>
              <CardDescription>Esta información es para tu perfil actualmente activo. La visibilidad pública se puede configurar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                    <AvatarImage src="https://placehold.co/100x100.png" alt="@user" data-ai-hint="user avatar" />
                    <AvatarFallback>SU</AvatarFallback>
                </Avatar>
                <Button variant="outline">Cambiar Foto</Button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre Completo</Label>
                  <Input id="name" defaultValue="StarSeed User" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Nombre de Usuario</Label>
                  <Input id="username" defaultValue="@starseeduser" />
                </div>
              </div>
              <div className="space-y-2">
                  <Label htmlFor="bio">Biografía</Label>
                  <Input id="bio" placeholder="Cuéntanos sobre ti" />
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="official-profile-switch" defaultChecked disabled/>
                <Label htmlFor="official-profile-switch" className="text-muted-foreground">Establecer como Perfil Oficial (Requiere verificación de identidad anual)</Label>
              </div>
            </CardContent>
            <CardFooter>
                <Button>Guardar Cambios del Perfil</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Configuración de la Cuenta</CardTitle>
              <CardDescription>Gestiona la configuración global de tu cuenta. Esto es privado y se aplica a todos tus perfiles.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="space-y-2">
                  <Label htmlFor="email">Dirección de Correo</Label>
                  <Input id="email" type="email" defaultValue="user@example.com" />
                </div>
                <div>
                  <Button variant="outline">Cambiar Contraseña</Button>
                </div>
                <div className="p-4 border-l-4 border-accent bg-accent/10">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-accent"/>
                    <h4 className="font-semibold">Identidad Verificada</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Tu identidad fue verificada el 15 de junio de 2024. La próxima verificación vence el 15 de junio de 2025 para mantener el estado de Perfil Oficial.</p>
                </div>
            </CardContent>
             <CardFooter>
                <Button>Guardar Cambios de la Cuenta</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="connections" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Cuentas Conectadas</CardTitle>
                    <CardDescription>Sincroniza tu perfil y contenido de otras plataformas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                            <p className="font-medium">GitHub</p>
                            <p className="text-sm text-muted-foreground">No Conectado</p>
                        </div>
                        <Button variant="outline">Conectar</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                            <p className="font-medium">Google Drive</p>
                            <p className="text-sm text-muted-foreground">No Conectado</p>
                        </div>
                        <Button variant="outline">Conectar</Button>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
