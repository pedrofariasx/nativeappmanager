/*
 * File: Index.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Wed Mar 25 2026
 * Modified By: Pedro Farias
 * 
 */

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { SmartUninstaller } from "@/components/SmartUninstaller";
import { AppDashboard } from "@/components/AppDashboard";
import { AppDetails } from "@/components/AppDetails";
import { InstallView } from "@/components/InstallView";
import { UninstallView } from "@/components/UninstallView";
import { UpdateView } from "@/components/UpdateView";
import { Toaster } from "@/components/ui/sonner";
import { AppInfo } from "../types/uninstaller";

const Index = () => {
  const [view, setView] = useState<"dashboard" | "uninstaller" | "details" | "installing" | "uninstalling" | "updating">("dashboard");
  const [selectedApp, setSelectedApp] = useState<{ name: string; id: string }>({ name: "", id: "" });
  const [appForUninstall, setAppForUninstall] = useState<AppInfo | null>(null);
  const [appForUpdate, setAppForUpdate] = useState<AppInfo | null>(null);
  const [appForDetails, setAppForDetails] = useState<AppInfo | null>(null);
  const [installingPath, setInstallingPath] = useState<string | null>(null);
  
  // Navigation direction for slide animations
  const [direction, setDirection] = useState(0); // 1 for forward, -1 for backward

  // Persistent Dashboard State
  const [apps, setApps] = useState<AppInfo[]>([]);
  const appsRef = useRef<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [scrollPos, setScrollPos] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(40);
  
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync for use inside stable callbacks
  useEffect(() => { appsRef.current = apps; }, [apps]);

  const fetchApps = useCallback(async (isManual = false) => {
    const currentApps = appsRef.current;
    if (currentApps.length === 0) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const appList: AppInfo[] = await invoke("list_apps");
      
      const currentIds = new Set(currentApps.map(a => `${a.install_method}-${a.id}`));
      const newIds = new Set(appList.map(a => `${a.install_method}-${a.id}`));
      
      const hasChanged = appList.length !== currentApps.length ||
                         [...newIds].some(id => !currentIds.has(id));

      if (hasChanged || isManual) {
        setApps(appList);
        // Load icons and sizes progressively AFTER initial render
        requestAnimationFrame(() => {
          fetchIcons(appList);
          fetchSizes(appList);
        });
      }
    } catch (error) {
      toast.error("Erro ao carregar aplicativos");
      console.error(error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchIcons = async (appList: AppInfo[]) => {
    // Collect apps that have an icon_name but no resolved icon
    const appsNeedingIcons = appList.filter(a => a.icon_name && !a.icon);
    if (appsNeedingIcons.length === 0) return;

    // Backend has an O(1) index now, so we can process more icons per batch
    const batchSize = 50;
    for (let i = 0; i < appsNeedingIcons.length; i += batchSize) {
      const batch = appsNeedingIcons.slice(i, i + batchSize);
      const iconNames = batch.map(a => a.icon_name!);

      try {
        const results: [string, string | null][] = await invoke("resolve_icons_batch", {
          iconNames,
        });

        const iconMap = new Map(results);

        startTransition(() => {
          setApps(prev => prev.map(a => {
            if (a.icon_name && iconMap.has(a.icon_name)) {
              const resolved = iconMap.get(a.icon_name);
              if (resolved) {
                return { ...a, icon: resolved };
              }
            }
            return a;
          }));
        });
      } catch (error) {
        console.error("Failed to resolve icons batch:", error);
      }

      // Small yield to keep UI responsive between batches
      await new Promise(r => setTimeout(r, 50));
    }
  };

  const fetchSizes = async (appList: AppInfo[]) => {
    // Skip binary, cargo, and npm since sizes are not returned for these
    const appsNeedingSizes = appList.filter(a =>
      !["binary", "cargo", "npm"].includes(a.install_method.toLowerCase()) && a.size === null
    );
    if (appsNeedingSizes.length === 0) return;

    const batchSize = 20;
    for (let i = 0; i < appsNeedingSizes.length; i += batchSize) {
      const batch = appsNeedingSizes.slice(i, i + batchSize);
      const items = batch.map(a => [a.id, a.install_method]);
      
      try {
        const results: [string, string, number | null][] = await invoke("get_app_sizes_batch", { items });

        startTransition(() => {
          setApps(prev => prev.map(a => {
            const found = results.find(r => r[0] === a.id && r[1] === a.install_method);
            if (found && found[2] !== null) {
              return { ...a, size: found[2] };
            }
            return a;
          }));
        });
      } catch (error) {
        console.error("Failed to fetch sizes batch:", error);
      }

      await new Promise(r => setTimeout(r, 100));
    }
  };

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(40);
  }, [search, activeTab, sortBy]);

  useEffect(() => {
    fetchApps();
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== "dashboard") {
        if (e.key === "Escape") {
          handleBack();
        } else if (e.key === "Backspace" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          handleBack();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  // Handle scroll restoration exactly when the dashboard mounts
  const setDashboardRef = useCallback((node: HTMLDivElement | null) => {
    dashboardRef.current = node;
    if (node && view === "dashboard" && scrollPos > 0) {
      // Use requestAnimationFrame to ensure the DOM is fully layout out
      requestAnimationFrame(() => {
        node.scrollTo({ top: scrollPos, behavior: 'instant' });
      });
    }
  }, [view, scrollPos]);

  const captureScroll = () => {
    if (dashboardRef.current) {
      setScrollPos(dashboardRef.current.scrollTop);
    }
  };

  const handleStartScan = (name: string, id: string) => {
    if (view === "dashboard") captureScroll();
    setDirection(1);
    setSelectedApp({ name, id });
    setView("uninstaller");
  };

  const handleViewDetails = (app: AppInfo) => {
    if (view === "dashboard") captureScroll();
    setDirection(1);
    setAppForDetails(app);
    setView("details");
  };

  const handleStartInstall = (path: string) => {
    if (view === "dashboard") captureScroll();
    setDirection(1);
    setInstallingPath(path);
    setView("installing");
  };

  const handleStartUninstall = (app: AppInfo) => {
    if (view === "dashboard") captureScroll();
    setDirection(1);
    setAppForUninstall(app);
    setView("uninstalling");
  };

  const handleStartUpdate = (app: AppInfo) => {
    if (view === "dashboard") captureScroll();
    setDirection(1);
    setAppForUpdate(app);
    setView("updating");
  };

  const handleBack = () => {
    // Start animation immediately
    setDirection(-1);
    setView("dashboard");
    
    // Defer clearing other states to avoid a heavy single render block
    setTimeout(() => {
      setSelectedApp({ name: "", id: "" });
      setAppForDetails(null);
      setAppForUninstall(null);
      setAppForUpdate(null);
      setInstallingPath(null);
    }, 300); // Wait for transition to be mostly complete
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "30%" : "-30%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? "30%" : "-30%",
      opacity: 0,
    }),
  };

  return (
    <div className="h-screen w-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/30 overflow-hidden relative">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={view}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "tween", duration: 0.2, ease: "easeOut" },
            opacity: { duration: 0.15 },
          }}
          className="absolute inset-0 w-full h-full overflow-y-auto scrollbar-hide"
          ref={view === "dashboard" ? setDashboardRef : null}
        >
          {view === "dashboard" && (
            <AppDashboard
              onScanResiduals={handleStartScan}
              onViewDetails={handleViewDetails}
              onStartInstall={handleStartInstall}
              onStartUninstall={handleStartUninstall}
              apps={apps}
              loading={loading}
              isRefreshing={isRefreshing}
              fetchApps={fetchApps}
              search={search}
              setSearch={setSearch}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              sortBy={sortBy}
              setSortBy={setSortBy}
              displayLimit={displayLimit}
              setDisplayLimit={setDisplayLimit}
            />
          )}

          {view === "uninstaller" && (
            <SmartUninstaller
              appName={selectedApp.name}
              appId={selectedApp.id}
              onBack={handleBack}
            />
          )}

          {view === "details" && appForDetails && (
            <AppDetails
              app={appForDetails}
              onBack={handleBack}
              onCleanup={handleStartScan}
              onUninstall={handleStartUninstall}
              onUpdate={handleStartUpdate}
            />
          )}

          {view === "installing" && installingPath && (
            <InstallView
              path={installingPath}
              onBack={handleBack}
              onComplete={() => fetchApps(true)} 
            />
          )}

          {view === "uninstalling" && appForUninstall && (
            <UninstallView
              app={appForUninstall}
              onBack={handleBack}
              onComplete={(name, id) => {
                fetchApps(true);
                handleStartScan(name, id);
              }}
            />
          )}

          {view === "updating" && appForUpdate && (
            <UpdateView
              app={appForUpdate}
              onBack={handleBack}
              onComplete={() => fetchApps(true)}
            />
          )}
        </motion.div>
      </AnimatePresence>
      <Toaster position="bottom-right" theme="dark" closeButton richColors />
    </div>
  );
};

export default Index;
