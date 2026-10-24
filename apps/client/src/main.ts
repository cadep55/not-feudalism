import { CLIENT_PROTOCOL_VERSION } from "./index.ts";

// Placeholder page until the React + Phaser client shell (Step 5 of docs/INFRASTRUCTURE_PLAN.md).
const root = document.querySelector<HTMLDivElement>("#app");

if (root) {
  const heading = document.createElement("h1");
  heading.textContent = "Not Feudalism — client placeholder";

  const protocol = document.createElement("p");
  protocol.textContent = `Protocol version: ${CLIENT_PROTOCOL_VERSION}`;

  const server = document.createElement("p");
  server.textContent = `Server URL: ${import.meta.env.VITE_SERVER_URL ?? "(VITE_SERVER_URL not set)"}`;

  root.replaceChildren(heading, protocol, server);
}
