// --- LOBBY ELEMENTS ---
const lobby = document.getElementById('lobby');
const startChatButton = document.getElementById('start-chat-button');
const nameInput = document.getElementById('name-input');
const ageInput = document.getElementById('age-input');
const userCountDisplay = document.getElementById('user-count'); // NEW: For online count

// --- CHAT ELEMENTS ---
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const messagesList = document.getElementById('messages');
const statusBox = document.getElementById('status');
const typingStatus = document.getElementById('typing-status');

let socket = io(); // NEW: Connect on page load to get user count
let currentName; // NEW: Store name globally for reconnect
let typingTimer;

// --- LOBBY LOGIC ---
startChatButton.addEventListener('click', () => {
    currentName = nameInput.value.trim(); // Use global variable
    const age = parseInt(ageInput.value, 10);
    
    // REQ 2: Validate name (letters and spaces only)
    const nameRegex = /^[A-Za-z\s]+$/;
    if (currentName === '' || !nameRegex.test(currentName)) {
        alert('Please enter your name (letters and spaces only).');
        return;
    }

    // REQ 3 & 4: Validate age (13+, numbers only)
    if (isNaN(age) || age < 13) {
        alert('You must be 13 or older to chat.');
        return;
    }

    // --- REQ 1: Pop-up message removed ---

    // Hide lobby and show chat
    lobby.style.display = 'none';
    chatContainer.style.display = 'flex';

    // NOW join the queue
    statusBox.textContent = 'Waiting for a match...';
    messagesList.innerHTML = ''; // Clear old messages
    socket.emit('join_queue', { name: currentName });
});


// --- GLOBAL SOCKET LOGIC (runs on page load) ---

socket.on('connect', () => {
    console.log('Connected with ID:', socket.id);
    // Client will automatically get a user count broadcast
});

// REQ 7: Listen for user count updates
socket.on('update_user_count', (data) => {
    userCountDisplay.textContent = data.count;
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

// REQ 8: Auto-reconnect on disconnect
socket.on('user_disconnected', (data) => {
    const item = document.createElement('li');
    item.textContent = data.message;
    item.style.color = 'red';
    item.style.fontStyle = 'italic';
    messagesList.appendChild(item);
    
    // NEW: Auto-reconnect logic
    statusBox.textContent = 'Stranger disconnected. Finding a new match...';
    typingStatus.textContent = '';
    
    // Re-join the queue using the stored name
    socket.emit('join_queue', { name: currentName });
});

// --- TYPING INDICATOR LISTENERS ---
socket.on('stranger_typing', () => {
    typingStatus.textContent = 'Stranger is typing...';
});

socket.on('stranger_stopped_typing', () => {
    typingStatus.textContent = '';
});


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
