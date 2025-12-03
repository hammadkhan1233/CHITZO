// --- ELEMENTS ---
const lobby = document.getElementById('lobby');
const btn1on1 = document.getElementById('btn-1on1');
const btnGroup = document.getElementById('btn-group');
const nameInput = document.getElementById('name-input');
const ageInput = document.getElementById('age-input');
const userCountDisplay = document.getElementById('user-count');

const chatContainer = document.getElementById('chat-container');
const chatHeader = document.getElementById('chat-header');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesList = document.getElementById('messages');
const statusBox = document.getElementById('status');
const typingStatus = document.getElementById('typing-status');

let socket = io();
let currentName = '';
let currentMode = ''; // '1on1' or 'group'
let typingTimer;

// --- VALIDATION HELPER ---
function validateAndStart(mode) {
    const name = nameInput.value.trim();
    const age = parseInt(ageInput.value, 10);
    const nameRegex = /^[A-Za-z\s]+$/;

    if (name === '' || !nameRegex.test(name)) {
        alert('Please enter a valid name (letters only).');
        return;
    }

    if (isNaN(age) || age < 13) {
        alert('You must be 13 or older.');
        return;
    }

    // Success - Start Chat
    currentName = name;
    currentMode = mode;
    
    lobby.style.display = 'none';
    chatContainer.style.display = 'flex';
    
    // Update Header Color/Text based on mode
    if (mode === 'group') {
        chatHeader.textContent = "Global Group Chat";
        chatHeader.style.backgroundColor = "#28a745"; // Green
        statusBox.textContent = "Joining group...";
    } else {
        chatHeader.textContent = "1-on-1 Chat";
        chatHeader.style.backgroundColor = "#007bff"; // Blue
        statusBox.textContent = "Waiting for a match...";
    }

    messagesList.innerHTML = '';
    
    // Emit join event with mode
    socket.emit('join_chat', { name: currentName, mode: currentMode });
}

// --- LISTENERS ---
btn1on1.addEventListener('click', () => validateAndStart('1on1'));
btnGroup.addEventListener('click', () => validateAndStart('group'));

// --- SOCKET EVENTS ---
socket.on('connect', () => {
    console.log('Connected:', socket.id);
});

socket.on('update_user_count', (data) => {
    userCountDisplay.textContent = data.count;
});

socket.on('match_found', (data) => {
    statusBox.textContent = data.message;
    typingStatus.textContent = '';
});

socket.on('new_message', (data) => {
    const item = document.createElement('li');
    
    if (data.is_system) {
        // System messages (joined/left group)
        item.textContent = data.message;
        item.classList.add('system-message');
    } else {
        // Normal messages
        item.textContent = `${data.name}: ${data.message}`;
    }
    
    messagesList.appendChild(item);
    messagesList.scrollTop = messagesList.scrollHeight;
});

socket.on('user_disconnected', (data) => {
    // This mostly applies to 1-on-1
    const item = document.createElement('li');
    item.textContent = data.message;
    item.style.color = 'red';
    item.style.fontStyle = 'italic';
    messagesList.appendChild(item);
    
    statusBox.textContent = 'Stranger disconnected. Finding new match...';
    
    // Auto-reconnect if in 1-on-1 mode
    if (currentMode === '1on1') {
        setTimeout(() => {
            socket.emit('join_chat', { name: currentName, mode: '1on1' });
        }, 1500);
    }
});

socket.on('stranger_typing', () => {
    typingStatus.textContent = 'Stranger is typing...';
});
socket.on('stranger_stopped_typing', () => {
    typingStatus.textContent = '';
});

// --- SENDING MESSAGES ---
function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '' && socket) {
        
        // Add to my own UI
        const item = document.createElement('li');
        item.textContent = `You: ${message}`;
        item.classList.add('my-message');
        messagesList.appendChild(item);
        messagesList.scrollTop = messagesList.scrollHeight;

        socket.emit('message', { message: message });
        
        messageInput.value = '';
        socket.emit('stop_typing');
    }
}

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});
sendButton.addEventListener('click', sendMessage);

// Typing indicators
messageInput.addEventListener('input', () => {
    socket.emit('typing');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('stop_typing'), 2000);
});
