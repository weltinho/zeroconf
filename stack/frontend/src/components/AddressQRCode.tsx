type Props = {
  value: string;
  size?: number;
};

export default function AddressQRCode({ value, size = 160 }: Props) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=000000&color=00ff46&margin=6`;

  return (
    <img
      src={url}
      width={size}
      height={size}
      alt={`QR Code para ${value}`}
      style={{ display: "block", borderRadius: "6px", border: "1px solid rgba(0,255,70,0.25)" }}
    />
  );
}
