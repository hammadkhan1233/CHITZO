// --- LOBBY ELEMENTS ---
const lobby = document.getElementById('lobby');
const startChatButton = document.getElementById('start-chat-button');
const nameInput = document.getElementById('name-input');
const ageInput = document.getElementById('age-input');

// --- CHAT ELEMENTS ---
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesList = document.getElementById('messages');
const statusBox = document.getElementById('status');
const typingStatus = document.getElementById('typing-status');

let socket;
let typingTimer;

// --- LOBBY LOGIC ---
startChatButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const age = parseInt(ageInput.value, 10);

    if (name === '') {
        alert('Please enter your name.');
        return;
    }

    if (isNaN(age) || age < 18) {
        alert('You must be 18 or older to chat.');
        return;
    }

    // --- POP-UP MESSAGE (REQUEST 7) ---
    alert('Welcome to Chat Hub!\nPlease maintain discipline and do not use vulgar language. Be respectful to others.');

    // Hide lobby and show chat
    lobby.style.display = 'none';
    chatContainer.style.display = 'flex';

    // NOW connect to the server
    initializeSocket(name);
});


// --- CHAT LOGIC ---
function initializeSocket(name) {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected with ID:', socket.id);
        // Send join request with name
        socket.emit('join_queue', { name: name });
    });

    socket.on('match_found', (data) => {
        statusBox.textContent = data.message;
        messagesList.innerHTML = '';
        typingStatus.textContent = '';
    });

    socket.on('new_message', (data) => {
        // This is a message from the STRANGER
        const item = document.createElement('li');
        item.textContent = `${data.name}: ${data.message}`;
        messagesList.appendChild(item);
        // Scroll to bottom
        messagesList.scrollTop = messagesList.scrollHeight;
    });

    socket.on('user_disconnected', (data) => {
        const item = document.createElement('li');
        item.textContent = data.message;
        item.style.color = 'red';
        item.style.fontStyle = 'italic';
        messagesList.appendChild(item);
        statusBox.textContent = 'Stranger disconnected. Refresh to find a new match.';
        typingStatus.textContent = '';
    });

    // --- TYPING INDICATOR LISTENERS ---
    socket.on('stranger_typing', () => {
        typingStatus.textContent = 'Stranger is typing...';
    });

    socket.on('stranger_stopped_typing', () => {
        typingStatus.textContent = '';
    });
}


function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '' && socket) {
        console.log('Sending:', message);
        
        // --- ADD MY MESSAGE TO UI (REQUEST 1) ---
        const item = document.createElement('li');
        item.textContent = `You: ${message}`;
        item.classList.add('my-message'); // This class right-aligns it
        messagesList.appendChild(item);
        
        // Scroll to bottom
        messagesList.scrollTop = messagesList.scrollHeight;

        // Send message to server
        socket.emit('message', { message: message });
        
        // Stop a "typing" indicator if one was running
        clearTimeout(typingTimer);
        socket.emit('stop_typing');

        messageInput.value = '';
    }
}

messageInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

// --- TYPING INDICATOR EMITTERS ---
messageInput.addEventListener('input', () => {
    if (socket) {
        socket.emit('typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            if (socket) {
                socket.emit('stop_typing');
            }
        }, 2000); // 2-second timeout
    }
});

sendButton.addEventListener('click', sendMessage);
