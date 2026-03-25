/*
 * File: lib.rs
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Wed Mar 25 2026
 * Modified By: Pedro Farias
 * 
 */

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::collections::HashMap;
use std::sync::OnceLock;
use base64::{Engine as _, engine::general_purpose};

// Global icon index — built once on first use, turns O(thousands) lookups into O(1)
static ICON_INDEX: OnceLock<HashMap<String, PathBuf>> = OnceLock::new();

fn get_icon_index() -> &'static HashMap<String, PathBuf> {
    ICON_INDEX.get_or_init(build_icon_index)
}

fn build_icon_index() -> HashMap<String, PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let icon_bases = vec![
        PathBuf::from("/usr/share/icons"),
        home.join(".local/share/icons"),
        home.join(".icons"),
        PathBuf::from("/usr/share/pixmaps"),
        PathBuf::from("/var/lib/flatpak/exports/share/icons"),
        home.join(".local/share/flatpak/exports/share/icons"),
    ];

    let valid_extensions: std::collections::HashSet<&str> =
        ["svg", "png", "xpm", "jpg"].iter().copied().collect();

    // Size directories in priority order (first match wins via entry API)
    let sizes = [
        "scalable/apps",
        "48x48/apps",
        "64x64/apps",
        "128x128/apps",
        "256x256/apps",
        "512x512/apps",
        "32x32/apps",
        "24x24/apps",
        "16x16/apps",
        "symbolic/apps",
    ];

    let mut index: HashMap<String, PathBuf> = HashMap::with_capacity(4096);

    // 1. Pixmaps first (highest priority — flat structure)
    for base in &icon_bases {
        if !base.to_string_lossy().contains("pixmaps") || !base.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() { continue; }
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                if !valid_extensions.contains(ext) { continue; }
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    index.entry(stem.to_string()).or_insert(path);
                }
            }
        }
    }

    // 2. Themed icon directories (in size priority order)
    for base in &icon_bases {
        if !base.exists() || base.to_string_lossy().contains("pixmaps") {
            continue;
        }
        if let Ok(themes) = fs::read_dir(base) {
            for theme in themes.flatten() {
                let theme_path = theme.path();
                if !theme_path.is_dir() { continue; }

                for size in &sizes {
                    let size_path = theme_path.join(size);
                    if !size_path.exists() { continue; }

                    if let Ok(entries) = fs::read_dir(&size_path) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if !path.is_file() { continue; }
                            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                            if !valid_extensions.contains(ext) { continue; }
                            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                                index.entry(stem.to_string()).or_insert(path);
                            }
                        }
                    }
                }
            }
        }
    }

    index
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileAnalysis {
    pub path: String,
    pub category: String, // config/cache/data/binary
    pub risk: String,     // low/medium/high
    pub action: String,   // delete/keep
    pub reason: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub icon: Option<String>, // Base64 data URL (resolved lazily)
    pub icon_name: Option<String>, // Raw icon name from .desktop file
    pub exec: Option<String>,
    pub comment: Option<String>,
    pub id: String,
    pub install_method: String, // flatpak, snap, native, cargo, npm
    pub is_system: bool,
    pub path: String,
    pub version: Option<String>,
    pub size: Option<u64>,
    pub installed_at: Option<u64>,
    pub origin: Option<String>,
    pub usage_hint: Option<String>,
    pub is_dependency: bool,
}

mod commands {
    use super::*;
    use std::process::Stdio;
    use std::io::{BufRead, BufReader};

    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct PackageMetadata {
        pub name: String,
        pub version: String,
        pub description: String,
        pub icon: Option<String>,
    }

    #[tauri::command]
    pub async fn get_package_metadata(path: String) -> Result<PackageMetadata, String> {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Err("Arquivo não encontrado".to_string());
        }

        let extension = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        
        match extension {
            "deb" => {
                let output = Command::new("dpkg-deb")
                    .args(["-I", "--", &path])
                    .output()
                    .map_err(|e| e.to_string())?;
                
                let s = String::from_utf8_lossy(&output.stdout);
                let mut name = String::new();
                let mut version = String::new();
                let mut description = String::new();

                for line in s.lines() {
                    let line = line.trim();
                    if line.contains("Package: ") {
                        name = line.replace("Package: ", "").trim().to_string();
                    } else if line.contains("Version: ") {
                        version = line.replace("Version: ", "").trim().to_string();
                    } else if line.contains("Description: ") {
                        description = line.replace("Description: ", "").trim().to_string();
                    }
                }
                
                // Se a descrição estiver vazia, tente pegar as linhas seguintes ao campo Description
                if description.is_empty() {
                    let mut found_desc = false;
                    for line in s.lines() {
                        if line.contains("Description: ") {
                            found_desc = true;
                            description = line.replace("Description: ", "").trim().to_string();
                        } else if found_desc && line.starts_with(' ') {
                            description.push_str(line);
                        } else if found_desc {
                            break;
                        }
                    }
                }

                Ok(PackageMetadata {
                    name,
                    version,
                    description,
                    icon: None,
                })
            },
            "rpm" => {
                let output = Command::new("rpm")
                    .args(["-qip", "--", &path])
                    .output()
                    .map_err(|e| e.to_string())?;
                
                let s = String::from_utf8_lossy(&output.stdout);
                let mut name = String::new();
                let mut version = String::new();
                let mut description = String::new();

                for line in s.lines() {
                    let line = line.trim();
                    if line.contains("Name        :") {
                        name = line.split(':').nth(1).unwrap_or("").trim().to_string();
                    } else if line.contains("Version     :") {
                        version = line.split(':').nth(1).unwrap_or("").trim().to_string();
                    } else if line.contains("Summary     :") || line.contains("Description :") {
                        description = line.split(':').nth(1).unwrap_or("").trim().to_string();
                    }
                }

                Ok(PackageMetadata {
                    name,
                    version,
                    description,
                    icon: None,
                })
            },
            _ => {
                Ok(PackageMetadata {
                    name: p.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                    version: "v?".to_string(),
                    description: "Pacote local".to_string(),
                    icon: None,
                })
            }
        }
    }

    #[tauri::command]
    pub async fn scan_residual_files(app_name: String, app_id: String) -> Result<Vec<FileAnalysis>, String> {
        let mut final_results = Vec::new();
        let mut raw_paths = Vec::new();
        let home = dirs::home_dir().ok_or("Não foi possível encontrar o diretório home")?;

        // Sanitize inputs to prevent issues with AI prompting and path manipulation
        let safe_app_name = app_name.replace('[', "").replace(']', "").replace('\n', " ");
        
        // Keywords for heuristic matching - expand variations
        let clean_id = app_id.replace(".desktop", "").to_lowercase();
        let name_lower = safe_app_name.to_lowercase();
        let name_no_spaces = name_lower.replace(" ", "");
        let name_first_word = name_lower.split_whitespace().next().unwrap_or("").to_string();
        
        let mut keywords = std::collections::HashSet::new();
        keywords.insert(clean_id.clone());
        keywords.insert(name_lower.clone());
        keywords.insert(name_no_spaces.clone());
        if name_first_word.len() > 3 {
            keywords.insert(name_first_word);
        }
        
        // Handle common reverse-DNS parts (e.g. org.gnome.Calculator -> Calculator)
        if clean_id.contains('.') {
            if let Some(last_part) = clean_id.split('.').last() {
                if last_part.len() > 3 {
                    keywords.insert(last_part.to_string());
                }
            }
        }

        // 1. Explicit targeted scanning for sandboxed apps
        let sandbox_dirs = vec![
            (home.join(".var/app"), "data"),
            (home.join("snap"), "data"),
        ];

        for (base_dir, cat) in sandbox_dirs {
            if !base_dir.exists() { continue; }
            for k in &keywords {
                let p = base_dir.join(k);
                if p.exists() {
                    raw_paths.push((p.to_string_lossy().to_string(), cat));
                }
            }
        }

        // 2. Heuristic scanning of standard directories
        let scan_dirs = vec![
            (home.join(".config"), "config"),
            (home.join(".cache"), "cache"),
            (home.join(".local/share"), "data"),
            (home.join(".local/state"), "data"),
            (home.clone(), "config"), // Hidden files in HOME
        ];

        for (dir, base_category) in scan_dirs {
            if !dir.exists() || !dir.is_dir() { continue; }
            
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                    
                    // Ignore very common generic directories
                    if file_name == ".config" || file_name == ".cache" || file_name == ".local" {
                        continue;
                    }

                    let is_match = keywords.iter().any(|k| {
                        file_name == *k ||
                        file_name == format!(".{}", k) ||
                        file_name.contains(k) && k.len() > 3
                    });

                    if is_match {
                        let path_str = path.to_string_lossy().to_string();
                        raw_paths.push((path_str, base_category));
                    }
                }
            }
        }

        raw_paths.sort();
        raw_paths.dedup();

        if raw_paths.is_empty() {
            return Ok(vec![]);
        }

        // Use heuristic analysis to determine risks and categories
        for (path, cat) in raw_paths {
            final_results.push(analyze_path_risk(&path, cat));
        }

        final_results.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(final_results)
    }

    #[tauri::command]
    pub async fn execute_cleanup(paths: Vec<String>) -> Result<(), String> {
        let mut user_paths = Vec::new();
        let mut system_paths = Vec::new();
        let home = dirs::home_dir().unwrap_or_default();

        for path_str in paths {
            let path = PathBuf::from(&path_str);
            if !path.exists() { continue; }

            if path.starts_with(&home) {
                user_paths.push(path);
            } else {
                system_paths.push(path_str);
            }
        }

        // 1. Remove user-level paths
        for path in user_paths {
            if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            } else {
                let _ = fs::remove_file(&path);
            }
        }

        // 2. Remove system-level paths using a single pkexec
        if !system_paths.is_empty() {
            let mut args = vec!["rm".to_string(), "-rf".to_string(), "--".to_string()];
            args.extend(system_paths);
            Command::new("pkexec")
                .args(args)
                .output()
                .map_err(|e| format!("Falha na limpeza de sistema: {}", e))?;
        }

        Ok(())
    }

    #[tauri::command]
    pub async fn update_app(app: AppHandle, id: String, method: String) -> Result<String, String> {
        let (script, args) = match method.as_str() {
            "flatpak" => (
                "flatpak update -y \"$1\"".to_string(),
                vec![id]
            ),
            "snap" => (
                "snap refresh \"$1\"".to_string(),
                vec![id]
            ),
            "cargo" => {
                let pkg_name = id.replace("cargo-", "");
                // cargo install is used to update as well
                (
                    "cargo install \"$1\"".to_string(),
                    vec![pkg_name]
                )
            },
            "npm" => {
                let pkg_name = id.replace("npm-", "");
                (
                    "npm install -g \"$1\"@latest".to_string(),
                    vec![pkg_name]
                )
            },
            _ => {
                let (manager, manager_args) = if Command::new("apt-get").arg("--version").output().is_ok() {
                    ("DEBIAN_FRONTEND=noninteractive apt-get", vec!["install", "--only-upgrade", "-y"])
                } else if Command::new("dnf").arg("--version").output().is_ok() {
                    ("dnf", vec!["upgrade", "-y"])
                } else if Command::new("pacman").arg("--version").output().is_ok() {
                    ("pacman", vec!["-S", "--noconfirm"])
                } else {
                    ("none", vec![])
                };

                if manager != "none" {
                    let manager_args_str = manager_args.join(" ");
                    (
                        format!("{} {} \"$1\"", manager, manager_args_str),
                        vec![id.replace(".desktop", "")]
                    )
                } else {
                    return Err("Método de atualização não suportado para este aplicativo".to_string());
                }
            }
        };

        let mut pkexec_args = vec!["sh", "-c", &script, "sh"];
        for arg in &args {
            pkexec_args.push(arg);
        }

        let mut child = Command::new("pkexec")
            .args(pkexec_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Falha ao iniciar atualizador: {}", e))?;

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        
        let app_handle_out = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_handle_out.emit("update-log", l);
                }
            }
        });

        let app_handle_err = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_handle_err.emit("update-log", l);
                }
            }
        });

        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            Ok("Atualização concluída com sucesso.".to_string())
        } else {
            Err("O processo de atualização falhou.".to_string())
        }
    }

    #[tauri::command]
    pub async fn uninstall_app(app: AppHandle, id: String, method: String, path: String) -> Result<String, String> {
        let is_system_path = !path.contains(".local/share/applications");
        
        // Attempt to find the real package name
        let mut pkg_name = id.replace(".desktop", "");
        
        if is_system_path {
            if let Ok(out) = Command::new("dpkg").args(["-S", "--", &path]).output() {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout);
                    if let Some(name) = s.split(':').next() {
                        pkg_name = name.trim().to_string();
                    }
                }
            } else if let Ok(out) = Command::new("rpm").args(["-qf", "--qf", "%{NAME}", "--", &path]).output() {
                if out.status.success() {
                    pkg_name = String::from_utf8_lossy(&out.stdout).trim().to_string();
                }
            } else if let Ok(out) = Command::new("pacman").args(["-Qqo", "--", &path]).output() {
                if out.status.success() {
                    pkg_name = String::from_utf8_lossy(&out.stdout).trim().to_string();
                }
            }
        }

        let (script, args) = match method.as_str() {
            "flatpak" => (
                "flatpak uninstall -y \"$1\" ; update-desktop-database /usr/share/applications".to_string(),
                vec![id]
            ),
            "snap" => if is_system_path {
                (
                    "snap remove \"$1\" ; rm -f \"$2\" ; update-desktop-database /usr/share/applications".to_string(),
                    vec![id, path]
                )
            } else {
                (
                    "snap remove \"$1\" ; update-desktop-database /usr/share/applications".to_string(),
                    vec![id]
                )
            },
            "cargo" => {
                let pkg_name = id.replace("cargo-", "");
                (
                    "cargo uninstall \"$1\"".to_string(),
                    vec![pkg_name]
                )
            },
            "npm" => {
                let pkg_name = id.replace("npm-", "");
                (
                    "npm uninstall -g \"$1\"".to_string(),
                    vec![pkg_name]
                )
            },
            _ => {
                let (manager, manager_args) = if Command::new("apt-get").arg("--version").output().is_ok() {
                    ("DEBIAN_FRONTEND=noninteractive apt-get", vec!["remove", "-y", "-q"])
                } else if Command::new("dnf").arg("--version").output().is_ok() {
                    ("dnf", vec!["remove", "-y"])
                } else if Command::new("pacman").arg("--version").output().is_ok() {
                    ("pacman", vec!["-Rs", "--noconfirm"])
                } else if Command::new("zypper").arg("--version").output().is_ok() {
                    ("zypper", vec!["remove", "-y"])
                } else {
                    ("none", vec![])
                };

                if manager != "none" {
                    let manager_args_str = manager_args.join(" ");
                    if is_system_path {
                        (
                            format!("{} {} \"$1\" ; rm -f \"$2\" ; update-desktop-database /usr/share/applications", manager, manager_args_str),
                            vec![pkg_name, path]
                        )
                    } else {
                        (
                            format!("{} {} \"$1\" ; update-desktop-database /usr/share/applications", manager, manager_args_str),
                            vec![pkg_name]
                        )
                    }
                } else if is_system_path {
                    (
                        "rm -f \"$1\" ; update-desktop-database /usr/share/applications".to_string(),
                        vec![path]
                    )
                } else {
                    (
                        "rm -f \"$1\"".to_string(),
                        vec![path]
                    )
                }
            }
        };

        let mut pkexec_args = vec!["sh", "-c", &script, "sh"];
        for arg in &args {
            pkexec_args.push(arg);
        }

        let mut child = Command::new("pkexec")
            .args(pkexec_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Falha ao iniciar desinstalador: {}", e))?;

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        
        let app_handle_out = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_handle_out.emit("uninstall-log", l);
                }
            }
        });

        let app_handle_err = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_handle_err.emit("uninstall-log", format!("! {}", l));
                }
            }
        });

        let status = child.wait().map_err(|e| format!("Erro ao aguardar processo: {}", e))?;

        if status.success() {
            // User-level desktop database and shell refresh
            if let Ok(home) = std::env::var("HOME") {
                let _ = Command::new("update-desktop-database")
                    .arg(format!("{}/.local/share/applications", home))
                    .status();
            }
            let _ = Command::new("busctl")
                .args(["--user", "call", "org.gnome.Shell", "/org/gnome/Shell", "org.gnome.Shell", "Eval", "s", "Main.overview.refreshAppGrid()"])
                .status();

            Ok("Desinstalação concluída com sucesso.".to_string())
        } else {
            Err("O processo de desinstalação falhou. Verifique os logs.".to_string())
        }
    }

    #[tauri::command]
    pub async fn install_local_package(app: AppHandle, path: String) -> Result<String, String> {
        let (manager, args_list) = if Command::new("apt-get").arg("--version").output().is_ok() {
            ("DEBIAN_FRONTEND=noninteractive apt-get", vec!["install", "-y", "-q"])
        } else if Command::new("dnf").arg("--version").output().is_ok() {
            ("dnf", vec!["install", "-y"])
        } else if Command::new("zypper").arg("--version").output().is_ok() {
            ("zypper", vec!["install", "--non-interactive"])
        } else if Command::new("pacman").arg("--version").output().is_ok() {
            ("pacman", vec!["-U", "--noconfirm"])
        } else {
            return Err("Nenhum gerenciador de pacotes compatível encontrado para instalação local.".to_string());
        };

        let manager_args_str = args_list.join(" ");
        let script = format!(
            "{} {} \"$1\" ; update-desktop-database /usr/share/applications",
            manager, manager_args_str
        );

        let mut child = Command::new("pkexec")
            .args(["sh", "-c", &script, "sh", &path])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Falha ao iniciar instalador: {}", e))?;

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        
        let app_handle_out = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_handle_out.emit("install-log", l);
                }
            }
        });

        let app_handle_err = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_handle_err.emit("install-log", format!("! {}", l));
                }
            }
        });

        let status = child.wait().map_err(|e| format!("Erro ao aguardar processo: {}", e))?;

        if status.success() {
            // User-level refresh
            if let Ok(home) = std::env::var("HOME") {
                let _ = Command::new("update-desktop-database")
                    .arg(format!("{}/.local/share/applications", home))
                    .status();
            }

            Ok("Instalação concluída com sucesso.".to_string())
        } else {
            Err("O processo de instalação falhou. Verifique os logs detalhados acima.".to_string())
        }
    }

    #[tauri::command]
    pub async fn list_apps() -> Vec<AppInfo> {
        // Pre-warm the icon index on a blocking thread (one-time cost)
        tauri::async_runtime::spawn_blocking(|| { let _ = get_icon_index(); });

        let home = dirs::home_dir().unwrap_or_default();

        // Detect native manager name (blocking subprocess calls → spawn_blocking)
        let native_manager: &'static str = tauri::async_runtime::spawn_blocking(|| {
            if Command::new("apt-get").arg("--version").output().is_ok() {
                "Apt"
            } else if Command::new("dnf").arg("--version").output().is_ok() {
                "Dnf"
            } else if Command::new("pacman").arg("--version").output().is_ok() {
                "Pacman"
            } else if Command::new("zypper").arg("--version").output().is_ok() {
                "Zypper"
            } else {
                "Native"
            }
        }).await.unwrap_or("Native");

        // All scanners run on blocking threads in parallel
        let home2 = home.clone();
        let nm = native_manager.to_string();
        let desktop_task = tauri::async_runtime::spawn_blocking(move || {
            scan_desktop_files(&home2, &nm)
        });
        let cargo_task = tauri::async_runtime::spawn_blocking(list_cargo_packages);
        let npm_task = tauri::async_runtime::spawn_blocking(list_npm_global_packages);
        let bin_task = tauri::async_runtime::spawn_blocking(list_usr_bin_binaries);

        let mut apps = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        // Desktop apps (highest priority)
        if let Ok(desktop_apps) = desktop_task.await {
            for app in desktop_apps {
                if !seen_ids.contains(&app.id) {
                    seen_ids.insert(app.id.clone());
                    apps.push(app);
                }
            }
        }

        // Cargo packages
        if let Ok(cargo_apps) = cargo_task.await {
            for app in cargo_apps {
                if !seen_ids.contains(&app.id) {
                    seen_ids.insert(app.id.clone());
                    apps.push(app);
                }
            }
        }

        // NPM packages
        if let Ok(npm_apps) = npm_task.await {
            for app in npm_apps {
                if !seen_ids.contains(&app.id) {
                    seen_ids.insert(app.id.clone());
                    apps.push(app);
                }
            }
        }

        // System binaries
        if let Ok(bin_apps) = bin_task.await {
            for app in bin_apps {
                if !seen_ids.contains(&app.id) {
                    seen_ids.insert(app.id.clone());
                    apps.push(app);
                }
            }
        }

        // Enrichment (blocking → spawn_blocking)
        if native_manager == "Apt" {
            let mut apps_clone = apps.clone();
            if let Ok(enriched) = tauri::async_runtime::spawn_blocking(move || {
                enrich_apt_metadata_sync(&mut apps_clone);
                apps_clone
            }).await {
                apps = enriched;
            }
        }

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    }

    fn scan_desktop_files(home: &Path, native_manager: &str) -> Vec<AppInfo> {
        let desktop_dirs = vec![
            (PathBuf::from("/usr/share/applications"), native_manager.to_string(), true),
            (PathBuf::from("/usr/local/share/applications"), native_manager.to_string(), true),
            (home.join(".local/share/applications"), native_manager.to_string(), false),
            (PathBuf::from("/var/lib/flatpak/exports/share/applications"), "flatpak".to_string(), false),
            (home.join(".local/share/flatpak/exports/share/applications"), "flatpak".to_string(), false),
            (PathBuf::from("/var/lib/snapd/desktop/applications"), "snap".to_string(), false),
        ];

        let mut apps = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for (dir, method, is_system_path) in desktop_dirs {
            if !dir.exists() || !dir.is_dir() { continue; }

            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("desktop") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Some(mut app) = parse_desktop_file(&content, &path) {
                                if !seen_ids.contains(&app.id) {
                                    app.install_method = method.clone();
                                    app.is_system = is_system_path;
                                    app.path = path.to_string_lossy().to_string();
                                    app.installed_at = fs::metadata(&path).ok()
                                        .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .map(|d| d.as_secs() as u64);
                                    app.size = None;
                                    seen_ids.insert(app.id.clone());
                                    apps.push(app);
                                }
                            }
                        }
                    }
                }
            }
        }

        apps
    }

    fn list_cargo_packages() -> Vec<AppInfo> {
        let output = match Command::new("cargo")
            .args(["install", "--list"])
            .output() {
                Ok(o) => o,
                Err(_) => return Vec::new(),
            };

        if !output.status.success() {
            return Vec::new();
        }

        let s = String::from_utf8_lossy(&output.stdout);
        let mut apps = Vec::new();
        let home = dirs::home_dir().unwrap_or_default();

        for line in s.lines() {
            if line.contains(" v") && line.contains(":") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let name = parts[0].to_string();
                    let version = parts[1].trim_start_matches('v').trim_end_matches(':').to_string();
                    let id = format!("cargo-{}", name);
                    
                    let bin_path = home.join(".cargo/bin").join(&name);
                    let installed_at = fs::metadata(&bin_path).ok()
                        .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as u64);

                    apps.push(AppInfo {
                        name: name.clone(),
                        icon: None,
                        icon_name: None,
                        exec: Some(name.clone()),
                        comment: Some("Rust Binary via Cargo".to_string()),
                        id,
                        install_method: "cargo".to_string(),
                        is_system: false,
                        path: bin_path.to_string_lossy().to_string(),
                        version: Some(version),
                        size: None,
                        installed_at,
                        origin: Some("crates.io".to_string()),
                        usage_hint: None,
                        is_dependency: false,
                    });
                }
            }
        }
        apps
    }

    fn list_npm_global_packages() -> Vec<AppInfo> {
        let output = match Command::new("npm")
            .args(["list", "-g", "--depth=0", "--json"])
            .output() {
                Ok(o) => o,
                Err(_) => return Vec::new(),
            };

        if !output.status.success() {
            return Vec::new();
        }

        let s = String::from_utf8_lossy(&output.stdout);
        let json: serde_json::Value = match serde_json::from_str(&s) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };
        
        let mut apps = Vec::new();
        
        // Get npm prefix to find the actual directory for metadata
        let prefix_output = Command::new("npm")
            .args(["config", "get", "prefix"])
            .output()
            .ok();
        let prefix = prefix_output.and_then(|o| {
            if o.status.success() {
                Some(PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
            } else {
                None
            }
        });

        if let Some(dependencies) = json.get("dependencies").and_then(|d| d.as_object()) {
            for (name, details) in dependencies {
                let version = details.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                let id = format!("npm-{}", name);
                
                let mut installed_at = None;
                let mut path = String::new();

                if let Some(p) = &prefix {
                    let pkg_path = p.join("lib/node_modules").join(name);
                    path = pkg_path.to_string_lossy().to_string();
                    installed_at = fs::metadata(&pkg_path).ok()
                        .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as u64);
                }
                
                apps.push(AppInfo {
                    name: name.clone(),
                    icon: None,
                    icon_name: None,
                    exec: Some(name.clone()),
                    comment: Some("JS Package via NPM global".to_string()),
                    id,
                    install_method: "npm".to_string(),
                    is_system: false,
                    path,
                    version,
                    size: None,
                    installed_at,
                    origin: Some("npm registry".to_string()),
                    usage_hint: None,
                    is_dependency: false,
                });
            }
        }
        apps
    }

    fn list_usr_bin_binaries() -> Vec<AppInfo> {
        let bin_dir = Path::new("/usr/bin");
        if !bin_dir.exists() {
            return Vec::new();
        }

        let mut apps = Vec::new();
        if let Ok(entries) = fs::read_dir(bin_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    
                    if name.len() < 3 || name.contains('.') {
                        continue;
                    }

                    // Avoid expensive per-file Command calls here.
                    // Origin will be shown as "Sistema" for now, can be enriched lazily.
                    let id = format!("bin-{}", name);
                    
                    let installed_at = fs::metadata(&path).ok()
                        .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as u64);
                    
                    apps.push(AppInfo {
                        name: name.clone(),
                        icon: None,
                        icon_name: None,
                        exec: Some(path.to_string_lossy().to_string()),
                        comment: Some(format!("Binário do sistema: {}", name)),
                        id,
                        install_method: "binary".to_string(),
                        is_system: true,
                        path: path.to_string_lossy().to_string(),
                        version: None,
                        size: None,
                        installed_at,
                        origin: Some("Sistema Local".to_string()),
                        usage_hint: None,
                        is_dependency: false,
                    });
                }
            }
        }
        apps
    }

    fn enrich_apt_metadata_sync(apps: &mut Vec<AppInfo>) {
        // Get manually installed packages (cache it)
        let manual_output = Command::new("apt-mark")
            .arg("showmanual")
            .output();

        if let Ok(output) = manual_output {
            let manual_str = String::from_utf8_lossy(&output.stdout);
            let manual_pkgs: std::collections::HashSet<&str> = manual_str.lines().collect();

            for app in apps.iter_mut() {
                if app.install_method == "Apt" {
                    if !manual_pkgs.contains(app.name.to_lowercase().as_str()) {
                        app.is_dependency = true;
                    }
                }
            }
        }
    }

    #[tauri::command]
    pub async fn get_app_size(id: String, method: String) -> Option<u64> {
        tauri::async_runtime::spawn_blocking(move || {
            get_package_size(&id, &method)
        }).await.unwrap_or(None)
    }

    #[tauri::command]
    pub async fn get_app_sizes_batch(items: Vec<(String, String)>) -> Vec<(String, String, Option<u64>)> {
        tauri::async_runtime::spawn_blocking(move || {
            let chunk_size = 8;
            let mut all_results = Vec::with_capacity(items.len());

            for chunk in items.chunks(chunk_size) {
                let chunk_vec: Vec<(String, String)> = chunk.to_vec();
                std::thread::scope(|s| {
                    let handles: Vec<_> = chunk_vec.into_iter().map(|(id, method)| {
                        s.spawn(move || {
                            let size = get_package_size(&id, &method);
                            (id, method, size)
                        })
                    }).collect();

                    for handle in handles {
                        if let Ok(result) = handle.join() {
                            all_results.push(result);
                        }
                    }
                });
            }

            all_results
        }).await.unwrap_or_default()
    }

    #[tauri::command]
    pub async fn resolve_icons_batch(icon_names: Vec<String>) -> Vec<(String, Option<String>)> {
        // Run on a blocking thread so it doesn't stall the Tokio runtime
        tauri::async_runtime::spawn_blocking(move || {
            // Eagerly initialize the icon index if not yet built
            let _index = get_icon_index();

            let chunk_size = 12;
            let mut all_results = Vec::with_capacity(icon_names.len());

            for chunk in icon_names.chunks(chunk_size) {
                let chunk_vec: Vec<String> = chunk.to_vec();
                std::thread::scope(|s| {
                    let handles: Vec<_> = chunk_vec.into_iter().map(|name| {
                        s.spawn(move || {
                            let resolved = resolve_icon_to_base64(&name);
                            (name, resolved)
                        })
                    }).collect();

                    for handle in handles {
                        if let Ok(result) = handle.join() {
                            all_results.push(result);
                        }
                    }
                });
            }

            all_results
        }).await.unwrap_or_default()
    }

    fn get_package_size(id: &str, method: &str) -> Option<u64> {
        let pkg_name = id.replace(".desktop", "");
        
        match method.to_lowercase().as_str() {
            "flatpak" => {
                let output = Command::new("flatpak")
                    .args(["info", "--show-size", "--", &pkg_name])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                parse_human_size(&s)
            },
            "snap" => {
                let output = Command::new("snap")
                    .args(["info", "--", &pkg_name])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&output.stdout);
                for line in s.lines() {
                    if line.contains("installed:") {
                        let parts: Vec<&str> = line.split('(').collect();
                        if parts.len() >= 2 {
                            let size_part = parts[1].replace(")", "");
                            return parse_human_size(&size_part);
                        }
                    }
                }
                None
            },
            "apt" | "apt-get" => {
                let output = Command::new("apt-cache")
                    .args(["show", "--", &pkg_name])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&output.stdout);
                for line in s.lines() {
                    if line.starts_with("Installed-Size:") {
                        let size_kb = line.replace("Installed-Size:", "").trim().parse::<u64>().ok()?;
                        return Some(size_kb * 1024);
                    }
                }
                None
            },
            "dnf" => {
                let output = Command::new("dnf")
                    .args(["info", "--installed", "--", &pkg_name])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&output.stdout);
                for line in s.lines() {
                    if line.contains("Installed size") || line.contains("Tamanho instalado") {
                        let parts: Vec<&str> = line.split(':').collect();
                        if parts.len() >= 2 {
                            return parse_human_size(parts[1].trim());
                        }
                    }
                }
                None
            },
            "pacman" => {
                let output = Command::new("pacman")
                    .args(["-Qi", "--", &pkg_name])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&output.stdout);
                for line in s.lines() {
                    if line.contains("Installed Size") || line.contains("Tamanho instalado") {
                        let parts: Vec<&str> = line.split(':').collect();
                        if parts.len() >= 2 {
                            return parse_human_size(parts[1].trim());
                        }
                    }
                }
                None
            },
            "zypper" => {
                let output = Command::new("zypper")
                    .args(["info", "--", &pkg_name])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&output.stdout);
                for line in s.lines() {
                    if line.contains("Installed Size") || line.contains("Tamanho instalado") {
                        let parts: Vec<&str> = line.split(':').collect();
                        if parts.len() >= 2 {
                            return parse_human_size(parts[1].trim());
                        }
                    }
                }
                None
            },
            _ => None
        }
    }

    fn parse_human_size(s: &str) -> Option<u64> {
        let s = s.to_lowercase();
        let val_str: String = s.chars().filter(|c| c.is_digit(10) || *c == '.').collect();
        let val = val_str.parse::<f64>().ok()?;
        
        if s.contains("gb") || s.contains("gib") {
            Some((val * 1024.0 * 1024.0 * 1024.0) as u64)
        } else if s.contains("mb") || s.contains("mib") {
            Some((val * 1024.0 * 1024.0) as u64)
        } else if s.contains("kb") || s.contains("kib") {
            Some((val * 1024.0) as u64)
        } else {
            Some(val as u64)
        }
    }
}

fn get_path_size(path: &Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            return entries
                .flatten()
                .map(|entry| get_path_size(&entry.path()))
                .sum();
        }
    }
    0
}

fn analyze_path_risk(path: &str, base_category: &str) -> FileAnalysis {
    let mut risk = "medium";
    let mut action = "delete";
    let mut reason = "Arquivo ou pasta detectado como pertencente ao aplicativo.";
    let size = get_path_size(Path::new(path));

    if path.contains(".cache") {
        risk = "low";
        reason = "Arquivos temporários e cache. Seguro para excluir.";
    } else if path.contains(".var/app") || path.contains("/snap/") {
        risk = "medium";
        reason = "Dados isolados (Sandbox). Contém configurações e arquivos de usuário.";
    } else if path.contains("/var/lib/flatpak") || path.contains("/usr/") || path.contains("/etc/") {
        risk = "high";
        action = "keep";
        reason = "Atenção: Caminho do sistema ou binários protegidos. Recomendado manter.";
    } else if path.contains(".config") || path.contains(".mozilla") || path.contains(".thunderbird") {
        risk = "medium";
        reason = "Configurações e preferências do usuário.";
    } else if path.contains(".local/share") {
        risk = "medium";
        reason = "Dados locais do aplicativo, como histórico ou downloads.";
    } else if path.contains(".cache") {
        risk = "low";
        reason = "Arquivos temporários e cache. Seguro para excluir.";
    }

    FileAnalysis {
        path: path.to_string(),
        category: base_category.to_string(),
        risk: risk.to_string(),
        action: action.to_string(),
        reason: reason.to_string(),
        size,
    }
}

fn parse_desktop_file(content: &str, path: &Path) -> Option<AppInfo> {
    let mut name = None;
    let mut icon = None;
    let mut exec = None;
    let mut comment = None;
    let mut version = None;
    let mut is_no_display = false;

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("Name=") {
            name = Some(line.replace("Name=", ""));
        } else if line.starts_with("Icon=") {
            icon = Some(line.replace("Icon=", ""));
        } else if line.starts_with("Exec=") {
            exec = Some(line.replace("Exec=", ""));
        } else if line.starts_with("Comment=") {
            comment = Some(line.replace("Comment=", ""));
        } else if line.starts_with("Version=") {
            version = Some(line.replace("Version=", ""));
        } else if line.starts_with("NoDisplay=true") {
            is_no_display = true;
        }
    }

    if is_no_display || name.is_none() {
        return None;
    }

    let name = name?;
    let id = path.file_stem()?.to_string_lossy().to_string();
    // Don't resolve icons here — they're loaded lazily via resolve_icons_batch
    let raw_icon_name = icon;

    let mut installed_at = None;
    if let Ok(metadata) = std::fs::metadata(path) {
        if let Ok(created) = metadata.created().or_else(|_| metadata.modified()) {
            if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                installed_at = Some(duration.as_secs());
            }
        }
    }

    Some(AppInfo {
        name,
        icon: None,
        icon_name: raw_icon_name,
        exec,
        comment,
        id,
        install_method: "native".to_string(),
        is_system: true,
        path: path.to_string_lossy().to_string(),
        version,
        size: None,
        installed_at,
        origin: None,
        usage_hint: None,
        is_dependency: false,
    })
}

fn resolve_icon_to_base64(icon_name: &str) -> Option<String> {
    let icon_path = if icon_name.starts_with('/') {
        Some(PathBuf::from(icon_name))
    } else {
        find_icon_path(icon_name)
    };

    if let Some(path) = icon_path {
        if let Ok(bytes) = fs::read(&path) {
            let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("png");
            let mime_type = match extension {
                "svg" => "image/svg+xml",
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "xpm" => "image/xpm",
                _ => "image/png",
            };
            let b64 = general_purpose::STANDARD.encode(bytes);
            return Some(format!("data:{};base64,{}", mime_type, b64));
        }
    }
    None
}

fn find_icon_path(icon_name: &str) -> Option<PathBuf> {
    // O(1) lookup from pre-built index
    let index = get_icon_index();
    if let Some(path) = index.get(icon_name) {
        return Some(path.clone());
    }

    // Fallback: absolute path check (for icons specified as full paths with wrong extension)
    let as_path = PathBuf::from(icon_name);
    if as_path.is_absolute() && as_path.exists() {
        return Some(as_path);
    }

    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_residual_files,
            commands::execute_cleanup,
            commands::list_apps,
            commands::uninstall_app,
            commands::update_app,
            commands::install_local_package,
            commands::get_app_size,
            commands::get_app_sizes_batch,
            commands::get_package_metadata,
            commands::resolve_icons_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
