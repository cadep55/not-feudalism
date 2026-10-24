import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./net/api.ts";
import { App } from "./ui/App.tsx";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("index.html is missing #app");

const api = createApi(import.meta.env.VITE_SERVER_URL);

createRoot(root).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
