tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    colors: {
                        oziris: {
                            900: '#0B0F19', // Głębsze tło
                            800: '#111827', // Pasek boczny / elementy
                            700: '#1F2937', // Ramki, hover
                            500: '#06B6D4', // Akcent (Cyan)
                            400: '#22D3EE', // Jasny akcent
                        }
                    },
                    animation: {
                        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }
                }
            }
        }
