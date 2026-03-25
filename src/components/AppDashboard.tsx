/*
 * File: AppDashboard.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Wed Mar 25 2026
 * Modified By: Pedro Farias
 * 
 */


import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Trash2, Box, Info, ShieldCheck, Download, Package, Plus, RefreshCcw, ChevronRight, Filter, Settings, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppInfo } from "../types/uninstaller";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AppDashboardProps {
  onScanResiduals: (name: string, id: string) => void;
  onViewDetails: (app: AppInfo) => void;
  onStartInstall: (path: string) => void;
  onStartUninstall: (app: AppInfo) => void;
  apps: AppInfo[];
  loading: boolean;
  isRefreshing: boolean;
  fetchApps: (isManual?: boolean) => Promise<void>;
  search: string;
  setSearch: (search: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sortBy: string;
  setSortBy: (sortBy: string) => void;
  displayLimit: number;
  setDisplayLimit: React.Dispatch<React.SetStateAction<number>>;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// Memoized list item to prevent redundant re-renders during animations
const AppItem = React.memo(({ 
  app, 
  onViewDetails, 
  onStartUninstall, 
  getMethodIcon, 
  formatSize 
}: { 
  app: AppInfo, 
  onViewDetails: (app: AppInfo) => void, 
  onStartUninstall: (app: AppInfo) => void,
  getMethodIcon: (method: string) => React.ReactNode,
  formatSize: (size: number | null) => string
}) => (
  <div
    className="boxed-list-item group"
    onClick={() => onViewDetails(app)}
  >
    <div className="flex items-center gap-4 flex-1 min-w-0">
      <div className="p-1.5 rounded-lg bg-muted/40 border border-border/40 shadow-sm overflow-hidden w-11 h-11 flex items-center justify-center shrink-0 dark:bg-black/30 dark:border-white/5">
        {app.icon ? (
          <img
            src={app.icon}
            alt={app.name}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "";
              (e.target as HTMLImageElement).className = "hidden";
            }}
          />
        ) : (
          <Package className="w-6 h-6 opacity-30" />
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-medium truncate">{app.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-muted-foreground truncate opacity-60 capitalize flex items-center">
            {getMethodIcon(app.install_method)}
            {app.install_method}
          </p>
          {app.version && (
            <>
              <span className="w-1 h-1 rounded-full bg-border" />
              <p className="text-[11px] text-muted-foreground/40 font-mono">
                {app.version}
              </p>
            </>
          )}
          {app.size && (
            <>
              <span className="w-1 h-1 rounded-full bg-border" />
              <p className="text-[11px] text-primary/70 font-bold uppercase tracking-tighter">
                {formatSize(app.size)}
              </p>
            </>
          )}
          {app.installed_at && (
            <>
              <span className="w-1 h-1 rounded-full bg-border" />
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-medium">
                <Plus className="w-2.5 h-2.5 opacity-40" />
                {new Date(app.installed_at * 1000).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit'
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-3 shrink-0 ml-4">
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:bg-destructive/10 rounded-full h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100"
        onClick={(e) => {
          e.stopPropagation();
          onStartUninstall(app);
        }}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
    </div>
  </div>
));

export const AppDashboard = ({ 
  onScanResiduals, 
  onViewDetails, 
  onStartInstall, 
  onStartUninstall,
  apps,
  loading,
  isRefreshing,
  fetchApps,
  search,
  setSearch,
  activeTab,
  setActiveTab,
  sortBy,
  setSortBy,
  displayLimit,
  setDisplayLimit
}: AppDashboardProps) => {
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState<{name: string, id: string} | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Removed internal apps fetching logic as it's now handled by parent (Index.tsx)
  // to ensure data persists across navigation.



  const handleInstallPackage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Arquivos de Pacote',
          extensions: ['deb', 'rpm', 'zst', 'pkg', 'tar.xz']
        }]
      });

      if (selected && typeof selected === 'string') {
        onStartInstall(selected);
      }
    } catch (error) {
      toast.error("Erro ao selecionar pacote");
    }
  };

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesSearch = app.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (activeTab === "all") return true;
      const method = app.install_method.toLowerCase();
      if (activeTab === "flatpak") return method === "flatpak";
      if (activeTab === "snap") return method === "snap";
      if (activeTab === "cargo") return method === "cargo";
      if (activeTab === "npm") return method === "npm";
      if (activeTab === "binary") return method === "binary";
      if (activeTab === "native") return !["flatpak", "snap", "cargo", "npm", "binary"].includes(method);
      
      return true;
    });
  }, [apps, search, activeTab]);

  const sortedApps = useMemo(() => {
    return [...filteredApps].sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name);
      } else if (sortBy === "date_asc") {
        return (a.installed_at || 0) - (b.installed_at || 0);
      } else if (sortBy === "date_desc") {
        return (b.installed_at || 0) - (a.installed_at || 0);
      }
      return 0;
    });
  }, [filteredApps, sortBy]);

  // Lazy rendering: render items on demand as the user scrolls
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver to load more items when sentinel is visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayLimit(prev => Math.min(prev + 40, sortedApps.length));
        }
      },
      { rootMargin: '400px' } // Pre-load before sentinel is visible
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sortedApps.length, search, activeTab, sortBy]);


  // Memoize stats to avoid filtering entire app list on every render
  const stats = useMemo(() => {
    const methods = new Map<string, number>();
    let totalSize = 0;
    for (const a of apps) {
      const m = a.install_method.toLowerCase();
      methods.set(m, (methods.get(m) || 0) + 1);
      totalSize += a.size || 0;
    }
    const nativeCount = apps.length - (methods.get("flatpak") || 0) - (methods.get("snap") || 0)
      - (methods.get("cargo") || 0) - (methods.get("npm") || 0) - (methods.get("binary") || 0);
    return {
      native: nativeCount,
      flatpak: methods.get("flatpak") || 0,
      snap: methods.get("snap") || 0,
      cargo: methods.get("cargo") || 0,
      npm: methods.get("npm") || 0,
      totalSize,
    };
  }, [apps]);

  const getMethodIcon = useCallback((method: string) => {
    const lowerMethod = method.toLowerCase();
    switch (lowerMethod) {
      case "flatpak": return <Box className="w-3 h-3 mr-1" />;
      case "snap": return <Package className="w-3 h-3 mr-1" />;
      case "cargo": return <ShieldCheck className="w-3 h-3 mr-1 text-orange-500" />;
      case "npm": return <Package className="w-3 h-3 mr-1 text-red-500" />;
      case "binary": return <Settings className="w-3 h-3 mr-1 text-blue-500" />;
      default: return <ShieldCheck className="w-3 h-3 mr-1" />;
    }
  }, []);

  const navItems = [
    { id: "all", label: "Todos", icon: <Package className="w-4 h-4" /> },
    { id: "native", label: "Apt", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "flatpak", label: "Flatpak", icon: <Box className="w-4 h-4" /> },
    { id: "snap", label: "Snap", icon: <Package className="w-4 h-4" /> },
    { id: "cargo", label: "Cargo", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "npm", label: "NPM", icon: <Package className="w-4 h-4" /> },
    { id: "binary", label: "Binários", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full min-h-screen animate-in fade-in duration-500 pb-20 pt-8">
      <div className="max-w-3xl mx-auto px-6 space-y-12">


        {/* Centered Search Pill */}
        <div className="flex justify-center">
          <div className="search-pill w-full max-w-lg mx-2">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Pesquisar..."
              className="bg-transparent border-none outline-none flex-1 text-xs sm:text-sm placeholder:text-muted-foreground min-w-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground px-1">
                <span className="text-lg sm:text-xl">×</span>
              </button>
            ) : (
              <button
                onClick={() => fetchApps(true)}
                className={`text-muted-foreground hover:text-foreground transition-all p-1 ${(loading || isRefreshing) ? 'animate-spin' : ''}`}
                title="Atualizar lista"
              >
                <RefreshCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
            <div className="w-px h-4 bg-border mx-1 shrink-0" />
            <button
              onClick={() => handleInstallPackage()}
              className="text-primary hover:text-primary/80 transition-all p-1 flex items-center gap-1.5"
              title="Instalar pacote local (.deb, .rpm, .pkg)"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">Instalar</span>
            </button>
          </div>
        </div>


        {/* Filter Selection (Pills) */}
        <div className="flex justify-center gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                activeTab === item.id
                  ? "bg-secondary text-foreground border-secondary shadow-sm"
                  : "bg-transparent text-muted-foreground hover:bg-muted/50 border-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Quick Stats & Header */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
          {[
            { label: "Nativos", count: stats.native, color: "text-blue-500" },
            { label: "Flatpak", count: stats.flatpak, color: "text-purple-500" },
            { label: "Snap", count: stats.snap, color: "text-orange-500" },
            { label: "Cargo", count: stats.cargo, color: "text-orange-600" },
            { label: "NPM", count: stats.npm, color: "text-red-500" },
            {
              label: "Espaço",
              count: formatSize(stats.totalSize),
              color: "text-green-500",
              isSize: true
            },
          ].map((stat, i) => (
            <div key={i} className="bg-muted/20 border border-border/40 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center space-y-1 dark:bg-white/5 dark:border-white/5 transition-all">
              <span className={`font-bold ${stat.color} ${stat.isSize ? 'text-sm sm:text-lg' : 'text-base sm:text-xl'}`}>{stat.count}</span>
              <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</span>
            </div>
          ))}
        </div>


        {/* App List Group */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 px-1">
            <h2 className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Aplicativos instalados
            </h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto mt-2 sm:mt-0">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px] h-7 text-[11px] font-bold border-none bg-muted/20 hover:bg-muted/40 transition-colors focus:ring-0">
                  <SelectValue placeholder="Ordenar por..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc" className="text-xs">Nome (A-Z)</SelectItem>
                  <SelectItem value="name_desc" className="text-xs">Nome (Z-A)</SelectItem>
                  <SelectItem value="date_desc" className="text-xs">Mais recentes</SelectItem>
                  <SelectItem value="date_asc" className="text-xs">Mais antigos</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2 ml-auto sm:ml-0">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-bold">
                  {filteredApps.length} EXIBIDOS
                </span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-bold">
                  {apps.length} TOTAL
                </span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="boxed-list animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-16 w-full bg-muted/20" />
              ))}
            </div>
          ) : (
            <div className="boxed-list">
              {sortedApps.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-4">
                  <Box className="w-10 h-10 opacity-20" />
                  <span className="text-sm font-medium">Nenhum aplicativo encontrado</span>
                </div>
              ) : (
                <>
                  {sortedApps.slice(0, displayLimit).map((app) => (
                    <AppItem
                      key={`${app.install_method}-${app.id}`}
                      app={app}
                      onViewDetails={onViewDetails}
                      onStartUninstall={setSelectedApp}
                      getMethodIcon={getMethodIcon}
                      formatSize={formatSize}
                    />
                  ))}
                  {/* Sentinel for IntersectionObserver lazy loading */}
                  {displayLimit < sortedApps.length && (
                    <div ref={sentinelRef} className="h-1 w-full" />
                  )}
                </>
                )}
              </div>
          )}
        </div>
      </div>

      {/* Uninstallation Confirmation */}
      <AlertDialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desinstalar {selectedApp?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {!["flatpak", "snap"].includes(selectedApp?.install_method.toLowerCase() || "")
                ? `Este é um aplicativo nativo (${selectedApp?.install_method}). Você precisará de permissões administrativas para desinstalá-lo.`
                : `Isso removerá o pacote ${selectedApp?.install_method} do seu sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUninstalling}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (selectedApp) {
                  onStartUninstall(selectedApp);
                  setSelectedApp(null);
                }
              }}
            >
              Sim, Desinstalar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup Offer Dialog */}
      <AlertDialog open={!!showCleanupDialog} onOpenChange={(open) => !open && setShowCleanupDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpeza Inteligente</AlertDialogTitle>
            <AlertDialogDescription>
              A desinstalação básica foi concluída. Gostaria de buscar por arquivos de configuração e cache residuais para liberar mais espaço?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCleanupDialog(null)}>Não, concluir</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (showCleanupDialog) {
                  onScanResiduals(showCleanupDialog.name, showCleanupDialog.id);
                  setShowCleanupDialog(null);
                }
              }}
            >
              Sim, buscar resíduos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Footer / Metadata */}
      <footer className="max-w-3xl mx-auto px-6 py-12 mt-auto">
        <div className="flex flex-col items-center gap-2 opacity-20 hover:opacity-40 transition-opacity">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <span className="text-[11px] font-bold tracking-widest uppercase">Native App Manager</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-medium">
            <span>v1.0.0</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            <span>Pedro Farias</span>
          </div>
        </div>
      </footer>

    </div>
  );
};
