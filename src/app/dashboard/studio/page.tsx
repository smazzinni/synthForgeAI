"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// UploadPanel component
import UploadPanel from "./components/UploadPanel";
import {
  exportAsCSV,
  exportAsJSON,
  exportAsSQL,
  parseAIResponse,
  extractSchema,
  humanizeColumnName,
  columnPlainEnglishHint,
  type SchemaTable,
} from "./helpers";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Brain,
  ChevronDown,
  Database,
  Table2,
  Code2,
  GitBranch,
  Save,
  Trash2,
  Copy,
  Download,
  Play,
  History,
  Star,
  StarOff,
  Plus,
  FileJson,
  FileSpreadsheet,
  FileText,
  X,
  ZoomIn,
  ZoomOut,
  Move,
  AlertTriangle,
  Shield,
  KeyRound,
  Link2,
  Layers,
  MousePointerClick,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  apiPost,
  apiPatch,
  apiDelete,
  apiGet,
  invalidateCache,
} from "@/lib/api-client";
// Generation lock to prevent concurrent generation
let generationLock = false;
import {
  parseAgentStatus,
  parseInteractiveOptions,
  parseAllInteractiveOptions,
  parseBeginGeneration,
  parseAgentControlAction,
  cleanDisplayText,
  isDestructiveSQL,
  getAgentByName,
  type AgentStatus,
  type InteractiveOptions,
  type OptionChoice,
  type BeginGenerationSignal,
} from "@/lib/ai-agents";
import {
  parseQuestionsFromResponse,
  initializeQuestionFlow,
  recordAnswerAndAdvance,
  formatAnswersForAI,
  type QuestionFlow,
} from "@/lib/question-flow";
import { QuestionFlowPanel } from "@/components/QuestionFlowPanel";
// ✅ Removed unused imports: validateRecord, ColumnValidationResult

// ─── Types ───
interface GenerationProgress {
  isGenerating: boolean;
  currentTable: string;
  rowsInserted: number;
  totalInserted: number;
  targetRows: number;
  tablesGenerated: number;
  statusMessages: string[];
  databaseId?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoningContent?: string;
  agentName?: string;
  agentStatus?: AgentStatus | null;
  interactiveOptions?: InteractiveOptions | null;
  generationProgress?: GenerationProgress | null;
  timestamp: Date;
  isStreaming?: boolean;
  tables?: Record<string, unknown[]> | null;
}

/** Aligns with /api/chat `recentHistory` slice; keeps POST body under limits */
const CHAT_API_HISTORY_LIMIT = 10;
const CHAT_API_MAX_CONTENT = 12000;
const GENERATION_HISTORY_LIMIT = 12;

function buildApiChatHistory(
  messages: Message[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter(
      (m): m is Message & { role: "user" | "assistant" } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .map((m) => {
      const c = m.content;
      return {
        role: m.role,
        content:
          c.length > CHAT_API_MAX_CONTENT
            ? `${c.slice(0, CHAT_API_MAX_CONTENT)}\n…[truncated for API]`
            : c,
      };
    })
    .slice(-CHAT_API_HISTORY_LIMIT);
}


interface StudioPageProps {
  databaseId?: string;
  initialName?: string;
  initialSchema?: SchemaTable[];
  initialData?: Record<string, unknown[]>;
  initialMessages?: Message[];
  conversationId?: string;
}

// Components and helpers live in separate modules under ./helpers and ./components
import AgentIcon from './components/AgentIcon'
import ShowMoreText from './components/ShowMoreText'
import { GenerationProgressView } from './components/GenerationProgressView'

type DataColumnKind = 'pk' | 'fk' | 'regular'

/** Heuristic column roles for styling (id = PK, *_id = FK). */
function getDataColumnKind(columnName: string): DataColumnKind {
  if (columnName === 'id') return 'pk'
  if (columnName.endsWith('_id') && columnName !== 'id') return 'fk'
  return 'regular'
}

// ─── Main Studio Page Component ───
function StudioPageInner({
  databaseId,
  initialName,
  initialSchema,
  initialData,
  initialMessages,
  conversationId: initialConversationId,
}: StudioPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startGenTransition] = useTransition();

  // ─── State ───
  const [currentDatabaseId, setCurrentDatabaseId] = useState<
    string | undefined
  >(databaseId);
  const [messages, setMessages] = useState<Message[]>(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [
          {
            id: "1",
            role: "assistant",
            content: databaseId
              ? `You’re in **${initialName || databaseId}**. Say what to change or add.`
              : "Hi — what are you building? A single sentence is plenty to start.",
            agentName: "Orchestrator",
            timestamp: new Date(),
          },
        ],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasoningVisible, setReasoningVisible] = useState(false);
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [generatedSchema, setGeneratedSchema] = useState<SchemaTable[]>(
    initialSchema || [],
  );
  const [generatedData, setGeneratedData] = useState<Record<string, unknown[]>>(
    initialData || {},
  );
  const [databaseName, setDatabaseName] = useState(initialName || "");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("data");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [visibleRows, setVisibleRows] = useState(20);
  const [initialQuerySent, setInitialQuerySent] = useState(false);
  const [conversationId, setConversationId] = useState(
    initialConversationId || "",
  );

  // SQL workspace state
  const [sqlEditor, setSqlEditor] = useState("");
  const [sqlResults, setSqlResults] = useState<{
    rows: Record<string, unknown>[];
    columns: string[];
    executionTime: number;
  } | null>(null);
  const [sqlExecuting, setSqlExecuting] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [savedQueries, setSavedQueries] = useState<
    Array<{ name: string; sql: string }>
  >([]);
  const [sqlConfirmOpen, setSqlConfirmOpen] = useState(false);
  const [sqlConfirmQuery, setSqlConfirmQuery] = useState("");
  const [deleteDbConfirmOpen, setDeleteDbConfirmOpen] = useState(false);
  const [saveQueryDialogOpen, setSaveQueryDialogOpen] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");

  // Explorer state
  const [favoriteTables, setFavoriteTables] = useState<Set<string>>(new Set());
  const [explorerZoom, setExplorerZoom] = useState(1);
  const [explorerPan, setExplorerPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Chat panel resize
  const [chatWidth, setChatWidth] = useState(340);
  const [isResizing, setIsResizing] = useState(false);
  // Interactive option selections per message (for multi-select)
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    {},
  );
  const [activeFlow, setActiveFlow] = useState<QuestionFlow | null>(null);

  // Streaming generation state
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress>({
      isGenerating: false,
      currentTable: "",
      rowsInserted: 0,
      totalInserted: 0,
      targetRows: 0,
      tablesGenerated: 0,
      statusMessages: [],
    });
  const generationAbortRef = useRef<AbortController | null>(null);
  const genDoneBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [rightGenBanner, setRightGenBanner] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  const loadingRef = useRef(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (genDoneBannerTimeoutRef.current) {
        clearTimeout(genDoneBannerTimeoutRef.current);
        genDoneBannerTimeoutRef.current = null;
      }
    };
  }, []);

  const hasGeneratedData =
    generatedSchema.length > 0 || Object.keys(generatedData).length > 0;

  // ✅ REMOVED: duplicate first useEffect that set setInput(q) + setInitialQuerySent(true).
  // It was redundant — sendMessage(q) in the second effect handles everything, and
  // its setInput("") call immediately overwrote the setInput(q) from the first effect.

  // Auto-select first table
  useEffect(() => {
    const tableNames = Object.keys(generatedData);
    const updateSelection = () => {
      if (tableNames.length > 0 && !selectedTable) {
        setSelectedTable(tableNames[0]);
        return;
      }
      if (selectedTable && !tableNames.includes(selectedTable)) {
        setSelectedTable(tableNames.length > 0 ? tableNames[0] : "");
      }
    };
    const timer = window.setTimeout(updateSelection, 0);
    return () => window.clearTimeout(timer);
  }, [generatedData, selectedTable]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentReasoning]);

  // ─── Resize handler ───
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setChatWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // ─── Save conversation to backend (persist recent messages including system) ───
  const saveConversation = useCallback(
    async (
      userMsg?: string,
      assistantMsg?: string,
      agentName?: string,
      recentMessages?: Array<{
        role: string;
        content: string;
        agentName?: string;
      }>,
    ) => {
      try {
        // If recentMessages provided, use it (preferred). Otherwise fall back to user/assistant pair.
        const msgs =
          recentMessages && recentMessages.length > 0
            ? recentMessages
            : [
                { role: "user", content: userMsg || "" },
                { role: "assistant", content: assistantMsg || "", agentName },
              ];

        if (conversationId) {
          await apiPost("/api/conversations", {
            id: conversationId,
            messages: msgs,
          });
        } else {
          const result = await apiPost<{ conversationId: string }>(
            "/api/conversations",
            {
              databaseId: currentDatabaseId,
              title: databaseName || "New Conversation",
              messages: msgs,
            },
          );
          if (result.conversationId) {
            setConversationId(result.conversationId);
          }
        }
      } catch (err) {
        console.warn("[Studio] Failed to save conversation:", err);
      }
    },
    [conversationId, currentDatabaseId, databaseName],
  );

  // ─── Auto-save generated data ───
  async function autoSaveData(
    tables: Record<string, unknown[]>,
    schema: SchemaTable[],
    parsedName?: string | null,
  ) {
    const name =
      parsedName || databaseName || schema[0]?.name || "Untitled Database";
    let totalRows = 0;
    for (const rows of Object.values(tables)) {
      totalRows += rows.length;
    }

    try {
      if (currentDatabaseId) {
        await apiPatch("/api/databases", {
          id: currentDatabaseId,
          name,
          schema_json: schema,
          data_json: tables,
          row_count: totalRows,
          quality_score: 0.85,
          status: "ready",
        });
      } else {
        const result = await apiPost<{ database?: { id: string } }>(
          "/api/databases",
          {
            name,
            db_type: "postgresql",
            schema_json: schema,
            row_count: totalRows,
            quality_score: 0.85,
            status: "ready",
          },
        );

        const dbId = result.database?.id;
        if (dbId) {
          setCurrentDatabaseId(dbId);
          if (Object.keys(tables).length > 0) {
            try {
              await apiPatch("/api/databases", {
                id: dbId,
                data_json: tables,
              });
            } catch {
              console.warn("[Studio] Failed to save data_json");
            }
          }
        }
      }
      invalidateCache("/api/databases");
      toast.success("Data saved to database!");
    } catch (err) {
      console.error("[Studio] Auto-save failed:", err);
      toast.error("Failed to auto-save data");
    }
  }

  // ─── Start streaming data generation ───
  async function startStreamingGeneration(
    signal: BeginGenerationSignal,
    assistantId: string,
    conversationHistoryOverride?: Array<{ role: string; content: string }>,
  ) {
    console.debug("[Studio] startStreamingGeneration called", {
      signal,
      currentDatabaseId,
      databaseName,
    });
    if (generationLock) {
      toast.error("Generation already in progress");
      return;
    }
    generationLock = true;
    const genProgressId = (Date.now() + 2).toString();

    setActiveTab("data");
    setRightGenBanner(null);
    if (genDoneBannerTimeoutRef.current) {
      clearTimeout(genDoneBannerTimeoutRef.current);
      genDoneBannerTimeoutRef.current = null;
    }

    let createdDatabaseId: string | undefined;

    let genFetchTimeoutId: number | undefined;

    try {
      const controller = new AbortController();
      generationAbortRef.current = controller;

      const clientGenDeadlineMs = 780_000;
      genFetchTimeoutId = window.setTimeout(() => {
        controller.abort();
      }, clientGenDeadlineMs);

      setGenerationProgress({
        isGenerating: true,
        currentTable: "",
        rowsInserted: 0,
        totalInserted: 0,
        targetRows: Object.values(signal.rowCounts).reduce((s, n) => s + n, 0),
        tablesGenerated: 0,
        statusMessages: ["Generating database schema..."],
        databaseId: currentDatabaseId,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: genProgressId,
          role: "assistant" as const,
          content: "",
          agentName: "Data Generator",
          generationProgress: {
            isGenerating: true,
            currentTable: "",
            rowsInserted: 0,
            totalInserted: 0,
            targetRows: Object.values(signal.rowCounts).reduce(
              (s, n) => s + n,
              0,
            ),
            tablesGenerated: 0,
            statusMessages: ["Generating database schema..."],
          },
          timestamp: new Date(),
        },
      ]);

      const history =
        conversationHistoryOverride && conversationHistoryOverride.length > 0
          ? conversationHistoryOverride.map((m) => ({
              role: m.role,
              content:
                typeof m.content === "string"
                  ? m.content.slice(0, CHAT_API_MAX_CONTENT)
                  : "",
            }))
          : buildApiChatHistory(messagesRef.current);

      const response = await fetch("/api/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: currentDatabaseId,
          databaseName: signal.databaseName || databaseName,
          schema: signal.schema,
          rowCounts: signal.rowCounts,
          instructions: signal.instructions,
          conversationHistory: history,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        if (response.status === 409) {
          throw new Error(
            "Database already generating. Please wait for current generation to complete.",
          );
        }
        throw new Error(`Generation API error: ${response.status} ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let sseBuffer = "";
      const accumulatedData: Record<string, unknown[]> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const sseLines = sseBuffer.split("\n");
        sseBuffer = sseLines.pop() || "";

        for (const sseLine of sseLines) {
          const trimmed = sseLine.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const sseData = trimmed.slice(6);
          try {
            const event = JSON.parse(sseData);

            if (event.type === "database_created" && event.databaseId) {
              createdDatabaseId = event.databaseId;
              startGenTransition(() => {
                setCurrentDatabaseId(event.databaseId);
                setGenerationProgress((prev) => ({
                  ...prev,
                  databaseId: event.databaseId,
                }));
              });
            }

            if (event.type === "progress") {
              const statusMsg =
                event.message ||
                (event.table
                  ? `Streaming records into [${event.table}] — ${event.totalInserted || 0} rows`
                  : `${event.totalInserted || 0} rows inserted`);

              startGenTransition(() => {
                if (event.table) {
                  setSelectedTable(String(event.table));
                }

                setGenerationProgress((prev) => ({
                  ...prev,
                  currentTable: event.table || prev.currentTable,
                  rowsInserted: event.rowsInserted || 0,
                  totalInserted: event.totalInserted || prev.totalInserted,
                  targetRows: event.targetRows || prev.targetRows,
                  statusMessages: [...prev.statusMessages.slice(-5), statusMsg],
                }));

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === genProgressId
                      ? {
                          ...m,
                          generationProgress: {
                            isGenerating: true,
                            currentTable: event.table || "",
                            rowsInserted: event.rowsInserted || 0,
                            totalInserted: event.totalInserted || 0,
                            targetRows: event.targetRows || 0,
                            tablesGenerated: 0,
                            statusMessages: [
                              ...(m.generationProgress?.statusMessages || []).slice(-5),
                              statusMsg,
                            ],
                          },
                        }
                      : m,
                  ),
                );
              });
            }

            if (event.type === "table_complete") {
              const tableName = event.table || "";
              const tableRows = event.totalRows || 0;

              const tableSchema = signal.schema.find(
                (s) => s.name === tableName,
              );
              startGenTransition(() => {
                if (tableSchema && !accumulatedData[tableName]) {
                  setGeneratedSchema((prev) => {
                    const existing = prev.find((t) => t.name === tableName);
                    if (!existing) return [...prev, tableSchema];
                    return prev;
                  });
                }

                const completeMsg = `[${tableName}] — ${tableRows.toLocaleString()} rows inserted`;

                setGenerationProgress((prev) => ({
                  ...prev,
                  tablesGenerated: prev.tablesGenerated + 1,
                  statusMessages: [...prev.statusMessages.slice(-5), completeMsg],
                }));

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === genProgressId
                      ? {
                          ...m,
                          generationProgress: {
                            ...m.generationProgress!,
                            tablesGenerated:
                              (m.generationProgress?.tablesGenerated || 0) + 1,
                            statusMessages: [
                              ...(m.generationProgress?.statusMessages || []).slice(-5),
                              completeMsg,
                            ],
                          },
                        }
                      : m,
                  ),
                );
              });
            }

            if (event.type === "complete") {
              const durationSec = ((event.durationMs || 0) / 1000).toFixed(1);
              const totalRows = event.totalRows || 0;
              const tablesGen = event.tablesGenerated || 0;
              const dbId = currentDatabaseId || createdDatabaseId;
              if (dbId) {
                try {
                  const dbResult = await apiGet<{
                    database?: {
                      data_json: Record<string, unknown[]>;
                      schema_json: SchemaTable[];
                    };
                  }>(`/api/databases?id=${dbId}`);
                  if (dbResult.database?.data_json) {
                    setGeneratedData(dbResult.database.data_json);
                  }
                  if (dbResult.database?.schema_json) {
                    setGeneratedSchema(dbResult.database.schema_json);
                  }
                } catch {
                  if (Object.keys(accumulatedData).length > 0) {
                    setGeneratedData(accumulatedData);
                  }
                }
              }

              const finalMsg = `Generation complete — ${totalRows.toLocaleString()} rows across ${tablesGen} tables (${durationSec}s)`;

              setGenerationProgress((prev) => ({
                ...prev,
                isGenerating: false,
                tablesGenerated: tablesGen,
                totalInserted: totalRows,
                statusMessages: [...prev.statusMessages.slice(-5), finalMsg],
              }));

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === genProgressId
                    ? {
                        ...m,
                        content: finalMsg,
                        generationProgress: {
                          isGenerating: false,
                          currentTable: "",
                          rowsInserted: totalRows,
                          totalInserted: totalRows,
                          targetRows: totalRows,
                          tablesGenerated: tablesGen,
                          statusMessages: [
                            ...(m.generationProgress?.statusMessages || []).slice(-5),
                            finalMsg,
                          ],
                        },
                      }
                    : m,
                ),
              );

              if (signal.databaseName) setDatabaseName(signal.databaseName);

              toast.success(
                `Database generated: ${totalRows.toLocaleString()} rows across ${tablesGen} tables`,
              );
              invalidateCache("/api/databases");

              const doneLine = `${totalRows.toLocaleString()} rows · ${tablesGen} table${tablesGen === 1 ? "" : "s"} · ${durationSec}s`;
              setRightGenBanner(doneLine);
              if (genDoneBannerTimeoutRef.current) {
                clearTimeout(genDoneBannerTimeoutRef.current);
              }
              genDoneBannerTimeoutRef.current = setTimeout(() => {
                setRightGenBanner(null);
                genDoneBannerTimeoutRef.current = null;
              }, 12000);
            }

            if (event.type === "error") {
              const errorMsg = event.message || "Generation failed";

              setRightGenBanner(`Could not finish · ${errorMsg}`);
              if (genDoneBannerTimeoutRef.current) {
                clearTimeout(genDoneBannerTimeoutRef.current);
              }
              genDoneBannerTimeoutRef.current = setTimeout(() => {
                setRightGenBanner(null);
                genDoneBannerTimeoutRef.current = null;
              }, 14000);

              setGenerationProgress((prev) => ({
                ...prev,
                isGenerating: false,
                statusMessages: [...prev.statusMessages, `Error: ${errorMsg}`],
              }));

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === genProgressId
                    ? {
                        ...m,
                        content: `Generation error: ${errorMsg}`,
                        generationProgress: {
                          ...m.generationProgress!,
                          isGenerating: false,
                          statusMessages: [
                            ...(m.generationProgress?.statusMessages || []),
                            `Error: ${errorMsg}`,
                          ],
                        },
                      }
                    : m,
                ),
              );

              if (event.recoverable) {
                toast.warning(`Generation partially completed: ${errorMsg}`);
              } else {
                toast.error(`Generation failed: ${errorMsg}`);
              }
            }
          } catch {
            // Skip unparseable SSE events
          }
        }
      }

      setGenerationProgress((prev) => ({ ...prev, isGenerating: false }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setGenerationProgress((prev) => ({ ...prev, isGenerating: false }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === genProgressId
              ? {
                  ...m,
                  content:
                    m.content?.trim() ||
                    "Generation stopped (timeout or cancelled).",
                  generationProgress: m.generationProgress
                    ? { ...m.generationProgress, isGenerating: false }
                    : null,
                }
              : m,
          ),
        );
        toast.warning("Generation stopped (timeout or cancelled).");
        return;
      }

      const errorMsg = err instanceof Error ? err.message : "Generation failed";

      setRightGenBanner(`Could not finish · ${errorMsg}`);
      if (genDoneBannerTimeoutRef.current) {
        clearTimeout(genDoneBannerTimeoutRef.current);
      }
      genDoneBannerTimeoutRef.current = setTimeout(() => {
        setRightGenBanner(null);
        genDoneBannerTimeoutRef.current = null;
      }, 14000);

      setGenerationProgress((prev) => ({
        ...prev,
        isGenerating: false,
        statusMessages: [...prev.statusMessages, `Error: ${errorMsg}`],
      }));

      setMessages((prev) =>
        prev.map((m) =>
          m.id === genProgressId
            ? {
                ...m,
                content: `Generation error: ${errorMsg}`,
                generationProgress: m.generationProgress
                  ? { ...m.generationProgress, isGenerating: false }
                  : null,
              }
            : m,
        ),
      );

      toast.error(`Generation failed: ${errorMsg}`);
    } finally {
      if (genFetchTimeoutId) window.clearTimeout(genFetchTimeoutId);
      generationLock = false;
    }
  }

  // ─── Send message with DeepSeek streaming ───
  const sendMessage = useCallback(
    async (messageText?: string) => {
      const textToSend = messageText || input;
      if (!textToSend.trim() || loadingRef.current) return;

      if (abortRef.current) {
        abortRef.current.abort();
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: textToSend.trim(),
        timestamp: new Date(),
      };

      /** Captured before optimistic updates — `messagesRef` lags behind `setMessages` */
      const historyBeforeThisTurn = buildApiChatHistory(messagesRef.current);

      const assistantId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        reasoningContent: "",
        agentName: "Orchestrator",
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setLoading(true);
      loadingRef.current = true;
      setReasoningVisible(true);
      setCurrentReasoning("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = historyBeforeThisTurn;

        // Truncate currentData if too large (> 20KB send only summary)
        let dataToSend: Record<string, unknown[]> | undefined = hasGeneratedData
          ? generatedData
          : undefined;
        if (dataToSend) {
          const dataStr = JSON.stringify(dataToSend);
          if (dataStr.length > 20000) {
            // Send only schema + row counts instead of full data
            const summary: Record<string, unknown[]> = {};
            for (const [tableName, rows] of Object.entries(dataToSend)) {
              if (Array.isArray(rows) && rows.length > 0) {
                // Send first 2 rows as samples + row count
                summary[tableName] = rows.slice(0, 2);
              } else {
                summary[tableName] = [];
              }
            }
            dataToSend = summary;
          }
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage.content,
            ...(currentDatabaseId
              ? { databaseId: currentDatabaseId, databaseName }
              : {}),
            ...(conversationId ? { conversationId } : {}),
            currentSchema: generatedSchema,
            currentData: dataToSend,
            history,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          let detail = errBody.trim() || response.statusText;
          try {
            const j = JSON.parse(errBody) as { error?: string; content?: string };
            detail = j.error || j.content || detail;
          } catch {
            /* plain text body */
          }
          throw new Error(
            `API error: ${response.status}${detail ? ` — ${detail}` : ""}`.slice(0, 800),
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let fullReasoning = "";
        let lastAgentName = "Orchestrator";
        let lastAgentStatus: AgentStatus | null = null;
        let lastInteractiveOptions: InteractiveOptions | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "reasoning") {
                fullReasoning += parsed.content;
                setCurrentReasoning(fullReasoning);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, reasoningContent: fullReasoning }
                      : m,
                  ),
                );
              } else if (parsed.type === "content") {
                fullContent += parsed.content;

                // Parse for agent status updates
                const agentStatus = parseAgentStatus(fullContent);
                if (agentStatus) {
                  lastAgentStatus = agentStatus;
                  lastAgentName = agentStatus.agent;
                }

                // Parse for interactive options (all of them, use last)
                const allOptions = parseAllInteractiveOptions(fullContent);
                if (allOptions.length > 0) {
                  lastInteractiveOptions = allOptions[allOptions.length - 1];
                }

                // During streaming, store raw content but display cleaned version
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: fullContent,
                          agentName: lastAgentName,
                          agentStatus: lastAgentStatus,
                          interactiveOptions: lastInteractiveOptions,
                        }
                      : m,
                  ),
                );
              } else if (parsed.type === "done" || parsed.type === "finish") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m,
                  ),
                );
              } else if (parsed.type === "error") {
                console.error("[Studio] Stream error:", parsed.content);
              }
            } catch {
              // Skip unparseable
            }
          }
        }

        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "reasoning") {
                fullReasoning += parsed.content;
                setCurrentReasoning(fullReasoning);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, reasoningContent: fullReasoning }
                      : m,
                  ),
                );
              } else if (parsed.type === "content") {
                fullContent += parsed.content;

                const agentStatus = parseAgentStatus(fullContent);
                if (agentStatus) {
                  lastAgentStatus = agentStatus;
                  lastAgentName = agentStatus.agent;
                }

                const allOptions = parseAllInteractiveOptions(fullContent);
                if (allOptions.length > 0) {
                  lastInteractiveOptions = allOptions[allOptions.length - 1];
                }

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: fullContent,
                          agentName: lastAgentName,
                          agentStatus: lastAgentStatus,
                          interactiveOptions: lastInteractiveOptions,
                        }
                      : m,
                  ),
                );
              } else if (parsed.type === "done" || parsed.type === "finish") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m,
                  ),
                );
              } else if (parsed.type === "error") {
                console.error("[Studio] Stream error:", parsed.content);
              }
            } catch {
              // Skip unparseable leftover buffer
            }
          }
        }

        // Finalize the message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );

        // Check for BEGIN_GENERATION signal first
        const beginGenSignal = parseBeginGeneration(fullContent);
        console.debug("[Studio] parseBeginGeneration result", {
          beginGenSignal,
          fullContentLength: fullContent.length,
          fullContentPreview: fullContent.slice(0, 1200),
        });

        if (beginGenSignal) {
          // Clean the display text — remove the BEGIN_GENERATION signal
          const displayText = cleanDisplayText(fullContent);
          const cleanText = displayText
            .replace(/<think[\s\S]*?<\/think>/gi, "")
            .trim();

          // Update the message with cleaned text (no signal, no raw data)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: cleanText || "Starting database generation...",
                    interactiveOptions: null,
                  }
                : m,
            ),
          );

          // Set the schema immediately from the signal
          if (beginGenSignal.schema && beginGenSignal.schema.length > 0) {
            setGeneratedSchema(beginGenSignal.schema);
          }
          if (beginGenSignal.databaseName) {
            setDatabaseName(beginGenSignal.databaseName);
          }

          // Trigger the streaming generation pipeline
          setLoading(false);
          loadingRef.current = false;
          setReasoningVisible(false);
          setCurrentReasoning("");

          // Persist this turn immediately (BEGIN path returns before the generic save below)
          void saveConversation(undefined, undefined, undefined, [
            { role: "user", content: userMessage.content },
            {
              role: "assistant",
              content: cleanText || "Starting database generation...",
              agentName: "Orchestrator",
            },
          ]);

          const generationHistory = [
            ...historyBeforeThisTurn,
            { role: "user" as const, content: userMessage.content },
            {
              role: "assistant" as const,
              content: (cleanText || "Starting database generation...").slice(
                0,
                CHAT_API_MAX_CONTENT,
              ),
            },
          ].slice(-GENERATION_HISTORY_LIMIT);

          // Start streaming generation in the background
          startStreamingGeneration(beginGenSignal, assistantId, generationHistory);
          return;
        }

        const controlAction = parseAgentControlAction(fullContent);
        const snapshotDbId = controlAction?.databaseId || currentDatabaseId;

        if (controlAction?.action === "CREATE_SNAPSHOT") {
          const displayText = cleanDisplayText(fullContent);
          const cleanText = displayText
            .replace(/<think[\s\S]*?<\/think>/gi, "")
            .trim();

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: cleanText || "Creating snapshot...",
                    interactiveOptions: null,
                  }
                : m,
            ),
          );

          if (!snapshotDbId) {
            const errorMsg =
              "No active database selected for snapshot creation.";
            toast.error(errorMsg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: errorMsg } : m,
              ),
            );
            setLoading(false);
            loadingRef.current = false;
            setReasoningVisible(false);
            return;
          }

          try {
            const result = await apiPost<{ snapshot?: { id: string } }>(
              "/api/agent/db-access",
              {
                action: "create_snapshot",
                databaseId: snapshotDbId,
                name: controlAction.name,
              },
            );

            if (result.snapshot) {
              toast.success("Snapshot created successfully");
            } else {
              toast.info("Snapshot request completed.");
            }
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : "Snapshot creation failed";
            toast.error(errorMsg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Snapshot creation failed: ${errorMsg}` }
                  : m,
              ),
            );
          }

          setLoading(false);
          loadingRef.current = false;
          setReasoningVisible(false);
          return;
        }

        if (controlAction?.action === "LIST_SNAPSHOTS") {
          const displayText = cleanDisplayText(fullContent);
          const cleanText = displayText
            .replace(/<think[\s\S]*?<\/think>/gi, "")
            .trim();

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: cleanText || "Listing snapshots...",
                    interactiveOptions: null,
                  }
                : m,
            ),
          );

          if (!snapshotDbId) {
            const errorMsg =
              "No active database selected for snapshot listing.";
            toast.error(errorMsg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: errorMsg } : m,
              ),
            );
            setLoading(false);
            loadingRef.current = false;
            setReasoningVisible(false);
            return;
          }

          try {
            const result = await apiPost<{
              snapshots?: Array<{
                id: string;
                name: string;
                version: number;
                created_at: string;
              }>;
            }>("/api/agent/db-access", {
              action: "list_snapshots",
              databaseId: snapshotDbId,
            });

            const summary = (result.snapshots || [])
              .map(
                (s) =>
                  `- ${s.name} (version ${s.version}, created ${new Date(s.created_at).toLocaleString()})`,
              )
              .join("\n");
            const content = summary || "No snapshots found for this database.";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: content, interactiveOptions: null }
                  : m,
              ),
            );
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : "Snapshot listing failed";
            toast.error(errorMsg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Snapshot listing failed: ${errorMsg}` }
                  : m,
              ),
            );
          }

          setLoading(false);
          loadingRef.current = false;
          setReasoningVisible(false);
          return;
        }

        if (
          controlAction?.action === "GET_SNAPSHOT" &&
          controlAction.snapshotId
        ) {
          const displayText = cleanDisplayText(fullContent);
          const cleanText = displayText
            .replace(/<think[\s\S]*?<\/think>/gi, "")
            .trim();

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: cleanText || "Fetching snapshot details...",
                    interactiveOptions: null,
                  }
                : m,
            ),
          );

          try {
            const result = await apiPost<{
              snapshot?: {
                id: string;
                name: string;
                version: number;
                created_at: string;
              };
            }>("/api/agent/db-access", {
              action: "get_snapshot",
              snapshotId: controlAction.snapshotId,
            });

            if (result.snapshot) {
              const snap = result.snapshot;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: `Snapshot details:\n- Name: ${snap.name}\n- Version: ${snap.version}\n- Created: ${new Date(snap.created_at).toLocaleString()}`,
                        interactiveOptions: null,
                      }
                    : m,
                ),
              );
            } else {
              throw new Error("Snapshot not found");
            }
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : "Snapshot fetch failed";
            toast.error(errorMsg);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Snapshot fetch failed: ${errorMsg}` }
                  : m,
              ),
            );
          }

          setLoading(false);
          loadingRef.current = false;
          setReasoningVisible(false);
          return;
        }

        if (
          controlAction?.action === "RESTORE_SNAPSHOT" &&
          controlAction.snapshotId
        ) {
          // UI interception: block restore snapshot with warning
          toast.warning("Snapshot restore is disabled by policy");
          setLoading(false);
          loadingRef.current = false;
          setReasoningVisible(false);
          return;
        }

        // Check for Question Flow in the AI response
        try {
          const parsedFlow = parseQuestionsFromResponse(fullContent);
          if (parsedFlow && parsedFlow.questions.length > 0) {
            const flow = initializeQuestionFlow(
              parsedFlow.questions,
              parsedFlow.flowTitle || "AI Clarifying Questions",
            );
            setActiveFlow(flow);
          }
        } catch (err) {
          console.warn("[Studio] Failed to parse question flow:", err);
        }

        // Fallback: Parse the response for tables/data (legacy path — kept for backward compatibility)
        if (fullContent) {
          const {
            tables,
            databaseName: parsedName,
            displayText,
          } = parseAIResponse(fullContent);

          if (tables) {
            setActiveTab("data");
            const schema = extractSchema(tables);
            setGeneratedSchema(schema);
            setGeneratedData(tables);
            if (parsedName) setDatabaseName(parsedName);
            autoSaveData(tables, schema, parsedName);
            toast.success("Right panel updated from your request.");
          }

          // Update the message with cleaned display text — preserve interactiveOptions
          if (displayText && displayText !== fullContent) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: displayText,
                      interactiveOptions: lastInteractiveOptions,
                    }
                  : m,
              ),
            );
          } else {
            // Even if text didn't change, make sure options are preserved
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, interactiveOptions: lastInteractiveOptions }
                  : m,
              ),
            );
          }

          // Save conversation — explicit current turn (ref can lag behind React state)
          const assistantPersist =
            displayText && displayText.trim()
              ? displayText
              : fullContent.replace(/<think[\s\S]*?<\/think>/gi, "").trim();

          const msgsForSave = [
            ...historyBeforeThisTurn.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: "user", content: userMessage.content },
            {
              role: "assistant",
              content: assistantPersist,
              agentName: lastAgentName,
            },
          ].slice(-GENERATION_HISTORY_LIMIT);
          saveConversation(undefined, undefined, undefined, msgsForSave);
        }

        setLoading(false);
        loadingRef.current = false;
        setReasoningVisible(false);
        setCurrentReasoning("");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId),
          {
            id: assistantId,
            role: "assistant",
            content:
              "Sorry, I encountered an error connecting to the AI service. Please try again.",
            agentName: "System",
            timestamp: new Date(),
          },
        ]);
        setLoading(false);
        loadingRef.current = false;
        setReasoningVisible(false);
      }
    },
    [
      input,
      currentDatabaseId,
      databaseName,
      conversationId,
      generatedSchema,
      generatedData,
      hasGeneratedData,
      saveConversation,
    ],
  );

  // ─── Question Flow Answer Handler ───
  const handleFlowAnswer = useCallback(
    async (answer: string | string[] | null) => {
      if (!activeFlow) return;

      const nextFlow = recordAnswerAndAdvance(activeFlow, answer);

      if (nextFlow.isComplete) {
        // Format answers and send them back to the AI via chat so the AI
        // can process them and potentially emit BEGIN_GENERATION.
        const formattedAnswers = formatAnswersForAI(nextFlow);
        setActiveFlow(null);
        // Send the formatted answers as a user message to continue the conversation
        sendMessage(formattedAnswers);
      } else {
        setActiveFlow(nextFlow);
      }
    },
    [activeFlow, sendMessage],
  );

  // ✅ Auto-send query from dashboard — single effect, sendMessage included in deps
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !initialQuerySent) {
      const timer = setTimeout(() => {
        setInitialQuerySent(true);
        sendMessage(q);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchParams, initialQuerySent, sendMessage]); // ✅ sendMessage added to deps

  // ─── Manual save ───
  const saveToDatabase = async () => {
    if (!hasGeneratedData) {
      toast.error("No data to save");
      return;
    }
    setSaving(true);
    try {
      await autoSaveData(generatedData, generatedSchema);
    } finally {
      setSaving(false);
    }
  };

  // ─── Upload file handler ───
  const handleUpload = async (file: File) => {
    const text = await file.text();
    const name = file.name.endsWith(".json")
      ? file.name.slice(0, -5)
      : file.name;
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: name,
        fileType: file.type,
        content: text,
      }),
    });
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    const db = result.database;
    if (db) {
      setCurrentDatabaseId(db.id);
      setGeneratedSchema(db.schema_json || []);
      setGeneratedData(db.data_json || {});
      setDatabaseName(db.name);
      invalidateCache("/api/databases");
      toast.success("Database imported successfully");
    }
  };

  // ─── Delete database ───
  const performDeleteDatabase = async () => {
    if (!currentDatabaseId) return;
    try {
      await apiDelete(`/api/databases?id=${currentDatabaseId}`);
      invalidateCache("/api/databases");
      toast.success("Database deleted");
      setDeleteDbConfirmOpen(false);
      router.push("/dashboard");
    } catch {
      toast.error("Failed to delete database");
    }
  };

  const openSaveQueryDialog = () => {
    if (!sqlEditor.trim()) {
      toast.message("Nothing to save", {
        description: "Add SQL in the editor first.",
      });
      return;
    }
    setSaveQueryName(`Saved query ${savedQueries.length + 1}`);
    setSaveQueryDialogOpen(true);
  };

  const commitSaveQuery = () => {
    const trimmed = saveQueryName.trim();
    if (!trimmed) {
      toast.error("Enter a name for this query");
      return;
    }
    if (!sqlEditor.trim()) return;
    setSavedQueries((prev) => [...prev, { name: trimmed, sql: sqlEditor }]);
    toast.success("Query saved!");
    setSaveQueryDialogOpen(false);
  };

  // ─── New chat ───
  const startNewChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: "assistant",
        content: hasGeneratedData
          ? `Still on **${databaseName}** — what next?`
          : "Hi — what are you building? A single sentence is plenty to start.",
        agentName: "Orchestrator",
        timestamp: new Date(),
      },
    ]);
    setConversationId("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // ─── SQL Execution ───
  const executeSQL = async (sql: string, skipConfirm = false) => {
    if (!sql.trim()) return;

    if (!skipConfirm && isDestructiveSQL(sql)) {
      setSqlConfirmQuery(sql);
      setSqlConfirmOpen(true);
      return;
    }

    setSqlExecuting(true);
    setSqlResults(null);

    // Add to history
    setQueryHistory((prev) =>
      [sql, ...prev.filter((q) => q !== sql)].slice(0, 10),
    );

    try {
      // Build request payload - include client data as fallback when no databaseId
      const payload: Record<string, unknown> = { sql };
      if (currentDatabaseId) {
        payload.databaseId = currentDatabaseId;
      } else if (hasGeneratedData) {
        payload.data = generatedData;
      }

      const result = await apiPost<{
        rows?: Record<string, unknown>[];
        columns?: string[];
        error?: string;
        executionTime?: number;
        rowCount?: number;
      }>("/api/sql/execute", payload);

      if (result.error) {
        toast.error(result.error);
        setSqlResults({
          rows: [{ error: result.error }],
          columns: ["error"],
          executionTime: result.executionTime || 0,
        });
      } else if (result.rows) {
        setSqlResults({
          rows: result.rows,
          columns: result.columns || [],
          executionTime: result.executionTime || 0,
        });
        toast.success(
          `Query returned ${result.rowCount || result.rows.length} rows`,
        );
      }
    } catch (err) {
      toast.error("Failed to execute SQL");
      setSqlResults({
        rows: [{ error: "Execution failed" }],
        columns: ["error"],
        executionTime: 0,
      });
    } finally {
      setSqlExecuting(false);
    }
  };

  // ─── AI-assisted SQL generation ───
  // ✅ Removed setActiveTab("data") — the chat is in the LEFT panel (not a tab),
  // and switching the right panel to "data" hides the SQL editor the user was working in.
  const generateAIQL = () => {
    const prompt = `Generate a SQL query for the current database schema. Tables: ${generatedSchema.map((t) => `${t.name}(${t.columns.map((c) => `${c.name}:${c.type}`).join(", ")})`).join(", ")}. What kind of query?`;
    setInput(prompt);
  };

  // ─── Generate SQL from schema ───
  const generateSchemaSQL = (): string => {
    if (!generatedSchema.length) return "-- No schema generated yet";
    let sql = `-- SynthForge AI Generated Schema\n-- Database: ${databaseName || "untitled"}\n\n`;

    for (const table of generatedSchema) {
      sql += `CREATE TABLE ${table.name} (\n`;
      const cols = table.columns.map((col) => {
        let def = `  ${col.name} ${col.type.toUpperCase()}`;
        if (col.name === "id") def += " PRIMARY KEY";
        return def;
      });
      sql += cols.join(",\n");
      sql += "\n);\n\n";
    }
    return sql;
  };

  // ─── Handle option button click ───
  const handleOptionClick = (choice: OptionChoice) => {
    sendMessage(choice.value);
  };

  // ─── Render formatted message content ───
  const renderMessageContent = (message: Message) => {
    if (message.role === "user") {
      return (
        <span
          className="whitespace-pre-wrap break-words"
          style={{ overflowWrap: "break-word", wordBreak: "break-word" }}
        >
          {message.content}
        </span>
      );
    }

    // ─── Render generation progress UI ───
    if (message.generationProgress) {
      return (
        <GenerationProgressView
          gp={message.generationProgress}
          variant="compact"
        />
      );
    }

    let content = message.content;
    if (!content) {
      if (message.isStreaming) {
        return (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Thinking...</span>
          </div>
        );
      }
      return null;
    }

    // Clean any residual raw JSON blocks — also during streaming
    content = cleanDisplayText(content);
    // Strip <think/> and <thinking/> tags that may appear in streaming
    content = content.replace(/<think[\s\S]*?<\/think>/gi, "");
    content = content.replace(/<thinking[\s\S]*?<\/thinking>/gi, "");
    content = content.trim();

    if (!content) return null;

    return <ShowMoreText content={content} isStreaming={message.isStreaming} />;
  };

  // ─── Data editing state ───
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: string;
  } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [addTableDialogOpen, setAddTableDialogOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableColumns, setNewTableColumns] = useState("");
  const [addColumnDialogOpen, setAddColumnDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState("varchar(255)");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const handleAddTable = () => {
    if (!newTableName.trim()) return;
    const cols = newTableColumns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const defaultColumns = cols.length > 0 ? cols : ["id"];
    const emptyRow: Record<string, unknown> = {};
    for (const col of defaultColumns) {
      emptyRow[col] = col === "id" ? crypto.randomUUID() : null;
    }
    setGeneratedData((prev) => ({
      ...prev,
      [newTableName.trim()]: [emptyRow],
    }));
    setGeneratedSchema((prev) => [
      ...prev,
      {
        name: newTableName.trim(),
        columns: defaultColumns.map((c) => ({
          name: c,
          type: c === "id" ? "uuid" : "varchar(255)",
        })),
      },
    ]);
    setSelectedTable(newTableName.trim());
    setAddTableDialogOpen(false);
    setNewTableName("");
    setNewTableColumns("");
    toast.success(`Table "${newTableName.trim()}" created`);
  };

  const handleAddColumn = () => {
    if (!newColumnName.trim() || !selectedTable) return;
    setGeneratedSchema((prev) =>
      prev.map((t) =>
        t.name === selectedTable
          ? {
              ...t,
              columns: [
                ...t.columns,
                { name: newColumnName.trim(), type: newColumnType },
              ],
            }
          : t,
      ),
    );
    setGeneratedData((prev) => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return { ...r, [newColumnName.trim()]: null };
      }),
    }));
    setAddColumnDialogOpen(false);
    setNewColumnName("");
    setNewColumnType("varchar(255)");
    toast.success(`Column "${newColumnName.trim()}" added`);
  };

  const handleAddRow = () => {
    if (!selectedTable) return;
    const existing = (generatedData[selectedTable] || []) as Record<
      string,
      unknown
    >[];
    const schema = generatedSchema.find((t) => t.name === selectedTable);

    const schemaCols = schema?.columns?.map((c) => c.name) ?? [];
    const dataKeys =
      existing.length > 0
        ? [...new Set(existing.flatMap((r) => Object.keys(r)))]
        : [];

    const colNames: string[] = [];
    if (schemaCols.length > 0) {
      for (const name of schemaCols) colNames.push(name);
      for (const k of dataKeys) {
        if (!colNames.includes(k)) colNames.push(k);
      }
    } else if (dataKeys.length > 0) {
      colNames.push(...dataKeys);
    } else {
      colNames.push("id");
    }

    const emptyRow: Record<string, unknown> = {};
    for (const name of colNames) {
      emptyRow[name] = name === "id" ? crypto.randomUUID() : null;
    }

    const newLength = existing.length + 1;
    setGeneratedData((prev) => ({
      ...prev,
      [selectedTable]: [...(prev[selectedTable] || []), emptyRow],
    }));
    setVisibleRows((v) => Math.max(v, newLength));
    toast.success("Row added");
  };

  const handleCellEdit = (rowIndex: number, colName: string, value: string) => {
    if (!selectedTable) return;
    setGeneratedData((prev) => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).map(
        (row: unknown, i: number) => {
          const r = row as Record<string, unknown>;
          return i === rowIndex ? { ...r, [colName]: value } : r;
        },
      ),
    }));
    setEditingCell(null);
  };

  const handleDeleteSelectedRows = () => {
    if (!selectedTable || selectedRows.size === 0) return;
    setGeneratedData((prev) => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).filter(
        (_: unknown, i: number) => !selectedRows.has(i),
      ),
    }));
    setSelectedRows(new Set());
    toast.success(`${selectedRows.size} row(s) deleted`);
  };

  // ─── Current table data for display ───
  const currentTableData = selectedTable
    ? generatedData[selectedTable] || []
    : [];
  const currentTableColumns = useMemo(() => {
    if (!selectedTable) return [];
    const schema = generatedSchema.find((t) => t.name === selectedTable);
    if (currentTableData.length === 0) {
      if (schema?.columns?.length)
        return schema.columns.map((c) => c.name);
      return [];
    }
    const fromData = Object.keys(
      currentTableData[0] as Record<string, unknown>,
    );
    if (schema?.columns?.length) {
      const dataSet = new Set(fromData);
      const ordered: string[] = [];
      for (const c of schema.columns) {
        if (dataSet.has(c.name)) ordered.push(c.name);
      }
      for (const k of fromData) {
        if (!ordered.includes(k)) ordered.push(k);
      }
      return ordered;
    }
    return fromData;
  }, [currentTableData, selectedTable, generatedSchema]);
  const displayedRows = currentTableData.slice(0, visibleRows);
  const hasMoreRows = currentTableData.length > visibleRows;

  const { erLayout, svgWidth, svgHeight } = useMemo(() => {
    const empty = {
      erLayout: { nodes: [] as Array<{
        name: string;
        x: number;
        y: number;
        schema: SchemaTable;
        rows: number;
      }>, edges: [] as Array<{
        from: string;
        to: string;
        fromCol: string;
        toCol: string;
        type: string;
      }> },
      svgWidth: 600,
      svgHeight: 400,
    };

    const tableNames = Object.keys(generatedData);
    if (tableNames.length === 0) return empty;

    const nodes: typeof empty.erLayout.nodes = [];
    const edges: typeof empty.erLayout.edges = [];

    const colWidth = 220;
    const rowHeight = 200;
    const cols = Math.ceil(Math.sqrt(tableNames.length));

    tableNames.forEach((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const schema = generatedSchema.find((t) => t.name === name);
      const rows = (generatedData[name] as unknown[])?.length || 0;

      nodes.push({
        name,
        x: 60 + col * (colWidth + 80),
        y: 60 + row * (rowHeight + 40),
        schema: schema || { name, columns: [] },
        rows,
      });

      if (schema) {
        for (const colDef of schema.columns) {
          if (colDef.name.endsWith("_id") && colDef.name !== "id") {
            const targetTable = colDef.name.replace("_id", "");
            if (tableNames.includes(targetTable)) {
              edges.push({
                from: name,
                to: targetTable,
                fromCol: colDef.name,
                toCol: "id",
                type: "1:N",
              });
            }
          }
        }
      }
    });

    const erLayout = { nodes, edges };
    const svgWidth = Math.max(
      600,
      nodes.length > 0 ? Math.max(...nodes.map((n) => n.x)) + 280 : 600,
    );
    const svgHeight = Math.max(
      400,
      nodes.length > 0 ? Math.max(...nodes.map((n) => n.y)) + 250 : 400,
    );

    return { erLayout, svgWidth, svgHeight };
  }, [generatedSchema, generatedData]);

  /** Explorer sidebar: favorites first, then alphabetical. */
  const explorerSortedTables = useMemo(() => {
    const list = [...generatedSchema];
    list.sort((a, b) => {
      const af = favoriteTables.has(a.name) ? 0 : 1;
      const bf = favoriteTables.has(b.name) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [generatedSchema, favoriteTables]);

  const rightGenBannerIsError = Boolean(
    rightGenBanner?.startsWith("Could not"),
  );

  return (
    <div className="flex h-[calc(100vh-44px)] bg-background">
      {/* ─── Left Panel: AI Chat (resizable) ─── */}
      <div
        className="flex flex-col border-r bg-background shrink-0"
        style={{ width: chatWidth }}
      >
        {/* Chat Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <div>
              <h2 className="text-xs font-semibold">SynthForge AI</h2>
              <p className="text-[9px] text-muted-foreground">
                DeepSeek Reasoner
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={startNewChat}
              title="New Chat"
            >
              <Plus className="h-3 w-3" />
            </Button>
            {loading && (
              <Badge
                variant="secondary"
                className="text-[9px] gap-0.5 animate-pulse h-5"
              >
                <Brain className="h-2.5 w-2.5" />
                Thinking
              </Badge>
            )}
            {hasGeneratedData && !loading && (
              <Badge
                variant="outline"
                className="text-[9px] gap-0.5 text-emerald-600 border-emerald-300 h-5"
              >
                <Database className="h-2.5 w-2.5" />
                {Object.keys(generatedData).length} tables
              </Badge>
            )}
          </div>
        </div>

        {/* Agent status bar */}
        {loading &&
          messages.length > 0 &&
          (() => {
            const lastAssistant = [...messages]
              .reverse()
              .find((m) => m.role === "assistant");
            if (lastAssistant?.agentStatus) {
              const agent = getAgentByName(lastAssistant.agentStatus.agent);
              return (
                <div
                  className={`px-3 py-1.5 border-b shrink-0 ${agent?.bgColor || "bg-amber-50 dark:bg-amber-950/20"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <AgentIcon
                      agentName={lastAssistant.agentStatus.agent}
                      size="sm"
                    />
                    <span
                      className={`text-[10px] font-medium ${agent?.textColor || "text-amber-700 dark:text-amber-400"}`}
                    >
                      {lastAssistant.agentStatus.agent}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      · {lastAssistant.agentStatus.status}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${lastAssistant.agentStatus.progress}%`,
                          }}
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground">
                        {lastAssistant.agentStatus.progress}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

        {/* Reasoning indicator */}
        {reasoningVisible && currentReasoning && (
          <div className="px-3 py-1.5 border-b bg-amber-50 dark:bg-amber-950/20 shrink-0">
            <button
              onClick={() => setReasoningVisible(!reasoningVisible)}
              className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 w-full"
            >
              <Brain className="h-2.5 w-2.5" />
              <span className="font-medium">Reasoning...</span>
              <ChevronDown
                className={`h-2.5 w-2.5 ml-auto transition-transform ${reasoningVisible ? "rotate-180" : ""}`}
              />
            </button>
            {reasoningVisible && (
              <p className="mt-0.5 text-[9px] text-amber-600/80 dark:text-amber-400/80 line-clamp-3 leading-relaxed">
                {currentReasoning.slice(-300)}
              </p>
            )}
          </div>
        )}

        {/* Chat Messages */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-2.5 py-3 space-y-2.5 scroll-smooth"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-1.5 ${message.role === "user" ? "justify-end" : ""}`}
            >
              {message.role === "assistant" && (
                <AgentIcon agentName={message.agentName} size="sm" />
              )}
              <div
                className={`max-w-[88%] rounded-lg px-2.5 py-2 overflow-hidden ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/70"
                }`}
                style={{ overflowWrap: "break-word", wordBreak: "break-word" }}
              >
                {message.role === "assistant" && (
                  <p className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mb-0.5 flex items-center gap-1">
                    {message.agentName || "Orchestrator"}
                    {message.isStreaming && (
                      <span className="flex items-center gap-0.5">
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse [animation-delay:0.2s]" />
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse [animation-delay:0.4s]" />
                      </span>
                    )}
                  </p>
                )}
                {renderMessageContent(message)}

                {/* Interactive options buttons - show during streaming too, but disabled */}
                {message.role === "assistant" && message.interactiveOptions && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      {message.interactiveOptions.question}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {message.interactiveOptions.choices.map((choice) => {
                        const isMulti = !!message.interactiveOptions!.multi;
                        const selected = selections[message.id]?.has(
                          choice.value,
                        );
                        return (
                          <button
                            key={choice.value}
                            onClick={() => {
                              if (isMulti) {
                                setSelections((prev) => {
                                  const next = { ...prev };
                                  if (!next[message.id])
                                    next[message.id] = new Set();
                                  if (next[message.id].has(choice.value))
                                    next[message.id].delete(choice.value);
                                  else next[message.id].add(choice.value);
                                  return next;
                                });
                              } else {
                                handleOptionClick(choice);
                              }
                            }}
                            disabled={message.isStreaming}
                            className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                              message.isStreaming
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            } ${
                              isMulti
                                ? selected
                                  ? "border-violet-600 bg-violet-100 text-violet-800"
                                  : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                                : message.interactiveOptions!.multi
                                  ? "border-violet-300 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/50"
                                  : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                            }`}
                          >
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Multi-select submit */}
                    {message.interactiveOptions.multi && (
                      <div className="mt-2 flex gap-2 items-center">
                        <button
                          onClick={async () => {
                            const vals = Array.from(
                              selections[message.id] || [],
                            );
                            if (vals.length === 0) return;
                            await sendMessage(vals.join(", "));
                            setSelections((prev) => {
                              const n = { ...prev };
                              delete n[message.id];
                              return n;
                            });
                          }}
                          disabled={message.isStreaming}
                          className="text-xs px-3 py-1 rounded bg-amber-600 text-white"
                        >
                          Submit
                        </button>
                        <button
                          onClick={() =>
                            setSelections((prev) => {
                              const n = { ...prev };
                              delete n[message.id];
                              return n;
                            })
                          }
                          className="text-xs px-3 py-1 rounded border"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Custom answer field */}
                    {message.interactiveOptions.customAnswer && (
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={customAnswers[message.id] || ""}
                          onChange={(e) =>
                            setCustomAnswers((prev) => ({
                              ...prev,
                              [message.id]: e.target.value,
                            }))
                          }
                          placeholder="Type your answer..."
                          disabled={message.isStreaming}
                        />
                        <Button
                          onClick={async () => {
                            const v = customAnswers[message.id];
                            if (!v) return;
                            await sendMessage(v);
                            setCustomAnswers((prev) => {
                              const n = { ...prev };
                              delete n[message.id];
                              return n;
                            });
                          }}
                          disabled={message.isStreaming}
                        >
                          Send
                        </Button>
                      </div>
                    )}

                    {/* Skip button */}
                    {message.interactiveOptions.skip && (
                      <div className="mt-2">
                        <button
                          onClick={() => sendMessage("__SKIP__")}
                          className="text-xs px-3 py-1 rounded border"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {message.role === "user" && (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {loading &&
            messages.length > 0 &&
            !messages[messages.length - 1]?.isStreaming && (
              <div className="flex gap-1.5">
                <AgentIcon agentName="Orchestrator" size="sm" />
                <div className="bg-muted/70 rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      Connecting...
                    </span>
                  </div>
                </div>
              </div>
            )}
          {activeFlow && (
            <QuestionFlowPanel
              flow={activeFlow}
              onAnswer={handleFlowAnswer}
              onCancel={() => setActiveFlow(null)}
            />
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input - Multi-line textarea with Enter to send, Shift+Enter for newline */}
        <div className="px-2.5 py-2 border-t bg-card shrink-0">
          <div className="flex gap-1.5 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeFlow
                  ? "Complete the clarifying questions above to continue..."
                  : "Describe the data you need... (Shift+Enter for new line)"
              }
              disabled={loading || !!activeFlow}
              className="flex-1 text-xs p-2 rounded border border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none min-h-8 max-h-24"
              rows={1}
              style={{ overflow: "hidden" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 96) + "px";
              }}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !!activeFlow}
              size="sm"
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-8 w-8 p-0 shrink-0"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Resize Handle ─── */}
      <div
        ref={resizeRef}
        className="w-1.5 cursor-col-resize bg-border hover:bg-amber-400 transition-colors shrink-0 active:bg-amber-500"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* ─── Right Panel: Data/SQL/Explorer ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Upload Panel - for importing databases */}
        <UploadPanel onUpload={handleUpload} />

        {(generationProgress.isGenerating || rightGenBanner !== null) && (
          <div className="mx-3 mt-2 mb-1 shrink-0">
            <GenerationProgressView
              gp={generationProgress}
              doneLine={rightGenBanner}
              doneIsError={rightGenBannerIsError}
              variant="card"
            />
          </div>
        )}

        {/* Panel Header */}
        <div className="px-3 py-2 border-b flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2">
            {hasGeneratedData && (
              <>
                <Database className="h-3.5 w-3.5 text-amber-600" />
                <Input
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  className="h-6 text-xs font-medium border-transparent hover:border-input focus:border-input w-44 px-1"
                />
              </>
            )}
            {!hasGeneratedData && (
              <span className="text-xs text-muted-foreground">
                No database generated yet
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {hasGeneratedData && (
              <>
                {/* Export Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                    >
                      <Download className="h-2.5 w-2.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        exportAsSQL(
                          generatedSchema,
                          generatedData,
                          `${databaseName || "database"}.sql`,
                        )
                      }
                    >
                      <FileText className="mr-2 h-3 w-3" />
                      SQL Dump (.sql)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        if (selectedTable && currentTableData.length > 0) {
                          exportAsCSV(
                            currentTableData as Record<string, unknown>[],
                            `${databaseName}_${selectedTable}.csv`,
                          );
                        } else {
                          // Export all tables as one CSV
                          const allRows: Record<string, unknown>[] = [];
                          for (const [tableName, rows] of Object.entries(
                            generatedData,
                          )) {
                            for (const row of rows as Record<
                              string,
                              unknown
                            >[]) {
                              allRows.push({ _table: tableName, ...row });
                            }
                          }
                          if (allRows.length > 0)
                            exportAsCSV(
                              allRows,
                              `${databaseName || "database"}.csv`,
                            );
                        }
                      }}
                    >
                      <FileSpreadsheet className="mr-2 h-3 w-3" />
                      CSV (.csv)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        exportAsJSON(
                          generatedData,
                          `${databaseName || "database"}.json`,
                        )
                      }
                    >
                      <FileJson className="mr-2 h-3 w-3" />
                      JSON (.json)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={saveToDatabase}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Save className="h-2.5 w-2.5" />
                  )}
                  Save
                </Button>
                {currentDatabaseId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteDbConfirmOpen(true)}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    Delete
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {hasGeneratedData ? (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-3 pt-1.5 border-b shrink-0">
              <TabsList className="h-8">
                <TabsTrigger value="data" className="text-[11px] gap-1 px-2.5">
                  <Table2 className="h-3 w-3" />
                  Data
                </TabsTrigger>
                <TabsTrigger value="sql" className="text-[11px] gap-1 px-2.5">
                  <Code2 className="h-3 w-3" />
                  SQL
                </TabsTrigger>
                <TabsTrigger
                  value="explorer"
                  className="text-[11px] gap-1 px-2.5"
                  title="Schema overview and ER diagram"
                >
                  <GitBranch className="h-3 w-3" />
                  Explorer
                  {generatedSchema.length > 0 && (
                    <span className="ml-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground">
                      {generatedSchema.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ─── Data Tab ─── */}
            <TabsContent value="data" className="flex-1 overflow-hidden m-0">
              <div className="flex h-full">
                {/* Table selector sidebar */}
                <div className="w-44 border-r bg-muted/25 flex flex-col shrink-0">
                  <div className="px-2.5 py-2 border-b flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Layers
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      <span className="text-[11px] font-medium text-foreground truncate">
                        Tables
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      onClick={() => setAddTableDialogOpen(true)}
                      title="Add Table"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5 max-h-96">
                    {Object.entries(generatedData).map(([tableName, rows]) => (
                      <button
                        key={tableName}
                        onClick={() => {
                          setSelectedTable(tableName);
                          setVisibleRows(20);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 group ${
                          selectedTable === tableName
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                        }`}
                      >
                        <Table2 className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{tableName}</span>
                        <Badge
                          variant="outline"
                          className="ml-auto text-[8px] px-0.5 py-0 min-w-[16px] text-center"
                        >
                          {rows.length}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data grid */}
                <div className="flex-1 flex flex-col min-w-0">
                  {selectedTable ? (
                    currentTableColumns.length > 0 ? (
                    <>
                      <div className="px-2.5 py-2 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 bg-muted/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Table2
                            className="h-3.5 w-3.5 shrink-0 text-primary"
                            aria-hidden
                          />
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {selectedTable}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {currentTableData.length.toLocaleString()} row
                              {currentTableData.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/60">
                            <MousePointerClick
                              className="h-3 w-3 shrink-0 text-primary"
                              aria-hidden
                            />
                            Double-click a cell to edit
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[9px] gap-0.5 px-1"
                            onClick={handleAddRow}
                            title="Add Row"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Row
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[9px] gap-0.5 px-1"
                            onClick={() => setAddColumnDialogOpen(true)}
                            title="Add Column"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Col
                          </Button>
                          {selectedRows.size > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[9px] gap-0.5 px-1 text-destructive hover:text-destructive"
                              onClick={handleDeleteSelectedRows}
                              title="Delete Selected Rows"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                              Del
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() =>
                              copyToClipboard(
                                JSON.stringify(currentTableData, null, 2),
                              )
                            }
                          >
                            <Copy className="h-2.5 w-2.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() =>
                              exportAsJSON(
                                currentTableData,
                                `${selectedTable}.json`,
                              )
                            }
                          >
                            <Download className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="sticky top-0 z-10 bg-background">
                            <tr className="border-b">
                              <th className="text-left py-1.5 px-1 font-medium text-muted-foreground bg-muted/50 border-r w-6">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={
                                    selectedRows.size ===
                                      displayedRows.length &&
                                    displayedRows.length > 0
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRows(
                                        new Set(displayedRows.map((_, i) => i)),
                                      );
                                    } else {
                                      setSelectedRows(new Set());
                                    }
                                  }}
                                />
                              </th>
                              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground bg-muted/50 border-r w-8">
                                #
                              </th>
                              {currentTableColumns.map((col) => {
                                const kind = getDataColumnKind(col);
                                const colMeta = generatedSchema
                                  .find((t) => t.name === selectedTable)
                                  ?.columns.find((c) => c.name === col);
                                return (
                                  <th
                                    key={col}
                                    className={cn(
                                      "text-left py-2 px-2 align-bottom whitespace-nowrap border-r border-border/70 last:border-r-0 min-w-[104px]",
                                      kind === "pk" &&
                                        "bg-primary/10 text-foreground border-b-2 border-b-primary",
                                      kind === "fk" &&
                                        "bg-sky-500/10 dark:bg-sky-950/35 text-foreground border-b-2 border-b-sky-500/55",
                                      kind === "regular" &&
                                        "bg-muted/40 text-muted-foreground border-b border-border",
                                    )}
                                  >
                                    <div className="flex flex-col gap-1.5">
                                      <div className="flex flex-wrap items-center gap-1">
                                        {kind === "pk" && (
                                          <span
                                            className="inline-flex items-center gap-0.5 rounded-md bg-primary/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary"
                                            title="Primary key"
                                          >
                                            <KeyRound
                                              className="h-2.5 w-2.5"
                                              aria-hidden
                                            />
                                            PK
                                          </span>
                                        )}
                                        {kind === "fk" && (
                                          <span
                                            className="inline-flex items-center gap-0.5 rounded-md bg-sky-500/20 dark:bg-sky-400/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200"
                                            title="Foreign key — points to another table"
                                          >
                                            <Link2
                                              className="h-2.5 w-2.5"
                                              aria-hidden
                                            />
                                            FK
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[11px] font-semibold text-foreground leading-tight">
                                        {humanizeColumnName(col)}
                                      </span>
                                      <span className="text-[9px] font-mono text-muted-foreground">
                                        {col}
                                      </span>
                                      {colMeta && (
                                        <Badge
                                          variant="outline"
                                          className="w-fit text-[8px] px-1 py-0 font-mono font-normal text-muted-foreground border-muted-foreground/30"
                                        >
                                          {colMeta.type}
                                        </Badge>
                                      )}
                                      {columnPlainEnglishHint(col) && (
                                        <span className="text-[9px] text-muted-foreground leading-snug">
                                          {columnPlainEnglishHint(col)}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={2 + currentTableColumns.length}
                                  className="py-8 px-4 text-center text-xs text-muted-foreground"
                                >
                                  No rows in this table yet. Click{" "}
                                  <span className="font-semibold text-foreground">
                                    Row
                                  </span>{" "}
                                  above to add one, then double-click a cell to
                                  edit.
                                </td>
                              </tr>
                            ) : (
                            displayedRows.map((row, i) => (
                              <tr
                                key={i}
                                className={`border-b hover:bg-muted/30 transition-colors ${selectedRows.has(i) ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
                              >
                                <td className="py-1 px-1 border-r bg-muted/20">
                                  <input
                                    type="checkbox"
                                    className="h-3 w-3"
                                    checked={selectedRows.has(i)}
                                    onChange={(e) => {
                                      setSelectedRows((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(i);
                                        else next.delete(i);
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="py-1 px-2 text-muted-foreground font-mono text-[9px] border-r bg-muted/20">
                                  {i + 1}
                                </td>
                                {currentTableColumns.map((colName) => {
                                  const r = row as Record<string, unknown>;
                                  const val = r[colName];
                                  const kind = getDataColumnKind(colName);
                                  return (
                                    <td
                                      key={colName}
                                      className={cn(
                                        "py-1.5 px-2 font-mono text-[10px] whitespace-nowrap max-w-[200px] truncate border-r border-border/50 last:border-r-0 transition-colors",
                                        kind === "pk" &&
                                          "bg-primary/[0.07] text-foreground",
                                        kind === "fk" &&
                                          "bg-sky-500/[0.08] dark:bg-sky-950/25",
                                      )}
                                      onDoubleClick={() => {
                                        setEditingCell({ row: i, col: colName });
                                        setEditingCellValue(
                                          val === null ? "" : String(val),
                                        );
                                      }}
                                    >
                                      {editingCell?.row === i &&
                                      editingCell?.col === colName ? (
                                        <input
                                          type="text"
                                          className="w-full h-5 text-[10px] font-mono px-1 border border-primary/60 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                          value={editingCellValue}
                                          autoFocus
                                          onChange={(e) =>
                                            setEditingCellValue(e.target.value)
                                          }
                                          onBlur={() =>
                                            handleCellEdit(
                                              i,
                                              colName,
                                              editingCellValue,
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter")
                                              handleCellEdit(
                                                i,
                                                colName,
                                                editingCellValue,
                                              );
                                            if (e.key === "Escape")
                                              setEditingCell(null);
                                          }}
                                        />
                                      ) : val === null ? (
                                        <span className="text-muted-foreground italic">
                                          NULL
                                        </span>
                                      ) : typeof val === "boolean" ? (
                                        <Badge
                                          variant={
                                            val ? "default" : "secondary"
                                          }
                                          className="text-[8px] px-1 py-0"
                                        >
                                          {String(val)}
                                        </Badge>
                                      ) : typeof val === "number" ? (
                                        <span className="text-blue-600 dark:text-blue-400 tabular-nums">
                                          {String(val)}
                                        </span>
                                      ) : (
                                        String(val ?? "")
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {hasMoreRows && (
                        <div className="px-2.5 py-1.5 border-t bg-muted/30 text-center shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-6"
                            onClick={() => setVisibleRows((prev) => prev + 20)}
                          >
                            Load more ({currentTableData.length - visibleRows}{" "}
                            remaining)
                            <ChevronDown className="ml-1 h-2.5 w-2.5" />
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center border-t">
                      <div className="rounded-full bg-muted p-4">
                        <Table2
                          className="h-8 w-8 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                      <div className="space-y-1 max-w-sm">
                        <p className="text-sm font-medium text-foreground">
                          No columns in this table yet
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Use{" "}
                          <span className="font-semibold text-foreground">
                            Col
                          </span>{" "}
                          above to add fields. After that you can add rows and
                          double-click cells to edit.
                        </p>
                      </div>
                    </div>
                  )
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                      <div className="rounded-full bg-primary/10 p-4">
                        <Database
                          className="h-8 w-8 text-primary/80"
                          aria-hidden
                        />
                      </div>
                      <div className="space-y-1 max-w-sm">
                        <p className="text-sm font-medium text-foreground">
                          Pick a table on the left
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="inline-flex items-center gap-1 font-medium text-primary">
                            <KeyRound className="h-3 w-3" aria-hidden />
                            Primary
                          </span>{" "}
                          and{" "}
                          <span className="inline-flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                            <Link2 className="h-3 w-3" aria-hidden />
                            foreign
                          </span>{" "}
                          columns are tinted so you can scan relationships
                          quickly.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ─── SQL Tab ─── */}
            <TabsContent value="sql" className="flex-1 overflow-hidden m-0">
              <div className="flex flex-col h-full">
                {/* SQL Editor */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-3 py-1.5 border-b flex items-center justify-between shrink-0 bg-muted/30">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      SQL Editor
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] gap-0.5 px-1.5"
                        onClick={generateAIQL}
                        title="Ask AI to generate SQL"
                      >
                        <Wand2 className="h-2.5 w-2.5" />
                        AI Generate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] gap-0.5 px-1.5"
                        onClick={() => setSqlEditor(generateSchemaSQL())}
                      >
                        <Code2 className="h-2.5 w-2.5" />
                        Schema
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 relative">
                    <textarea
                      value={sqlEditor}
                      onChange={(e) => setSqlEditor(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          executeSQL(sqlEditor);
                        }
                      }}
                      placeholder="-- Write SQL here... (Ctrl+Enter to execute)&#10;SELECT * FROM users LIMIT 10;"
                      className="w-full h-full p-3 text-[12px] font-mono bg-background resize-none focus:outline-none leading-relaxed"
                      spellCheck={false}
                    />
                  </div>
                </div>

                {/* SQL toolbar */}
                <div className="px-3 py-1.5 border-t flex items-center gap-1.5 bg-muted/30 shrink-0">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-6 text-[10px] gap-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
                    onClick={() => executeSQL(sqlEditor)}
                    disabled={sqlExecuting || !sqlEditor.trim()}
                  >
                    {sqlExecuting ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Play className="h-2.5 w-2.5" />
                    )}
                    Run
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() =>
                      copyToClipboard(sqlEditor || generateSchemaSQL())
                    }
                  >
                    <Copy className="h-2.5 w-2.5" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => {
                      const content = sqlEditor || generateSchemaSQL();
                      const blob = new Blob([content], { type: "text/sql" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${databaseName || "schema"}.sql`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-2.5 w-2.5" />
                    Download
                  </Button>

                  <div className="flex-1" />

                  {/* Query history dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-0.5"
                      >
                        <History className="h-2.5 w-2.5" />
                        History ({queryHistory.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      {queryHistory.length === 0 ? (
                        <DropdownMenuItem disabled>
                          No queries yet
                        </DropdownMenuItem>
                      ) : (
                        queryHistory.map((q, i) => (
                          <DropdownMenuItem
                            key={i}
                            onClick={() => setSqlEditor(q)}
                          >
                            <code className="text-[10px] truncate max-w-[280px]">
                              {q}
                            </code>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* ✅ Saved queries: split into two separate buttons.
                      Before: one DropdownMenuTrigger button had both an onClick (browser prompt)
                      AND opened the dropdown — both fired simultaneously on click. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-0.5"
                    onClick={openSaveQueryDialog}
                  >
                    <Save className="h-2.5 w-2.5" />
                    Save
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-0.5"
                      >
                        <History className="h-2.5 w-2.5" />
                        Saved ({savedQueries.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      {savedQueries.length === 0 ? (
                        <DropdownMenuItem disabled>
                          No saved queries
                        </DropdownMenuItem>
                      ) : (
                        savedQueries.map((sq, i) => (
                          <DropdownMenuItem
                            key={i}
                            onClick={() => setSqlEditor(sq.sql)}
                          >
                            <span className="text-[10px] font-medium mr-2">
                              {sq.name}
                            </span>
                            <code className="text-[9px] text-muted-foreground truncate max-w-[200px]">
                              {sq.sql}
                            </code>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* SQL Results */}
                {sqlResults && (
                  <div className="border-t max-h-64 overflow-auto shrink-0">
                    <div className="px-3 py-1 border-b bg-muted/30 flex items-center justify-between sticky top-0 z-10">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Results ({sqlResults.rows.length} rows ·{" "}
                        {sqlResults.executionTime}ms)
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[9px] gap-0.5 px-1"
                          onClick={() =>
                            exportAsCSV(sqlResults.rows, "query_results.csv")
                          }
                        >
                          <Download className="h-2.5 w-2.5" />
                          CSV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[9px] gap-0.5 px-1"
                          onClick={() =>
                            exportAsJSON(sqlResults.rows, "query_results.json")
                          }
                        >
                          <Download className="h-2.5 w-2.5" />
                          JSON
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => setSqlResults(null)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="sticky top-[33px] z-10 bg-background">
                        <tr className="border-b">
                          {sqlResults.columns.map((col) => (
                            <th
                              key={col}
                              className="text-left py-1 px-2 font-medium text-muted-foreground bg-muted/50 whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResults.rows.slice(0, 100).map((row, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            {sqlResults.columns.map((col) => (
                              <td
                                key={col}
                                className="py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[200px] truncate"
                              >
                                {row[col] === null ? (
                                  <span className="italic text-muted-foreground">
                                    NULL
                                  </span>
                                ) : (
                                  String(row[col] ?? "")
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── Explorer Tab ─── */}
            <TabsContent
              value="explorer"
              className="flex-1 overflow-hidden m-0"
            >
              <div className="flex h-full">
                {/* Schema overview sidebar */}
                <div className="w-60 border-r bg-muted/20 flex flex-col shrink-0 overflow-hidden">
                  <div className="px-2.5 py-2 border-b shrink-0 bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <GitBranch
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-foreground truncate">
                            Schema
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-5 font-medium tabular-nums shrink-0"
                          >
                            {generatedSchema.length} table
                            {generatedSchema.length === 1 ? "" : "s"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                          Primary keys (PK), foreign keys (FK), types, and
                          plain-English hints. Star a table to pin it to the top.
                        </p>
                      </div>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 p-2">
                    <div className="space-y-2 pr-1">
                      {explorerSortedTables.map((table) => {
                        const tableData = generatedData[table.name] as
                          | Record<string, unknown>[]
                          | undefined;
                        const isFav = favoriteTables.has(table.name);
                        return (
                          <div
                            key={table.name}
                            className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden"
                          >
                            <div className="px-2.5 py-2 bg-muted/50 border-b border-border/60 flex items-start gap-2">
                              <Table2
                                className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5"
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-semibold font-mono text-foreground truncate">
                                    {table.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 h-5 tabular-nums font-medium"
                                  >
                                    {table.columns.length} col
                                    {table.columns.length === 1 ? "" : "s"}
                                  </Badge>
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1.5 py-0 h-5 tabular-nums"
                                  >
                                    {tableData?.length ?? 0} rows
                                  </Badge>
                                </div>
                              </div>
                              <button
                                type="button"
                                title={
                                  isFav ? "Unpin from top" : "Pin to top of list"
                                }
                                onClick={() => {
                                  setFavoriteTables((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(table.name))
                                      next.delete(table.name);
                                    else next.add(table.name);
                                    return next;
                                  });
                                }}
                                className="shrink-0 rounded-md p-1 hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {isFav ? (
                                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                ) : (
                                  <StarOff className="h-3.5 w-3.5 opacity-60" />
                                )}
                              </button>
                            </div>
                            <ul className="p-2 space-y-1.5 bg-background/40">
                              {table.columns.map((col) => {
                                const kind = getDataColumnKind(col.name);
                                const hint = columnPlainEnglishHint(col.name);
                                const label = humanizeColumnName(col.name);
                                return (
                                  <li
                                    key={col.name}
                                    className="rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5 text-[10px] leading-snug"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {kind === "pk" && (
                                            <Badge
                                              variant="secondary"
                                              className="text-[8px] px-1 py-0 h-4 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold"
                                            >
                                              PK
                                            </Badge>
                                          )}
                                          {kind === "fk" && (
                                            <Badge
                                              variant="secondary"
                                              className="text-[8px] px-1 py-0 h-4 bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 font-semibold"
                                            >
                                              FK
                                            </Badge>
                                          )}
                                          <span className="font-mono font-medium text-foreground">
                                            {col.name}
                                          </span>
                                        </div>
                                        {label !== col.name && (
                                          <p className="text-[9px] text-muted-foreground truncate">
                                            {label}
                                          </p>
                                        )}
                                        {hint && (
                                          <p className="text-[9px] text-muted-foreground/90 italic line-clamp-2">
                                            {hint}
                                          </p>
                                        )}
                                      </div>
                                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded border border-border/40 max-w-[5.5rem] truncate" title={col.type}>
                                        {col.type}
                                      </span>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                            {tableData && tableData.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTable(table.name);
                                  setActiveTab("data");
                                  setVisibleRows(20);
                                }}
                                className="w-full px-2.5 py-2 text-[10px] font-medium text-primary hover:bg-primary/5 border-t border-border/60 transition-colors flex items-center justify-center gap-1"
                              >
                                <MousePointerClick className="h-3 w-3 shrink-0" />
                                Open in Data tab
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* ER Diagram visualization */}
                <div className="flex-1 relative overflow-hidden bg-muted/10">
                  {/* Zoom controls */}
                  <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 bg-card border rounded-lg px-1.5 py-1 shadow-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() =>
                        setExplorerZoom((z) => Math.max(0.3, z - 0.2))
                      }
                    >
                      <ZoomOut className="h-3 w-3" />
                    </Button>
                    <span className="text-[9px] font-mono min-w-[32px] text-center">
                      {Math.round(explorerZoom * 100)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() =>
                        setExplorerZoom((z) => Math.min(2, z + 0.2))
                      }
                    >
                      <ZoomIn className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => {
                        setExplorerZoom(1);
                        setExplorerPan({ x: 0, y: 0 });
                      }}
                    >
                      <Move className="h-3 w-3" />
                    </Button>
                    </div>
                    <p className="text-[9px] text-muted-foreground bg-card/95 border border-border/80 rounded-md px-2 py-0.5 shadow-sm pointer-events-none">
                      Drag canvas to pan
                    </p>
                  </div>

                  <div
                    className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => {
                      setIsPanning(true);
                      setPanStart({
                        x: e.clientX - explorerPan.x,
                        y: e.clientY - explorerPan.y,
                      });
                    }}
                    onMouseMove={(e) => {
                      if (isPanning) {
                        // Clamp pan values to prevent runaway transforms
                        const nextX = e.clientX - panStart.x;
                        const nextY = e.clientY - panStart.y;
                        const clamp = (v: number) =>
                          Math.max(-3000, Math.min(3000, v));
                        setExplorerPan({ x: clamp(nextX), y: clamp(nextY) });
                      }
                    }}
                    onMouseUp={() => setIsPanning(false)}
                    onMouseLeave={() => setIsPanning(false)}
                  >
                    <svg
                      width={svgWidth}
                      height={svgHeight}
                      style={{
                        transform: `translate(${explorerPan.x}px, ${explorerPan.y}px) scale(${explorerZoom})`,
                        transformOrigin: "0 0",
                      }}
                    >
                      {/* SVG defs for arrowheads */}
                      <defs>
                        <marker
                          id="arrowhead-many"
                          markerWidth="12"
                          markerHeight="8"
                          refX="12"
                          refY="4"
                          orient="auto"
                          markerUnits="strokeWidth"
                        >
                          <path d="M0,0 L12,4 L0,8 L3,4 Z" fill="#8b5cf6" />
                        </marker>
                        <marker
                          id="arrowhead-one"
                          markerWidth="8"
                          markerHeight="12"
                          refX="4"
                          refY="6"
                          orient="auto"
                          markerUnits="strokeWidth"
                        >
                          <line
                            x1="4"
                            y1="0"
                            x2="4"
                            y2="12"
                            stroke="#8b5cf6"
                            strokeWidth="2"
                          />
                        </marker>
                        <marker
                          id="crowfoot-many"
                          markerWidth="14"
                          markerHeight="14"
                          refX="14"
                          refY="7"
                          orient="auto"
                          markerUnits="strokeWidth"
                        >
                          <line
                            x1="0"
                            y1="0"
                            x2="14"
                            y2="7"
                            stroke="#8b5cf6"
                            strokeWidth="1.5"
                          />
                          <line
                            x1="0"
                            y1="14"
                            x2="14"
                            y2="7"
                            stroke="#8b5cf6"
                            strokeWidth="1.5"
                          />
                          <line
                            x1="0"
                            y1="7"
                            x2="14"
                            y2="7"
                            stroke="#8b5cf6"
                            strokeWidth="1.5"
                          />
                        </marker>
                        <marker
                          id="arrow-filled"
                          markerWidth="10"
                          markerHeight="7"
                          refX="10"
                          refY="3.5"
                          orient="auto"
                          markerUnits="strokeWidth"
                        >
                          <polygon points="0,0 10,3.5 0,7" fill="#7c3aed" />
                        </marker>
                      </defs>

                      {/* Render relationship lines */}
                      {erLayout.edges.map((edge, i) => {
                        const fromNode = erLayout.nodes.find(
                          (n) => n.name === edge.from,
                        );
                        const toNode = erLayout.nodes.find(
                          (n) => n.name === edge.to,
                        );
                        if (!fromNode || !toNode) return null;

                        const fromNodeWidth = 200;
                        const fromHeaderHeight = 24;
                        const fromColHeight = 14;
                        const fromNodeHeight =
                          fromHeaderHeight +
                          Math.min(fromNode.schema.columns.length, 8) *
                            fromColHeight +
                          8;

                        const toNodeWidth = 200;
                        const toHeaderHeight = 24;
                        const toColHeight = 14;
                        const toNodeHeight =
                          toHeaderHeight +
                          Math.min(toNode.schema.columns.length, 8) *
                            toColHeight +
                          8;

                        const fromCenterX = fromNode.x + fromNodeWidth / 2;
                        const fromCenterY = fromNode.y + fromNodeHeight / 2;
                        const toCenterX = toNode.x + toNodeWidth / 2;
                        const toCenterY = toNode.y + toNodeHeight / 2;

                        const dx = toCenterX - fromCenterX;
                        const dy = toCenterY - fromCenterY;

                        let fromX: number, fromY: number;
                        if (
                          Math.abs(dx) * fromNodeHeight >
                          Math.abs(dy) * fromNodeWidth
                        ) {
                          fromX =
                            dx > 0 ? fromNode.x + fromNodeWidth : fromNode.x;
                          fromY =
                            fromCenterY + (fromX - fromCenterX) * (dy / dx);
                        } else {
                          fromY =
                            dy > 0 ? fromNode.y + fromNodeHeight : fromNode.y;
                          fromX =
                            fromCenterX + (fromY - fromCenterY) * (dx / dy);
                        }

                        let toX: number, toY: number;
                        if (
                          Math.abs(dx) * toNodeHeight >
                          Math.abs(dy) * toNodeWidth
                        ) {
                          toX = dx > 0 ? toNode.x : toNode.x + toNodeWidth;
                          toY = toCenterY + (toX - toCenterX) * (dy / dx);
                        } else {
                          toY = dy > 0 ? toNode.y : toNode.y + toNodeHeight;
                          toX = toCenterX + (toY - toCenterY) * (dx / dy);
                        }

                        const fkColumn = fromNode.schema.columns.find(
                          (c) => c.name === edge.fromCol,
                        );
                        const isOptional =
                          fkColumn?.type?.toLowerCase().includes("null") ||
                          false;

                        const midX = (fromX + toX) / 2;
                        const midY = (fromY + toY) / 2;

                        const labelText = edge.fromCol;
                        const labelWidth = labelText.length * 5.5 + 8;
                        const labelHeight = 12;

                        return (
                          <g key={`edge-${i}`}>
                            <line
                              x1={fromX}
                              y1={fromY}
                              x2={toX}
                              y2={toY}
                              stroke="#8b5cf6"
                              strokeWidth={4}
                              strokeDasharray={isOptional ? "8 4" : "none"}
                              opacity={0.15}
                            />
                            <line
                              x1={fromX}
                              y1={fromY}
                              x2={toX}
                              y2={toY}
                              stroke="#7c3aed"
                              strokeWidth={2}
                              strokeDasharray={isOptional ? "8 4" : "none"}
                              markerEnd="url(#arrow-filled)"
                            />
                            <rect
                              x={midX - labelWidth / 2}
                              y={midY - labelHeight / 2 - 9}
                              width={labelWidth}
                              height={labelHeight}
                              rx={3}
                              fill="#ffffff"
                              stroke="#8b5cf6"
                              strokeWidth={0.8}
                            />
                            <text
                              x={midX}
                              y={midY - 3}
                              textAnchor="middle"
                              fill="#6d28d9"
                              fontSize={7}
                              fontWeight={500}
                              fontFamily="monospace"
                            >
                              {labelText}
                            </text>
                            <text
                              x={toX + (fromX - toX) * 0.1}
                              y={toY + (fromY - toY) * 0.1 - 5}
                              textAnchor="middle"
                              fill="#7c3aed"
                              fontSize={10}
                              fontWeight={700}
                            >
                              1
                            </text>
                            <text
                              x={fromX + (toX - fromX) * 0.1}
                              y={fromY + (toY - fromY) * 0.1 - 5}
                              textAnchor="middle"
                              fill="#7c3aed"
                              fontSize={10}
                              fontWeight={700}
                            >
                              N
                            </text>
                          </g>
                        );
                      })}

                      {/* Render table nodes */}
                      {erLayout.nodes.map((node) => {
                        const isFav = favoriteTables.has(node.name);
                        const headerHeight = 24;
                        const colHeight = 14;
                        const nodeWidth = 200;
                        const nodeHeight =
                          headerHeight +
                          Math.min(node.schema.columns.length, 8) * colHeight +
                          8;

                        return (
                          <g
                            key={node.name}
                            onClick={() => {
                              setSelectedTable(node.name);
                              setActiveTab("data");
                              setVisibleRows(20);
                            }}
                            className="cursor-pointer"
                          >
                            <rect
                              x={node.x + 2}
                              y={node.y + 2}
                              width={nodeWidth}
                              height={nodeHeight}
                              rx={6}
                              fill="rgba(0,0,0,0.08)"
                            />
                            <rect
                              x={node.x}
                              y={node.y}
                              width={nodeWidth}
                              height={nodeHeight}
                              rx={6}
                              fill="#ffffff"
                              stroke={
                                selectedTable === node.name
                                  ? "#d97706"
                                  : "#f59e0b"
                              }
                              strokeWidth={
                                selectedTable === node.name ? 2.5 : 1
                              }
                            />
                            <rect
                              x={node.x}
                              y={node.y}
                              width={nodeWidth}
                              height={headerHeight}
                              rx={6}
                              fill="#fef3c7"
                            />
                            <rect
                              x={node.x}
                              y={node.y + headerHeight - 6}
                              width={nodeWidth}
                              height={6}
                              fill="#fef3c7"
                            />
                            <text
                              x={node.x + 10}
                              y={node.y + 16}
                              fill="#92400e"
                              fontSize={10}
                              fontWeight={700}
                            >
                              {isFav && "★ "}
                              {node.name}
                            </text>
                            <text
                              x={node.x + nodeWidth - 10}
                              y={node.y + 16}
                              textAnchor="end"
                              fill="#6b7280"
                              fontSize={8}
                            >
                              {node.rows} rows
                            </text>
                            {node.schema.columns.slice(0, 8).map((col, ci) => (
                              <g key={col.name}>
                                <text
                                  x={node.x + 10}
                                  y={
                                    node.y + headerHeight + 10 + ci * colHeight
                                  }
                                  fill={
                                    col.name === "id" ||
                                    col.name.endsWith("_id")
                                      ? "#b45309"
                                      : "#374151"
                                  }
                                  fontSize={8}
                                  fontFamily="monospace"
                                >
                                  {col.name === "id"
                                    ? "🔑 "
                                    : col.name.endsWith("_id")
                                      ? "🔗 "
                                      : ""}
                                  {col.name}
                                </text>
                                <text
                                  x={node.x + nodeWidth - 10}
                                  y={
                                    node.y + headerHeight + 10 + ci * colHeight
                                  }
                                  textAnchor="end"
                                  fill="#9ca3af"
                                  fontSize={7}
                                  fontFamily="monospace"
                                >
                                  {col.type}
                                </text>
                              </g>
                            ))}
                            {node.schema.columns.length > 8 && (
                              <text
                                x={node.x + 10}
                                y={node.y + headerHeight + 10 + 8 * colHeight}
                                fill="#9ca3af"
                                fontSize={7}
                              >
                                +{node.schema.columns.length - 8} more
                                columns...
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {Object.keys(generatedData).length <= 1 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center text-muted-foreground">
                        <GitBranch className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
                        <p className="text-[10px]">ER diagram appears with</p>
                        <p className="text-[10px]">multiple connected tables</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-100 to-red-100 dark:from-amber-900/30 dark:to-red-900/30 flex items-center justify-center mx-auto mb-3">
                <Database className="h-7 w-7 text-amber-600" />
              </div>
              <h3 className="text-base font-semibold mb-1.5">
                No Data Generated Yet
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Describe the database you need in the AI chat, and I&apos;ll
                design the schema and generate realistic data.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {[
                  "E-commerce with users, orders, products",
                  "Hospital management system",
                  "Social media platform",
                  "SaaS subscription billing",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="text-[10px] px-2 py-1 rounded-full border bg-card hover:bg-accent transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SQL Confirmation Dialog */}
      <Dialog open={sqlConfirmOpen} onOpenChange={setSqlConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Destructive Operation
            </DialogTitle>
            <DialogDescription>
              This SQL statement may modify or delete data. Please review it
              carefully before proceeding.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-auto max-h-40">
            {sqlConfirmQuery}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSqlConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setSqlConfirmOpen(false);
                executeSQL(sqlConfirmQuery, true);
              }}
            >
              Execute Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete database confirmation */}
      <Dialog open={deleteDbConfirmOpen} onOpenChange={setDeleteDbConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete this database?
            </DialogTitle>
            <DialogDescription>
              This removes <span className="font-medium text-foreground">{databaseName || "this project"}</span>{" "}
              and all of its tables and rows. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDbConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={performDeleteDatabase}>
              Delete database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save SQL query — name in-app dialog (no browser prompt) */}
      <Dialog
        open={saveQueryDialogOpen}
        onOpenChange={(open) => {
          setSaveQueryDialogOpen(open);
          if (!open) setSaveQueryName("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-primary" />
              Save query
            </DialogTitle>
            <DialogDescription>
              Give this SQL a short label so you can load it again from Saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-query-name" className="text-xs">
              Name
            </Label>
            <Input
              id="save-query-name"
              value={saveQueryName}
              onChange={(e) => setSaveQueryName(e.target.value)}
              placeholder="e.g. Monthly revenue"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSaveQuery();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveQueryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={commitSaveQuery}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={addTableDialogOpen} onOpenChange={setAddTableDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="h-5 w-5 text-amber-600" />
              Add Table
            </DialogTitle>
            <DialogDescription>
              Create a new empty table in your database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">
                Table Name
              </label>
              <Input
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="e.g., orders"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTable();
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">
                Columns (comma-separated, optional)
              </label>
              <Input
                value={newTableColumns}
                onChange={(e) => setNewTableColumns(e.target.value)}
                placeholder="e.g., id, name, email, created_at"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTable();
                }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                An "id" column is auto-added if not specified
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddTableDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddTable}
              disabled={!newTableName.trim()}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              Create Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={addColumnDialogOpen} onOpenChange={setAddColumnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-amber-600" />
              Add Column to "{selectedTable}"
            </DialogTitle>
            <DialogDescription>
              Add a new column to the selected table.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">
                Column Name
              </label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="e.g., phone"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">
                Data Type
              </label>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value)}
                className="w-full h-8 text-sm border rounded-md px-2 bg-background"
              >
                <option value="varchar(255)">VARCHAR(255)</option>
                <option value="integer">INTEGER</option>
                <option value="decimal">DECIMAL</option>
                <option value="boolean">BOOLEAN</option>
                <option value="timestamp">TIMESTAMP</option>
                <option value="uuid">UUID</option>
                <option value="text">TEXT</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddColumnDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddColumn}
              disabled={!newColumnName.trim()}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Default export with Suspense boundary for useSearchParams
export default function StudioPage(props: StudioPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100vh-44px)] bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      }
    >
      <StudioPageInner {...props} />
    </Suspense>
  );
}