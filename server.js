const http = require('http');
const fs = require('fs');
const path = require('path');
const { ZhipuAI } = require('zhipuai-sdk-nodejs-v4');
const https = require('https');
const FormData = require('form-data');

const PORT = 5000;

// Carregar configuração
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

// Inicializar cliente Zhipu AI corretamente
let zhipuClient;
try {
    zhipuClient = new ZhipuAI({
        apiKey: config.zhipuApiKey
    });
    console.log('Zhipu AI client initialized successfully');
} catch (error) {
    console.error('Failed to initialize Zhipu AI client:', error);
}

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Função para fazer busca web usando web-search-pro
async function performWebSearch(query) {
    try {
        const https = require('https');

        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                tool: 'web-search-pro',
                stream: false,
                messages: [
                    {
                        role: 'user',
                        content: query
                    }
                ]
            });

            const options = {
                hostname: 'open.bigmodel.cn',
                port: 443,
                path: '/api/paas/v4/tools',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.zhipuApiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        console.log('Web Search Response:', JSON.stringify(parsed, null, 2));

                        // Extrair resultados de busca
                        let searchResults = [];
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                            const toolCalls = parsed.choices[0].message.tool_calls;
                            if (toolCalls) {
                                toolCalls.forEach(call => {
                                    if (call.search_result) {
                                        searchResults = searchResults.concat(call.search_result);
                                    }
                                });
                            }
                        }

                        resolve(searchResults);
                    } catch (e) {
                        console.error('Error parsing web search response:', e);
                        resolve([]);
                    }
                });
            });

            req.on('error', (e) => {
                console.error('Web search request error:', e);
                resolve([]);
            });

            req.setTimeout(10000, () => {
                req.destroy();
                resolve([]);
            });

            req.write(data);
            req.end();
        });
    } catch (error) {
        console.error('Web search error:', error);
        return [];
    }
}

async function handleChat(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const { message, history, transcript, systemPrompt, thinkingMode, enableWebSearch } = JSON.parse(body);

            if (!message) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing message' }));
                return;
            }

            const messages = [];

            // System prompt com contexto da transcrição
            let finalSystemPrompt = systemPrompt || 'Você é uma assistente de transcrição inteligente. Responda de forma clara e direta.';
            if (transcript && transcript.trim()) {
                finalSystemPrompt += `\n\nTranscrição atual disponível:\n"${transcript.trim()}"`;
            }

            // Se busca web está ativada, fazer pesquisa primeiro
            let webContext = '';
            if (enableWebSearch && thinkingMode) {
                console.log('Performing web search for:', message);
                const searchResults = await performWebSearch(message);

                if (searchResults.length > 0) {
                    webContext = '\n\n[Informações da Web]\n';
                    searchResults.slice(0, 5).forEach((result, index) => {
                        webContext += `${index + 1}. ${result.title || ''}\n`;
                        if (result.content) {
                            webContext += `   ${result.content.substring(0, 300)}...\n`;
                        }
                        if (result.link) {
                            webContext += `   Fonte: ${result.link}\n`;
                        }
                        webContext += '\n';
                    });

                    finalSystemPrompt += webContext;
                    console.log('Web context added:', webContext.substring(0, 200));
                }
            }

            messages.push({
                role: "system",
                content: finalSystemPrompt
            });

            // Adicionar histórico recente (últimas 10 mensagens)
            if (history && Array.isArray(history)) {
                const recentHistory = history.slice(-10);
                recentHistory.forEach(msg => {
                    messages.push({
                        role: msg.role === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    });
                });
            }

            // Mensagem atual do usuário
            messages.push({
                role: "user",
                content: message
            });

            // Validar se o cliente está inicializado
            if (!zhipuClient) {
                throw new Error('Cliente Zhipu AI não está inicializado. Verifique sua API key em config.json');
            }

            // Usar GLM-4.1V-Thinking-Flash (GRATUITO) para thinking mode, GLM-4-Flash para respostas rápidas
            const model = thinkingMode ? 'glm-4.1v-thinking-flash' : config.model;

            let response;

            if (thinkingMode) {
                // Para o modelo de thinking, não usar tools e ajustar parâmetros
                response = await zhipuClient.createCompletions({
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 8000
                });
            } else {
                // Para modo normal, usar ferramentas de pesquisa web
                const tools = [
                    {
                        type: "web_search",
                        web_search: {
                            enable: true,
                            search_result: true
                        }
                    }
                ];

                response = await zhipuClient.createCompletions({
                    model: model,
                    messages: messages,
                    temperature: 0.5,
                    max_tokens: 1000,
                    tools: tools
                });
            }

            console.log('API Response:', JSON.stringify(response, null, 2));

            // Validar a estrutura da resposta
            if (!response || !response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                console.error('Resposta inválida da API:', response);
                throw new Error('Resposta da API está vazia ou em formato incorreto');
            }

            const choice = response.choices[0];

            // Para o modelo thinking, o conteúdo pode estar em diferentes locais
            let aiResponse = '';
            if (choice.message && choice.message.content) {
                aiResponse = choice.message.content.trim();
            } else if (choice.content) {
                aiResponse = choice.content.trim();
            } else {
                console.error('Conteúdo da mensagem não encontrado:', choice);
                throw new Error('Conteúdo da mensagem não disponível');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                response: aiResponse,
                hasWebSearch: webContext.length > 0
            }));
        } catch (error) {
            console.error('Chat error:', error);

            let errorMessage = 'Erro ao conectar com a IA';

            // Verificar se é erro de saldo
            if (error.error && error.error.code === '1113') {
                errorMessage = 'Saldo da API Zhipu AI esgotado. Por favor, recarregue seu saldo em https://open.bigmodel.cn/';
            } else if (error.message) {
                errorMessage = error.message;
            }

            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Chat failed', 
                message: errorMessage,
                details: error.error || error 
            }));
        }
    });
}

async function handleAnalyzeRealtime(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const { text, fullContext, thinkingMode } = JSON.parse(body);

            if (!text) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing text' }));
                return;
            }

            if (!zhipuClient) {
                throw new Error('Cliente Zhipu AI não está inicializado');
            }

            const systemPrompt = `Você é um assistente de análise de texto em tempo real. 
Analise o texto fornecido e retorne APENAS um JSON válido com esta estrutura:
{
  "keywords": ["palavra1", "palavra2", "palavra3"],
  "understanding": "Uma frase curta explicando o que você entendeu",
  "highlights": ["frase importante 1", "frase importante 2"]
}

Não inclua nenhum texto adicional, apenas o JSON.`;

            const response = await zhipuClient.createCompletions({
                model: thinkingMode ? 'glm-4.1v-thinking-flash' : config.model,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: `Contexto completo: ${fullContext}\n\nNovo texto: ${text}`
                    }
                ],
                temperature: 0.5,
                max_tokens: 500
            });

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error('Resposta de análise vazia ou inválida');
            }

            let analysisText = response.choices[0].message.content.trim();

            // Extrair JSON da resposta
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysisData = JSON.parse(jsonMatch[0]);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(analysisData));
            } else {
                // Fallback: criar estrutura básica
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    keywords: text.split(' ').filter(w => w.length > 4).slice(0, 5),
                    understanding: analysisText.substring(0, 150),
                    highlights: []
                }));
            }

        } catch (error) {
            console.error('Real-time analysis error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Analysis failed', 
                message: error.message 
            }));
        }
    });
}

// Função para criar tarefa de parsing usando Zhipu File Parsing API
async function createZhipuParseTask(buffer) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', buffer, { 
            filename: 'document.pdf',
            contentType: 'application/pdf'
        });
        form.append('purpose', 'file-extract');

        const options = {
            hostname: 'open.bigmodel.cn',
            port: 443,
            path: '/api/paas/v4/files',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.zhipuApiKey}`,
                ...form.getHeaders()
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    console.log('Upload response:', data);
                    const result = JSON.parse(data);
                    if (result.id) {
                        resolve(result.id);
                    } else {
                        reject(new Error(result.error?.message || 'Failed to upload file'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        form.pipe(req);
    });
}

// Função para obter conteúdo do arquivo parseado
async function getZhipuFileContent(fileId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'open.bigmodel.cn',
            port: 443,
            path: `/api/paas/v4/files/${fileId}/content`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.zhipuApiKey}`
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    console.log('Content response:', responseData.substring(0, 500));
                    resolve(responseData);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function handlePdfUpload(req, res) {
    let chunks = [];

    req.on('data', chunk => {
        chunks.push(chunk);
    });

    req.on('end', async () => {
        try {
            const buffer = Buffer.concat(chunks);
            
            console.log('Fazendo upload do PDF para Zhipu...');
            const fileId = await createZhipuParseTask(buffer);
            console.log('File ID criado:', fileId);

            // Aguarda 3 segundos para processamento
            await new Promise(r => setTimeout(r, 3000));
            
            // Busca conteúdo do arquivo
            const parsedText = await getZhipuFileContent(fileId);

            if (!parsedText || parsedText.trim().length === 0) {
                throw new Error('PDF parsing returned empty content');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                text: parsedText,
                pages: 0,
                info: { title: 'Parsed with Zhipu API', fileId: fileId }
            }));
        } catch (error) {
            console.error('PDF parse error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'PDF parse failed', 
                message: error.message 
            }));
        }
    });
}

async function handleAnalyzePdfContext(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const { spokenText, pdfText, fullTranscript } = JSON.parse(body);

            if (!spokenText || !pdfText) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing data' }));
                return;
            }

            if (!zhipuClient) {
                throw new Error('Cliente Zhipu AI não está inicializado');
            }

            const systemPrompt = `Você é um assistente especializado em análise de documentos PDF em tempo real.

Sua tarefa:
1. Entenda o que a pessoa está falando
2. Encontre os trechos EXATOS do PDF que se relacionam com o que foi dito
3. Classifique cada trecho por relevância (alta/média/baixa)

Retorne APENAS um JSON válido com esta estrutura:
{
  "understanding": "Explicação clara e concisa do que você entendeu que a pessoa está falando sobre",
  "matches": [
    {
      "text": "Trecho EXATO e COMPLETO do PDF (não resuma, copie literalmente)",
      "relevance": "alta" (use "alta" para correspondências diretas, "média" para relacionadas, "baixa" para contextuais)
    }
  ]
}

Importante:
- Copie os trechos EXATAMENTE como aparecem no PDF
- Inclua contexto suficiente (frases completas, não fragmentos)
- Priorize trechos que mencionam diretamente o que foi falado
- Máximo 5 trechos mais relevantes
- Se não houver correspondência clara, retorne matches vazio []`;

            const response = await zhipuClient.createCompletions({
                model: 'glm-4.1v-thinking-flash',
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: `Texto do PDF:\n${pdfText.substring(0, 3000)}\n\nTexto falado agora: "${spokenText}"\n\nContexto da conversa: ${fullTranscript.substring(0, 500)}`
                    }
                ],
                temperature: 0.5,
                max_tokens: 1000
            });

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error('Resposta de análise vazia');
            }

            let analysisText = response.choices[0].message.content.trim();

            // Extrair JSON da resposta
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysisData = JSON.parse(jsonMatch[0]);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(analysisData));
            } else {
                // Fallback
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    understanding: analysisText.substring(0, 200),
                    matches: []
                }));
            }

        } catch (error) {
            console.error('PDF context analysis error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Analysis failed', 
                message: error.message 
            }));
        }
    });
}

async function handleTranslate(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const { text, targetLang } = JSON.parse(body);

            if (!text || !targetLang) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing text or targetLang' }));
                return;
            }

            // Mapa de códigos de idioma
            const langMap = {
                'en': 'inglês',
                'pt': 'português',
                'es': 'espanhol',
                'fr': 'francês',
                'de': 'alemão',
                'it': 'italiano',
                'ja': 'japonês',
                'ko': 'coreano',
                'zh': 'chinês'
            };

            const targetLanguage = langMap[targetLang] || targetLang;

            // Validar se o cliente está inicializado
            if (!zhipuClient) {
                throw new Error('Cliente Zhipu AI não está inicializado. Verifique sua API key em config.json');
            }

            // Usar GLM-4-Flash para tradução
            const response = await zhipuClient.createCompletions({
                model: config.model,
                messages: [
                    {
                        role: "system",
                        content: `Você é um tradutor profissional. Traduza o texto fornecido para ${targetLanguage}. Retorne APENAS a tradução, sem explicações adicionais.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.3
            });

            console.log('Translation API Response:', JSON.stringify(response, null, 2));

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error('Resposta de tradução vazia ou inválida');
            }

            const translation = response.choices[0].message.content.trim();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                original: text,
                translation: translation,
                detectedLang: 'auto'
            }));
        } catch (error) {
            console.error('Translation error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Translation failed', message: error.message }));
        }
    });
}

const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/upload-pdf') {
        handlePdfUpload(req, res);
        return;
    }

    if (req.method === 'POST' && req.url === '/api/translate') {
        handleTranslate(req, res);
        return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
        handleChat(req, res);
        return;
    }

    if (req.method === 'POST' && req.url === '/api/analyze-realtime') {
        handleAnalyzeRealtime(req, res);
        return;
    }

    if (req.method === 'POST' && req.url === '/api/analyze-pdf-context') {
        handleAnalyzePdfContext(req, res);
        return;
    }

    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, 'public', filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, content) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Server Error');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(content);
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Transcript AI server running at http://0.0.0.0:${PORT}`);
});