# Task — Embed de vídeo no módulo de treinamento

> **Contexto:** Sietch › Treinamentos › módulo do tipo `video`
> **Audiência:** Admin (no builder) e Colaborador (no player)
> **Status:** Spec para implementação
> **Relacionada a:** `task-criacao-treinamento.md` (seção 4.4 → `video`)

---

## 1. Objetivo

Permitir que um módulo do tipo `video` exiba conteúdo a partir de **três origens**, com rastreamento unificado de progresso (% assistida), captions e controle de velocidade — alimentando a barra de progresso e o status "Vídeo assistido. Você pode avançar para o próximo módulo." (image 3).

### Providers suportados

| Provider | Quando usar | Hospedagem |
|---|---|---|
| `youtube` | Conteúdo público, palestras, vídeos já no canal | Externa (YouTube) |
| `vimeo` | Conteúdo restrito por domínio, sem branding YouTube | Externa (Vimeo) |
| `upload` | Conteúdo proprietário/sensível (compliance, PLD/FT, política A-01) | S3/Cloudflare Stream / Mux |

---

## 2. UX no builder do admin

### 2.1 Seletor de provider

Ao adicionar/editar um módulo `video`, exibir um seletor com 3 opções:

```
○ YouTube       Cole o link ou ID do vídeo
○ Vimeo         Cole o link do vídeo
○ Upload        Suba o arquivo (.mp4, .mov, .webm — até 2GB)
```

### 2.2 Campo de input por provider

#### YouTube
- Input: URL completa **ou** video ID.
- Aceitar formatos:
  - `https://www.youtube.com/watch?v=ABC123`
  - `https://youtu.be/ABC123`
  - `https://www.youtube.com/embed/ABC123`
  - `https://www.youtube.com/shorts/ABC123`
  - `ABC123` (id puro, 11 chars)
- Ao colar: extrair `video_id`, validar via oEmbed e renderizar preview (thumb + título).
- Mostrar erro se vídeo for privado/removido.

#### Vimeo
- Input: URL completa **ou** video ID.
- Aceitar:
  - `https://vimeo.com/123456789`
  - `https://vimeo.com/123456789/hash` (link de privacidade unlisted)
  - `https://player.vimeo.com/video/123456789`
- Validar via oEmbed do Vimeo. Persistir `video_id` e `unlisted_hash` se presente.

#### Upload
- Drag & drop ou seleção.
- Tipos aceitos: `video/mp4`, `video/quicktime`, `video/webm`.
- Tamanho máximo: **2GB** (configurável).
- Resolução máxima recomendada: 1080p (avisar se > 1080p).
- Fluxo:
  1. Upload em chunks para storage (S3 multipart ou Cloudflare Stream / Mux Direct Upload).
  2. Trigger de processamento (transcoding HLS).
  3. Polling de status: `uploading` → `processing` → `ready` | `error`.
  4. Asset `ready` libera publicação.
- Exibir progresso de upload e de processamento separadamente.

### 2.3 Campos comuns (qualquer provider)

| Campo | Tipo | Obrigatório | Default |
|---|---|---|---|
| Título do módulo | string | sim | "Vídeo" |
| Duração estimada (min) | int | sim | auto-preenchido do oEmbed/asset |
| Permitir velocidades | bool | sim | `true` (mostra `0.75x`, `1x`, `1.5x`, `2x` como na image 3) |
| % mínima para concluir | int | sim | `90` |
| Captions/legendas | file (.vtt) ou URL | não | — |
| Transcrição | markdown | não | — |
| Bloquear avanço até concluir | bool | sim | `true` |

---

## 3. UX no player do colaborador

Referência visual: image 3.

- Área principal do vídeo: 16:9, responsiva, sem letterbox indesejado.
- Barra de progresso da plataforma (não a do provider) abaixo do vídeo — **é ela quem dispara a marcação de "assistido"**, não a do YouTube/Vimeo.
- Controles de velocidade à direita: `0.75x` `1x` `1.5x` `2x`.
- Indicador "Assistido" quando `watched_pct >= min_watch_pct`.
- Banner verde "Vídeo assistido. Você pode avançar para o próximo módulo." aparece ao atingir o threshold.
- Sidebar de módulos mantém comportamento do índice (image 3) — o módulo atual fica destacado em azul, com checkmark verde nos concluídos.

### 3.1 Estados visuais

| Estado | Indicador |
|---|---|
| Não iniciado | Play button centralizado, sem progresso |
| Em andamento | Barra parcial, sem banner |
| Pausado | Play button, mantém posição |
| Concluído (≥ min_watch_pct) | Barra cheia, banner verde, checkmark na sidebar |
| Erro de carregamento | Mensagem específica + botão "Tentar novamente" |
| Vídeo indisponível (removido no YT/Vimeo) | Aviso ao colaborador + alerta ao admin |

### 3.2 Microcopy (referência rápida)

- Erro de carregamento: `Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.`
- Vídeo removido na origem: `Este vídeo não está mais disponível. O time de treinamentos foi avisado.`
- Threshold atingido: `Vídeo assistido. Você pode avançar para o próximo módulo.` (já validado na image 3)
- Avanço bloqueado: `Assista pelo menos 90% do vídeo para continuar.`

---

## 4. Implementação técnica do embed

### 4.1 YouTube — IFrame Player API

Embed via `<iframe>` apontando para `https://www.youtube-nocookie.com/embed/{VIDEO_ID}` (privacy-enhanced mode — não cria cookies do YouTube até o play).

Parâmetros recomendados:
```
?rel=0          // não mostra vídeos relacionados de outros canais
&modestbranding=1
&playsinline=1
&enablejsapi=1  // habilita JS API para tracking
&origin={origem_do_site}
```

Carregar a IFrame Player API (`https://www.youtube.com/iframe_api`) e escutar `onStateChange` para detectar play/pause/ended.

Tracking de progresso: `setInterval` de 1s consultando `player.getCurrentTime()` enquanto `state === PLAYING`.

### 4.2 Vimeo — Player SDK

Embed via `<iframe src="https://player.vimeo.com/video/{VIDEO_ID}?h={HASH}&dnt=1">` (`dnt=1` = do not track).

Usar `@vimeo/player` SDK:
```js
const player = new Vimeo.Player(iframe);
player.on('timeupdate', ({ seconds, duration, percent }) => { ... });
player.on('ended', () => { ... });
```

### 4.3 Upload próprio — HLS via Mux ou Cloudflare Stream

Recomendação: **Mux** ou **Cloudflare Stream** como provider de transcoding/CDN. Player: `hls.js` ou `<video>` nativo (Safari).

Ao receber asset `ready`, persistir `playback_id` e gerar URL HLS assinada de curta duração (5–15 min) no momento do play.

Eventos a escutar: `timeupdate`, `ended`, `error`.

---

## 5. Tracking unificado de progresso

Independente do provider, o front envia eventos para o backend através de um endpoint único.

### 5.1 Eventos do player → backend

```http
POST /api/v1/me/trainings/{training_id}/modules/{module_id}/video-progress

{
  "event": "play" | "pause" | "seek" | "tick" | "ended" | "error",
  "current_time_sec": 543,
  "duration_sec": 900,
  "watched_pct": 60.3,
  "session_id": "uuid",          // gerado no client por sessão de player
  "timestamp": "2026-05-15T14:22:01Z",
  "error_code": "NETWORK" | "PROVIDER_UNAVAILABLE" | null
}
```

Frequência do `tick`: a cada **5s** enquanto playing (com debounce). Backend é tolerante a duplicatas (idempotência por `session_id + current_time_sec`).

### 5.2 Cálculo de `watched_pct`

Não é simplesmente `current_time / duration`. É a **fração do vídeo que o usuário efetivamente cobriu**, sem creditar seeks.

Algoritmo:
- Manter um array de intervalos assistidos `[(start, end), ...]`.
- A cada `tick`, expandir o intervalo atual se contíguo, ou abrir novo se houve seek.
- `watched_pct = soma_dos_intervalos_únicos / duration`.

Isso evita o atalho "pular para o final, marcar como assistido".

### 5.3 Marcação de conclusão

Quando `watched_pct >= module.payload.min_watch_pct`:
- Backend marca `module_progress.status = "completed"`, `completed_at = now()`.
- Recalcula progresso geral do treinamento (`3/6 50%` na image 3 vem daí).
- Emite evento `module.completed`.

---

## 6. Modelo de dados (delta sobre a task de criação)

### 6.1 Payload do módulo `video`

Já especificado em `task-criacao-treinamento.md` §4.4. Reforço dos campos:

```jsonc
{
  "type": "video",
  "provider": "youtube" | "vimeo" | "upload",
  "source": {
    // youtube
    "video_id": "dQw4w9WgXcQ",
    "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",

    // vimeo
    "video_id": "123456789",
    "unlisted_hash": "abcdef123",

    // upload
    "asset_id": "uuid-do-asset",
    "playback_id": "mux-ou-cf-id",
    "duration_sec": 900,
    "hls_url_template": "..."  // resolvido em runtime com assinatura
  },
  "captions": [
    { "lang": "pt-BR", "url": "https://.../captions.vtt", "default": true }
  ],
  "transcript_md": "string | null",
  "allow_speed": true,
  "min_watch_pct": 90
}
```

### 6.2 Tabelas adicionais

```
video_assets                       -- só para provider = upload
  id              uuid PK
  uploaded_by     uuid FK
  filename        text
  size_bytes      bigint
  duration_sec    int
  status          enum ('uploading','processing','ready','error')
  storage_key     text             -- chave no S3/CF Stream/Mux
  playback_id     text
  error_message   text
  created_at      timestamptz
  ready_at        timestamptz

video_progress
  id              uuid PK
  user_id         uuid FK
  module_id       uuid FK
  watched_intervals jsonb          -- [[0, 30], [45, 120], ...]
  watched_pct     numeric(5,2)
  last_position   int
  completed_at    timestamptz
  updated_at      timestamptz
  UNIQUE (user_id, module_id)
```

---

## 7. Contrato de API (delta sobre a task de criação)

### 7.1 Resolver URL/ID (validação no builder)

```http
POST /api/v1/admin/video/resolve

{ "provider": "youtube", "input": "https://youtu.be/ABC123" }

→ 200
{
  "valid": true,
  "video_id": "ABC123",
  "duration_sec": 902,
  "title": "Introdução à Cyber Security",
  "thumbnail_url": "https://...",
  "embed_url": "https://www.youtube-nocookie.com/embed/ABC123"
}

→ 422
{ "valid": false, "code": "PRIVATE_OR_REMOVED" }
```

### 7.2 Upload direto (provider `upload`)

```http
POST /api/v1/admin/video/upload-url
{ "filename": "...", "size_bytes": 0, "mime": "video/mp4" }

→ 200
{
  "asset_id": "uuid",
  "upload_url": "https://.../signed-multipart",
  "method": "PUT" | "POST",
  "expires_at": "..."
}
```

Polling:
```http
GET /api/v1/admin/video/assets/{asset_id}

→ 200
{ "status": "processing", "progress_pct": 42 }
{ "status": "ready", "playback_id": "...", "duration_sec": 900 }
```

### 7.3 Reportar progresso (já em §5.1)

```http
POST /api/v1/me/trainings/{training_id}/modules/{module_id}/video-progress
```

### 7.4 Obter URL de playback (provider `upload`)

```http
GET /api/v1/me/video-assets/{asset_id}/playback

→ 200
{
  "hls_url": "https://stream.../playlist.m3u8?token=...",
  "expires_at": "2026-05-15T14:35:00Z",
  "captions": [ ... ]
}
```

URL assinada de curta duração. Renovar antes de expirar.

---

## 8. Segurança e privacidade

- **YouTube:** sempre usar `youtube-nocookie.com`. Não há controle de acesso — qualquer pessoa com o link vê.
- **Vimeo:** usar vídeos com privacidade `unlisted` + `domain restriction` no Vimeo (apenas domínio da plataforma).
- **Upload:** URLs HLS sempre assinadas, expiração curta. Bucket não-público. Captions via signed URL também.
- **GDPR/LGPD:**
  - Banner de consentimento para embeds de terceiros (YouTube/Vimeo) **antes** do primeiro play, se o usuário não consentiu ainda. Pode ser política da plataforma toda.
  - `dnt=1` no Vimeo, `youtube-nocookie.com` no YouTube reduzem rastreamento, mas não eliminam.
- **CSP:** adicionar `https://www.youtube.com`, `https://www.youtube-nocookie.com`, `https://player.vimeo.com`, e os domínios do Mux/CF Stream em `frame-src` e `connect-src`.
- **CORS:** captions VTT precisam ser servidas com CORS aberto pro domínio da app.

---

## 9. Acessibilidade

- Player precisa expor controles via teclado: `space` play/pause, `←/→` seek 5s, `↑/↓` volume, `f` fullscreen, `c` toggle captions.
- Legendas: obrigatório quando o vídeo tem fala. Para `upload`, gerar transcrição automática (Whisper, AssemblyAI ou serviço do provider) como ponto de partida — admin revisa e aprova.
- Transcrição completa em texto deve estar disponível abaixo do vídeo (acordeão "Ver transcrição"). Atende WCAG 2.1 nível AA.
- `prefers-reduced-motion`: não autoplay, não animações no banner de conclusão.
- Banner de conclusão precisa ser anunciado por leitor de tela (`role="status"`, `aria-live="polite"`).

---

## 10. Critérios de aceite

### Admin (builder)

- [ ] Selecionar provider YouTube e colar URL nos 4 formatos válidos resolve corretamente e mostra preview.
- [ ] URL de YouTube inválida/privada mostra erro específico, não genérico.
- [ ] Selecionar Vimeo com link `unlisted` (com hash) persiste o hash.
- [ ] Upload de arquivo .mp4 de até 2GB conclui com barra de progresso visível.
- [ ] Arquivo .mp4 entra em status `processing` e libera para uso ao virar `ready`.
- [ ] Arquivo de tipo inválido (.avi, .mkv) é rejeitado no client com mensagem clara.
- [ ] Captions .vtt podem ser anexadas e aparecem como faixa de legenda no player.
- [ ] `min_watch_pct` configurável de 50 a 100 (default 90).

### Colaborador (player)

- [ ] Player carrega vídeo do provider correto.
- [ ] Controles de velocidade `0.75x` / `1x` / `1.5x` / `2x` funcionam para todos os providers.
- [ ] Pular o vídeo (seek até o final) **não** marca como assistido.
- [ ] Assistir 90% (configurável) marca como concluído e mostra banner verde.
- [ ] Sidebar de módulos atualiza checkmark e barra de progresso geral (`3/6 50%`).
- [ ] Recarregar a página retoma do último `last_position`.
- [ ] Vídeo removido na origem (YT/Vimeo) mostra mensagem específica e dispara alerta interno.
- [ ] Erro de rede mostra botão "Tentar novamente" sem perder progresso já salvo.
- [ ] Sem captions, opção `CC` fica desabilitada com tooltip explicativo.
- [ ] Transcrição renderizada abaixo do vídeo quando disponível.

### Tracking

- [ ] Eventos `tick` enviados a cada 5s durante play.
- [ ] `watched_pct` calculado a partir de intervalos únicos (não soma simples).
- [ ] Idempotência: reenvio de evento com mesmo `session_id + current_time_sec` não duplica progresso.
- [ ] Backend tolera offline temporário (client faz queue local de eventos e reenvia).

---

## 11. Edge cases e questões em aberto

1. **Vídeo do YouTube fica `age-restricted`** — não toca em embed. *Proposta:* detectar via oEmbed e bloquear seleção no builder.
2. **Vimeo com restrição de domínio configurada errada** — vídeo carrega só fora do iframe. *Proposta:* documentar o setup correto no Vimeo + validar no resolve.
3. **Upload acima de 2GB** — recusar no client ou aceitar e avisar de tempo de processamento? *Proposta:* recusar > 2GB com mensagem específica.
4. **Usuário troca de aba durante o vídeo** — pausa automática ou continua? *Proposta:* continua, mas não conta como assistido se aba inativa por mais de 30s (`visibilitychange`).
5. **Vídeo offline (PWA)** — fora do escopo desta task, mas o modelo precisa permitir cache local de assets de `upload` no futuro.
6. **Velocidade 2x reduz `watched_pct`?** — não. Tempo real assistido conta, independente de velocidade. (Caso contrário, vira incentivo a assistir em 0.75x.)
7. **Custo de Mux/Cloudflare Stream vs S3 puro** — decidir antes de fechar a stack. S3 puro implica self-host de transcoding.

---

## 12. Métricas a instrumentar

- `video.session.started` — { module_id, provider }
- `video.session.completed` — { module_id, provider, watched_pct, total_time_sec, avg_speed }
- `video.error` — { module_id, provider, error_code }
- `video.upload.completed` — { asset_id, size_bytes, duration_sec, processing_time_sec }
- Distribuição de provider por treinamento.
- % de colaboradores que abandonam antes do `min_watch_pct`.
- Velocidade média de reprodução (sinal de "tédio" se concentrar em 1.5x/2x).
