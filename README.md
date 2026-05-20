# OZIRIS Modular Frontend

This is the modular version of the OZIRIS chat UI.

## How to run

Extract the whole folder and open `index.html` from inside that folder.

Do not move only `index.html` away from the `css/` and `js/` folders unless you enjoy white screens, broken scripts, and the quiet sound of frontend entropy winning.

## Files

- `index.html` - main HTML shell
- `css/tailwind-local.css` - local fallback utilities so the UI stays dark even if Tailwind CDN fails
- `css/app.css` - custom app styling
- `css/markdown.css` - rendered AI/Markdown styling
- `js/tailwind-config.js` - Tailwind CDN config, kept for compatibility
- `js/n8n-integration.js` - N8N API integration
- `js/app-state.js` - local session storage
- `js/markdown-renderer.js` - AI/Markdown renderer
- `js/ui-controller.js` - UI behavior
- `js/main.js` - bootstraps the app

## Markdown support

The renderer supports:

- headings: `#`, `##`, `###`
- horizontal separators: `---`
- Markdown tables
- blockquotes: `>`
- ordered and unordered lists
- fenced code blocks
- inline code, bold, italic
- simple `$$...$$` flow/math blocks
