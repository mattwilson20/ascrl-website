"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import "./paint-studio.css";

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
    file = useRef<HTMLInputElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null),
    channel = useRef<RTCDataChannel | null>(null),
    session = useRef<string | null>(null);
  const pollBusy = useRef(false),
    closing = useRef(false),
    incoming = useRef<{
      name: string;
      size: number;
      hash: string;
      chunks: ArrayBuffer[];
      received: number;
    } | null>(null);
  const uploadTarget = useRef<string | null>(null),
    controls = useRef<Control[]>([]),
    pointerDown = useRef(false);
  const [online, setOnline] = useState(false),
    [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState("Checking your private workstation…"),
    [backups, setBackups] = useState<Backup[]>([]);
  const [field, setField] = useState<Field | null>(null),
    [value, setValue] = useState(""),
    [tools, setTools] = useState<Control[]>([]);
  const [detail, setDetail] = useState(""),
    [download, setDownload] = useState<{ url: string; name: string } | null>(
      null,
    );
  const send = useCallback((message: unknown) => {
    if (channel.current?.readyState === "open")
      channel.current.send(JSON.stringify(message));
  }, []);
  const disconnect = useCallback(
    async (message = "Disconnected. Your saved artwork remains on the PC.") => {
      closing.current = true;
      const id = session.current;
      session.current = null;
      channel.current?.close();
      channel.current = null;
      pc.current?.close();
      pc.current = null;
      if (video.current) video.current.srcObject = null;
      setConnected(false);
      setConnecting(false);
      setField(null);
      setTools([]);
      incoming.current = null;
      setStatus(message);
      if (id)
        try {
          await api({ action: "disconnect", id });
        } catch {}
      closing.current = false;
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (pollBusy.current) return;
    pollBusy.current = true;
    try {
      const d = await api();
      setOnline(d.online);
      setBackups(d.backups);
      if (!session.current)
        setStatus(
          d.online
            ? "Your PC is ready. Connect to start painting."
            : "Your workstation is offline. Start Paint Studio Host on your PC.",
        );
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
        if (d.session.answer && pc.current && !pc.current.remoteDescription)
          await pc.current.setRemoteDescription(d.session.answer);
        await api({ action: "heartbeat", id: session.current });
      }
    } catch (e) {
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
      const id = session.current;
      channel.current?.close();
      pc.current?.close();
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
  const dimensions = () => ({
    width: Math.max(
      390,
      Math.min(1600, Math.round(stage.current?.clientWidth || 1280)),
    ),
    height: Math.max(600, Math.min(1000, Math.round(window.innerHeight - 200))),
  });
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
    if (m.type === "status") setDetail(String(m.text).slice(0, 300));
    if (m.type === "field" && typeof m.id === "string") {
      setField(m);
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
        file.current.click();
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
      setDetail("TGA received and verified. Use Download TGA below.");
    }
    if (m.type === "backup-complete") {
      setDetail("Cloud recovery copy saved.");
      void refresh();
    }
  };
  const connect = async () => {
    try {
      setConnecting(true);
      setStatus("Connecting to your private workstation…");
      const peer = new RTCPeerConnection(ICE);
      pc.current = peer;
      peer.addTransceiver("video", { direction: "recvonly" });
      const dc = peer.createDataChannel("paint-control", { ordered: true });
      channel.current = dc;
      dc.binaryType = "arraybuffer";
      dc.onmessage = receive;
      dc.onopen = () => {
        setConnected(true);
        setConnecting(false);
        setStatus("Connected · Only your account has access");
        send({ type: "resize", ...dimensions() });
      };
      peer.ontrack = (e) => {
        if (video.current) {
          video.current.srcObject = new MediaStream([e.track]);
          void video.current.play().catch(() => {});
        }
      };
      peer.onconnectionstatechange = () => {
        if (
          ["failed", "closed"].includes(peer.connectionState) &&
          !closing.current
        )
          void disconnect(
            "Connection lost. Your local autosaves are preserved. Connect again.",
          );
      };
      await peer.setLocalDescription(await peer.createOffer());
      await iceReady(peer);
      const result = await api({
        action: "connect",
        offer: peer.localDescription?.toJSON(),
      });
      session.current = result.id;
      void refresh();
      setTimeout(() => {
        if (pc.current === peer && peer.connectionState !== "connected")
          void disconnect(
            "Could not establish the stream. This network may need a TURN relay; your models remain private.",
          );
      }, 35000);
    } catch (e) {
      await disconnect(e instanceof Error ? e.message : "Could not connect.");
    }
  };
  useEffect(() => {
    if (!connected) return;
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => send({ type: "resize", ...dimensions() }), 500);
    };
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [connected, send]);
  function pointer(e: React.PointerEvent<HTMLVideoElement>, phase: string) {
    if (!connected || !video.current) return;
    e.preventDefault();
    const r = video.current.getBoundingClientRect();
    if (phase === "down") {
      video.current.setPointerCapture(e.pointerId);
      pointerDown.current = true;
    }
    if (phase === "up" || phase === "cancel") pointerDown.current = false;
    send({
      type: "pointer",
      phase,
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
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
    const id = uploadTarget.current;
    uploadTarget.current = null;
    if (!id) return;
    if (f.size > 80 * 1024 * 1024) {
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
      setDetail("Upload interrupted. Import the file again.");
    }
  }
  const controlAction = (control: Control) => {
    if (control.kind === "select" || control.kind === "field") {
      setField({
        id: control.id,
        label: control.label,
        type: control.kind === "select" ? "select" : "text",
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
          onClick={() => void stage.current?.requestFullscreen()}
        >
          Full screen
        </button>
      </div>
      <p role="status" className="paint-status">
        {status}
      </p>
      <div className="paint-stage" ref={stage}>
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
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            if (connected)
              send({
                type: "wheel",
                deltaX: e.deltaX,
                deltaY: e.deltaY,
                x: e.nativeEvent.offsetX / (e.currentTarget.clientWidth || 1),
                y: e.nativeEvent.offsetY / (e.currentTarget.clientHeight || 1),
              });
          }}
          onKeyDown={(e) => {
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
      {detail && (
        <p className="paint-detail" role="status">
          {detail}
        </p>
      )}
      {download && (
        <a className="button" href={download.url} download={download.name}>
          Download TGA · {download.name}
        </a>
      )}
      {connected && (
        <details className="paint-quick">
          <summary>Editor controls · accessible view</summary>
          <div>
            {tools.map((c) => (
              <button
                key={c.id}
                className="button secondary small"
                onClick={() => controlAction(c)}
              >
                {c.label}
                {c.kind === "select" ? ` · ${c.value}` : ""}
              </button>
            ))}
          </div>
        </details>
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
                    onClick={() => {
                      if (
                        window.confirm(
                          "Restore this copy? Your current artwork will be saved first.",
                        )
                      )
                        send({ type: "restore", id: b.id });
                    }}
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
            Use a mouse or touch. On a phone, landscape gives more room. Use
            Orbit to rotate the car and the editor’s zoom controls for
            precision.
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
      {field && (
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
        </div>
      )}
    </section>
  );
}
