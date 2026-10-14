import {
  captureScreen,
  isScreenAwarenessRequest,
} from "./screenCapture";
import { hasVisionCapability, LocalAIProvider } from "../chat/localAIProvider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// These checks are intentionally dependency-free and safe to run without a
// browser, an Ollama vision model, or any screenshot data.
async function run() {
  assert(isScreenAwarenessRequest("Look at my screen"), "Explicit screen request must be recognized");
  assert(!isScreenAwarenessRequest("What should I work on today?"), "Normal chat must not capture");
  assert(!hasVisionCapability(["completion", "tools"]), "Non-vision model must be rejected");
  assert(hasVisionCapability(["completion", "vision"]), "Vision model capability must be accepted");

  let cancelled = false;
  try {
    await captureScreen({
      getDisplayMedia: async () => {
        throw new Error("Permission denied");
      },
    });
  } catch {
    cancelled = true;
  }
  assert(cancelled, "Capture cancellation/permission errors must be surfaced");

const provider = new LocalAIProvider({
  baseUrl: "http://127.0.0.1:9",
  model: "llama3.2:3b",
  timeoutMs: 10,
});
assert(
  typeof provider.analyzeImage === "function",
  "Local provider must expose an image analysis path"
);

  const unavailable = await provider.analyzeImage!(
    "data:image/jpeg;base64,AA==",
    "What is visible?"
  );
  assert(
    unavailable.content.includes("JPEG image") ||
      unavailable.content.includes("explicitly selected local vision model") ||
      unavailable.content.includes("No image was sent"),
    "Vision analysis errors must be returned as a safe response"
  );

  console.log("Screen awareness privacy, cancellation, compatibility, and error-path tests passed.");
}

void run();
