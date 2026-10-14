import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, ChatResponse, ConnectionStatus } from "../types/chat";
import type { CharacterEmotion } from "../types/character";
import { localAIProvider, type ChatProvider } from "../services/chat";
import type { Memory } from "../types/memory";
import type { Task } from "../types/task";
import { memoryService } from "../services/memory/memoryService";
import { detectMemoryIntent } from "../services/memory/memoryDetector";
import { formatRelevantMemories } from "../services/memory/memoryRetriever";
import { taskService } from "../services/tasks/taskService";
import {
  detectTaskIntent,
  resolveMatchingTask,
} from "../services/tasks/taskDetector";
import {
  formatCompactTaskContext,
} from "../services/tasks/taskRetriever";
import { calculateNextOccurrence } from "../services/tasks/recurrence";
import { captureScreen, isScreenAwarenessRequest } from "../services/screen/screenCapture";

export interface UseChatOptions {
  provider?: ChatProvider;
  onEmotionChange?: (emotion: CharacterEmotion) => void;
  initialGreeting?: string;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isTyping: boolean;
  connectionStatus: ConnectionStatus;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  refreshConnection: () => Promise<void>;
  capturedScreen: string | null;
  screenCaptureState: "idle" | "capturing" | "preview";
  screenError: string | null;
  captureCurrentScreen: () => Promise<void>;
  analyzeCapturedScreen: () => Promise<void>;
  clearCapturedScreen: () => void;
}

const DEFAULT_GREETING = "Hello. What are you working on today?";

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    provider = localAIProvider,
    onEmotionChange,
    initialGreeting = DEFAULT_GREETING,
  } = options;

  const createInitialMessage = (): ChatMessage => ({
    id: `msg-${Date.now()}-init`,
    role: "companion",
    content: initialGreeting,
    timestamp: Date.now(),
    emotion: "neutral",
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [createInitialMessage()]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [capturedScreen, setCapturedScreen] = useState<string | null>(null);
  const [screenCaptureState, setScreenCaptureState] = useState<
    "idle" | "capturing" | "preview"
  >("idle");
  const [screenError, setScreenError] = useState<string | null>(null);
  const screenAnalysisApprovedRef = useRef(false);

  // Keep a ref of current messages to prevent race conditions during async replies
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const refreshConnection = useCallback(async () => {
    if (provider.checkConnection) {
      try {
        const status = await provider.checkConnection();
        setConnectionStatus(status);
      } catch {
        setConnectionStatus("offline");
      }
    } else {
      setConnectionStatus("online");
    }
  }, [provider]);

  // Initial connection check & memory cleanup on mount
  useEffect(() => {
    refreshConnection();
    memoryService.cleanupExpired().catch(() => {});
  }, [refreshConnection]);

  const captureCurrentScreen = useCallback(async () => {
    setScreenError(null);
    screenAnalysisApprovedRef.current = false;
    setScreenCaptureState("capturing");
    try {
      const result = await captureScreen();
      setCapturedScreen(result.dataUrl);
      setScreenCaptureState("preview");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Screen capture was cancelled.";
      setScreenError(
        message.toLowerCase().includes("cancel")
          ? "Screen capture cancelled. Nothing was analyzed."
          : `${message} Nothing was analyzed.`
      );
      setScreenCaptureState("idle");
    }
  }, []);

  const clearCapturedScreen = useCallback(() => {
    setCapturedScreen(null);
    screenAnalysisApprovedRef.current = false;
    setScreenCaptureState("idle");
    setScreenError(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      // Add user message immediately
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        if (!capturedScreen && isScreenAwarenessRequest(trimmed)) {
          await captureCurrentScreen();
          return;
        }

        // An approved in-memory capture takes precedence over task/memory
        // automation. Screen content is analyzed locally and never persisted.
        if (capturedScreen && screenAnalysisApprovedRef.current) {
          const response = provider.analyzeImage
            ? await provider.analyzeImage(capturedScreen, trimmed, messagesRef.current)
            : {
                content:
                  "This chat provider cannot analyze images. The captured screen remains local and was not sent anywhere.",
                emotion: "concerned" as CharacterEmotion,
              };
          const companionMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: "companion",
            content: response.content,
            timestamp: Date.now(),
            emotion: response.emotion,
          };
          setMessages((prev) => [...prev, companionMsg]);
          if (onEmotionChange) onEmotionChange(response.emotion);
          return;
        }

        // =====================================================================
        // Step 1: Deterministic Task Intent Detection
        // =====================================================================
        const taskIntent = detectTaskIntent(trimmed);

        if (taskIntent.intent === "clarify") {
          const companionMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: "companion",
            content:
              taskIntent.clarificationMessage ||
              "What schedule details should I use for that reminder?",
            timestamp: Date.now(),
            emotion: "neutral",
          };
          setMessages((prev) => [...prev, companionMsg]);
          if (onEmotionChange) onEmotionChange("neutral");
          return;
        }

        if (taskIntent.intent === "create" && taskIntent.title) {
          try {
            // Check for duplicate pending task (same title & same timing)
            const pendingTasks = await taskService.listTasks("pending");
            const isDuplicate = pendingTasks.some(
              (t) => {
                if (t.title.toLowerCase() !== taskIntent.title!.toLowerCase()) return false;
                if (taskIntent.recurrence) {
                  return (
                    JSON.stringify(t.recurrence ?? null) ===
                      JSON.stringify(taskIntent.recurrence) &&
                    (t.recurrenceTimezone ?? null) ===
                      (taskIntent.recurrenceTimezone ?? null)
                  );
                }
                return (
                  !t.recurrence &&
                  t.dueAt === (taskIntent.dueAt ?? null) &&
                  t.reminderAt === (taskIntent.reminderAt ?? null)
                );
              }
            );

            if (!isDuplicate) {
              await taskService.createTask({
                title: taskIntent.title,
                dueAt: taskIntent.dueAt,
                reminderAt: taskIntent.reminderAt,
                recurrence: taskIntent.recurrence,
                recurrenceTimezone: taskIntent.recurrenceTimezone,
              });
            }

            const companionMsg: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "companion",
              content:
                taskIntent.confirmationMessage ||
                `I've noted that down: "${taskIntent.title}".`,
              timestamp: Date.now(),
              emotion: "satisfied",
            };

            setMessages((prev) => [...prev, companionMsg]);
            if (onEmotionChange) onEmotionChange("satisfied");
            return;
          } catch (taskErr) {
            console.error("[useChat] Error creating task:", taskErr);
            const errorMsg: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "companion",
              content: "I had trouble saving that task, but I've kept it in mind.",
              timestamp: Date.now(),
              emotion: "neutral",
            };
            setMessages((prev) => [...prev, errorMsg]);
            return;
          }
        }

        if (taskIntent.intent === "complete") {
          try {
            const pendingTasks = await taskService.listTasks("pending");
            const { task: matched, ambiguity } = resolveMatchingTask(
              taskIntent.targetQuery || "",
              pendingTasks
            );

            let replyContent = "";
            let emotion: CharacterEmotion = "satisfied";

            if (ambiguity.isAmbiguous) {
              replyContent = ambiguity.clarificationMessage;
              emotion = "neutral";
            } else if (matched) {
              if (matched.recurrence && matched.reminderAt !== null) {
                const next = calculateNextOccurrence(
                  matched.recurrence,
                  new Date(),
                  matched.recurrenceTimezone ?? undefined
                );
                if (next === null) {
                  replyContent = "I couldn't calculate the next occurrence for that reminder.";
                  emotion = "neutral";
                } else {
                  await taskService.completeOccurrence(matched.id, matched.reminderAt, next);
                  replyContent = `I've completed this occurrence of "${matched.title}".`;
                }
              } else {
                await taskService.completeTask(matched.id);
                replyContent = `I've marked "${matched.title}" as completed.`;
              }
            } else {
              replyContent =
                ambiguity.clarificationMessage ||
                "I couldn't find a pending task matching that.";
              emotion = "neutral";
            }

            const companionMsg: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "companion",
              content: replyContent,
              timestamp: Date.now(),
              emotion,
            };

            setMessages((prev) => [...prev, companionMsg]);
            if (onEmotionChange) onEmotionChange(emotion);
            return;
          } catch (taskErr) {
            console.error("[useChat] Error completing task:", taskErr);
          }
        }

        if (taskIntent.intent === "pause" || taskIntent.intent === "resume") {
          try {
            const pendingTasks = await taskService.listTasks("pending");
            const { task: matched, ambiguity } = resolveMatchingTask(
              taskIntent.targetQuery || "",
              pendingTasks
            );
            let replyContent = ambiguity.clarificationMessage;
            let emotion: CharacterEmotion = "neutral";
            if (!ambiguity.isAmbiguous && matched) {
              if (taskIntent.intent === "pause") {
                const updated = await taskService.pauseRecurrence(matched.id);
                replyContent = updated
                  ? `I've paused "${matched.title}".`
                  : `I couldn't pause "${matched.title}". It may not be recurring.`;
              } else if (matched.recurrence) {
                const next = calculateNextOccurrence(
                  matched.recurrence,
                  new Date(),
                  matched.recurrenceTimezone ?? undefined
                );
                const updated = next
                  ? await taskService.resumeRecurrence(matched.id, next)
                  : null;
                replyContent = updated
                  ? `I've resumed "${matched.title}".`
                  : `I couldn't resume "${matched.title}".`;
              } else {
                replyContent = `"${matched.title}" is not a recurring reminder.`;
              }
              emotion = "satisfied";
            }
            const companionMsg: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "companion",
              content: replyContent,
              timestamp: Date.now(),
              emotion,
            };
            setMessages((prev) => [...prev, companionMsg]);
            if (onEmotionChange) onEmotionChange(emotion);
            return;
          } catch (taskErr) {
            console.error("[useChat] Error changing recurrence state:", taskErr);
          }
        }

        if (taskIntent.intent === "cancel") {
          try {
            const pendingTasks = await taskService.listTasks("pending");
            const { task: matched, ambiguity } = resolveMatchingTask(
              taskIntent.targetQuery || "",
              pendingTasks
            );

            let replyContent = "";

            if (ambiguity.isAmbiguous) {
              replyContent = ambiguity.clarificationMessage;
            } else if (matched) {
              await taskService.cancelTask(matched.id);
              replyContent = `I've cancelled "${matched.title}".`;
            } else {
              replyContent =
                ambiguity.clarificationMessage ||
                "I couldn't find a task matching that to cancel.";
            }

            const companionMsg: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "companion",
              content: replyContent,
              timestamp: Date.now(),
              emotion: "neutral",
            };

            setMessages((prev) => [...prev, companionMsg]);
            if (onEmotionChange) onEmotionChange("neutral");
            return;
          } catch (taskErr) {
            console.error("[useChat] Error cancelling task:", taskErr);
          }
        }

        if (taskIntent.intent === "query") {
          try {
            const pendingTasks = await taskService.listTasks("pending");
            let replyContent = "";
            if (pendingTasks.length === 0) {
              replyContent = "You don't have any pending tasks right now.";
            } else {
              const listLines = pendingTasks
                .slice(0, 5)
                .map((t) => {
                  let timeStr = "";
                  if (t.reminderAt) {
                    timeStr = ` (reminder: ${new Date(t.reminderAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`;
                  } else if (t.dueAt) {
                    timeStr = ` (due: ${new Date(t.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`;
                  }
                  return `• ${t.title}${timeStr}`;
                })
                .join("\n");
              replyContent = `Here are your pending tasks:\n${listLines}`;
            }

            const companionMsg: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "companion",
              content: replyContent,
              timestamp: Date.now(),
              emotion: "neutral",
            };

            setMessages((prev) => [...prev, companionMsg]);
            if (onEmotionChange) onEmotionChange("neutral");
            return;
          } catch (taskErr) {
            console.error("[useChat] Error querying tasks:", taskErr);
          }
        }

        // =====================================================================
        // Step 2: Query Memories & Check Memory Intent
        // =====================================================================
        let existingMemories: Memory[] = [];
        try {
          existingMemories = await memoryService.listMemories();
        } catch (memErr) {
          console.warn("[useChat] Could not load memories:", memErr);
        }

        const memoryDetection = detectMemoryIntent(trimmed, existingMemories);

        if (memoryDetection.isMemoryIntent) {
          try {
            if (memoryDetection.targetIdToUpdate) {
              await memoryService.updateMemory({
                id: memoryDetection.targetIdToUpdate,
                content: memoryDetection.cleanContent,
                category: memoryDetection.category,
              });
            } else {
              await memoryService.createMemory({
                content: memoryDetection.cleanContent,
                category: memoryDetection.category,
              });
            }
          } catch (saveErr) {
            console.error("[useChat] Error persisting memory:", saveErr);
          }

          const companionMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: "companion",
            content: memoryDetection.confirmationMessage,
            timestamp: Date.now(),
            emotion: "satisfied",
          };

          setMessages((prev) => [...prev, companionMsg]);
          if (onEmotionChange) {
            onEmotionChange("satisfied");
          }
          return;
        }

        // =====================================================================
        // Step 3: Context Retrieval for Normal Conversation
        // =====================================================================
        let memoryContext = "";
        try {
          memoryContext = formatRelevantMemories(trimmed, existingMemories);
        } catch (retrievalErr) {
          console.warn("[useChat] Memory retrieval failed:", retrievalErr);
        }

        let taskContext = "";
        try {
          const allTasks: Task[] = await taskService.listTasks();
          taskContext = formatCompactTaskContext(trimmed, allTasks);
        } catch (taskRetrievalErr) {
          console.warn("[useChat] Task retrieval failed:", taskRetrievalErr);
        }

        const combinedContext = [memoryContext, taskContext]
          .filter(Boolean)
          .join("\n\n");

        // =====================================================================
        // Step 4: Dispatch to LocalAIProvider (Ollama)
        // =====================================================================
        const response: ChatResponse = await provider.sendMessage(
          trimmed,
          messagesRef.current,
          combinedContext || undefined
        );

        const companionMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "companion",
          content: response.content,
          timestamp: Date.now(),
          emotion: response.emotion,
        };

        setMessages((prev) => [...prev, companionMsg]);

        // Refresh connection state in case it changed
        refreshConnection();

        // Notify character layer of emotion update
        if (response.emotion && onEmotionChange) {
          onEmotionChange(response.emotion);
        }
      } catch (err) {
        console.error("[useChat] Error generating response:", err);
        setConnectionStatus("offline");
      } finally {
        setIsTyping(false);
      }
    },
    [captureCurrentScreen, capturedScreen, isTyping, onEmotionChange, provider, refreshConnection]
  );

  const analyzeCapturedScreen = useCallback(async () => {
    if (!capturedScreen || isTyping) return;
    screenAnalysisApprovedRef.current = true;
    await sendMessage(
      "Describe the captured screen and point out any visible errors or important text."
    );
  }, [capturedScreen, isTyping, sendMessage]);

  const clearChat = useCallback(() => {
    setMessages([createInitialMessage()]);
    setIsTyping(false);
    if (onEmotionChange) {
      onEmotionChange("neutral");
    }
  }, [initialGreeting, onEmotionChange]);

  return {
    messages,
    isTyping,
    connectionStatus,
    sendMessage,
    clearChat,
    refreshConnection,
    capturedScreen,
    screenCaptureState,
    screenError,
    captureCurrentScreen,
    analyzeCapturedScreen,
    clearCapturedScreen,
  };
}
