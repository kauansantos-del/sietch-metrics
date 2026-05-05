# Módulo de Treinamentos — Prompt para Antigravity

> Prompt pronto para colar no Antigravity, descrevendo a nova aba de **Treinamentos** que será integrada ao sistema de avaliação de colaboradores existente. Pensado a partir de boas práticas de UX (NN/g, Baymard) e adaptado ao contexto Sietch (CaaS / fintech, com obrigações de Compliance e Cyber — DOC-005 Política de Treinamentos Obrigatórios, A-01, B-10 etc.).

---

## Contexto que o Antigravity precisa entender antes de gerar código

Estamos estendendo um sistema interno de avaliação de colaboradores já existente. Hoje o sistema tem o formulário de avaliação. Vamos adicionar uma **nova aba chamada "Treinamentos"** no menu principal, no mesmo nível hierárquico da aba de avaliação atual.

O objetivo do módulo é permitir que **lideranças apliquem, acompanhem e validem treinamentos dos colaboradores** em trilhas como Cyber Security, Pentest, Desenvolvimento (Backend, Frontend, Mobile), UX/Design, Compliance (PLD/FT, LGPD, Código de Ética), Antifraude e Soft Skills.

A empresa é uma fintech (CaaS) com obrigações regulatórias reais — o módulo precisa servir tanto para **desenvolvimento de carreira** quanto para **evidência de treinamento obrigatório auditável** (lista de presença, aceite, certificado, log).

**Não é um LMS completo tipo Alura/Udemy.** É uma camada de gestão e atribuição. O conteúdo em si pode ser link externo, vídeo embedado, PDF, ou trilha interna — o foco é atribuir, acompanhar, certificar e gerar evidência.

---

## Princípios de UX que devem guiar toda a implementação

Antes de qualquer tela, internalizar:

1. **Hierarquia de visão por papel.** Líder, RH/People e colaborador veem coisas diferentes na mesma aba. Evite uma única tela genérica que tenta servir todos — isso polui e confunde.
2. **Reduzir fricção de atribuição.** Atribuir um treinamento a 1 colaborador ou a 50 deve ser igualmente fácil. Atribuição em massa é caso de uso primário, não secundário.
3. **Progresso sempre visível.** Toda tela que mostra um treinamento atribuído deve mostrar status e progresso sem o usuário precisar clicar. Status invisível gera retrabalho de cobrança.
4. **Linguagem direta, sem jargão de LMS.** "Aplicar treinamento", "Concluir", "Pendente", "Atrasado" — não usar "enrollment", "module", "learning path" cru em inglês.
5. **Empty states que ensinam.** Quando o colaborador não tem nada atribuído, a tela explica o que vai aparecer ali quando tiver. Quando o líder ainda não atribuiu nada, a tela mostra o caminho de atribuir o primeiro.
6. **Ações destrutivas com confirmação clara.** Cancelar/remover atribuição, arquivar treinamento, redefinir prazo — sempre com modal de confirmação dizendo o impacto (quantos colaboradores afetados, se gera notificação, se zera progresso).
7. **Respeitar a aba de avaliação existente.** O módulo de Treinamentos deve compartilhar header, navegação principal, tipografia, paleta, espaçamentos e componentes (botões, inputs, modais) com o que já existe. Nada de design system paralelo.
8. **Mobile-friendly para o colaborador.** O líder usa muito desktop, mas o colaborador frequentemente vai assistir/concluir treinamento no celular. As telas de "meus treinamentos" e "ver treinamento" precisam responder bem em viewport estreito.

---

## Estrutura geral da aba Treinamentos

A aba Treinamentos tem **três visões principais**, alternáveis por papel do usuário logado (não por toggle manual — o sistema já sabe quem é quem):

### Visão 1 — Colaborador ("Meus Treinamentos")
O que o colaborador comum vê quando entra na aba.

### Visão 2 — Líder ("Gestão de Treinamentos da equipe")
O que líderes diretos veem. Tem permissão para atribuir, acompanhar e validar conclusão dos seus liderados diretos.

### Visão 3 — RH/People/Compliance ("Administração de Treinamentos")
Visão completa: catálogo, criação de treinamentos, atribuição em massa cross-equipe, relatórios, evidências para auditoria.

Essas visões podem coexistir — um líder de squad também é colaborador, então ele tem as duas visões e alterna por sub-aba interna ("Meus" / "Da minha equipe"). Já o RH tem as três.

---

## Visão 1 — Colaborador ("Meus Treinamentos")

### O que deve ter

**Header da página com 3 cards de resumo no topo:**
- Em andamento (número + label "treinamentos em curso")
- Pendentes (número + label "aguardando você começar")
- Concluídos (número + label "no total")

Cards clicáveis que filtram a lista abaixo. Cor sutil — não usar vermelho gritante em "Pendentes" a não ser que tenha item atrasado.

**Lista de treinamentos atribuídos**, com cada card mostrando:
- Título do treinamento
- Trilha/categoria com badge colorido (ex: "Cyber Security", "UX", "Compliance")
- Quem atribuiu (nome + foto pequena)
- Prazo final ("Até 30/05" ou "Atrasado há 3 dias" em vermelho)
- Barra de progresso visual (% concluído)
- Tempo estimado total e tempo restante
- Botão primário "Continuar" / "Iniciar" / "Ver certificado"
- Status badge: Não iniciado, Em andamento, Concluído, Atrasado, Aguardando validação do líder

**Filtros e ordenação:**
- Filtro por trilha
- Filtro por status
- Ordenação: Prazo (padrão), Mais recentes, Alfabética

**Busca:** input no topo, busca por título do treinamento.

**Ao clicar em um treinamento → tela de detalhe** com:
- Descrição completa, objetivos de aprendizagem, pré-requisitos, carga horária
- Lista de módulos/aulas (se houver subdivisão) com check de conclusão
- Player/visualizador de conteúdo embedado (vídeo, PDF, link externo, quiz)
- Espaço para anotações pessoais (textarea com auto-save)
- Botão "Marcar como concluído" — só ativa quando 100% do conteúdo foi visto OU quando o líder permitiu auto-conclusão
- Após concluir: tela de feedback rápido (NPS de 1-5 + comentário opcional) antes de gerar certificado
- Download de certificado em PDF após conclusão validada

**Histórico:** sub-aba "Concluídos" com tudo que o colaborador já fez, com data de conclusão, nota (se houver quiz), certificado para download e possibilidade de re-acessar o conteúdo.

### O que NÃO deve ter

- **Não mostrar treinamentos do catálogo geral que não foram atribuídos a ele** — isso polui. Se quiser permitir auto-inscrição, criar uma sub-aba "Catálogo / Auto-desenvolvimento" claramente separada.
- **Não mostrar quem mais da empresa está fazendo o mesmo treinamento.** Privacidade e foco.
- **Não usar gamificação agressiva** (badges piscando, "você está atrás de 5 colegas!"). Gamificação sutil e opcional, sim — ranking público de quem fez mais treinamento, não.
- **Não bloquear navegação durante o conteúdo** — colaborador deve poder pausar e voltar depois sem perder progresso.
- **Não exigir conclusão linear forçada** se o conteúdo permite consumo livre. Se for sequencial obrigatório (ex: trilha Cyber básica antes da avançada), explicitar isso visualmente com cadeados.

---

## Visão 2 — Líder ("Da minha equipe")

### O que deve ter

**Header com KPIs da equipe:**
- Total de colaboradores diretos
- % com treinamentos obrigatórios em dia
- % com treinamentos atrasados
- Treinamentos aguardando validação do líder (com badge numérico de notificação)

**Tabela principal — lista da equipe**, uma linha por colaborador, com colunas:
- Nome + foto + cargo
- Treinamentos em andamento (número)
- Atrasados (número, vermelho se > 0)
- Concluídos no período
- Próximo prazo (data mais próxima de vencer)
- Última conclusão (data)
- Botão "Ver detalhes" → abre painel lateral ou modal com a trilha completa daquele colaborador

**Ação primária — botão grande no topo: "Atribuir treinamento"**

Fluxo de atribuição (modal/wizard de 3 passos):

**Passo 1 — Quem vai receber:**
- Seletor de colaboradores com busca, multi-seleção, opção "selecionar toda a equipe", filtros por cargo/squad
- Mostrar contador "X colaboradores selecionados" sempre visível
- Opção de salvar essa seleção como "grupo recorrente" para reuso

**Passo 2 — Qual treinamento:**
- Catálogo navegável com busca e filtros por trilha
- Cards de treinamento com título, descrição curta, carga horária, trilha
- Possibilidade de selecionar mais de um (atribuição em lote)
- Botão "Criar treinamento novo" caso não exista no catálogo (leva ao fluxo de criação descrito na Visão 3)

**Passo 3 — Quando e como:**
- Prazo de conclusão (date picker, com sugestões "Em 7 dias", "Em 30 dias", "Sem prazo")
- Obrigatório? (toggle — obrigatório gera mais notificações e aparece destacado no painel do colaborador)
- Mensagem personalizada do líder (textarea opcional) — aparece para o colaborador como contexto
- Notificar por e-mail/Slack/Teams agora? (checkboxes)
- Preview final antes de confirmar: "Você vai atribuir [Treinamento X] a [Y colaboradores] com prazo até [data]. Eles serão notificados [como]."

**Validação de conclusão:**
Quando o treinamento exige validação do líder (ex: "fez na prática", "apresentou demo"), o líder vê uma fila "Aguardando validação" com:
- Card por solicitação
- Quem concluiu, quando, qual treinamento
- Anexos enviados pelo colaborador (se houver)
- Botões: "Validar conclusão" / "Pedir refazer" (com motivo obrigatório) / "Conversar primeiro" (abre Slack/Teams se integrado)

**Visão consolidada da equipe:**
- Heatmap ou matriz: colaboradores nas linhas × trilhas nas colunas, célula colorida por status (verde concluído, amarelo em curso, cinza não atribuído, vermelho atrasado). Útil pra o líder enxergar gaps.

### O que NÃO deve ter

- **Não permitir que o líder veja conteúdo íntimo do colaborador** (anotações pessoais que o colaborador faz dentro do treinamento, por exemplo).
- **Não permitir que o líder altere progresso manualmente** sem deixar log auditável de quem alterou e por quê. Em treinamento obrigatório regulatório, isso pode virar problema de auditoria.
- **Não usar nomenclatura "subordinado".** Usar "liderado direto" ou "membro da equipe".
- **Não enviar notificação automática agressiva** sem o líder controlar. Notificação só sai se ele marcar no fluxo de atribuição ou se o RH configurou política de lembretes.
- **Não esconder treinamentos atrasados em sub-menus.** Atrasado é a informação mais crítica para o líder — sempre visível no header e na tabela.

---

## Visão 3 — RH/People/Compliance ("Administração")

### O que deve ter

**Sub-abas internas:**
1. Catálogo de treinamentos
2. Atribuições ativas
3. Relatórios e evidências
4. Configurações

#### 3.1 Catálogo de treinamentos

Lista de todos os treinamentos cadastrados, com:
- Título, trilha, autor/criador, status (Ativo/Arquivado/Rascunho), nº de pessoas que fizeram, avaliação média
- Botão "Criar novo treinamento"
- Filtros e busca

**Fluxo de criar/editar treinamento:**

Tela de criação dividida em seções (acordeão ou abas, não scroll infinito):

**Seção A — Informações básicas:**
- Título
- Trilha/categoria (multi-select com opção de criar nova)
- Descrição curta (até 200 caracteres, aparece nos cards)
- Descrição completa (rich text editor)
- Imagem/thumb de capa (upload)
- Carga horária estimada
- Pré-requisitos (referenciar outros treinamentos)
- Tags livres

**Seção B — Conteúdo:**
- Construtor de módulos: cada módulo pode ser vídeo (URL ou upload), PDF (upload), link externo, texto rico, quiz, ou tarefa prática (com upload de evidência pelo colaborador)
- Reordenar módulos por drag and drop
- Marcar quais módulos são obrigatórios para conclusão
- Quiz builder simples: pergunta, alternativas, resposta correta, feedback, nota mínima de aprovação

**Seção C — Regras de conclusão:**
- Auto-concluir ao terminar conteúdo? OU exigir validação do líder?
- Nota mínima no quiz para aprovação
- Permite refazer? Quantas vezes?
- Gera certificado? Modelo de certificado (escolher template)
- Validade do certificado (ex: 12 meses — depois disso, marca como "vencido" e exige refazer — fundamental para Compliance/Cyber)

**Seção D — Público e obrigatoriedade:**
- Disponível no catálogo aberto? OU só por atribuição direta?
- Marcar como "Obrigatório por política" — vincular a uma política (ex: DOC-005 Política de Treinamentos Obrigatórios, Código de Ética, PLD/FT, LGPD)
- Audiência sugerida (cargos/squads/áreas — só sugestão, atribuição efetiva ainda é manual ou por regra)
- Recorrência: única, anual, semestral (importante pra Code of Conduct anual, PLD/FT etc.)

**Seção E — Notificações:**
- Quando avisar quem atribuiu? (no início, X dias antes do prazo, no atraso)
- Canais (e-mail, Slack, Teams, in-app)
- Mensagens customizáveis

#### 3.2 Atribuições ativas

Tabela cross-empresa de todas as atribuições em curso, com filtros por trilha, líder, status, prazo. Ações em massa: estender prazo, cancelar atribuição, reenviar notificação.

#### 3.3 Relatórios e evidências

Esta aba é **crítica para auditoria Stark/Compliance** (vide A-01, B-10 do contexto Sietch):

- **Relatório de cobertura** — por trilha, por área, por cargo: % de pessoas que concluíram cada treinamento obrigatório
- **Relatório de atrasos** — quem está em atraso, há quanto tempo, com quais treinamentos
- **Lista de presença / aceite** — exportável em PDF e CSV, com nome, CPF (mascarado), data de conclusão, IP, hash de aceite. Esse é o documento que o RH leva pra auditoria.
- **Histórico de aceite do Código de Ética** — caso especial, sempre acessível, com timestamp e versão do documento aceito (importante pra DOC-001 do contexto)
- **Trilha auditável de alterações** — quem criou o treinamento, quem editou, quem atribuiu, quem validou. Logs imutáveis.
- **Exportação para evidência regulatória** — gerar pacote ZIP com PDFs de listas, certificados, política vinculada. Identificável com timestamp e nome.

#### 3.4 Configurações

- Trilhas e categorias (CRUD)
- Templates de certificado (upload de PNG/PDF de fundo + posicionamento de campos)
- Políticas de notificação padrão
- Integrações (Slack, Teams, e-mail, SSO, calendar)
- Permissões e papéis (quem pode criar treinamento, quem pode atribuir cross-equipe, quem pode validar)
- Branding (logo no certificado, cores)

### O que NÃO deve ter

- **Não permitir exclusão definitiva de treinamentos com histórico de conclusão.** Apenas arquivar — o histórico precisa ser preservado para auditoria.
- **Não permitir editar conteúdo de treinamento já concluído por alguém sem versionar.** Se o conteúdo muda, criar v2 e o histórico aponta qual versão cada pessoa fez.
- **Não armazenar dados sensíveis demais** (CPF cheio, dados de RH além do necessário) — respeitar LGPD, mascarar onde der, manter retenção mínima.
- **Não criar relatório que liste ranking público de "piores colaboradores em treinamento"** — relatórios são para gestão de risco, não para constranger pessoas.

---

## Modelo de dados sugerido (de alto nível)

Para o Antigravity ter referência ao gerar back-end:

- **User** (já existe no sistema atual) — adicionar relação com Training
- **TrainingTrack** — trilha (Cyber, UX, Compliance, Dev etc.)
- **Training** — treinamento (com versão, autor, status, regras de conclusão, vinculo a política)
- **TrainingModule** — módulo dentro do treinamento (vídeo, PDF, quiz, tarefa)
- **TrainingAssignment** — atribuição (User × Training × prazo × atribuído por × status × progresso)
- **TrainingCompletion** — conclusão (com nota, data, validador, certificado gerado, hash de evidência)
- **TrainingFeedback** — NPS e comentário pós-conclusão
- **AuditLog** — log de toda ação relevante (criação, edição, atribuição, validação, exclusão lógica)

Considerar campos de timestamp em tudo, soft-delete em vez de delete, e versionamento em Training.

---

## Telas que o Antigravity deve gerar (lista priorizada)

Em ordem de prioridade — se for entregar em fases, segue essa ordem:

**Fase 1 — Mínimo viável**
1. Aba "Treinamentos" no menu, com switch entre "Meus" / "Da minha equipe" / "Administração" conforme papel
2. Visão Colaborador — lista de "Meus treinamentos" com cards e filtros
3. Visão Colaborador — tela de detalhe / consumo de treinamento
4. Visão Líder — tabela da equipe + fluxo de atribuir treinamento (3 passos)
5. Visão RH — catálogo + criar treinamento (Seções A, B, C básicas)

**Fase 2 — Operação e auditoria**
6. Validação de conclusão pelo líder (fila e ações)
7. Certificados (geração e download)
8. Relatórios de cobertura e atrasos
9. Lista de presença / aceite exportável
10. Notificações multicanal

**Fase 3 — Refinamento**
11. Heatmap consolidado da equipe
12. Quiz builder
13. Versionamento de treinamentos
14. Recorrência (anual/semestral)
15. Integração Slack/Teams nativa

---

## Componentes / padrões visuais a reutilizar do sistema atual

- Header global e menu lateral/superior — não criar novo
- Tipografia, paleta, raio de borda, sombras — usar as mesmas variáveis CSS/tokens do sistema atual
- Botões primário/secundário/destrutivo — mesmos do form de avaliação
- Modais, toasts, badges — mesmo design system
- Tabelas e paginação — manter padrão existente
- Date picker, multi-select, file upload — reutilizar componentes já presentes

Se o sistema atual usa um framework UI (Tailwind, shadcn, MUI, Chakra etc.), **manter o mesmo**. Não introduzir biblioteca nova.

---

## Microcopy — exemplos prontos para usar

Para o Antigravity não inventar copy genérico:

- **Empty state Colaborador (sem treinamentos):** "Você ainda não tem treinamentos atribuídos. Quando sua liderança aplicar um, ele aparece aqui."
- **Empty state Líder (sem atribuições):** "Sua equipe ainda não tem treinamentos ativos. Comece atribuindo o primeiro." [botão: Atribuir treinamento]
- **Confirmar atribuição em massa:** "Atribuir [Treinamento X] para 12 pessoas? Elas vão receber notificação por e-mail agora." [Atribuir / Voltar]
- **Treinamento atrasado:** "Atrasado há 3 dias" (vermelho, sem ponto de exclamação)
- **Validação pendente para o líder:** "Maria concluiu [Treinamento X]. Validar?" [Validar / Pedir refazer]
- **Pós-conclusão:** "Concluído. Bom trabalho." + botão "Baixar certificado" — sem confete, sem exagero.
- **Pedir refazer (líder → colaborador):** "Conta pra Maria por que ela precisa refazer:" (textarea obrigatório)
- **Erro de upload de evidência:** "Não consegui enviar o arquivo. Tente de novo ou escolha outro." (sem stack trace, sem código de erro cru)

---

## Checklist final que o Antigravity deve respeitar

- [ ] Aba Treinamentos integrada ao menu, com permissões por papel
- [ ] Três visões (Colaborador, Líder, RH) bem separadas
- [ ] Atribuição em massa com fluxo de 3 passos e preview
- [ ] Status sempre visível: Em andamento, Pendente, Concluído, Atrasado, Aguardando validação
- [ ] Empty states informativos em todas as listas
- [ ] Confirmação clara em ações destrutivas
- [ ] Logs auditáveis de toda ação relevante
- [ ] Exportação de evidência (PDF/CSV/ZIP) para auditoria
- [ ] Versionamento de treinamentos
- [ ] Soft-delete em tudo
- [ ] Mobile responsivo nas telas do colaborador
- [ ] Reuso do design system existente — zero biblioteca nova
- [ ] Microcopy em pt-BR, direto, sem jargão de LMS em inglês
- [ ] Sem gamificação agressiva, sem ranking público
- [ ] LGPD: dados sensíveis mascarados, retenção mínima, log de acesso

---

## Resumo do prompt em uma frase para o Antigravity

> Estenda o sistema de avaliação de colaboradores adicionando uma aba "Treinamentos" com três visões (Colaborador, Líder, RH/Compliance), focada em atribuir e acompanhar trilhas de Cyber, Pentest, Dev, UX e Compliance, com evidência auditável (DOC-005 / A-01 / Stark), reutilizando o design system atual e seguindo os princípios de UX, comportamentos e microcopy descritos acima.
