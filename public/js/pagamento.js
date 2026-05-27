function copiarPix() {
  const codigo = document.getElementById('codigoPix').textContent;
  navigator.clipboard.writeText(codigo).then(() => {
    alert('Código PIX copiado!');
  }).catch(() => {
    alert('Falha ao copiar o código PIX.');
  });
}

function getPaymentMethod() {
  const cartaoForm = document.querySelector('.cartao-form');
  const dinheiroCheck = document.getElementById('dinheiroCheckbox');
  if (cartaoForm && document.activeElement && cartaoForm.contains(document.activeElement)) return 'cartao';
  if (dinheiroCheck && dinheiroCheck.checked) return 'dinheiro';
  return 'pix';
}

function finalizarPagamento() {
  const servicos = JSON.parse(localStorage.getItem('servicosSelecionados') || '[]');
  const total = parseFloat(localStorage.getItem('valorTotal') || '0');
  const colaboradorId = parseInt(localStorage.getItem('colaboradorId') || '0');
  const paymentMethod = getPaymentMethod();

  if (!colaboradorId || !servicos.length) {
    alert('Erro: dados do pedido não encontrados.');
    return;
  }

  const btn = document.querySelector('.btn-finalizar');
  if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

  fetch('/pedido/criar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ colaborador_id: colaboradorId, servicos: servicos, payment_method: paymentMethod })
  }).then(r => r.json()).then(data => {
    if (data.pedido_id) {
      localStorage.removeItem('servicosSelecionados');
      localStorage.removeItem('valorTotal');
      localStorage.removeItem('colaboradorNome');
      localStorage.removeItem('colaboradorId');
      window.location.href = '/pedido/' + data.pedido_id + '/confirmacao';
    } else {
      alert('Erro ao processar pedido: ' + (data.error || 'Erro desconhecido'));
      if (btn) { btn.disabled = false; btn.textContent = 'Finalizar pedido'; }
    }
  }).catch(() => {
    alert('Erro de conexão. Tente novamente.');
    if (btn) { btn.disabled = false; btn.textContent = 'Finalizar pedido'; }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  const raw = localStorage.getItem('servicosSelecionados') || '[]';
  let servicos = [];
  try { servicos = JSON.parse(raw); } catch(e) {}

  const total = localStorage.getItem('valorTotal');
  const colabNome = localStorage.getItem('colaboradorNome') || '';

  const listaEl = document.getElementById('servicos-lista');
  const totalEl = document.getElementById('total-valor');

  if (listaEl) {
    if (servicos.length) {
      if (typeof servicos[0] === 'object') {
        listaEl.textContent = colabNome ? colabNome + ': ' : '';
        listaEl.textContent += servicos.map(s => s.nome).join(', ');
      } else {
        listaEl.textContent = servicos.join(', ');
      }
    } else {
      listaEl.textContent = 'Nenhum serviço selecionado';
    }
  }

  if (totalEl) {
    totalEl.textContent = total ? (Number(total).toFixed(2).replace('.', ',')) : '0,00';
  }
});
