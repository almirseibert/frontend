# MAK Frotas — Frontend

Sistema de gestão de frotas de veículos para MAK Serviços. Controla veículos, obras, manutenções, abastecimento, faturamento, funcionários e mais.

## Stack

- **React 18** com JavaScript (arquivos `.js` / `.jsx`, não TypeScript)
- **Create React App** (`react-scripts 5`) como build tool
- **Tailwind CSS 3** para estilização (utility-first)
- **Socket.io Client 4** para eventos em tempo real do backend
- **Lucide React** para ícones
- **Leaflet + react-leaflet** para mapas
- **jsPDF + jspdf-autotable** para exportação de PDF
- **react-big-calendar + moment** para agendas e calendários
- **PapaParse** para importação de CSV

## Comandos

```bash
npm start        # Servidor de desenvolvimento em http://localhost:3000
npm run build    # Build de produção em /build
npm test         # Testes (react-scripts test)
```

### Build Docker (produção)

```bash
docker build --build-arg REACT_APP_API_URL=<url> -t frotas-frontend .
```

O Dockerfile usa multi-stage build: Node 18 Alpine para build, Nginx 1.25 Alpine para servir. O `nginx.conf` faz fallback para `index.html` para suportar SPA.

## Variáveis de Ambiente

| Variável | Uso |
|----------|-----|
| `REACT_APP_API_URL` | URL base da API (usada em produção e no build Docker) |

Em desenvolvimento, o `.env` aponta para o backend no Easypanel. Em produção, a variável é injetada como `ARG` no build Docker.

## Arquitetura

### Roteamento

**Não usa React Router.** O roteamento é feito via estado `currentPage` no `App.js`. O componente `Sidebar` chama `setCurrentPage()` e `App.js` renderiza o componente correspondente com `renderPage()`. Consequência: não há URLs por página nem suporte a bookmarks.

### Autenticação

`src/contexts/AuthContext.js` — Context API com JWT:
- Token armazenado em `localStorage` como `authToken`
- `login()` → POST `/auth/login` → armazena token → GET `/auth/me`
- `logout()` → remove token do localStorage
- Hook: `useAuth()` expõe `user`, `login`, `logout` e flags de permissão

### Permissões (roles)

Lidas de `user.user_type` e normalizadas em flags booleanas:

| Flag | Role |
|------|------|
| `isAdmin` | `admin` |
| `isEditor` | `editor` ou `admin` |
| `isOperator` | `operador` |
| `isViewer` | `viewer` ou `visualizador` |
| `canAccessRefueling` | `podeAcessarAbastecimento === true` ou admin |

Operadores são redirecionados diretamente para `SolicitacaoAbastecimentoPage` sem acesso ao restante do app.

### API Client

`src/services/apiClient.js` — wrapper sobre `fetch()` nativo:
- Base URL: `process.env.REACT_APP_API_URL || 'http://localhost:3001/api'`
- Injeta `Authorization: Bearer <token>` automaticamente em todas as requisições
- Para uploads com `FormData`, remove o header `Content-Type` automaticamente
- Lança `Error` com a mensagem do backend em caso de resposta não-ok

### Carregamento de dados

`loadAllData()` no `App.js` usa `Promise.all` para buscar todos os recursos em paralelo na inicialização. Socket.io emite `server:sync` com lista de targets para re-syncs seletivos sem recarregar tudo.

### Modais globais

Definidos no `App.js` e passados como props para as páginas:
- `CustomAlert` — alerta simples com texto pré-formatado
- `ConfirmationModal` — confirmação com botões customizáveis
- `PasswordConfirmationModal` — confirmação com validação de senha via API
- `UpdateMessageModal` / `AdminPendingRequestAlert` — notificações do sistema

## Estrutura de Pastas

```
src/
├── App.js                  # Raiz: roteamento, socket.io, modais globais, loadAllData
├── contexts/
│   └── AuthContext.js      # Autenticação e permissões
├── services/
│   └── apiClient.js        # Wrapper de fetch com todos os endpoints
├── utils/
│   └── vehicleRules.js     # Taxonomia de veículos e regras de leitura (Km vs Hr)
├── pages/                  # Uma página por módulo do sistema
└── components/
    ├── modals/             # Modais de criação e edição
    ├── dashboard/          # Painéis do dashboard
    ├── reports/            # Componentes de relatório (PDF)
    ├── revisions/          # Abas de manutenção (revisões, lavagens)
    └── supervisor/         # Visão específica de supervisor de obra
```

## Convenções

### JavaScript / React

- Componentes em `.js`, não `.tsx` — não criar arquivos TypeScript
- Componentes funcionais com hooks (`useState`, `useEffect`, `useMemo`, `useCallback`)
- `useMemo` para listas e cálculos derivados que dependem de estado grande (ex: alertas de veículos, ranking de consumo)
- Nenhum gerenciador de estado externo (sem Redux, Zustand, etc.) — usar Context API ou props

### Estilização

- Tailwind CSS exclusivamente — não criar arquivos CSS por componente
- Paleta principal: `yellow-500` (primário/ação), `slate-900` / `slate-800` (sidebar), `gray-50` / `gray-100` (fundo de conteúdo)
- Status visual: `green` = ativo/ok, `red` = alerta/erro, `yellow` = atenção/pendente, `gray` = inativo

### Nomenclatura

- Componentes de página: `NomePage.js` (ex: `VehiclePage.js`, `ObrasPage.js`)
- Componentes de modal: `NomeModal.js` dentro de `components/modals/`
- Funções de API no `apiClient.js`: `verbRecurso` em camelCase (ex: `getVehicles`, `createObra`, `updateEmployee`)
- Texto da UI em português brasileiro

### Regras de leitura de veículos (`vehicleRules.js`)

- Veículos leves e caminhões de trecho → odômetro (Km)
- Caminhões pesados e máquinas → horímetro (Hr)
- Validações: sem regressão de leitura, salto máximo de 1.000 Km ou 50 Hr
- Sempre usar `getAllowedReadingTypes()` e `getVehicleMainReading()` em vez de lógica inline

### Adicionando novos módulos

1. Criar `src/pages/NovoModuloPage.js`
2. Importar em `App.js` e adicionar caso em `renderPage()`
3. Adicionar item de navegação em `Sidebar.js` com controle de role se necessário
4. Adicionar endpoints correspondentes em `apiClient.js`
