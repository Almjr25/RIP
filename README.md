# RIP — Rastreador de Inflação Pessoal

Primeira versão para registrar compras de supermercado a partir de uma ou várias capturas de tela. OCR gratuito com Tesseract no servidor, revisão humana, conferência de totais e persistência SQL (SQLite). Não usa APIs externas para ler imagens.

## Versão desktop em um HTML

Baixe `RIP.html` e abra com Chrome ou Edge no computador, sem instalar Python ou iniciar servidor. Esta versão adapta a mesma interface para armazenamento no IndexedDB do navegador e OCR local com Tesseract.js. Para OCR, mantenha acesso à internet: biblioteca, worker, WebAssembly e modelo português são baixados de `cdn.jsdelivr.net`. As compras e imagens não são enviadas ao CDN. O preenchimento manual e a revisão não precisam do OCR.

Use **Exportar backup** regularmente. O arquivo JSON contém compras e imagens e pode ser restaurado por **Importar backup**. O HTML sozinho não contém seu histórico. O armazenamento depende do navegador, do perfil e de como ele trata arquivos locais; mover ou renomear o HTML, trocar de navegador, usar modo anônimo ou limpar dados pode tornar o histórico indisponível. Faça backup antes dessas mudanças. Não abra duas edições simultâneas da mesma compra em abas diferentes.

Para regerar após alterar a interface: `python3 scripts/build_portable.py`. O teste `tests/portable_smoke.py` abre o HTML em um servidor **somente de arquivos estáticos**, sem API de aplicação: o Chromium gerenciado do ambiente bloqueia `file://` por política. A abertura direta por duplo clique precisa ser confirmada no navegador do usuário.

### Leitura e conferência (desktop 0.2)

O usuário não precisa produzir um texto em formato especial. O leitor aceita blocos de produto com código, `Qtde.`, `UN`, `Vl. Unit.` e total na coluna direita, inclusive quando `Vl. Total` aparece ao lado do nome antes da quantidade. A captura é ampliada e tem o contraste ajustado antes do OCR; a imagem original é preservada. Valores ausentes ficam para revisão, sem preencher o total pelo resultado de quantidade × preço. O total geral identificado é apenas uma sugestão e exige conferência.

Se nenhum item aparecer, abra **Imagem …: conferir texto e reconstruir**, corrija caracteres ilegíveis no campo de texto e selecione **Reconstruir itens deste texto**. Também é possível **Reler imagem com OCR** ou adicionar itens manualmente. A reconstrução substitui somente os itens daquela imagem, mediante confirmação quando houver itens existentes; não apaga os de outras imagens nem duplica silenciosamente. Se nenhum bloco for encontrado, os itens anteriores são preservados. O texto original e o texto corrigido são guardados separadamente nos rascunhos e backups.

Após a extração, confira os itens, preencha estabelecimento e data e verifique a diferença em relação ao total do cupom. Avisos por item mostram campos ausentes ou contas inconsistentes. Marque a revisão e confirme somente quando os dados estiverem corretos.

Testes: `node tests/receipt.test.js` valida oito cenários do parser. `python3 tests/column_ocr_smoke.py` usa OCR real em uma captura sintética anônima no layout de colunas (10 itens, R$ 151,28), verifica reconstrução sem duplicação e confirmação persistida. Esses testes não usam a imagem original do usuário e não garantem precisão em qualquer captura.

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
