const socket = io();

let username = '';
let typingTimer;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesDiv = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const currentUserSpan = document.getElementById('current-user');
const userCountSpan = document.getElementById('user-count');

// Join chat room
joinBtn.addEventListener('click', joinChat);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

function joinChat() {
    username = usernameInput.value.trim();
    
    if (username === '') {
        alert('Please enter a username');
        return;
    }
    
    socket.emit('join', { username, room: 'general' });
    
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    currentUserSpan.textContent = username;
    messageInput.focus();
}

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = messageInput.value.trim();
    
    if (message === '') return;
    
    socket.emit('send_message', { message });
    messageInput.value = '';
    messageInput.focus();
}

// Typing indicator
messageInput.addEventListener('input', () => {
    socket.emit('typing', {});
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        typingIndicator.textContent = '';
    }, 1000);
});

// Socket event listeners
socket.on('load_messages', (data) => {
    data.messages.forEach(msg => {
        addMessage(msg);
    });
});

socket.on('new_message', (data) => {
    addMessage(data);
});

socket.on('user_joined', (data) => {
    addSystemMessage(`${data.username} joined the chat`);
});

socket.on('user_left', (data) => {
    addSystemMessage(`${data.username} left the chat`);
});

socket.on('user_count', (data) => {
    userCountSpan.textContent = `${data.count} user${data.count !== 1 ? 's' : ''} online`;
});

socket.on('user_typing', (data) => {
    typingIndicator.textContent = `${data.username} is typing...`;
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        typingIndicator.textContent = '';
    }, 2000);
});

// Helper functions
function addMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.username === username ? 'own' : 'other'}`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    
    const usernameSpan = document.createElement('span');
    usernameSpan.textContent = data.username;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.textContent = data.timestamp;
    
    headerDiv.appendChild(usernameSpan);
    headerDiv.appendChild(timestampSpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = data.message;
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = message;
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

function scrollToBottom() {
    const chatContainer = document.querySelector('.chat-container');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
