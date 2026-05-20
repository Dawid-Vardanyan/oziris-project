/**
         * SZKIELET API - Integracja z N8N Workflow
         * Klasa odpowiada za wysyłanie payloadu do N8N i odbieranie odpowiedzi z AI.
         */
        class N8nIntegration {
            constructor() {
                // DOMYŚLNY ADRES WEBHOOKA (Wpisz tu swój adres na sztywno)
                const DEFAULT_WEBHOOK_URL = 'http://localhost:5678/webhook/0b752720-3a66-45f8-9aa0-43f57356c93f';

                // UKRYTY WEBHOOK STATUSU - nie jest widoczny w konfiguracji UI.
                // Uwaga: to nadal frontend, więc technicznie da się go podejrzeć w DevTools.
                this.statusWebhookUrl = 'http://localhost:5678/webhook/88504f84-6bf3-4570-872e-317ca0df1925';
                this.statusCheckIntervalMs = 60 * 1000;
                this.statusCheckTimeoutMs = 8000;

                // Domyślne dane, ładowane z localStorage (nadpisują domyślne ustawienia z kodu)
                this.config = {
                    webhookUrl: localStorage.getItem('oziris_n8n_url') || DEFAULT_WEBHOOK_URL,
                    bearerToken: localStorage.getItem('oziris_n8n_token') || '',
                    systemPrompt: localStorage.getItem('oziris_n8n_prompt') || ''
                };
            }

            updateConfig(newConfig) {
                this.config = { ...this.config, ...newConfig };
                localStorage.setItem('oziris_n8n_url', this.config.webhookUrl);
                localStorage.setItem('oziris_n8n_token', this.config.bearerToken);
                localStorage.setItem('oziris_n8n_prompt', this.config.systemPrompt);
            }

            /**
             * Sprawdza status systemu przez ukryty webhook pingujący.
             * Webhook powinien odpowiedzieć JSON-em: { "isRunning": "true" }
             */
            async pingSystemStatus() {
                if (!this.statusWebhookUrl) {
                    return false;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.statusCheckTimeoutMs);

                try {
                    const response = await fetch(this.statusWebhookUrl, {
                        method: 'POST',
                        cache: 'no-store',
                        signal: controller.signal,
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            action: 'ping',
                            timestamp: new Date().toISOString(),
                            client: 'OZIRIS Web Wrapper'
                        })
                    });

                    if (!response.ok) {
                        return false;
                    }

                    const data = await response.json();
                    return data?.isRunning === true || data?.isRunning === 'true';
                } catch (error) {
                    console.warn('[N8N STATUS] System offline albo webhook statusu nie odpowiada:', error);
                    return false;
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            /**
             * Główna funkcja wysyłająca zapytanie do N8N.
             * @param {string} userMessage - Wiadomość użytkownika
             * @param {string} sessionId - ID obecnej sesji, by N8N wiedziało, z jakim kontekstem pracować (np. w pamięci np. Redis)
             * @param {Array} chatHistory - (Opcjonalnie) przekazywanie pełnej historii, jeśli N8N nie ma własnej bazy pamięci
             * @param {Array} attachedFiles - Pliki tekstowe odczytane po stronie przeglądarki
             */
            async sendMessage(userMessage, sessionId, chatHistory = [], attachedFiles = []) {
                console.log(`[N8N API] Wywoływanie webhooka dla sesji: ${sessionId}`);

                // Formatowanie payloadu zgodnego z tym, co N8N zwykle przyjmuje ze swoich Webhook nodes
                const payload = {
                    sessionId: sessionId,
                    action: "sendMessage",
                    chatInput: userMessage,
                    metadata: {
                        timestamp: new Date().toISOString(),
                        client: "OZIRIS Web Wrapper v1.0",
                        systemPrompt: this.config.systemPrompt
                    },
                    history: chatHistory, // W przypadku przekazywania pełnego kontekstu w locie
                    attachments: attachedFiles
                };

                // ---- RZECZYWISTY KOD DO ODKOMENTOWANIA GDY N8N JEST PODPIĘTE ----

                if (!this.config.webhookUrl) {
                    throw new Error("Brak skonfigurowanego adresu Webhooka N8N. Przejdź do ustawień.");
                }

                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (this.config.bearerToken) {
                        headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
                    }

                    const response = await fetch(this.config.webhookUrl, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`Błąd HTTP: ${response.status}`);
                    }

                    const data = await response.json();
                    // Oczekiwana struktura z N8N: { "output": "Odpowiedź AI", "toolsUsed": [...] }
                    return {
                        text: data.output || data.response || data.text || "Brak treści w odpowiedzi N8N.",
                        metadata: data.metadata || {}
                    };
                } catch (error) {
                    console.error("[N8N API] Błąd komunikacji:", error);
                    throw error;
                }

                // ---------------------------------------------------------------

                // ---- MOCK (Symulacja backendu do celów demonstracyjnych interfejsu) ----
                return new Promise((resolve) => {
                    setTimeout(() => {
                        let mockResponse = `Analiza komunikatu: "${userMessage}".\n\nPrzetwarzanie z wykorzystaniem protokołów OZIRIS zakończone. Połączenie z N8N jest symulowane (Tryb Mock). Skonfiguruj Webhook w ustawieniach i odkomentuj kod \`fetch\` w strukturze aplikacji, aby włączyć rzeczywiste wywołania do API.`;

                        if (userMessage.toLowerCase().includes("raport")) {
                            mockResponse = "Pobieram dane z węzłów N8N... Generowanie raportu zakończone. Brak krytycznych błędów w systemie głównym.";
                        }

                        resolve({
                            text: mockResponse,
                            metadata: { simulated: true, latency: 1200 }
                        });
                    }, 1500 + Math.random() * 1000); // 1.5 - 2.5s symulowane opóźnienie
                });
            }
        }
