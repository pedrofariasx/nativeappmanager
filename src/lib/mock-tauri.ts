/*
 * File: mock-tauri.ts
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Mon Mar 23 2026
 * Modified By: Pedro Farias
 * 
 */

import { FileAnalysis } from "../types/uninstaller";

// Simula a invocação do comando Tauri: invoke('scan_residual_files', { appName })
export const mockScanResidualFiles = async (appName: string): Promise<FileAnalysis[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        {
          path: `~/.config/${appName}`,
          category: "config",
          risk: "low",
          action: "delete",
          reason: "Diretório de configuração padrão. Seguro para remover.",
          size: 1024 * 50, // 50 KB
        },
        {
          path: `~/.cache/${appName}`,
          category: "cache",
          risk: "low",
          action: "delete",
          reason: "Arquivos temporários de cache. Seguro para remover.",
          size: 1024 * 1024 * 2, // 2 MB
        },
        {
          path: `~/.local/share/${appName}`,
          category: "data",
          risk: "medium",
          action: "delete",
          reason: "Contém dados de usuário específicos do aplicativo.",
          size: 1024 * 1024 * 15, // 15 MB
        },
        {
          path: `/usr/bin/${appName}`,
          category: "binary",
          risk: "high",
          action: "keep",
          reason: "Caminho de binário do sistema. Proceda com cautela, pode quebrar dependências.",
          size: 1024 * 1024 * 5, // 5 MB
        },
        {
          path: `/etc/${appName}/config.yaml`,
          category: "config",
          risk: "high",
          action: "keep",
          reason: "Configuração global do sistema. Remoção pode afetar outros usuários.",
          size: 1024 * 4, // 4 KB
        },
      ]);
    }, 2500); // Simula o tempo de processamento
  });
};
