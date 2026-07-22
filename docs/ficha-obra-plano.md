# Ficha da Obra — Plano de Consolidação da Análise Gerencial

> Rework de navegação. Consolida as 4 telas do grupo **Análise Gerencial** numa **Ficha da Obra** de página única (leitura em Z), mais abas para as perguntas genuinamente diferentes. Objetivo primário: **simplificação de navegação** — hoje uma resposta sobre uma obra exige cruzar 3–4 telas.

## 1. Diagnóstico

O sistema foi modelado a partir do banco de dados (uma tela por tabela / por artefato de análise), não a partir das perguntas que as pessoas fazem. Para responder *"como está a obra X?"* o usuário precisa abrir quatro telas diferentes.

Pior que redundância: as quatro telas **calculam os mesmos conceitos de formas divergentes**, produzindo números que se contradizem para a mesma obra.

| Conceito | Gestão de Obras | Projeção de Obra | Aproveitamento |
|---|---|---|---|
| **% da obra** | % conclusão física (informado) | horas faturadas ÷ contratadas | horas executadas ÷ capacidade líquida |
| **Margem / R$** | valor produzido − gasto real | faturamento por `valoresPorTipo` | ticket médio R$/h × horas |
| **Prazo** | `previsao` do backend | ritmo de lançamento vs meta 45 dias | — |

Consolidar não é empilhar as telas; é **eleger definições canônicas** e rebaixar as demais a "método de análise".

## 2. Avaliação de relevância das 4 telas

- **Gestão de Obras** (grade de cards por criticidade) → não é conteúdo da Ficha; é o **índice/portal** por onde se entra nela.
- **Projeção de Obra** → único de verdade: **ritmo → data de término** e **combustível vs faturamento (limite interno 20%)**. Resto é repetição.
- **Aproveitamento Produtivo** → único de verdade: **capacidade vs executado (ociosidade do ferro)** e **ranking por máquina**.
- **Divergências Operacionais** → único de verdade: cruzamento **GPS × ponto × faturamento**. Forense, por veículo/dia.

## 3. Decisão de arquitetura

**Uma pergunta = uma superfície.**

- Três das quatro telas respondem a mesma pergunta ("como vai a obra") → viram **uma Ficha**.
- As que mudam a lógica da pergunta → viram **abas** (critério do usuário: aba só quando a pergunta muda, não por falta de espaço).

```
Ficha da Obra
├── Aba: Visão geral      ← "como vai a obra"      (leitura Z contínua, nada colapsa)
├── Aba: Aproveitamento   ← "como o ferro é usado no tempo" (gráfico diário, ranking, ticket médio)
└── Aba: Faturamento      ← "o que dá para cobrar"

Fora da Ficha:
└── Divergências Operacionais ← análise individual, caso a caso (ferramenta avulsa)
```

Mapeamento tela-a-tela:

| Antes (4 telas) | Depois |
|---|---|
| Gestão de Obras (grade) | Vira o **índice** — a lista por onde se entra na Ficha |
| Projeção de Obra | **Diluída na Visão geral** (horas, combustível, projeção de término) |
| Aproveitamento | **Resumo por máquina na Visão geral** + **aba própria** para o detalhe |
| Divergências | **Fora da Ficha** — análise individual, caso a caso |

## 4. Princípios de design (fixados com o usuário)

1. **Página completa, nada colapsa.** Sem accordion, sem "explodir" informação. Tudo à vista.
2. **Leitura em Z.** Hierarquia por **posição e tipografia** (tamanho, peso, alinhamento) — não por cor.
3. **Cor quase zero.** Sem badges de alerta, sem semáforo na moldura. Cor é exceção pontual, não moldura.
4. **O sistema não dá sugestões.** Mostra o fato ("saldo 430 h"), nunca o conselho ("faça X").
5. **Densidade > chrome.** Números, não rótulos vazios. Falta de informação pequena é tolerável enquanto a usabilidade não é plena.
6. **Abas só quando a pergunta muda.**

## 5. Fonte de dados canônica — **o lançamento**

Particularidades da operação MAK que definem a base de cálculo:

- **Rastreador não é fonte.** Muitas máquinas sem rastreador e dados não 100% fiéis → mais divergência que consistência. **Removido:** o gap "horas executadas (rastreador) × horas lançadas".
- **Leitura (horímetro/odômetro) não é fonte.** Inconsistente. **Removida** da frota.
- **Tudo deriva do lançamento.** Progresso, horas apontadas e aproveitamento saem todos da mesma base.

### Definições canônicas

- **Progresso físico = horas lançadas ÷ horas contratadas.** Um número só (confirmado pelo usuário). A barra de progresso *é* a razão de horas — não existe "% físico" separado.
- **Margem = valor produzido − gasto real.** Manchete = dinheiro realizado. Ticket médio do Aproveitamento é *simulação* ("quanto eu poderia faturar") → pertence à aba, não à linha de decisão.
- **Aproveitamento por máquina = horas lançadas ÷ capacidade líquida** (capacidade desconta fins de semana e máquinas em manutenção).
- **Meta operacional = 45 dias.** Evolução física é **semanal** (mensal não faz sentido numa obra de ~6 semanas) e a projeção é medida **contra a meta de 45 dias**.

## 6. Layout da aba "Visão geral" (ordem em Z, tudo aberto)

1. **Cabeçalho** — esquerda: nome da obra, tipo, região, início, responsável, fiscal. Direita: valor de contrato, meta 45 dias / data de encerramento / dia atual.
2. **Físico & financeiro** (esq.) | **Projeção 45 dias + Combustível vs faturamento** (dir.)
   - Físico & financeiro: barra de progresso = `1.980 de 2.410 h lançadas · 82%`; valor produzido; gasto acumulado; margem (R$ e %); custo por hora lançada; saldo de contrato.
   - Projeção: ritmo médio (%/semana); falta para 100%; conclusão projetada; desvio contra a meta (24/07).
   - Combustível: % atual sobre faturado; projeção ao final (limite interno 20%).
3. **Frota nesta obra** (largura total) — tabela: veículo, tipo, h lançadas no mês, aproveitamento, desde. Rodapé: alocados / aproveitamento médio / os que já saíram (com período de alocação).
4. **Evolução física semanal** (largura total) — % acumulado + Δ por semana; meta ≥15%/semana para fechar em 45 dias.

Colunas **removidas** do que se tinha antes: gap executadas×lançadas; coluna "Leitura" da frota.

## 7. Fásea de entrega

1. **Fase 1 — Visão geral.** A Ficha e seu conteúdo consolidado. Entrega o ganho principal (4 navegações → 1).
2. **Fase 2 — Aba Aproveitamento.** Detalhe que não cabe no Z (gráfico diário, ranking por categoria/máquina, ticket médio editável). Parte é cross-obra.
3. **Fase 3 — Aba Faturamento.** Detalhe de cobrança.
4. **Não migrar agora — Divergências.** Depende de GPS × ponto × faturamento (fontes frágeis). Permanece como análise individual até as fontes serem confiáveis.

Recomendação: **não fazer a Ficha do Veículo em paralelo.** Validar a Ficha da Obra primeiro (as pessoas realmente param de pular entre telas?) e só então replicar o padrão para o Veículo.

## 8. Itens em aberto / riscos

- **Índice de entrada.** A grade "Gestão de Obras" vira a lista/porta da Ficha. Definir ordenação padrão (criticidade? margem?) e as portas por perfil (gestão cai na lista; supervisor cai na obra dele; back-office usa busca).
- **Histórico de alocação** ("os que já saíram") é o dado de maior risco técnico: exige linha do tempo de alocação por veículo, que pode não existir hoje no banco. Confirmar cedo.
- **Deep-link / URL por página.** Hoje o roteamento é estado em memória (`currentPage` no `App.js`), sem URL nem bookmark — impossível "mandar o link da resposta". Pré-requisito para o ganho de acesso valer na prática; avaliar introduzir rota por obra (`/obra/:id`).
- **Capacidade líquida** (denominador do aproveitamento) precisa de definição fechada: dias úteis × capacidade diária, descontando manutenção.

---

_Última revisão: 2026-07-22. Base: análise das telas `AnaliseGerencialPage`, `ProjecaoObra`, `AproveitamentoProdutivo`, `SupervisorDashboard` (Divergências, Projeção, Aproveitamento, Gestão de Obras)._
