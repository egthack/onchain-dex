import type { ReactNode } from "react";
import { useSyncStatus } from "./useSyncStatus";
import type { TableRecord } from "@latticexyz/stash/internal";
import type { SyncProgress } from "@latticexyz/store-sync/internal";

export type Props = {
  children: ReactNode;
  fallback?: (props: TableRecord<typeof SyncProgress>) => ReactNode;
};

export function Synced({ children, fallback }: Props) {
  const status = useSyncStatus();
  return status.isLive ? children : fallback?.(status);
}
