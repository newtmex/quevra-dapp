"use client";

import { create } from "zustand";

export type NotificationType = "info" | "pending" | "success" | "error";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  createdAt: number;
  txHash?: `0x${string}`;
  chainId?: number;
  dismissAfterMs?: number;
  persistent?: boolean;
};

type NotificationInput = Omit<NotificationItem, "id" | "createdAt"> & { id?: string };

type NotificationState = {
  items: NotificationItem[];
  push: (item: NotificationInput) => string;
  update: (id: string, patch: Partial<NotificationItem>) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const typeDefaults: Record<NotificationType, { dismissAfterMs?: number; persistent?: boolean }> = {
  info: { dismissAfterMs: 5000 },
  pending: { persistent: true },
  success: { dismissAfterMs: 7000 },
  error: { persistent: true },
};

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 10)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  push: (item) => {
    const id = item.id ?? newId();
    const defaults = typeDefaults[item.type];
    set((state) => ({
      items: [{ ...defaults, ...item, id, createdAt: Date.now() }, ...state.items].slice(0, 5),
    }));
    return id;
  },
  update: (id, patch) => set((state) => ({
    items: state.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  })),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] }),
}));

export const notify = {
  push: (item: NotificationInput) => useNotificationStore.getState().push(item),
  update: (id: string, patch: Partial<NotificationItem>) => useNotificationStore.getState().update(id, patch),
  remove: (id: string) => useNotificationStore.getState().remove(id),
  clear: () => useNotificationStore.getState().clear(),
  info: (title: string, message?: string) => notify.push({ type: "info", title, message }),
  success: (title: string, message?: string) => notify.push({ type: "success", title, message }),
  error: (title: string, message?: string) => notify.push({ type: "error", title, message }),
  pendingTx: (title: string, message: string, chainId: number) =>
    notify.push({ type: "pending", title, message, chainId }),
  txSent: (id: string, txHash: `0x${string}`) =>
    notify.update(id, { txHash, message: "Transaction submitted. Waiting for confirmation." }),
  txConfirmed: (id: string) =>
    notify.update(id, { type: "success", message: "Transaction confirmed.", persistent: false, dismissAfterMs: 7000 }),
  txFailed: (id: string, message: string) =>
    notify.update(id, { type: "error", message, persistent: true }),
};
