# RIP — Rastreador de Inflação Pessoal

Registre compras de supermercado colando o texto da consulta da NFC-e. Versão 0.4: **sem upload de imagens, OCR, serviços pagos ou bibliotecas externas**. A normalização das unidades e a conferência dos valores permanecem.

## Como usar

1. Abra a consulta da NFC-e pelo QR code no navegador.
2. Copie desde o nome do estabelecimento até o valor total, incluindo todos os produtos.
3. No RIP, escolha **Adicionar cupom**, cole no campo **Conteúdo copiado da nota** e selecione **Interpretar texto**.
4. Nome, CNPJ e total são preenchidos a partir do texto. Informe a data manualmente.
5. O RIP verifica automaticamente os campos, a contagem de itens quando informada e os valores. Ajuste somente as pendências destacadas e selecione **Salvar compra**; se faltar informação, use **Salvar rascunho**. Não há declaração obrigatória de revisão manual.

Interpretar novamente o mesmo texto não altera a lista. Um texto atualizado substitui os itens, sem acrescentar outra cópia; há confirmação quando existem alterações manuais que seriam perdidas. Se não houver produtos reconhecidos, os itens anteriores são preservados. Alterações no texto exigem nova interpretação antes de confirmar. O texto original, o último texto interpretado e as correções salvas acompanham a compra.

## Unidades e cálculos

Unidades reconhecidas são normalizadas: KG9 → KG; UND/UND8/UND9 → UN; PCT8/PCT9 → PCT; BDJ9 → BDJ; FRC9 → FRC. Outros aliases usuais de massa, volume, embalagens e dimensões também são aceitos. M2/M3 são preservados; números arbitrários de códigos desconhecidos não são removidos. O campo `unitRaw` preserva o valor original. Unidades desconhecidas ficam vazias e sinalizadas para revisão.

Preços e totais devem ter separador decimal legível. O parser não adivinha vírgulas ou dígitos e não altera valores para fazer o total coincidir. CNPJ numérico é sugerido somente quando seus dígitos verificadores conferem. Desconto de item não deve ser repetido no desconto geral. A validação admite arredondamento de um centavo por linha; a diferença final deve ser exatamente zero. A contagem informada no texto também deve corresponder à lista, mesmo se os valores fecharem. Produtos iguais em linhas diferentes são legítimos: não são excluídos nem geram alerta de duplicação por semelhança.

## Site e arquivo HTML

A Vercel publica a versão estática. O texto é interpretado no navegador, sem requisições a APIs e sem carregar bibliotecas de terceiros. Depois de abrir a página, a interpretação e a edição funcionam sem conexão; reabrir/recarregar o site ainda depende de acesso à hospedagem.

O arquivo `RIP.html` usa a mesma interface e pode ser aberto no Chrome/Edge. Os dados ficam no IndexedDB do navegador, não dentro do HTML nem em um banco na nuvem. Não há sincronização entre dispositivos. Use **Exportar backup** regularmente; trocar de origem, navegador, perfil ou limpar dados pode tornar o histórico indisponível. Para migrar do HTML ao site, exporte nele e importe no site.

O banco IndexedDB mantém o mesmo nome e versão das versões anteriores. Compras e anexos antigos não são apagados. Os backups antigos continuam importáveis; imagens históricas são preservadas na exportação/importação, mas não existe mais entrada ou processamento de novas imagens.

## Publicar na Vercel

Conecte `Almjr25/RIP`, branch `main`. Use **Framework: Other**, **Root Directory: raiz do repositório**, sem overrides conflitantes. `vercel.json` define:

- Build: `node scripts/build_portable.mjs --vercel`
- Output: `dist`

Não são necessários Python, banco remoto, variáveis de ambiente nem dependências npm para o site. `.vercelignore` exclui o backend e os dados pessoais. Apenas `dist/index.html` e `dist/icon.svg` são publicados. Confirme em Deployments se o novo commit chegou a Ready.

## Desenvolvimento

Node 20+ gera os artefatos; não é necessário para usar o app:

```sh
node scripts/build_portable.mjs
node scripts/build_portable.mjs --vercel
node tests/receipt.test.js
node tests/validation.test.js
```

Backend local opcional: Python 3.12+ e SQLite da biblioteca padrão, sem instalar pacotes:

```sh
python3 server.py
python3 -m unittest discover -s tests -v
```

A porta padrão é 8000, bind local. `PORT`, `RIP_HOST` e `RIP_DATA_DIR` são opcionais. `.data/` contém dados pessoais; preserve-o para backup e não o versione. A variante Python é individual e não deve ser exposta publicamente sem autenticação e HTTPS.

`sh scripts/setup.sh` executa os testes e gera as variantes HTML/Vercel. `python3 tests/text_smoke.py` requer Playwright e Chromium e valida o fluxo do build estático com banco temporário do navegador, incluindo backups e compras antigas. `RIP_TEST_BACKEND=1 python3 tests/text_smoke.py` valida a variante SQLite. O Chromium gerenciado do ambiente bloqueia `file://`, portanto o HTML é testado por um servidor somente de arquivos estáticos.

## Validação automática e ajustes

Itens válidos aparecem em linhas compactas; seus campos podem ser abertos para consulta ou edição. Campos ausentes ou inconsistentes são destacados e abertos automaticamente. A seção opcional de descontos/acréscimos gerais fica recolhida quando está zerada, e abre quando o texto informa ajustes. Rótulos explícitos de desconto de item e ajustes gerais são interpretados separadamente; valores não são inventados pela diferença entre soma e total. Descontos já presentes no total líquido do item não devem ser repetidos como desconto geral. Ajustes manuais são preservados ao interpretar novamente.

A compra é salva quando os dados obrigatórios, quantidades, valores e contagem estiverem válidos. A API local e o adaptador de armazenamento verificam essas condições independentemente da interface. O campo legado reviewed não é mais exigido; histórico, textos originais, normalização de unidades e backups continuam preservados.
