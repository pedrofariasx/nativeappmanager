/*
 * File: SmartUninstaller.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Mon Mar 23 2026
 * Modified By: Pedro Farias
 * 
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileAnalysis } from "../types/uninstaller";
import { invoke } from "@tauri-apps/api/core";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, ShieldAlert, Search, CheckCircle2, AlertTriangle, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

interface SmartUninstallerProps {
  appName: string;
  appId: string;
  onBack: () => void;
}

export const SmartUninstaller = ({ appName, appId, onBack }: SmartUninstallerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [files, setFiles] = useState<FileAnalysis[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const totalReclaimable = files
    .filter(f => selectedPaths.has(f.path))
    .reduce((acc, curr) => acc + curr.size, 0);

  useEffect(() => {
    handleScan();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setHasScanned(false);
    
    try {
      const results: FileAnalysis[] = await invoke('scan_residual_files', { appName, appId });
      setFiles(results);
      
      // Regra de negócio: itens com risco 'high' ou ação 'keep' vêm desmarcados por padrão
      const initialSelected = new Set(
        results
          .filter((f) => f.risk !== "high" && f.action !== "keep")
          .map((f) => f.path)
      );
      setSelectedPaths(initialSelected);
      setHasScanned(true);
    } catch (error) {
      toast.error(`Erro no scan: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelection = (path: string) => {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedPaths(newSelected);
  };

  const handleCleanup = async () => {
    try {
      await invoke('execute_cleanup', { paths: Array.from(selectedPaths) });
      toast.success("Limpeza concluída com sucesso!");
      onBack();
    } catch (error) {
      toast.error(`Falha na limpeza: ${error}`);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200 dark:border-green-900 shadow-none"><CheckCircle2 className="w-3 h-3 mr-1" /> Baixo</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-200 dark:border-yellow-900 shadow-none"><AlertTriangle className="w-3 h-3 mr-1" /> Médio</Badge>;
      case "high":
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 shadow-none"><AlertCircle className="w-3 h-3 mr-1" /> Alto</Badge>;
      default:
        return <Badge variant="outline">{risk}</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "config": return <span className="text-blue-500 font-medium capitalize">configuração</span>;
      case "cache": return <span className="text-gray-500 font-medium capitalize">cache</span>;
      case "data": return <span className="text-purple-500 font-medium capitalize">dados</span>;
      case "binary": return <span className="text-red-500 font-medium capitalize">binário</span>;
      default: return <span className="capitalize">{category}</span>;
    }
  };

  return (
    <div className="w-full min-h-screen animate-in fade-in duration-500 overflow-y-auto scrollbar-hide pb-20 pt-8">
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
          <h2 className="text-sm font-bold opacity-70 uppercase tracking-widest">
            Limpeza Inteligente
          </h2>
          <div className="w-10" />
        </header>

        <div className="space-y-10">
          <AnimatePresence mode="wait">
            {isScanning && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-20 space-y-8"
              >
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/10"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div className="relative bg-muted/40 rounded-full p-6 sm:p-8 border border-border shadow-xl dark:bg-black/40 dark:border-white/5 dark:shadow-2xl">
                    <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-primary animate-spin stroke-[1.5]" />
                  </div>
                </div>
                <div className="text-center space-y-2 px-4">
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">Buscando Resíduos</h3>
                  <p className="text-muted-foreground text-xs sm:text-sm max-w-xs mx-auto">
                    Analisando o sistema em busca de rastros do <span className="text-foreground font-bold">{appName}</span>...
                  </p>
                </div>
              </motion.div>
            )}

            {hasScanned && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 px-1">
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      Arquivos Encontrados
                    </h3>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                        {formatSize(totalReclaimable)} RECLAMÁVEIS
                      </span>
                      <span className="text-[11px] text-muted-foreground font-bold whitespace-nowrap">
                        {selectedPaths.size} / {files.length} SELECIONADOS
                      </span>
                    </div>
                  </div>

                  {files.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed rounded-2xl bg-muted/10">
                      <CheckCircle2 className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                      <h4 className="font-bold">Sistema Limpo!</h4>
                      <p className="text-sm text-muted-foreground">Nenhum arquivo residual foi encontrado.</p>
                      <Button onClick={onBack} variant="link" className="mt-4">
                        Concluir e Voltar
                      </Button>
                    </div>
                  ) : (
                    <div className="boxed-list">
                      {files.map((file) => (
                        <div
                          key={file.path}
                          className={`boxed-list-item flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 group transition-opacity ${file.action === 'keep' ? 'opacity-60' : ''}`}
                          onClick={() => toggleSelection(file.path)}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedPaths.has(file.path)}
                                onCheckedChange={() => toggleSelection(file.path)}
                                className="rounded-full border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary dark:border-white/20"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="text-[14px] font-medium truncate">{file.path.split('/').pop()}</span>
                                {getRiskBadge(file.risk)}
                                {file.action === 'keep' && (
                                  <Badge variant="outline" className="text-[9px] uppercase tracking-tighter h-4 px-1.5 opacity-50">Sugerido Manter</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground font-mono truncate opacity-40">
                                {file.path}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 shrink-0 ml-auto sm:ml-2">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-30">
                                {file.category}
                              </span>
                              <span className="text-[11px] font-mono text-muted-foreground/60">
                                {formatSize(file.size)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {files.length > 0 && (
                  <div className="pt-4 flex flex-col gap-4">
                    <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/10 text-[12px] flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-muted-foreground leading-relaxed">
                        <span className="font-bold text-foreground">Aviso de Segurança:</span> Arquivos marcados como <span className="text-destructive font-bold">Alto Risco</span> estão desmarcados por padrão. Revise cuidadosamente antes de excluir caminhos que possam afetar outros aplicativos.
                      </p>
                    </div>
                    <Button
                      onClick={handleCleanup}
                      disabled={selectedPaths.size === 0}
                      className={`w-full h-14 rounded-2xl font-bold shadow-lg transition-all ${
                        selectedPaths.size > 0
                          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Trash2 className="w-5 h-5 mr-2" />
                      Remover Permanente ({formatSize(totalReclaimable)})
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
