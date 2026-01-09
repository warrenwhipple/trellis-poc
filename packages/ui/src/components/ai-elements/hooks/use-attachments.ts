"use client";

import type { FileUIPart } from "ai";
import { nanoid } from "nanoid";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

// ============================================================================
// Types
// ============================================================================

export type AttachmentFile = FileUIPart & { id: string };

export interface AttachmentError {
	code: "max_files" | "max_file_size" | "accept";
	message: string;
}

export interface UseAttachmentsOptions {
	accept?: string;
	maxFiles?: number;
	maxFileSize?: number;
	onError?: (err: AttachmentError) => void;
}

export interface UseAttachmentsResult {
	files: AttachmentFile[];
	add: (files: File[] | FileList) => void;
	remove: (id: string) => void;
	clear: () => void;
	openFileDialog: () => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing file attachments with validation.
 * Handles file state, validation, and blob URL lifecycle.
 */
export function useAttachments({
	accept,
	maxFiles,
	maxFileSize,
	onError,
}: UseAttachmentsOptions = {}): UseAttachmentsResult {
	const [files, setFiles] = useState<AttachmentFile[]>([]);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	// Keep a ref to files for cleanup on unmount (avoids stale closure)
	const filesRef = useRef(files);
	filesRef.current = files;

	const matchesAccept = useCallback(
		(f: File) => {
			if (!accept || accept.trim() === "") {
				return true;
			}

			const patterns = accept
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);

			return patterns.some((pattern) => {
				if (pattern.endsWith("/*")) {
					const prefix = pattern.slice(0, -1); // e.g: image/* -> image/
					return f.type.startsWith(prefix);
				}
				return f.type === pattern;
			});
		},
		[accept],
	);

	const add = useCallback(
		(fileList: File[] | FileList) => {
			const incoming = Array.from(fileList);
			const accepted = incoming.filter((f) => matchesAccept(f));
			if (incoming.length && accepted.length === 0) {
				onError?.({
					code: "accept",
					message: "No files match the accepted types.",
				});
				return;
			}
			const withinSize = (f: File) =>
				maxFileSize ? f.size <= maxFileSize : true;
			const sized = accepted.filter(withinSize);
			if (accepted.length > 0 && sized.length === 0) {
				onError?.({
					code: "max_file_size",
					message: "All files exceed the maximum size.",
				});
				return;
			}

			setFiles((prev) => {
				const capacity =
					typeof maxFiles === "number"
						? Math.max(0, maxFiles - prev.length)
						: undefined;
				const capped =
					typeof capacity === "number" ? sized.slice(0, capacity) : sized;
				if (typeof capacity === "number" && sized.length > capacity) {
					onError?.({
						code: "max_files",
						message: "Too many files. Some were not added.",
					});
				}
				const next: AttachmentFile[] = [];
				for (const file of capped) {
					next.push({
						id: nanoid(),
						type: "file",
						url: URL.createObjectURL(file),
						mediaType: file.type,
						filename: file.name,
					});
				}
				return prev.concat(next);
			});
		},
		[matchesAccept, maxFiles, maxFileSize, onError],
	);

	const remove = useCallback(
		(id: string) =>
			setFiles((prev) => {
				const found = prev.find((file) => file.id === id);
				if (found?.url) {
					URL.revokeObjectURL(found.url);
				}
				return prev.filter((file) => file.id !== id);
			}),
		[],
	);

	const clear = useCallback(
		() =>
			setFiles((prev) => {
				for (const file of prev) {
					if (file.url) {
						URL.revokeObjectURL(file.url);
					}
				}
				return [];
			}),
		[],
	);

	const openFileDialog = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	// Cleanup blob URLs on unmount
	useEffect(
		() => () => {
			for (const f of filesRef.current) {
				if (f.url) {
					URL.revokeObjectURL(f.url);
				}
			}
		},
		[],
	);

	return {
		files,
		add,
		remove,
		clear,
		openFileDialog,
		fileInputRef,
	};
}
