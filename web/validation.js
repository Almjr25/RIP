/* Verificações automáticas: dados obrigatórios, itens importados e conciliação. */
(function(root){
 function parts(value){
  let s=String(value??'').trim().replace(/R\$|\s/g,'');
  if(s.includes(','))s=s.replaceAll('.','').replace(',','.');
  if(!/^\d+(\.\d+)?$/.test(s)||s.length>24)return null;
  const [a,b='']=s.split('.');return [BigInt(a+b),10n**BigInt(b.length)];
 }
 const rounded=(n,d)=>Number((2n*n+d)/(2n*d));
 function cents(value){const p=parts(value);return p?rounded(p[0]*100n,p[1]):null}
 function lineTotal(quantity,price){const q=parts(quantity),p=parts(price);return q&&p?rounded(q[0]*p[0]*100n,q[1]*p[1]):null}
 function validate(p){
  const issues=[],items=p.items||[];
  const add=(field,message,index=null)=>issues.push({field,message,index});
  if(!String(p.store||'').trim())add('store','Informe o estabelecimento.');
  if(!p.date)add('date','Informe a data da compra.');
  else if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date)add('date','Informe uma data válida.');
  if(p.cnpj&&!root.ReceiptParser.validCNPJ(p.cnpj))add('cnpj','O CNPJ informado é inválido. Corrija-o ou deixe o campo vazio se não estiver disponível.');
  const text=p.receiptText||'';
  if((p.parsedText&&text!==p.parsedText)||(!p.parsedText&&text.trim()))add('receiptText','O texto foi alterado. Selecione Interpretar texto para atualizar os itens.');
  if(!items.length)add('items','Importe pelo menos um item.');
  let subtotal=0,validAmounts=true;
  items.forEach((i,index)=>{
   const q=parts(i.quantity),price=cents(i.unitPrice),discount=cents(i.discount??'0'),total=cents(i.total),gross=lineTotal(i.quantity,i.unitPrice);
   if(!String(i.description||'').trim())add('description','Descrição não identificada.',index);
   if(!q||q[0]<=0n)add('quantity','Quantidade ausente ou inválida.',index);
   if(!String(i.unit||'').trim())add('unit','Unidade não identificada. Escolha a unidade do produto.',index);
   if(price===null)add('unitPrice','Preço unitário ausente ou inválido.',index);
   if(discount===null)add('discount','Desconto do item inválido.',index);
   if(total===null){add('total','Total do item ausente ou inválido.',index);validAmounts=false}else subtotal+=total;
   if(gross!==null&&discount!==null&&total!==null&&(gross-discount<0||Math.abs(gross-discount-total)>1))add('calculation','Quantidade × preço − desconto não corresponde ao total líquido do item.',index);
  });
  const expected=p.analysis?.expectedCount;
  if(Number.isInteger(expected)&&items.length!==expected)add('count',`O texto informa ${expected} itens, mas a lista contém ${items.length}. Cole o cupom completo ou corrija a lista.`);
  const discount=cents(p.discount??'0'),extra=cents(p.extra??'0'),receiptTotal=cents(p.receiptTotal);
  if(discount===null)add('discount','Desconto geral inválido.');
  if(extra===null)add('extra','Acréscimo geral inválido.');
  if(receiptTotal===null)add('receiptTotal','O total da nota não foi identificado. Complete o texto ou informe o total.');
  const total=validAmounts&&discount!==null&&extra!==null?subtotal-discount+extra:null;
  const difference=total!==null&&receiptTotal!==null?total-receiptTotal:null;
  if(total!==null&&total<0)add('discount','O desconto geral é maior que o valor disponível.');
  if(difference!==null&&difference!==0)add('difference','A soma dos itens e ajustes difere do total da nota. Verifique texto incompleto, descontos ou acréscimos.');
  return {ready:!issues.length,issues,subtotal:validAmounts?subtotal:null,total,difference,expectedCount:expected??null,itemCount:items.length};
 }
 root.ReceiptValidation={validate,cents,lineTotal};
 if(typeof module!=='undefined')module.exports={validate,cents,lineTotal};
})(globalThis);
