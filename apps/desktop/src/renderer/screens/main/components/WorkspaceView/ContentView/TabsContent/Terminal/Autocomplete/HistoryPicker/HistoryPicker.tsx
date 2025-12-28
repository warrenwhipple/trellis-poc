import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useAutocompleteStore } from "../stores/autocomplete-store";

interface HistoryPickerProps {
	workspaceId: string;
	onSelect: (command: string) => void;
	onClose: () => void;
}

interface HistoryItem {
	command: string;
	timestamp: number;
	workspaceId: string | null;
	cwd: string | null;
}

/**
 * HistoryPicker displays a Warp-style inline dropdown for fuzzy searching command history.
 * Triggered by Ctrl+R.
 */
export function HistoryPicker({
	workspaceId,
	onSelect,
	onClose,
}: HistoryPickerProps) {
	const isOpen = useAutocompleteStore((s) => s.isHistoryPickerOpen);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Fetch history based on query
	const { data: historyResults, isLoading } =
		trpc.autocomplete.searchHistory.useQuery(
			{
				query,
				limit: 20,
				workspaceId,
			},
			{
				enabled: isOpen,
			},
		);

	// Also fetch recent commands when query is empty
	const { data: recentResults } = trpc.autocomplete.getRecent.useQuery(
		{
			limit: 20,
			workspaceId,
		},
		{
			enabled: isOpen && !query,
		},
	);

	const results: HistoryItem[] = query
		? (historyResults ?? [])
		: (recentResults ?? []);

	// Reset selection when results change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on results.length change
	useEffect(() => {
		setSelectedIndex(0);
	}, [results.length]);

	// Focus input when opened
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			setQuery("");
			setSelectedIndex(0);
		}
	}, [isOpen]);

	// Scroll selected item into view
	useEffect(() => {
		if (listRef.current) {
			const selectedElement = listRef.current.children[selectedIndex] as
				| HTMLElement
				| undefined;
			selectedElement?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
					break;
				case "Enter":
					e.preventDefault();
					if (results[selectedIndex]) {
						onSelect(results[selectedIndex].command);
						onClose();
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
				case "Tab":
					e.preventDefault();
					if (e.shiftKey) {
						setSelectedIndex((i) => Math.max(i - 1, 0));
					} else {
						setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
					}
					break;
			}
		},
		[results, selectedIndex, onSelect, onClose],
	);

	const handleItemClick = useCallback(
		(command: string) => {
			onSelect(command);
			onClose();
		},
		[onSelect, onClose],
	);

	// Highlight matching portions of the command
	const highlightMatch = (command: string, searchQuery: string) => {
		if (!searchQuery) return command;

		const lowerCommand = command.toLowerCase();
		const lowerQuery = searchQuery.toLowerCase();
		const index = lowerCommand.indexOf(lowerQuery);

		if (index === -1) return command;

		return (
			<>
				{command.slice(0, index)}
				<span className="text-orange-400 font-semibold">
					{command.slice(index, index + searchQuery.length)}
				</span>
				{command.slice(index + searchQuery.length)}
			</>
		);
	};

	if (!isOpen) return null;

	const selectedCommand = results[selectedIndex]?.command ?? query;

	return (
		<div className="absolute inset-x-0 bottom-0 z-20 flex flex-col">
			{/* Results dropdown */}
			{(results.length > 0 || isLoading) && (
				<div className="mx-2 mb-1 rounded-lg border border-border/50 bg-popover/95 shadow-lg backdrop-blur-sm">
					<div ref={listRef} className="max-h-64 overflow-y-auto py-1">
						{isLoading && query ? (
							<div className="px-3 py-2 text-sm text-muted-foreground">
								Searching...
							</div>
						) : (
							results.map((item, index) => (
								<button
									key={`${item.command}-${item.timestamp}`}
									type="button"
									onClick={() => handleItemClick(item.command)}
									className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
										index === selectedIndex
											? "bg-orange-500/90 text-white"
											: "text-foreground/90 hover:bg-muted/50"
									}`}
								>
									<span className="text-muted-foreground/70">{">"}</span>
									<span className="flex-1 truncate font-mono">
										{highlightMatch(item.command, query)}
									</span>
								</button>
							))
						)}
					</div>
				</div>
			)}

			{/* Input bar at bottom */}
			<div className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-orange-500 bg-orange-500/90 px-3 py-2 shadow-lg">
				<span className="font-mono text-sm text-white/90">
					{selectedCommand}
				</span>
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					className="sr-only"
					aria-label="Search command history"
				/>
				<button
					type="button"
					onClick={onClose}
					className="ml-auto text-white/70 hover:text-white"
					aria-label="Close"
				>
					<svg
						aria-hidden="true"
						className="size-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			{/* Empty state */}
			{!isLoading && results.length === 0 && (
				<div className="mx-2 mb-1 rounded-lg border border-border/50 bg-popover/95 px-3 py-4 text-center text-sm text-muted-foreground shadow-lg backdrop-blur-sm">
					{query ? "No matching commands" : "No command history yet"}
				</div>
			)}
		</div>
	);
}
