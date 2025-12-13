import type { SimpleGit, SimpleGitOptions } from "simple-git";

// Dynamic require to prevent Vite from bundling dugite in the renderer process.
// The trpc routers are shared code, but dugite can only run in main process.
// Using eval('require') ensures Vite won't statically analyze this import.
const dynamicRequire =
	typeof require !== "undefined"
		? require
		: // biome-ignore lint/security/noGlobalEval: Required to prevent Vite bundling
			(eval("require") as NodeRequire);

let cachedGitPath: string | null = null;
let cachedGitExecPath: string | null = null;

// Warning message that simple-git emits even with unsafe option enabled
const SIMPLE_GIT_BINARY_WARNING =
	"Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option";

/**
 * Returns the path to the bundled git binary.
 * Uses dugite's embedded git so we don't depend on system git
 * (avoids Xcode license issues on macOS, missing git on Windows, etc.)
 */
export function getGitBinaryPath(): string {
	if (!cachedGitPath) {
		const { resolveGitBinary } = dynamicRequire(
			"dugite",
		) as typeof import("dugite");
		cachedGitPath = resolveGitBinary();
	}
	return cachedGitPath;
}

/**
 * Returns the git exec path for the bundled git.
 * Required for some git operations to find helper binaries.
 */
export function getGitExecPath(): string {
	if (!cachedGitExecPath) {
		const { resolveGitExecPath } = dynamicRequire(
			"dugite",
		) as typeof import("dugite");
		cachedGitExecPath = resolveGitExecPath();
	}
	return cachedGitExecPath;
}

/**
 * Creates a simpleGit instance configured to use the bundled git binary.
 * Suppresses the spurious warning that simple-git emits because dugite's
 * path contains '@' characters (e.g., dugite@3.0.0) which fail simple-git's
 * overly strict regex validation. The unsafe option makes it a warning
 * instead of an error, but we suppress even the warning to reduce noise.
 */
export function createBundledGit(baseDir?: string): SimpleGit {
	const simpleGit = dynamicRequire("simple-git").default as (
		opts?: Partial<SimpleGitOptions>,
	) => SimpleGit;

	// Temporarily suppress the specific warning from simple-git
	const originalWarn = console.warn;
	console.warn = (...args: unknown[]) => {
		if (args[0] === SIMPLE_GIT_BINARY_WARNING) return;
		originalWarn.apply(console, args);
	};

	try {
		return simpleGit({
			...(baseDir && { baseDir }),
			binary: getGitBinaryPath(),
			unsafe: { allowUnsafeCustomBinary: true },
		});
	} finally {
		console.warn = originalWarn;
	}
}
