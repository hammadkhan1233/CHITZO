const socket = io();
let room = null;

socket.on('paired', (data) => {
    room = data.room;
    document.getElementById('chat-box').innerHTML += `<p>Connected to a stranger!</p>`;
});

socket.on('message', (msg) => {
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML += `<p>${msg}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('message');
    const msg = input.value;
    socket.emit('message', { msg });
    input.value = '';
}
