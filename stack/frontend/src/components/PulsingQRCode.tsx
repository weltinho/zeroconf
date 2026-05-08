import { useEffect, useState } from "react";
import AddressQRCode from "./AddressQRCode";

type PulsingQRCodeProps = {
  value: string;
  size?: number;
  isWaiting?: boolean;
  isDetected?: boolean;
};

export function PulsingQRCode({
  value,
  size = 160,
  isWaiting = true,
  isDetected = false,
}: PulsingQRCodeProps) {
  const [showCapture, setShowCapture] = useState(false);

  // Animação de "capturado" quando detecta
  useEffect(() => {
    if (isDetected) {
      setShowCapture(true);
      const timer = setTimeout(() => setShowCapture(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isDetected]);

  return (
    <div className={`pulsing-qr-wrapper ${isWaiting ? "is-waiting" : ""} ${showCapture ? "is-captured" : ""}`}>
      {/* Pulse rings */}
      {isWaiting && !showCapture && (
        <>
          <div className="qr-pulse-ring qr-pulse-ring-1" />
          <div className="qr-pulse-ring qr-pulse-ring-2" />
        </>
      )}
      
      {/* Capture effect */}
      {showCapture && (
        <div className="qr-capture-effect">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="qr-capture-check"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
      
      {/* QR Code */}
      <div className={`pulsing-qr-inner ${showCapture ? "is-captured" : ""}`}>
        <AddressQRCode value={value} size={size} />
      </div>
    </div>
  );
}
