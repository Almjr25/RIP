/* Parser de cupons: preserva valores observados, nunca inventa um total para fechar a conta. */
(function(root){
  const money = /(?<![\d.,/])\d+(?:\.\d{3})*[,.]\d{1,2}(?![\d.,/])/g;
  const quantity = /\b(?:Qtde|Qtd|Qide|Qlde|Otde)\s*[.:;]*\s*(\d+(?:[.,]\d+)?)\b/i;
  const code = /[([]?\s*C[oó0]d(?:igo)?\s*[.:;]\s*([^\s)\]]+)\s*[)\]]?/i;
  // O rótulo pode vir colado à unidade (ex.: UND9VI. Unit.).
  // Sem separador decimal, 759 não é transformado em 7,59 nem aceito como R$ 759.
  const price = /V[lI1!]{1,2}[.,]?\s*Unit[.,]?\s*[:;]?\s*(\d+(?:\.\d{3})*[,.]\d{1,4})(?![\d.,/])/i;
  const totalLabel = /\bV[lI1!]{1,2}[.,]?\s*Total\s*[:;]?/ig;
  const unit = /\bUN\s*[:;]\s*([A-Z0-9./%-]{1,16}?)(?=\s*V[lI1!]{1,2}[.,]?\s*Unit|\s|$)/i;
  const unitAliases={
    UN:'UN',UND:'UN',UNID:'UN',UNIDADE:'UN',UNIDADES:'UN',
    KG:'KG',KGS:'KG',QUILO:'KG',QUILOS:'KG',G:'G',GR:'G',GRAMA:'G',MG:'MG',
    L:'L',LT:'L',LTS:'L',LITRO:'L',LITROS:'L',ML:'ML',
    PCT:'PCT',PCTE:'PCT',PAC:'PCT',PACOTE:'PCT',CX:'CX',CAIXA:'CX',FD:'FD',FARDO:'FD',
    BDJ:'BDJ',BANDEJA:'BDJ',FRC:'FRC',FR:'FRC',FRASCO:'FRC',
    PC:'PC',PCS:'PC',PAR:'PAR',DZ:'DZ',DUZIA:'DZ',SC:'SC',SACO:'SC',
    RL:'RL',ROLO:'RL',M:'M',M2:'M2',M3:'M3',CM:'CM',MM:'MM',GAL:'GAL'
  };
  function normalizeUnit(value){
    const raw=String(value||'').trim(),key=raw.toUpperCase().replace(/\.$/,'');
    // Primeiro reconheça códigos legítimos com números, como M2 e M3.
    if(Object.hasOwn(unitAliases,key))return {raw,value:unitAliases[key],method:key===unitAliases[key]?'exact':'alias'};
    // Sufixos 8/9 observados nos cupons. Não remova números arbitrários de códigos desconhecidos.
    const base=key.replace(/[89]$/,'');
    if(base!==key&&Object.hasOwn(unitAliases,base))return {raw,value:unitAliases[base],method:'suffix'};
    return {raw,value:'',method:'unknown'};
  }
  const normalizeMoney = value => {if(!value)return '';const normalized=value.includes(',')?value:value.replace(/\.(\d{1,4})$/,',$1');return normalized.replace(/,(\d)$/,(_,digit)=>','+digit+'0')};
  const stripTotalLabel=(line,next='')=>{
    let cleaned=line.replace(totalLabel,'');
    if(/^Total\b/i.test(next.trim()))cleaned=cleaned.replace(/\bV[lI1!]{1,2}[.,]?\s*$/i,'');
    return cleaned;
  };
  const footer = /(?:[QO]t[de.]*\s*\.?\s*total\s+de\s+itens|Valor\s+total\s*R\s*\$|Valor\s+a\s+pagar|Forma\s+de\s+pagamento|Informa[çc][õo]es\s+gerais|EMISS[ÃA]O\s+NORMAL|Chave\s+de\s+acesso)/i;
  const amountPattern='(\\d+(?:\\.\\d{3})*[,.]\\d{1,2})(?![\\d.,/])';
  function discountMatch(text){return text.match(new RegExp('(?:\\bDescontos?(?:\\s+(?:do\\s+item|geral|total))?|\\bVl[.,]?\\s*Desc[.,]?)\\s*(?:R\\s*\\$)?\\s*[:;]?\\s*'+amountPattern,'i'))}
  function validCNPJ(value){
    const digits=String(value||'').replace(/\D/g,'');
    if(digits.length!==14||/^(\d)\1+$/.test(digits))return false;
    const check=part=>{let weight=part.length-7,sum=0;for(const digit of part){sum+=Number(digit)*weight;weight=weight===2?9:weight-1}const mod=sum%11;return String(mod<2?0:11-mod)};
    return digits[12]===check(digits.slice(0,12))&&digits[13]===check(digits.slice(0,13));
  }
  function formatCNPJ(value){return String(value).replace(/\D/g,'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')}
  function establishment(lines){
    const firstItem=lines.findIndex(line=>code.test(line)||quantity.test(line)||footer.test(line)||/\b\d+(?:[.,]\d+)?\s*(?:KG|UN|L|LT|G|ML|PC)?\s*[xX×]\s*\d/.test(line));
    const header=lines.slice(0,firstItem<0?Math.min(lines.length,12):firstItem);
    const marker=/\bC\s*N\s*P\s*(?:J|I|\)|\])\s*[:.;-]?/i;
    const index=header.findIndex(line=>marker.test(line));
    if(index<0)return {store:'',cnpj:'',cnpjWarning:''};
    const line=header[index],m=line.match(marker);
    const tail=line.slice(m.index+m[0].length).trim()||header[index+1]||'';
    const raw=tail.match(/^((?:\d[ ./-]*){13}\d)(?![ ./-]*\d)/)?.[1]||'';
    const cnpj=validCNPJ(raw)?formatCNPJ(raw):'';
    const inline=line.slice(0,m.index).trim();
    const candidates=inline?[inline]:header.slice(0,index).reverse();
    const store=candidates.find(name=>/[A-Za-zÀ-ÿ]/.test(name)&&!/(?:DANFE|NFC-?e|documento auxiliar|consulta|nota fiscal|consumidor|https?:|^\s*CPF\b)/i.test(name))||'';
    return {store,cnpj,cnpjWarning:cnpj?'':'O CNPJ do cabeçalho não pôde ser validado. Confira o texto da nota e preencha o campo se estiver legível.'};
  }
  function parse(text, source){
    text=String(text||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
    const lines=text.split('\n').map(x=>x.replace(/[ \t]+/g,' ').trim()).filter(Boolean);
    const end=lines.findIndex(x=>footer.test(x));
    const body=end<0?lines:lines.slice(0,end);
    const items=[], warnings=[];
    const make=(description,q,u,p,t,raw,productCode='')=>{
      const normalized=normalizeUnit(u);
      return {id:globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random(),description,quantity:q||'',unit:normalized.value,unitRaw:normalized.raw,unitNormalization:normalized.method,unitPrice:normalizeMoney(p),discount:'0,00',total:normalizeMoney(t),source,rawText:raw,productCode};
    };
    // Layout compacto que já era suportado, sem exigir que o usuário o produza.
    const compact=/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(KG|UN|UND|L|LT|G|ML|PC)?\s*[xX×]\s*(\d+(?:\.\d{3})*[,.]\d{2})\s*(?:=|\s)\s*(\d+(?:\.\d{3})*[,.]\d{2})\s*$/i;
    const used=new Set();
    body.forEach((line,n)=>{const m=line.match(compact);if(m&&m[1].trim()){items.push(make(m[1].trim(),m[2],(m[3]||'').toUpperCase(),m[4],m[5],line));used.add(n)}});
    let starts=body.flatMap((line,n)=>code.test(line)?[n]:[]);
    // Código em linha separada: mantenha a descrição que o antecede.
    starts=starts.map(n=>stripTotalLabel(body[n].replace(code,''),body[n+1]).trim()?n:Math.max(0,n-1));
    if(!starts.length){
      starts=body.flatMap((line,n)=>quantity.test(line)&&!/total\s+de\s+itens/i.test(line)?[n]:[]).map(n=>{
        const before=body[n].slice(0,body[n].search(quantity)).replace(totalLabel,'').trim();
        return before?n:Math.max(0,n-1);
      });
    }
    starts=[...new Set(starts)];
    starts.forEach((start,n)=>{
      const stop=starts[n+1]??body.length;
      if(used.has(start))return;
      const block=body.slice(start,stop).join('\n');
      const qm=block.match(quantity),pm=block.match(price),um=block.match(unit),cm=block.match(code),dm=discountMatch(block);
      let desc=stripTotalLabel(body[start].replace(code,''),body[start+1]).split(quantity)[0].trim();
      desc=desc.replace(/\s+\d+[,.]\d{2}\s*$/,'').trim();
      if(!desc||(!qm&&!cm))return;
      const tokens=[...block.matchAll(money)].filter(m=>{
        const a=m.index,b=a+m[0].length;
        if(qm&&a>=qm.index&&b<=qm.index+qm[0].length)return false;
        if(pm&&a>=pm.index&&b<=pm.index+pm[0].length)return false;
        if(dm&&a>=dm.index&&b<=dm.index+dm[0].length)return false;
        // Números na descrição não são totais do item.
        return a>=(cm?cm.index+cm[0].length:(qm?qm.index:desc.length));
      });
      const total=tokens.length?tokens[tokens.length-1][0]:'';
      const item=make(desc,qm?.[1],um?.[1]?.toUpperCase(),pm?.[1],total,block,cm?.[1]||'');
      if(dm)item.discount=normalizeMoney(dm[1]);
      if(item.unitRaw&&!item.unit)warnings.push(`Unidade “${item.unitRaw}” não reconhecida em “${desc}”. Confira o texto da nota e informe uma unidade válida.`);
      if(!item.quantity||!item.unit||!item.unitPrice||!item.total)warnings.push(`Confira os campos incompletos de “${desc}”.`);
      if(!item.unitPrice&&/V[lI1!]{1,2}[.,]?\s*Unit/i.test(block))warnings.push(`O preço unitário de “${desc}” não tem uma leitura decimal segura. Confira a vírgula no texto; o RIP não adivinha casas decimais.`);
      items.push(item);
    });
    const tail=end<0?'':lines.slice(end).join('\n');
    const receiptTotal=tail.match(/Valor\s+a\s+pagar\s*(?:R\s*\$|RS|R5)?\s*[:;]?\s*(\d+(?:\.\d{3})*[,.]\d{2})/i)?.[1]||'';
    const count=text.match(/[QO]t[de.]*\s*\.?\s*total\s+de\s+itens\s*[:;]?\s*(\d+)/i)?.[1];
    if(count&&+count!==items.length)warnings.push(`O texto informa ${count} itens; foram importados ${items.length}. A cópia pode estar incompleta.`);
    if(!items.length)warnings.push('O texto foi lido, mas os blocos de produto não foram identificados. Inclua todos os campos da nota e selecione Interpretar texto, ou adicione os itens manualmente.');
    const merchant=establishment(lines);
    if(merchant.cnpjWarning)warnings.push(merchant.cnpjWarning);
    const globalDiscount=discountMatch(tail);
    const globalExtra=tail.match(new RegExp('\\bAcr[eé]scimos?(?:\\s+(?:gerais|geral|total))?\\s*(?:R\\s*\\$)?\\s*[:;]?\\s*'+amountPattern,'i'));
    return {items,receiptTotal:normalizeMoney(receiptTotal),expectedCount:count?+count:null,warnings,store:merchant.store,cnpj:merchant.cnpj,discount:globalDiscount?normalizeMoney(globalDiscount[1]):undefined,extra:globalExtra?normalizeMoney(globalExtra[1]):undefined};
  }
  root.ReceiptParser={parse,validCNPJ,formatCNPJ,normalizeUnit};
  if(typeof module!=='undefined')module.exports={parse,validCNPJ,formatCNPJ,normalizeUnit};
})(globalThis);
