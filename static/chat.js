const socket = io();

// DOM Elements
const landingScreen = document.getElementById('landing-screen');
const waitingScreen = document.getElementById('waiting-screen');
const chatScreen = document.getElementById('chat-screen');
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const statusText = document.getElementById('status-text');

// Buttons
const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');
const nextBtn = document.getElementById('next-btn');
const sendBtn = document.getElementById('send-btn');

let myId = null;

socket.on('connect', () => {
    myId = socket.id;
    console.log("Connected with ID:", myId);
});

// --- Navigation Functions ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function addMessage(text, type) {
    const div = document.createElement('div');
    div.classList.add('message', type);
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Event Listeners ---

startBtn.addEventListener('click', () => {
    socket.emit('search');
});

cancelBtn.addEventListener('click', () => {
    // Refreshing is the easiest way to cancel in this simple logic
    location.reload(); 
});

nextBtn.addEventListener('click', () => {
    messagesDiv.innerHTML = '';
    addMessage("Skipping to next partner...", 'system');
    socket.emit('next_partner');
});

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = msgInput.value.trim();
    if (text) {
        socket.emit('send_message', { message: text });
        msgInput.value = '';
    }
}

// --- Socket Events ---

socket.on('waiting', () => {
    showScreen('waiting-screen');
});

socket.on('matched', (data) => {
    showScreen('chat-screen');
    messagesDiv.innerHTML = ''; // Clear previous chat
    addMessage("You are connected to a stranger!", 'system');
    statusText.innerText = "Connected to Stranger";
    msgInput.disabled = false;
    sendBtn.disabled = false;
});

socket.on('receive_message', (data) => {
    if (data.sender === socket.id) {
        addMessage(data.message, 'mine');
    } else {
        addMessage(data.message, 'theirs');
    }
});

socket.on('partner_left', () => {
    addMessage("Stranger has disconnected.", 'system');
    statusText.innerText = "Stranger disconnected";
    msgInput.disabled = true;
    sendBtn.disabled = true;
});
