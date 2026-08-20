"use client";

import { useEffect } from "react";

export default function ImageCacheRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/school/image-cache-sw.js", {
      scope: "/school/",
      updateViaCache: "none",
    });
  }, []);

  return null;
}
