"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, ExternalLink, Info, LoaderCircle, X } from "lucide-react";
import { explorerTxUrl } from "@/lib/web3";
import { useNotificationStore } from "./store";

const icons = {
  info: Info,
  pending: LoaderCircle,
  success: Check,
  error: CircleAlert,
} as const;

const toastStyles = {
  info: "qv:border-[#555078] qv:bg-[#24213a] qv:text-[#b9afff]",
  pending: "qv:border-[#555078] qv:bg-[#24213a] qv:text-[#b9afff]",
  success: "qv:border-[#285e56] qv:bg-[#1c3835] qv:text-[#68ddc3]",
  error: "qv:border-[#713843] qv:bg-[#3b252c] qv:text-[#ff8293]",
} as const;

export function NotificationsToaster() {
  const items = useNotificationStore((state) => state.items);
  return (
    <div className="qv:fixed qv:bottom-5 qv:right-[22px] qv:z-[5000] qv:flex qv:w-[min(380px,calc(100vw-32px))] qv:flex-col qv:gap-[9px] qv:max-[640px]:bottom-3 qv:max-[640px]:right-3 qv:max-[640px]:w-[calc(100vw-24px)]" aria-live="polite" aria-atomic="false">
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

  const url = item.txHash ? explorerTxUrl(item.chainId, item.txHash) : null;
  return (
    <article className={`qv:flex qv:items-start qv:gap-3 qv:rounded-xl qv:border qv:p-[13px_15px] qv:shadow-[0_15px_45px_rgba(0,0,0,0.4)] qv:backdrop-blur-xl ${toastStyles[item.type]}`} role="status" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <span className="qv:grid qv:size-6 qv:flex-none qv:place-items-center qv:rounded-lg qv:bg-white/10"><Icon size={15} className={item.type === "pending" ? "qv:animate-spin" : ""} /></span>
      <div className="qv:flex qv:min-w-0 qv:flex-1 qv:flex-col qv:gap-1">
        <strong className="qv:text-[11px] qv:font-semibold qv:text-[#f0eff6]">{item.title}</strong>
        {item.message ? <span className="qv:wrap-anywhere qv:text-[10px] qv:leading-[1.5] qv:text-[#b7b9c7]">{item.message}</span> : null}
        {url ? <a className="qv:inline-flex qv:items-center qv:gap-[5px] qv:text-[10px] qv:text-[#b9afff] qv:no-underline hover:qv:text-white" href={url} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a> : null}
      </div>
      <button className="qv:grid qv:size-6 qv:flex-none qv:place-items-center qv:rounded-md qv:border-0 qv:bg-transparent qv:text-[#aeb0c0] hover:qv:bg-white/10 hover:qv:text-white" type="button" aria-label="Dismiss notification" onClick={() => remove(item.id)}><X size={15} /></button>
    </article>
  );
}
