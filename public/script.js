document.addEventListener('DOMContentLoaded', function() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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
    const pdfUpload = document.getElementById('pdfUpload');
    const pdfUploadZone = document.getElementById('pdfUploadZone');
    const pdfStatus = document.getElementById('pdfStatus');
    const pdfAnalysisSection = document.getElementById('pdfAnalysisSection');
    const closePdfBtn = document.getElementById('closePdfBtn');

    const pdfCanvas = document.getElementById('pdfCanvas');
    const pdfCanvasWrapper = document.getElementById('pdfCanvasWrapper');
    const pdfTextBody = document.getElementById('pdfTextBody');
    const scanLine = document.getElementById('scanLine');
    const understandingContentLive = document.getElementById('understandingContentLive');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

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

    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let pdfScale = 1.5;
    let currentMatches = [];

    const translationCache = {};
    
    let transcriptHistory = [];
    const historyBtn = document.getElementById('historyBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

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
                
                if (pdfDoc) {
                    startScanAnimation();
                }
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

    function startScanAnimation() {
        if (!scanLine) return;
        scanLine.classList.add('active');
    }

    function stopScanAnimation() {
        if (!scanLine) return;
        scanLine.classList.remove('active');
    }

    async function renderPdfPage(pageNum) {
        if (!pdfDoc) return;

        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: pdfScale });
            
            const context = pdfCanvas.getContext('2d');
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            
            if (pageInfo) {
                pageInfo.textContent = `${currentPage} / ${totalPages}`;
            }

            updateHighlightMarkers();
        } catch (error) {
            console.error('Error rendering PDF page:', error);
        }
    }

    function displayPdfTextContent() {
        if (!pdfTextBody || !pdfText) return;
        
        pdfTextBody.innerHTML = '';
        
        const textNode = document.createElement('div');
        textNode.className = 'pdf-raw-text';
        textNode.setAttribute('data-original', pdfText);
        textNode.textContent = pdfText;
        pdfTextBody.appendChild(textNode);
    }

    function highlightTextInDocument(matches) {
        if (!pdfTextBody || !pdfText) return;
        
        if (matches.length === 0) {
            displayPdfTextContent();
            return;
        }
        
        let result = escapeHtml(pdfText);
        
        // Processar cada match
        const allHighlights = [];
        matches.forEach((match, index) => {
            const searchText = match.text.trim();
            if (searchText.length < 20) return;
            
            // Procurar o texto exato no PDF
            const textToFind = searchText.substring(0, Math.min(200, searchText.length));
            const pdfLower = pdfText.toLowerCase();
            const searchLower = textToFind.toLowerCase();
            
            let startPos = pdfLower.indexOf(searchLower);
            
            if (startPos !== -1) {
                const endPos = startPos + textToFind.length;
                const relevance = match.relevance || 'high';
                
                allHighlights.push({
                    start: startPos,
                    end: endPos,
                    relevance: relevance,
                    index: index
                });
            } else {
                // Buscar por palavras-chave individuais
                const keywords = searchText.split(/\s+/).filter(w => w.length > 4);
                keywords.slice(0, 3).forEach(keyword => {
                    let pos = pdfLower.indexOf(keyword.toLowerCase());
                    if (pos !== -1) {
                        const contextStart = Math.max(0, pos - 50);
                        const contextEnd = Math.min(pdfText.length, pos + keyword.length + 50);
                        
                        allHighlights.push({
                            start: contextStart,
                            end: contextEnd,
                            relevance: 'medium',
                            index: index
                        });
                    }
                });
            }
        });
        
        // Ordenar por posição (do final para o início para não quebrar índices)
        allHighlights.sort((a, b) => b.start - a.start);
        
        // Aplicar highlights
        allHighlights.forEach(highlight => {
            const before = result.substring(0, highlight.start);
            const text = result.substring(highlight.start, highlight.end);
            const after = result.substring(highlight.end);
            
            const wrapped = `<mark class="pdf-highlight ${highlight.relevance}" data-match-index="${highlight.index}">${text}</mark>`;
            result = before + wrapped + after;
        });
        
        pdfTextBody.innerHTML = `<div class="pdf-raw-text">${result}</div>`;
        
        setupHighlightInteractions();
        
        // Rolar para o primeiro destaque
        const firstHighlight = pdfTextBody.querySelector('.pdf-highlight');
        if (firstHighlight) {
            setTimeout(() => {
                firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function setupHighlightInteractions() {
        document.querySelectorAll('.pdf-highlight').forEach(highlight => {
            highlight.addEventListener('click', function() {
                const index = parseInt(this.dataset.matchIndex);
                if (currentMatches[index]) {
                    showMatchDetail(currentMatches[index], index);
                }
                
                document.querySelectorAll('.pdf-highlight').forEach(h => h.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }

    function updateHighlightMarkers() {
        highlightTextInDocument(currentMatches);
    }

    function showMatchDetail(match, index) {
        showUnderstandingResult(match.understanding || 'Trecho selecionado', [match]);
    }

    function showAnalyzingState() {
        if (!understandingContentLive) return;

        understandingContentLive.innerHTML = `
            <div class="analyzing-state">
                <div class="analyzing-header">
                    <div class="thinking-orb">
                        <div class="core"></div>
                        <div class="ring"></div>
                    </div>
                    <div class="analyzing-text">
                        <p>Analisando sua fala...</p>
                        <span>Comparando com o documento</span>
                    </div>
                </div>
            </div>
        `;
    }

    function showUnderstandingResult(understanding, matches) {
        if (!understandingContentLive) return;

        currentMatches = matches;
        updateHighlightMarkers();

        let matchesHtml = '';
        if (matches && matches.length > 0) {
            matchesHtml = `
                <div class="matches-section">
                    <div class="matches-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        Trechos Relacionados no PDF
                    </div>
                    ${matches.map((match, index) => `
                        <div class="match-card ${match.relevance || 'low'}" data-index="${index}">
                            <div class="match-header">
                                <span class="match-number">${index + 1}</span>
                                <span class="relevance-tag ${match.relevance || 'low'}">${match.relevance || 'baixa'}</span>
                            </div>
                            <div class="match-text">${escapeHtml(match.text.substring(0, 150))}${match.text.length > 150 ? '...' : ''}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        understandingContentLive.innerHTML = `
            <div class="analyzing-state">
                <div class="understanding-result">
                    <div class="result-label">O que a IA entendeu</div>
                    <div class="understanding-bubble">
                        <p>${escapeHtml(understanding)}</p>
                    </div>
                </div>
                ${matchesHtml}
            </div>
        `;

        document.querySelectorAll('.match-card').forEach(card => {
            card.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                const highlight = pdfTextBody.querySelector(`.pdf-highlight[data-match-index="${index}"]`);
                if (highlight) {
                    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    document.querySelectorAll('.pdf-highlight').forEach(h => h.classList.remove('active'));
                    highlight.classList.add('active');
                    
                    highlight.style.animation = 'none';
                    highlight.offsetHeight;
                    highlight.style.animation = 'highlightPulse 0.5s ease-in-out 3';
                }
            });
        });
    }

    function showWaitingState() {
        if (!understandingContentLive) return;

        understandingContentLive.innerHTML = `
            <div class="waiting-state">
                <div class="listening-animation">
                    <div class="wave-container">
                        <span class="wave"></span>
                        <span class="wave"></span>
                        <span class="wave"></span>
                        <span class="wave"></span>
                        <span class="wave"></span>
                    </div>
                </div>
                <p>Aguardando fala para analisar...</p>
            </div>
        `;
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

    async function analyzePdfContext(spokenText) {
        if (!pdfText || isAnalyzingPdf || spokenText.length < 10) return;

        isAnalyzingPdf = true;
        showAnalyzingState();
        startScanAnimation();

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
                showUnderstandingResult(data.understanding, data.matches);
            } else if (data.understanding) {
                showUnderstandingResult(data.understanding, []);
            } else {
                showWaitingState();
            }
        } catch (error) {
            console.error('PDF analysis error:', error);
            showWaitingState();
        } finally {
            isAnalyzingPdf = false;
            stopScanAnimation();
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
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
                stopScanAnimation();
            } else {
                recognition.lang = sourceLang.value;
                recognition.start();
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (fullTranscript && fullTranscript.trim().length > 10) {
                addToHistory(fullTranscript);
            }
            
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
            currentMatches = [];
            showWaitingState();
            localStorage.removeItem('transcript');
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
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
               </svg>`;

        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${avatarSvg}
            </div>
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

    if (pdfUploadZone) {
        pdfUploadZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });

        pdfUploadZone.addEventListener('dragleave', function() {
            this.classList.remove('dragover');
        });

        pdfUploadZone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                handlePdfFile(file);
            }
        });
    }

    if (pdfUpload) {
        pdfUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                handlePdfFile(file);
            }
        });
    }

    async function handlePdfFile(file) {
        if (file.type !== 'application/pdf') {
            showPdfStatus('Por favor, selecione um arquivo PDF válido.', 'error');
            return;
        }

        showPdfStatus('Processando PDF...', 'loading');

        try {
            const arrayBuffer = await file.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            totalPages = pdfDoc.numPages;
            currentPage = 1;

            await renderPdfPage(currentPage);

            const formData = new FormData();
            formData.append('pdf', file);

            const response = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: file
            });

            const data = await response.json();

            if (data.error) {
                showPdfStatus(`Erro: ${data.message}`, 'error');
            } else {
                showPdfStatus(`PDF carregado! ${totalPages} página(s) - Análise visual ativada`, 'success');

                pdfText = data.text;
                fullTranscript = data.text;
                saveToLocalStorage();

                pdfAnalysisSection.style.display = 'block';

                displayPdfTextContent();

                if (settingsModal) {
                    settingsModal.classList.remove('active');
                }

                showWaitingState();
            }
        } catch (error) {
            console.error('PDF processing error:', error);
            showPdfStatus('Erro ao processar PDF. Tente novamente.', 'error');
        }
    }

    function showPdfStatus(message, type) {
        if (!pdfStatus) return;
        pdfStatus.textContent = message;
        pdfStatus.className = `pdf-status ${type}`;
        pdfStatus.style.display = 'block';
    }

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', async function() {
            if (currentPage > 1) {
                currentPage--;
                await renderPdfPage(currentPage);
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', async function() {
            if (currentPage < totalPages) {
                currentPage++;
                await renderPdfPage(currentPage);
            }
        });
    }

    if (closePdfBtn) {
        closePdfBtn.addEventListener('click', function() {
            if (pdfAnalysisSection) {
                pdfAnalysisSection.style.display = 'none';
            }
            pdfDoc = null;
            pdfText = '';
            currentMatches = [];
            if (pdfTextBody) pdfTextBody.innerHTML = '';
        });
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

    function loadTranscriptHistory() {
        const saved = localStorage.getItem('transcriptHistory');
        if (saved) {
            try {
                transcriptHistory = JSON.parse(saved);
            } catch (e) {
                transcriptHistory = [];
            }
        }
    }

    function saveTranscriptHistory() {
        localStorage.setItem('transcriptHistory', JSON.stringify(transcriptHistory));
    }

    function addToHistory(transcriptText) {
        if (!transcriptText || transcriptText.trim().length < 10) return;
        
        const historyItem = {
            id: Date.now(),
            text: transcriptText.trim(),
            date: new Date().toISOString(),
            preview: transcriptText.trim().substring(0, 100) + (transcriptText.length > 100 ? '...' : '')
        };
        
        transcriptHistory.unshift(historyItem);
        
        if (transcriptHistory.length > 50) {
            transcriptHistory = transcriptHistory.slice(0, 50);
        }
        
        saveTranscriptHistory();
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Agora';
        if (diffMins < 60) return `${diffMins} min atrás`;
        if (diffHours < 24) return `${diffHours}h atrás`;
        if (diffDays < 7) return `${diffDays} dias atrás`;
        
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function renderHistoryList() {
        if (!historyList) return;
        
        if (transcriptHistory.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>Nenhuma transcrição no histórico</p>
                    <span>As transcrições anteriores aparecerão aqui</span>
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = transcriptHistory.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-item-header">
                    <span class="history-date">${formatDate(item.date)}</span>
                    <button class="history-delete-btn" data-id="${item.id}" title="Excluir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
                <div class="history-item-preview">${escapeHtml(item.preview)}</div>
                <div class="history-item-actions">
                    <button class="history-load-btn" data-id="${item.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" x2="12" y1="3" y2="15"/>
                        </svg>
                        Carregar
                    </button>
                    <button class="history-export-btn" data-id="${item.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" x2="12" y1="15" y2="3"/>
                        </svg>
                        Exportar
                    </button>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                deleteHistoryItem(id);
            });
        });
        
        document.querySelectorAll('.history-load-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                loadHistoryItem(id);
            });
        });
        
        document.querySelectorAll('.history-export-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                exportHistoryItem(id);
            });
        });
    }

    function deleteHistoryItem(id) {
        if (!id) return;
        transcriptHistory = transcriptHistory.filter(item => item.id !== id);
        saveTranscriptHistory();
        renderHistoryList();
    }

    function loadHistoryItem(id) {
        if (!id) return;
        const item = transcriptHistory.find(item => item.id === id);
        if (!item || !item.text) return;
        
        if (fullTranscript && fullTranscript.trim().length > 10) {
            addToHistory(fullTranscript);
        }
        
        fullTranscript = item.text;
        liveTranscriptContent.innerHTML = '';
        captionBlocks = [];
        currentCaptionBlock = null;
        
        const sentences = item.text.trim().split(/(?<=[.!?])\s+/);
        sentences.forEach(sentence => {
            if (sentence.trim()) {
                finalizeSimpleCaption(sentence.trim());
            }
        });
        
        saveToLocalStorage();
        
        if (historyModal) {
            historyModal.classList.remove('active');
        }
    }

    function exportHistoryItem(id) {
        if (!id) return;
        const item = transcriptHistory.find(item => item.id === id);
        if (!item || !item.text) return;
        
        const blob = new Blob([item.text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date(item.date).toISOString().slice(0, 10);
        a.download = `transcricao_${dateStr}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    window.addEventListener('beforeunload', function() {
        if (fullTranscript && fullTranscript.trim().length > 10) {
            saveToLocalStorage();
        }
    });

    if (historyBtn && historyModal) {
        historyBtn.addEventListener('click', function() {
            renderHistoryList();
            historyModal.classList.add('active');
        });
    }

    if (closeHistoryBtn && historyModal) {
        closeHistoryBtn.addEventListener('click', function() {
            historyModal.classList.remove('active');
        });
    }

    if (historyModal) {
        historyModal.addEventListener('click', function(e) {
            if (e.target === historyModal) {
                historyModal.classList.remove('active');
            }
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', function() {
            if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
                transcriptHistory = [];
                saveTranscriptHistory();
                renderHistoryList();
            }
        });
    }

    function loadFromLocalStorage() {
        loadTranscriptHistory();
        
        const savedTranscript = localStorage.getItem('transcript');
        if (savedTranscript && savedTranscript.trim().length > 10) {
            addToHistory(savedTranscript);
            localStorage.removeItem('transcript');
        }
        
        fullTranscript = '';
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

    loadFromLocalStorage();
    loadChatHistory();

    console.log('Transcript AI with Visual PDF Analysis initialized successfully');
});
