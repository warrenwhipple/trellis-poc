"use client";

import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

// ============================================================================
// Speech Recognition Type Definitions
// ============================================================================

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	stop(): void;
	onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
	onend: ((this: SpeechRecognition, ev: Event) => void) | null;
	onresult:
		| ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
		| null;
	onerror:
		| ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
		| null;
}

interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

type SpeechRecognitionResultList = {
	readonly length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
	readonly length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
	isFinal: boolean;
};

type SpeechRecognitionAlternative = {
	transcript: string;
	confidence: number;
};

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
}

declare global {
	interface Window {
		SpeechRecognition: {
			new (): SpeechRecognition;
		};
		webkitSpeechRecognition: {
			new (): SpeechRecognition;
		};
	}
}

// ============================================================================
// Hook
// ============================================================================

export interface UseSpeechRecognitionOptions {
	textareaRef?: RefObject<HTMLTextAreaElement | null>;
	onTranscriptionChange?: (text: string) => void;
}

export interface UseSpeechRecognitionResult {
	isListening: boolean;
	isSupported: boolean;
	toggleListening: () => void;
}

/**
 * Hook for managing speech recognition functionality.
 * Handles browser API setup, listening state, and transcription.
 */
export function useSpeechRecognition({
	textareaRef,
	onTranscriptionChange,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
	const [isListening, setIsListening] = useState(false);
	const [recognition, setRecognition] = useState<SpeechRecognition | null>(
		null,
	);
	const recognitionRef = useRef<SpeechRecognition | null>(null);

	useEffect(() => {
		if (
			typeof window !== "undefined" &&
			("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
		) {
			const SpeechRecognitionAPI =
				window.SpeechRecognition || window.webkitSpeechRecognition;
			const speechRecognition = new SpeechRecognitionAPI();

			speechRecognition.continuous = true;
			speechRecognition.interimResults = true;
			speechRecognition.lang = "en-US";

			speechRecognition.onstart = () => {
				setIsListening(true);
			};

			speechRecognition.onend = () => {
				setIsListening(false);
			};

			speechRecognition.onresult = (event) => {
				let finalTranscript = "";

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const result = event.results[i];
					if (result?.isFinal) {
						finalTranscript += result[0]?.transcript ?? "";
					}
				}

				if (finalTranscript && textareaRef?.current) {
					const textarea = textareaRef.current;
					const currentValue = textarea.value;
					const newValue =
						currentValue + (currentValue ? " " : "") + finalTranscript;

					textarea.value = newValue;
					textarea.dispatchEvent(new Event("input", { bubbles: true }));
					onTranscriptionChange?.(newValue);
				}
			};

			speechRecognition.onerror = (event) => {
				console.error("[speech-recognition] Error:", event.error);
				setIsListening(false);
			};

			recognitionRef.current = speechRecognition;
			setRecognition(speechRecognition);
		}

		return () => {
			if (recognitionRef.current) {
				recognitionRef.current.stop();
			}
		};
	}, [textareaRef, onTranscriptionChange]);

	const toggleListening = useCallback(() => {
		if (!recognition) {
			return;
		}

		if (isListening) {
			recognition.stop();
		} else {
			recognition.start();
		}
	}, [recognition, isListening]);

	return {
		isListening,
		isSupported: recognition !== null,
		toggleListening,
	};
}
