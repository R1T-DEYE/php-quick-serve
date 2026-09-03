import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

interface PhpServer {
	process: ChildProcessWithoutNullStreams;
	port: number;
	folder: string;
}

const servers = new Map<string, PhpServer>();

// Folders currently in the process of starting
const startingFolders = new Set<string>();

// Ports already claimed by PHP Quick Serve
const reservedPorts = new Set<number>();

let output: vscode.OutputChannel;

const supportedExtensions = new Set([
	'.php',
	'.html',
	'.htm',
	'.phtml'
]);

export function activate(context: vscode.ExtensionContext) {

	console.log('PHP Quick Serve is now active!');

	output = vscode.window.createOutputChannel('PHP Quick Serve');

	// Automatically start a server when entering a new folder
	const editorListener = vscode.window.onDidChangeActiveTextEditor(
		editor => {

			if (editor) {
				void ensureServerForEditor(editor, true);
			}
		}
	);

	// Manual start command
	const startCommand = vscode.commands.registerCommand(
		'php-quick-serve.start',
		async () => {

			const editor = vscode.window.activeTextEditor;

			if (!editor) {

				vscode.window.showErrorMessage(
					'PHP Quick Serve: No file is currently open.'
				);

				return;
			}

			await ensureServerForEditor(editor, true);
		}
	);

	// Stop the server belonging to the current file's folder
	const stopCurrentCommand = vscode.commands.registerCommand(
		'php-quick-serve.stopCurrent',
		() => {
			stopCurrentServer();
		}
	);

	// Stop every PHP server started by the extension
	const stopAllCommand = vscode.commands.registerCommand(
		'php-quick-serve.stopAll',
		() => {
			stopAllServers();
		}
	);

	// Open the currently active file using its existing server
	const openCommand = vscode.commands.registerCommand(
		'php-quick-serve.open',
		() => {
			openCurrentFile();
		}
	);

	// Menu opened from the editor title-bar button
	const statusMenuCommand = vscode.commands.registerCommand(
		'php-quick-serve.statusMenu',
		async () => {
			await showServerMenu();
		}
	);

	context.subscriptions.push(
		editorListener,
		startCommand,
		stopCurrentCommand,
		stopAllCommand,
		openCommand,
		statusMenuCommand,
		output
	);

	// If VS Code already has a supported file open
	// when the extension activates, start its server.
	const currentEditor = vscode.window.activeTextEditor;

	if (currentEditor) {
		void ensureServerForEditor(currentEditor, true);
	}
}

async function ensureServerForEditor(
	editor: vscode.TextEditor,
	openBrowserWhenStarted: boolean
) {

	const filePath = editor.document.uri.fsPath;

	const extension = path
		.extname(filePath)
		.toLowerCase();

	// Ignore files unrelated to PHP web development
	if (!supportedExtensions.has(extension)) {
		return;
	}

	const folder = path.dirname(filePath);

	const key = normalizeFolder(folder);

	// This folder already has a running server
	if (servers.has(key)) {
		return;
	}

	// Prevent the same folder being started twice
	if (startingFolders.has(key)) {
		return;
	}

	startingFolders.add(key);

	let port: number | undefined;

	try {

		port = await findFreePort(8000);

		// Reserve the port immediately so another folder
		// cannot select it while this server starts.
		reservedPorts.add(port);

		await startServer(
			folder,
			filePath,
			port,
			openBrowserWhenStarted
		);

	} catch (error) {

		if (port !== undefined) {
			reservedPorts.delete(port);
		}

		const message =
			error instanceof Error
				? error.message
				: String(error);

		vscode.window.showErrorMessage(
			`PHP Quick Serve: ${message}`
		);

	} finally {

		startingFolders.delete(key);
	}
}

async function startServer(
	folder: string,
	filePath: string,
	port: number,
	openBrowserWhenStarted: boolean
) {

	const key = normalizeFolder(folder);

	output.show(true);

	output.appendLine('');
	output.appendLine('----------------------------------------');
	output.appendLine('Starting server');
	output.appendLine(`Root: ${folder}`);
	output.appendLine(`Port: ${port}`);

	const process = spawn(
		'php',
		[
			'-S',
			`127.0.0.1:${port}`,
			'-t',
			folder
		],
		{
			cwd: folder
		}
	);

	let serverConfirmed = false;

	process.stderr.on('data', data => {

		const message = data.toString();

		output.append(message);

		// PHP confirms that the development server
		// has successfully started.
		if (
			!serverConfirmed &&
			message.includes('Development Server')
		) {

			serverConfirmed = true;

			const server: PhpServer = {
				process,
				port,
				folder
			};

			servers.set(key, server);

			vscode.window.showInformationMessage(
				`PHP Quick Serve: ${path.basename(folder)} running on port ${port}`
			);

			if (openBrowserWhenStarted) {
				openFileInBrowser(
					filePath,
					server
				);
			}
		}

		if (message.includes('Failed to listen')) {

			reservedPorts.delete(port);

			vscode.window.showErrorMessage(
				`PHP Quick Serve: Could not start server on port ${port}.`
			);
		}
	});

	process.stdout.on('data', data => {

		output.append(
			data.toString()
		);
	});

	process.on('error', error => {

		servers.delete(key);
		reservedPorts.delete(port);

		output.appendLine(
			`ERROR: ${error.message}`
		);

		vscode.window.showErrorMessage(
			`PHP Quick Serve failed: ${error.message}`
		);
	});

	process.on('close', code => {

		const existingServer =
			servers.get(key);

		// Only remove the map entry if it belongs
		// to this exact PHP process.
		if (
			existingServer?.process === process
		) {
			servers.delete(key);
		}

		reservedPorts.delete(port);

		output.appendLine(
			`Server stopped: ${folder} on port ${port} (exit code ${code})`
		);
	});
}

function openCurrentFile() {

	const editor =
		vscode.window.activeTextEditor;

	if (!editor) {

		vscode.window.showErrorMessage(
			'PHP Quick Serve: No file is currently open.'
		);

		return;
	}

	const filePath =
		editor.document.uri.fsPath;

	const folder =
		path.dirname(filePath);

	const server = servers.get(
		normalizeFolder(folder)
	);

	if (!server) {

		vscode.window.showErrorMessage(
			'PHP Quick Serve: No server is running for this folder.'
		);

		return;
	}

	openFileInBrowser(
		filePath,
		server
	);
}

function openFileInBrowser(
	filePath: string,
	server: PhpServer
) {

	const relativePath = path.relative(
		server.folder,
		filePath
	);

	const urlPath = relativePath
		.split(path.sep)
		.map(part =>
			encodeURIComponent(part)
		)
		.join('/');

	const url =
		`http://127.0.0.1:${server.port}/${urlPath}`;

	vscode.env.openExternal(
		vscode.Uri.parse(url)
	);
}

function stopCurrentServer() {

	const editor =
		vscode.window.activeTextEditor;

	if (!editor) {

		vscode.window.showInformationMessage(
			'PHP Quick Serve: No file is currently open.'
		);

		return;
	}

	const folder = path.dirname(
		editor.document.uri.fsPath
	);

	const key =
		normalizeFolder(folder);

	const server =
		servers.get(key);

	if (!server) {

		vscode.window.showInformationMessage(
			'PHP Quick Serve: No server is running for this folder.'
		);

		return;
	}

	server.process.kill();

	servers.delete(key);

	reservedPorts.delete(
		server.port
	);

	vscode.window.showInformationMessage(
		`PHP Quick Serve: Stopped ${path.basename(folder)}`
	);
}

function stopAllServers() {

	const count = servers.size;

	for (
		const server
		of servers.values()
	) {

		server.process.kill();

		reservedPorts.delete(
			server.port
		);
	}

	servers.clear();

	vscode.window.showInformationMessage(
		`PHP Quick Serve: Stopped ${count} server${count === 1 ? '' : 's'}.`
	);
}

async function showServerMenu() {

	const editor =
		vscode.window.activeTextEditor;

	let currentServer:
		PhpServer | undefined;

	if (editor) {

		const folder = path.dirname(
			editor.document.uri.fsPath
		);

		currentServer = servers.get(
			normalizeFolder(folder)
		);
	}

	const options:
		vscode.QuickPickItem[] = [];

	// Options specific to the current server
	if (currentServer) {

		options.push({
			label: '$(link-external) Open Current File',
			description:
				`127.0.0.1:${currentServer.port}`
		});

		options.push({
			label: '$(debug-stop) Stop Current Server',
			description:
				`Port ${currentServer.port}`
		});
	}

	// Global server controls
	if (servers.size > 0) {

		options.push({
			label: '$(trash) Stop All Servers',
			description:
				`${servers.size} running`
		});
	}

	options.push({
		label: '$(output) Show Output'
	});

	const selected =
		await vscode.window.showQuickPick(
			options,
			{
				placeHolder:
					currentServer
						? `PHP Quick Serve — Port ${currentServer.port}`
						: `PHP Quick Serve — ${servers.size} server${servers.size === 1 ? '' : 's'} running`
			}
		);

	if (!selected) {
		return;
	}

	if (
		selected.label.includes(
			'Open Current File'
		)
	) {

		openCurrentFile();

	} else if (
		selected.label.includes(
			'Stop Current Server'
		)
	) {

		stopCurrentServer();

	} else if (
		selected.label.includes(
			'Stop All Servers'
		)
	) {

		stopAllServers();

	} else if (
		selected.label.includes(
			'Show Output'
		)
	) {

		output.show();
	}
}

function normalizeFolder(
	folder: string
): string {

	return path
		.resolve(folder)
		.toLowerCase();
}

async function findFreePort(
	startPort: number
): Promise<number> {

	for (
		let port = startPort;
		port < startPort + 100;
		port++
	) {

		// Already allocated by this extension
		if (
			reservedPorts.has(port)
		) {
			continue;
		}

		// Check whether another application
		// is already using the port.
		if (
			await isPortAvailable(port)
		) {
			return port;
		}
	}

	throw new Error(
		'No free PHP development port found.'
	);
}

function isPortAvailable(
	port: number
): Promise<boolean> {

	return new Promise(resolve => {

		const tester =
			net.createServer();

		tester.once(
			'error',
			() => {
				resolve(false);
			}
		);

		tester.once(
			'listening',
			() => {

				tester.close(
					() => {
						resolve(true);
					}
				);
			}
		);

		tester.listen(
			port,
			'127.0.0.1'
		);
	});
}

export function deactivate() {

	for (
		const server
		of servers.values()
	) {
		server.process.kill();
	}

	servers.clear();
	reservedPorts.clear();
}