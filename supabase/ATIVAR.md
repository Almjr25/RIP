# Ativar contas e armazenamento na nuvem

O código mantém o site no modo local até `RIP_CLOUD_ENABLED=true` na Vercel. O arquivo `RIP.html` continua local, independentemente dessa variável.

## 1. Preserve seus cupons

No site atual, clique em **Exportar backup** e guarde o JSON. Não limpe os dados do navegador. Depois da ativação, o botão **Copiar compras deste navegador para a conta** permite migrar explicitamente. Os originais locais são mantidos. Anexos antigos não são enviados: ficam nos backups locais; o novo sistema recebe os textos, itens e metadados. Há também um botão para exportar o backup local antigo depois da ativação.

## 2. Instale as tabelas e permissões no Supabase

1. Abra o projeto e entre em **SQL Editor → New query**.
2. Copie o conteúdo inteiro de [001_accounts.sql](migrations/001_accounts.sql), cole e clique em **Run**.
3. Aguarde a confirmação de sucesso. É uma instalação inicial, executada uma única vez; não use o editor visual para liberar permissões gerais nas tabelas.

O SQL cria `purchases` e `purchase_items`, habilita RLS e permite somente leituras da própria conta. Gravações ocorrem exclusivamente nas funções transacionais que validam proprietário, versão, chave e valores. Não concede acesso a usuários anônimos. A chave pública não dá acesso aos cupons sem uma sessão válida.

## 3. Configure o login

Em **Authentication → URL Configuration**:

- **Site URL:** `https://ripb.vercel.app`
- **Redirect URLs:** adicione exatamente `https://ripb.vercel.app`.

Em **Authentication → Sign In / Providers → Email** (o nome pode variar): habilite cadastro por e-mail/senha e mantenha **Confirm email** ativado. Senhas devem ter no mínimo oito caracteres. O aplicativo inclui confirmação por e-mail, recuperação e alteração de senha. Se configurar requisitos adicionais de senha no painel, informe-os também na interface.

O envio padrão de e-mails do Supabase tem restrições de destinatários e volume. Para liberar cadastro/recuperação ao público, configure **SMTP próprio** e valide um remetente no provedor de e-mail. Consulte os limites atuais no painel; falhas de envio não significam falha do banco. Não é necessário comprar domínio para hospedar o RIP, mas um serviço SMTP pode exigir domínio de remetente verificado.

## 4. Configure a Vercel

Projeto **ripb → Settings → Environment Variables**. Cadastre para **Production**:

| Nome | Valor |
| --- | --- |
| `RIP_CLOUD_ENABLED` | `true` |
| `SUPABASE_URL` | `https://ztxevqxcwusssdxnjamc.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | A chave `sb_publishable_…` do seu projeto |
| `RIP_APP_ORIGIN` | `https://ripb.vercel.app` |

Use a URL raiz, **sem `/rest/v1/`**. Não é necessário fornecer senha do banco, chave secret nem service_role. O backend usa a chave pública com o JWT de cada usuário; as políticas RLS permanecem em vigor.

Depois de salvar, vá em **Deployments → último deployment da branch main → Redeploy**. As variáveis novas só entram no próximo deployment. Mantenha **Framework: Other** e as configurações de build/output do `vercel.json`; não altere para Python. Há uma função Node em `api/index.js`, além dos arquivos de `dist`. O `vercel.json` encaminha explicitamente as rotas `/api/*` a essa função, mantendo os parâmetros de consulta.

Não habilite a configuração de produção indiscriminadamente em previews: o `RIP_APP_ORIGIN` e os redirects devem corresponder à origem usada. Prefira um segundo projeto Supabase para desenvolvimento e testes. Nunca use cupons pessoais em testes automatizados.

## 5. Teste sua conta

1. Abra `https://ripb.vercel.app`, crie uma conta, confirme o e-mail e entre.
2. Copie as compras locais pelo botão que informa o e-mail de destino. Registros com a mesma identificação/chave não são substituídos; pendências são informadas e podem ser tentadas novamente. Cupons antigos incompletos são copiados como rascunhos.
3. Abra em outro navegador/dispositivo, entre na mesma conta e confira o histórico.
4. Teste criar, editar, excluir e recuperar senha. Uma segunda conta deve começar sem acesso às compras da primeira; o banco também protege esse isolamento.

Não apague seu backup até conferir a migração. Novas gravações na nuvem exigem conexão. Se a rede falhar, o app informa o erro; não informa que salvou nem grava silenciosamente em uma base local diferente.

## Operação e crescimento

- O histórico carrega 30 resumos por página; textos e itens são consultados ao abrir uma nota. Totais pessoais são calculados no banco. São permitidos até 2000 itens e 1,5 MB por gravação; a leitura dos itens é paginada internamente.
- A mesma chave pode existir em contas diferentes sem revelar que outra pessoa a possui. Não há base estatística coletiva nem compartilhamento nesta versão. Uma futura agregação precisará de consentimento e metodologia próprios, inclusive deduplicação e verificação fiscal oficial.
- Cookies de sessão são `HttpOnly`, `Secure` e `SameSite=Lax`, com renovação no servidor. Tokens não ficam no localStorage. A API valida origem nas mutações e verifica se a conta mudou em outra aba.
- Revisões impedem sobrescrever uma compra que mudou em outro dispositivo; nesse caso, atualize o histórico e reabra a nota. A exclusão remove a nota e seus itens da conta; backups exportados continuam contendo cópias.
- PostgreSQL e migrações SQL permitem trocar de fornecedor. Monitorar armazenamento, processamento, conexões, tráfego, autenticação e SMTP. Um plano gratuito pode pausar por inatividade e não deve ser tratado como garantia de disponibilidade ou backup.
- Antes de abrir ao público, configure SMTP, política de privacidade, meios de exclusão de conta/dados e backups com restauração verificada. Hoje o usuário pode exportar seus cupons e excluí-los individualmente; não existe fluxo de autoexclusão da conta na interface.
- A validação da chave é estrutural: **nenhuma compra recebe selo de autenticidade SEFAZ**. O banco impõe `authenticity: not_checked` mesmo quando o cliente tenta declarar outra coisa.

## Verificação do código

`sh scripts/setup.sh` verifica os modos existentes e a API com requisições simuladas. Para testar o SQL em PostgreSQL isolado em WebAssembly, sem acessar o projeto real:

```sh
npm install --prefix .data/pg-test --no-audit --no-fund @electric-sql/pglite
node tests/cloud_db.test.mjs
```

`python3 tests/cloud_smoke.py` requer Playwright/Chromium e testa a interface com respostas simuladas. Ele não envia e-mails nem cria contas reais. Para verificar também o encaminhamento com o roteador oficial da Vercel:

```sh
npm install --prefix .data/vercel-routing --no-audit --no-fund @vercel/routing-utils
node tests/cloud_routing.test.js
```

Os testes locais não substituem o teste final no projeto configurado.
