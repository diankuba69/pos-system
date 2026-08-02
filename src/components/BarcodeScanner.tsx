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

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | null = null;
    let stopped = false;

    (async () => {
      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (result && !stopped) {
            stopped = true;
            onDetected(result.getText());
            controls?.stop();
            onClose();
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
  }, [open, onClose, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title="Pindai Barcode" testId="scanner-modal">
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-900">
        <video ref={videoRef} data-testid="scanner-video" className="h-64 w-full object-cover" muted playsInline />
      </div>
      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          Arahkan kamera ke barcode produk. Anda juga bisa memakai pemindai USB: cukup pindai saat kolom pencarian aktif.
        </p>
      )}
    </Modal>
  );
}
