import type { PlasmoCSConfig } from "plasmo"
import { useState, useEffect, useRef } from "react"

export const config: PlasmoCSConfig = {
  matches: ["https://meet.google.com/*"]
}

// Convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(",")[1]
      resolve(base64data)
    }
    reader.readAsDataURL(blob)
  })
}

export default function CandourCopilotOverlay() {
  // Drag state
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  // Tracking toggles
  const [trackMe, setTrackMe] = useState(true)
  const [trackThem, setTrackThem] = useState(true)

  // Prevent stale closure in interval
  const trackMeRef = useRef(trackMe)
  const trackThemRef = useRef(trackThem)

  useEffect(() => {
    trackMeRef.current = trackMe
  }, [trackMe])

  useEffect(() => {
    trackThemRef.current = trackThem
  }, [trackThem])

  // Insights
  const [myInsight, setMyInsight] = useState("Waiting for face...")
  const [theirInsight, setTheirInsight] = useState("Waiting for face...")

  // WebSockets
  const myWS = useRef<WebSocket | null>(null)
  const theirWS = useRef<WebSocket | null>(null)
  const scraperInterval = useRef<NodeJS.Timeout | null>(null)

  const apiKey = process.env.PLASMO_PUBLIC_HUME_API_KEY

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    offset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPosition({
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y
      })
    }

    const onMouseUp = () => {
      dragging.current = false
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [position])

  // Frame processor
  const processFrame = async (
    video: HTMLVideoElement,
    canvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
    ws: WebSocket | null
  ) => {
    try {
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      ctx.drawImage(video, 0, 0, 320, 240)

      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.5
      })

      const base64 = await blobToBase64(blob)

      ws.send(
        JSON.stringify({
          data: base64,
          models: { face: {} }
        })
      )
    } catch (err) {
      console.error("Frame processing failed:", err)
    }
  }

  // Scraper
  const startScraping = () => {
    const myCanvas = new OffscreenCanvas(320, 240)
    const theirCanvas = new OffscreenCanvas(320, 240)

    const myCtx = myCanvas.getContext("2d")
    const theirCtx = theirCanvas.getContext("2d")

    scraperInterval.current = setInterval(() => {
      if (document.hidden) return
      if (!myCtx || !theirCtx) return

      const allVideos = Array.from(document.querySelectorAll("video"))

      const activeVideos = allVideos.filter(
        (v) =>
          v.readyState === 4 &&
          v.videoWidth > 100 &&
          v.videoHeight > 100
      )

      if (activeVideos.length === 0) return

      let myVideo = activeVideos.find((v) =>
        v.style.transform.includes("scaleX(-1)")
      )

      if (!myVideo) {
        myVideo = activeVideos[activeVideos.length - 1]
      }

      const otherVideos = activeVideos.filter((v) => v !== myVideo)
      let theirVideo: HTMLVideoElement | undefined = undefined

      if (otherVideos.length > 0) {
        theirVideo = otherVideos.reduce((largest, current) => {
          const largestArea = largest.videoWidth * largest.videoHeight
          const currentArea = current.videoWidth * current.videoHeight
          return currentArea > largestArea ? current : largest
        })
      }

      if (trackMeRef.current && myWS.current?.readyState === WebSocket.OPEN && myVideo) {
        processFrame(myVideo, myCanvas, myCtx, myWS.current)
      }

      if (trackThemRef.current && theirWS.current?.readyState === WebSocket.OPEN && theirVideo && theirVideo !== myVideo) {
        processFrame(theirVideo, theirCanvas, theirCtx, theirWS.current)
      }
    }, 1000) // 1 second interval for snappier updates
  }

  // WebSocket setup
  useEffect(() => {
    if (!apiKey) {
      setMyInsight("Error: Missing API Key")
      return
    }

    myWS.current = new WebSocket(`wss://api.hume.ai/v0/stream/models?apiKey=${apiKey}`)
    myWS.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const models = data.models || data
        const emotions = models?.face?.predictions?.[0]?.emotions
        if (emotions) {
          const top = emotions.sort((a: any, b: any) => b.score - a.score)[0]
          setMyInsight(`${top.name} (${Math.round(top.score * 100)}%)`)
        }
      } catch (err) { console.error("Error parsing MY stream:", err) }
    }

    theirWS.current = new WebSocket(`wss://api.hume.ai/v0/stream/models?apiKey=${apiKey}`)
    theirWS.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const models = data.models || data
        const emotions = models?.face?.predictions?.[0]?.emotions
        if (emotions) {
          const top = emotions.sort((a: any, b: any) => b.score - a.score)[0]
          setTheirInsight(`${top.name} (${Math.round(top.score * 100)}%)`)
        }
      } catch (err) { console.error("Error parsing THEIR stream:", err) }
    }

    startScraping()

    return () => {
      if (scraperInterval.current) clearInterval(scraperInterval.current)
      myWS.current?.close()
      theirWS.current?.close()
    }
  }, [])

  return (
    <div
      style={{
        position: "fixed",
        top: `${position.y}px`,
        left: `${position.x}px`,
        zIndex: 2147483647,
        background: "rgba(20, 20, 20, 0.9)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        padding: "20px",
        borderRadius: "16px",
        color: "white",
        fontFamily: "system-ui, -apple-system, sans-serif",
        width: "300px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        userSelect: "none"
      }}
    >
      {/* Header / Drag Handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          cursor: "grab"
        }}
      >
        <h2 style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: 800,
          color: "#fbbf24",
          textTransform: "uppercase",
          letterSpacing: "1px"
        }}>
          Candour Copilot
        </h2>
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "#10b981",
          boxShadow: "0 0 8px #10b981"
        }} />
      </div>

      {/* Their Vibe Card */}
      <VibeCard
        label="Their Vibe"
        insight={theirInsight}
        active={trackThem}
        onToggle={() => setTrackThem(!trackThem)}
        color="#60a5fa"
      />

      {/* Your Vibe Card */}
      <VibeCard
        label="Your Vibe"
        insight={myInsight}
        active={trackMe}
        onToggle={() => setTrackMe(!trackMe)}
        color="#fbbf24"
      />

      <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "12px" }}>
        <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          Multimodal analysis active. No data is stored.
        </p>
      </div>
    </div>
  )
}

function VibeCard({ label, insight, active, onToggle, color }: any) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      borderRadius: "12px",
      padding: "14px",
      marginBottom: "10px",
      border: "1px solid rgba(255,255,255,0.05)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase" }}>
          {label}
        </span>
        <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={active}
            onChange={onToggle}
            style={{ marginRight: "6px", accentColor: color }}
          />
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>Track</span>
        </label>
      </div>
      <p style={{
        margin: 0,
        fontSize: "15px",
        fontWeight: 600,
        color: active ? color : "rgba(255,255,255,0.25)",
        transition: "color 0.2s"
      }}>
        {active ? insight : "Tracking Paused"}
      </p>
    </div>
  )
}