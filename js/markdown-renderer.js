/**
 * Lightweight Markdown renderer tuned for AI responses.
 * It intentionally supports the formats this app actually receives:
 * headings, separators, tables, blockquotes, lists, code blocks, inline code,
 * bold/italic, and simple LaTeX-ish flow diagrams.
 */
const MarkdownRenderer = (() => {
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeText(value) {
        return String(value ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            // Some APIs return literal backslash-n sequences inside JSON strings.
            .replace(/\\n/g, '\n')
            .replace(/\t/g, '    ');
    }

    function renderInline(value) {
        let html = escapeHtml(value);
        const codeSpans = [];

        html = html.replace(/`([^`]+)`/g, (_match, code) => {
            const token = `@@CODE_SPAN_${codeSpans.length}@@`;
            codeSpans.push(`<code>${code}</code>`);
            return token;
        });

        html = html
            .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>')
            .replace(/(^|[\s([{])\*([^*\n]+?)\*(?=[\s\]).,;:!?}]|$)/g, '$1<em>$2</em>')
            .replace(/(^|[\s([{])_([^_\n]+?)_(?=[\s\]).,;:!?}]|$)/g, '$1<em>$2</em>');

        codeSpans.forEach((codeHtml, index) => {
            html = html.replace(`@@CODE_SPAN_${index}@@`, codeHtml);
        });

        return html;
    }

    function isSeparator(line) {
        return /^\s*(---+|\*\*\*+|___+)\s*$/.test(line);
    }

    function isHeading(line) {
        return /^\s{0,3}#{1,6}\s+\S/.test(line);
    }

    function parseHeading(line) {
        const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (!match) return null;
        return { level: Math.min(match[1].length, 4), content: match[2] };
    }

    function splitTableRow(row) {
        const cells = [];
        let current = '';
        let escaped = false;
        let trimmed = row.trim();

        if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
        if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);

        for (const char of trimmed) {
            if (escaped) {
                current += char;
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                current += char;
                continue;
            }
            if (char === '|') {
                cells.push(current.trim().replace(/\\\|/g, '|'));
                current = '';
                continue;
            }
            current += char;
        }

        cells.push(current.trim().replace(/\\\|/g, '|'));
        return cells;
    }

    function isTableRow(line) {
        const trimmed = line.trim();
        return trimmed.includes('|') && splitTableRow(trimmed).length >= 2;
    }

    function isTableSeparator(line) {
        const cells = splitTableRow(line);
        return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
    }

    function collectTable(lines, startIndex) {
        if (startIndex + 1 >= lines.length) return null;
        if (!isTableRow(lines[startIndex]) || !isTableSeparator(lines[startIndex + 1])) return null;

        const rows = [splitTableRow(lines[startIndex])];
        const alignments = splitTableRow(lines[startIndex + 1]).map(cell => {
            const trimmed = cell.trim();
            if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
            if (trimmed.endsWith(':')) return 'right';
            return 'left';
        });

        let endIndex = startIndex + 1;
        for (let index = startIndex + 2; index < lines.length; index += 1) {
            const row = lines[index];
            if (!row.trim() || !isTableRow(row) || isTableSeparator(row)) break;
            rows.push(splitTableRow(row));
            endIndex = index;
        }

        return { rows, alignments, endIndex };
    }

    function renderTable(rows, alignments) {
        const [headerRow, ...bodyRows] = rows;
        const columnCount = Math.max(...rows.map(row => row.length));

        const headerHtml = Array.from({ length: columnCount }, (_unused, index) => {
            const align = alignments[index] || 'left';
            return `<th style="text-align:${align}">${renderInline(headerRow[index] || '')}</th>`;
        }).join('');

        const bodyHtml = bodyRows.map(row => {
            const cells = Array.from({ length: columnCount }, (_unused, index) => {
                const align = alignments[index] || 'left';
                const label = escapeHtml(headerRow[index] || `Column ${index + 1}`);
                return `<td data-label="${label}" style="text-align:${align}">${renderInline(row[index] || '')}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `<div class="table-wrapper"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
    }

    function renderMathBlock(content) {
        const arrowToken = '@@MATH_ARROW@@';
        const labeledArrows = [];

        let normalized = String(content ?? '')
            .replace(/\\text\{([^{}]*)\}/g, '$1')
            .replace(/\\xrightarrow\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_match, label) => {
                const cleanLabel = label.replace(/\\text\{([^{}]*)\}/g, '$1');
                const token = `${arrowToken}${labeledArrows.length}@@`;
                labeledArrows.push(cleanLabel);
                return ` ${token} `;
            })
            .replace(/\\rightarrow/g, ' → ')
            .replace(/\\to/g, ' → ')
            .replace(/\\leftarrow/g, ' ← ')
            .replace(/\\leftrightarrow/g, ' ↔ ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        const parts = normalized.split(/(→|←|↔|@@MATH_ARROW@@\d+@@)/g).filter(Boolean);
        const html = parts.map(part => {
            const labeled = part.match(/^@@MATH_ARROW@@(\d+)@@$/);
            if (labeled) {
                const cleanLabel = escapeHtml(labeledArrows[Number(labeled[1])] || '');
                return `<span class="math-arrow"><span class="math-arrow-label">${cleanLabel}</span><span class="math-arrow-line">──────▶</span></span>`;
            }
            if (['→', '←', '↔'].includes(part.trim())) {
                return `<span class="math-arrow math-arrow-simple"><span class="math-arrow-line">${escapeHtml(part.trim())}</span></span>`;
            }
            return part.trim().split(/\s+/).filter(Boolean).map(token => `<span class="math-token">${escapeHtml(token)}</span>`).join(' ');
        }).join(' ');

        return `<div class="math-block"><div class="math-flow">${html}</div></div>`;
    }

    const LANGUAGE_ALIASES = {
        sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql', sqlite: 'sql', tsql: 'sql', plsql: 'sql',
        js: 'javascript', javascript: 'javascript', jsx: 'javascript', node: 'javascript',
        ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
        py: 'python', python: 'python', python3: 'python',
        json: 'json', jsonc: 'json',
        html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
        css: 'css', scss: 'css', sass: 'css',
        sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', powershell: 'powershell', ps1: 'powershell',
        yaml: 'yaml', yml: 'yaml',
        md: 'markdown', markdown: 'markdown',
        text: 'text', txt: 'text', plaintext: 'text'
    };

    const LANGUAGE_LABELS = {
        sql: 'SQL', javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', json: 'JSON',
        html: 'HTML', xml: 'XML', css: 'CSS', bash: 'Bash', powershell: 'PowerShell', yaml: 'YAML',
        markdown: 'Markdown', text: 'Text'
    };

    function normalizeLanguage(language) {
        const cleaned = String(language || '').trim().toLowerCase().replace(/^language-/, '');
        return LANGUAGE_ALIASES[cleaned] || cleaned || '';
    }

    function detectLanguage(code) {
        const sample = String(code || '').trim();
        if (!sample) return 'text';

        if (/^\s*(select|with|insert|update|delete|create|alter|drop)\b/i.test(sample) ||
            /\b(from|join|where|group\s+by|order\s+by|having|limit|offset)\b/i.test(sample)) {
            return 'sql';
        }
        if (/^\s*[\[{]/.test(sample)) {
            try { JSON.parse(sample); return 'json'; } catch (_error) { /* keep guessing, because computers enjoy ambiguity */ }
        }
        if (/^\s*<(!doctype|html|head|body|div|span|script|style|[a-z][\w:-]*)(\s|>|\/)/i.test(sample)) return 'html';
        if (/^\s*[.#]?[a-z][\w-]*\s*\{|\b(display|position|color|background|font-size|margin|padding)\s*:/i.test(sample)) return 'css';
        if (/^\s*(def|class|import|from|async\s+def|print\()\b/m.test(sample) || /:\s*\n\s+(return|if|for|while|try)\b/m.test(sample)) return 'python';
        if (/\b(function|const|let|var|=>|console\.log|import\s+.*\s+from|export\s+)\b/.test(sample)) return 'javascript';
        if (/^\s*(#!\/|npm\s|yarn\s|pnpm\s|cd\s|ls\s|echo\s|curl\s|docker\s|git\s)/m.test(sample)) return 'bash';
        if (/^\s*[\w.-]+:\s*.+$/m.test(sample) && !/[{};]/.test(sample)) return 'yaml';
        return 'text';
    }

    function cloneRegex(regex) {
        const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
        return new RegExp(regex.source, flags);
    }

    function highlightByRules(code, rules) {
        const source = String(code ?? '');
        const ranges = [];

        rules.forEach((rule, priority) => {
            const regex = cloneRegex(rule.regex);
            let match;
            while ((match = regex.exec(source)) !== null) {
                const text = match[0];
                if (!text) {
                    regex.lastIndex += 1;
                    continue;
                }
                ranges.push({ start: match.index, end: match.index + text.length, type: rule.type, priority });
            }
        });

        ranges.sort((a, b) => a.start - b.start || a.priority - b.priority || (b.end - b.start) - (a.end - a.start));

        const accepted = [];
        for (const range of ranges) {
            const overlaps = accepted.some(existing => range.start < existing.end && range.end > existing.start);
            if (!overlaps) accepted.push(range);
        }
        accepted.sort((a, b) => a.start - b.start);

        let cursor = 0;
        let html = '';
        accepted.forEach(range => {
            html += escapeHtml(source.slice(cursor, range.start));
            html += `<span class="token ${range.type}">${escapeHtml(source.slice(range.start, range.end))}</span>`;
            cursor = range.end;
        });
        html += escapeHtml(source.slice(cursor));
        return html;
    }

    const SQL_KEYWORDS = /\b(?:SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|WITH|AS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DATABASE|SCHEMA|TRIGGER|PROCEDURE|FUNCTION|CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|NULL|IS|IN|EXISTS|BETWEEN|LIKE|ILIKE|DISTINCT|UNION|ALL|INTERSECT|EXCEPT|COUNT|SUM|AVG|MIN|MAX|ROUND|CAST|CONVERT|COALESCE|NULLIF|DATE|DATETIME|TIMESTAMP|INTERVAL|OVER|PARTITION\s+BY|ROW_NUMBER|RANK|DENSE_RANK|DESC|ASC|TRUE|FALSE)\b/gi;

    const HIGHLIGHT_RULES = {
        sql: [
            { type: 'comment', regex: /--.*$/gm },
            { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
            { type: 'string', regex: /'(?:''|[^'])*'|"(?:""|[^"])*"/g },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
            { type: 'keyword', regex: SQL_KEYWORDS },
            { type: 'operator', regex: /\b(?:AND|OR|NOT|IS|IN|LIKE|BETWEEN)\b|[+\-*\/%=<>!]+/gi }
        ],
        javascript: [
            { type: 'comment', regex: /\/\/.*$/gm },
            { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
            { type: 'string', regex: /`(?:\\[\s\S]|[^`])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
            { type: 'keyword', regex: /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|class|extends|new|this|super|import|from|export|default|async|await|yield|typeof|instanceof|in|of|null|undefined|true|false)\b/g },
            { type: 'function', regex: /\b[A-Za-z_$][\w$]*(?=\s*\()/g },
            { type: 'operator', regex: /=>|[+\-*\/%=<>!&|?:]+/g }
        ],
        typescript: [
            { type: 'comment', regex: /\/\/.*$/gm },
            { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
            { type: 'string', regex: /`(?:\\[\s\S]|[^`])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
            { type: 'keyword', regex: /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|class|interface|type|extends|implements|public|private|protected|readonly|new|this|super|import|from|export|default|async|await|null|undefined|true|false|string|number|boolean|unknown|any|void|never)\b/g },
            { type: 'function', regex: /\b[A-Za-z_$][\w$]*(?=\s*\()/g },
            { type: 'operator', regex: /=>|[+\-*\/%=<>!&|?:]+/g }
        ],
        python: [
            { type: 'comment', regex: /#.*$/gm },
            { type: 'string', regex: /'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
            { type: 'keyword', regex: /\b(?:def|class|return|if|elif|else|for|while|break|continue|try|except|finally|raise|with|as|import|from|pass|lambda|yield|async|await|in|is|not|and|or|None|True|False|self|global|nonlocal)\b/g },
            { type: 'function', regex: /\b[A-Za-z_]\w*(?=\s*\()/g },
            { type: 'operator', regex: /[+\-*\/%=<>!&|:]+/g }
        ],
        json: [
            { type: 'property', regex: /"(?:\\.|[^"\\])*"(?=\s*:)/g },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"/g },
            { type: 'number', regex: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi },
            { type: 'keyword', regex: /\b(?:true|false|null)\b/g }
        ],
        html: [
            { type: 'comment', regex: /<!--[\s\S]*?-->/g },
            { type: 'tag', regex: /<\/?[A-Za-z][\w:-]*|\/?>/g },
            { type: 'attribute', regex: /\b[A-Za-z_:][\w:.-]*(?=\s*=)/g },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g }
        ],
        xml: [
            { type: 'comment', regex: /<!--[\s\S]*?-->/g },
            { type: 'tag', regex: /<\/?[A-Za-z][\w:-]*|\/?>/g },
            { type: 'attribute', regex: /\b[A-Za-z_:][\w:.-]*(?=\s*=)/g },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g }
        ],
        css: [
            { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
            { type: 'property', regex: /\b[-A-Za-z]+(?=\s*:)/g },
            { type: 'number', regex: /\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?\b/g },
            { type: 'keyword', regex: /\b(?:display|flex|grid|block|inline|none|relative|absolute|fixed|sticky|auto|hidden|visible|solid|dashed|center|left|right|important)\b/g },
            { type: 'operator', regex: /[{}:;,>+~*#.=]/g }
        ],
        bash: [
            { type: 'comment', regex: /#.*$/gm },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g },
            { type: 'keyword', regex: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|export|sudo|cd|echo|cat|grep|awk|sed|curl|wget|git|docker|npm|pnpm|yarn)\b/g },
            { type: 'number', regex: /\b\d+\b/g },
            { type: 'operator', regex: /[|&;<>()$=]+/g }
        ],
        powershell: [
            { type: 'comment', regex: /#.*$/gm },
            { type: 'string', regex: /"(?:`.|[^"`])*"|'(?:''|[^'])*'/g },
            { type: 'variable', regex: /\$[A-Za-z_][\w:]*/g },
            { type: 'keyword', regex: /\b(?:if|else|elseif|foreach|for|while|switch|function|param|return|try|catch|finally|throw|Write-Host|Get-ChildItem|Set-Location|New-Item|Remove-Item)\b/gi },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
            { type: 'operator', regex: /-[A-Za-z]+|[|&;<>()=]+/g }
        ],
        yaml: [
            { type: 'comment', regex: /#.*$/gm },
            { type: 'property', regex: /^\s*[-?]?\s*[A-Za-z0-9_.-]+(?=\s*:)/gm },
            { type: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/g },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
            { type: 'keyword', regex: /\b(?:true|false|null|yes|no|on|off)\b/gi }
        ],
        markdown: [
            { type: 'comment', regex: /<!--[\s\S]*?-->/g },
            { type: 'keyword', regex: /^\s{0,3}#{1,6}\s+.+$/gm },
            { type: 'operator', regex: /[*_`>#|\[\]()!-]+/g }
        ]
    };

    function highlightCode(code, language) {
        const normalized = normalizeLanguage(language) || detectLanguage(code);
        const rules = HIGHLIGHT_RULES[normalized];
        if (!rules || normalized === 'text') return escapeHtml(code);
        return highlightByRules(code, rules);
    }

    function renderCodeBlock(code, language) {
        const normalized = normalizeLanguage(language) || detectLanguage(code);
        const label = LANGUAGE_LABELS[normalized] || (normalized ? normalized.toUpperCase() : 'CODE');
        const languageClass = normalized ? ` language-${escapeHtml(normalized)}` : '';
        const highlighted = highlightCode(code, normalized);

        return `<figure class="code-block" data-language="${escapeHtml(normalized || 'text')}">` +
            `<figcaption><span>${escapeHtml(label)}</span></figcaption>` +
            `<pre><code class="syntax-highlight${languageClass}">${highlighted}</code></pre>` +
            `</figure>`;
    }

    function render(rawText) {
        const lines = normalizeText(rawText).split('\n');
        const html = [];
        let paragraph = [];
        let listItems = [];
        let listType = null;
        let quoteLines = [];
        let inCodeBlock = false;
        let codeLines = [];
        let codeFenceLanguage = '';

        const flushParagraph = () => {
            if (!paragraph.length) return;
            html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
            paragraph = [];
        };

        const flushList = () => {
            if (!listItems.length) return;
            const tag = listType === 'ol' ? 'ol' : 'ul';
            html.push(`<${tag}>${listItems.map(item => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
            listItems = [];
            listType = null;
        };

        const flushQuote = () => {
            if (!quoteLines.length) return;
            html.push(`<blockquote>${render(quoteLines.join('\n'))}</blockquote>`);
            quoteLines = [];
        };

        const flushBlocks = () => {
            flushParagraph();
            flushList();
            flushQuote();
        };

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const trimmed = line.trim();

            const fence = trimmed.match(/^```\s*([\w-]*)\s*$/);
            if (fence) {
                if (inCodeBlock) {
                    html.push(renderCodeBlock(codeLines.join('\n'), codeFenceLanguage));
                    inCodeBlock = false;
                    codeLines = [];
                    codeFenceLanguage = '';
                } else {
                    flushBlocks();
                    inCodeBlock = true;
                    codeFenceLanguage = fence[1] || '';
                }
                continue;
            }

            if (inCodeBlock) {
                codeLines.push(line);
                continue;
            }

            if (trimmed === '') {
                flushBlocks();
                continue;
            }

            if (trimmed.startsWith('$$')) {
                flushBlocks();
                const mathLines = [];
                let current = trimmed.replace(/^\$\$\s*/, '');

                if (/\$\$\s*$/.test(current)) {
                    mathLines.push(current.replace(/\s*\$\$\s*$/, ''));
                } else {
                    if (current) mathLines.push(current);
                    while (index + 1 < lines.length) {
                        index += 1;
                        const mathLine = lines[index].trim();
                        if (/\$\$\s*$/.test(mathLine)) {
                            mathLines.push(mathLine.replace(/\s*\$\$\s*$/, ''));
                            break;
                        }
                        mathLines.push(mathLine);
                    }
                }

                html.push(renderMathBlock(mathLines.join(' ').trim()));
                continue;
            }

            if (isSeparator(trimmed)) {
                flushBlocks();
                html.push('<hr>');
                continue;
            }

            if (isHeading(trimmed)) {
                flushBlocks();
                const heading = parseHeading(trimmed);
                html.push(`<h${heading.level}>${renderInline(heading.content)}</h${heading.level}>`);
                continue;
            }

            const table = collectTable(lines, index);
            if (table) {
                flushBlocks();
                html.push(renderTable(table.rows, table.alignments));
                index = table.endIndex;
                continue;
            }

            if (/^\s{0,3}>/.test(line)) {
                flushParagraph();
                flushList();
                quoteLines.push(line.replace(/^\s{0,3}>\s?/, ''));
                continue;
            }

            const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
            const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
            if (unordered || ordered) {
                flushParagraph();
                flushQuote();
                const nextType = ordered ? 'ol' : 'ul';
                if (listType && listType !== nextType) flushList();
                listType = nextType;
                listItems.push((ordered || unordered)[1]);
                continue;
            }

            flushList();
            flushQuote();
            paragraph.push(trimmed);
        }

        if (inCodeBlock) {
            html.push(renderCodeBlock(codeLines.join('\n'), codeFenceLanguage));
        }

        flushBlocks();
        return html.join('');
    }

    return { render, renderInline, escapeHtml };
})();
