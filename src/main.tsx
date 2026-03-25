/*
 * File: main.tsx
 * Project: native-app-manager
 * Author: Pedro Farias
 * Created: 2026-03-22
 * 
 * Last Modified: Wed Mar 25 2026
 * Modified By: Pedro Farias
 * 
 */

import React from "react";
import ReactDOM from "react-dom/client";
import Index from "./pages/Index";
import "./globals.css";

// Automatically detect system theme
const updateTheme = () => {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

updateTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);

// Prevent default context menu to make it feel more like a native app
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Index />
  </React.StrictMode>
);
