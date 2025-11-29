interface WebViewProps {
	url: string;
}

export function WebView({ url }: WebViewProps) {
	return (
		<div className="w-full h-full bg-background">
			<iframe
				src={url}
				className="w-full h-full border-0"
				allow="clipboard-read; clipboard-write"
				title="Cloud Terminal"
			/>
		</div>
	);
}
