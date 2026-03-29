import type { PlasmoCSConfig } from "plasmo"
import { useState, useEffect, useRef } from "react"

export const config: PlasmoCSConfig = {
  matches: ["https://meet.google.com/*"]
}

// Helper function to turn a Blob into a Base64 string for Hume
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(',')[1]
      resolve(base64data)
    }
    reader.readAsDataURL(blob)
  })
}

export default function CandourCopilotOverlay() {
  const [trackMe, setTrackMe] = useState(true)
  const [trackThem, setTrackThem] = useState(true)
  const [myInsight, setMyInsight] = useState("Waiting for face...")
  const [theirInsight, setTheirInsight] = useState("Waiting for face...")

  const myWS = useRef<WebSocket | null>(null)
  const theirWS = useRef<WebSocket | null>(null)
  const scraperInterval = useRef<NodeJS.Timeout | null>(null)

  const apiKey = process.env.PLASMO_PUBLIC_HUME_API_KEY

  useEffect(() => {
    if (!apiKey) {
      setMyInsight("Error: Missing API Key")
      return
    }

    console.log("🚀 [Candour] Initializing Memory WebSockets...")

    myWS.current = new WebSocket(`wss://api.hume.ai/v0/stream/models?apiKey=${apiKey}`)
    myWS.current.onmessage = (e) => {
      const data = JSON.parse(e.data)
      const models = data.models || data
      const emotions = models?.face?.predictions?.[0]?.emotions

      if (emotions) {
        const top = emotions.sort((a: any, b: any) => b.score - a.score)[0]
        setMyInsight(`${top.name} (${Math.round(top.score * 100)}%)`)
      }
    }

    theirWS.current = new WebSocket(`wss://api.hume.ai/v0/stream/models?apiKey=${apiKey}`)
    theirWS.current.onmessage = (e) => {
      const data = JSON.parse(e.data)
      const models = data.models || data
      const emotions = models?.face?.predictions?.[0]?.emotions

      if (emotions) {
        const top = emotions.sort((a: any, b: any) => b.score - a.score)[0]
        setTheirInsight(`${top.name} (${Math.round(top.score * 100)}%)`)
      }
    }

    startScraping()

    return () => {
      myWS.current?.close()
      theirWS.current?.close()
      if (scraperInterval.current) clearInterval(scraperInterval.current)
    }
  }, [])

  const startScraping = () => {
    // 🔥 THE BYPASS: Create a canvas purely in memory, invisible to the DOM
    const offscreen = new OffscreenCanvas(320, 240)
    const ctx = offscreen.getContext("2d")

    // Make the interval callback async to handle the Blob conversion
    scraperInterval.current = setInterval(async () => {
      if (!ctx) return

      const allVideos = document.querySelectorAll("video")
      const activeVideos = Array.from(allVideos).filter(
        v => v.readyState === 4 && v.videoWidth > 0
      )

      if (activeVideos.length === 0) return

      // Heuristic: Find "Me" vs "Them"
      let myVideo = activeVideos.find(v => v.style.transform.includes("scaleX(-1)"))
      if (!myVideo) myVideo = activeVideos[activeVideos.length - 1]

      const theirVideo = activeVideos.find(v => v !== myVideo) || activeVideos[0]

      // Process "ME"
      if (trackMe && myWS.current?.readyState === WebSocket.OPEN && myVideo) {
        try {
          ctx.drawImage(myVideo, 0, 0, 320, 240)
          const blob = await offscreen.convertToBlob({ type: "image/jpeg", quality: 0.5 })
          const base64 = await blobToBase64(blob)
          myWS.current.send(JSON.stringify({ data: base64, models: { face: {} } }))
          console.log("📤 [Candour] Sent 'ME' frame from memory")
        } catch (err) {
          console.error("❌ [Candour] Failed to capture 'ME' frame:", err)
        }
      }

      // Process "THEM"
      if (trackThem && theirWS.current?.readyState === WebSocket.OPEN && theirVideo && theirVideo !== myVideo) {
        try {
          ctx.drawImage(theirVideo, 0, 0, 320, 240)
          const blob = await offscreen.convertToBlob({ type: "image/jpeg", quality: 0.5 })
          const base64 = await blobToBase64(blob)
          theirWS.current.send(JSON.stringify({ data: base64, models: { face: {} } }))
        } catch (err) {
          console.error("❌ [Candour] Failed to capture 'THEM' frame:", err)
        }
      }

    }, 2000)
  }

  return (
    <div style={{
      position: "fixed", top: "20px", right: "20px", zIndex: 999999,
      background: "rgba(20, 20, 20, 0.85)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255, 255, 255, 0.1)", padding: "20px",
      borderRadius: "16px", color: "white", fontFamily: "system-ui, sans-serif",
      width: "300px", boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fbbf24", letterSpacing: "0.5px" }}>Candour Copilot</h2>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} title="Live Connection" />
      </div>

      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px", marginBottom: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Their Vibe</span>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={trackThem} onChange={(e) => setTrackThem(e.target.checked)} style={{ marginRight: "6px", accentColor: "#fbbf24" }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>Track</span>
          </label>
        </div>
        <p style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: trackThem ? "#60a5fa" : "rgba(255,255,255,0.3)" }}>
          {trackThem ? theirInsight : "Tracking Paused"}
        </p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Your Vibe</span>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={trackMe} onChange={(e) => setTrackMe(e.target.checked)} style={{ marginRight: "6px", accentColor: "#fbbf24" }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>Track</span>
          </label>
        </div>
        <p style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: trackMe ? "#fbbf24" : "rgba(255,255,255,0.3)" }}>
          {trackMe ? myInsight : "Tracking Paused"}
        </p>
      </div>
    </div>
  )
}