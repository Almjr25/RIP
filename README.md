# RIP — Rastreador de Inflação Pessoal

Primeira versão para registrar compras de supermercado a partir de uma ou várias capturas de tela. OCR gratuito com Tesseract no servidor, revisão humana, conferência de totais e persistência SQL (SQLite). Não usa APIs externas para ler imagens.

## Publicação estática na Vercel

Importe `Almjr25/RIP` pelo GitHub. Nas configurações do projeto, use **Framework Preset: Other**, **Root Directory: raiz do repositório** (não `web`), branch de produção `main`. Remova overrides antigos de build/output/install para respeitar `vercel.json`. O build é `node scripts/build_portable.mjs --vercel` e a pasta publicada é `dist`. Não são necessárias variáveis, credenciais de OCR, Python, banco remoto ou dependências npm.

O build recompõe a interface a partir dos fontes atuais, sem depender do HTML pré-gerado estar atualizado. O arquivo `.vercelignore` exclui o backend Python e os dados pessoais do envio. Apenas `dist/index.html` e `dist/icon.svg` são publicados; arquivos pessoais em `.data/` e fontes do servidor não fazem parte do site. O comando `node scripts/build_portable.mjs` gera o HTML desktop; Node 20+ é necessário para gerar os artefatos, não para usar o app.

Após o push, confirme em **Deployments** se o commit mais recente chegou a **Ready** e foi associado ao domínio de produção. Se o projeto foi configurado com outra pasta ou comandos manuais, ajuste-os e execute **Redeploy**. Teste abrir a página, importar uma captura e confirmar uma compra. O OCR continua no navegador e requer conexão para carregar os componentes. O site ainda não sincroniza dados entre dispositivos. Para migrar do HTML, exporte um backup nele e importe no site; os armazenamentos são separados por origem.

## Versão desktop em um HTML

Baixe `RIP.html` e abra com Chrome ou Edge no computador, sem instalar Python ou iniciar servidor. Esta versão adapta a mesma interface para armazenamento no IndexedDB do navegador e OCR local com Tesseract.js. Para OCR, mantenha acesso à internet: biblioteca, worker, WebAssembly e modelo português são baixados de `cdn.jsdelivr.net`. As compras e imagens não são enviadas ao CDN. O preenchimento manual e a revisão não precisam do OCR.

Use **Exportar backup** regularmente. O arquivo JSON contém compras e imagens e pode ser restaurado por **Importar backup**. O HTML sozinho não contém seu histórico. O armazenamento depende do navegador, do perfil e de como ele trata arquivos locais; mover ou renomear o HTML, trocar de navegador, usar modo anônimo ou limpar dados pode tornar o histórico indisponível. Faça backup antes dessas mudanças. Não abra duas edições simultâneas da mesma compra em abas diferentes.

Para regerar após alterar a interface: `python3 scripts/build_portable.py`. O teste `tests/portable_smoke.py` abre o HTML em um servidor **somente de arquivos estáticos**, sem API de aplicação: o Chromium gerenciado do ambiente bloqueia `file://` por política. A abertura direta por duplo clique precisa ser confirmada no navegador do usuário.

### Leitura e conferência (desktop 0.2)

O usuário não precisa produzir um texto em formato especial. O leitor aceita blocos de produto com código, `Qtde.`, `UN`, `Vl. Unit.` e total na coluna direita, inclusive quando `Vl. Total` aparece ao lado do nome antes da quantidade. A captura é ampliada e tem o contraste ajustado antes do OCR; a imagem original é preservada. Valores ausentes ficam para revisão, sem preencher o total pelo resultado de quantidade × preço. O total geral identificado é apenas uma sugestão e exige conferência.

Se nenhum item aparecer, abra **Imagem …: conferir texto e reconstruir**, corrija caracteres ilegíveis no campo de texto e selecione **Reconstruir itens deste texto**. Também é possível **Reler imagem com OCR** ou adicionar itens manualmente. A reconstrução substitui somente os itens daquela imagem, mediante confirmação quando houver itens existentes; não apaga os de outras imagens nem duplica silenciosamente. Se nenhum bloco for encontrado, os itens anteriores são preservados. O texto original e o texto corrigido são guardados separadamente nos rascunhos e backups.

Após a extração, confira os itens, preencha estabelecimento e data e verifique a diferença em relação ao total do cupom. Avisos por item mostram campos ausentes ou contas inconsistentes. Marque a revisão e confirme somente quando os dados estiverem corretos.

Testes: `node tests/receipt.test.js` valida cenários do parser. `python3 tests/column_ocr_smoke.py` usa OCR real em uma captura sintética anônima no layout de colunas (10 itens, R$ 151,28), verifica reconstrução sem duplicação e confirmação persistida. Esses testes não usam a imagem original do usuário e não garantem precisão em qualquer captura.

## Executar

Requisitos: Python 3.12+, Tesseract 5 e modelo de idioma português. Linux: pacote `tesseract-ocr` (o modelo português pode ser instalado com `tesseract-ocr-por`).

```sh
cd /workspace/RIP
python3 -m venv .data/venv --system-site-packages
.data/venv/bin/python -m pip install -r requirements.txt
.data/venv/bin/python server.py
```

O servidor usa a porta 8000, ligado apenas à interface local por padrão. `PORT`, `RIP_HOST` e `RIP_DATA_DIR` são opcionais. Não publique este servidor na internet: esta versão é de uso individual, sem autenticação nem isolamento entre usuários. Um deploy público exige autenticação, HTTPS, proteção contra abuso e política de retenção.

O OCR usa `.data/tessdata/por.traineddata` quando disponível; senão usa inglês do sistema. Para instalar o modelo português nesse caminho, obtenha `por.traineddata` da versão 4.1.0 do repositório oficial `tesseract-ocr/tessdata_fast`. Não substitua modelos sem validar sua origem.

## Usar

1. Consulte a NFC-e pelo QR code no seu navegador e faça capturas incluindo todas as linhas e o total.
2. Adicione todas as imagens. Reordene ou remova antes de extrair. Capturas sobrepostas são aceitas.
3. Selecione **Extrair dados das imagens**. Novas imagens podem ser acrescentadas e processadas sem sobrescrever itens já corrigidos.
4. Confira o texto extraído e as imagens de origem. O parser é conservador: propõe linhas que reconhece com quantidade, preço e total na mesma linha, além de um formato com campos rotulados (Qtde., UN, Vl. Unit. e Vl. Total). Outros layouts exigem preenchimento manual nesta versão. Repetições são sinalizadas, nunca apagadas automaticamente.
5. Informe estabelecimento, data, total do cupom e ajustes gerais. O total de cada item deve estar líquido do desconto do item. Não repita descontos de item no desconto geral.
6. Salve um rascunho ou confirme após revisar. A API também valida quantidades, preços, descontos e totais. Tolerância de um centavo por linha para arredondamento; a diferença final precisa ser exatamente zero.

Capturas muito extensas devem ser divididas (15 MB por imagem no app, até 40 megapixels). Imagens, texto extraído, compras e versões anteriores das correções ficam em `.data/`. Preserve esse diretório para backup; ele contém dados pessoais e não deve ser versionado. A associação a um catálogo padronizado de produtos, gráficos e indicadores fica para uma próxima versão; o registro original por item já é preservado.

## PWA e limites

Manifesto e service worker permitem usar a interface como app em navegadores compatíveis, com instalação dependente de HTTPS/ambiente local e do navegador. O shell pode abrir offline após o primeiro acesso; OCR, consulta e gravação exigem conexão com o servidor. Não há sincronização offline nesta versão. Não há consulta automática à SEFAZ, OCR infalível, edição colaborativa ou exclusão pela interface. A chave fiscal opcional evita duplicidade quando preenchida; sem chave, a conferência de duplicatas é manual.

## Validar

```sh
python3 -m unittest discover -s tests -v
```

Para repetir toda a preparação neste ambiente, execute `sh scripts/setup.sh`. Ele valida o checksum do modelo português e executa os testes de cálculo. O teste funcional opcional `python3 tests/browser_smoke.py` requer Playwright e Chromium; usa um banco temporário e verifica importação de duas imagens, OCR, bloqueio de divergência, rascunho, confirmação, persistência e layout móvel.

O SQLite contém tabelas de compras, itens e imagens de cada compra, com totais e descontos em centavos; quantidades e preços unitários são preservados como texto decimal para não perder casas de precisão. O documento completo e o histórico de correções também são retidos. Os rascunhos aceitam capturas ainda não processadas; o OCR só começa por comando explícito.

O teste de OCR deve ser feito também com capturas reais dos portais utilizados: desempenho em imagem sintética não comprova precisão em cupons reais.

### Estabelecimento automático

O cabeçalho do OCR preenche nome e CNPJ numérico do estabelecimento, mantendo ambos editáveis e sem sobrescrever campos já preenchidos. O CNPJ só é sugerido quando seus dígitos verificadores conferem; se estiver ilegível ou inválido, fica vazio com aviso para conferência. O campo é opcional para preservar compras antigas e capturas sem cabeçalho. A data permanece manual. Esses dados acompanham compras, rascunhos e backups.

### Unidades comerciais e pontuação no OCR

O parser aceita códigos comerciais de unidade de até seis caracteres (como PCT, PCT9, UND9, CX e FD), sem convertê-los automaticamente para UN ou KG. Ele também lê o rótulo de preço quando está colado à unidade e separa Vl. Total quando há quebra de linha. Um valor como 15,9 é preservado numericamente como 15,90. Leituras ambíguas sem separador decimal, como 759, ou com barra, como 5/95, ficam em branco para conferência: o app não adivinha casas decimais para fechar o total.

Para aplicar essas regras a uma compra já extraída, abra o texto da imagem e use Reconstruir itens deste texto. O app pede confirmação antes de substituir os itens daquela imagem; salve um backup antes de reconstruir uma compra com correções manuais importantes.

### Possível confusão entre barra e 7

Em preços e totais com separador decimal preservado, o parser pode oferecer uma sugestão de trocar / por 7 (ex.: /,59 → 7,59). O campo não é preenchido automaticamente: o usuário confere a imagem e usa o botão de aceitação. O texto original e a sugestão aceita ficam preservados. Não há substituição global em datas, CNPJ, unidades ou códigos. Se também faltar a vírgula, como em 5/95, não há sugestão automática de valor.
