import {
  ArrowLeftIcon,
  ChatBubbleOvalLeftIcon,
} from "@heroicons/react/24/outline";
import { Editor, JSONContent } from "@tiptap/react";
import { ChatHistoryItem, InputModifiers } from "core";
import { renderChatMessage } from "core/util/messageContent";
import type { WorktreeSession } from "core/worktree/types";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "react-error-boundary";
import styled from "styled-components";
import { Button, lightGray, vscBackground } from "../../components";
import { useFindWidget } from "../../components/find/FindWidget";
import TimelineItem from "../../components/gui/TimelineItem";
import { NewSessionButton } from "../../components/mainInput/belowMainInput/NewSessionButton";
import ThinkingBlockPeek from "../../components/mainInput/belowMainInput/ThinkingBlockPeek";
import ContinueInputBox from "../../components/mainInput/ContinueInputBox";
import InputToolbar, {
  ToolbarOptions,
} from "../../components/mainInput/InputToolbar";
import { handleImageFile } from "../../components/mainInput/TipTapEditor/utils/imageUtils";
import { useOnboardingCard } from "../../components/OnboardingCard";
import StepContainer from "../../components/StepContainer";
import { TabBar } from "../../components/TabBar/TabBar";
import {
  WorktreeSessionsPanel,
  type WorktreeLaunchControl,
  type WorktreeLaunchOptions,
} from "../../components/WorktreeMode";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectDoneApplyStates,
  selectPendingToolCalls,
} from "../../redux/selectors/selectToolCalls";
import { selectCurrentOrg } from "../../redux/slices/profilesSlice";
import {
  cancelToolCall,
  ChatHistoryItemWithMessageId,
  newSession,
  updateToolCallOutput,
} from "../../redux/slices/sessionSlice";
import { streamEditThunk } from "../../redux/thunks/edit";
import { loadLastSession } from "../../redux/thunks/session";
import { streamResponseThunk } from "../../redux/thunks/streamResponse";
import { isJetBrains, isMetaEquivalentKeyPressed } from "../../util";
import { ToolCallDiv } from "./ToolCallDiv";

import { useStore } from "react-redux";
import { BackgroundModeView } from "../../components/BackgroundMode/BackgroundModeView";
import { CliInstallBanner } from "../../components/CliInstallBanner";

import { FatalErrorIndicator } from "../../components/config/FatalErrorNotice";
import InlineErrorMessage from "../../components/mainInput/InlineErrorMessage";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import { RootState } from "../../redux/store";
import { cancelStream } from "../../redux/thunks/cancelStream";
import { EmptyChatBody } from "./EmptyChatBody";
import { ExploreDialogWatcher } from "./ExploreDialogWatcher";
import { useAutoScroll } from "./useAutoScroll";

// Helper function to find the index of the latest conversation summary
function findLatestSummaryIndex(history: ChatHistoryItem[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].conversationSummary) {
      return i;
    }
  }
  return -1; // No summary found
}

type SuccessMessage<T> = { status: "success"; content: T };
type ErrorMessage = { status: "error"; error?: string };

function isSuccessMessage<T>(result: unknown): result is SuccessMessage<T> {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as any).status === "success"
  );
}

function isErrorMessage(result: unknown): result is ErrorMessage {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as any).status === "error"
  );
}

function flattenEditorText(content?: JSONContent): string {
  if (!content) {
    return "";
  }

  const parts: string[] = [];

  const traverse = (node?: JSONContent) => {
    if (!node) {
      return;
    }
    if (typeof node.text === "string") {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => traverse(child as JSONContent));
    }
  };

  traverse(content);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const StepsDiv = styled.div`
  position: relative;
  background-color: transparent;

  & > * {
    position: relative;
  }

  .thread-message {
    margin: 0 0 0 1px;
  }
`;

export const MAIN_EDITOR_INPUT_ID = "main-editor-input";

function fallbackRender({ error, resetErrorBoundary }: any) {
  // Call resetErrorBoundary() to reset the error boundary and retry the render.

  return (
    <div
      role="alert"
      className="px-2"
      style={{ backgroundColor: vscBackground }}
    >
      <p>Something went wrong:</p>
      <pre style={{ color: "red" }}>{error.message}</pre>
      <pre style={{ color: lightGray }}>{error.stack}</pre>

      <div className="text-center">
        <Button onClick={resetErrorBoundary}>Restart</Button>
      </div>
    </div>
  );
}

export function Chat() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const reduxStore = useStore<RootState>();
  const onboardingCard = useOnboardingCard();
  const showSessionTabs = useAppSelector(
    (store) => store.config.config.ui?.showSessionTabs,
  );
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const [stepsOpen] = useState<(boolean | undefined)[]>([]);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const mainTextInputRef = useRef<HTMLInputElement>(null);
  const stepsDivRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const history = useAppSelector((state) => state.session.history);
  const [mainEditor, setMainEditor] = useState<Editor | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const isInEdit = useAppSelector((store) => store.session.isInEdit);
  const editModeState = useAppSelector((state) => state.editModeState);
  const showChatScrollbar = useAppSelector(
    (state) => state.config.config.ui?.showChatScrollbar,
  );
  const codeToEdit = useAppSelector((state) => state.editModeState.codeToEdit);
  const [worktreeLaunchEnabled, setWorktreeLaunchEnabled] = useState(false);
  const [worktreeOptions, setWorktreeOptions] = useState<WorktreeLaunchOptions>(
    {},
  );
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const worktreeBySessionRef = useRef<Map<string, string>>(new Map());
  const handleWorktreeEnabledChange = useCallback((value: boolean) => {
    setWorktreeLaunchEnabled(value);
  }, []);
  const handleWorktreeOptionsChange = useCallback(
    (updates: Partial<WorktreeLaunchOptions>) => {
      setWorktreeOptions((prev) => ({ ...prev, ...updates }));
    },
    [],
  );
  const worktreeLaunchControl = useMemo<WorktreeLaunchControl>(() => {
    return {
      enabled: worktreeLaunchEnabled,
      busy: isCreatingWorktree,
      options: worktreeOptions,
      onEnabledChange: handleWorktreeEnabledChange,
      onOptionsChange: handleWorktreeOptionsChange,
    };
  }, [
    worktreeLaunchEnabled,
    isCreatingWorktree,
    worktreeOptions,
    handleWorktreeEnabledChange,
    handleWorktreeOptionsChange,
  ]);

  const ensureWorktreeIfNeeded = useCallback(
    async (editorState: JSONContent, snapshot: RootState) => {
      if (!worktreeLaunchEnabled || snapshot.session.isInEdit) {
        return;
      }

      const chatSessionId = snapshot.session.id;
      setIsCreatingWorktree(true);
      try {
        let targetSessionId = worktreeBySessionRef.current.get(chatSessionId);

        if (!targetSessionId) {
          const plainText = flattenEditorText(editorState);
          const description =
            worktreeOptions.description?.trim() ||
            (plainText ? plainText.slice(0, 80) : undefined);
          const baseBranch = worktreeOptions.baseBranch?.trim() || undefined;
          const result = await ideMessenger.request("worktree/create", {
            agentSessionId: snapshot.session.id,
            options: {
              baseBranch,
              description,
            },
          });

          if (isErrorMessage(result)) {
            throw new Error(result.error ?? "Failed to create worktree");
          }

          if (isSuccessMessage<WorktreeSession>(result)) {
            targetSessionId = result.content.id;
            worktreeBySessionRef.current.set(chatSessionId, targetSessionId);
            ideMessenger.post("showToast", [
              "info",
              `Created worktree ${result.content.branchName}`,
            ]);
          }
        }

        if (!targetSessionId) {
          throw new Error("Unable to determine worktree session to switch to");
        }

        const switchResponse = await ideMessenger.request("worktree/switch", {
          sessionId: targetSessionId,
          openInNewWindow: true,
        });

        if (isErrorMessage(switchResponse)) {
          throw new Error(
            switchResponse.error ?? "Failed to switch into worktree",
          );
        }
      } catch (error) {
        const message = (error as Error).message ?? "Failed to create worktree";
        ideMessenger.post("showToast", ["error", message]);
        worktreeBySessionRef.current.delete(chatSessionId);
        throw error;
      } finally {
        setIsCreatingWorktree(false);
      }
    },
    [
      ideMessenger,
      worktreeLaunchEnabled,
      worktreeOptions.baseBranch,
      worktreeOptions.description,
    ],
  );

  const lastSessionId = useAppSelector((state) => state.session.lastSessionId);
  const allSessionMetadata = useAppSelector(
    (state) => state.session.allSessionMetadata,
  );
  const hasDismissedExploreDialog = useAppSelector(
    (state) => state.ui.hasDismissedExploreDialog,
  );
  const mode = useAppSelector((state) => state.session.mode);
  const currentOrg = useAppSelector(selectCurrentOrg);
  const jetbrains = useMemo(() => {
    return isJetBrains();
  }, []);

  useAutoScroll(stepsDivRef, history);

  useEffect(() => {
    // Cmd + Backspace to delete current step
    const listener = (e: KeyboardEvent) => {
      if (
        e.key === "Backspace" &&
        (jetbrains ? e.altKey : isMetaEquivalentKeyPressed(e)) &&
        !e.shiftKey
      ) {
        void dispatch(cancelStream());
      }
    };
    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [isStreaming, jetbrains, isInEdit]);

  const { widget, highlights } = useFindWidget(
    stepsDivRef,
    tabsRef,
    isStreaming,
  );

  const sendInput = useCallback(
    async (
      editorState: JSONContent,
      modifiers: InputModifiers,
      index?: number,
      editorToClearOnSend?: Editor,
    ) => {
      const stateSnapshot = reduxStore.getState();
      const latestPendingToolCalls = selectPendingToolCalls(stateSnapshot);
      const latestPendingApplyStates = selectDoneApplyStates(stateSnapshot);
      const isCurrentlyInEdit = stateSnapshot.session.isInEdit;
      const codeToEditSnapshot = stateSnapshot.editModeState.codeToEdit;
      const selectedModelByRole =
        stateSnapshot.config.config.selectedModelByRole;
      const currentMode = stateSnapshot.session.mode;

      // Handle background mode specially
      if (currentMode === "background" && !isCurrentlyInEdit) {
        // Background mode triggers agent creation instead of chat
        const currentOrg = selectCurrentOrg(stateSnapshot);
        const organizationId =
          currentOrg?.id !== "personal" ? currentOrg?.id : undefined;

        setIsCreatingAgent(true);

        // Create agent and track loading state
        void (async () => {
          try {
            // Resolve context items from editor content (same as normal chat)
            const defaultContextProviders =
              stateSnapshot.config.config.experimental?.defaultContext ?? [];

            const { selectedContextItems, selectedCode, content } =
              await resolveEditorContent({
                editorState,
                modifiers,
                ideMessenger,
                defaultContextProviders,
                availableSlashCommands:
                  stateSnapshot.config.config.slashCommands,
                dispatch,
                getState: () => reduxStore.getState(),
              });

            await ideMessenger.request("createBackgroundAgent", {
              content,
              contextItems: selectedContextItems,
              selectedCode,
              organizationId,
            });

            // Clear input only after successful API call
            if (editorToClearOnSend) {
              editorToClearOnSend.commands.clearContent();
            }

            setIsCreatingAgent(false);
          } catch (error) {
            console.error("Failed to create background agent:", error);
            setIsCreatingAgent(false);
          }
        })();

        return;
      }

      // Cancel all pending tool calls
      latestPendingToolCalls.forEach((toolCallState) => {
        dispatch(
          cancelToolCall({
            toolCallId: toolCallState.toolCallId,
          }),
        );
      });

      // Reject all pending apply states
      latestPendingApplyStates.forEach((applyState) => {
        if (applyState.status !== "closed") {
          ideMessenger.post("rejectDiff", applyState);
        }
      });
      const model = isCurrentlyInEdit
        ? (selectedModelByRole.edit ?? selectedModelByRole.chat)
        : selectedModelByRole.chat;

      if (!model) {
        return;
      }

      if (isCurrentlyInEdit && codeToEditSnapshot.length === 0) {
        return;
      }

      if (isCurrentlyInEdit) {
        void dispatch(
          streamEditThunk({
            editorState,
            codeToEdit: codeToEditSnapshot,
          }),
        );
      } else {
        try {
          await ensureWorktreeIfNeeded(editorState, stateSnapshot);
        } catch {
          return;
        }
        void dispatch(streamResponseThunk({ editorState, modifiers, index }));

        if (editorToClearOnSend) {
          editorToClearOnSend.commands.clearContent();
        }
      }
    },
    [
      dispatch,
      ideMessenger,
      reduxStore,
      setIsCreatingAgent,
      ensureWorktreeIfNeeded,
    ],
  );

  useWebviewListener(
    "newSession",
    async () => {
      // unwrapResult(response) // errors if session creation failed
      mainTextInputRef.current?.focus?.();
    },
    [mainTextInputRef],
  );

  // Handle partial tool call output for streaming updates
  useWebviewListener(
    "toolCallPartialOutput",
    async (data) => {
      // Update tool call output in Redux store
      dispatch(
        updateToolCallOutput({
          toolCallId: data.toolCallId,
          contextItems: data.contextItems,
        }),
      );
    },
    [dispatch],
  );

  const isLastUserInput = useCallback(
    (index: number): boolean => {
      return !history
        .slice(index + 1)
        .some((entry) => entry.message.role === "user");
    },
    [history],
  );

  const renderChatHistoryItem = useCallback(
    (item: ChatHistoryItemWithMessageId, index: number) => {
      const {
        message,
        editorState,
        contextItems,
        appliedRules,
        toolCallStates,
      } = item;

      // Calculate once for the entire function
      const latestSummaryIndex = findLatestSummaryIndex(history);
      const isBeforeLatestSummary =
        latestSummaryIndex !== -1 && index < latestSummaryIndex;

      if (message.role === "user") {
        return (
          <ContinueInputBox
            onEnter={(editorState, modifiers) =>
              void sendInput(editorState, modifiers, index)
            }
            isLastUserInput={isLastUserInput(index)}
            isMainInput={false}
            editorState={editorState ?? item.message.content}
            contextItems={contextItems}
            appliedRules={appliedRules}
            inputId={message.id}
          />
        );
      }

      if (message.role === "tool") {
        return null;
      }

      if (message.role === "assistant") {
        return (
          <>
            {/* Always render assistant content through normal path */}
            <div className="thread-message">
              <TimelineItem
                item={item}
                iconElement={
                  <ChatBubbleOvalLeftIcon width="16px" height="16px" />
                }
                open={
                  typeof stepsOpen[index] === "undefined"
                    ? true
                    : stepsOpen[index]!
                }
                onToggle={() => {}}
              >
                <StepContainer
                  index={index}
                  isLast={index === history.length - 1}
                  item={item}
                  latestSummaryIndex={latestSummaryIndex}
                />
              </TimelineItem>
            </div>

            {toolCallStates && (
              <ToolCallDiv
                toolCallStates={toolCallStates}
                historyIndex={index}
              />
            )}
          </>
        );
      }

      if (message.role === "thinking") {
        return (
          <div className={isBeforeLatestSummary ? "opacity-50" : ""}>
            <ThinkingBlockPeek
              content={renderChatMessage(message)}
              redactedThinking={message.redactedThinking}
              index={index}
              prevItem={index > 0 ? history[index - 1] : null}
              inProgress={index === history.length - 1 && isStreaming}
              signature={message.signature}
            />
          </div>
        );
      }

      // Default case - regular assistant message
      return (
        <div className="thread-message">
          <TimelineItem
            item={item}
            iconElement={<ChatBubbleOvalLeftIcon width="16px" height="16px" />}
            open={
              typeof stepsOpen[index] === "undefined" ? true : stepsOpen[index]!
            }
            onToggle={() => {}}
          >
            <StepContainer
              index={index}
              isLast={index === history.length - 1}
              item={item}
              latestSummaryIndex={latestSummaryIndex}
            />
          </TimelineItem>
        </div>
      );
    },
    [sendInput, isLastUserInput, history, stepsOpen, isStreaming],
  );

  const showScrollbar = showChatScrollbar ?? window.innerHeight > 5000;

  return (
    <>
      {!!showSessionTabs && !isInEdit && <TabBar ref={tabsRef} />}
      {widget}

      <StepsDiv
        ref={stepsDivRef}
        className={`overflow-y-scroll pt-[8px] ${showScrollbar ? "thin-scrollbar" : "no-scrollbar"} ${history.length > 0 ? "flex-1" : ""}`}
      >
        {highlights}
        {history
          .filter((item) => item.message.role !== "system")
          .map((item, index: number) => (
            <div
              key={item.message.id}
              style={{
                minHeight: index === history.length - 1 ? "200px" : 0,
              }}
            >
              <ErrorBoundary
                FallbackComponent={fallbackRender}
                onReset={() => {
                  dispatch(newSession());
                }}
              >
                {renderChatHistoryItem(item, index)}
              </ErrorBoundary>
              {index === history.length - 1 && <InlineErrorMessage />}
            </div>
          ))}
      </StepsDiv>
      <div className={"relative"}>
        <ContinueInputBox
          isMainInput
          isLastUserInput={false}
          onEnter={(editorState, modifiers, editor) =>
            void sendInput(editorState, modifiers, undefined, editor)
          }
          inputId={MAIN_EDITOR_INPUT_ID}
          worktreeLaunchControl={worktreeLaunchControl}
          onEditorReady={setMainEditor}
          onActiveKeyChange={setActiveKey}
        />
        <div className="mx-4 my-0 -mt-2 px-2">
          <InputToolbar
            isMainInput={true}
            toolbarOptions={useMemo(() => {
              if (isInEdit) {
                return {
                  hideAddContext: false,
                  hideImageUpload: false,
                  hideUseCodebase: true,
                  hideSelectModel: false,
                  enterText:
                    editModeState.applyState.status === "done"
                      ? "Retry"
                      : "Edit",
                } as ToolbarOptions;
              }
              return {} as ToolbarOptions;
            }, [isInEdit, editModeState.applyState.status])}
            activeKey={activeKey}
            hidden={false}
            onAddContextItem={() => {
              if (!mainEditor) return;
              const text = mainEditor.getText();
              if (!text.endsWith("@")) {
                if (text.length > 0 && !text.endsWith(" ")) {
                  mainEditor.commands.insertContent(` @`);
                } else {
                  mainEditor.commands.insertContent("@");
                }
              }
            }}
            onEnter={(modifiers) => {
              if (!mainEditor) return;
              const json = mainEditor.getJSON();
              void sendInput(json, modifiers, undefined, mainEditor);
            }}
            onImageFileSelected={(file) => {
              void handleImageFile(ideMessenger, file).then((result) => {
                if (!mainEditor) return;
                if (result) {
                  const [_, dataUrl] = result;
                  const { schema } = mainEditor.state;
                  const node = schema.nodes.image.create({ src: dataUrl });
                  mainEditor.commands.command(({ tr }) => {
                    tr.insert(0, node);
                    return true;
                  });
                }
              });
            }}
            disabled={isStreaming || !mainEditor}
            worktreeLaunchControl={worktreeLaunchControl}
          />
        </div>

        <CliInstallBanner
          sessionCount={allSessionMetadata.length}
          sessionThreshold={3}
          permanentDismissal={true}
        />

        <WorktreeSessionsPanel className="mt-3" />

        <div
          style={{
            pointerEvents: isStreaming ? "none" : "auto",
          }}
        >
          <div className="flex flex-row items-center justify-between pb-1 pl-0.5 pr-2">
            <div className="xs:inline hidden">
              {history.length === 0 && lastSessionId && !isInEdit && (
                <NewSessionButton
                  onClick={async () => {
                    await dispatch(loadLastSession());
                  }}
                  className="flex items-center gap-2"
                >
                  <ArrowLeftIcon className="h-3 w-3" />
                  <span className="text-xs">Last Session</span>
                </NewSessionButton>
              )}
            </div>
          </div>
          <FatalErrorIndicator />
          {!hasDismissedExploreDialog && <ExploreDialogWatcher />}
          {mode === "background" ? (
            <BackgroundModeView isCreatingAgent={isCreatingAgent} />
          ) : (
            history.length === 0 && (
              <EmptyChatBody showOnboardingCard={onboardingCard.show} />
            )
          )}
        </div>
      </div>
    </>
  );
}
