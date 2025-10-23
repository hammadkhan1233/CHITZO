const socket = io();

// DOM elements
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesList = document.getElementById('messages');
const statusBox = document.getElementById('status');

// Send message to server
function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '') {
        socket.emit('message', { message: message });
        messageInput.value = '';
    }
}

// Listen for Enter key
messageInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

// Listen for Send button
sendButton.addEventListener('click', sendMessage);

// --- Socket.IO Events ---

// When matched with a stranger
socket.on('match_found', (data) => {
    statusBox.textContent = data.message;
    messagesList.innerHTML = ''; // Clear old messages
});

// When a new message is received
socket.on('new_message', (data) => {
    const item = document.createElement('li');
    item.textContent = data.message;
    messagesList.appendChild(item);
});

// When the other user disconnects
socket.on('user_disconnected', (data) => {
    const item = document.createElement('li');
    item.textContent = data.message;
    item.style.color = 'red';
    messagesList.appendChild(item);
    statusBox.textContent = 'Stranger disconnected. Refresh to find a new match.';
});
