/*
 * File: AppDetails.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Tue Mar 24 2026
 * Modified By: Pedro Farias
 * 
 */


import React from "react";
import { AppInfo } from "../types/uninstaller";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Box, ShieldCheck, Package, Info, Terminal, FileCode, HardDrive, Search, Trash2, RefreshCcw } from "lucide-react";

interface AppDetailsProps {
  app: AppInfo;
  onBack: () => void;
  onCleanup: (name: string, id: string) => void;
  onUninstall: (app: AppInfo) => void;
  onUpdate: (app: AppInfo) => void;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const AppDetails = ({ app, onBack, onCleanup, onUninstall, onUpdate }: AppDetailsProps) => {
  const getMethodIcon = (method: string) => {
    const lowerMethod = method.toLowerCase();
    switch (lowerMethod) {
      case "flatpak": return <Box className="w-4 h-4 mr-2" />;
      case "snap": return <Package className="w-4 h-4 mr-2" />;
      case "cargo": return <ShieldCheck className="w-4 h-4 mr-2 text-orange-500" />;
      case "npm": return <Package className="w-4 h-4 mr-2 text-red-500" />;
      default: return <ShieldCheck className="w-4 h-4 mr-2" />;
    }
  };

  return (
    <div className="w-full min-h-screen animate-in fade-in duration-500 pb-20 pt-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-8 sm:space-y-12">
        <header className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="rounded-full w-10 h-10 p-0 hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col items-center">
            <h2 className="text-sm font-bold opacity-70 uppercase tracking-widest">
              Detalhes do aplicativo
            </h2>
          </div>
          <div className="w-10" />
        </header>

        <div className="space-y-10">
          {/* Hero Section */}
          <div className="flex flex-col items-center text-center space-y-4 pt-6">
            <div className="p-4 rounded-[2.2rem] sm:rounded-[2.5rem] bg-muted/40 shadow-xl border border-border ring-1 ring-border/50 overflow-hidden w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center transition-transform hover:scale-105 duration-500 dark:bg-black/40 dark:border-white/5 dark:shadow-2xl">
              {app.icon ? (
                <img src={app.icon} alt={app.name} className="w-full h-full object-contain p-2" />
              ) : (
                <Package className="w-12 h-12 sm:w-16 sm:h-16 opacity-20" />
              )}
            </div>
            <div className="space-y-1 px-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight break-words">{app.name}</h1>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                {app.comment || "Nenhuma descrição disponível."}
              </p>
            </div>
          </div>

          {/* Details Boxed List */}
          <div className="space-y-2">
            <h3 className="px-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Informações Gerais
            </h3>
            <div className="boxed-list">
              <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                <span className="text-sm font-medium">Identificador</span>
                <span className="text-[11px] sm:text-sm text-muted-foreground font-mono break-all">{app.id}</span>
              </div>
              <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                <span className="text-sm font-medium">Método de Instalação</span>
                <div className="flex items-center text-sm text-muted-foreground capitalize">
                  {getMethodIcon(app.install_method)}
                  {app.install_method}
                </div>
              </div>
              {app.version && (
                <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                  <span className="text-sm font-medium">Versão</span>
                  <span className="text-sm text-muted-foreground font-mono">{app.version}</span>
                </div>
              )}
              <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                <span className="text-sm font-medium">Escopo</span>
                <span className="text-sm text-muted-foreground">
                  {app.is_system ? "Global (Sistema)" : "Local (Usuário)"}
                </span>
              </div>
              {app.origin && (
                <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                  <span className="text-sm font-medium">Origem</span>
                  <span className="text-sm text-muted-foreground">{app.origin}</span>
                </div>
              )}
              {app.installed_at && (
                <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                  <span className="text-sm font-medium">Data de Instalação</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(app.installed_at * 1000).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              )}
              {app.size && (
                <div className="boxed-list-item flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-0">
                  <span className="text-sm font-medium">Espaço Ocupado</span>
                  <span className="text-sm text-muted-foreground">{formatSize(app.size)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="px-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Dados de Execução
            </h3>
            <div className="boxed-list">
              <div className="p-4 space-y-1">
                <span className="text-sm font-medium block">Caminho Executável</span>
                <span className="text-xs text-muted-foreground font-mono break-all bg-muted/30 p-2 rounded block">
                  {app.exec || "Não disponível"}
                </span>
              </div>
              <div className="p-4 space-y-1">
                <span className="text-sm font-medium block">Localização do Manifesto/Desktop</span>
                <span className="text-[11px] text-muted-foreground font-mono break-all">
                  {app.path || "Caminho interno/gerenciado"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="w-full h-14 gap-3 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-bold rounded-2xl shadow-sm transition-all active:scale-[0.98] dark:border-white/5"
              onClick={() => onUpdate(app)}
            >
              <RefreshCcw className="w-5 h-5" />
              Atualizar
            </Button>
            <Button
              variant="outline"
              className="w-full h-14 gap-3 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-bold rounded-2xl shadow-sm transition-all active:scale-[0.98] dark:border-white/5"
              onClick={() => onCleanup(app.name, app.id)}
            >
              <Search className="w-5 h-5" />
              Limpar Resíduos
            </Button>
            <Button
              variant="destructive"
              className="w-full h-14 gap-3 font-bold rounded-2xl shadow-sm transition-all active:scale-[0.98]"
              onClick={() => onUninstall(app)}
            >
              <Trash2 className="w-5 h-5" />
              Desinstalar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  small?: boolean;
}

const InfoItem = ({ icon, label, value, mono, highlight, small }: InfoItemProps) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
    <div className={`
      p-3 rounded-lg border border-border/30 
      ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}
      ${mono ? 'font-mono' : ''}
      ${small ? 'text-xs' : 'text-sm'}
      break-all
    `}>
      {value}
    </div>
  </div>
);
