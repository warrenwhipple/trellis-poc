import type { MosaicNode } from "react-mosaic-component";
import type { AddFileViewerPaneOptions, Pane, Tab, TabsState } from "../types";
import { createFileViewerPane, extractPaneIdsFromLayout } from "../utils";

interface FileViewerResult {
	tabs?: Tab[];
	panes: Record<string, Pane>;
	focusedPaneIds: Record<string, string>;
}

/**
 * Adds a file viewer pane to the active tab in a workspace.
 * Handles preview mode (unpinned panes that can be replaced) and pinned panes.
 *
 * Returns null if there's no active tab (caller should create one first).
 */
export function addFileViewerPaneAction(
	state: TabsState,
	activeTab: Tab,
	options: AddFileViewerPaneOptions,
): { result: FileViewerResult; paneId: string } {
	const tabPaneIds = extractPaneIdsFromLayout(activeTab.layout);

	// First, check if the file is already open in a pinned pane - if so, just focus it
	const existingPinnedPane = tabPaneIds
		.map((id) => state.panes[id])
		.find(
			(p) =>
				p?.type === "file-viewer" &&
				p.fileViewer?.isPinned &&
				p.fileViewer.filePath === options.filePath &&
				p.fileViewer.diffCategory === options.diffCategory &&
				p.fileViewer.commitHash === options.commitHash,
		);

	if (existingPinnedPane) {
		// File is already open in a pinned pane, just focus it
		return {
			result: {
				panes: state.panes,
				focusedPaneIds: {
					...state.focusedPaneIds,
					[activeTab.id]: existingPinnedPane.id,
				},
			},
			paneId: existingPinnedPane.id,
		};
	}

	// Look for an existing unpinned (preview) file-viewer pane in the active tab
	const fileViewerPanes = tabPaneIds
		.map((id) => state.panes[id])
		.filter(
			(p) =>
				p?.type === "file-viewer" && p.fileViewer && !p.fileViewer.isPinned,
		);

	// If we found an unpinned (preview) file-viewer pane, check if it's the same file
	if (fileViewerPanes.length > 0) {
		const paneToReuse = fileViewerPanes[0];
		const existingFileViewer = paneToReuse.fileViewer;
		if (!existingFileViewer) {
			// Should not happen due to filter above, but satisfy type checker
			return createNewFileViewerPane(state, activeTab, options);
		}

		// If clicking the same file that's already in preview, pin it
		const isSameFile =
			existingFileViewer.filePath === options.filePath &&
			existingFileViewer.diffCategory === options.diffCategory &&
			existingFileViewer.commitHash === options.commitHash;

		if (isSameFile) {
			// Pin the preview pane
			return {
				result: {
					panes: {
						...state.panes,
						[paneToReuse.id]: {
							...paneToReuse,
							fileViewer: {
								...existingFileViewer,
								isPinned: true,
							},
						},
					},
					focusedPaneIds: {
						...state.focusedPaneIds,
						[activeTab.id]: paneToReuse.id,
					},
				},
				paneId: paneToReuse.id,
			};
		}

		// Different file - replace the preview pane content
		const fileName = options.filePath.split("/").pop() || options.filePath;

		// Determine default view mode
		let viewMode: "raw" | "rendered" | "diff" = "raw";
		if (options.diffCategory) {
			viewMode = "diff";
		} else if (
			options.filePath.endsWith(".md") ||
			options.filePath.endsWith(".markdown") ||
			options.filePath.endsWith(".mdx")
		) {
			viewMode = "rendered";
		}

		return {
			result: {
				panes: {
					...state.panes,
					[paneToReuse.id]: {
						...paneToReuse,
						name: fileName,
						fileViewer: {
							filePath: options.filePath,
							viewMode,
							isPinned: options.isPinned ?? false,
							diffLayout: "inline",
							diffCategory: options.diffCategory,
							commitHash: options.commitHash,
							oldPath: options.oldPath,
							initialLine: options.line,
							initialColumn: options.column,
						},
					},
				},
				focusedPaneIds: {
					...state.focusedPaneIds,
					[activeTab.id]: paneToReuse.id,
				},
			},
			paneId: paneToReuse.id,
		};
	}

	// No reusable pane found, create a new one
	return createNewFileViewerPane(state, activeTab, options);
}

/**
 * Creates a new file viewer pane and adds it to the tab layout
 */
function createNewFileViewerPane(
	state: TabsState,
	activeTab: Tab,
	options: AddFileViewerPaneOptions,
): { result: FileViewerResult; paneId: string } {
	const newPane = createFileViewerPane(activeTab.id, options);

	const newLayout: MosaicNode<string> = {
		direction: "row",
		first: activeTab.layout,
		second: newPane.id,
		splitPercentage: 50,
	};

	return {
		result: {
			tabs: state.tabs.map((t) =>
				t.id === activeTab.id ? { ...t, layout: newLayout } : t,
			),
			panes: { ...state.panes, [newPane.id]: newPane },
			focusedPaneIds: {
				...state.focusedPaneIds,
				[activeTab.id]: newPane.id,
			},
		},
		paneId: newPane.id,
	};
}
