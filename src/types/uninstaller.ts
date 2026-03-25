/*
 * File: uninstaller.ts
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Tue Mar 24 2026
 * Modified By: Pedro Farias
 * 
 */

export interface FileAnalysis {
  path: string;
  category: 'cache' | 'config' | 'data' | 'binary';
  risk: 'low' | 'medium' | 'high';
  action: 'delete' | 'keep';
  reason: string;
  size: number;
}

export interface AppInfo {
  name: string;
  icon: string | null;
  icon_name: string | null;
  exec: string | null;
  comment: string | null;
  id: string;
  install_method: string; // flatpak, snap, native, cargo, npm
  is_system: boolean;
  path: string;
  version: string | null;
  size: number | null;
  installed_at: number | null;
  origin: string | null;
  usage_hint: string | null;
  is_dependency: boolean;
}
