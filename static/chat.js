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

// --- NEW: VOICE RECORDING ELEMENTS ---
const recordButton = document.getElementById('record-button');
let isRecording = false;
let mediaRecorder;
let audioChunks = [];

let socket;
let typingTimer;

// --- LOBBY LOGIC ---
startChatButton.addEventListener('click', () => {
    // ... (same lobby logic as before) ...
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

    alert('Welcome to Chat Hub!\nPlease maintain discipline and do not use vulgar language. Be respectful to others.');
    lobby.style.display = 'none';
    chatContainer.style.display = 'flex';
    initializeSocket(name);
});


// --- CHAT LOGIC ---
function initializeSocket(name) {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected with ID:', socket.id);
        socket.emit('join_queue', { name: name });
    });

    socket.on('match_found', (data) => {
        statusBox.textContent = data.message;
        messagesList.innerHTML = '';
        typingStatus.textContent = '';
    });

    socket.on('new_message', (data) => {
        // This is a message from the STRANGER
        addTextMessageToUI(data.message, data.name, false);
    });
    
    // --- NEW: HANDLE INCOMING VOICE MESSAGE ---
    socket.on('new_voice_message', (data) => {
        const audioBlob = new Blob([data.audio], { type: 'audio/webm' });
        addAudioMessageToUI(audioBlob, data.name, false);
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

    socket.on('stranger_typing', () => {
        typingStatus.textContent = 'Stranger is typing...';
    });

    socket.on('stranger_stopped_typing', () => {
        typingStatus.textContent = '';
    });
}


// --- TEXT MESSAGE FUNCTIONS ---

function addTextMessageToUI(message, name, isMyMessage) {
    const item = document.createElement('li');
    item.textContent = `${name}: ${message}`;
    if (isMyMessage) {
        item.classList.add('my-message');
    }
    messagesList.appendChild(item);
    messagesList.scrollTop = messagesList.scrollHeight;
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '' && socket) {
        // Add my message to UI
        addTextMessageToUI(message, 'You', true);

        // Send message to server
        socket.emit('message', { message: message });
        
        clearTimeout(typingTimer);
        socket.emit('stop_typing');
        messageInput.value = '';
    }
}

messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('input', () => {
    if (socket) {
        socket.emit('typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(()F => {
            if (socket) socket.emit('stop_typing');
        }, 2000);
    }
});

sendButton.addEventListener('click', sendMessage);


// --- NEW: VOICE RECORDING FUNCTIONS ---

function addAudioMessageToUI(audioBlob, name, isMyMessage) {
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${name}: `;
    
    const audioPlayer = document.createElement('audio');
    audioPlayer.src = audioUrl;
    audioPlayer.controls = true;

    item.appendChild(label);
    item.appendChild(audioPlayer);

    if (isMyMessage) {
        item.classList.add('my-message');
    }
    
    messagesList.appendChild(item);
    messagesList.scrollTop = messagesList.scrollHeight;
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecording = true;
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Send to server
            if (socket) {
                socket.emit('voice_message', audioBlob);
            }
            
            // Add to my own UI
            addAudioMessageToUI(audioBlob, 'You', true);

            // Stop all audio tracks to turn off the "recording" icon in the browser tab
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        recordButton.textContent = '⏹️'; // Stop symbol
        recordButton.classList.add('is-recording');
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone. Please allow microphone permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;
        recordButton.textContent = '🎤'; // Mic symbol
        recordButton.classList.remove('is-recording');
    }
}

recordButton.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});
