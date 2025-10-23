const socket = io();

const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesList = document.getElementById('messages');
const statusBox = document.getElementById('status');

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '') {
        console.log('Sending:', message);
        socket.emit('message', { message: message });
        messageInput.value = '';
    }
}

messageInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

sendButton.addEventListener('click', sendMessage);

socket.on('connect', () => {
    console.log('Connected with ID:', socket.id);
});

socket.on('match_found', (data) => {
    statusBox.textContent = data.message;
    messagesList.innerHTML = '';
});

socket.on('new_message', (data) => {
    const item = document.createElement('li');
    item.textContent = `Stranger: ${data.message}`;
    messagesList.appendChild(item);
});

socket.on('user_disconnected', (data) => {
    const item = document.createElement('li');
    item.textContent = data.message;
    item.style.color = 'red';
    messagesList.appendChild(item);
    statusBox.textContent = 'Stranger disconnected. Refresh to find a new match.';
});
