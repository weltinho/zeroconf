import { useEffect, useState, useCallback } from "react";

type ToastMessage = {
  id: number;
  text: string;
};

let toastId = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

// Função global para mostrar toast
export function showCopyToast(text: string = "Copiado!") {
  const msg: ToastMessage = { id: ++toastId, text };
  listeners.forEach((fn) => fn(msg));
}

// Hook para copiar com toast
export function useCopyWithToast() {
  const copy = useCallback(async (value: string, message?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showCopyToast(message);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showCopyToast(message);
    }
  }, []);
  return copy;
}

// Componente Toast Container
export function CopyToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, 2000);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="copy-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="copy-toast">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
