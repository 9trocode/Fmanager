import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #3f3f46 100%)",
          color: "#fafafa",
          fontSize: 120,
          fontStyle: "italic",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: -4,
        }}
      >
        ƒ
      </div>
    ),
    { ...size },
  );
}
