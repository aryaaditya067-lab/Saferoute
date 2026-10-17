"use client";

import dynamic from "next/dynamic";

// Three.js needs the browser, so the scene is never rendered on the server.
const CityScene = dynamic(() => import("./CityScene"), { ssr: false });

export function CityBackdrop() {
  return <CityScene />;
}
