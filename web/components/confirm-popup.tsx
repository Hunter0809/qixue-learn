"use client";

import { useEffect, useRef } from "react";

export type ConfirmAction = {
  message: string;
  x: number;
  y: number;
  onConfirm: () => void;
};

export function ConfirmPopup({ action, onClose }: { action: ConfirmAction; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 16}px`;
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 16}px`;
    }
  }, []);

  return (
    <div
      ref={ref}
      className="confirm-popup"
      style={{ left: action.x, top: action.y }}
    >
      <p className="confirm-popup-message">{action.message}</p>
      <div className="confirm-popup-actions">
        <button className="confirm-popup-delete" onClick={action.onConfirm} type="button">
          删除
        </button>
        <button className="confirm-popup-cancel" onClick={onClose} type="button">
          取消
        </button>
      </div>
    </div>
  );
}
