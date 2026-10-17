import { ImageResponse } from "next/og";

export const alt = "CarbonLens — Satellite evidence before claims";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f8f7f2",
          color: "#1c2923",
          display: "flex",
          height: "100%",
          justifyContent: "space-between",
          padding: "80px",
          width: "100%"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "760px" }}>
          <div style={{ color: "#285d44", fontSize: 28, fontWeight: 700, letterSpacing: "0.08em" }}>
            CARBONLENS · TESTNET DEMO
          </div>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.055em", lineHeight: 1.05, marginTop: 34 }}>
            Satellite evidence, made inspectable.
          </div>
          <div style={{ color: "#596960", fontSize: 28, lineHeight: 1.4, marginTop: 28 }}>
            Transparent vegetation signals. Clear limitations.
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            background: "#285d44",
            borderRadius: 32,
            color: "#ffffff",
            display: "flex",
            fontSize: 92,
            height: 180,
            justifyContent: "center",
            width: 180
          }}
        >
          C
        </div>
      </div>
    ),
    size
  );
}
