/*
 * File: InstallView.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-23
 * 
 * Last Modified: Mon Mar 23 2026
 * Modified By: Pedro Farias
 * 
 */

import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ShieldCheck, AlertCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

interface InstallViewProps {
  path: string;
  onBack: () => void;
  onComplete: () => void;
}

export const InstallView = ({ path, onBack, onComplete }: InstallViewProps) => {
  const [installingPackage, setInstallingPackage] = useState<{
    name: string;
    version: string;
    description: string;
    logs: string[];
    complete: boolean;
    error: string | null;
  } | null>(null);
  
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [installingPackage?.logs]);

  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let unlisten: (() => void) | null = null;

    const startInstallation = async () => {
      try {
        // 1. Get Metadata
        const metadata: any = await invoke("get_package_metadata", { path });
        
        setInstallingPackage({
          name: metadata.name || "Pacote Desconhecido",
          version: metadata.version || "?",
          description: metadata.description || "Iniciando instalação...",
          logs: ["Aguardando autorização..."],
          complete: false,
          error: null
        });

        // 2. Setup listener for logs
        const unsubscribe = await listen<string>("install-log", (event) => {
          setInstallingPackage(prev => prev ? {
            ...prev,
            logs: [...prev.logs, event.payload]
          } : null);
        });
        unlisten = unsubscribe;

        // 3. Start installation
        try {
          await invoke("install_local_package", { path });
          
          setInstallingPackage(prev => prev ? {
            ...prev,
            complete: true,
            logs: [...prev.logs, "\n--- INSTALAÇÃO CONCLUÍDA ---"]
          } : null);
          
          toast.success("Instalação concluída!");
          onComplete();
        } catch (error) {
          setInstallingPackage(prev => prev ? {
            ...prev,
            complete: true,
            error: error as string,
            logs: [...prev.logs, `\nERRO CRÍTICO: ${error}`]
          } : null);
          toast.error("Falha na instalação");
        }
      } catch (error) {
        toast.error("Erro ao obter metadados do pacote");
        onBack();
      }
    };

    startInstallation();

    return () => {
      if (unlisten) unlisten();
    };
  }, [path]);

  if (!installingPackage) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-background">
        <RefreshCcw className="w-10 h-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background animate-in fade-in duration-500 overflow-y-auto pb-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 space-y-8 sm:space-y-12">
        
        {/* Header Section */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <motion.div 
              animate={installingPackage.complete && !installingPackage.error ? { scale: [1, 1.2, 1], opacity: [0.2, 0.8, 0.2] } : { scale: [1, 1.1, 1], opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 blur-2xl rounded-full ${installingPackage.complete && !installingPackage.error ? 'bg-green-500/40' : 'bg-primary/20'}`}
            />
            <div className={`relative p-6 rounded-[2rem] sm:rounded-[2.5rem] bg-muted/40 border border-border shadow-xl dark:bg-black/40 dark:border-white/5 transition-colors duration-500 ${installingPackage.complete && !installingPackage.error ? 'border-green-500/50' : ''}`}>
              {installingPackage.complete && !installingPackage.error ? (
                <motion.div initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }}>
                  <ShieldCheck className="w-12 h-12 sm:w-16 sm:h-16 text-green-500" />
                </motion.div>
              ) : installingPackage.error ? (
                <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-destructive" />
              ) : (
                <Package className="w-12 h-12 sm:w-16 sm:h-16 text-primary" />
              )}
            </div>
          </div>
          
          <div className="space-y-2 px-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {installingPackage.complete 
                ? (installingPackage.error ? "Falha na Instalação" : "Instalação Concluída!") 
                : "Instalando Aplicativo"}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="font-bold whitespace-nowrap">{installingPackage.name}</Badge>
              <span className="text-muted-foreground text-xs sm:text-sm font-mono opacity-50">{installingPackage.version}</span>
            </div>
          </div>
        </div>

        {/* Console View */}
        <div className="bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[350px] sm:h-[450px]">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-muted/20 flex justify-between items-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Console de Instalação</span>
            {!installingPackage.complete && (
              <span className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-primary animate-pulse uppercase">
                Processando...
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 font-mono text-[10px] sm:text-[11px] bg-black/20 dark:bg-black/60 scrollbar-hide space-y-1">
            {installingPackage.logs.map((log, i) => (
              <div key={i} className={log.startsWith("!") ? "text-destructive" : "text-muted-foreground"}>
                {log.startsWith("!") ? log.substring(2) : log}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          <div className="p-4 border-t border-border bg-muted/10 flex justify-center items-center min-h-[5rem]">
            {installingPackage.complete ? (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full flex justify-center"
              >
                <Button
                  className={`rounded-full px-8 sm:px-12 font-bold h-10 sm:h-12 shadow-lg transition-all w-full sm:w-auto ${installingPackage.error ? 'bg-destructive' : 'bg-primary'}`}
                  onClick={onBack}
                >
                  {installingPackage.error ? "Sair" : "Finalizar e Voltar"}
                </Button>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full px-4">
                <div className="w-full max-w-xs h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-primary"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse text-center">
                  Não feche o aplicativo durante o processo
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
