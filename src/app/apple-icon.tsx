import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Cairn glyph — three stacked stones, scaled up for the 180×180
 * Apple touch icon. Same composition as /app/icon.svg.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #3f3f46 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox="0 0 180 180"
          width="180"
          height="180"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="90" cy="135" rx="51" ry="17" fill="#fafafa" />
          <ellipse cx="93" cy="104" rx="37" ry="15" fill="#fafafa" />
          <ellipse
            cx="90"
            cy="76"
            rx="24"
            ry="13"
            fill="#fafafa"
            transform="rotate(-6 90 76)"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
