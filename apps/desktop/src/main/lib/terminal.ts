import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import type { BrowserWindow } from "electron";
import * as pty from "node-pty";

class TerminalManager {
	private static instance: TerminalManager;
	private processes: Map<string, pty.IPty>;
	private outputHistory: Map<string, string>;
	private cwdMap: Map<string, string>; // Track CWD for each terminal
	private mainWindow: BrowserWindow | null = null;

	private constructor() {
		this.processes = new Map();
		this.outputHistory = new Map();
		this.cwdMap = new Map();
	}

	static getInstance(): TerminalManager {
		if (!TerminalManager.instance) {
			TerminalManager.instance = new TerminalManager();
		}
		return TerminalManager.instance;
	}

	setMainWindow(window: BrowserWindow | null): void {
		this.mainWindow = window;
	}

	async create(options?: {
		cwd?: string;
		cols?: number;
		rows?: number;
	}): Promise<string> {
		try {
			const id = randomUUID();
			// Use user's configured shell from environment
			const shell =
				os.platform() === "win32"
					? "powershell.exe"
					: process.env.SHELL || "/bin/zsh";

			// Use provided cwd or fallback to HOME or process.cwd()
			let workingDir = options?.cwd;

			// Validate that the directory exists
			if (workingDir && !existsSync(workingDir)) {
				console.warn(
					`Working directory does not exist: ${workingDir}, falling back to HOME or cwd`,
				);
				workingDir = undefined;
			}

			// Fallback to HOME or process.cwd() if no directory specified or doesn't exist
			const finalCwd = workingDir || process.env.HOME || process.cwd();

			// No shell flags - this is what iTerm2 and other terminals do
			// The shell will be started as a non-login, interactive shell automatically by the PTY
			const shellArgs: string[] = [];

			// Set environment variables that shells can use to detect this terminal
			const terminalEnv = {
				...(process.env as Record<string, string>),
				TERM_PROGRAM: "Superset", // Identify this terminal (like iTerm2 sets TERM_PROGRAM=iTerm.app)
				PWD: finalCwd, // Explicitly set PWD
			};

			const ptyProcess = pty.spawn(shell, shellArgs, {
				name: "xterm-256color",
				cols: options?.cols || 80,
				rows: options?.rows || 30,
				cwd: finalCwd,
				env: terminalEnv,
			});

			ptyProcess.onData((data: string) => {
				this.addTerminalMessage(id, data);
				// Try to detect CWD changes from the output
				this.detectCwdChange(id, data);
			});

			this.processes.set(id, ptyProcess);
			// Store initial CWD
			this.cwdMap.set(id, finalCwd);
			return id;
		} catch (error) {
			console.error("Failed to create terminal:", error);
			throw error;
		}
	}

	addTerminalMessage(id: string, data: string): void {
		const currentHistory = this.getHistory(id) || "";
		this.outputHistory.set(id, currentHistory + data);
		this.emitMessage(id, data);
	}

	emitMessage(id: string, data: string): void {
		this.mainWindow?.webContents.send("terminal-on-data", {
			id,
			data,
		});
	}

	write(id: string, data: string): boolean {
		try {
			const process = this.processes.get(id);
			if (process) {
				process.write(data);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Failed to write to terminal:", error);
			return false;
		}
	}

	resize(id: string, cols: number, rows: number): boolean {
		try {
			const process = this.processes.get(id);
			if (process) {
				process.resize(cols, rows);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Failed to resize terminal:", error);
			return false;
		}
	}

	kill(id: string): boolean {
		try {
			const process = this.processes.get(id);
			if (process) {
				process.kill();
				this.processes.delete(id);
				this.outputHistory.delete(id);
				this.cwdMap.delete(id);
				return true;
			}
			return false;
		} catch (error) {
			console.error("Failed to kill terminal:", error);
			return false;
		}
	}

	killAll(): boolean {
		try {
			for (const [, process] of this.processes) {
				process.kill();
			}
			this.processes.clear();
			this.outputHistory.clear();
			this.cwdMap.clear();
			return true;
		} catch (error) {
			console.error("Failed to kill all terminals:", error);
			return false;
		}
	}

	executeCommand(id: string, command: string): boolean {
		try {
			const newline = os.platform() === "win32" ? "\r\n" : "\n";
			return this.write(id, command + newline);
		} catch (error) {
			console.error("Failed to execute command:", error);
			return false;
		}
	}

	getHistory(id: string): string | undefined {
		return this.outputHistory.get(id);
	}

	/**
	 * Detect CWD changes from terminal output
	 * Looks for common shell prompt patterns that include the current directory
	 */
	private detectCwdChange(id: string, data: string): void {
		// Common patterns for CWD in shell prompts:
		// - OSC 7 escape sequence: \x1b]7;file://hostname/path\x07
		// - Common in modern shells (bash, zsh, fish) with proper config
		const osc7Match = data.match(/\x1b\]7;file:\/\/[^/]*(.+?)\x07/);
		if (osc7Match?.[1]) {
			const newCwd = decodeURIComponent(osc7Match[1]);
			this.updateCwd(id, newCwd);
			return;
		}

		// Fallback: Try to detect from prompt patterns
		// Look for common patterns like: user@host:/path/to/dir$
		// This is less reliable but works for many default shells
		const promptMatch = data.match(/^.*?[~/]([^\s$#>]+?)[\s$#>]/m);
		if (promptMatch?.[1]) {
			// This is a heuristic and may not always be accurate
			// Only update if it looks like an absolute path
			const potentialPath = promptMatch[1];
			if (potentialPath.startsWith("/")) {
				this.updateCwd(id, potentialPath);
			}
		}
	}

	/**
	 * Update the CWD for a terminal and notify the renderer
	 */
	private updateCwd(id: string, newCwd: string): void {
		const currentCwd = this.cwdMap.get(id);
		if (currentCwd !== newCwd) {
			this.cwdMap.set(id, newCwd);
			// Notify renderer about CWD change
			this.mainWindow?.webContents.send("terminal-cwd-changed", {
				id,
				cwd: newCwd,
			});
		}
	}

	/**
	 * Get the current working directory for a terminal
	 */
	getCwd(id: string): string | undefined {
		return this.cwdMap.get(id);
	}

	/**
	 * Set the current working directory for a terminal
	 * Useful for restoring state
	 */
	setCwd(id: string, cwd: string): void {
		this.cwdMap.set(id, cwd);
	}
}

export default TerminalManager.getInstance();
