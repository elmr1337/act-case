"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe, type Job } from "./jobs";

export function useJobs(): Job[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
