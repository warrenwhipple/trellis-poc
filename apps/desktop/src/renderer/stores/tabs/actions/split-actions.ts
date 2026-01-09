import type { MosaicBranch, MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import type { Pane, Tab, TabsState } from "../types";
import { type CreatePaneOptions, createPane } from "../utils";

interface SplitResult {
	tabs: Tab[];
	panes: Record<string, Pane>;
	focusedPaneIds: Record<string, string>;
}

/**
 * Splits a pane in the specified direction.
 * Returns null if the tab or source pane is not found.
 */
export function splitPane(
	state: TabsState,
	tabId: string,
	sourcePaneId: string,
	direction: "row" | "column",
	path?: MosaicBranch[],
	options?: CreatePaneOptions,
): SplitResult | null {
	const tab = state.tabs.find((t) => t.id === tabId);
	if (!tab) return null;

	const sourcePane = state.panes[sourcePaneId];
	if (!sourcePane || sourcePane.tabId !== tabId) return null;

	// Always create a new terminal when splitting
	const newPane = createPane(tabId, "terminal", options);

	let newLayout: MosaicNode<string>;
	if (path && path.length > 0) {
		// Split at a specific path in the layout
		newLayout = updateTree(tab.layout, [
			{
				path,
				spec: {
					$set: {
						direction,
						first: sourcePaneId,
						second: newPane.id,
						splitPercentage: 50,
					},
				},
			},
		]);
	} else {
		// Split the pane directly
		newLayout = {
			direction,
			first: tab.layout,
			second: newPane.id,
			splitPercentage: 50,
		};
	}

	return {
		tabs: state.tabs.map((t) =>
			t.id === tabId ? { ...t, layout: newLayout } : t,
		),
		panes: { ...state.panes, [newPane.id]: newPane },
		focusedPaneIds: {
			...state.focusedPaneIds,
			[tabId]: newPane.id,
		},
	};
}

/**
 * Splits a pane vertically (side by side).
 */
export function splitPaneVertical(
	state: TabsState,
	tabId: string,
	sourcePaneId: string,
	path?: MosaicBranch[],
	options?: CreatePaneOptions,
): SplitResult | null {
	return splitPane(state, tabId, sourcePaneId, "row", path, options);
}

/**
 * Splits a pane horizontally (stacked).
 */
export function splitPaneHorizontal(
	state: TabsState,
	tabId: string,
	sourcePaneId: string,
	path?: MosaicBranch[],
	options?: CreatePaneOptions,
): SplitResult | null {
	return splitPane(state, tabId, sourcePaneId, "column", path, options);
}
