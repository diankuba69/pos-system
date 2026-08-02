"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AlertTriangle } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Opts = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
};

const ConfirmContext = createContext<((o: Opts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: Opts) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (val: boolean) => {
    resolver.current?.(val);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} title={opts?.title ?? ""} testId="confirm-dialog" width="max-w-md">
        <div className="flex gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              opts?.tone === "danger" ? "bg-bad-soft text-bad" : "bg-brand-soft text-brand"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="pt-1 text-sm leading-relaxed text-dim">{opts?.description ?? "Tindakan ini tidak bisa dibatalkan."}</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" data-testid="confirm-cancel" onClick={() => close(false)}>
            {opts?.cancelText ?? "Batal"}
          </Button>
          <Button
            variant={opts?.tone === "danger" ? "danger" : "primary"}
            data-testid="confirm-accept"
            onClick={() => close(true)}
          >
            {opts?.confirmText ?? "Ya, lanjutkan"}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm harus dipakai di dalam ConfirmProvider");
  return ctx;
}
