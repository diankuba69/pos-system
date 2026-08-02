"use client";

import { Kbd } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SHORTCUTS } from "./types";

export function ShortcutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Shortcut Keyboard" testId="shortcut-modal">
      <div className="space-y-1.5">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 rounded-lg px-2 py-2 hover:bg-muted">
            <span className="text-sm text-dim">{v}</span>
            <span className="shrink-0">
              <Kbd>{k}</Kbd>
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
