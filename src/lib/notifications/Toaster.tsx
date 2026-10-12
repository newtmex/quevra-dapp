"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, ExternalLink, Info, LoaderCircle, X } from "lucide-react";
import { useNotificationStore } from "./store";

const icons = {
  info: Info,
  pending: LoaderCircle,
  success: Check,
  error: CircleAlert,
} as const;

function explorerUrl(chainId: number | undefined, hash: `0x${string}`) {
  if (chainId === 10143) return `https://testnet.monadexplorer.com/tx/${hash}`;
  return null;
}

export function NotificationsToaster() {
  const items = useNotificationStore((state) => state.items);
  return (
    <div className="notification-stack" aria-live="polite" aria-atomic="false">
      {items.map((item) => <NotificationToast key={item.id} item={item} />)}
    </div>
  );
}

function NotificationToast({ item }: { item: ReturnType<typeof useNotificationStore.getState>["items"][number] }) {
  const remove = useNotificationStore((state) => state.remove);
  const [hovered, setHovered] = useState(false);
  const remaining = useRef(item.dismissAfterMs ?? 0);
  const dismissAfterMs = item.dismissAfterMs ?? 0;
  const Icon = icons[item.type];

  useEffect(() => {
    if (item.persistent || dismissAfterMs <= 0 || hovered) return;
    if (remaining.current <= 0) remaining.current = dismissAfterMs;
    const start = Date.now();
    const timeout = window.setTimeout(() => remove(item.id), remaining.current);
    return () => {
      remaining.current = Math.max(0, remaining.current - (Date.now() - start));
      window.clearTimeout(timeout);
    };
  }, [dismissAfterMs, hovered, item.id, item.persistent, remove]);

  const url = item.txHash ? explorerUrl(item.chainId, item.txHash) : null;
  return (
    <article className={`notification notification--${item.type}`} role="status" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <span className="notification__state"><Icon size={15} className={item.type === "pending" ? "animate-spin" : ""} /></span>
      <div className="notification__body">
        <strong>{item.title}</strong>
        {item.message ? <span>{item.message}</span> : null}
        {url ? <a href={url} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a> : null}
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={() => remove(item.id)}><X size={15} /></button>
    </article>
  );
}
