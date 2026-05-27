async function sendMessage() {
    const input = document.getElementById('user-input');
    const chatBox = document.getElementById('chat-box');
    const userMessage = input.value.trim();

    if (userMessage === '') return;

    addMessage(userMessage, 'user');
    input.value = '';

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: userMessage })
        });

        const data = await response.json();

        addMessage(data.reply, 'bot');

    } catch (error) {
        addMessage("Erro ao conectar com o servidor 😢", 'bot');
    }
}

function addMessage(text, sender) {
    const chatBox = document.getElementById('chat-box');
    const message = document.createElement('div');
    message.classList.add('message', sender);
    message.innerText = text;
    chatBox.appendChild(message);
    chatBox.scrollTop = chatBox.scrollHeight;
}