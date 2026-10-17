"use client";

import { useCallback, useRef, useState } from "react";
import { describeError } from "@/lib/errors";
import { isBackendConfigured } from "@/services/api";
import { fetchNightLights } from "@/services/nightLights";
import type { NightLightsResponse } from "@/types";

export interface NightLightsLayer {
  enabled: boolean;
  visible: boolean;
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  data: NightLightsResponse | null;
  message: string | null;
  toggle: () => void;
}

/** Night view: loads the NASA grid the first time it is switched on, then just shows/hides it. */
export function useNightLights(): NightLightsLayer {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<NightLightsLayer["status"]>("idle");
  const [data, setData] = useState<NightLightsResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const loading = useRef(false);

  const toggle = useCallback(() => {
    if (visible) {
      setVisible(false);
      return;
    }
    if (data?.available) {
      setVisible(true);
      return;
    }
    if (loading.current) return;
    loading.current = true;
    setStatus("loading");
    setMessage(null);
    fetchNightLights()
      .then((response) => {
        setData(response);
        if (response.available) {
          setStatus("ready");
          setVisible(true);
        } else {
          setStatus("unavailable");
          setMessage(response.note ?? "Night-light data isn't available yet.");
        }
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(describeError(error));
      })
      .finally(() => {
        loading.current = false;
      });
  }, [visible, data]);

  return { enabled: isBackendConfigured(), visible, status, data, message, toggle };
}
