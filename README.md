# Sietch Metrics — Performance, Atitude, Cultura e Técnica

> Plataforma interna de avaliação de performance para técnicos de TI.

**Produção:** [sietch-metrics.vercel.app](https://sietch-metrics.vercel.app)  
**Repositório:** [github.com/kauansantos-del/sietch-metrics](https://github.com/kauansantos-del/sietch-metrics)  
**Contato:** kauancarvalhomk@gmail.com

---

## Quick Start — novo dev

```bash
# 1. Clonar
git clone https://github.com/kauansantos-del/sietch-metrics.git
cd sietch-metrics

# 2. Frontend — abrir index.html no navegador (não precisa de build)
#    Recomendado: usar Live Server (VS Code) ou http-server na porta 5500

# 3. Backend
cd backend
npm install
cp .env.example .env        # Preencher DATABASE_URL, DIRECT_URL e JWT_SECRET
npx prisma db push          # Sincroniza schema com o banco
npm run db:seed             # Popula dados iniciais (só banco vazio)
npm run dev                 # API sobe em http://localhost:3000
```

> Detalhes completos do backend em [backend/README.md](backend/README.md)

---

## Sumário

1. [O que é o Sietch Metrics](#1-o-que-é-o-sietch-metrics)
2. [Metodologia](#2-metodologia)
3. [Funcionalidades implementadas](#3-funcionalidades-implementadas)
4. [Stack técnica](#4-stack-técnica)
5. [Estrutura de arquivos](#5-estrutura-de-arquivos)
6. [Design System](#6-design-system)
7. [Implementação — destaques técnicos](#7-implementação--destaques-técnicos)
8. [Deploy](#8-deploy)
9. [Roadmap](#9-roadmap)

---

## 1. O que é o Sietch Metrics

A metodologia **Metrics** (Performance, Atitude, Cultura e Técnica) é uma abordagem estruturada de avaliação de performance criada para mensurar de forma justa e holística o trabalho dos técnicos de TI, indo além da entrega técnica e capturando dimensões comportamentais que impactam diretamente a cultura e a dinâmica de equipe.

A metodologia nasceu de uma conversa entre **Luis Borba**, **Leandro Lamanna Zanardi**, **Patrick Faciroli** e **Rodolfo**, com a premissa de:

- Avaliar não apenas o que o técnico entrega, mas **como** ele atua
- Mensurar atributos abstratos como cultura, dedicação e postura
- Reconhecer comportamentos como parar o que está fazendo para desbloquear um colega
- Criar base para **compensação e reconhecimento** com critérios justos e transparentes

A plataforma é uma aplicação web acessível por navegador, usada pelo RH e líderes para conduzir avaliações, gerar documentos e acompanhar o histórico por técnico.

---

## 2. Metodologia

### 2.1 Estrutura — dois blocos com pesos distintos

| Bloco | Peso | Descrição |
|---|---|---|
| **Técnico** | 60% | Qualidade das entregas, produtividade, domínio de ferramentas |
| **Comportamental** | 40% | Cultura, colaboração, postura, dedicação, iniciativa |

### 2.2 Critérios técnicos (5)

| Critério | Prioridade | Peso |
|---|---|---|
| Qualidade técnica das entregas | Alta | 3 |
| Resolução de problemas | Alta | 3 |
| Produtividade | Alta | 3 |
| Domínio de ferramentas e sistemas | Média | 2 |
| Documentação e registro | Baixa | 1 |

### 2.3 Critérios comportamentais (5)

| Critério | Prioridade | Peso |
|---|---|---|
| Colaboração e suporte ao time | Alta | 3 |
| Cultura e valores | Alta | 3 |
| Dedicação e comprometimento | Alta | 3 |
| Postura e comunicação | Média | 2 |
| Iniciativa e melhoria contínua | Média | 2 |

### 2.4 Sistema de pontuação

Cada critério recebe nota de **1 a 5**:

| Nota | Classificação |
|---|---|
| 1 | Insatisfatório |
| 2 | Abaixo do esperado |
| 3 | Dentro do esperado |
| 4 | Acima do esperado |
| 5 | Excepcional |

A nota de cada bloco é a **média ponderada** pelos pesos de prioridade (Alta = 3, Média = 2, Baixa = 1).

### 2.5 Nota final e classificação

```
Nota Final = (Nota Técnica × 0.60) + (Nota Comportamental × 0.40)
```

| Faixa | Classificação | Cor |
|---|---|---|
| 4.2 – 5.0 | Ótimo | Verde `#1D9E75` |
| 3.2 – 4.1 | Bom | Azul `#185FA5` |
| 2.0 – 3.1 | Regular | Âmbar `#854F0B` |
| 0.0 – 1.9 | Crítico | Vermelho `#A32D2D` |

### 2.6 Recomendações possíveis

Ao final, o avaliador escolhe uma das saídas:

- **Elegível para bônus** — performance acima do esperado
- **Indicado para promoção** — consistência e destaque em ambos os blocos
- **Plano de desenvolvimento (PDP)** — gaps que precisam de acompanhamento
- **Necessita atenção urgente** — performance crítica, intervenção imediata

---

## 3. Funcionalidades implementadas

### 3.1 Navegação e estrutura

- **Sidebar fixa** com logo Sietch Metrics, navegação principal (Nova Avaliação / Histórico) e ações secundárias (toggle de tema, versão da ciclo)
- **Sistema de views** com 3 telas: avaliação, histórico e resultados
- **Toggle dark/light** com swap animado de logo (`logo-light.svg` ↔ `logo-dark.svg`) e troca suave de tokens
- **Persistência de tema** via `localStorage` (`sietch_theme`)

### 3.2 Formulário de avaliação

- **Cabeçalho** — nome do técnico (campo obrigatório)
- **Cards de resumo em tempo real** — Nota Técnica, Comportamental e Final, atualizadas a cada clique
- **Alerta visual** quando o bloco comportamental está incompleto
- **Tabs** dividindo o questionário em 3 etapas: Técnico, Comportamental, Observações
- **Botões de próxima etapa** no rodapé de cada aba (Técnico → Comportamental → Observações)
- **Cards de critério** com nome, descrição, badge de prioridade e linha de 5 botões de pontuação
- **Botões de pontuação (1–5)** com texto branco em todos os estados, cores escurecidas para garantir contraste WCAG AA mínimo 5.8:1
- **Barra de progresso inline** colorida pela classificação (verde/azul/âmbar/laranja/vermelho)
- **Label semântico** ao lado do botão ativo ("Excepcional", "Acima do esperado" etc.)
- **Animação `btnPop`** ao selecionar uma nota — cubic-bezier com escala 1.22

### 3.3 Tela de resultados

Exibida automaticamente após salvar uma avaliação completa. Não é uma tela genérica de sucesso — é o resultado final formatado.

- **Hero gradient** colorido conforme a classificação:
  - Ótimo: gradiente verde profundo (`#064734` → `#1D9E75`)
  - Bom: gradiente azul profundo (`#0a2a52` → `#185FA5`)
  - Regular: gradiente âmbar profundo (`#3a1e03` → `#854F0B`)
  - Crítico: gradiente vermelho profundo (`#4a0a0a` → `#A32D2D`)
- **Watermark da nota final** em 160px com 7% de opacidade no canto direito do hero
- **Padrão de pontos SVG** sobreposto ao gradiente para textura
- **Classificação em destaque** (64px, peso 800)
- **Nome do técnico, data e recomendação** dentro do hero
- **3 score cards** (Técnico, Comportamental, Final) com gradiente decorativo no topo
- **Breakdown completo** dos critérios com barras de progresso individuais
- **Bloco de observações** quando preenchido
- **Ações** — Ver histórico / Nova avaliação

### 3.4 Histórico

- **Cards clicáveis** com `cursor: pointer` e borda lateral colorida pela classificação
- **Ao clicar** — abre modal com breakdown completo da avaliação
- **Botão de delete individual** com `event.stopPropagation()` para não acionar o modal
- **Botão "Limpar tudo"** com confirmação
- **Badge de contagem** no item do sidebar (atualiza em tempo real)
- **Empty state** com SVG e mensagem quando não há avaliações
- **Persistência** via `localStorage` (`sietch_history` — array de evaluations)

### 3.5 Modal de detalhes

Acionado pelo histórico, mostra:

- Identificação (nome, data)
- Notas (Técnica, Comportamental, Final + classificação)
- Breakdown de cada critério com barra de progresso
- Observações
- Recomendação

### 3.6 Exportação

- **Botão "Exportar resumo"** gera texto formatado com tabela de critérios, barras visuais (`█░`), notas, observações e recomendação
- **Copiar para clipboard** via `navigator.clipboard.writeText`
- **Baixar como `.txt`** via `Blob` + `URL.createObjectURL`

### 3.7 Feedback visual

- **Toast** flutuante para confirmações (salvar, copiar, etc.) — variante success (verde) e error (vermelho)
- **Animações de entrada** — sidebar slide-in, content fade-up, stagger nos stat cards (40ms / 100ms / 160ms / ...)
- **`prefers-reduced-motion`** respeitado — todas as animações são reduzidas para 0.01ms quando o usuário preferir

---

## 4. Stack técnica

| Camada | Tecnologia |
|---|---|
| Front-end | HTML5 + CSS3 (variáveis nativas) + Vanilla JavaScript ES6+ |
| Persistência | `localStorage` (`sietch_history`, `sietch_theme`) |
| Tipografia | Inter (Google Fonts) — pesos 300/400/500/600/700 |
| Hospedagem | Vercel (deploy estático) |
| Versionamento | Git + GitHub |

**Sem build step.** Sem framework. Sem npm install. O `index.html` é a aplicação completa.

---

## 5. Estrutura de arquivos

```
sietch-metrics/
├── index.html                         # Aplicação (HTML + CSS inline + JS inline)
├── design-system.css                  # Sietch Design System (tokens, componentes base)
├── logo-light.svg                     # Logo branco (para fundos escuros)
├── logo-dark.svg                      # Logo preto (para fundos claros)
├── SIETCH_METRICS_Plataforma_Metodologia.md     # Documentação da metodologia
├── README.md                          # Este arquivo
└── .gitignore                         # .vercel, .claude/, node_modules/, *.log
```

---

## 6. Design System

### 6.1 Sietch Design System (`design-system.css`)

Arquivo independente que define a base visual usada também em outros projetos internos:

- **Paleta:** Radix Gray Scale (12 steps light + 12 steps dark)
- **Tipografia:** Inter, escala alinhada ao Material Design 3 (Display / Headline / Title / Body / Label)
- **Espaçamento:** grid 4px (`spacing-0-5` até `spacing-24`)
- **Elevação:** 6 níveis (`elevation-0` a `elevation-5`)
- **Border radius:** `xs / sm / md / lg / xl / full`
- **Transições:** durações + cubic-beziers padronizados

Componentes inclusos: card, stat-card, button, input, select, textarea, table, badge, avatar, sidebar, topbar, tabs, dropdown.

### 6.2 Overrides no `index.html`

A página estende o design system com:

- **Type scale ajustado** — body/label/title aumentados para legibilidade mínima de 14px (acessibilidade)
- **Componentes específicos do Sietch Metrics** — `criterion-card`, `score-btn`, `step-footer`, `results-hero`, `results-score-card`, `history-card`, `priority-alta/media/baixa`
- **Animações** — `sidebarIn`, `contentIn`, `staggerUp`, `viewFade`, `tab-panel`, `btnPop`, `valuePulse`, `badgeFlip`

---

## 7. Implementação — destaques técnicos

### 7.1 Dark mode premium (blue-charcoal)

A paleta default do Radix em dark é cinza neutro flat. Para um app premium, isso fica plano e sem hierarquia. Foi feito um override completo do `[data-theme="dark"]` com escala blue-charcoal (subtom azul sutil), inspirado em Linear / Vercel:

```css
[data-theme="dark"] {
  --gray-1:  #0c0e13;   /* app background */
  --gray-2:  #111419;   /* subtle surfaces / sidebar */
  --gray-3:  #181c24;   /* card surfaces */
  --gray-4:  #1f2330;   /* hovered / modal */
  --gray-12: #e3e7f2;   /* high-contrast text */
  /* ... */
}
```

**Hierarquia de superfícies criada do zero:**

- App background, subtle, card e modal agora são tons distintos
- Cards usam `rgba(255,255,255,0.025)` por cima do background para criar lift visual sem precisar de cor sólida
- Bordas com `rgba(100,115,180,...)` — ligeiro azul que aparece sutilmente nas bordas

**Componentes adaptados especificamente para dark mode:**

| Componente | Antes | Depois |
|---|---|---|
| Sidebar ativa | Pílula branca pura (chocante no dark) | Overlay translúcido + acento verde Sietch no indicador |
| Botão primário (`.btn-filled`) | Preto puro (invisível no fundo escuro) | `gray-12` (quase branco) com texto escuro |
| Stat icon | `gray-3` flat | Glass tile — `rgba(255,255,255,0.06)` + borda azulada |
| Badges classificação | Cores light com baixo contraste | Variantes dark com fundo semi-transparente e cor saturada |
| Inputs / textareas | Borda cinza neutro | Borda azulada + focus ring `rgba(107,138,255,0.18)` |
| Modal | Mesmo nível das cards | Surface elevada (`#1f2330`) + box-shadow forte |
| Toast | `gray-12` (texto claro) — invertia no dark | `#2a2f42` com borda azulada |

### 7.2 Score buttons — contraste WCAG AA

O primeiro design dos botões de pontuação ativos usava as cores brand puras (`#1D9E75`, `#185FA5`, etc.) com texto branco. Mas o verde tinha apenas **3:1** de contraste com branco — abaixo do mínimo WCAG AA de 4.5:1.

**Correção aplicada:** todos os backgrounds ativos foram escurecidos:

| Nota | Antes | Depois | Contraste com branco |
|------|-------|--------|---------------------|
| 5 (Excepcional) | `#1D9E75` | `#117a57` | **5.8:1** ✓ |
| 4 (Acima) | `#185FA5` | `#0f4d90` | **8.4:1** ✓ |
| 3 (Dentro) | `#854F0B` | `#6b3d06` | **9.2:1** ✓ |
| 2 (Abaixo) | `#C25B00` | `#a04500` | **6.1:1** ✓ |
| 1 (Insatisfatório) | `#A32D2D` | `#871e1e` | **9.4:1** ✓ |

**Texto branco em todos os estados** — inativo (cinza médio `--gray-9`), hover, e ativo (cores escuras acima). Consistência total na linha dos 5 botões.

### 7.3 Tela de resultados

Originalmente a app fazia reset do formulário ao salvar. A nova arquitetura introduziu uma terceira view (`view-results`) que é exibida automaticamente após `saveEvaluation()`:

```javascript
function saveEvaluation() {
  // ... validação e salvamento ...
  localStorage.setItem('sietch_history', JSON.stringify(history));
  updateHistoryBadge();
  showResults(evaluation);  // antes era resetForm()
}
```

A função `showResults(ev)` constrói dinamicamente o HTML do hero, score cards e breakdown de critérios usando o gradiente correspondente à classificação.

A função `startNewEvaluation()` (silent reset, sem confirm dialog) foi extraída de `resetForm()` para que o botão "Nova avaliação" no rodapé da tela de resultados não abra um confirm.

### 7.4 Cards de critério com botões de próxima etapa

A função `renderCriteriaBlock()` foi estendida com um parâmetro `nextTab`:

```javascript
function renderCriteriaBlock(block, containerId, nextTab) {
  const nextBtnHtml = nextTab ? `
    <div class="step-footer">
      <button class="btn-next-step" onclick="switchTab('${nextTab}')">
        Próxima etapa: ${nextTab === 'comportamental' ? 'Comportamental' : 'Observações'}
        <svg>...</svg>
      </button>
    </div>` : '';
  // ...
  container.innerHTML = CRITERIA[block].map(c => `...`).join('') + nextBtnHtml;
}
```

Isso evita imperativamente injetar o botão depois — o HTML é gerado todo de uma vez.

### 7.5 Histórico clicável com `event.stopPropagation`

O card inteiro do histórico abre o modal de detalhes, mas o botão de delete ficou dentro:

```html
<div class="card history-card" onclick="viewDetail('${ev.id}')">
  <!-- ... conteúdo ... -->
  <button onclick="event.stopPropagation(); deleteEvaluation('${ev.id}')">
    Excluir
  </button>
</div>
```

`stopPropagation()` impede que o clique no delete propague para o card.

### 7.6 Logo crossfade no toggle de tema

Em vez de trocar a `src` instantaneamente (causa flash), o logo faz um fade-out → swap → fade-in:

```javascript
function applyTheme(theme, animate = false) {
  const nextSrc = theme === 'dark' ? 'logo-light.svg' : 'logo-dark.svg';
  if (animate && logoImg.getAttribute('src') !== nextSrc) {
    logoImg.classList.add('logo-swapping');
    setTimeout(() => {
      logoImg.src = nextSrc;
      requestAnimationFrame(() => logoImg.classList.remove('logo-swapping'));
    }, 180);
  }
}
```

CSS:
```css
.sidebar__logo img {
  transition: opacity 280ms ease, transform 420ms cubic-bezier(.2,.7,.2,1);
}
.sidebar__logo img.logo-swapping { opacity: 0; transform: scale(.96); }
```

### 7.7 Animações de entrada com stagger

Os stat cards do topo aparecem em cascata via CSS puro:

```css
.stagger > * {
  opacity: 0;
  animation: staggerUp 520ms cubic-bezier(.2,.7,.2,1) forwards;
}
.stagger > *:nth-child(1) { animation-delay:  40ms; }
.stagger > *:nth-child(2) { animation-delay: 100ms; }
.stagger > *:nth-child(3) { animation-delay: 160ms; }
/* ... */
```

Sem JS, sem libs, performático.

---

## 8. Deploy

**Produção:** [sietch-metrics.vercel.app](https://sietch-metrics.vercel.app)

Configuração Vercel:
- **Framework preset:** None (deploy estático)
- **Build command:** —
- **Output directory:** `.` (root)
- **Install command:** —

Toda mudança no `master` do GitHub pode ser publicada com:

```bash
git push
vercel --prod --scope kauansantos-dels-projects
```

---

## 9. Roadmap

| Prioridade | Feature |
|---|---|
| Alta | Banco de dados real (substituir `localStorage`) |
| Alta | Painel comparativo entre técnicos do mesmo time |
| Alta | Autenticação (líderes vs RH) |
| Média | Calibração entre avaliadores (reduzir viés) |
| Média | Autoavaliação pelo próprio técnico |
| Média | Integração com folha para cálculo automático de bônus |
| Baixa | Dashboard gerencial — médias por critério, evolução por ciclo |
| Baixa | Exportação `.docx` / `.pdf` além do `.txt` |
| Baixa | Notificações de início e fim de ciclo |

---

*Sietch Metrics v1.0 (metodologia Metrics) — Ciclo Abril 2026 — Uso interno RH*
