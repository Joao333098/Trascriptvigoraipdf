# Transcript AI - Transcrição ao Vivo com Chat AI

## Visão Geral
Site de transcrição de áudio ao vivo com chat AI integrado. Design premium "Liquid Glass" inspirado no iOS 26, com cores preto, branco e neon ciano.

## Arquitetura do Projeto

```
/
├── public/
│   ├── index.html      # Estrutura HTML principal
│   ├── style.css       # Estilos glassmorphism e animações
│   └── script.js       # Lógica de transcrição e chat
├── server.js           # Servidor Node.js
└── package.json        # Dependências do projeto
```

## Funcionalidades

### Transcrição ao Vivo
- Usa Web Speech API do navegador
- Suporta Português, Inglês e Espanhol
- Texto aparece com efeito fade-in palavra por palavra
- Palavras clicáveis para tradução usando Google Translate API (quando ativo)

### Chat AI Modal
- Modal elegante para conversar com a IA
- Enter = nova linha (não envia)
- Shift+Enter = envia mensagem
- Indicador de digitação animado
- Histórico salvo no localStorage

### Funções Rápidas
- Analisar: analisa a transcrição atual
- Resumir: cria resumo do conteúdo
- Corrigir: verifica erros gramaticais
- Exportar: baixa como arquivo .txt

### Configurações
- Idiomas de transcrição (múltipla seleção)
- Idioma de tradução
- System Prompt customizável
- Modo Thinking da IA

## Design

### Paleta de Cores
- Fundo: #0a0a0a (preto)
- Glass: rgba(255,255,255,0.03-0.06)
- Neon: #00f0ff (ciano)
- Texto: #ffffff

### Efeitos
- Glassmorphism com backdrop-filter blur(20px)
- Animações suaves com cubic-bezier
- Glow neon nos elementos de destaque
- Orbs flutuantes no background

## Como Executar

```bash
node server.js
```

O servidor roda na porta 5000.

## Próximos Passos (Futuro)
- Integrar Gemma 3 via Hugging Face API
- Adicionar mais traduções ao dicionário
- Implementar correção automática com IA
