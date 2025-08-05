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
        <h1 className="text-3xl font-bold font-headline">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account, profiles, connections, and more.
        </p>
      </div>

      <Tabs defaultValue="profiles" className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profiles" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><Users className="w-6 h-6" /> Manage Profiles</CardTitle>
              <CardDescription>Create and switch between different profiles for different contexts.</CardDescription>
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
                      <p className="font-bold">StarSeedUser <span className="text-xs font-normal text-primary">(Active)</span></p>
                      <p className="text-sm text-muted-foreground">@starseeduser</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Shield className="w-4 h-4 text-accent" />
                        <span className="text-xs text-accent font-semibold">Official Profile</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline">Edit Profile</Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src="https://placehold.co/100x100.png" alt="@artist" data-ai-hint="artist avatar" />
                        <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold">Artist Persona</p>
                      <p className="text-sm text-muted-foreground">@artist</p>
                    </div>
                  </div>
                  <Button variant="secondary">Switch to this Profile</Button>
                </div>
              </div>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4"/>
                Create New Profile
              </Button>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><User className="w-6 h-6" /> Edit Profile: StarSeedUser</CardTitle>
              <CardDescription>This information is for your currently active profile. Public visibility can be configured.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                    <AvatarImage src="https://placehold.co/100x100.png" alt="@user" data-ai-hint="user avatar" />
                    <AvatarFallback>SU</AvatarFallback>
                </Avatar>
                <Button variant="outline">Change Photo</Button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" defaultValue="StarSeed User" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" defaultValue="@starseeduser" />
                </div>
              </div>
              <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Input id="bio" placeholder="Tell us about yourself" />
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="official-profile-switch" defaultChecked disabled/>
                <Label htmlFor="official-profile-switch" className="text-muted-foreground">Set as Official Profile (Requires annual identity verification)</Label>
              </div>
            </CardContent>
            <CardFooter>
                <Button>Save Profile Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Account Settings</CardTitle>
              <CardDescription>Manage your global account settings. This is private and applies to all your profiles.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" defaultValue="user@example.com" />
                </div>
                <div>
                  <Button variant="outline">Change Password</Button>
                </div>
                <div className="p-4 border-l-4 border-accent bg-accent/10">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-accent"/>
                    <h4 className="font-semibold">Identity Verified</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Your identity was verified on June 15, 2024. Next verification is due by June 15, 2025 to maintain Official Profile status.</p>
                </div>
            </CardContent>
             <CardFooter>
                <Button>Save Account Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="connections" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Connected Accounts</CardTitle>
                    <CardDescription>Sync your profile and content from other platforms.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                            <p className="font-medium">GitHub</p>
                            <p className="text-sm text-muted-foreground">Not Connected</p>
                        </div>
                        <Button variant="outline">Connect</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                            <p className="font-medium">Google Drive</p>
                            <p className="text-sm text-muted-foreground">Not Connected</p>
                        </div>
                        <Button variant="outline">Connect</Button>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
