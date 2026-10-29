"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./paint-studio.css";
import { paintViewport, videoPoint } from "@/lib/paint-policy";
import {
  initialPaintConnection,
  localNetworkPermission,
  paintConnectionReducer,
  PAINT_STREAM_FAILURE,
} from "@/lib/paint-connection";

type Backup = {
  id: string;
  profile: string;
  title: string;
  created_at: string;
};
type Field = {
  id: string;
  label: string;
  type: string;
  value: string;
  options?: { value: string; label: string }[];
  accept?: string;
};
type Control = {
  id: string;
  label: string;
  kind: string;
  inputType?: string;
  value?: string;
  checked?: boolean;
  options?: { value: string; label: string }[];
};
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(body?: unknown) {
  const r = await fetch("/api/paint-studio", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Session unavailable");
  return d;
}
async function iceReady(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 7000);
    function done() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}
export default function PaintStudio() {
  const video = useRef<HTMLVideoElement>(null),
    stage = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null),
    channel = useRef<RTCDataChannel | null>(null),
    session = useRef<string | null>(null);
  const pollBusy = useRef(false),
    closing = useRef(false),
    attempt = useRef(0),
    connectBusy = useRef(false),
    connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    incoming = useRef<{
      name: string;
      size: number;
      hash: string;
      chunks: ArrayBuffer[];
      received: number;
    } | null>(null);
  const uploadTarget = useRef<string | null>(null),
    currentProfile = useRef<string | null>(null),
    controls = useRef<Control[]>([]),
    pointers = useRef(new Set<number>());
  const [expanded, setExpanded] = useState(false),
    [showControls, setShowControls] = useState(false);
  const [online, setOnline] = useState(false),
    [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [connection, dispatchConnection] = useReducer(
    paintConnectionReducer,
    initialPaintConnection,
  );
  const status = connection.message;
  const [backups, setBackups] = useState<Backup[]>([]);
  const [field, setField] = useState<Field | null>(null),
    [restoreId, setRestoreId] = useState<string | null>(null),
    [uploadRequest, setUploadRequest] = useState(false),
    [value, setValue] = useState(""),
    [tools, setTools] = useState<Control[]>([]);
  const [detail, setDetail] = useState(""),
    [download, setDownload] = useState<{ url: string; name: string } | null>(
      null,
    );
  const [networkPermission, setNetworkPermission] =
    useState<string>("unchecked");
  const [connectionCheck, setConnectionCheck] = useState("");
  const send = useCallback((message: unknown) => {
    if (channel.current?.readyState === "open")
      channel.current.send(JSON.stringify(message));
  }, []);
  const disconnect = useCallback(
    async (message = "Disconnected. Your saved artwork remains on the PC.") => {
      closing.current = true;
      const generation = ++attempt.current;
      connectBusy.current = false;
      if (connectionTimer.current) clearTimeout(connectionTimer.current);
      connectionTimer.current = null;
      const id = session.current;
      session.current = null;
      const previousChannel = channel.current,
        previousPeer = pc.current;
      channel.current = null;
      pc.current = null;
      previousChannel?.close();
      previousPeer?.close();
      if (video.current) video.current.srcObject = null;
      setConnected(false);
      pointers.current.clear();
      setConnecting(false);
      setField(null);
      setRestoreId(null);
      setUploadRequest(false);
      uploadTarget.current = null;
      setTools([]);
      incoming.current = null;
      dispatchConnection({ type: "stop", message });
      if (id)
        try {
          await api({ action: "disconnect", id });
        } catch {}
      if (attempt.current === generation) closing.current = false;
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (pollBusy.current) return;
    pollBusy.current = true;
    const generation = attempt.current,
      id = session.current;
    try {
      const d = await api();
      if (generation !== attempt.current || id !== session.current) return;
      setOnline(d.online);
      setBackups(d.backups);
      if (!id) dispatchConnection({ type: "availability", online: d.online });
      else if (
        !d.session ||
        d.session.id !== session.current ||
        d.session.closed ||
        Date.parse(d.session.expires_at) < Date.now()
      )
        await disconnect(
          "This session ended or was opened in another tab. Connect again.",
        );
      else {
        if (d.session.answer && pc.current && !pc.current.remoteDescription) {
          await pc.current.setRemoteDescription(d.session.answer);
          dispatchConnection({
            type: "progress",
            message: "PC answered. Establishing the encrypted video stream…",
          });
        }
        if (generation === attempt.current && id === session.current)
          await api({ action: "heartbeat", id });
      }
    } catch (e) {
      if (generation === attempt.current)
        await disconnect(
          e instanceof Error ? e.message : "Connection unavailable",
        );
    } finally {
      pollBusy.current = false;
    }
  }, [disconnect]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      clearInterval(timer);
      ++attempt.current;
      if (connectionTimer.current) clearTimeout(connectionTimer.current);
      const id = session.current;
      const previousChannel = channel.current,
        previousPeer = pc.current;
      channel.current = null;
      pc.current = null;
      session.current = null;
      previousChannel?.close();
      previousPeer?.close();
      if (id)
        fetch("/api/paint-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "disconnect", id }),
          keepalive: true,
        }).catch(() => {});
    };
  }, [refresh]);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const dimensions = () =>
    paintViewport(
      viewport.current?.clientWidth || 1280,
      viewport.current?.clientHeight || 720,
    );
  const cancelPointers = useCallback(() => {
    if (!pointers.current.size) return;
    pointers.current.clear();
    send({ type: "cancel-pointers" });
  }, [send]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  // Keep phone keyboard dialogs inside the visible viewport without resizing
  // the remote canvas (which would move the artwork under the active finger).
  useEffect(() => {
    const visible = window.visualViewport;
    const update = () => {
      stage.current?.style.setProperty(
        "--paint-keyboard-top",
        `${visible?.offsetTop || 0}px`,
      );
      stage.current?.style.setProperty(
        "--paint-keyboard-height",
        `${visible?.height || window.innerHeight}px`,
      );
    };
    update();
    visible?.addEventListener("resize", update);
    visible?.addEventListener("scroll", update);
    return () => {
      visible?.removeEventListener("resize", update);
      visible?.removeEventListener("scroll", update);
    };
  }, []);
  const receive = async (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      const f = incoming.current;
      if (
        !f ||
        event.data.byteLength > 16384 ||
        f.received + event.data.byteLength > f.size
      ) {
        incoming.current = null;
        return;
      }
      f.chunks.push(event.data);
      f.received += event.data.byteLength;
      return;
    }
    if (typeof event.data !== "string" || event.data.length > 100000) return;
    let m;
    try {
      m = JSON.parse(event.data);
    } catch {
      return;
    }
    if (m.type === "status") {
      if (["camaro", "mustang", "camry"].includes(m.profile)) {
        if (currentProfile.current && currentProfile.current !== m.profile) {
          setDownload(null);
          incoming.current = null;
        }
        currentProfile.current = m.profile;
      }
      setDetail(String(m.text).slice(0, 300));
    }
    if (m.type === "field" && typeof m.id === "string") {
      setField({ ...m, type: m.inputType || "text" });
      setValue(String(m.value ?? ""));
    }
    if (m.type === "controls" && Array.isArray(m.items)) {
      controls.current = m.items;
      setTools(m.items);
    }
    if (m.type === "upload-request" && typeof m.id === "string") {
      uploadTarget.current = m.id;
      if (file.current) {
        file.current.accept =
          m.accept || ".png,.jpg,.jpeg,.webp,.svg,.tga,.json";
        file.current.value = "";
        setUploadRequest(true);
      }
    }
    if (
      m.type === "file-start" &&
      /^car_(?:num_|spec_)?[0-9]+\.tga$/.test(m.name) &&
      Number.isInteger(m.size) &&
      m.size > 18 &&
      m.size <= 20 * 1024 * 1024 &&
      /^[a-f0-9]{64}$/.test(m.hash)
    ) {
      incoming.current = { ...m, chunks: [], received: 0 };
      setDetail("Receiving your TGA…");
    }
    if (m.type === "file-end") {
      const f = incoming.current;
      incoming.current = null;
      if (!f || f.received !== f.size) {
        setDetail("TGA transfer was interrupted. Export again.");
        return;
      }
      const blob = new Blob(f.chunks, { type: "image/x-tga" });
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
        ),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== f.hash) {
        setDetail("TGA verification failed. Export again.");
        return;
      }
      setDownload({ url: URL.createObjectURL(blob), name: f.name });
      setDetail("TGA received and verified. Tap Download TGA to save it.");
    }
    if (m.type === "backup-complete") {
      setDetail("Cloud recovery copy saved.");
      void refresh();
    }
  };
  const connect = async () => {
    if (connectBusy.current || pc.current) return;
    connectBusy.current = true;
    closing.current = false;
    const generation = ++attempt.current;
    try {
      setDownload(null);
      currentProfile.current = null;
      setDetail("");
      setConnectionCheck("");
      setConnecting(true);
      dispatchConnection({ type: "start" });
      const permission = await localNetworkPermission(navigator.permissions);
      if (generation !== attempt.current) return;
      setNetworkPermission(permission);
      if (permission === "denied") {
        await disconnect(
          "Chrome has blocked local-network access. Allow it in this site's permissions, then connect again.",
        );
        return;
      }
      const peer = new RTCPeerConnection(ICE);
      pc.current = peer;
      const current = () =>
        pc.current === peer && generation === attempt.current;
      const diagnose = async () => {
        // Only aggregate connectivity information; no IPs, SDP or credentials.
        const ice = peer.iceConnectionState,
          transport = peer.connectionState;
        let requests = 0,
          responses = 0;
        try {
          for (const item of (await peer.getStats()).values()) {
            if (item.type === "candidate-pair") {
              requests += item.requestsSent || 0;
              responses += item.responsesReceived || 0;
            }
          }
        } catch {}
        if (current())
          setConnectionCheck(
            `Network: ${ice} · Stream: ${transport} · Checks: ${requests} sent / ${responses} answered`,
          );
      };
      connectionTimer.current = setTimeout(() => {
        if (current() && channel.current?.readyState !== "open")
          void (async () => {
            await diagnose();
            if (current())
              await disconnect(
                peer.remoteDescription
                  ? PAINT_STREAM_FAILURE
                  : "The PC did not answer in time. Keep Paint Studio Host running and tap Connect to studio to retry.",
              );
          })();
      }, 45000);
      peer.addTransceiver("video", { direction: "recvonly" });
      const dc = peer.createDataChannel("paint-control", { ordered: true });
      channel.current = dc;
      dc.binaryType = "arraybuffer";
      dc.onmessage = receive;
      dc.onopen = () => {
        if (!current()) return;
        connectBusy.current = false;
        if (connectionTimer.current) clearTimeout(connectionTimer.current);
        connectionTimer.current = null;
        setConnected(true);
        setConnecting(false);
        dispatchConnection({ type: "connected" });
        send({ type: "resize", ...dimensions() });
      };
      dc.onclose = () => {
        if (current() && !closing.current)
          void (async () => {
            await diagnose();
            if (current())
              await disconnect(
                peer.connectionState === "failed" || connectBusy.current
                  ? PAINT_STREAM_FAILURE
                  : "The workstation ended the stream. Connect again to continue.",
              );
          })();
      };
      peer.ontrack = (e) => {
        if (current() && video.current) {
          video.current.srcObject = new MediaStream([e.track]);
          void video.current.play().catch(() => {});
        }
      };
      peer.onconnectionstatechange = () => {
        if (
          ["failed", "closed"].includes(peer.connectionState) &&
          current() &&
          !closing.current
        )
          void (async () => {
            await diagnose();
            if (current())
              await disconnect(
                peer.remoteDescription
                  ? PAINT_STREAM_FAILURE
                  : "Connection lost before the PC answered. Tap Connect to studio to retry.",
              );
          })();
      };
      await peer.setLocalDescription(await peer.createOffer());
      await iceReady(peer);
      if (!current()) return;
      dispatchConnection({ type: "progress", message: "Contacting your PC…" });
      const result = await api({
        action: "connect",
        offer: peer.localDescription?.toJSON(),
      });
      if (!current()) {
        void api({ action: "disconnect", id: result.id }).catch(() => {});
        return;
      }
      session.current = result.id;
      void refresh();
    } catch (e) {
      if (generation === attempt.current)
        await disconnect(e instanceof Error ? e.message : "Could not connect.");
    }
  };
  useEffect(() => {
    if (!connected) return;
    let timer: ReturnType<typeof setTimeout>;
    let previous = "";
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (field || uploadRequest) return;
        const size = dimensions(),
          key = `${size.width}/${size.height}`;
        if (key === previous) return;
        previous = key;
        cancelPointers();
        send({ type: "resize", ...size });
      }, 250);
    };
    const observer = new ResizeObserver(resize);
    if (viewport.current) observer.observe(viewport.current);
    window.addEventListener("blur", cancelPointers);
    const hidden = () => {
      if (document.hidden) cancelPointers();
    };
    document.addEventListener("visibilitychange", hidden);
    const player = video.current;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    player?.addEventListener("wheel", preventScroll, { passive: false });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("blur", cancelPointers);
      document.removeEventListener("visibilitychange", hidden);
      player?.removeEventListener("wheel", preventScroll);
    };
  }, [connected, send, cancelPointers, field, uploadRequest]);
  function pointer(e: React.PointerEvent<HTMLVideoElement>, phase: string) {
    if (!connected || !video.current) return;
    e.preventDefault();
    const r = video.current.getBoundingClientRect();
    const point = videoPoint(
      r,
      video.current.videoWidth || r.width,
      video.current.videoHeight || r.height,
      e.clientX,
      e.clientY,
    );
    if (phase === "down" && !point.inside) return;
    if (phase === "down") {
      video.current.focus({ preventScroll: true });
      video.current.setPointerCapture(e.pointerId);
      pointers.current.add(e.pointerId);
    }
    if (
      phase !== "down" &&
      e.pointerType !== "mouse" &&
      !pointers.current.has(e.pointerId)
    )
      return;
    if (phase === "up" || phase === "cancel")
      pointers.current.delete(e.pointerId);
    send({
      type: "pointer",
      phase,
      x: point.x,
      y: point.y,
      button: e.button,
      buttons: e.buttons,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      pressure: e.pressure,
    });
  }
  async function upload(f: File) {
    setUploadRequest(false);
    const id = uploadTarget.current;
    uploadTarget.current = null;
    if (!id) return;
    if (f.size > 80 * 1024 * 1024) {
      send({ type: "upload-cancel", id });
      setDetail("Use a file smaller than 80 MB.");
      return;
    }
    const dc = channel.current;
    if (!dc || dc.readyState !== "open") return;
    send({
      type: "upload-start",
      id,
      name: f.name,
      size: f.size,
      mime: f.type,
    });
    setDetail("Uploading artwork to your PC…");
    try {
      for (let offset = 0; offset < f.size; offset += 16384) {
        while (dc.bufferedAmount > 256 * 1024) {
          if (dc.readyState !== "open") throw Error();
          await pause(25);
        }
        dc.send(await f.slice(offset, offset + 16384).arrayBuffer());
      }
      send({ type: "upload-end" });
      setDetail("Artwork sent.");
    } catch {
      send({ type: "upload-cancel", id });
      setDetail("Upload interrupted. Import the file again.");
    }
  }
  const controlAction = (control: Control) => {
    if (control.kind === "select" || control.kind === "field") {
      setField({
        id: control.id,
        label: control.label,
        type:
          control.kind === "select" ? "select" : control.inputType || "text",
        value: control.value ?? "",
        options: control.options,
      });
      setValue(control.value ?? "");
    } else send({ type: "control", id: control.id });
  };
  return (
    <section className="paint-pilot">
      <div className="paint-heading">
        <div>
          <span className="paint-eyebrow">YOUR PRIVATE WORKSHOP</span>
          <h1>Paint Studio</h1>
          <p>Camaro · Mustang · Camry / NASCAR Next Gen</p>
        </div>
        <span className="paint-badge">Owner access only</span>
      </div>
      <div className="paint-toolbar">
        <span className={online ? "paint-online" : "paint-offline"}>
          {online ? "PC online" : "PC offline"}
        </span>
        <button
          className="button"
          disabled={!online || connecting || connected}
          onClick={connect}
        >
          {connecting ? "Connecting…" : "Connect to studio"}
        </button>
        <button
          className="button secondary"
          disabled={!connected && !connecting}
          onClick={() => void disconnect()}
        >
          Disconnect
        </button>
        <button
          className="button secondary"
          disabled={!connected}
          onClick={() => send({ type: "backup" })}
        >
          Save cloud copy
        </button>
        <button
          className="button secondary"
          disabled={!connected}
          onClick={() => {
            cancelPointers();
            setExpanded(true);
          }}
        >
          Expand editor
        </button>
      </div>
      <p role="status" className="paint-status">
        {status}
      </p>
      {connection.phase === "stopped" &&
        (status === PAINT_STREAM_FAILURE || networkPermission === "denied") && (
          <div className="paint-connection-help">
            <strong>Connection help for your phone</strong>
            <p>
              Open this page directly in Chrome. In the site permissions beside
              the address, allow Local network access if it is listed. Keep the
              phone and PC on the same home network, then tap Connect to studio.
            </p>
            <p>
              If this still fails, the connection details below help identify
              whether this network needs a secure relay.
            </p>
            {connectionCheck && <small>{connectionCheck}</small>}
            <small>
              Local network permission:{" "}
              {networkPermission === "unsupported"
                ? "not reported by this browser"
                : networkPermission}
            </small>
          </div>
        )}
      <div
        className={`paint-stage${expanded ? " paint-expanded" : ""}`}
        ref={stage}
      >
        {connected && (
          <div className="paint-stage-toolbar">
            <button
              type="button"
              aria-expanded={showControls}
              onClick={() => setShowControls(!showControls)}
            >
              Tools
            </button>
            <button type="button" onClick={() => send({ type: "backup" })}>
              Save
            </button>
            {download && (
              <a href={download.url} download={download.name}>
                Download TGA
              </a>
            )}
            <button
              type="button"
              className="paint-expand-toggle"
              aria-label={expanded ? "Close expanded view" : "Expand editor"}
              onClick={() => {
                cancelPointers();
                setExpanded(!expanded);
              }}
            >
              {expanded ? "Close" : "Expand"}
            </button>
          </div>
        )}
        <div className="paint-video-slot" ref={viewport}>
          <video
            ref={video}
            className={connected ? "" : "paint-video-idle"}
            autoPlay
            playsInline
            muted
            aria-label="Private Paint Studio stream"
            tabIndex={0}
            onPointerDown={(e) => pointer(e, "down")}
            onPointerMove={(e) => pointer(e, "move")}
            onPointerUp={(e) => pointer(e, "up")}
            onPointerCancel={(e) => pointer(e, "cancel")}
            onLostPointerCapture={(e) => {
              if (pointers.current.has(e.pointerId)) pointer(e, "cancel");
            }}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const point = videoPoint(
                r,
                e.currentTarget.videoWidth || r.width,
                e.currentTarget.videoHeight || r.height,
                e.clientX,
                e.clientY,
              );
              if (connected && point.inside)
                send({
                  type: "wheel",
                  deltaX: e.deltaX,
                  deltaY: e.deltaY,
                  x: point.x,
                  y: point.y,
                });
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && expanded) {
                setExpanded(false);
                return;
              }
              e.preventDefault();
              send({
                type: "key",
                key: e.key,
                phase: "down",
                ctrl: e.ctrlKey,
                shift: e.shiftKey,
                alt: e.altKey,
              });
            }}
            onKeyUp={(e) => {
              e.preventDefault();
              send({
                type: "key",
                key: e.key,
                phase: "up",
                ctrl: e.ctrlKey,
                shift: e.shiftKey,
                alt: e.altKey,
              });
            }}
          />
          {!connected && (
            <div className="paint-placeholder">
              <span>ASCRL</span>
              <h2>Your next scheme starts here.</h2>
              <p>
                The editor runs on your PC. This page receives the live view and
                exports your finished TGA.
              </p>
              <small>Start “Paint Studio Host” on your PC, then connect.</small>
            </div>
          )}
        </div>
        {connected && showControls && (
          <div className="paint-controls-panel" aria-label="Editor tools">
            <div className="paint-controls-heading">
              <strong>Editor tools</strong>
              <button type="button" onClick={() => setShowControls(false)}>
                Close tools
              </button>
            </div>
            <p>
              One finger paints. Two fingers zoom and pan. Choose Orbit to
              rotate.
            </p>
            <div>
              {tools.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    controlAction(c);
                    setShowControls(false);
                  }}
                >
                  {c.label}
                  {c.kind === "select" ? ` · ${c.value}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}
        {detail && (
          <p className="paint-detail" role="status">
            {detail}
          </p>
        )}
      </div>
      {download && (
        <a className="button" href={download.url} download={download.name}>
          Download TGA · {download.name}
        </a>
      )}
      <div className="paint-lower">
        <div>
          <h2>Cloud recovery copies</h2>
          <p>
            Automatic copies are saved while you work. Local autosave and
            recovery remain on the PC.
          </p>
          {backups.length === 0 ? (
            <p className="muted">
              No cloud copies yet. Connect and save your first scheme.
            </p>
          ) : (
            <ul>
              {backups.map((b) => (
                <li key={b.id}>
                  <span>
                    <strong>{b.title}</strong>
                    <small>
                      {b.profile} · {new Date(b.created_at).toLocaleString()}
                    </small>
                  </span>
                  <button
                    className="button secondary small"
                    disabled={!connected}
                    onClick={() => setRestoreId(b.id)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside>
          <h2>Private testing</h2>
          <p>
            Only your verified account can open this page or connect. League
            members and other admins do not have access.
          </p>
          <p>
            Keep the PC awake. Sessions end after two hours; reconnect to
            continue. The original models stay on the workstation.
          </p>
          <p>
            On Android Chrome, tap Expand editor. One finger uses the selected
            tool; two fingers zoom and pan. Choose Orbit to rotate. Both
            portrait and landscape work. Download TGA saves the finished file to
            your phone.
          </p>
        </aside>
      </div>
      <input
        ref={file}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {restoreId &&
        stage.current &&
        createPortal(
          <div
            className="paint-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Restore saved artwork"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send({ type: "restore", id: restoreId });
                setRestoreId(null);
                setDetail(
                  "Preserving current artwork, then restoring your saved copy…",
                );
              }}
            >
              <h2>Restore saved artwork</h2>
              <p>
                Your current artwork will be saved before this recovery copy is
                loaded.
              </p>
              <div>
                <button className="button" type="submit">
                  Restore saved copy
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setRestoreId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>,
          stage.current,
        )}
      {uploadRequest &&
        stage.current &&
        createPortal(
          <div
            className="paint-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Import artwork"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                file.current?.click();
              }}
            >
              <h2>Import artwork</h2>
              <p>
                Choose an image, TGA, or saved paint project to send to your
                private workstation.
              </p>
              <div>
                <button className="button" type="submit">
                  Choose file
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    send({ type: "upload-cancel", id: uploadTarget.current });
                    setUploadRequest(false);
                    uploadTarget.current = null;
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>,
          stage.current,
        )}
      {field &&
        stage.current &&
        createPortal(
          <div
            className="paint-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paint-field-label"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send({ type: "field", id: field.id, value });
                setField(null);
              }}
            >
              <h2 id="paint-field-label">{field.label}</h2>
              {field.type === "select" ? (
                <select
                  autoFocus
                  aria-label={field.label}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  autoFocus
                  aria-label={field.label}
                  type={field.type === "color" ? "color" : "text"}
                  inputMode={field.type === "number" ? "decimal" : "text"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
              <div>
                <button className="button" type="submit">
                  Apply
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setField(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>,
          stage.current,
        )}
    </section>
  );
}
