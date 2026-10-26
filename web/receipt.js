/* Parser de cupons: preserva valores observados, nunca inventa um total para fechar a conta. */
(function(root){
  const money = /\d+(?:\.\d{3})*[,.]\d{2}(?!\d)/g;
  const quantity = /\b(?:Qtde|Qtd|Qide|Qlde|Otde)\s*[.:;]*\s*(\d+(?:[.,]\d+)?)\b/i;
  const code = /[([]?\s*C[oó0]d(?:igo)?\s*[.:;]\s*([^\s)\]]+)\s*[)\]]?/i;
  const price = /\bV[lI1!][.,]?\s*Unit[.,]?\s*[:;]?\s*(\d+(?:[.,]\d{2,4})?)/i;
  const totalLabel = /\bV[lI1!][.,]?\s*Total\s*[:;]?/ig;
  const unit = /\bUN\s*[:;]\s*(KG|UND|UN|LT|ML|PC|L|G)\b/i;
  const normalizeMoney = value => {if(!value)return '';return value.includes(',')?value:value.replace(/\.(\d{2,4})$/,',$1')};
  const footer = /(?:[QO]t[de.]*\s*\.?\s*total\s+de\s+itens|Valor\s+a\s+pagar|Forma\s+de\s+pagamento|Informa[çc][õo]es\s+gerais|EMISS[ÃA]O\s+NORMAL|Chave\s+de\s+acesso)/i;
  function parse(text, source){
    text=String(text||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
    const lines=text.split('\n').map(x=>x.replace(/[ \t]+/g,' ').trim()).filter(Boolean);
    const end=lines.findIndex(x=>footer.test(x));
    const body=end<0?lines:lines.slice(0,end);
    const items=[], warnings=[];
    const make=(description,q,u,p,t,raw,productCode='')=>({id:globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random(),description,quantity:q||'',unit:u||'',unitPrice:normalizeMoney(p),discount:'0,00',total:normalizeMoney(t),source,rawText:raw,productCode});
    // Layout compacto que já era suportado, sem exigir que o usuário o produza.
    const compact=/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(KG|UN|UND|L|LT|G|ML|PC)?\s*[xX×]\s*(\d+(?:\.\d{3})*[,.]\d{2})\s*(?:=|\s)\s*(\d+(?:\.\d{3})*[,.]\d{2})\s*$/i;
    const used=new Set();
    body.forEach((line,n)=>{const m=line.match(compact);if(m&&m[1].trim()){items.push(make(m[1].trim(),m[2],(m[3]||'').toUpperCase(),m[4],m[5],line));used.add(n)}});
    let starts=body.flatMap((line,n)=>code.test(line)?[n]:[]);
    // Código em linha separada: mantenha a descrição que o antecede.
    starts=starts.map(n=>body[n].replace(code,'').replace(totalLabel,'').trim()?n:Math.max(0,n-1));
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
      const qm=block.match(quantity),pm=block.match(price),um=block.match(unit),cm=block.match(code);
      let desc=body[start].replace(code,'').replace(totalLabel,'').split(quantity)[0].trim();
      desc=desc.replace(/\s+\d+[,.]\d{2}\s*$/,'').trim();
      if(!desc||(!qm&&!cm))return;
      const tokens=[...block.matchAll(money)].filter(m=>{
        const a=m.index,b=a+m[0].length;
        if(qm&&a>=qm.index&&b<=qm.index+qm[0].length)return false;
        if(pm&&a>=pm.index&&b<=pm.index+pm[0].length)return false;
        // Números na descrição não são totais do item.
        return a>=(cm?cm.index+cm[0].length:(qm?qm.index:desc.length));
      });
      const total=tokens.length?tokens[tokens.length-1][0]:'';
      const item=make(desc,qm?.[1],um?.[1]?.toUpperCase(),pm?.[1],total,block,cm?.[1]||'');
      if(!item.quantity||!item.unit||!item.unitPrice||!item.total)warnings.push(`Confira os campos incompletos de “${desc}”.`);
      items.push(item);
    });
    const tail=end<0?'':lines.slice(end).join('\n');
    const receiptTotal=tail.match(/Valor\s+a\s+pagar\s*(?:R\s*\$|RS|R5)?\s*[:;]?\s*(\d+(?:\.\d{3})*[,.]\d{2})/i)?.[1]||'';
    const count=text.match(/[QO]t[de.]*\s*\.?\s*total\s+de\s+itens\s*[:;]?\s*(\d+)/i)?.[1];
    if(count&&+count!==items.length)warnings.push(`O cupom informa ${count} itens; foram reconstruídos ${items.length}. Confira as imagens e possíveis cortes.`);
    if(!items.length)warnings.push('O texto foi lido, mas os blocos de produto não foram identificados. Corrija o texto abaixo e selecione “Reconstruir itens deste texto”, ou adicione os itens manualmente.');
    return {items,receiptTotal:normalizeMoney(receiptTotal),expectedCount:count?+count:null,warnings};
  }
  root.ReceiptParser={parse};
  if(typeof module!=='undefined')module.exports={parse};
})(globalThis);
