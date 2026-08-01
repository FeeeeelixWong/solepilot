import { ImageResponse } from "next/og";

export const alt = "SolePilot governed autonomy for one-person companies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        background: "#0b1712",
        color: "#f0f7f3",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #315244",
              borderRadius: 8,
              background: "#10261d",
              color: "#6ed7a8",
              fontSize: 27,
              fontWeight: 800,
            }}
          >
            SP
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <strong style={{ fontSize: 26 }}>SolePilot</strong>
            <span style={{ color: "#9eafa7", fontSize: 15 }}>Owner control plane</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 72 }}>
          <span
            style={{
              color: "#6ed7a8",
              fontFamily: "monospace",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            VERIFIABLE AUTHORITY FOR AI AGENTS
          </span>
          <div
            style={{
              display: "flex",
              maxWidth: 940,
              marginTop: 20,
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.04,
            }}
          >
            Let agents operate. Never let them grant themselves authority.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: 26,
            borderTop: "1px solid #294038",
            color: "#aab9b2",
            fontSize: 16,
          }}
        >
          <span>Policy before tool invocation</span>
          <span>Action-bound approval</span>
          <span>Hash-linked receipts</span>
        </div>
      </div>
    </div>,
    size,
  );
}
