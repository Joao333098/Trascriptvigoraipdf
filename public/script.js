document.addEventListener('DOMContentLoaded', function() {
    const micBtn = document.getElementById('micBtn');
    const clearBtn = document.getElementById('clearBtn');
    const liveTranscriptContent = document.getElementById('liveTranscriptContent');
    const liveTranscriptContainer = document.getElementById('liveTranscriptContainer');
    const audioVisualizer = document.getElementById('audioVisualizer');
    const translateToggle = document.getElementById('translateToggle');
    const sourceLang = document.getElementById('sourceLang');
    const translateLang = document.getElementById('translateLang');

    const chatModal = document.getElementById('chatModal');
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    const settingsModal = document.getElementById('settingsModal');
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    const wordModal = document.getElementById('wordModal');
    const wordOriginal = document.getElementById('wordOriginal');
    const wordTranslation = document.getElementById('wordTranslation');
    const wordDefinition = document.getElementById('wordDefinition');

    const analyzeBtn = document.getElementById('analyzeBtn');
    const summarizeBtn = document.getElementById('summarizeBtn');
    const correctBtn = document.getElementById('correctBtn');
    const exportBtn = document.getElementById('exportBtn');
    const realtimeAnalysisBtn = document.getElementById('realtimeAnalysisBtn');
    const pdfUpload = document.getElementById('pdfUpload');
    const pdfStatus = document.getElementById('pdfStatus');
    const pdfViewerSection = document.getElementById('pdfViewerSection');
    const pdfContent = document.getElementById('pdfContent');
    const closePdfBtn = document.getElementById('closePdfBtn');

    const functionsPanel = document.querySelector('.functions-panel');
    const functionsPanelTitle = functionsPanel ? functionsPanel.querySelector('h3') : null;

    let isRecording = false;
    let recognition = null;
    let fullTranscript = '';
    let chatHistory = [];
    let isTranslationActive = false;
    let currentCaptionBlock = null;
    let captionBlocks = [];
    let pdfText = '';
    let isAnalyzingPdf = false;

    const translationCache = {};

    function initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = sourceLang.value;

            recognition.onstart = function() {
                isRecording = true;
                micBtn.classList.add('recording');
                micBtn.querySelector('.mic-text').textContent = 'Parar';
                audioVisualizer.classList.add('active');
            };

            recognition.onend = function() {
                if (isRecording) {
                    recognition.start();
                }
            };

            recognition.onresult = function(event) {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (interimTranscript) {
                    updateCurrentCaption(interimTranscript, true);
                }

                if (finalTranscript) {
                    fullTranscript += finalTranscript + ' ';
                    saveToLocalStorage();

                    // Analisar PDF em tempo real se disponível
                    if (pdfText && pdfText.length > 0) {
                        analyzePdfContext(finalTranscript.trim());
                    }

                    if (isTranslationActive) {
                        finalizeCaptionWithTranslation(finalTranscript.trim());
                    } else {
                        finalizeSimpleCaption(finalTranscript.trim());
                    }
                }
            };

            recognition.onerror = function(event) {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'not-allowed') {
                    alert('Por favor, permita o acesso ao microfone para usar a transcrição.');
                }
            };
        } else {
            alert('Seu navegador não suporta reconhecimento de fala. Use Chrome ou Edge.');
        }
    }

    function clearPlaceholder() {
        const placeholder = liveTranscriptContent.querySelector('.placeholder-message');
        if (placeholder) {
            liveTranscriptContent.innerHTML = '';
        }
    }

    function updateCurrentCaption(text, isInterim = false) {
        clearPlaceholder();

        if (!currentCaptionBlock) {
            currentCaptionBlock = document.createElement('div');
            currentCaptionBlock.className = 'caption-block active live-typing';

            if (isTranslationActive) {
                currentCaptionBlock.innerHTML = `
                    <div class="caption-original"></div>
                    <div class="caption-translation">
                        <div class="translation-waiting">aguardando...</div>
                    </div>
                `;
            } else {
                currentCaptionBlock.innerHTML = `
                    <div class="caption-original"></div>
                `;
            }
            liveTranscriptContent.appendChild(currentCaptionBlock);
        }

        const originalDiv = currentCaptionBlock.querySelector('.caption-original');
        if (originalDiv) {
            originalDiv.textContent = text;
            if (isInterim) {
                originalDiv.classList.add('interim');
            } else {
                originalDiv.classList.remove('interim');
            }
        }

        scrollToBottom();
    }

    function isThinkingModeEnabled() {
        const thinkingModeEl = document.getElementById('thinkingMode');
        return thinkingModeEl ? thinkingModeEl.checked : false;
    }

    async function finalizeSimpleCaption(text) {
        clearPlaceholder();

        const thinkingEnabled = isThinkingModeEnabled();

        const captionBlock = document.createElement('div');
        captionBlock.className = 'caption-block simple';

        if (thinkingEnabled) {
            captionBlock.classList.add('with-summary');
            captionBlock.innerHTML = `
                <div class="caption-original">${escapeHtml(text)}</div>
                <div class="caption-summary">
                    <div class="summary-loading">
                        <svg class="thinking-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        <span>resumindo...</span>
                    </div>
                </div>
            `;
        } else {
            captionBlock.innerHTML = `
                <div class="caption-original">${escapeHtml(text)}</div>
            `;
        }

        if (currentCaptionBlock) {
            currentCaptionBlock.remove();
            currentCaptionBlock = null;
        }

        liveTranscriptContent.appendChild(captionBlock);
        captionBlocks.push(captionBlock);
        scrollToBottom();

        if (thinkingEnabled && text.length > 20) {
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: `Resuma em uma frase curta e objetiva: "${text}"`,
                        history: [],
                        transcript: '',
                        systemPrompt: 'Você é um assistente de resumo. Retorne APENAS o resumo em uma frase curta, sem explicações.',
                        thinkingMode: true
                    })
                });
                const data = await response.json();
                const summaryDiv = captionBlock.querySelector('.caption-summary');

                if (data.response && !data.error) {
                    summaryDiv.innerHTML = `<span class="summary-text">${escapeHtml(data.response)}</span>`;
                    captionBlock.classList.add('summarized');
                } else {
                    summaryDiv.remove();
                }
            } catch (error) {
                console.error('Summary error:', error);
                const summaryDiv = captionBlock.querySelector('.caption-summary');
                if (summaryDiv) summaryDiv.remove();
            }
        }

        scrollToBottom();
    }

    async function finalizeCaptionWithTranslation(originalText) {
        clearPlaceholder();

        const thinkingEnabled = isThinkingModeEnabled();

        const captionBlock = document.createElement('div');
        captionBlock.className = 'caption-block';

        let summaryHtml = '';
        if (thinkingEnabled) {
            captionBlock.classList.add('with-summary');
            summaryHtml = `
                <div class="caption-summary">
                    <div class="summary-loading">
                        <svg class="thinking-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        <span>resumindo...</span>
                    </div>
                </div>
            `;
        }

        captionBlock.innerHTML = `
            <div class="caption-original">${escapeHtml(originalText)}</div>
            ${summaryHtml}
            <div class="caption-translation">
                <div class="translation-loading">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            </div>
        `;

        if (currentCaptionBlock) {
            currentCaptionBlock.remove();
            currentCaptionBlock = null;
        }

        liveTranscriptContent.appendChild(captionBlock);
        captionBlocks.push(captionBlock);
        scrollToBottom();

        const translatePromise = (async () => {
            try {
                const targetLang = translateLang ? translateLang.value : 'en';
                const response = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: originalText,
                        targetLang: targetLang
                    })
                });

                const data = await response.json();
                const translationDiv = captionBlock.querySelector('.caption-translation');

                if (data.error) {
                    translationDiv.innerHTML = `<span class="translation-error">Erro na tradução</span>`;
                } else {
                    translationDiv.innerHTML = `<span class="translated-text">${escapeHtml(data.translation)}</span>`;
                    captionBlock.classList.add('translated');
                }
            } catch (error) {
                console.error('Translation error:', error);
                const translationDiv = captionBlock.querySelector('.caption-translation');
                translationDiv.innerHTML = `<span class="translation-error">Erro na tradução</span>`;
            }
        })();

        const summaryPromise = (async () => {
            if (thinkingEnabled && originalText.length > 20) {
                try {
                    const response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: `Resuma em uma frase curta e objetiva: "${originalText}"`,
                            history: [],
                            transcript: '',
                            systemPrompt: 'Você é um assistente de resumo. Retorne APENAS o resumo em uma frase curta, sem explicações.',
                            thinkingMode: true
                        })
                    });
                    const data = await response.json();
                    const summaryDiv = captionBlock.querySelector('.caption-summary');

                    if (data.response && !data.error && summaryDiv) {
                        summaryDiv.innerHTML = `<span class="summary-text">${escapeHtml(data.response)}</span>`;
                        captionBlock.classList.add('summarized');
                    } else if (summaryDiv) {
                        summaryDiv.remove();
                    }
                } catch (error) {
                    console.error('Summary error:', error);
                    const summaryDiv = captionBlock.querySelector('.caption-summary');
                    if (summaryDiv) summaryDiv.remove();
                }
            }
        })();

        await Promise.all([translatePromise, summaryPromise]);
        scrollToBottom();
    }

    function scrollToBottom() {
        if (liveTranscriptContainer) {
            liveTranscriptContainer.scrollTop = liveTranscriptContainer.scrollHeight;
        }
    }

    async function showWordModal(event, word) {
        if (!isTranslationActive) return;
        if (!wordModal || !wordOriginal || !wordTranslation || !wordDefinition) return;

        const cleanWord = word.toLowerCase().replace(/[^a-záàâãéèêíìîóòôõúùûç]/gi, '');
        const targetLang = translateLang ? translateLang.value : 'en';

        const cacheKey = `${cleanWord}_${targetLang}`;

        wordOriginal.textContent = cleanWord;
        wordTranslation.textContent = 'Traduzindo...';
        wordDefinition.textContent = '';

        const rect = event.target.getBoundingClientRect();
        wordModal.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
        wordModal.style.top = `${rect.bottom + 10}px`;
        wordModal.classList.add('active');

        setTimeout(() => {
            document.addEventListener('click', closeWordModal);
        }, 100);

        if (translationCache[cacheKey]) {
            wordTranslation.textContent = translationCache[cacheKey].translation;
            wordDefinition.textContent = `Idioma detectado: ${translationCache[cacheKey].detectedLang}`;
            return;
        }

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: cleanWord,
                    targetLang: targetLang
                })
            });

            const data = await response.json();

            if (data.error) {
                wordTranslation.textContent = 'Erro na tradução';
                wordDefinition.textContent = data.message || 'Tente novamente';
            } else {
                translationCache[cacheKey] = data;
                wordTranslation.textContent = data.translation;
                wordDefinition.textContent = `Idioma detectado: ${data.detectedLang}`;
            }
        } catch (error) {
            console.error('Translation error:', error);
            wordTranslation.textContent = 'Erro na tradução';
            wordDefinition.textContent = 'Verifique sua conexão';
        }
    }

    function closeWordModal(e) {
        if (wordModal && !wordModal.contains(e.target)) {
            wordModal.classList.remove('active');
            document.removeEventListener('click', closeWordModal);
        }
    }

    if (micBtn) {
        micBtn.addEventListener('click', function() {
            if (!recognition) {
                initSpeechRecognition();
            }

            if (isRecording) {
                isRecording = false;
                recognition.stop();
                micBtn.classList.remove('recording');
                micBtn.querySelector('.mic-text').textContent = 'Iniciar';
                audioVisualizer.classList.remove('active');
            } else {
                recognition.lang = sourceLang.value;
                recognition.start();
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            liveTranscriptContent.innerHTML = `
                <div class="placeholder-message">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                    <p>Clique no botão para iniciar a transcrição ao vivo</p>
                    <span class="hint">Ative a tradução para ver legendas em tempo real</span>
                </div>
            `;
            fullTranscript = '';
            captionBlocks = [];
            currentCaptionBlock = null;
            saveToLocalStorage();
        });
    }

    if (translateToggle) {
        translateToggle.addEventListener('click', function() {
            isTranslationActive = !isTranslationActive;
            this.classList.toggle('active', isTranslationActive);

            if (translateLang) {
                translateLang.style.display = isTranslationActive ? 'block' : 'none';
            }
        });
    }

    if (translateLang) {
        translateLang.style.display = 'none';
    }

    if (sourceLang) {
        sourceLang.addEventListener('change', function() {
            if (recognition) {
                recognition.lang = this.value;
            }
        });
    }

    if (chatToggleBtn && chatModal) {
        chatToggleBtn.addEventListener('click', function() {
            chatModal.classList.add('active');
        });
    }

    if (closeChatBtn && chatModal) {
        closeChatBtn.addEventListener('click', function() {
            chatModal.classList.remove('active');
        });
    }

    if (chatModal) {
        chatModal.addEventListener('click', function(e) {
            if (e.target === chatModal) {
                chatModal.classList.remove('active');
            }
        });
    }

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', function() {
            settingsModal.classList.add('active');
        });
    }

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', function() {
            settingsModal.classList.remove('active');
        });
    }

    if (settingsModal) {
        settingsModal.addEventListener('click', function(e) {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    async function sendMessage() {
        if (!chatInput || !chatMessages) return;

        const message = chatInput.value.trim();
        if (!message) return;

        addMessageToChat('user', message);
        chatInput.value = '';
        chatInput.style.height = 'auto';

        chatHistory.push({ role: 'user', content: message });

        showTypingIndicator();

        try {
            const systemPromptEl = document.getElementById('systemPrompt');
            const thinkingModeEl = document.getElementById('thinkingMode');
            const thinkingMode = thinkingModeEl ? thinkingModeEl.checked : false;
            const systemPrompt = systemPromptEl ? systemPromptEl.value : 'Você é uma assistente de transcrição.';

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    history: chatHistory.slice(-10),
                    transcript: fullTranscript,
                    systemPrompt: systemPrompt,
                    thinkingMode: thinkingMode
                })
            });

            const data = await response.json();

            removeTypingIndicator();

            if (data.error) {
                addMessageToChat('ai', `Erro: ${data.message || 'Falha ao gerar resposta'}`);
            } else {
                addMessageToChat('ai', data.response);
                chatHistory.push({ role: 'assistant', content: data.response });
                saveChatHistory();
            }
        } catch (error) {
            console.error('Chat error:', error);
            removeTypingIndicator();
            addMessageToChat('ai', 'Erro ao conectar com a IA. Verifique sua conexão.');
        }
    }

    function addMessageToChat(type, content) {
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const avatarSvg = type === 'ai'
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 8V4H8"/>
                <rect width="16" height="12" x="4" y="8" rx="2"/>
                <path d="M2 14h2"/>
                <path d="M20 14h2"/>
                <path d="M15 13v2"/>
                <path d="M9 13v2"/>
               </svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
               </svg>`;

        messageDiv.innerHTML = `
            <div class="message-avatar">${avatarSvg}</div>
            <div class="message-content">
                <p>${escapeHtml(content)}</p>
            </div>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        if (!chatMessages) return;

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai-message typing-message';
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 8V4H8"/>
                    <rect width="16" height="12" x="4" y="8" rx="2"/>
                    <path d="M2 14h2"/>
                    <path d="M20 14h2"/>
                    <path d="M15 13v2"/>
                    <path d="M9 13v2"/>
                </svg>
            </div>
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        if (!chatMessages) return;
        const typingMessage = chatMessages.querySelector('.typing-message');
        if (typingMessage) {
            typingMessage.remove();
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    async function analyzePdfContext(spokenText) {
        if (!pdfText || isAnalyzingPdf || spokenText.length < 10) return;
        
        isAnalyzingPdf = true;
        
        // Mostrar modal imediatamente com loading
        showUnderstandingModal('Analisando...', [], true);
        
        try {
            const response = await fetch('/api/analyze-pdf-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    spokenText: spokenText,
                    pdfText: pdfText,
                    fullTranscript: fullTranscript
                })
            });
            
            const data = await response.json();
            
            if (data.matches && data.matches.length > 0) {
                highlightPdfText(data.matches);
                showUnderstandingModal(data.understanding, data.matches, false);
                
                // Scroll automático para o primeiro destaque
                const firstHighlight = pdfContent.querySelector('.pdf-highlight');
                if (firstHighlight) {
                    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else if (data.understanding) {
                showUnderstandingModal(data.understanding, [], false);
            }
        } catch (error) {
            console.error('PDF analysis error:', error);
            showUnderstandingModal('Erro ao analisar PDF', [], false);
        } finally {
            isAnalyzingPdf = false;
        }
    }

    function highlightPdfText(matches) {
        if (!pdfContent) return;
        
        // Limpar destaques anteriores
        pdfContent.querySelectorAll('.pdf-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
        });
        
        let content = pdfContent.innerHTML;
        
        // Adicionar destaques com cores diferentes por relevância
        matches.forEach((match, index) => {
            const relevanceClass = match.relevance === 'alta' ? 'high' : 
                                  match.relevance === 'média' ? 'medium' : 'low';
            
            const regex = new RegExp(escapeRegex(match.text), 'gi');
            content = content.replace(regex, 
                `<mark class="pdf-highlight ${relevanceClass}" data-match="${index}">${match.text}</mark>`);
        });
        
        pdfContent.innerHTML = content;
        
        // Adicionar evento de clique nos destaques
        pdfContent.querySelectorAll('.pdf-highlight').forEach(highlight => {
            highlight.addEventListener('click', function() {
                const matchIndex = parseInt(this.dataset.match);
                const match = matches[matchIndex];
                if (match) {
                    showMatchDetails(match);
                }
            });
        });
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function showUnderstandingModal(understanding, matches, isLoading = false) {
        // Criar modal se não existir
        let modal = document.getElementById('understandingModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'understandingModal';
            modal.className = 'understanding-modal';
            modal.innerHTML = `
                <div class="understanding-content glass-panel">
                    <div class="understanding-header">
                        <h4>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 8V4H8"/>
                                <rect width="16" height="12" x="4" y="8" rx="2"/>
                                <path d="M2 14h2"/>
                                <path d="M20 14h2"/>
                                <path d="M15 13v2"/>
                                <path d="M9 13v2"/>
                            </svg>
                            IA Entendendo ao Vivo
                        </h4>
                        <button class="close-understanding-btn">×</button>
                    </div>
                    <div class="understanding-body">
                        <div class="understanding-text"></div>
                        <div class="understanding-matches"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.querySelector('.close-understanding-btn').addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }
        
        const textDiv = modal.querySelector('.understanding-text');
        const matchesDiv = modal.querySelector('.understanding-matches');
        
        if (isLoading) {
            textDiv.innerHTML = `
                <div class="loading-state">
                    <div class="thinking-spinner"></div>
                    <p>Analisando documento e comparando com o que você disse...</p>
                </div>
            `;
            matchesDiv.innerHTML = '';
        } else {
            textDiv.innerHTML = `
                <div class="ai-understanding">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                    <p>${escapeHtml(understanding)}</p>
                </div>
            `;
            
            if (matches.length > 0) {
                matchesDiv.innerHTML = `
                    <div class="matches-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        Trechos relacionados no PDF:
                    </div>
                    ${matches.map((match, index) => `
                        <div class="match-item ${match.relevance || 'low'}">
                            <span class="match-number">${index + 1}</span>
                            <div class="match-content">
                                <div class="match-text">"${escapeHtml(match.text.substring(0, 150))}${match.text.length > 150 ? '...' : ''}"</div>
                                ${match.relevance ? `<span class="relevance-badge ${match.relevance}">${match.relevance}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                `;
            } else {
                matchesDiv.innerHTML = '<p class="no-matches">Nenhum trecho específico encontrado no PDF.</p>';
            }
        }
        
        modal.classList.add('active');
        
        // Auto-fechar após 8 segundos (se não estiver em loading)
        if (!isLoading) {
            setTimeout(() => {
                modal.classList.remove('active');
            }, 8000);
        }
    }
    
    function showMatchDetails(match) {
        const modal = document.getElementById('understandingModal');
        if (!modal) return;
        
        const textDiv = modal.querySelector('.understanding-text');
        textDiv.innerHTML = `
            <div class="match-detail">
                <h5>Trecho selecionado:</h5>
                <p>"${escapeHtml(match.text)}"</p>
                ${match.relevance ? `<span class="relevance-badge ${match.relevance}">Relevância: ${match.relevance}</span>` : ''}
            </div>
        `;
        
        modal.classList.add('active');
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async function() {
            if (chatModal) chatModal.classList.add('active');

            const message = 'Analise detalhadamente a transcrição atual';
            addMessageToChat('user', message);
            chatHistory.push({ role: 'user', content: message });

            showTypingIndicator();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory.slice(-10),
                        transcript: fullTranscript,
                        systemPrompt: 'Você é uma assistente de análise de transcrições.',
                        thinkingMode: false
                    })
                });
                const data = await response.json();
                removeTypingIndicator();
                addMessageToChat('ai', data.response || 'Erro ao analisar');
                chatHistory.push({ role: 'assistant', content: data.response });
            } catch (error) {
                removeTypingIndicator();
                addMessageToChat('ai', 'Erro ao conectar com a IA');
            }
        });
    }

    if (summarizeBtn) {
        summarizeBtn.addEventListener('click', async function() {
            if (chatModal) chatModal.classList.add('active');

            const message = 'Faça um resumo completo e detalhado da transcrição';
            addMessageToChat('user', message);
            chatHistory.push({ role: 'user', content: message });

            showTypingIndicator();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory.slice(-10),
                        transcript: fullTranscript,
                        systemPrompt: 'Você é especialista em criar resumos concisos e informativos.',
                        thinkingMode: false
                    })
                });
                const data = await response.json();
                removeTypingIndicator();
                addMessageToChat('ai', data.response || 'Erro ao resumir');
                chatHistory.push({ role: 'assistant', content: data.response });
            } catch (error) {
                removeTypingIndicator();
                addMessageToChat('ai', 'Erro ao conectar com a IA');
            }
        });
    }

    if (correctBtn) {
        correctBtn.addEventListener('click', async function() {
            if (chatModal) chatModal.classList.add('active');

            const message = 'Corrija todos os erros gramaticais e ortográficos da transcrição e forneça a versão corrigida';
            addMessageToChat('user', message);
            chatHistory.push({ role: 'user', content: message });

            showTypingIndicator();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory.slice(-10),
                        transcript: fullTranscript,
                        systemPrompt: 'Você é um corretor profissional. Corrija todos os erros gramaticais, ortográficos e de pontuação. Retorne APENAS o texto corrigido, sem comentários adicionais.',
                        thinkingMode: true
                    })
                });
                const data = await response.json();
                removeTypingIndicator();
                addMessageToChat('ai', data.response || 'Erro ao corrigir');
                chatHistory.push({ role: 'assistant', content: data.response });
            } catch (error) {
                removeTypingIndicator();
                addMessageToChat('ai', 'Erro ao conectar com a IA');
            }
        });
    }

    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', async function() {
            if (chatModal) chatModal.classList.add('active');

            const message = 'Pesquise na internet informações atualizadas sobre os tópicos principais mencionados na transcrição e forneça um resumo atualizado';
            addMessageToChat('user', message);
            chatHistory.push({ role: 'user', content: message });

            showTypingIndicator();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory.slice(-10),
                        transcript: fullTranscript,
                        systemPrompt: 'Você é um assistente de pesquisa. Use a ferramenta de busca na web para encontrar informações atualizadas e relevantes sobre os tópicos mencionados.',
                        thinkingMode: true
                    })
                });
                const data = await response.json();
                removeTypingIndicator();
                addMessageToChat('ai', data.response || 'Erro ao pesquisar');
                chatHistory.push({ role: 'assistant', content: data.response });
            } catch (error) {
                removeTypingIndicator();
                addMessageToChat('ai', 'Erro ao conectar com a IA');
            }
        });
    }

    if (realtimeAnalysisBtn) {
        realtimeAnalysisBtn.addEventListener('click', async function() {
            if (chatModal) chatModal.classList.add('active');

            const message = 'Analise o conteúdo que está sendo transcrito em tempo real, destacando informações importantes e conceitos chave. Por favor, responda de forma concisa para cada trecho falado.';
            addMessageToChat('user', message);
            chatHistory.push({ role: 'user', content: message });

            showTypingIndicator();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory.slice(-10),
                        transcript: fullTranscript,
                        systemPrompt: 'Você é um assistente de análise em tempo real. Você receberá trechos de transcrição e deve identificar e destacar informações importantes ou conceitos chave em cada trecho. Responda de forma sucinta, focando na análise do conteúdo apresentado.',
                        thinkingMode: true
                    })
                });
                const data = await response.json();
                removeTypingIndicator();
                addMessageToChat('ai', data.response || 'Erro ao iniciar análise em tempo real.');
                chatHistory.push({ role: 'assistant', content: data.response });
            } catch (error) {
                console.error('Real-time analysis error:', error);
                removeTypingIndicator();
                addMessageToChat('ai', 'Erro ao conectar com a IA para análise em tempo real.');
            }
        });
    }


    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            if (!fullTranscript.trim()) {
                alert('Não há transcrição para exportar.');
                return;
            }

            const blob = new Blob([fullTranscript], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'transcricao_' + new Date().toISOString().slice(0, 10) + '.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (functionsPanelTitle) {
        functionsPanelTitle.addEventListener('click', function() {
            if (functionsPanel) functionsPanel.classList.toggle('expanded');
        });
    }

    function saveToLocalStorage() {
        localStorage.setItem('transcript', fullTranscript);
    }

    function loadFromLocalStorage() {
        const savedTranscript = localStorage.getItem('transcript');
        if (savedTranscript && savedTranscript.trim()) {
            fullTranscript = savedTranscript;
            clearPlaceholder();
            const sentences = savedTranscript.trim().split(/(?<=[.!?])\s+/);
            sentences.forEach(sentence => {
                if (sentence.trim()) {
                    finalizeSimpleCaption(sentence.trim());
                }
            });
        }
    }

    function saveChatHistory() {
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    }

    function loadChatHistory() {
        const saved = localStorage.getItem('chatHistory');
        if (saved) {
            chatHistory = JSON.parse(saved);
        }
    }

    if (pdfUpload) {
        pdfUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type !== 'application/pdf') {
                pdfStatus.textContent = 'Por favor, selecione um arquivo PDF válido.';
                pdfStatus.className = 'pdf-status error';
                return;
            }

            pdfStatus.textContent = 'Processando PDF...';
            pdfStatus.className = 'pdf-status';
            pdfStatus.style.display = 'block';

            try {
                const formData = new FormData();
                formData.append('pdf', file);

                const response = await fetch('/api/upload-pdf', {
                    method: 'POST',
                    body: file
                });

                const data = await response.json();

                if (data.error) {
                    pdfStatus.textContent = `Erro: ${data.message}`;
                    pdfStatus.className = 'pdf-status error';
                } else {
                    pdfStatus.textContent = `PDF carregado com sucesso! ${data.pages} páginas encontradas.`;
                    pdfStatus.className = 'pdf-status success';
                    
                    pdfText = data.text;
                    pdfContent.textContent = data.text;
                    pdfViewerSection.style.display = 'block';
                    
                    fullTranscript = data.text;
                    saveToLocalStorage();

                    if (settingsModal) {
                        settingsModal.classList.remove('active');
                    }
                }
            } catch (error) {
                console.error('PDF upload error:', error);
                pdfStatus.textContent = 'Erro ao processar PDF. Tente novamente.';
                pdfStatus.className = 'pdf-status error';
            }
        });
    }

    if (closePdfBtn) {
        closePdfBtn.addEventListener('click', function() {
            if (pdfViewerSection) {
                pdfViewerSection.style.display = 'none';
            }
        });
    }

    loadFromLocalStorage();
    loadChatHistory();

    console.log('Transcript AI initialized successfully');
});