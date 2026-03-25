<div align="center">
  <img src="src-tauri/icons/icon.svg" width="128" height="128" alt="Native App Manager Icon" />
  <h1>Native App Manager</h1>
  <p><strong>The modern and minimalist way to manage and clean up your Linux applications.</strong></p>

  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
  [![Platform](https://img.shields.io/badge/platform-Linux-orange.svg)]()
  [![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-green.svg)](https://tauri.app/)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  
  <p><br><em><a href="README.md">🇧🇷 Leia em Português</a></em></p>
</div>

<hr />

![alt text](public/nativeappmanager.png)

## 🚀 Overview

**Native App Manager** is a high-performance application manager for Linux, focused on solving the "leftover files" problem. While traditional package managers only remove binaries, they often leave behind gigabytes of configurations, cache, and local data.

This tool provides a centralized and minimalist interface to manage a massive ecosystem of packages, featuring a smart cleanup engine that scans the filesystem to recover wasted space.

## ✨ Key Features

### 📦 Universal Package Management
One single dashboard for everything. No more switching between command-line tools. Native App Manager automatically detects your system and supports:
- **System Managers:** `APT` (Debian/Ubuntu), `DNF` (Fedora), `Pacman` (Arch), and `Zypper` (OpenSUSE).
- **Universal Formats:** `Flatpak` and `Snap`.
- **Languages and Tools:** `Cargo` (Rust) and global `NPM` (Node.js) packages.
- **Native Apps:** Static binaries, `AppImages`, and local `.desktop` files.

### 🧹 Smart Uninstaller
When uninstalling an app, Native App Manager doesn't stop at the package level. It uses an advanced heuristic algorithm in Rust to scan standard directories (`~/.config`, `~/.cache`, `~/.local/share`, etc.) for leftover files.

### 📊 Real-Time Disk Usage
Transparently see how much space each residual item takes up. The interface provides a live summary of recoverable storage, allowing you to make informed decisions on what to delete.

### 🎨 Minimalist Adwaita-Style Design
Inspired by the aesthetics of **Zorin OS** and **GNOME Settings**.
- **Boxed List Patterns**: Clean and structured categorization.
- **"Deep Black" Theme**: Optimized for modern Linux environments and OLED screens.
- **Centralized Search**: Focused and distraction-free workflow.

### ⚡ High Performance and Native Experience
- **Extreme Speed:** Uses Tokio and `spawn_blocking` in the Rust backend for asynchronous operations on parallel threads. Features a global memory cache (`OnceLock`) for O(1) icon indexing, resolving thousands of icons instantly.
- **Smart Rendering:** Utilizes `IntersectionObserver` and dynamic pagination (infinite scroll) in React to ensure only what's on-screen is rendered, maintaining stability and fluidity.
- **Desktop Feel:** Native behavior and integration, with text selection blocked (`user-select: none`) and default browser context menus disabled (`contextmenu`), plus fluid animations based on `Framer Motion`.

### 🔗 Deep System Integration
- **Desktop Database Sync**: Instantly updates your application launcher icons through `update-desktop-database`.
- **AppGrid Refresh**: Keeps the GNOME Shell synced with your changes (`Main.overview.refreshAppGrid()`).
- **Privilege Elevation (pkexec)**: Safe execution for administrative commands when needed (removing files in `/usr/`).

## 🛠️ Built With

- **Core Engine**: [Tauri v2](https://tauri.app/) (Rust) for secure, high-performance system access.
- **Frontend**: [React.js](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) bundled by [Vite](https://vitejs.dev/).
- **Styling and Components**: [Tailwind CSS](https://tailwindcss.com/) + [Shadcn/UI](https://ui.shadcn.com/) (Radix UI).
- **Animations and Icons**: [Framer Motion](https://www.framer.com/motion/) and [Lucide React](https://lucide.dev/).

## 🛠️ Development and Compilation

### Prerequisites
- [Rust](https://www.rust-lang.org/)
- [Node.js / pnpm](https://pnpm.io/)
- System dependencies: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.

### Run in Development Mode
```bash
pnpm tauri dev
```

### Build for Production
```bash
pnpm tauri build
```

---

<div align="center">
  <p>Native App Manager - Effortless Cleanup, Superior Management.</p>
</div>
