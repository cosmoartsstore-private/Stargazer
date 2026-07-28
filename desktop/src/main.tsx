// React アプリケーションを DOM へマウントし、StrictMode で起動する。

import React from "react";
import ReactDOM from "react-dom/client";
import "@/styles/global.css";
import App from "./App";

// Reactのマウント先とrootを起動時に一度だけ作成する。
const rootElement = document.getElementById("root") as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
