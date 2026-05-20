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
                return `<td style="text-align:${align}">${renderInline(row[index] || '')}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `<div class="table-wrapper"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
    }

    function renderMathBlock(content) {
        let html = escapeHtml(content)
            .replace(/\\text\{([^{}]*)\}/g, '$1')
            .replace(/\\xrightarrow\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_match, label) => {
                const cleanLabel = escapeHtml(label.replace(/\\text\{([^{}]*)\}/g, '$1'));
                return `<span class="math-arrow"><span class="math-arrow-label">${cleanLabel}</span><span class="math-arrow-line">──────▶</span></span>`;
            })
            .replace(/\\rightarrow/g, '→')
            .replace(/\\to/g, '→')
            .replace(/\\leftarrow/g, '←')
            .replace(/\\leftrightarrow/g, '↔')
            .replace(/\s{2,}/g, ' ');

        return `<div class="math-block">${html}</div>`;
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
                    const languageClass = codeFenceLanguage ? ` class="language-${escapeHtml(codeFenceLanguage)}"` : '';
                    html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
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
            const languageClass = codeFenceLanguage ? ` class="language-${escapeHtml(codeFenceLanguage)}"` : '';
            html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        }

        flushBlocks();
        return html.join('');
    }

    return { render, renderInline, escapeHtml };
})();
