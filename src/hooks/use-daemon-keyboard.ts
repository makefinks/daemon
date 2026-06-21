import { toast } from "@opentui-ui/toast/react";
import type { KeyEvent } from "@opentui/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useCallback } from "react";
import { getDaemonManager } from "../state/daemon-state";
import { type AppPreferences, type LlmProvider, DaemonState } from "../types";
import { COLORS } from "../ui/constants";
export interface KeyboardHandlerState {
	daemonState: DaemonState;
	isOverlayOpen: boolean;
	escPendingCancel: boolean;
	hasInteracted: boolean;
	showFullReasoning: boolean;
	showToolOutput: boolean;
	currentModelProvider: LlmProvider;
	supportsReasoning: boolean;
	openAiCodexAuthenticated: boolean;
}

export interface KeyboardHandlerActions {
	setShowDeviceMenu: (show: boolean) => void;
	setShowSettingsMenu: (show: boolean) => void;
	setShowModelMenu: (show: boolean) => void;
	setShowProviderMenu: (show: boolean) => void;
	setShowSessionMenu: (show: boolean) => void;
	setShowHotkeysPane: (show: boolean) => void;
	setShowGroundingMenu: (show: boolean) => void;
	setShowUrlMenu: (show: boolean) => void;
	setShowToolsMenu: (show: boolean) => void;
	setShowSkillsMenu: (show: boolean) => void;
	setShowMemoryMenu: (show: boolean) => void;
	setShowCopyMenu: (show: boolean) => void;
	setTypingInput: (input: string | ((prev: string) => string)) => void;
	setCurrentTranscription: (text: string) => void;
	setCurrentResponse: (text: string) => void;
	setApiKeyMissingError: (msg: string) => void;
	setEscPendingCancel: (pending: boolean) => void;
	setShowFullReasoning: (show: boolean | ((prev: boolean) => boolean)) => void;
	setShowToolOutput: (show: boolean | ((prev: boolean) => boolean)) => void;
	cycleReasoningEffort: () => void;
	persistPreferences: (updates: Partial<AppPreferences>) => void;
	clearReasoningState: () => void;
	currentUserInputRef: React.RefObject<string>;
	conversationScrollRef: React.RefObject<ScrollBoxRenderable | null>;
	startNewSession: () => void;
	undoLastTurn: () => void;
}

export function useDaemonKeyboard(state: KeyboardHandlerState, actions: KeyboardHandlerActions) {
	const manager = getDaemonManager();
	const {
		daemonState,
		isOverlayOpen,
		escPendingCancel,
		hasInteracted,
		showFullReasoning,
		currentModelProvider,
		supportsReasoning,
		openAiCodexAuthenticated,
	} = state;

	const closeAllMenus = useCallback(() => {
		actions.setShowDeviceMenu(false);
		actions.setShowSettingsMenu(false);
		actions.setShowModelMenu(false);
		actions.setShowProviderMenu(false);
		actions.setShowSessionMenu(false);
		actions.setShowHotkeysPane(false);
		actions.setShowGroundingMenu(false);
		actions.setShowUrlMenu(false);
		actions.setShowToolsMenu(false);
		actions.setShowSkillsMenu(false);
		actions.setShowMemoryMenu(false);
		actions.setShowCopyMenu(false);
	}, [actions]);

	const handleKeyPress = useCallback(
		(key: KeyEvent) => {
			const currentState = daemonState;

			if (isOverlayOpen) return;

			if (
				key.eventType === "press" &&
				!key.ctrl &&
				!key.meta &&
				!key.shift &&
				currentState !== DaemonState.TYPING &&
				(key.name === "up" || key.name === "down" || key.sequence === "k" || key.sequence === "j")
			) {
				const scrollbox = actions.conversationScrollRef.current;
				const viewportHeight = scrollbox?.viewport?.height ?? 0;
				if (!scrollbox || viewportHeight <= 0) return;

				const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
				const step = Math.max(1, Math.floor(viewportHeight * 0.1));
				const delta = key.name === "up" || key.sequence === "k" ? -step : step;
				const nextScrollTop = Math.max(0, Math.min(scrollbox.scrollTop + delta, maxScrollTop));
				if (nextScrollTop !== scrollbox.scrollTop) {
					scrollbox.scrollTop = nextScrollTop;
				}
				key.preventDefault();
				return;
			}

			if (key.eventType === "press" && key.ctrl && (key.name === "u" || key.name === "d")) {
				const scrollbox = actions.conversationScrollRef.current;
				const viewportHeight = scrollbox?.viewport?.height ?? 0;
				if (!scrollbox || viewportHeight <= 0) return;

				const maxScrollTop = Math.max(0, scrollbox.scrollHeight - viewportHeight);
				const delta = key.name === "u" ? -viewportHeight : viewportHeight;
				const nextScrollTop = Math.max(0, Math.min(scrollbox.scrollTop + delta, maxScrollTop));
				if (nextScrollTop !== scrollbox.scrollTop) {
					scrollbox.scrollTop = nextScrollTop;
				}
				key.preventDefault();
				return;
			}

			// 'D' key to open device menu (only in IDLE state before conversation starts)
			if (
				(key.sequence === "d" || key.sequence === "D") &&
				key.eventType === "press" &&
				currentState === DaemonState.IDLE &&
				!hasInteracted
			) {
				closeAllMenus();
				actions.setShowDeviceMenu(true);
				key.preventDefault();
				return;
			}

			// 'L' key to open session menu (also while the visible session is responding)
			if (
				(key.sequence === "l" || key.sequence === "L") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowSessionMenu(true);
				key.preventDefault();
				return;
			}

			// 'S' key to open settings menu (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "s" || key.sequence === "S") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowSettingsMenu(true);
				key.preventDefault();
				return;
			}

			// 'M' key to open model menu (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "m" || key.sequence === "M") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowModelMenu(true);
				key.preventDefault();
				return;
			}

			// 'P' key to open provider menu (in IDLE or SPEAKING state)
			if (
				(key.sequence === "p" || key.sequence === "P") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE || currentState === DaemonState.SPEAKING)
			) {
				if (currentModelProvider !== "openrouter") {
					key.preventDefault();
					return;
				}
				closeAllMenus();
				actions.setShowProviderMenu(true);
				key.preventDefault();
				return;
			}

			// 'G' key to open grounding menu for the latest message.
			if (
				(key.sequence === "g" || key.sequence === "G") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowGroundingMenu(true);
				key.preventDefault();
				return;
			}

			// 'U' key to open URL menu (in IDLE, SPEAKING, or RESPONDING state when hasInteracted)
			if (
				(key.sequence === "u" || key.sequence === "U") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING) &&
				hasInteracted
			) {
				closeAllMenus();
				actions.setShowUrlMenu(true);
				key.preventDefault();
				return;
			}

			// Ctrl+N to start a new session (also while the visible session is responding)
			if (
				key.ctrl &&
				(key.name === "n" || key.sequence === "\u000e") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				actions.startNewSession();
				key.preventDefault();
				return;
			}

			// Ctrl+X to undo last turn (in IDLE or SPEAKING state)
			if (
				key.ctrl &&
				(key.name === "x" || key.sequence === "\u0018") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE || currentState === DaemonState.SPEAKING)
			) {
				actions.undoLastTurn();
				key.preventDefault();
				return;
			}

			// 'T' key to open tools menu (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "t" || key.sequence === "T") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowToolsMenu(true);
				key.preventDefault();
				return;
			}

			// 'I' key to open skills menu (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "i" || key.sequence === "I") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowSkillsMenu(true);
				key.preventDefault();
				return;
			}

			// Ctrl+Y to open copy menu (in IDLE, SPEAKING, or RESPONDING state)
			if (
				key.ctrl &&
				(key.name === "y" || key.sequence === "\u0019") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING) &&
				hasInteracted
			) {
				closeAllMenus();
				actions.setShowCopyMenu(true);
				key.preventDefault();
				return;
			}

			// 'B' key to open memory menu (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "b" || key.sequence === "B") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				closeAllMenus();
				actions.setShowMemoryMenu(true);
				key.preventDefault();
				return;
			}

			// 'R' key to toggle full reasoning display (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "r" || key.sequence === "R") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				const next = !showFullReasoning;
				actions.setShowFullReasoning(next);
				actions.persistPreferences({ showFullReasoning: next });
				toast.info(`FULL PREVIEWS: ${next ? "ON" : "OFF"}`, {
					description: next
						? "Reasoning blocks will display in full."
						: "Reasoning blocks will show as a compact ticker.",
					style: {
						foregroundColor: next ? COLORS.DAEMON_TEXT : COLORS.ERROR,
					},
				});
				key.preventDefault();
				return;
			}

			// Ctrl+E to cycle reasoning effort without opening settings.
			if (
				key.ctrl &&
				(key.name === "e" || key.sequence === "e") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				if (!supportsReasoning) {
					key.preventDefault();
					return;
				}

				actions.cycleReasoningEffort();
				key.preventDefault();
				return;
			}

			// 'O' key to toggle tool output preview (in IDLE, SPEAKING, or RESPONDING state)
			if (
				(key.sequence === "o" || key.sequence === "O") &&
				key.eventType === "press" &&
				(currentState === DaemonState.IDLE ||
					currentState === DaemonState.SPEAKING ||
					currentState === DaemonState.RESPONDING)
			) {
				const next = !state.showToolOutput;
				actions.setShowToolOutput(next);
				actions.persistPreferences({ showToolOutput: next });
				toast.info(`TOOL OUTPUT: ${next ? "ON" : "OFF"}`, {
					description: next ? "Tool outputs will be displayed." : "Tool outputs will be hidden.",
					style: {
						foregroundColor: next ? COLORS.DAEMON_TEXT : COLORS.ERROR,
					},
				});
				key.preventDefault();
				return;
			}

			// '?' key to show hotkeys pane
			if (key.sequence === "?" && key.eventType === "press" && currentState !== DaemonState.TYPING) {
				closeAllMenus();
				actions.setShowHotkeysPane(true);
				key.preventDefault();
				return;
			}

			// Space key for voice activation (toggle)
			if (
				key.name === "space" &&
				key.eventType === "press" &&
				!key.shift &&
				!key.ctrl &&
				!key.meta &&
				currentState !== DaemonState.TYPING
			) {
				if (currentState === DaemonState.IDLE || currentState === DaemonState.SPEAKING) {
					// OpenRouter provider requires OPENROUTER_API_KEY for model responses.
					if (currentModelProvider === "openrouter" && !process.env.OPENROUTER_API_KEY) {
						actions.setApiKeyMissingError(
							"OPENROUTER_API_KEY not found · Set via environment variable or enter in onboarding"
						);
						key.preventDefault();
						return;
					}
					if (currentModelProvider === "openai-codex" && !openAiCodexAuthenticated) {
						actions.setApiKeyMissingError(
							"OpenAI Codex login missing · Complete browser login in onboarding to use your ChatGPT subscription"
						);
						key.preventDefault();
						return;
					}
					// Check for OpenAI API key (needed for voice transcription)
					if (!process.env.OPENAI_API_KEY) {
						actions.setApiKeyMissingError("Voice input is disabled because OpenAI API key is not set.");
						key.preventDefault();
						return;
					}

					// Clear any previous error
					actions.setApiKeyMissingError("");
					actions.setCurrentTranscription("");
					actions.setCurrentResponse("");
					manager.startListening();
				} else if (currentState === DaemonState.LISTENING) {
					manager.stopListening();
				}
				key.preventDefault();
				return;
			}

			// Shift+Tab for typing mode
			if (key.name === "tab" && key.shift && key.eventType === "press") {
				if (currentState === DaemonState.IDLE) {
					// OpenRouter provider requires OPENROUTER_API_KEY for model responses.
					if (currentModelProvider === "openrouter" && !process.env.OPENROUTER_API_KEY) {
						actions.setApiKeyMissingError(
							"OPENROUTER_API_KEY not found · Set via environment variable or enter in onboarding"
						);
						key.preventDefault();
						return;
					}
					if (currentModelProvider === "openai-codex" && !openAiCodexAuthenticated) {
						actions.setApiKeyMissingError(
							"OpenAI Codex login missing · Complete browser login in onboarding to use your ChatGPT subscription"
						);
						key.preventDefault();
						return;
					}

					// Clear any previous error
					actions.setApiKeyMissingError("");
					actions.setCurrentTranscription("");
					actions.setCurrentResponse("");
					actions.setTypingInput("");
					manager.enterTypingMode();
				}
				key.preventDefault();
				return;
			}

			// Escape to cancel current action or exit typing mode
			if (key.name === "escape" && key.eventType === "press") {
				if (currentState === DaemonState.TYPING) {
					manager.exitTypingMode();
					actions.setTypingInput("");
				} else if (currentState === DaemonState.LISTENING) {
					manager.cancelCurrentAction();
					actions.setCurrentTranscription("");
					actions.setCurrentResponse("");
					actions.clearReasoningState();
					actions.currentUserInputRef.current = "";
				} else if (currentState === DaemonState.SPEAKING) {
					// Cancel TTS playback immediately with single ESC
					manager.cancelCurrentAction();
				} else if (currentState === DaemonState.TRANSCRIBING || currentState === DaemonState.RESPONDING) {
					if (escPendingCancel) {
						manager.cancelCurrentAction();
						actions.setCurrentTranscription("");
						actions.setCurrentResponse("");
						actions.clearReasoningState();
						actions.currentUserInputRef.current = "";
						actions.setEscPendingCancel(false);
					} else {
						actions.setEscPendingCancel(true);
					}
				}
				key.preventDefault();
				return;
			}

			// Enter to submit in typing mode
			if (key.name === "return" && key.eventType === "press" && currentState === DaemonState.TYPING) {
				// Let the focused <input> handle submit (global handlers run first in OpenTUI).
				return;
			}

			// Regular character input in typing mode (handled by <input> component)
			if (currentState === DaemonState.TYPING && key.eventType === "press" && !key.ctrl && !key.meta) {
				// Don't prevent default for regular keys so <input> can receive them
				// except for those that might trigger global actions
				return;
			}
		},
		[
			manager,
			daemonState,
			isOverlayOpen,
			escPendingCancel,
			hasInteracted,
			showFullReasoning,
			state.showToolOutput,
			currentModelProvider,
			supportsReasoning,
			actions,
		]
	);

	useKeyboard(handleKeyPress);
}
