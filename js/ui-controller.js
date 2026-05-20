/**
         * KONTROLER UI
         */
        const UI = {
            els: {
                appRoot: document.getElementById('appRoot'),
                sidebar: document.getElementById('sidebar'),
                mobileOverlay: document.getElementById('mobileOverlay'),
                openSidebarBtn: document.getElementById('openSidebarBtn'),
                closeSidebarBtn: document.getElementById('closeSidebarBtn'),
                sessionsList: document.getElementById('sessionsList'),
                newChatBtn: document.getElementById('newChatBtn'),
                chatArea: document.getElementById('chatArea'),
                emptyState: document.getElementById('emptyState'),
                messagesContainer: document.getElementById('messagesContainer'),
                chatInput: document.getElementById('chatInput'),
                sendBtn: document.getElementById('sendBtn'),
                chatComposer: document.getElementById('chatComposer'),
                attachFileBtn: document.getElementById('attachFileBtn'),
                fileInput: document.getElementById('fileInput'),
                selectedFilePreview: document.getElementById('selectedFilePreview'),
                selectedFileName: document.getElementById('selectedFileName'),
                selectedFileMeta: document.getElementById('selectedFileMeta'),
                removeFileBtn: document.getElementById('removeFileBtn'),
                toast: document.getElementById('toast'),
                toastMessage: document.getElementById('toastMessage'),
                currentChatTitle: document.getElementById('currentChatTitle'),
                systemStatus: document.getElementById('systemStatus'),
                systemStatusDot: document.getElementById('systemStatusDot'),
                systemStatusText: document.getElementById('systemStatusText'),
                typingIndicator: document.getElementById('typingIndicator'),
                clearChatBtn: document.getElementById('clearChatBtn'),

                // Ustawienia
                settingsBtn: document.getElementById('settingsBtn'),
                settingsModal: document.getElementById('settingsModal'),
                closeSettingsBtn: document.getElementById('closeSettingsBtn'),
                cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
                saveSettingsBtn: document.getElementById('saveSettingsBtn'),
                n8nWebhookUrl: document.getElementById('n8nWebhookUrl'),
                n8nAuthToken: document.getElementById('n8nAuthToken'),
                n8nSystemPrompt: document.getElementById('n8nSystemPrompt'),
            },

            api: new N8nIntegration(),
            isGenerating: false,
            selectedAttachedFiles: [],
            maxTextFileSizeBytes: 1024 * 1024,
            allowedFileExtensions: ['txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'],
            dragDepth: 0,
            toastTimeoutId: null,
            statusIntervalId: null,
            isCheckingSystemStatus: false,

            init() {
                AppState.init();
                this.bindEvents();
                this.renderSidebar();
                this.renderCurrentChat();
                this.updateSendButtonState();
                this.startSystemStatusMonitor();
            },

            setSystemStatus(status) {
                const statusMap = {
                    checking: {
                        wrapper: 'text-gray-400',
                        dot: 'bg-gray-500 animate-pulse',
                        text: 'System: sprawdzanie...',
                        title: 'Trwa sprawdzanie statusu systemu.'
                    },
                    online: {
                        wrapper: 'text-oziris-500',
                        dot: 'bg-oziris-500 animate-pulse',
                        text: 'System Online',
                        title: 'System odpowiada poprawnie.'
                    },
                    offline: {
                        wrapper: 'text-red-400',
                        dot: 'bg-red-500',
                        text: 'System Offline',
                        title: 'System nie odpowiada na webhook statusu.'
                    }
                };

                const statusConfig = statusMap[status] || statusMap.checking;
                this.els.systemStatus.className = `text-xs ${statusConfig.wrapper} flex items-center gap-1`;
                this.els.systemStatus.title = statusConfig.title;
                this.els.systemStatusDot.className = `w-2 h-2 rounded-full ${statusConfig.dot}`;
                this.els.systemStatusText.textContent = statusConfig.text;
            },

            async checkSystemStatus() {
                if (this.isCheckingSystemStatus) {
                    return;
                }

                this.isCheckingSystemStatus = true;

                try {
                    const isOnline = await this.api.pingSystemStatus();
                    this.setSystemStatus(isOnline ? 'online' : 'offline');
                } finally {
                    this.isCheckingSystemStatus = false;
                }
            },

            startSystemStatusMonitor() {
                clearInterval(this.statusIntervalId);
                this.setSystemStatus('checking');
                this.checkSystemStatus();
                this.statusIntervalId = setInterval(() => {
                    this.checkSystemStatus();
                }, this.api.statusCheckIntervalMs);
            },

            bindEvents() {
                // Pasek boczny (Mobile)
                this.els.openSidebarBtn.addEventListener('click', () => this.toggleSidebar(true));
                this.els.closeSidebarBtn.addEventListener('click', () => this.toggleSidebar(false));
                this.els.mobileOverlay.addEventListener('click', () => this.toggleSidebar(false));

                // Czat
                this.els.newChatBtn.addEventListener('click', () => {
                    AppState.createNewSession();
                    this.renderSidebar();
                    this.renderCurrentChat();
                    if(window.innerWidth < 768) this.toggleSidebar(false);
                });

                this.els.clearChatBtn.addEventListener('click', () => {
                    if(confirm("Czy na pewno chcesz wyczyścić tę konwersację?")) {
                        AppState.clearCurrentSession();
                        this.renderSidebar();
                        this.renderCurrentChat();
                    }
                });

                // Input Box auto-resize i wysyłanie
                this.els.chatInput.addEventListener('input', () => {
                    this.els.chatInput.style.height = 'auto';
                    this.els.chatInput.style.height = (this.els.chatInput.scrollHeight) + 'px';
                    this.updateSendButtonState();
                });

                if (!this.els.attachFileBtn || !this.els.fileInput) {
                    console.error('Brakuje elementów attachFileBtn/fileInput. Sprawdź HTML przy spinaczu.');
                } else {
                    this.els.attachFileBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.els.fileInput.click();
                    });
                    this.els.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
                }

                this.bindDragAndDropEvents();

                this.els.removeFileBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.clearSelectedFile();
                });

                this.els.chatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.handleSendMessage();
                    }
                });

                this.els.sendBtn.addEventListener('click', () => this.handleSendMessage());

                // Sugestie klikalne
                document.querySelectorAll('.suggestion-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        this.els.chatInput.value = e.target.innerText;
                        this.handleSendMessage();
                    });
                });

                // Modal Ustawień
                const openSettings = () => {
                    this.els.n8nWebhookUrl.value = this.api.config.webhookUrl;
                    this.els.n8nAuthToken.value = this.api.config.bearerToken;
                    this.els.n8nSystemPrompt.value = this.api.config.systemPrompt;
                    this.els.settingsModal.classList.remove('hidden');
                };
                const closeSettings = () => this.els.settingsModal.classList.add('hidden');

                this.els.settingsBtn.addEventListener('click', openSettings);
                this.els.closeSettingsBtn.addEventListener('click', closeSettings);
                this.els.cancelSettingsBtn.addEventListener('click', closeSettings);

                this.els.saveSettingsBtn.addEventListener('click', () => {
                    this.api.updateConfig({
                        webhookUrl: this.els.n8nWebhookUrl.value,
                        bearerToken: this.els.n8nAuthToken.value,
                        systemPrompt: this.els.n8nSystemPrompt.value
                    });
                    closeSettings();
                });
            },

            toggleSidebar(show) {
                if (show) {
                    this.els.sidebar.classList.remove('-translate-x-full');
                    this.els.mobileOverlay.classList.remove('hidden');
                } else {
                    this.els.sidebar.classList.add('-translate-x-full');
                    this.els.mobileOverlay.classList.add('hidden');
                }
            },

            renderSidebar() {
                this.els.sessionsList.innerHTML = '';

                // Grupowanie dzisiaj / wcześniej można dodać, tutaj uproszczona lista
                AppState.sessions.forEach(session => {
                    const isActive = session.id === AppState.currentSessionId;

                    const btn = document.createElement('div');
                    btn.className = `group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-gray-800 border-l-2 border-oziris-500' : 'hover:bg-gray-800/60 border-l-2 border-transparent'}`;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = "flex items-center gap-3 overflow-hidden flex-1";
                    contentDiv.innerHTML = `
                        <i class="ph ph-chat-teardrop-text text-gray-400 ${isActive ? 'text-oziris-400' : ''}"></i>
                        <span class="text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}">${session.title}</span>
                    `;
                    contentDiv.onclick = () => {
                        AppState.currentSessionId = session.id;
                        this.renderSidebar();
                        this.renderCurrentChat();
                        if(window.innerWidth < 768) this.toggleSidebar(false);
                    };

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = "text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-1";
                    deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        if(confirm("Usunąć konwersację?")) {
                            AppState.deleteSession(session.id);
                            this.renderSidebar();
                            this.renderCurrentChat();
                        }
                    };

                    btn.appendChild(contentDiv);
                    btn.appendChild(deleteBtn);
                    this.els.sessionsList.appendChild(btn);
                });
            },

            renderCurrentChat() {
                const session = AppState.getCurrentSession();
                if (!session) return;

                this.els.currentChatTitle.textContent = session.title;
                this.els.messagesContainer.innerHTML = '';

                if (session.messages.length === 0) {
                    this.els.emptyState.classList.remove('hidden');
                    this.els.messagesContainer.classList.add('hidden');
                } else {
                    this.els.emptyState.classList.add('hidden');
                    this.els.messagesContainer.classList.remove('hidden');

                    session.messages.forEach(msg => {
                        this.appendMessageElement(msg.role, msg.text, msg.attachments || []);
                    });
                    this.scrollToBottom();
                }
            },

            appendMessageElement(role, text, attachments = []) {
                const msgDiv = document.createElement('div');
                const isUser = role === 'user';

                msgDiv.className = `chat-message chat-message-${isUser ? 'user' : 'ai'} flex items-end gap-3 ${isUser ? 'flex-row-reverse' : ''}`;

                // Avatar
                const avatar = document.createElement('div');
                avatar.className = `chat-avatar w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${isUser ? 'bg-blue-600 border-blue-400/30' : 'bg-gray-800 border-oziris-500/30'}`;
                avatar.innerHTML = isUser ? '<i class="ph-fill ph-user text-white text-sm"></i>' : '<i class="ph-fill ph-hexagon text-oziris-400 text-sm"></i>';

                // Dymek wiadomości. AI output is rendered through the MarkdownRenderer module.
                const bubble = document.createElement('div');
                const formattedText = MarkdownRenderer.render(text);

                bubble.className = `chat-bubble p-4 rounded-2xl ${isUser ? 'bg-oziris-500 text-white rounded-br-sm shadow-[0_4px_15px_rgba(6,182,212,0.2)]' : 'bg-gray-800 border border-gray-700 text-gray-100 rounded-bl-sm'}`;

                const attachmentHtml = attachments.length > 0
                    ? `<div class="mb-3 flex flex-wrap gap-2">${attachments.map(file => `
                        <div class="flex items-center gap-2 rounded-lg ${isUser ? 'bg-cyan-700/40' : 'bg-gray-900'} px-2.5 py-1.5 text-xs">
                            <i class="ph ph-file-text"></i>
                            <span class="max-w-[220px] truncate">${this.escapeHtml(file.name)}</span>
                            <span class="opacity-70">${this.formatBytes(file.size)}</span>
                        </div>
                    `).join('')}</div>`
                    : '';

                bubble.innerHTML = `${attachmentHtml}<div class="message-content leading-relaxed text-sm md:text-base">${formattedText}</div>`;

                msgDiv.appendChild(avatar);
                msgDiv.appendChild(bubble);
                this.els.messagesContainer.appendChild(msgDiv);
            },

            escapeHtml(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            },

            formatBytes(bytes) {
                if (!bytes) return '0 B';
                const units = ['B', 'KB', 'MB'];
                const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
                return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
            },

            updateSendButtonState() {
                const hasText = this.els.chatInput.value.trim() !== '';
                const hasFile = this.selectedAttachedFiles.length > 0;
                this.els.sendBtn.disabled = this.isGenerating || (!hasText && !hasFile);
            },

            bindDragAndDropEvents() {
                const preventDefaults = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                };

                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    this.els.appRoot.addEventListener(eventName, preventDefaults, false);
                });

                this.els.appRoot.addEventListener('dragenter', (event) => {
                    if (!this.hasDraggedFiles(event)) return;
                    this.dragDepth += 1;
                    this.els.appRoot.classList.add('drag-drop-active');
                });

                this.els.appRoot.addEventListener('dragover', (event) => {
                    if (!this.hasDraggedFiles(event)) return;
                    event.dataTransfer.dropEffect = 'copy';
                });

                this.els.appRoot.addEventListener('dragleave', (event) => {
                    if (!this.hasDraggedFiles(event)) return;
                    this.dragDepth = Math.max(0, this.dragDepth - 1);
                    if (this.dragDepth === 0) {
                        this.els.appRoot.classList.remove('drag-drop-active');
                    }
                });

                this.els.appRoot.addEventListener('drop', async (event) => {
                    this.dragDepth = 0;
                    this.els.appRoot.classList.remove('drag-drop-active');
                    const files = Array.from(event.dataTransfer?.files || []);
                    if (files.length === 0) return;
                    await this.addFiles(files);
                });
            },

            hasDraggedFiles(event) {
                return Array.from(event.dataTransfer?.types || []).includes('Files');
            },

            showToast(message) {
                this.els.toastMessage.textContent = message;
                this.els.toast.classList.add('toast-visible');
                clearTimeout(this.toastTimeoutId);
                this.toastTimeoutId = setTimeout(() => {
                    this.els.toast.classList.remove('toast-visible');
                }, 3600);
            },

            clearSelectedFile() {
                this.selectedAttachedFiles = [];
                this.els.fileInput.value = '';
                this.renderSelectedFilesPreview();
                this.updateSendButtonState();
            },

            renderSelectedFilesPreview() {
                if (this.selectedAttachedFiles.length === 0) {
                    this.els.selectedFilePreview.classList.add('hidden');
                    this.els.selectedFileName.innerHTML = '';
                    this.els.selectedFileMeta.textContent = '';
                    return;
                }

                this.els.selectedFileName.innerHTML = this.selectedAttachedFiles.map(file => `
                    <div class="flex min-w-0 items-center gap-2 rounded-lg bg-gray-900/70 px-2 py-1">
                        <i class="ph ph-file-text text-oziris-400"></i>
                        <span class="truncate">${this.escapeHtml(file.name)}</span>
                        <span class="ml-auto flex-shrink-0 text-xs font-normal text-gray-500">${this.formatBytes(file.size)}</span>
                    </div>
                `).join('');

                const totalSize = this.selectedAttachedFiles.reduce((sum, file) => sum + file.size, 0);
                this.els.selectedFileMeta.textContent = `${this.selectedAttachedFiles.length} plik(ów) • razem ${this.formatBytes(totalSize)}`;
                this.els.selectedFilePreview.classList.remove('hidden');
            },

            isSupportedTextFile(file) {
                const extension = file.name.split('.').pop()?.toLowerCase() || '';
                const isTextMime = file.type.startsWith('text/') || file.type === 'application/json' || file.type === '';
                return this.allowedFileExtensions.includes(extension) || isTextMime;
            },

            async handleFileSelect(event) {
                const files = Array.from(event.target.files || []);
                if (files.length === 0) return;
                await this.addFiles(files);
                this.els.fileInput.value = '';
            },

            async addFiles(files) {
                const rejected = [];
                const tooLarge = [];
                const validFiles = [];

                files.forEach(file => {
                    if (!this.isSupportedTextFile(file)) {
                        rejected.push(file.name);
                        return;
                    }
                    if (file.size > this.maxTextFileSizeBytes) {
                        tooLarge.push(file.name);
                        return;
                    }
                    validFiles.push(file);
                });

                if (rejected.length > 0) {
                    this.showToast(`Nieobsługiwany typ pliku: ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}. Obsługiwane: TXT, MD, JSON, CSV, LOG, XML, YAML.`);
                }

                if (tooLarge.length > 0) {
                    this.showToast(`Plik za duży: ${tooLarge.slice(0, 3).join(', ')}${tooLarge.length > 3 ? '…' : ''}. Limit: ${this.formatBytes(this.maxTextFileSizeBytes)} na plik.`);
                }

                if (validFiles.length === 0) {
                    this.updateSendButtonState();
                    return;
                }

                try {
                    const readFiles = await Promise.all(validFiles.map(async file => ({
                        name: file.name,
                        type: file.type || 'text/plain',
                        size: file.size,
                        lastModified: file.lastModified,
                        content: await file.text()
                    })));

                    this.selectedAttachedFiles = [...this.selectedAttachedFiles, ...readFiles];
                    this.renderSelectedFilesPreview();
                    this.updateSendButtonState();
                } catch (error) {
                    console.error('Nie udało się odczytać pliku:', error);
                    this.showToast('Nie udało się odczytać jednego z plików po stronie przeglądarki. Pliki, cudowny wynalazek chaosu.');
                    this.renderSelectedFilesPreview();
                    this.updateSendButtonState();
                }
            },

            scrollToBottom() {
                // Drobne opóźnienie aby upewnić się, że DOM wyrenderował wymiary
                setTimeout(() => {
                    this.els.chatArea.scrollTop = this.els.chatArea.scrollHeight;
                }, 50);
            },

            async handleSendMessage() {
                if (this.isGenerating) return;

                const text = this.els.chatInput.value.trim();
                const attachedFiles = [...this.selectedAttachedFiles];
                if (!text && attachedFiles.length === 0) return;

                // 1. Zaktualizuj UI (Wiadomość użytkownika)
                this.els.chatInput.value = '';
                this.els.chatInput.style.height = 'auto'; // Reset height
                this.clearSelectedFile();
                this.els.sendBtn.disabled = true;

                // Ukryj empty state jeśli istnieje
                if (!this.els.emptyState.classList.contains('hidden')) {
                    this.els.emptyState.classList.add('hidden');
                    this.els.messagesContainer.classList.remove('hidden');
                }

                const displayText = text || (attachedFiles.length === 1 ? '[Załączono plik do analizy]' : `[Załączono ${attachedFiles.length} pliki do analizy]`);
                AppState.addMessage('user', displayText, attachedFiles.map(({ content, ...fileMeta }) => fileMeta));
                this.appendMessageElement('user', displayText, attachedFiles.map(({ content, ...fileMeta }) => fileMeta));
                this.scrollToBottom();
                this.renderSidebar(); // Aktualizacja tytułu jeśli to pierwsza wiadomość

                // 2. Aktywuj wskaźnik pisania
                this.isGenerating = true;
                this.els.messagesContainer.appendChild(this.els.typingIndicator);
                this.els.typingIndicator.classList.remove('hidden');
                this.scrollToBottom();

                try {
                    // 3. Wywołanie klasy odpowiedzialnej za N8N
                    const session = AppState.getCurrentSession();
                    // Zbieramy historię w prostym formacie dla N8N jeśli to potrzebne (ostatnie 10 wiadomości)
                    const historyForApi = session.messages.slice(-10).map(m => ({
                        role: m.role,
                        content: m.text,
                        attachments: (m.attachments || []).map(file => ({
                            name: file.name,
                            type: file.type,
                            size: file.size
                        }))
                    }));

                    const aiResponse = await this.api.sendMessage(text, session.id, historyForApi, attachedFiles);

                    // 4. Obsługa odpowiedzi
                    this.els.typingIndicator.classList.add('hidden'); // Ukryj wskaźnik
                    AppState.addMessage('ai', aiResponse.text);
                    this.appendMessageElement('ai', aiResponse.text);

                } catch (error) {
                    console.error("Błąd podczas komunikacji z N8N:", error);
                    this.els.typingIndicator.classList.add('hidden');
                    const errorMsg = "⚠️ **Błąd Połączenia z Systemem Bazowym (N8N).**\nProszę sprawdzić konfigurację Webhooka lub status serwera N8N.\n\n`Treść błędu: " + error.message + "`";
                    AppState.addMessage('ai', errorMsg);
                    this.appendMessageElement('ai', errorMsg);
                } finally {
                    this.isGenerating = false;
                    this.updateSendButtonState();
                    this.scrollToBottom();
                }
            }
        };
