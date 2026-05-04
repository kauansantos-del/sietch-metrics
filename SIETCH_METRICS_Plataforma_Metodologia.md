# Sietch Metrics — Performance, Atitude, Cultura e Técnica

> Plataforma interna de avaliação de performance individual para técnicos.  
> Desenvolvida a partir de debate entre liderança e RH — ciclo Abril 2026.

---

## 1. Visão Geral

A **PACT** é uma metodologia estruturada de avaliação de performance criada para mensurar de forma justa e holística o trabalho dos técnicos, indo além da entrega técnica e capturando dimensões comportamentais que impactam diretamente a cultura e a dinâmica de equipe.

### Origem

A metodologia nasceu de uma conversa entre **Luis Borba**, **Leandro Lamanna Zanardi**, **Patrick Faciroli** e **Rodolfo**, onde ficou clara a necessidade de:

- Avaliar não apenas o que o técnico entrega, mas **como** ele atua
- Mensurar atributos abstratos como cultura, dedicação e postura
- Reconhecer comportamentos como parar o que está fazendo para desbloquear um colega
- Criar base para **compensação e reconhecimento** com critérios justos e transparentes

### Premissa Central

> "A gente precisava mensurar cultura, dedicação, postura, etc — além da questão técnica."  
> — Leandro Lamanna Zanardi

---

## 2. Estrutura da Metodologia (PACT)

A avaliação é dividida em **dois blocos principais**, com pesos distintos na composição da nota final.

### 2.1 Blocos de Avaliação

| Bloco | Peso | Descrição |
|---|---|---|
| Técnico | 60% | Qualidade das entregas, produtividade, domínio de ferramentas |
| Comportamental | 40% | Cultura, colaboração, postura, dedicação, iniciativa |

### 2.2 Critérios Técnicos

| Critério | Prioridade | Descrição |
|---|---|---|
| Qualidade técnica das entregas | Alta | Precisão, conformidade e ausência de retrabalho |
| Resolução de problemas | Alta | Capacidade de diagnosticar e agir com autonomia |
| Produtividade | Alta | Volume de entregas no período em relação ao esperado |
| Domínio de ferramentas e sistemas | Média | Proficiência nas plataformas e processos utilizados |
| Documentação e registro | Baixa | Qualidade dos registros, tickets e histórico de atendimentos |

### 2.3 Critérios Comportamentais

| Critério | Prioridade | Descrição |
|---|---|---|
| Colaboração e suporte ao time | Alta | Para o que está fazendo para não deixar o colega travado |
| Cultura e valores | Alta | Alinhamento com os princípios e forma de trabalhar da equipe |
| Dedicação e comprometimento | Alta | Empenho, pontualidade e entrega além do mínimo esperado |
| Postura e comunicação | Média | Clareza, respeito e proatividade nas interações |
| Iniciativa e melhoria contínua | Média | Sugestão de melhorias e aprendizado autônomo |

### 2.4 Sistema de Pontuação

Cada critério é pontuado de **1 a 5**:

| Nota | Classificação |
|---|---|
| 1 | Insatisfatório |
| 2 | Abaixo do esperado |
| 3 | Dentro do esperado |
| 4 | Acima do esperado |
| 5 | Excepcional |

A nota de cada bloco é calculada com **média ponderada** pelos pesos de prioridade:

- Prioridade **Alta** → peso 3
- Prioridade **Média** → peso 2
- Prioridade **Baixa** → peso 1

### 2.5 Nota Final

```
Nota Final = (Nota Técnica × 0.60) + (Nota Comportamental × 0.40)
```

### 2.6 Classificação do Resultado

| Nota Final | Classificação | Cor de referência |
|---|---|---|
| 4.2 – 5.0 | Ótimo | Verde `#1D9E75` |
| 3.2 – 4.1 | Bom | Azul `#185FA5` |
| 2.0 – 3.1 | Regular | Âmbar `#854F0B` |
| 0.0 – 1.9 | Crítico | Vermelho `#A32D2D` |

### 2.7 Recomendações Possíveis

Ao final de cada avaliação, o avaliador seleciona uma das seguintes saídas:

- **Elegível para bônus** — performance acima do esperado
- **Indicado para promoção** — consistência e destaque em ambos os blocos
- **Plano de desenvolvimento (PDP)** — gaps identificados que precisam de acompanhamento
- **Necessita atenção urgente** — performance crítica, requer intervenção imediata

---

## 3. Plataforma — Interface Web

### 3.1 Descrição

A plataforma é uma **aplicação web** de uso interno do RH, acessível por navegador. Permite que líderes e RH realizem avaliações, gerem documentos e acompanhem histórico de avaliações por técnico.

### 3.2 Funcionalidades da Interface

- **Identificação do avaliado** — campo de nome do técnico
- **Avaliação por critério** — estrelas (1–5) com barra visual de progresso e indicador de cor
- **Cálculo automático em tempo real** — notas parciais e final atualizadas conforme preenchimento
- **Cards de resumo** — nota técnica, comportamental, final e quantidade de critérios avaliados
- **Badge de resultado** — classificação visual (Ótimo / Bom / Regular / Crítico) exibida em tempo real
- **Campo de observações** — texto livre para contexto qualitativo
- **Seleção de recomendação** — menu com as 4 opções de saída
- **Alerta de avaliação incompleta** — exibido automaticamente quando bloco comportamental não está preenchido
- **Exportação** — geração de documento Word (.docx) formatado para RH com assinaturas

### 3.3 Fluxo de Uso

```
1. Informar nome do técnico
      ↓
2. Avaliar critérios técnicos (aba "Técnico")
      ↓
3. Avaliar critérios comportamentais (aba "Comportamental")
      ↓
4. Adicionar observações e recomendação (aba "Observações")
      ↓
5. Clicar em "Gerar resumo" → exportar documento .docx
      ↓
6. Assinar e arquivar no RH
```

---

## 4. Stack Técnica

### 4.1 Front-end

| Tecnologia | Função |
|---|---|
| **HTML5** | Estrutura da interface |
| **CSS3 com variáveis CSS** | Estilização com suporte a tema claro/escuro automático |
| **JavaScript (Vanilla ES6+)** | Lógica de cálculo, interatividade e geração de resumo |
| **Claude Artifacts (iframe sandbox)** | Ambiente de execução e renderização da interface |

**Padrões de design aplicados:**
- Design system baseado em tokens CSS (`--color-text-primary`, `--color-background-secondary`, etc.)
- Componentes reutilizáveis: cards de métrica, tabelas de critérios, badges de resultado
- Layout responsivo com `grid` e `auto-fit`
- Dark mode automático via variáveis CSS nativas do host
- Acessibilidade: `sr-only` headings para leitores de tela

**Componentes de UI:**
- `<input type="range">` para sliders (futuras versões)
- Botões com estrelas (1–5) para pontuação por critério
- Barras de progresso dinâmicas por critério, coloridas por nota
- Badge de resultado com cor semântica por faixa de pontuação
- `<select>` para seleção de recomendação
- `<textarea>` para observações livres

### 4.2 Back-end / Geração de Documentos

| Tecnologia | Função |
|---|---|
| **Node.js** | Runtime de execução para geração de documentos |
| **docx (npm `docx@9.6.1`)** | Criação de arquivos `.docx` com formatação profissional |
| **`Packer.toBuffer()`** | Serialização do documento para buffer binário |
| **Sistema de arquivos** | Escrita do `.docx` final no diretório de saída |

**Estrutura do documento `.docx` gerado:**

```
Avaliacao_[Nome_Tecnico].docx
├── Header (confidencial + linha divisória azul)
├── Título e identificação do avaliado
├── Cards de resumo (Nota Técnica | Comportamental | Final)
├── Alerta de avaliação incompleta (se aplicável)
├── Tabela de competências técnicas (com barra de pontuação textual)
├── Tabela de competências comportamentais
├── Observações
├── Recomendação
├── Bloco de assinaturas (Avaliador | RH | Data)
└── Footer (confidencial + data de geração)
```

**Funcionalidades do documento:**
- Cabeçalho e rodapé automáticos
- Tabelas com bordas coloridas e sombreamento por seção
- Alerta visual com borda lateral laranja para campos incompletos
- Barra de pontuação visual em caracteres (`█░`) por critério
- Classificação de resultado com cor correspondente
- Bloco de assinaturas com linhas para rubrica física

### 4.3 IA — Anthropic Claude

| Componente | Papel |
|---|---|
| **Claude Sonnet 4.6** | Modelo de linguagem principal da plataforma |
| **Claude Artifacts** | Ambiente de execução da interface interativa |
| **`sendPrompt(text)`** | Função nativa que envia o resumo da avaliação para o chat |
| **API Anthropic `/v1/messages`** | Disponível para extensões futuras (ex: análise automática de padrões) |

**Fluxo de exportação via IA:**

```
Interface (Artifact)
      ↓  sendPrompt(resumo estruturado)
Chat Claude
      ↓  interpreta dados e gera script Node.js
Node.js (bash_tool)
      ↓  executa docx-js
Arquivo .docx
      ↓  present_files()
Download para o usuário
```

---

## 5. Arquitetura Geral

```
┌─────────────────────────────────────────────────────┐
│                   USUÁRIO (RH / Líder)               │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│            INTERFACE WEB — Claude Artifact           │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │   Técnico    │  │Comportamental│  │Observações│  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                      │
│  Cálculo em tempo real (JS)                          │
│  Cards de resumo + Badge de resultado                │
│  sendPrompt() → exportar para chat                  │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              CLAUDE (Modelo de IA)                   │
│                                                      │
│  Recebe resumo estruturado da avaliação              │
│  Gera script Node.js com docx-js                     │
│  Executa via bash_tool                               │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│           DOCUMENTO FINAL (.docx)                    │
│                                                      │
│  Formatado profissionalmente para RH                 │
│  Com assinaturas, alertas e recomendação             │
│  Disponível para download imediato                   │
└─────────────────────────────────────────────────────┘
```

---

## 6. Segurança e Boas Práticas

- Todos os dados de avaliação são **tratados em memória** — nenhuma informação é persistida sem ação explícita do usuário
- O documento gerado é **confidencial** — cabeçalho e rodapé já indicam uso interno de RH
- A avaliação incompleta **bloqueia a recomendação** e exibe alerta visível
- O cálculo de nota final só considera blocos com dados preenchidos, evitando distorções silenciosas

---

## 7. Roadmap — Próximas Versões

| Prioridade | Funcionalidade |
|---|---|
| Alta | Histórico de avaliações por técnico (banco de dados) |
| Alta | Painel comparativo entre técnicos do mesmo time |
| Média | Calibração entre avaliadores (evitar viés) |
| Média | Autoavaliação pelo próprio técnico |
| Média | Integração com sistema de folha para cálculo de bônus |
| Baixa | Dashboard gerencial com médias por critério e time |
| Baixa | Exportação em PDF além do .docx |
| Baixa | Notificações automáticas de ciclo de avaliação |

---

## 8. Glossário

| Termo | Definição |
|---|---|
| **PACT** | Performance, Atitude, Cultura e Técnica — nome da metodologia |
| **Bloco técnico** | Conjunto de critérios que avaliam a entrega e competência técnica |
| **Bloco comportamental** | Conjunto de critérios que avaliam cultura, postura e colaboração |
| **Nota ponderada** | Média calculada com pesos diferentes por prioridade do critério |
| **PDP** | Plano de Desenvolvimento — documento de acompanhamento para técnicos com gaps identificados |
| **Ciclo de avaliação** | Período definido pelo RH para realização das avaliações (ex: trimestral) |
| **Badge de resultado** | Indicador visual (Ótimo / Bom / Regular / Crítico) exibido na interface e no documento |

---

*Documentação gerada em 22/04/2026 — PACT v1.0 — Uso interno RH*
