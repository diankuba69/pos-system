"use client";

import { Modal } from "@/components/ui/modal";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (kode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const cbRef = useRef({ onClose, onDetected });
  cbRef.current = { onClose, onDetected };

  useEffect(() => {
    if (!open) return;
    setError("");
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | null = null;
    let stopped = false;

    (async () => {
      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (result && !stopped) {
            stopped = true;
            cbRef.current.onDetected(result.getText());
            controls?.stop();
            cbRef.current.onClose();
          }
        });
      } catch (e) {
        setError(
          e instanceof Error
            ? `Tidak dapat mengakses kamera: ${e.message}`
            : "Tidak dapat mengakses kamera perangkat.",
        );
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Pindai Barcode" testId="scanner-modal">
      <div className="overflow-hidden rounded-xl border border-line bg-zinc-950">
        <video ref={videoRef} data-testid="scanner-video" className="h-64 w-full object-cover" muted playsInline />
      </div>
      {error ? (
        <p className="mt-3 rounded-xl border border-bad/25 bg-bad-soft px-3 py-2 text-sm font-semibold text-bad">{error}</p>
      ) : (
        <p className="mt-3 text-sm text-dim">
          Arahkan kamera ke barcode produk. Anda juga bisa memakai pemindai USB: cukup pindai saat kolom pencarian aktif.
        </p>
      )}
    </Modal>
  );
}
