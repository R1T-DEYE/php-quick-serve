
# Development Log

## PHP Quick Serve

PHP Quick Serve started as a small attempt to remove friction from my university PHP workflow.

The original problem was simple: running PHP files in VS Code was more annoying than it felt like it should be.

I was repeatedly dealing with:

- Manually running `php -S localhost:8000`
- Navigating to the correct directory first
- Making sure the server root matched the current lab task
- Dealing with nested folders
- Reusing or conflicting with ports
- Opening the correct localhost URL
- Switching between multiple lab tasks

What started as an attempt to configure existing VS Code extensions eventually turned into building my own.

---

## Stage 1 — Trying Existing PHP Tooling

The first approach was to use existing PHP extensions and VS Code debug configurations.

A custom `launch.json` was created to run PHP's built-in development server:

```text
php -S localhost:8000
````

The main difficulty was the server root.

My university folders are structured roughly like this:

```text
COS30020/
└── Week 5/
    └── lab05/
        ├── Task 1/
        ├── Task 2/
        └── Task 3/
```

Serving the overall workspace meant URLs such as:

```text
http://localhost:8000/strform.php
```

could not find files located several directories deeper.

Attempts were made to dynamically use the active file's directory as the server root.

Although this partly worked, the workflow was still inconsistent between VS Code's debugger and existing PHP server extensions.

At that point, configuring existing tools was becoming more complicated than the problem itself.

---

## Stage 2 — Creating the Extension

I decided to create a dedicated VS Code extension instead.

The project was scaffolded using the official VS Code extension generator with TypeScript.

The first test was the default:

```text
Hello World
```

command.

Once the Extension Development Host launched successfully, the first actual feature was implemented.

---

## Stage 3 — Detecting the Active File

The extension needed to determine exactly which file was currently being edited.

Using:

```ts
vscode.window.activeTextEditor
```

the extension could retrieve the active file.

From there, Node's `path` module was used to determine:

```text
Full file path
↓
Containing directory
↓
File name
```

For example:

```text
C:\...\lab05\Task 2\strform.php
```

became:

```text
Folder:
C:\...\lab05\Task 2

File:
strform.php
```

This solved the main problem encountered with the previous server configurations: the extension now knew the correct server root directly from the active file.

---

## Stage 4 — Starting PHP Automatically

The next milestone was launching PHP directly from the extension.

Node's `child_process.spawn()` was used to execute:

```text
php -S 127.0.0.1:8000 -t <active-file-directory>
```

The extension then monitored PHP's output.

Once PHP reported that the development server had started successfully, VS Code opened the active file in the default browser.

The workflow became:

```text
Open PHP file
↓
Detect folder
↓
Start PHP server
↓
Wait for successful startup
↓
Open browser
```

This was the first version that fully replaced the manual terminal workflow.

---

## Stage 5 — Server Controls

The original Hello World command was replaced with proper extension commands:

* Start Current Server
* Stop Current Server
* Restart Server
* Open Current File

The extension also began tracking the PHP process it created so it could shut the server down when required.

This made the extension functional, but it still assumed that only one PHP server would run at a time.

---

## Stage 6 — Rethinking the Architecture

The single-server design worked, but it was not ideal for the way I actually worked.

I frequently switch between multiple lab tasks.

For example:

```text
Task 1
Task 2
Task 3
```

Restarting the PHP server every time I switched folders meant that browser tabs from previous tasks stopped working.

The desired behaviour was instead:

```text
Task 1 → Server 1
Task 2 → Server 2
Task 3 → Server 3
```

with all servers remaining alive simultaneously.

This required changing the extension from a single-process design to a multi-server architecture.

---

## Stage 7 — Multiple Persistent Servers

The extension was refactored to maintain a map of running servers.

Conceptually:

```text
Task 1 folder → PHP process → port 8000
Task 2 folder → PHP process → port 8001
Task 3 folder → PHP process → port 8002
```

Each server stores:

```ts
interface PhpServer {
    process: ChildProcessWithoutNullStreams;
    port: number;
    folder: string;
}
```

The servers are tracked using:

```ts
Map<string, PhpServer>
```

The folder path acts as the identifier.

If a folder already has a running server, switching back to one of its files does nothing.

The existing server stays alive.

---

## Stage 8 — Automatic Server Startup

A listener was added using:

```ts
vscode.window.onDidChangeActiveTextEditor()
```

This allowed PHP Quick Serve to react automatically when the active editor changes.

The new behaviour became:

```text
Open Task 1 file
→ automatically start server on 8000
→ automatically open browser tab

Open Task 2 file
→ automatically start server on 8001
→ automatically open second browser tab

Return to Task 1
→ server already exists
→ do nothing
```

At this point, starting PHP servers manually became unnecessary during normal use.

---

## Stage 9 — Dynamic Port Allocation

Initially, every server attempted to use port `8000`.

This obviously failed once multiple PHP servers were introduced.

The extension was updated to search for available ports beginning from:

```text
8000
```

and increment upward:

```text
8000
8001
8002
8003
...
```

A port availability check was added using Node's `net` module.

A second issue appeared because PHP was binding using:

```text
localhost
```

while the availability check used:

```text
127.0.0.1
```

On Windows, `localhost` may resolve through IPv6, which caused the extension to incorrectly believe that port `8000` was still free.

The fix was to explicitly use:

```text
127.0.0.1
```

for both PHP and the port checker.

The extension also keeps a set of ports it has already allocated:

```ts
Set<number>
```

This prevents multiple servers starting at almost the same time from selecting the same port.

---

## Stage 10 — Supported File Types

PHP Quick Serve currently activates for:

```text
.php
.phtml
.html
.htm
```

The decision was made not to automatically activate for files such as:

```text
.css
.js
.json
```

even though PHP's development server can serve them.

The reason is folder detection.

For example:

```text
Task 1/
├── index.php
├── css/
│   └── style.css
```

If `style.css` independently triggered the current logic, its directory would incorrectly become:

```text
Task 1/css/
```

instead of:

```text
Task 1/
```

Project-root detection may be added later if support for nested assets becomes useful.

---

## Stage 11 — Server Management UI

A status bar indicator was initially implemented.

It displayed information such as:

```text
PHP :8001 • 3 servers
```

However, I normally keep the VS Code status bar hidden because I prefer a cleaner editor.

The status bar solution was therefore removed.

Instead, PHP Quick Serve was moved into the editor title controls in the top-right corner.

The control only appears for supported PHP and HTML files.

Clicking it provides:

* Open Current File
* Stop Current Server
* Stop All Servers
* Show Output

This ended up fitting the extension much better because the controls only appear when they are relevant.

---

## Current Behaviour

PHP Quick Serve now works like this:

```text
Open supported file
        ↓
Determine containing folder
        ↓
Does that folder already have a server?
        │
     Yes│        No
        │         ↓
        │    Find available port
        │         ↓
        │    Start PHP server
        │         ↓
        │    Open browser tab
        │
        └────→ Keep existing server
```

Example:

```text
Task 1 → 127.0.0.1:8000
Task 2 → 127.0.0.1:8001
Task 3 → 127.0.0.1:8002
```

All servers remain alive simultaneously.

I can therefore keep multiple browser tabs open and freely switch between tasks without restarting anything.

---

## Intentional Manual Refresh

PHP Quick Serve currently does not implement live reload.

After changing code:

```text
Save
↓
Return to browser
↓
Refresh
```

This is currently intentional.

Automatic reload could be implemented later using injected JavaScript, WebSockets, Server-Sent Events, or browser integration, but the manual refresh keeps the extension simple and predictable.

For now, I actually prefer the small quirk.

---

## What I Learned

This project ended up covering more than I expected from something that began as a convenience tool.

It involved:

* VS Code extension APIs
* TypeScript
* Node.js processes
* Process lifecycle management
* Filesystem paths
* Port allocation
* TCP sockets
* Windows networking behaviour
* Event listeners
* Asynchronous programming
* Browser launching
* State management
* UI contributions
* Command registration
* Debugging race conditions
* Designing around an actual workflow rather than an imagined one

The biggest design improvement came from recognising that the original single-server architecture did not match how I actually worked.

Instead of forcing the workflow around the implementation, the implementation was redesigned around the workflow.

---

## Current Status

**PHP Quick Serve v1 is feature complete for its original purpose.**

The original goal was:

> Stop thinking about PHP server setup while working through small PHP projects.

The current version achieves that.

Normal workflow:

```text
Open file.
Write code.
Save.
Refresh browser.
```

Everything else is handled by the extension.
