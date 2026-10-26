/* Validação estrutural da chave NFC-e. Não consulta nem autentica documentos na SEFAZ. */
(function(root){
 const states=new Set(['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29','31','32','33','35','41','42','43','50','51','52','53']);
 function normalize(value){const text=String(value??'').trim();return /^[\d\s.-]*$/.test(text)?text.replace(/\D/g,''):text}
 function digit(base){let weight=2,sum=0;for(let n=base.length-1;n>=0;n--){sum+=Number(base[n])*weight;weight=weight===9?2:weight+1}const remainder=sum%11;return String(remainder<2?0:11-remainder)}
 function inspect(value){
  const key=normalize(value),fail=message=>({valid:false,key,message,authenticity:'not_checked'});
  if(!key)return fail('Informe a chave de acesso da NFC-e para registrar a nota.');
  if(!/^\d{44}$/.test(key))return fail('A chave de acesso deve conter 44 dígitos. Espaços, pontos e hífens de formatação são aceitos.');
  if(!states.has(key.slice(0,2)))return fail('A chave contém um código de estado inválido.');
  if(Number(key.slice(4,6))<1||Number(key.slice(4,6))>12)return fail('O mês de emissão da chave é inválido.');
  if(key.slice(20,22)!=='65')return fail('A chave deve pertencer a uma NFC-e, modelo 65.');
  if(!root.ReceiptParser.validCNPJ(key.slice(6,20)))return fail('O CNPJ do emitente contido na chave é inválido.');
  if(digit(key.slice(0,43))!==key[43])return fail('O dígito verificador da chave não confere. Copie novamente da consulta.');
  return {valid:true,key,cnpj:key.slice(6,20),state:key.slice(0,2),yearMonth:key.slice(2,6),model:'65',authenticity:'not_checked'};
 }
 root.ReceiptFiscal={normalize,digit,inspect};
 if(typeof module!=='undefined')module.exports={normalize,digit,inspect};
})(globalThis);
