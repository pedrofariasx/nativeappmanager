/*
 * File: UninstallView.tsx
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
import { Trash2, ShieldCheck, AlertCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { AppInfo } from "../types/uninstaller";

interface UninstallViewProps {
  app: AppInfo;
  onBack: () => void;
  onComplete: (name: string, id: string) => void;
}

export const UninstallView = ({ app, onBack, onComplete }: UninstallViewProps) => {
  const [logs, setLogs] = useState<string[]>(["Iniciando desinstalação..."]);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let unlisten: (() => void) | null = null;

    const startUninstallation = async () => {
      try {
        const unsubscribe = await listen<string>("uninstall-log", (event) => {
          setLogs(prev => [...prev, event.payload]);
        });
        unlisten = unsubscribe;

        await invoke("uninstall_app", {
          id: app.id,
          method: app.install_method,
          path: app.path
        });

        setComplete(true);
        setLogs(prev => [...prev, "\n--- DESINSTALAÇÃO CONCLUÍDA ---"]);
        toast.success(`${app.name} desinstalado com sucesso!`);
      } catch (err) {
        setError(err as string);
        setComplete(true);
        setLogs(prev => [...prev, `\nERRO: ${err}`]);
        toast.error("Falha na desinstalação");
      }
    };

    startUninstallation();

    return () => {
      if (unlisten) unlisten();
    };
  }, [app.id]);

  return (
    <div className="w-full min-h-screen bg-background animate-in fade-in duration-500 overflow-y-auto pb-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 space-y-8 sm:space-y-12">
        
        {/* Header Section */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <motion.div 
              animate={complete && !error ? { scale: [1, 1.2, 1], opacity: [0.2, 0.8, 0.2] } : { scale: [1, 1.1, 1], opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 blur-2xl rounded-full ${complete && !error ? 'bg-green-500/40' : 'bg-destructive/20'}`}
            />
            <div className={`relative p-6 rounded-[2rem] sm:rounded-[2.5rem] bg-muted/40 border border-border shadow-xl dark:bg-black/40 dark:border-white/5 transition-colors duration-500 ${complete && !error ? 'border-green-500/50' : ''}`}>
              {complete && !error ? (
                <ShieldCheck className="w-12 h-12 sm:w-16 sm:h-16 text-green-500" />
              ) : error ? (
                <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-destructive" />
              ) : (
                <Trash2 className="w-12 h-12 sm:w-16 sm:h-16 text-destructive animate-pulse" />
              )}
            </div>
          </div>
          
          <div className="space-y-2 px-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {complete 
                ? (error ? "Falha ao Remover" : "Removido do Sistema") 
                : "Desinstalando Aplicativo"}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="font-bold">{app.name}</Badge>
              <span className="text-muted-foreground text-xs sm:text-sm font-mono opacity-50 capitalize">{app.install_method}</span>
            </div>
          </div>
        </div>

        {/* Console View */}
        <div className="bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[300px] sm:h-[400px]">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-muted/20 flex justify-between items-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Console do Sistema</span>
            {!complete && (
              <span className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-destructive animate-pulse uppercase">
                Aguardando Root...
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 font-mono text-[10px] sm:text-[11px] bg-black/20 dark:bg-black/60 scrollbar-hide space-y-1">
            {logs.map((log, i) => (
              <div key={i} className={log.startsWith("!") ? "text-destructive" : "text-muted-foreground"}>
                {log.startsWith("!") ? log.substring(2) : log}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          <div className="p-4 border-t border-border bg-muted/10 flex justify-center items-center">
            {complete ? (
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl font-bold h-11"
                  onClick={onBack}
                >
                  Fechar
                </Button>
                {!error && (
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold h-11 shadow-lg"
                    onClick={() => onComplete(app.name, app.id)}
                  >
                    Buscar Resíduos
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="w-full max-w-xs h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-destructive"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
