
# PHP Quick Serve

PHP Quick Serve is a lightweight VS Code extension designed to remove the repetitive setup involved in developing small PHP projects.

It automatically starts a PHP development server for the folder containing the active PHP or HTML file, assigns an available localhost port, and opens the file in the browser.

Each folder gets its own persistent PHP server, allowing multiple exercises or projects to stay running at the same time.

## Why I Made This

While working through PHP labs, I found myself repeatedly:

- Starting PHP servers manually with `php -S`
- Changing directories in the terminal
- Managing different server roots
- Reusing ports
- Moving between multiple task folders
- Reopening the correct localhost URL

PHP Quick Serve was created to make that workflow effectively automatic.

The goal is simple:

> Open the file and start working.

## Features

- Automatically detects supported PHP and HTML files
- Automatically starts a PHP development server
- Uses the active file's folder as the server root
- Automatically selects an available port starting from `8000`
- Supports multiple PHP servers running simultaneously
- Keeps existing servers alive when switching between project folders
- Automatically opens a browser tab when a new server starts
- Provides quick server controls from the editor title bar
- Stops all managed PHP servers when the extension shuts down
- Requires no manual terminal commands during normal use

## Supported Files

PHP Quick Serve currently activates for:

- `.php`
- `.phtml`
- `.html`
- `.htm`

Static assets such as CSS, JavaScript, images, and JSON files can still be served normally by the PHP development server, but they do not independently start new servers.

## How It Works

Suppose the following files are open:

```text
lab05/
├── Task 1/
│   ├── shoppingform.html
│   └── shoppingsave.php
│
├── Task 2/
│   └── strform.php
│
└── Task 3/
    └── index.php
````

Opening a supported file from each folder results in:

```text
Task 1 → http://127.0.0.1:8000
Task 2 → http://127.0.0.1:8001
Task 3 → http://127.0.0.1:8002
```

All three servers remain running simultaneously.

This means their browser tabs can remain open and usable while switching between tasks in VS Code.

## Editor Controls

When editing a supported PHP or HTML file, PHP Quick Serve adds a server control to the top-right of the editor.

The menu provides:

* **Open Current File**
* **Stop Current Server**
* **Stop All Servers**
* **Show Output**

## Requirements

PHP must already be installed and available through the system `PATH`.

You can verify this by running:

```bash
php --version
```

PHP Quick Serve currently uses PHP's built-in development server:

```bash
php -S 127.0.0.1:<port> -t <folder>
```

## Development

Install dependencies:

```bash
npm install
```

Open the project in VS Code and press:

```text
F5
```

This launches an **Extension Development Host** where the extension can be tested.

## Current Design

PHP Quick Serve intentionally keeps browser refreshing manual.

When source code changes:

1. Save the file
2. Return to the browser
3. Refresh manually

Live reload may be explored in the future, but the current behaviour is intentionally simple.

## Future Ideas

Possible future improvements include:

* Project-root detection for nested CSS and JavaScript files
* Configurable starting port
* Configurable PHP executable path
* Running-server overview
* Optional live reload
* Improved process recovery
* Persistent server mappings between VS Code sessions

## License

This project is currently intended for personal and educational use.

