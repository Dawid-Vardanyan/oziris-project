/**
         * STAN APLIKACJI - Lokalna pamięć dla sesji
         */
        const AppState = {
            sessions: [], // Tablica obiektów: { id, title, updatedAt, messages: [{role, text, timestamp, attachments?}] }
            currentSessionId: null,

            init() {
                const saved = localStorage.getItem('oziris_sessions');
                if (saved) {
                    try {
                        this.sessions = JSON.parse(saved);
                    } catch(e) { console.error("Błąd ładowania sesji", e); }
                }

                if (this.sessions.length === 0) {
                    this.createNewSession();
                } else {
                    // Sortuj wg najnowszych i wybierz pierwszą
                    this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
                    this.currentSessionId = this.sessions[0].id;
                }
            },

            save() {
                localStorage.setItem('oziris_sessions', JSON.stringify(this.sessions));
            },

            createNewSession() {
                const newId = 'session_' + Date.now();
                const session = {
                    id: newId,
                    title: 'Nowa Konwersacja',
                    updatedAt: Date.now(),
                    messages: []
                };
                this.sessions.unshift(session);
                this.currentSessionId = newId;
                this.save();
                return newId;
            },

            getCurrentSession() {
                return this.sessions.find(s => s.id === this.currentSessionId);
            },

            addMessage(role, text, attachments = []) {
                const session = this.getCurrentSession();
                if (session) {
                    session.messages.push({ role, text, attachments, timestamp: Date.now() });
                    session.updatedAt = Date.now();

                    // Automatyczne generowanie tytułu, jeśli to pierwsza wiadomość użytkownika
                    if (session.messages.length === 1 || (session.messages.length === 2 && session.title === 'Nowa Konwersacja')) {
                        const firstUserMsg = session.messages.find(m => m.role === 'user');
                        if (firstUserMsg) {
                            session.title = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
                        }
                    }
                    this.save();
                }
            },

            clearCurrentSession() {
                const session = this.getCurrentSession();
                if (session) {
                    session.messages = [];
                    session.title = 'Nowa Konwersacja';
                    session.updatedAt = Date.now();
                    this.save();
                }
            },

            deleteSession(id) {
                this.sessions = this.sessions.filter(s => s.id !== id);
                if (this.sessions.length === 0) {
                    this.createNewSession();
                } else if (this.currentSessionId === id) {
                    this.currentSessionId = this.sessions[0].id;
                }
                this.save();
            }
        };
