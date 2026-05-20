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

## Overflow/responsive fix

This build contains stronger chat containment rules. Wide AI content such as Markdown tables, code blocks and LaTeX-style flow diagrams is constrained inside the chat bubble. Tables switch to stacked cards based on the message width, not only the browser viewport width, so it also works when the app is shown in a narrow pane.

## Layout note
AI messages are allowed to expand up to `72rem` on wide screens while still shrinking to the current chat pane width on narrow screens. User messages stay slightly narrower for readability.

## Latest layout fix

AI messages are now allowed to expand across the available chat width up to 1280px, while user messages stay narrower. The CSS uses hard overrides in `css/app.css` so old Tailwind utility limits and browser cache remnants cannot keep the previous narrow 48rem cap alive.


## Code formatting / syntax highlighting

Fenced code blocks are highlighted when the AI includes a language name after the opening triple backticks, for example:

```sql
SELECT employee_id, SUM(minutes_worked) AS total_minutes
FROM employee_hours
GROUP BY employee_id;
```

Supported highlighters: SQL, JavaScript, TypeScript, Python, JSON, HTML/XML, CSS, Bash, PowerShell, YAML, and Markdown.

There is also a small automatic detector for unlabeled blocks, but explicit labels are more reliable. Tell your LLM to output code blocks like ` ```sql `, ` ```python `, ` ```json `, etc. Tiny markup rituals, because apparently the future still requires hinting.
