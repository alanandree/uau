document.getElementById("confirmar").addEventListener("click", function() {
    const selecionados = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));
    const resumoDiv = document.getElementById("resumo");

    if (selecionados.length === 0) {
        resumoDiv.textContent = "Selecione pelo menos um serviço!";
        resumoDiv.style.color = "red";
        return;
    }

    // Salvar os serviços selecionados e total no localStorage
    const servicos = selecionados.map(item => item.value);
    const total = selecionados
        .map(item => Number(item.dataset.preco))
        .reduce((a, b) => a + b, 0);

    localStorage.setItem("servicosSelecionados", JSON.stringify(servicos));
    localStorage.setItem("valorTotal", total);

    // Redirecionar para a página de pagamento
    window.location.href = "pagamento.html";
});
