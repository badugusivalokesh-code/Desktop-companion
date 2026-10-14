export interface ScreenCaptureSource {
  getDisplayMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface ScreenCaptureResult {
  dataUrl: string;
  width: number;
  height: number;
}

const FRAME_TIMEOUT_MS = 8_000;
const MAX_BASE64_LENGTH = 4 * 1024 * 1024;

function abortError(): Error {
  const error = new Error("Screen capture was cancelled.");
  error.name = "AbortError";
  return error;
}

function stopTracks(stream: MediaStream): void {
  // A failed track.stop() must not leave the other tracks running.
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Best-effort cleanup of the remaining tracks.
    }
  }
}

function requestDisplayStream(source: ScreenCaptureSource, signal?: AbortSignal): Promise<MediaStream> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    // The browser's picker cannot be closed here. A stream it returns after
    // cancellation is discarded immediately, with every track stopped.
    try {
      Promise.resolve(source.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      })).then(
        (stream) => {
          signal?.removeEventListener("abort", onAbort);
          if (settled || signal?.aborted) {
            stopTracks(stream);
            if (!settled) {
              settled = true;
              reject(abortError());
            }
          } else {
            settled = true;
            resolve(stream);
          }
        },
        (error: unknown) => {
          signal?.removeEventListener("abort", onAbort);
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      );
    } catch (error) {
      signal?.removeEventListener("abort", onAbort);
      if (!settled) reject(error);
    }
  });
}

function hasFrame(video: HTMLVideoElement): boolean {
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Number.isFinite(video.videoWidth) && video.videoWidth > 0 &&
    Number.isFinite(video.videoHeight) && video.videoHeight > 0;
}

function waitForFrame(video: HTMLVideoElement, stream: MediaStream, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const tracks = stream.getTracks();
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      for (const event of ["loadeddata", "resize", "canplay"]) {
        video.removeEventListener(event, onFrame);
      }
      video.removeEventListener("error", onError);
      for (const track of tracks) track.removeEventListener("ended", onEnded);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(abortError());
    const onFrame = () => {
      if (hasFrame(video)) finish();
    };
    const onError = () => finish(new Error("Could not read the selected screen frame."));
    const onEnded = () => finish(new Error("The selected screen stream ended before a frame arrived."));
    const timer = setTimeout(() => finish(new Error("Timed out waiting for a screen frame.")), FRAME_TIMEOUT_MS);

    signal?.addEventListener("abort", onAbort, { once: true });
    for (const event of ["loadeddata", "resize", "canplay"]) {
      video.addEventListener(event, onFrame);
    }
    video.addEventListener("error", onError);
    for (const track of tracks) track.addEventListener("ended", onEnded);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      // play() may hang or reject; the same deadline also bounds that wait.
      Promise.resolve(video.play()).then(onFrame, () => onError());
      onFrame();
    } catch {
      onError();
    }
  });
}

/**
 * Captures one user-selected display/window through the WebView2 media picker.
 * The stream is stopped immediately after the first frame is copied to an
 * in-memory JPEG. No file or persistent store is used. Aborting cannot close
 * an already-open browser picker, but it discards and stops any late stream.
 */
export async function captureScreen(
  source: ScreenCaptureSource = navigator.mediaDevices,
  signal?: AbortSignal
): Promise<ScreenCaptureResult> {
  if (!source?.getDisplayMedia) {
    throw new Error("Screen capture is not supported by this Windows runtime.");
  }

  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  try {
    stream = await requestDisplayStream(source, signal);
    if (signal?.aborted) throw abortError();
    video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await waitForFrame(video, stream, signal);
    if (signal?.aborted) throw abortError();
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!hasFrame(video)) throw new Error("No valid screen frame was available.");
    const scale = Math.min(1, 1600 / width, 1000 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the screen preview.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.78, 0.6, 0.4, 0.2]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl) &&
          dataUrl.length <= MAX_BASE64_LENGTH) {
        if (signal?.aborted) throw abortError();
        return { dataUrl, width: canvas.width, height: canvas.height };
      }
    }
    throw new Error("Screen preview exceeds the 4 MB base64 limit or is not a JPEG.");
  } finally {
    try {
      if (video) video.srcObject = null;
    } finally {
      if (stream) stopTracks(stream);
    }
  }
}

export function isScreenAwarenessRequest(text: string): boolean {
  const request = text.trim();
  // Only a direct, whole-message request can initiate capture. Quoted examples,
  // negations, and discussion about screens are not capture requests.
  const prefix = "(?:(?:please[, ]+)?(?:can|could|would) you (?:please )?|please[, ]+)?";
  const screen = "(?:my|this|the) screen";
  const intent = [
    `look at ${screen}`,
    `(?:read|explain|describe|inspect) ${screen}`,
    `(?:read|explain|describe|inspect) (?:this|the|my) (?:error|code|text|content|page|webpage|web page) (?:on|visible on|shown on) ${screen}`,
    `(?:read|describe|explain|inspect) (?:what(?:'s| is)|the content) (?:on|visible on) ${screen}`,
    `what does this (?:webpage|web page) say`,
    `what(?:'s| is) (?:on|visible on) ${screen}`,
  ].join("|");
  return new RegExp(`^${prefix}(?:${intent})[.!?]?$`, "i").test(request);
}
