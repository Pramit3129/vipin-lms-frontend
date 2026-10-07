"use client"

import type Artplayer from "artplayer"
import type Hls from "hls.js"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { errMsg } from "@/components/app-shell"
import { getVideoStream, saveVideoProgress } from "@/lib/api"

const SAVE_EVERY_MS = 15_000
const REFRESH_BEFORE_MS = 90_000 // re-sign the stream this long before the URL expires

const PREV_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`
const NEXT_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>`

// The server bakes the resume point into the manifest as `start`; we pass it to hls.js instead,
// so a mid-play URL refresh never jumps back to it.
function stripStart(url: string) {
  const u = new URL(url)
  u.searchParams.delete("start")
  return u.toString()
}

/**
 * HLS player (ArtPlayer + hls.js) for one lesson video at a time. Keeps a single player instance
 * across videos so fullscreen survives "next". Resumes where the user stopped, saves progress,
 * and re-signs the stream before its 15-minute URL expires.
 */
export function VideoPlayer({
  videoId,
  title,
  onEnded,
  onPrev,
  onNext,
  overlay,
}: {
  videoId: string
  title: string
  onEnded: () => void
  onPrev?: () => void
  onNext?: () => void
  /** Rendered inside the player (visible in fullscreen too), e.g. an "Up next" card. */
  overlay?: React.ReactNode
}) {
  const container = useRef<HTMLDivElement>(null)
  const art = useRef<Artplayer | null>(null)
  const start = useRef(0) // where the next load should begin
  const ended = useRef(false)
  const refresh = useRef<(() => void) | null>(null)
  const cb = useRef({ onEnded, onPrev, onNext })
  const [layer, setLayer] = useState<HTMLElement | null>(null)
  // Keyed by video so switching videos clears it without a reset effect.
  const [failure, setFailure] = useState<{ videoId: string; message: string } | null>(null)
  const error = failure?.videoId === videoId ? failure.message : null

  useEffect(() => {
    cb.current = { onEnded, onPrev, onNext }
    const a = art.current
    if (a?.controls.prev) a.controls.prev.style.display = onPrev ? "" : "none"
    if (a?.controls.next) a.controls.next.style.display = onNext ? "" : "none"
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastSaved = 0
    let lastRefresh = 0
    let detach = () => {}
    ended.current = false

    const save = (keepalive = false) => {
      const a = art.current
      if (!a || ended.current) return
      const t = a.currentTime
      if (t < 1) return // not started (or resume seek not applied yet): keep the saved position
      // Finished (or nearly): the next visit should start over.
      const pos = a.duration && t >= a.duration - 3 ? 0 : t
      lastSaved = Date.now()
      saveVideoProgress(videoId, pos, keepalive).catch(() => {})
    }

    const handlers: Record<string, () => void> = {
      "video:timeupdate": () => {
        if (art.current?.playing && Date.now() - lastSaved > SAVE_EVERY_MS) save()
      },
      "video:pause": () => save(),
      "video:play": () => (ended.current = false),
      "video:ended": () => {
        ended.current = true
        saveVideoProgress(videoId, 0).catch(() => {})
        cb.current.onEnded()
      },
    }

    const schedule = (expiresAt: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => refresh.current?.(), Math.max(5_000, Date.parse(expiresAt) - Date.now() - REFRESH_BEFORE_MS))
    }

    // New signature, same position: switchQuality keeps time and play state.
    refresh.current = async () => {
      if (Date.now() - lastRefresh < 10_000) return
      lastRefresh = Date.now()
      try {
        const s = await getVideoStream(videoId)
        const a = art.current
        if (cancelled || !a) return
        start.current = a.currentTime
        await a.switchQuality(stripStart(s.manifestUrl))
        schedule(s.expiresAt)
      } catch (e) {
        if (!cancelled) setFailure({ videoId, message: errMsg(e) })
      }
    }

    ;(async () => {
      try {
        const s = await getVideoStream(videoId)
        if (cancelled) return
        start.current = s.resumeAt
        const url = stripStart(s.manifestUrl)
        if (art.current) {
          await art.current.switchUrl(url)
          art.current.play().catch(() => {})
        } else {
          const a = await create(url)
          if (cancelled) return a.destroy(false)
          art.current = a
          setLayer(a.layers.overlay ?? null)
        }
        if (cancelled) return
        schedule(s.expiresAt)

        // Our listeners are per video; ArtPlayer's own must stay, so remove only these.
        const a = art.current!
        for (const [name, fn] of Object.entries(handlers)) a.on(name, fn)
        detach = () => {
          for (const [name, fn] of Object.entries(handlers)) a.off(name, fn)
        }
      } catch (e) {
        if (!cancelled) setFailure({ videoId, message: errMsg(e) })
      }
    })()

    const onHide = () => save(true)
    window.addEventListener("pagehide", onHide)
    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener("pagehide", onHide)
      save(true) // leaving this video: remember where we were
      detach()
    }

    async function create(url: string) {
      const [{ default: ArtplayerCtor }, { default: HlsCtor }, { default: hlsControl }] = await Promise.all([
        import("artplayer"),
        import("hls.js"),
        import("artplayer-plugin-hls-control"),
      ])
      return new ArtplayerCtor({
        container: container.current!,
        url,
        type: "m3u8",
        autoplay: true,
        theme: "#b8dd73", // --secondary (brand lime): reads on the black stage
        volume: 0.8,
        setting: true,
        playbackRate: true,
        aspectRatio: false,
        hotkey: true,
        pip: true,
        fullscreen: true,
        fullscreenWeb: false,
        miniProgressBar: true,
        mutex: true,
        playsInline: true,
        autoOrientation: true,
        fastForward: true,
        lock: true,
        moreVideoAttr: { preload: "auto" },
        plugins: [
          hlsControl({
            quality: { control: true, setting: true, getName: (l) => `${(l as { height: number }).height}p`, title: "Quality", auto: "Auto" },
          }),
        ],
        controls: [
          { name: "prev", position: "left", index: 5, html: PREV_ICON, tooltip: "Previous lecture", click: () => cb.current.onPrev?.() },
          { name: "next", position: "left", index: 15, html: NEXT_ICON, tooltip: "Next lecture", click: () => cb.current.onNext?.() },
        ],
        layers: [{ name: "overlay", html: "", style: { position: "absolute", inset: "0", pointerEvents: "none" } }],
        customType: {
          m3u8(video: HTMLVideoElement, src: string, a: Artplayer) {
            const old = a.hls as Hls | undefined
            old?.destroy()
            if (HlsCtor.isSupported()) {
              const hls = new HlsCtor({ startPosition: start.current || -1 })
              hls.on(HlsCtor.Events.ERROR, (_, data) => {
                if (!data.fatal) return
                // A 403 here almost always means the signed URLs expired: re-sign and carry on.
                if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) refresh.current?.()
                else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
                else a.notice.show = "Playback error. Try reloading the page."
              })
              hls.loadSource(src)
              hls.attachMedia(video)
              a.hls = hls
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
              video.src = src // Safari plays HLS natively
              const at = start.current
              if (at > 0) video.addEventListener("loadedmetadata", () => (video.currentTime = at), { once: true })
            } else {
              a.notice.show = "This browser cannot play HLS video."
            }
          },
        },
      })
    }
  }, [videoId])

  // Destroy once, on unmount (declared after the effect above so its final save runs first).
  useEffect(
    () => () => {
      ;(art.current?.hls as Hls | undefined)?.destroy()
      art.current?.destroy(false)
      art.current = null
    },
    []
  )

  return (
    <div className="relative size-full bg-black" aria-label={`Video player: ${title}`} role="region">
      <div ref={container} className="size-full" />
      {layer && overlay && createPortal(<div className="pointer-events-auto absolute inset-0">{overlay}</div>, layer)}
      {error && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 p-6 text-center text-white">
          <p className="text-base font-semibold">This video can&apos;t be played right now.</p>
          <p className="max-w-md text-sm text-white/70">{error}</p>
        </div>
      )}
    </div>
  )
}
