import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo"
import { useState, useEffect, useRef } from "react"

export const config: PlasmoCSConfig = {
    matches: [
        "https://www.linkedin.com/*",
        "https://mail.google.com/*",
        "https://outlook.live.com/*",
        "https://outlook.office.com/*"
    ],
    all_frames: false
}

export const getInlineAnchor: PlasmoGetInlineAnchor = async () => ({
    element: document.body,
    insertPosition: "afterbegin"
})

const CANDOUR_API = "https://candour-sandy.vercel.app/api/chat"

type ToneResult = {
    theirTone: string
    yourTone: string
    suggestion: string
    rewrite: string
} | null

function getPlatform(): string {
    const host = window.location.hostname
    if (host.includes("linkedin")) return "LinkedIn DM"
    if (host.includes("gmail") || host.includes("google")) return "Gmail"
    if (host.includes("outlook")) return "Outlook"
    return "messaging platform"
}

function scrapeConversationContext(): string {
    const host = window.location.hostname
    const messages: string[] = []

    try {
        if (host.includes("linkedin")) {
            // Trying to find DM bubbles first (for Messaging tab)
            const dmBubbles = document.querySelectorAll(".msg-s-event-listitem__message-bubble");

            if (dmBubbles.length > 0) {
                dmBubbles.forEach((el) => {
                    const isMe = el.closest(".msg-s-message-list__event")?.classList.contains("msg-s-message-list__event--outgoing");
                    messages.push(`${isMe ? "Me" : "Them"}: ${el.textContent?.trim()}`);
                });
            }
            //  If no DMs, grab the Post text 
            else {
                // Find the specific post text closest to where you are typing
                const postContent = document.querySelector(".update-components-text span[dir='ltr']") ||
                    document.querySelector(".feed-shared-update-v2__description");

                if (postContent) {
                    messages.push(`The Post you are replying to: ${postContent.textContent?.trim()}`);
                }
            }

        } else if (host.includes("google") || host.includes("gmail")) {
            const messageEls = document.querySelectorAll(".ii.gt");
            messageEls.forEach((el) => {
                messages.push(`Email Body: ${el.textContent?.trim()?.slice(0, 300)}`);
            });

        } else if (host.includes("outlook")) {
            const messageEls = document.querySelectorAll("[class*='ReadingPane'] [class*='body']");
            messageEls.forEach((el) => {
                messages.push(`Email Body: ${el.textContent?.trim()?.slice(0, 300)}`);
            });
        }
    } catch (e) {
        console.error("[Candour] Context scrape failed:", e);
    }

    // Return the last 5 context points
    return messages.slice(-5).join("\n") || "No prior context found.";
}

function scrapeUserDraft(): string {
    try {
        // LinkedIn's comment box uses the 'ql-editor' class (Quill.js)
        const linkedInEditor = document.querySelector(".ql-editor") as HTMLElement;
        if (linkedInEditor && linkedInEditor.innerText.trim()) {
            return linkedInEditor.innerText.trim();
        }

        // LinkedIn's DM box fallback
        const dmBox = document.querySelector(".msg-form__contenteditable") as HTMLElement;
        if (dmBox && dmBox.innerText.trim()) {
            return dmBox.innerText.trim();
        }

        // Final fallback: Find ANY active contenteditable on the page
        const allEditable = document.querySelectorAll('[contenteditable="true"]');
        for (const el of Array.from(allEditable)) {
            const text = (el as HTMLElement).innerText.trim();
            if (text && !el.closest("#plasmo-shadow-container")) { // Don't scrape our own widget lol
                return text;
            }
        }
    } catch (e) {
        console.error("[Candour] Draft scrape failed:", e);
    }
    return "";
}

async function analyzeTone(
    platform: string,
    context: string,
    draft: string
): Promise<ToneResult> {
    const prompt = `You are a communication coach analyzing a message on ${platform}.

Conversation context (last few messages):
${context}

The user's current draft message:
"${draft}"

Respond ONLY with a JSON object in this exact format, no other text:
{
  "theirTone": "one sentence describing the tone of the last message from the other person",
  "yourTone": "one sentence describing the tone of the user's draft",
  "suggestion": "one sentence of specific advice on whether/how to adjust the tone",
  "rewrite": "an improved version of their draft that better fits the context, or the same message if it's already appropriate"
}`

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: "ANALYZE_TONE",
                payload: {
                    messages: [{ role: "user", content: prompt }],
                    systemPrompt: "You are a communication coach. Always respond with valid JSON only, no markdown, no explanation."
                }
            },
            (response) => {
                if (!response?.success) {
                    reject(new Error(response?.error || "Background fetch failed"))
                    return
                }
                const text = response.data.message?.replace(/```json|```/g, "").trim()
                try {
                    resolve(JSON.parse(text))
                } catch (e) {
                    reject(new Error("Failed to parse response"))
                }
            }
        )
    })
}

export default function ToneMirrorOverlay() {
    const [position, setPosition] = useState({ x: 20, y: 20 })
    const dragging = useRef(false)
    const offset = useRef({ x: 0, y: 0 })

    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<ToneResult>(null)
    const [error, setError] = useState("")
    const [draft, setDraft] = useState("")

    const platform = getPlatform()

    const onMouseDown = (e: React.MouseEvent) => {
        dragging.current = true
        offset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    }

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!dragging.current) return
            setPosition({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y })
        }
        const onMouseUp = () => { dragging.current = false }
        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mouseup", onMouseUp)
        return () => {
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
        }
    }, [position])

    async function handleAnalyze() {
        setIsLoading(true)
        setError("")
        setResult(null)

        const context = scrapeConversationContext()
        const currentDraft = scrapeUserDraft()
        setDraft(currentDraft)

        if (!currentDraft) {
            setError("No draft message found. Start typing your reply first.")
            setIsLoading(false)
            return
        }

        try {
            const result = await analyzeTone(platform, context, currentDraft)
            setResult(result)
        } catch (e) {
            setError("Analysis failed. Check your connection.")
            console.error(e)
        } finally {
            setIsLoading(false)
        }
    }

    function copyRewrite() {
        if (result?.rewrite) {
            navigator.clipboard.writeText(result.rewrite)
        }
    }

    return (
        <div
            style={{
                position: "fixed",
                top: `${position.y}px`,
                left: `${position.x}px`,
                zIndex: 2147483647,
                fontFamily: "system-ui, -apple-system, sans-serif",
            }}
        >
            {/* Collapsed pill */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    style={{
                        background: "rgba(20,20,20,0.92)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(251,191,36,0.4)",
                        borderRadius: "999px",
                        padding: "8px 16px",
                        color: "#fbbf24",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
                    }}
                >
                    ✦ Candour
                </button>
            )}

            {/* Expanded panel */}
            {isOpen && (
                <div
                    style={{
                        background: "rgba(20,20,20,0.95)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "16px",
                        padding: "20px",
                        width: "320px",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                        color: "white"
                    }}
                >
                    {/* Header */}
                    <div
                        onMouseDown={onMouseDown}
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "16px",
                            cursor: "grab"
                        }}
                    >
                        <div>
                            <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#fbbf24", letterSpacing: "1px", textTransform: "uppercase" }}>
                                ✦ Candour
                            </h2>
                            <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                                Tone Mirror · {platform}
                            </p>
                        </div>
                        <button
                            onClick={() => { setIsOpen(false); setResult(null); setError("") }}
                            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "18px" }}
                        >
                            ×
                        </button>
                    </div>

                    {/* Analyze button */}
                    <button
                        onClick={handleAnalyze}
                        disabled={isLoading}
                        style={{
                            width: "100%",
                            background: isLoading ? "rgba(251,191,36,0.3)" : "#fbbf24",
                            border: "none",
                            borderRadius: "10px",
                            padding: "12px",
                            color: "#000",
                            fontWeight: 700,
                            fontSize: "14px",
                            cursor: isLoading ? "not-allowed" : "pointer",
                            marginBottom: "16px",
                            transition: "background 0.2s"
                        }}
                    >
                        {isLoading ? "Analysing..." : "Analyse My Message"}
                    </button>

                    {/* Error */}
                    {error && (
                        <p style={{ color: "#ef4444", fontSize: "13px", margin: "0 0 12px" }}>
                            {error}
                        </p>
                    )}

                    {/* Results */}
                    {result && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

                            {/* Their tone */}
                            <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: "10px", padding: "12px" }}>
                                <p style={{ margin: "0 0 4px", fontSize: "10px", color: "rgba(96,165,250,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Their tone
                                </p>
                                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                                    {result.theirTone}
                                </p>
                            </div>

                            {/* Your tone */}
                            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: "10px", padding: "12px" }}>
                                <p style={{ margin: "0 0 4px", fontSize: "10px", color: "rgba(251,191,36,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Your draft tone
                                </p>
                                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                                    {result.yourTone}
                                </p>
                            </div>

                            {/* Suggestion */}
                            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "12px" }}>
                                <p style={{ margin: "0 0 4px", fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    Suggestion
                                </p>
                                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
                                    {result.suggestion}
                                </p>
                            </div>

                            {/* Rewrite */}
                            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "10px", padding: "12px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                    <p style={{ margin: 0, fontSize: "10px", color: "rgba(16,185,129,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                        Suggested rewrite
                                    </p>
                                    <button
                                        onClick={copyRewrite}
                                        style={{ background: "rgba(16,185,129,0.2)", border: "none", borderRadius: "6px", padding: "3px 8px", color: "#10b981", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}
                                    >
                                        Copy
                                    </button>
                                </div>
                                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: 1.5, fontStyle: "italic" }}>
                                    "{result.rewrite}"
                                </p>
                            </div>

                            <p style={{ margin: 0, fontSize: "10px", color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
                                No messages stored or recorded.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}