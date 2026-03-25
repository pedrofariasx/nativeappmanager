/*
 * File: UpdateView.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-24
 * 
 */

import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertCircle, RefreshCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppInfo } from "../types/uninstaller";

interface UpdateViewProps {
  app: AppInfo;
  onBack: () => void;
  onComplete: () => void;
}

export const UpdateView = ({ app, onBack, onComplete }: UpdateViewProps) => {
  const [logs, setLogs] = useState<string[]>(["Iniciando atualização..."]);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

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

    const startUpdate = async () => {
      try {
        const unsubscribe = await listen<string>("update-log", (event) => {
          setLogs(prev => [...prev, event.payload]);
        });
        unlisten = unsubscribe;

        await invoke("update_app", {
          id: app.id,
          method: app.install_method
        });

        setComplete(true);
        setLogs(prev => [...prev, "\n--- ATUALIZAÇÃO CONCLUÍDA ---"]);
        toast.success(`${app.name} atualizado com sucesso!`);
        onComplete();
      } catch (err) {
        setError(err as string);
        setComplete(true);
        setLogs(prev => [...prev, `\nERRO: ${err}`]);
        toast.error("Falha na atualização");
      }
    };

    startUpdate();

    return () => {
      if (unlisten) unlisten();
    };
  }, [app.id]);

  return (
    <div className="w-full min-h-screen bg-background animate-in fade-in duration-500 overflow-y-auto pb-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 space-y-8 sm:space-y-12">
        
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <motion.div 
              animate={complete && !error ? { scale: [1, 1.2, 1], opacity: [0.2, 0.8, 0.2] } : { scale: [1, 1.1, 1], opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 blur-2xl rounded-full ${complete && !error ? 'bg-green-500/40' : 'bg-primary/20'}`}
            />
            <div className={`relative p-6 rounded-[2rem] sm:rounded-[2.5rem] bg-muted/40 border border-border shadow-xl dark:bg-black/40 dark:border-white/5 transition-colors duration-500 ${complete && !error ? 'border-green-500/50' : ''}`}>
              {complete && !error ? (
                <ShieldCheck className="w-12 h-12 sm:w-16 sm:h-16 text-green-500" />
              ) : error ? (
                <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-destructive" />
              ) : (
                <RefreshCcw className="w-12 h-12 sm:w-16 sm:h-16 text-primary animate-spin" />
              )}
            </div>
          </div>
          
          <div className="space-y-2 px-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {complete 
                ? (error ? "Falha ao Atualizar" : "Sistema Atualizado") 
                : "Atualizando Aplicativo"}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="font-bold">{app.name}</Badge>
              <span className="text-muted-foreground text-xs sm:text-sm font-mono opacity-50 capitalize">{app.install_method}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[300px] sm:h-[400px]">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-muted/20 flex justify-between items-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Console do Sistema</span>
            {!complete && (
              <span className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-primary animate-pulse uppercase">
                Aguardando Root...
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 font-mono text-[10px] sm:text-[11px] bg-black/20 dark:bg-black/60 scrollbar-hide space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="text-muted-foreground">
                {log}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          <div className="p-4 border-t border-border bg-muted/10 flex justify-center items-center">
            {complete && (
              <Button
                variant="outline"
                className="w-full rounded-xl font-bold h-11"
                onClick={onBack}
              >
                Voltar ao Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
